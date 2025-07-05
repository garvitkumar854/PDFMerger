import { PDFDocument, PDFPage, PDFName, PDFDict } from 'pdf-lib';
import { createHash } from 'crypto';
import { estimatePDFMemoryUsage } from '@/lib/utils/pdf-validation';
import { ErrorHandler } from '@/lib/utils/error-handler';
import pLimit from 'p-limit';

// Optimized limits for maximum performance
const LIMITS = {
  MEMORY: 4096 * 1024 * 1024,    // 4GB memory limit for browser compatibility
  MAX_FILES: 20,                 // Limit to 20 files as per requirement
  MAX_FILE_SIZE: 200 * 1024 * 1024, // 200MB per file
  MAX_TOTAL_SIZE: 200 * 1024 * 1024, // 200MB total as per requirement
  CACHE_SIZE: 512 * 1024 * 1024,  // 512MB cache size for browser memory constraints
  MAX_CACHE_ENTRIES: 50,         // Reduced cache entries for better memory management
  SMALL_FILE_THRESHOLD: 20 * 1024 * 1024, // 20MB threshold for small files
  LARGE_FILE_THRESHOLD: 50 * 1024 * 1024  // 50MB threshold for large files
};

// Ultra-performance processing constants
const PROCESSING = {
  CHUNK_SIZE: 20 * 1024 * 1024,      // 20MB chunks for optimal browser performance
  PAGE_INTERVAL: 1000,               // Reduced batch size for better memory usage
  CLEANUP_INTERVAL: 5000,            // More frequent cleanup
  MEMORY_THRESHOLD: 0.75,            // Lower memory threshold for stability
  PARSE_SPEED: 100000,               // Balanced parsing speed
  BATCH_DELAY: 10,                   // Small delay for browser responsiveness
  MAX_CONCURRENT_OPERATIONS: 8,      // Limited concurrent operations for stability
  WORKER_THREADS: 4,                 // Reduced worker threads for browser compatibility
  BATCH_SIZE: 64,                    // Optimized batch size
  SUB_BATCH_SIZE: 250,               // Smaller sub-batch size for better memory management
  GC_INTERVAL: 25000,                // More frequent garbage collection
  STREAM_CHUNK_SIZE: 5 * 1024 * 1024, // 5MB streaming chunks for better performance
  SMALL_FILE_BATCH_SIZE: 20,         // Adjusted batch size for small files
  LARGE_FILE_BATCH_SIZE: 5           // Adjusted batch size for large files
};

interface PDFStats {
  pageCount: number;
  fileSize: number;
  hasXFA?: boolean;
  isLinearized?: boolean;
}

interface MergeResult {
  success: boolean;
  data?: Uint8Array;
  error?: string;
  stats?: {
    totalPages: number;
    totalSize: number;
    processingTime: number;
    memoryUsed: number;
    compressionRatio: number;
  };
}

// Cache for PDF validation and metadata
let validationCache = new WeakMap<ArrayBuffer, boolean>();
let metadataCache = new WeakMap<ArrayBuffer, PDFMetadata>();
let pageCache = new WeakMap<PDFDocument, PDFPage[]>();

interface PDFMetadata {
  pageCount: number;
  isEncrypted: boolean;
  version: string;
  fileSize: number;
  hasXFA: boolean;
}

// Add optimized processing options
interface ProcessingOptions {
  parallelProcessing?: boolean;
  optimizeOutput?: boolean;
  compressionLevel?: number;
  preserveMetadata?: boolean;
  maxConcurrentOperations?: number;
  memoryLimit?: number;
  chunkSize?: number;
  parseSpeed?: number;
  removeAnnotations?: boolean;
  optimizeImages?: boolean;
}

interface StreamingOptions extends ProcessingOptions {
  maxPagesPerDocument?: number;
  forceGC?: boolean;
}

export interface ProcessingProgress {
  stage: 'initialization' | 'validation' | 'loading' | 'merging' | 'optimizing' | 'finalizing' | 'complete';
  progress: number;
  fileIndex: number;
  totalFiles: number;
  details?: {
    pagesProcessed: number;
    totalPages: number;
    currentFilePages: number;
    bytesProcessed: number;
    totalBytes: number;
    timeElapsed: number;
    estimatedTimeRemaining: number;
    currentStage: number;
    totalStages: number;
    memoryUsage: number;
  };
}

export type ProgressCallback = (progress: ProcessingProgress) => void;

