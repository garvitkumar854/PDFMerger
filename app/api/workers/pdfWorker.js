const { parentPort } = require('worker_threads');
const { PDFDocument } = require('pdf-lib');

// Constants for optimization
const MEMORY_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
const MAX_PROCESSING_TIME = 180000; // 3 minutes

// Enhanced PDF validation with more robust checks
async function validatePDF(buffer) {
  try {
    // Check for absolute minimum file size (even smallest valid PDF should be at least 67 bytes)
    if (buffer.byteLength < 67) {
      throw new Error('File is too small to be a valid PDF (minimum 67 bytes)');
    }

    // Get the first 1024 bytes to search for PDF header
    const headerBuffer = new Uint8Array(buffer.slice(0, Math.min(1024, buffer.byteLength)));
    const headerString = new TextDecoder().decode(headerBuffer);

    // Check for PDF signature anywhere in the first 1024 bytes
    if (!headerString.includes('%PDF-')) {
      // Try checking for binary PDF signature as fallback
      const hasBinarySignature = headerBuffer.some((byte, index, array) => {
        if (index > array.length - 5) return false;
        return (
          array[index] === 0x25 && // %
          array[index + 1] === 0x50 && // P
          array[index + 2] === 0x44 && // D
          array[index + 3] === 0x46 && // F
          array[index + 4] === 0x2D // -
        );
      });

      if (!hasBinarySignature) {
        throw new Error('Invalid PDF header: Missing PDF signature');
      }
    }

    // Try to load and parse the PDF with different options
    let pdfDoc;
    try {
      // First attempt with standard options
      pdfDoc = await PDFDocument.load(buffer, {
        updateMetadata: false,
        ignoreEncryption: true,
        throwOnInvalidObject: false
      });
    } catch (e) {
      // Second attempt with more lenient options
      pdfDoc = await PDFDocument.load(buffer, {
        updateMetadata: false,
        ignoreEncryption: true,
        throwOnInvalidObject: false,
        parseSpeed: 100,
        capNumbers: true
      });
    }

    // Check for pages
    if (!pdfDoc || pdfDoc.getPageCount() === 0) {
      throw new Error('PDF has no pages');
    }

    // Verify page integrity
    const pages = pdfDoc.getPages();
    await Promise.all(pages.map(async (page) => {
      const { width, height } = page.getSize();
      if (!width || !height || width <= 0 || height <= 0) {
        throw new Error('Invalid page dimensions');
      }
    }));

    return true;
  } catch (error) {
    throw new Error(`PDF validation failed: ${error.message}`);
  }
}

// Optimize buffer handling
function optimizeBuffer(buffer) {
  if (buffer.length <= MEMORY_CHUNK_SIZE) return buffer;
  
  // Process large buffers in chunks
  const chunks = [];
  for (let i = 0; i < buffer.length; i += MEMORY_CHUNK_SIZE) {
    chunks.push(buffer.slice(i, Math.min(i + MEMORY_CHUNK_SIZE, buffer.length)));
  }
  return Buffer.concat(chunks);
}

// Enhanced PDF optimization
async function optimizePDF(pdfDoc) {
  try {
    // Remove unused resources
    const pages = pdfDoc.getPages();
    const usedObjects = new Set();

    // Track used objects
    for (const page of pages) {
      const refs = page.node.getContainedObjects();
      refs.forEach(ref => usedObjects.add(ref));
    }

    // Clean up unused objects
    pdfDoc.context.objects.forEach((obj, ref) => {
      if (!usedObjects.has(ref)) {
        pdfDoc.context.delete(ref);
      }
    });

    // Optimize content streams
    for (const page of pages) {
      if (page.node.Contents instanceof Array) {
        const contents = page.node.Contents.filter(Boolean);
        if (contents.length > 1) {
          const mergedStream = contents[0];
          for (let i = 1; i < contents.length; i++) {
            if (contents[i] && contents[i].content) {
              mergedStream.content = Buffer.concat([
                mergedStream.content,
                Buffer.from([0x0A]),
                contents[i].content
              ]);
            }
          }
          page.node.Contents = mergedStream;
        }
      }
    }

    return pdfDoc;
  } catch (error) {
    console.error('PDF optimization failed:', error);
    return pdfDoc;
  }
}

// Process PDF in worker
async function processPDFInWorker(pdfBuffer) {
  const startTime = Date.now();
  const metrics = {
    startTime,
    endTime: 0,
    pageCount: 0,
    fileSize: pdfBuffer ? pdfBuffer.byteLength : 0,
    compressionRatio: 0,
    optimizationTime: 0
  };

  try {
    // Validate PDF
    await validatePDF(pdfBuffer);

    // Optimize buffer handling
    const buffer = optimizeBuffer(pdfBuffer instanceof Uint8Array ? pdfBuffer : new Uint8Array(pdfBuffer));

    // Load PDF with optimized settings
    const pdfDoc = await PDFDocument.load(buffer, {
      updateMetadata: false,
      ignoreEncryption: true,
      parseSpeed: buffer.length < 10 * 1024 * 1024 ? 1500 : 500,
      throwOnInvalidObject: false
    });

    // Get page count
    const pageCount = pdfDoc.getPageCount();
    metrics.pageCount = pageCount;

    // Optimize large PDFs
    if (pageCount > 10 || buffer.length > 10 * 1024 * 1024) {
      const optimizationStart = Date.now();
      await optimizePDF(pdfDoc);
      metrics.optimizationTime = Date.now() - optimizationStart;
    }

    // Progressive loading for large files
    if (buffer.length > 10 * 1024 * 1024) {
      const chunkSize = Math.min(10, Math.ceil(pageCount / 4));
      for (let i = 0; i < pageCount; i += chunkSize) {
        const end = Math.min(i + chunkSize, pageCount);
        await pdfDoc.getPages().slice(i, end);
        
        // Add small delays for very large files to prevent blocking
        if (buffer.length > 50 * 1024 * 1024) {
          await new Promise(resolve => setTimeout(resolve, 5));
        }

        // Check processing time
        if (Date.now() - startTime > MAX_PROCESSING_TIME) {
          throw new Error('Processing timeout exceeded');
        }
      }
    }

    // Save with optimized settings
    const optimizedPdfBytes = await pdfDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: Math.min(50, Math.ceil(pageCount / 2))
    });

    metrics.endTime = Date.now();
    metrics.compressionRatio = optimizedPdfBytes.length / buffer.length;

    return {
      success: true,
      buffer: optimizedPdfBytes,
      metrics
    };

  } catch (error) {
    metrics.endTime = Date.now();
    return {
      success: false,
      error: error.message,
      metrics
    };
  }
}

// Handle messages from main thread
parentPort.on('message', async (data) => {
  try {
    const result = await processPDFInWorker(data.pdfBuffer);
    parentPort.postMessage(result);
  } catch (error) {
    parentPort.postMessage({
      success: false,
      error: error.message
    });
  }
});

module.exports = {
  processPDFInWorker
}; 