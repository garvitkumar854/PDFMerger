/// <reference lib="webworker" />

import { PDFService } from '../services/pdf-service';

// Initialize PDF service
const pdfService = PDFService.getInstance();

// Handle messages from main thread
self.onmessage = async (e: MessageEvent) => {
  const { type, data, id } = e.data;

  try {
    switch (type) {
      case 'validate':
        const validationResult = await pdfService.validatePDF(data.buffer);
        self.postMessage({ id, result: validationResult });
        break;

      case 'process':
        const processedPdf = await pdfService.processPDFs(data.buffers, data.options);
        const transferList: Transferable[] = [processedPdf.buffer];
        self.postMessage({ id, result: processedPdf }, transferList);
        break;

      case 'cleanup':
        pdfService.cleanup();
        self.postMessage({ id, result: true });
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Handle worker errors
self.onerror = (event: ErrorEvent | string | Event) => {
  const errorMessage = event instanceof ErrorEvent ? event.message : 
                      typeof event === 'string' ? event : 
                      'Unknown error';
                      
  console.error('PDF Worker Error:', errorMessage);
  self.postMessage({
    error: 'PDF Worker failed: ' + errorMessage
  });
};

// Optimize worker performance
if (self.crossOriginIsolated) {
  // Use SharedArrayBuffer if available
  self.postMessage({ type: 'workerReady', sharedBufferSupport: true });
} else {
  self.postMessage({ type: 'workerReady', sharedBufferSupport: false });
} 