export class PDFService {
  private static instance: PDFService;
  private loadingPromises: Map<string, Promise<PDFDocument>>;
  private operationCount: number;
  private processingTimer: NodeJS.Timeout | null;
  private workerPool: Worker[] | null;
  private startTime: number;
  private lastProgressUpdate: number;
  private processedBytes: number;
  private totalBytes: number;
  private processedPages: number;
  private totalPages: number;
  private pageCache: Map<string, PDFPage[]>;
  private documentCache: Map<string, PDFDocument>;
  private lastLogTime = 0;
  private LOG_THROTTLE = 100; // Throttle logs to every 100ms
  private memoryMonitor: NodeJS.Timeout | null;

  private constructor() {
    this.loadingPromises = new Map();
    this.operationCount = 0;
    this.processingTimer = null;
    this.workerPool = null;
    this.startTime = 0;
    this.lastProgressUpdate = 0;
    this.processedBytes = 0;
    this.totalBytes = 0;
    this.processedPages = 0;
    this.totalPages = 0;
    this.pageCache = new Map();
    this.documentCache = new Map();
    this.memoryMonitor = null;
    
    // Start memory monitoring
    this.startMemoryMonitoring();
  }

  static getInstance(): PDFService {
    if (!PDFService.instance) {
      PDFService.instance = new PDFService();
    }
    return PDFService.instance;
  }

  private startMemoryMonitoring(): void {
    if (typeof process !== 'undefined') {
      this.memoryMonitor = setInterval(() => {
        const memUsage = process.memoryUsage();
        if (memUsage.heapUsed > LIMITS.MEMORY * PROCESSING.MEMORY_THRESHOLD) {
          this.cleanup(true);
        }
      }, 10000); // Check every 10 seconds
    }
  }

  private async initializeWorkerPool() {
    // Initialize worker pool for parallel processing if needed
    if (!this.workerPool) {
      this.workerPool = Array(PROCESSING.MAX_CONCURRENT_OPERATIONS).fill(null);
    }
  }

  private async optimizePDF(doc: PDFDocument, options: ProcessingOptions = {}): Promise<void> {
    try {
      if (!options.optimizeOutput) return;

      const pages = doc.getPages();
      for (const page of pages) {
        try {
          const resources = page.node.lookup(PDFName.of('Resources'));
          if (!(resources instanceof PDFDict)) continue;

          const xObject = resources.lookup(PDFName.of('XObject'));
          if (!(xObject instanceof PDFDict)) continue;

          const entries = xObject.entries();
          for (const [_, obj] of entries) {
            if (obj instanceof PDFDict && obj.lookup(PDFName.of('Subtype')) === PDFName.of('Image')) {
              if (options.optimizeImages) {
                obj.set(PDFName.of('Interpolate'), PDFName.of('true'));
              }
            }
          }

          // Remove annotations if requested
          if (options.removeAnnotations) {
            const annotations = page.node.lookup(PDFName.of('Annots'));
            if (annotations) {
              page.node.delete(PDFName.of('Annots'));
            }
          }
        } catch (error) {
          // Skip problematic pages
          continue;
        }
      }
    } catch (error) {
      // Continue without optimization if there's an error
      console.warn('PDF optimization skipped:', error);
    }
  }

