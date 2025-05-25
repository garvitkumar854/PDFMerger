const { parentPort } = require('worker_threads');
const { PDFDocument } = require('pdf-lib');

// Utility function to validate PDF header
function validatePDFHeader(buffer) {
  if (buffer.length < 5) return false;
  
  // Look for PDF signature within first 1024 bytes
  for (let i = 0; i < Math.min(buffer.length - 4, 1024); i++) {
    if (buffer[i] === 0x25 && // %
        buffer[i + 1] === 0x50 && // P
        buffer[i + 2] === 0x44 && // D
        buffer[i + 3] === 0x46 && // F
        buffer[i + 4] === 0x2D) { // -
      return true;
    }
  }
  return false;
}

// Add memory optimization utilities
const MEMORY_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

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

async function processPDFInWorker(pdfBuffer) {
  const metrics = {
    startTime: Date.now(),
    endTime: 0,
    pageCount: 0,
    fileSize: pdfBuffer ? pdfBuffer.byteLength : 0,
    compressionRatio: 0,
    optimizationTime: 0
  };

  try {
    // Optimize buffer handling
    const buffer = optimizeBuffer(pdfBuffer instanceof Uint8Array ? pdfBuffer : new Uint8Array(pdfBuffer));

    // Validate and process in parallel
    const [isValid, initialDoc] = await Promise.all([
      validatePDFHeader(buffer),
      PDFDocument.load(buffer, {
        updateMetadata: false,
        ignoreEncryption: true,
        parseSpeed: buffer.length < 10 * 1024 * 1024 ? 1500 : 500,
        throwOnInvalidObject: false
      }).catch(() => null)
    ]);

    if (!isValid) {
      throw new Error('Invalid PDF format: Missing PDF header');
    }

    let pdfDoc = initialDoc;
    if (!pdfDoc) {
      // Fallback to conservative loading
      pdfDoc = await PDFDocument.load(buffer, {
        updateMetadata: false,
        ignoreEncryption: true,
        parseSpeed: 100,
        throwOnInvalidObject: false,
        capNumbers: true
      });
    }

    if (!pdfDoc) {
      throw new Error('Failed to load PDF document');
    }

    // Process pages in optimized chunks
    const pageCount = pdfDoc.getPageCount();
    metrics.pageCount = pageCount;

    if (pageCount > 10 || buffer.length > 10 * 1024 * 1024) {
      const optimizationStart = Date.now();
      pdfDoc = await optimizePDF(pdfDoc);
      metrics.optimizationTime = Date.now() - optimizationStart;
    }

    // Progressive loading for large files
    if (buffer.length > 10 * 1024 * 1024) {
      const chunkSize = Math.min(10, Math.ceil(pageCount / 4));
      for (let i = 0; i < pageCount; i += chunkSize) {
        const end = Math.min(i + chunkSize, pageCount);
        await pdfDoc.getPages().slice(i, end);
        
        if (buffer.length > 50 * 1024 * 1024) {
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      }
    }

    metrics.endTime = Date.now();
    return {
      success: true,
      metrics,
      document: pdfDoc
    };
  } catch (error) {
    metrics.endTime = Date.now();
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error processing PDF',
      metrics
    };
  }
}

// Initialize worker
if (!parentPort) {
  throw new Error('Worker must be run as a worker thread');
}

// Handle incoming messages
parentPort.on('message', async (data) => {
  if (!data || !data.pdfBuffer) {
    parentPort.postMessage({
      success: false,
      error: 'No PDF buffer provided in message',
      metrics: {
        error: true,
        initializationFailed: true
      }
    });
    return;
  }

  try {
    const result = await processPDFInWorker(data.pdfBuffer);
    if (result.success && result.buffer) {
      // Convert buffer to Uint8Array for transfer
      const transferableBuffer = new Uint8Array(result.buffer);
      parentPort.postMessage(
        {
          ...result,
          buffer: transferableBuffer.buffer
        },
        [transferableBuffer.buffer]
      );
    } else {
      parentPort.postMessage(result);
    }
  } catch (error) {
    parentPort.postMessage({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metrics: {
        error: true,
        initializationFailed: true,
        errorDetails: error instanceof Error ? error.stack : undefined
      }
    });
  }
});

module.exports = {
  processPDFInWorker
}; 