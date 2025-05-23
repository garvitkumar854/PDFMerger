import { parentPort, workerData } from 'worker_threads';
import { PDFDocument, PDFPage } from 'pdf-lib';

interface ProcessingMetrics {
  startTime: number;
  endTime: number;
  pageCount: number;
  fileSize: number;
  compressionRatio: number;
}

async function optimizePDF(pdfDoc: PDFDocument): Promise<PDFDocument> {
  // Remove unnecessary metadata and optimize content
  pdfDoc.setTitle('');
  pdfDoc.setAuthor('');
  pdfDoc.setSubject('');
  pdfDoc.setKeywords('');
  pdfDoc.setProducer('');
  pdfDoc.setCreator('');

  // Optimize each page
  const pages = pdfDoc.getPages();
  for (const page of pages) {
    // Remove unnecessary page metadata
    page.node.delete('PieceInfo');
    page.node.delete('Metadata');
    page.node.delete('PZ');

    // Optimize page content streams
    if (page.node.Properties) {
      page.node.delete('Properties');
    }
  }

  return pdfDoc;
}

async function processPDFInWorker(pdfBuffer: ArrayBuffer) {
  const metrics: ProcessingMetrics = {
    startTime: Date.now(),
    endTime: 0,
    pageCount: 0,
    fileSize: pdfBuffer.byteLength,
    compressionRatio: 0
  };

  try {
    // Load and validate PDF
    const pdfDoc = await PDFDocument.load(pdfBuffer, {
      updateMetadata: false,
      ignoreEncryption: true
    });

    metrics.pageCount = pdfDoc.getPageCount();

    if (metrics.pageCount === 0) {
      throw new Error('PDF appears to be empty');
    }

    // Optimize the PDF
    const optimizedDoc = await optimizePDF(pdfDoc);

    // Save with optimal settings based on content
    const savedBuffer = await optimizedDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: metrics.pageCount < 50 ? 100 : 50,
      preserveTrailerInfo: false
    });

    metrics.endTime = Date.now();
    metrics.compressionRatio = savedBuffer.length / pdfBuffer.byteLength;

    // Return processed data with metrics
    parentPort?.postMessage({
      success: true,
      pageCount: metrics.pageCount,
      buffer: savedBuffer,
      metrics: {
        processingTime: metrics.endTime - metrics.startTime,
        originalSize: metrics.fileSize,
        optimizedSize: savedBuffer.length,
        compressionRatio: metrics.compressionRatio,
        pagesProcessed: metrics.pageCount
      }
    });
  } catch (error) {
    metrics.endTime = Date.now();
    parentPort?.postMessage({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metrics: {
        processingTime: metrics.endTime - metrics.startTime,
        originalSize: metrics.fileSize,
        error: true
      }
    });
  }
}

// Enhanced error handling for worker initialization
try {
  if (!parentPort) {
    throw new Error('Worker must be run as a worker thread');
  }

  if (!workerData || !workerData.pdfBuffer) {
    throw new Error('No PDF buffer provided to worker');
  }

  processPDFInWorker(workerData.pdfBuffer);
} catch (error) {
  parentPort?.postMessage({
    success: false,
    error: error instanceof Error ? error.message : 'Worker initialization failed',
    metrics: {
      error: true,
      initializationFailed: true
    }
  });
} 