  private async validatePDFLimits(buffer: ArrayBuffer): Promise<PDFStats> {
    if (buffer.byteLength > LIMITS.MAX_FILE_SIZE) {
      throw new Error(`PDF file size exceeds ${LIMITS.MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
    }

    const doc = await PDFDocument.load(buffer, {
      updateMetadata: false,
      ignoreEncryption: true
    });

    const pageCount = doc.getPageCount();
    return { pageCount, fileSize: buffer.byteLength };
  }

  private async checkMemoryLimit(): Promise<void> {
    if (typeof process !== 'undefined') {
      const currentMemory = process.memoryUsage();
      if (currentMemory.heapUsed > LIMITS.MEMORY * PROCESSING.MEMORY_THRESHOLD) {
        await this.cleanup();
        
        const newMemory = process.memoryUsage();
        if (newMemory.heapUsed > LIMITS.MEMORY * PROCESSING.MEMORY_THRESHOLD) {
          throw new Error('Memory limit reached. Please try with fewer pages.');
        }
      }
    }
  }

  public async cleanup(force: boolean = false): Promise<void> {
    try {
      // Clear caches
      this.loadingPromises.clear();
      this.pageCache.clear();
      this.documentCache.clear();
      
      // Clear WeakMap caches
      validationCache = new WeakMap();
      metadataCache = new WeakMap();
      pageCache = new WeakMap();

      // Reset counters
      this.processedBytes = 0;
      this.processedPages = 0;
      this.operationCount = 0;

      // Force garbage collection if available
      if (typeof global.gc === 'function' && force) {
        global.gc();
      }

      this.logWithThrottle('Memory cleanup completed');
    } catch (error) {
      ErrorHandler.handle(error, { component: 'PDFService', action: 'cleanup' });
    }
  }

  private async processPage(
    doc: PDFDocument,
    mergedPdf: PDFDocument,
    pageIndex: number
  ): Promise<void> {
    try {
      const pages = doc.getPages();
      if (pageIndex < pages.length) {
        const [copiedPage] = await mergedPdf.copyPages(doc, [pageIndex]);
        mergedPdf.addPage(copiedPage);
        this.processedPages++;
      }
    } catch (error) {
      ErrorHandler.handle(error, { component: 'PDFService', action: 'processPage' });
      throw error;
    }
  }

  private logWithThrottle(message: string) {
    const now = Date.now();
    if (now - this.lastLogTime > this.LOG_THROTTLE) {
      console.log(`[PDFService] ${message}`);
      this.lastLogTime = now;
    }
  }

  private resetProgress() {
    this.startTime = performance.now();
    this.lastProgressUpdate = 0;
    this.processedBytes = 0;
    this.totalBytes = 0;
    this.processedPages = 0;
    this.totalPages = 0;
  }

  private updateProgress(
    stage: ProcessingProgress['stage'],
    progress: number,
    fileIndex: number,
    totalFiles: number,
    onProgress?: ProgressCallback
  ) {
    const now = performance.now();
    const timeElapsed = now - this.startTime;
    
    // Throttle progress updates to prevent excessive calls
    if (now - this.lastProgressUpdate < 100) return;
    
    this.lastProgressUpdate = now;
    
    const progressData: ProcessingProgress = {
      stage,
      progress: Math.min(100, Math.max(0, progress)),
      fileIndex,
      totalFiles,
      details: {
        pagesProcessed: this.processedPages,
        totalPages: this.totalPages,
        currentFilePages: 0,
        bytesProcessed: this.processedBytes,
        totalBytes: this.totalBytes,
        timeElapsed,
        estimatedTimeRemaining: this.calculateETA(timeElapsed, progress),
        currentStage: this.getStageNumber(stage),
        totalStages: 6,
        memoryUsage: typeof process !== 'undefined' ? process.memoryUsage().heapUsed / 1024 / 1024 : 0
      }
    };

    onProgress?.(progressData);
  }

  private calculateETA(timeElapsed: number, progress: number): number {
    if (progress <= 0) return 0;
    const rate = progress / timeElapsed;
    return (100 - progress) / rate;
  }

  private getStageNumber(stage: ProcessingProgress['stage']): number {
    const stages = ['initialization', 'validation', 'loading', 'merging', 'optimizing', 'finalizing'];
    return stages.indexOf(stage) + 1;
  }

  async processPDFs(
    buffers: ArrayBuffer[],
    options: ProcessingOptions = {},
    onProgress?: ProgressCallback
  ): Promise<MergeResult> {
    const startTime = performance.now();
    let mergedPdf: PDFDocument | null = null;
    let totalSize = 0;
    let totalPages = 0;

    try {
      this.resetProgress();
      this.operationCount++;

      // Calculate totals
      for (const buffer of buffers) {
        totalSize += buffer.byteLength;
      }

      this.totalBytes = totalSize;
      this.updateProgress('initialization', 5, 0, buffers.length, onProgress);

      // Validate all files first
      this.updateProgress('validation', 10, 0, buffers.length, onProgress);
      for (let i = 0; i < buffers.length; i++) {
        const stats = await this.validatePDFLimits(buffers[i]);
        totalPages += stats.pageCount;
        this.updateProgress('validation', 10 + (i / buffers.length) * 5, i, buffers.length, onProgress);
      }

      this.totalPages = totalPages;
      this.updateProgress('loading', 20, 0, buffers.length, onProgress);

      // Create merged PDF
      mergedPdf = await PDFDocument.create();
      
      // Process files in optimized batches
      const batchSize = options.maxConcurrentOperations || PROCESSING.MAX_CONCURRENT_OPERATIONS;
      const limit = pLimit(batchSize);

      for (let i = 0; i < buffers.length; i++) {
        const buffer = buffers[i];
        this.processedBytes += buffer.byteLength;
        
        try {
          const doc = await PDFDocument.load(buffer, {
            updateMetadata: false,
            ignoreEncryption: true,
            parseSpeed: options.parseSpeed || PROCESSING.PARSE_SPEED
          });

          const pageIndices = doc.getPageIndices();
          const copiedPages = await mergedPdf.copyPages(doc, pageIndices);
          
          for (const page of copiedPages) {
            mergedPdf.addPage(page);
            this.processedPages++;
          }

          // Update progress
          const progress = 20 + (i / buffers.length) * 60;
          this.updateProgress('merging', progress, i, buffers.length, onProgress);

          // Memory management
          if (i % 5 === 0) {
            await this.checkMemoryLimit();
          }

        } catch (error) {
          ErrorHandler.handle(error, { 
            component: 'PDFService', 
            action: 'processPDFs',
            userId: `file_${i}`
          });
          throw new Error(`Failed to process file ${i + 1}: ${ErrorHandler.getErrorMessage(error)}`);
        }
      }

      this.updateProgress('optimizing', 85, buffers.length - 1, buffers.length, onProgress);

      // Optimize the merged PDF
      await this.optimizePDF(mergedPdf, options);

      this.updateProgress('finalizing', 95, buffers.length - 1, buffers.length, onProgress);

      // Save the merged PDF
      const saveOptions: any = {};
      if (options.compressionLevel) {
        saveOptions.useObjectStreams = true;
        saveOptions.addDefaultPage = false;
      }

      const mergedPdfBytes = await mergedPdf.save(saveOptions);
      
      this.updateProgress('complete', 100, buffers.length - 1, buffers.length, onProgress);

      const processingTime = performance.now() - startTime;
      const compressionRatio = mergedPdfBytes.length / totalSize;
      const memoryUsed = typeof process !== 'undefined' ? process.memoryUsage().heapUsed / 1024 / 1024 : 0;

      return {
        success: true,
        data: mergedPdfBytes,
        stats: {
          totalPages,
          totalSize,
          processingTime,
          memoryUsed,
          compressionRatio
        }
      };

    } catch (error) {
      const errorDetails = ErrorHandler.handle(error, { 
        component: 'PDFService', 
        action: 'processPDFs' 
      });
      
      return {
        success: false,
        error: ErrorHandler.createUserMessage(error)
      };
    } finally {
      this.operationCount--;
      
      // Cleanup if no operations are running
      if (this.operationCount === 0) {
        setTimeout(() => this.cleanup(), 5000);
      }
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private async processChunk(chunk: number[], doc: PDFDocument, mergedPdf: PDFDocument): Promise<void> {
    const limit = pLimit(PROCESSING.MAX_CONCURRENT_OPERATIONS);
    const promises = chunk.map(pageIndex => 
      limit(() => this.processPage(doc, mergedPdf, pageIndex))
    );
    await Promise.all(promises);
  }

  async validatePDF(buffer: ArrayBuffer): Promise<{ isValid: boolean; error?: string; metadata?: PDFMetadata }> {
    try {
      // Check cache first
      if (validationCache.has(buffer)) {
        const isValid = validationCache.get(buffer)!;
        if (isValid && metadataCache.has(buffer)) {
          return { 
            isValid: true, 
            metadata: metadataCache.get(buffer)! 
          };
        }
        return { isValid: false, error: 'Invalid PDF' };
      }

      const doc = await PDFDocument.load(buffer, {
        updateMetadata: false,
        ignoreEncryption: true,
        parseSpeed: PROCESSING.PARSE_SPEED
      });

      const pageCount = doc.getPageCount();
      if (pageCount === 0) {
        validationCache.set(buffer, false);
        return { isValid: false, error: 'PDF has no pages' };
      }

      const metadata: PDFMetadata = {
        pageCount,
        isEncrypted: doc.isEncrypted,
        version: '1.7', // Default PDF version
        fileSize: buffer.byteLength,
        hasXFA: this.checkForXFA(doc)
      };

      // Cache results
      validationCache.set(buffer, true);
      metadataCache.set(buffer, metadata);

      return { isValid: true, metadata };

    } catch (error) {
      validationCache.set(buffer, false);
      return { 
        isValid: false, 
        error: ErrorHandler.getErrorMessage(error)
      };
    }
  }

  private checkForXFA(doc: PDFDocument): boolean {
    try {
      const catalog = doc.context.lookup(doc.context.trailerInfo.Root);
      if (catalog instanceof PDFDict) {
        const acroForm = catalog.lookup(PDFName.of('AcroForm'));
        if (acroForm && acroForm instanceof PDFDict) {
          const xfa = acroForm.lookup(PDFName.of('XFA'));
          return xfa !== undefined;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  private async hashBuffer(buffer: ArrayBuffer): Promise<string> {
    const hash = createHash('sha256');
    hash.update(Buffer.from(buffer));
    return hash.digest('hex');
  }

  // Cleanup on service destruction
  destroy(): void {
    if (this.memoryMonitor) {
      clearInterval(this.memoryMonitor);
    }
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
    }
    this.cleanup(true);
  }
}