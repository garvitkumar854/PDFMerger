const { parentPort } = require('worker_threads');
const { PDFDocument } = require('pdf-lib');

// Constants for optimization
const MEMORY_CHUNK_SIZE = 10 * 1024 * 1024; // Increased to 10MB chunks
const MAX_PROCESSING_TIME = 300000; // Increased to 5 minutes for large files
const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB threshold for large files
const HUGE_FILE_THRESHOLD = 200 * 1024 * 1024; // 200MB threshold for huge files

// Enhanced PDF validation with optimized checks
async function validatePDF(buffer) {
  try {
    if (buffer.byteLength < 67) {
      throw new Error('File is too small to be a valid PDF (minimum 67 bytes)');
    }

    // Optimized header check - only check first 512 bytes
    const headerBuffer = new Uint8Array(buffer.slice(0, Math.min(512, buffer.byteLength)));
    const headerString = new TextDecoder().decode(headerBuffer);

    if (!headerString.includes('%PDF-')) {
      const hasBinarySignature = headerBuffer.some((byte, index, array) => {
        if (index > array.length - 5) return false;
        return (
          array[index] === 0x25 &&
          array[index + 1] === 0x50 &&
          array[index + 2] === 0x44 &&
          array[index + 3] === 0x46 &&
          array[index + 4] === 0x2D
        );
      });

      if (!hasBinarySignature) {
        throw new Error('Invalid PDF header: Missing PDF signature');
      }
    }

    // Optimized PDF loading based on file size
    const loadOptions = {
      updateMetadata: false,
      ignoreEncryption: true,
      throwOnInvalidObject: false,
      parseSpeed: buffer.byteLength > LARGE_FILE_THRESHOLD ? 2000 : 4000,
      capNumbers: true
    };

    try {
      return await PDFDocument.load(buffer, loadOptions);
    } catch (e) {
      // Fallback with more lenient options for problematic PDFs
      loadOptions.parseSpeed = 1000;
      loadOptions.throwOnInvalidObject = false;
      return await PDFDocument.load(buffer, loadOptions);
    }
  } catch (error) {
    throw new Error(`PDF validation failed: ${error.message}`);
  }
}

// Optimized buffer handling
function optimizeBuffer(buffer) {
  // Use SharedArrayBuffer for better performance if available
  if (typeof SharedArrayBuffer !== 'undefined' && buffer.byteLength > LARGE_FILE_THRESHOLD) {
    const shared = new SharedArrayBuffer(buffer.byteLength);
    new Uint8Array(shared).set(buffer);
    return new Uint8Array(shared);
  }
  return buffer;
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

// Process PDF in worker with optimized handling
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
    const buffer = optimizeBuffer(pdfBuffer instanceof Uint8Array ? pdfBuffer : new Uint8Array(pdfBuffer));
    
    // Adjust processing based on file size
    const isLargeFile = buffer.length > LARGE_FILE_THRESHOLD;
    const isHugeFile = buffer.length > HUGE_FILE_THRESHOLD;
    
    const loadOptions = {
      updateMetadata: false,
      ignoreEncryption: true,
      parseSpeed: isHugeFile ? 500 : (isLargeFile ? 1000 : 2000),
      throwOnInvalidObject: false
    };

    const pdfDoc = await PDFDocument.load(buffer, loadOptions);
    const pageCount = pdfDoc.getPageCount();
    metrics.pageCount = pageCount;

    // Optimize processing strategy based on file size and page count
    if (isHugeFile || pageCount > 100) {
      const chunkSize = Math.min(20, Math.ceil(pageCount / 8));
      for (let i = 0; i < pageCount; i += chunkSize) {
        const end = Math.min(i + chunkSize, pageCount);
        await pdfDoc.getPages().slice(i, end);
        
        if (isHugeFile) {
          await new Promise(resolve => setTimeout(resolve, 1));
        }

        if (Date.now() - startTime > MAX_PROCESSING_TIME) {
          throw new Error('Processing timeout exceeded');
        }
      }
    }

    // Optimized save settings based on file characteristics
    const saveOptions = {
      useObjectStreams: !isHugeFile,
      addDefaultPage: false,
      objectsPerTick: isHugeFile ? 25 : (isLargeFile ? 50 : 100),
      updateMetadata: false,
      compression: {
        level: isHugeFile ? 1 : (isLargeFile ? 3 : 6)
      }
    };

    return await pdfDoc.save(saveOptions);
  } catch (error) {
    throw new Error(`PDF processing failed: ${error.message}`);
  } finally {
    metrics.endTime = Date.now();
    metrics.processingTime = metrics.endTime - metrics.startTime;
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