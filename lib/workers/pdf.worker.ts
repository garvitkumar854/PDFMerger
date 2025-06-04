/// <reference lib="webworker" />

import { PDFService } from '../services/pdf-service';

// Optimized constants for worker
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks for streaming
const MAX_PROCESSING_TIME = 300000; // 5 minutes
const SMALL_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB
const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB
const MEMORY_LIMIT = 2048 * 1024 * 1024; // 2GB worker memory limit
const CLEANUP_INTERVAL = 60000; // 60 seconds

// Initialize PDF service with enhanced settings
const pdfService = PDFService.getInstance();

// Track memory usage
let currentMemoryUsage = 0;
let lastCleanupTime = 0;

// Enhanced memory management with cross-browser support
const checkMemoryUsage = () => {
  try {
    // @ts-ignore - Chrome-specific memory API
    if (global.performance && performance.memory) {
      // @ts-ignore
      currentMemoryUsage = performance.memory.usedJSHeapSize;
      if (currentMemoryUsage > MEMORY_LIMIT * 0.9) {
        cleanup();
      }
    }
  } catch {
    // Fallback for browsers without memory API
    // Use a simple timeout-based cleanup strategy
    if (Date.now() - lastCleanupTime > CLEANUP_INTERVAL) {
      cleanup();
      lastCleanupTime = Date.now();
    }
  }
};

// Optimized cleanup function
const cleanup = () => {
  pdfService.cleanup(true);
  if (global.gc) {
    try {
      global.gc();
    } catch (error) {
      console.warn('Failed to run garbage collection:', error);
    }
  }
};

// Enhanced progress tracking
interface ProgressUpdate {
  phase: 'initialization' | 'validation' | 'loading' | 'merging' | 'optimizing' | 'finalizing';
  progress: number;
  totalProgress: number;
  details?: {
    pagesProcessed: number;
    totalPages: number;
    currentStage: number;
    totalStages: number;
  };
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
        
        // Optimize processing based on file size
        const isSmallOperation = totalSize < SMALL_FILE_THRESHOLD;
        const isLargeOperation = totalSize > LARGE_FILE_THRESHOLD;
        
        const processOptions = {
          ...options,
          parseSpeed: isSmallOperation ? 250000 : isLargeOperation ? 100000 : 500000,
          maxConcurrentOperations: isSmallOperation ? 512 : isLargeOperation ? 64 : 256,
          chunkSize: isSmallOperation ? 64 : isLargeOperation ? 512 : 256,
          onProgress: (
            stage: ProgressUpdate['phase'],
            progress: number,
            totalProgress: number,
            details?: ProgressUpdate['details']
          ) => {
            sendProgress({ 
              phase: stage, 
              progress, 
              totalProgress,
              details
            });
          }
        };

        // Process immediately without delays
        try {
          checkMemoryUsage();
          const result = await pdfService.processPDFs(buffers, processOptions);
          
          if (!result.success || !result.data) {
            throw new Error(result.error || 'Failed to process PDFs');
          }

          const transferList: Transferable[] = [result.data.buffer];
          self.postMessage({ 
            id, 
            result: {
              data: result.data,
              stats: result.stats
            },
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
    cleanup();
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
}, 60000); // Check every 60 seconds 