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

// Optimize PDF document
async function optimizePDF(pdfDoc) {
  try {
    // Remove empty pages if any
    const pageCount = pdfDoc.getPageCount();
    for (let i = pageCount - 1; i >= 0; i--) {
      const page = pdfDoc.getPage(i);
      if (!page.node.Contents) {
        pdfDoc.removePage(i);
      }
    }

    // Compress streams if possible
    const pages = pdfDoc.getPages();
    for (const page of pages) {
      if (page.node.Contents instanceof Array) {
        // Merge multiple content streams into one
        const contents = page.node.Contents.filter(Boolean);
        if (contents.length > 0) {
          const mergedStream = contents[0];
          for (let i = 1; i < contents.length; i++) {
            const stream = contents[i];
            if (stream && stream.content) {
              mergedStream.content = Buffer.concat([
                mergedStream.content,
                Buffer.from([0x0A]), // newline
                stream.content
              ]);
            }
          }
          page.node.Contents = mergedStream;
        }
      }
    }

    // Clean up unused objects
    const serialized = pdfDoc.context.serialize();
    const cleaned = await PDFDocument.load(serialized);
    
    return cleaned;
  } catch (error) {
    console.error('PDF optimization failed:', error);
    return pdfDoc; // Return original if optimization fails
  }
}

async function processPDFInWorker(pdfBuffer) {
  const metrics = {
    startTime: Date.now(),
    endTime: 0,
    pageCount: 0,
    fileSize: pdfBuffer ? pdfBuffer.byteLength : 0,
    compressionRatio: 0
  };

  try {
    // Validate input
    if (!pdfBuffer || !(pdfBuffer instanceof ArrayBuffer || pdfBuffer instanceof Uint8Array)) {
      throw new Error('Invalid PDF buffer provided');
    }

    // Convert to Uint8Array if needed
    const buffer = pdfBuffer instanceof Uint8Array ? pdfBuffer : new Uint8Array(pdfBuffer);

    // Validate minimum size
    if (buffer.length < 5) {
      throw new Error('PDF file is too small to be valid');
    }

    // Validate PDF header
    if (!validatePDFHeader(buffer)) {
      throw new Error('Invalid PDF format: Missing PDF header');
    }

    // Determine file size categories
    const isSmallFile = buffer.byteLength < 5 * 1024 * 1024; // Less than 5MB
    const isMediumFile = buffer.byteLength < 20 * 1024 * 1024; // Less than 20MB

    let pdfDoc;
    try {
      // First try with standard settings
      pdfDoc = await PDFDocument.load(buffer, {
        updateMetadata: false,
        ignoreEncryption: true,
        parseSpeed: isSmallFile ? 1000 : isMediumFile ? 500 : 100
      });
    } catch (loadError) {
      console.error('Initial PDF load failed:', loadError);
      
      // Try again with more lenient settings
      try {
        pdfDoc = await PDFDocument.load(buffer, {
          updateMetadata: false,
          ignoreEncryption: true,
          parseSpeed: 50,
          throwOnInvalidObject: false
        });
      } catch (retryError) {
        throw new Error('Failed to load PDF: The file may be corrupted or password protected');
      }
    }

    if (!pdfDoc) {
      throw new Error('Failed to load PDF document');
    }

    metrics.pageCount = pdfDoc.getPageCount();

    if (metrics.pageCount === 0) {
      throw new Error('PDF appears to be empty');
    }

    // Optimize based on file characteristics
    const needsOptimization = !isSmallFile || metrics.pageCount > 10;
    const optimizedDoc = needsOptimization ? await optimizePDF(pdfDoc) : pdfDoc;

    // Save with optimized settings
    const objectsPerTick = isSmallFile ? 
      1000 : // Process all at once for small files
      isMediumFile ?
        Math.min(100, Math.max(50, Math.floor(metrics.pageCount / 5))) : // Medium files
        Math.min(50, Math.max(25, Math.floor(metrics.pageCount / 10))); // Large files

    let savedBuffer;
    try {
      savedBuffer = await optimizedDoc.save({
        useObjectStreams: !isSmallFile,
        addDefaultPage: false,
        objectsPerTick,
        updateFieldAppearances: false
      });
    } catch (saveError) {
      console.error('Failed to save with optimal settings:', saveError);
      
      // Try again with minimal settings
      savedBuffer = await optimizedDoc.save({
        useObjectStreams: false,
        addDefaultPage: false,
        objectsPerTick: 25,
        updateFieldAppearances: false
      });
    }

    if (!savedBuffer || savedBuffer.length === 0) {
      throw new Error('Failed to generate PDF output');
    }

    metrics.endTime = Date.now();
    metrics.compressionRatio = savedBuffer.length / metrics.fileSize;

    // Return processed data with metrics
    return {
      success: true,
      pageCount: metrics.pageCount,
      buffer: savedBuffer,
      metrics: {
        processingTime: metrics.endTime - metrics.startTime,
        originalSize: metrics.fileSize,
        optimizedSize: savedBuffer.length,
        compressionRatio: metrics.compressionRatio,
        pagesProcessed: metrics.pageCount,
        isOptimized: needsOptimization
      }
    };

  } catch (error) {
    metrics.endTime = Date.now();
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metrics: {
        processingTime: metrics.endTime - metrics.startTime,
        originalSize: metrics.fileSize,
        error: true,
        errorDetails: error instanceof Error ? error.stack : undefined
      }
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