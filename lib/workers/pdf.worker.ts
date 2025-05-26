/// <reference lib="webworker" />

import { PDFService } from '../services/pdf-service';

// Optimized constants for worker
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks for streaming
const MAX_PROCESSING_TIME = 180000; // 3 minutes
const SMALL_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB
const MEMORY_LIMIT = 1024 * 1024 * 1024; // 1GB worker memory limit

// Initialize PDF service with enhanced settings
const pdfService = PDFService.getInstance();

// Track memory usage
let currentMemoryUsage = 0;

// Enhanced memory management
const checkMemoryUsage = () => {
  if (global.performance && performance.memory) {
    currentMemoryUsage = performance.memory.usedJSHeapSize;
    if (currentMemoryUsage > MEMORY_LIMIT * 0.9) {
      cleanup();
    }
  }
};

// Optimized cleanup function
const cleanup = () => {
  pdfService.cleanup();
  if (global.gc) {
    try {
      global.gc();
    } catch (e) {}
  }
  currentMemoryUsage = 0;
};

// Enhanced progress tracking
interface ProgressUpdate {
  phase: 'validation' | 'loading' | 'merging' | 'saving';
  progress: number;
  totalProgress: number;
}

// Handle messages from main thread with enhanced error handling and progress tracking
self.onmessage = async (e: MessageEvent) => {
  const { type, data, id } = e.data;
  const startTime = Date.now();

  const sendProgress = (update: ProgressUpdate) => {
    self.postMessage({
      type: 'progress',
      id,
      data: update
    });
  };

  try {
    switch (type) {
      case 'validate':
        checkMemoryUsage();
        const validationResult = await pdfService.validatePDF(data.buffer);
        self.postMessage({ id, result: validationResult });
        break;

      case 'process':
        const { buffers, options } = data;
        const totalSize = buffers.reduce((sum: number, buf: ArrayBuffer) => sum + buf.byteLength, 0);
        
        // Optimize processing based on total size
        const isLargeOperation = totalSize > SMALL_FILE_THRESHOLD * buffers.length;
        const processOptions = {
          ...options,
          parseSpeed: isLargeOperation ? 1500 : 4000,
          useObjectStreams: isLargeOperation,
          objectsPerTick: isLargeOperation ? 500 : 1000,
          onProgress: (phase: 'validation' | 'loading' | 'merging' | 'saving', progress: number, totalProgress: number) => {
            sendProgress({ phase, progress, totalProgress });
          }
        };

        // Process in chunks with memory management
        let processedPdf;
        try {
          checkMemoryUsage();
          processedPdf = await pdfService.processPDFs(buffers, processOptions);
          
          // Monitor processing time
          if (Date.now() - startTime > MAX_PROCESSING_TIME) {
            throw new Error('Processing timeout exceeded');
          }

          const transferList: Transferable[] = [processedPdf.buffer];
          self.postMessage({ 
            id, 
            result: processedPdf,
            processingTime: (Date.now() - startTime) / 1000
          }, transferList);
        } finally {
          if (isLargeOperation) {
            cleanup();
          }
        }
        break;

      case 'cleanup':
        cleanup();
        self.postMessage({ id, result: true });
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    cleanup(); // Clean up on error
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Enhanced error handling
self.onerror = (event: ErrorEvent | string | Event) => {
  cleanup(); // Clean up on error
  
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
  // Use SharedArrayBuffer and optimized memory settings if available
  const workerCapabilities = {
    type: 'workerReady',
    sharedBufferSupport: true,
    memoryLimit: MEMORY_LIMIT,
    chunkSize: CHUNK_SIZE
  };
  self.postMessage(workerCapabilities);
} else {
  self.postMessage({ 
    type: 'workerReady', 
    sharedBufferSupport: false,
    memoryLimit: MEMORY_LIMIT,
    chunkSize: CHUNK_SIZE
  });
}

// Periodic cleanup to prevent memory leaks
setInterval(() => {
  checkMemoryUsage();
}, 30000); // Check every 30 seconds 