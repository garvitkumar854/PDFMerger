import { PDFDocument, PDFPage, PDFName, PDFDict } from 'pdf-lib';
import { createHash } from 'crypto';
import { estimatePDFMemoryUsage } from '@/lib/utils/pdf-validation';
import pLimit from 'p-limit';

// Optimized limits for maximum performance
const LIMITS = {
  MEMORY: 32768 * 1024 * 1024,  // 32GB memory limit for massive files
  MAX_FILES: 2000,               // Increased max files for batch processing
  MAX_FILE_SIZE: 8192 * 1024 * 1024, // 8GB per file
  MAX_TOTAL_SIZE: 32768 * 1024 * 1024, // 32GB total
  CACHE_SIZE: 1024 * 1024 * 1024, // 1GB cache size
  MAX_CACHE_ENTRIES: 2000,       // Maximum number of cache entries
  SMALL_FILE_THRESHOLD: 10 * 1024 * 1024, // 10MB threshold for small files
  LARGE_FILE_THRESHOLD: 100 * 1024 * 1024 // 100MB threshold for large files
};

// Ultra-performance processing constants
const PROCESSING = {
  CHUNK_SIZE: 2048 * 1024 * 1024,    // 2GB chunks for maximum throughput
  PAGE_INTERVAL: 10000,              // Increased batch size for extreme throughput
  CLEANUP_INTERVAL: 20000,           // Less frequent cleanup for better performance
  MEMORY_THRESHOLD: 0.90,            // Optimized memory threshold
  PARSE_SPEED: 500000,              // Maximum possible parsing speed
  BATCH_DELAY: 0,                   // No delays for maximum speed
  MAX_CONCURRENT_OPERATIONS: 512,    // Maximum parallel operations
  WORKER_THREADS: 256,              // Maximum worker threads
  BATCH_SIZE: 256,                  // Increased batch size
  SUB_BATCH_SIZE: 1000,            // Larger sub-batch size
  GC_INTERVAL: 100000,             // Garbage collection interval
  STREAM_CHUNK_SIZE: 4 * 1024 * 1024, // 4MB streaming chunks
  SMALL_FILE_BATCH_SIZE: 50,        // Batch size for small files
  LARGE_FILE_BATCH_SIZE: 10         // Batch size for large files
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
}

interface StreamingOptions extends ProcessingOptions {
  maxPagesPerDocument?: number;
  forceGC?: boolean;
}

export interface ProcessingProgress {
  stage: 'initialization' | 'validation' | 'loading' | 'merging' | 'optimizing' | 'finalizing';
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
  }

  static getInstance(): PDFService {
    if (!PDFService.instance) {
      PDFService.instance = new PDFService();
    }
    return PDFService.instance;
  }

  private async initializeWorkerPool() {
    // Initialize worker pool for parallel processing if needed
    if (!this.workerPool) {
      this.workerPool = Array(PROCESSING.MAX_CONCURRENT_OPERATIONS).fill(null);
    }
  }

  private async optimizePDF(doc: PDFDocument): Promise<void> {
    try {
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
              obj.set(PDFName.of('Interpolate'), PDFName.of('true'));
            }
          }
        } catch (error) {
          // Skip problematic pages
          continue;
        }
      }
    } catch (error) {
      // Continue without optimization if there's an error
      console.warn('Image optimization skipped:', error);
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
    const currentMemory = process.memoryUsage();
    if (currentMemory.heapUsed > LIMITS.MEMORY * PROCESSING.MEMORY_THRESHOLD) {
      await this.cleanup();
      
      const newMemory = process.memoryUsage();
      if (newMemory.heapUsed > LIMITS.MEMORY * PROCESSING.MEMORY_THRESHOLD) {
        throw new Error('Memory limit reached. Please try with fewer pages.');
      }
    }
  }

  /**
   * Clean up resources and force garbage collection if needed
   * @param force Whether to force garbage collection
   */
  public async cleanup(force: boolean = false): Promise<void> {
    try {
      // Clear document cache if it's too large
      if (this.documentCache.size > LIMITS.MAX_CACHE_ENTRIES) {
        this.documentCache.clear();
      }
      
      // Clear page cache if it's too large
      if (this.pageCache.size > LIMITS.MAX_CACHE_ENTRIES) {
        this.pageCache.clear();
      }
      
      // Force garbage collection if memory pressure is high
      const memUsage = process.memoryUsage().heapUsed / 1024 / 1024;
      if (force || memUsage > LIMITS.MEMORY * PROCESSING.MEMORY_THRESHOLD) {
        if (typeof global.gc === 'function') {
          global.gc();
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }
    } catch (error) {
      console.warn('[PDF Merge] Cleanup error:', error);
    }
  }

  private async processPage(
    doc: PDFDocument,
    mergedPdf: PDFDocument,
    pageIndex: number
  ): Promise<void> {
    try {
      const [page] = await mergedPdf.copyPages(doc, [pageIndex]);
      mergedPdf.addPage(page);
      
      this.operationCount++;
      if (this.operationCount % PROCESSING.CLEANUP_INTERVAL === 0) {
        await this.checkMemoryLimit();
      }
    } catch (error) {
      console.warn(`Error processing page ${pageIndex}:`, error);
    }
  }

  private logWithThrottle(message: string) {
    const now = performance.now();
    if (now - this.lastLogTime >= this.LOG_THROTTLE) {
      console.log(message);
      this.lastLogTime = now;
    }
  }

  private resetProgress() {
    this.startTime = Date.now();
    this.lastProgressUpdate = this.startTime;
    this.processedBytes = 0;
    this.totalBytes = 0;
    this.processedPages = 0;
    this.totalPages = 0;
    this.lastLogTime = 0;
    
    // Clear any hanging operations
    this.loadingPromises.clear();
    this.pageCache.clear();
    this.documentCache.clear();
    
    // Force garbage collection
    if (typeof global.gc === 'function') {
      global.gc();
    }
  }

  private updateProgress(
    stage: ProcessingProgress['stage'],
    progress: number,
    fileIndex: number,
    totalFiles: number,
    onProgress?: ProgressCallback
  ) {
    const now = Date.now();
    const timeElapsed = now - this.startTime;

    // Define specific progress stages
    const progressStages = {
      initialization: [0, 10],
      validation: [10, 25],
      loading: [25, 45],
      merging: [45, 75],
      optimizing: [75, 95],
      finalizing: [95, 100]
    };

    // Get the current stage range
    const [stageStart, stageEnd] = progressStages[stage];
    
    // Calculate progress within the current stage
    const stageProgress = Math.min(100, progress);
    const stageRange = stageEnd - stageStart;
    const actualProgress = stageStart + (stageRange * (stageProgress / 100));

    // Define specific progress points we want to hit
    const targetPoints = [10, 25, 30, 45, 58, 69, 75, 89, 95, 99, 100];
    
    // Find the next target point
    let overallProgress = actualProgress;
    for (const point of targetPoints) {
      if (actualProgress <= point) {
        // Snap to the nearest target point if we're close
        if (point - actualProgress < 2) {
          overallProgress = point;
        }
        break;
      }
    }

    // Ensure progress never goes backwards
    if (this.lastProgressUpdate > overallProgress) {
      overallProgress = this.lastProgressUpdate;
    }

    // Update last progress
    this.lastProgressUpdate = overallProgress;

    // Calculate estimated time remaining
    const estimatedTimeRemaining = overallProgress > 0 
      ? (timeElapsed / overallProgress) * (100 - overallProgress)
      : 0;

    // Log progress without throttling for immediate feedback
    console.log(
      `[PDF Merge] ${stage.charAt(0).toUpperCase() + stage.slice(1)} - ` +
      `${overallProgress.toFixed(1)}% complete. File ${fileIndex + 1}/${totalFiles}. ` +
      `Pages: ${this.processedPages}/${this.totalPages}. ` +
      `Time: ${(timeElapsed / 1000).toFixed(1)}s`
    );

    onProgress?.({
      stage,
      progress: overallProgress,
      fileIndex,
      totalFiles,
      details: {
        pagesProcessed: this.processedPages,
        totalPages: this.totalPages,
        currentFilePages: 0,
        bytesProcessed: this.processedBytes,
        totalBytes: this.totalBytes,
        timeElapsed,
        estimatedTimeRemaining,
        currentStage: targetPoints.findIndex(p => p > overallProgress),
        totalStages: targetPoints.length
      }
    });
  }

  async processPDFs(
    buffers: ArrayBuffer[],
    options: ProcessingOptions = {},
    onProgress?: ProgressCallback
  ): Promise<MergeResult> {
    this.resetProgress();
    const startTime = performance.now();
    
    // Start with initialization stage
    this.updateProgress('initialization', 0, 0, buffers.length, onProgress);

    try {
      // Calculate total bytes and validate in parallel
      this.totalBytes = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
      const isSmallOperation = this.totalBytes < LIMITS.SMALL_FILE_THRESHOLD;
      const isLargeOperation = this.totalBytes > LIMITS.LARGE_FILE_THRESHOLD;
      
      this.updateProgress('initialization', 100, 0, buffers.length, onProgress);

      // Initial validation
      if (!buffers.length) return { success: false, error: 'No PDFs provided' };
      if (buffers.length > LIMITS.MAX_FILES) {
        return { success: false, error: `Maximum ${LIMITS.MAX_FILES} PDFs allowed per merge` };
      }
      if (this.totalBytes > LIMITS.MAX_TOTAL_SIZE) {
        return { success: false, error: `Total size exceeds ${LIMITS.MAX_TOTAL_SIZE / (1024 * 1024)}MB limit` };
      }

      // Create output document with optimized settings
      const mergedPdf = await PDFDocument.create({
        updateMetadata: false
      });

      // Process PDFs in optimized parallel batches
      const batchSize = isSmallOperation ? 
        PROCESSING.SMALL_FILE_BATCH_SIZE : 
        isLargeOperation ? 
          PROCESSING.LARGE_FILE_BATCH_SIZE : 
          PROCESSING.BATCH_SIZE;

      const batches = this.chunkArray(buffers, batchSize);
      const results: { doc: PDFDocument; pageCount: number; hash: string }[] = [];

      // Process all batches with validation progress
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const validationProgress = (batchIndex / batches.length) * 100;
        this.updateProgress('validation', validationProgress, batchIndex, batches.length, onProgress);

        try {
          const batchPromises = batch.map(async (buffer, index) => {
            const globalIndex = batchIndex * batchSize + index;
            try {
              if (buffer.byteLength > LIMITS.MAX_FILE_SIZE) {
                throw new Error(`File ${globalIndex + 1} exceeds size limit`);
              }

              const hash = await this.hashBuffer(buffer);
              let doc: PDFDocument;

              if (this.documentCache.has(hash)) {
                doc = this.documentCache.get(hash)!;
              } else {
                doc = await PDFDocument.load(buffer, {
                  updateMetadata: false,
                  ignoreEncryption: true,
                  throwOnInvalidObject: false,
                  parseSpeed: isSmallOperation ? 
                    PROCESSING.PARSE_SPEED / 2 : 
                    PROCESSING.PARSE_SPEED,
                  capNumbers: true
                });
                this.documentCache.set(hash, doc);
              }

              const pageCount = doc.getPageCount();
              this.processedBytes += buffer.byteLength;
              this.totalPages += pageCount;

              return { doc, pageCount, hash };
            } catch (error) {
              console.warn(`[PDF Merge] Error processing file ${globalIndex + 1}:`, error);
              return null;
            }
          });

          const batchResults = await Promise.all(batchPromises);
          results.push(...batchResults.filter((result): result is NonNullable<typeof result> => result !== null));

          // Update loading progress to hit specific percentages
          const loadingProgress = Math.min(100, (batchIndex / batches.length) * 100);
          this.updateProgress('loading', loadingProgress, batchIndex, batches.length, onProgress);

          if (isLargeOperation && batchIndex % 2 === 1) {
            await this.cleanup();
          }
        } catch (error) {
          console.warn('[PDF Merge] Batch processing error:', error);
        }
      }

      if (results.length === 0) {
        return { success: false, error: 'No valid PDFs to process' };
      }

      // Process files with merging progress
      let processedPages = 0;
      const totalPages = results.reduce((sum, r) => sum + r.pageCount, 0);
      
      for (let fileIndex = 0; fileIndex < results.length; fileIndex++) {
        const { doc, pageCount } = results[fileIndex];
        
        const interval = isSmallOperation ? 
          Math.min(pageCount, PROCESSING.PAGE_INTERVAL / 2) : 
          PROCESSING.PAGE_INTERVAL;
        
        const pageChunks = this.chunkArray(
          Array.from({ length: pageCount }, (_, i) => i),
          interval
        );

        for (let chunkIndex = 0; chunkIndex < pageChunks.length; chunkIndex++) {
          const chunk = pageChunks[chunkIndex];
          await this.processChunk(chunk, doc, mergedPdf);
          processedPages += chunk.length;
          
          // Calculate merging progress to hit specific percentages
          const mergingProgress = Math.min(100, (processedPages / totalPages) * 100);
          this.updateProgress('merging', mergingProgress, fileIndex, results.length, onProgress);
        }

        this.documentCache.delete(results[fileIndex].hash);
        if (pageCount > 1000 || isLargeOperation) {
          await this.cleanup();
        }
      }

      // Final optimization phase with specific progress points
      this.updateProgress('optimizing', 0, buffers.length, buffers.length, onProgress);
      
      const mergedPdfBytes = await mergedPdf.save({
        useObjectStreams: !isLargeOperation,
        addDefaultPage: false,
        objectsPerTick: isSmallOperation ? 5000 : 2000
      });

      this.updateProgress('optimizing', 100, buffers.length, buffers.length, onProgress);

      // Final cleanup and progress
      this.updateProgress('finalizing', 0, buffers.length, buffers.length, onProgress);
      this.pageCache.clear();
      this.documentCache.clear();
      await this.cleanup(true);
      this.updateProgress('finalizing', 100, buffers.length, buffers.length, onProgress);

      const totalTime = performance.now() - startTime;

      return {
        success: true,
        data: mergedPdfBytes,
        stats: {
          totalPages: this.totalPages,
          totalSize: this.totalBytes,
          processingTime: totalTime
        }
      };

    } catch (error) {
      console.error('[PDF Merge] Error:', error);
      this.pageCache.clear();
      this.documentCache.clear();
      await this.cleanup(true);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'PDF processing failed'
      };
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
    try {
      const cacheKey = `${doc.getTitle() || ''}-${chunk[0]}-${chunk[chunk.length - 1]}`;
      
      // Optimize chunk size based on document size
      const docSize = doc.getPages().length;
      const isSmallDoc = docSize <= 100;
      const subChunkSize = isSmallDoc ? 
        Math.min(docSize, PROCESSING.SUB_BATCH_SIZE / 2) : 
        PROCESSING.SUB_BATCH_SIZE;
      
      // Process in parallel sub-chunks for maximum performance
      const subChunks = this.chunkArray(chunk, subChunkSize);
      
      // Enhanced parallel processing with adaptive worker pool
      const workerCount = Math.min(
        PROCESSING.WORKER_THREADS,
        isSmallDoc ? 32 : Math.ceil(chunk.length / 500)
      );
      
      const subChunkLimit = pLimit(workerCount);
      const processedPages = new Set<number>();
      
      // Pre-allocate page arrays for better memory efficiency
      const pageArrays: PDFPage[][] = new Array(subChunks.length);
      
      // Process all sub-chunks in parallel
      await Promise.all(
        subChunks.map((subChunk, index) => 
          subChunkLimit(async () => {
            try {
              // Optimize memory by processing pages in dynamic groups
              const pageGroupSize = Math.min(
                isSmallDoc ? 25 : 100,
                Math.ceil(subChunk.length / workerCount)
              );
              
              const pageGroups = this.chunkArray(subChunk, pageGroupSize);
              const pagesForChunk: PDFPage[] = [];
              
              for (const group of pageGroups) {
                // Skip already processed pages
                const unprocessedPages = group.filter(p => !processedPages.has(p));
                if (unprocessedPages.length === 0) continue;
                
                // Copy pages in bulk for better performance
                const pages = await mergedPdf.copyPages(doc, unprocessedPages);
                pagesForChunk.push(...pages);
                
                // Mark pages as processed
                unprocessedPages.forEach(p => processedPages.add(p));
              }
              
              // Store pages for bulk addition
              pageArrays[index] = pagesForChunk;
              
              // Check memory pressure
              const memUsage = process.memoryUsage().heapUsed / 1024 / 1024;
              if (memUsage > LIMITS.MEMORY * 0.85) {
                await this.cleanup();
                await new Promise(resolve => setTimeout(resolve, 1));
              }
            } catch (e) {
              console.warn(
                `[PDF Merge] Warning: Error in sub-chunk ${subChunk[0]}-${subChunk[subChunk.length - 1]}: ${e}`
              );
            }
          })
        )
      );
      
      // Add all pages in bulk for better performance
      const addPageLimit = pLimit(16);
      await Promise.all(
        pageArrays.map(pages =>
          addPageLimit(async () => {
            if (!pages || pages.length === 0) return;
            
            // Add pages in bulk
            pages.forEach(page => {
              mergedPdf.addPage(page);
              // Clear page references immediately
              (page as any)._dict = null;
              (page as any)._ref = null;
            });
            
            // Clear references
            pages.length = 0;
          })
        )
      );
      
      // Clear cache entry
      this.pageCache.delete(cacheKey);
      
    } catch (error) {
      console.warn('[PDF Merge] Error in chunk processing:', error);
      
      // Enhanced fallback with optimized parallel processing
      const fallbackLimit = pLimit(32);
      const pageGroups = this.chunkArray(chunk, 50);
      
      await Promise.all(
        pageGroups.map(group => 
          fallbackLimit(async () => {
            const pages: PDFPage[] = [];
            
            for (const pageIndex of group) {
              try {
                const [page] = await mergedPdf.copyPages(doc, [pageIndex]);
                pages.push(page);
              } catch (e) {
                console.warn(`[PDF Merge] Warning: Skipping problematic page ${pageIndex}`);
              }
            }
            
            // Add pages in bulk
            pages.forEach(page => {
              mergedPdf.addPage(page);
              // Clear page references
              (page as any)._dict = null;
              (page as any)._ref = null;
            });
            
            // Clear references
            pages.length = 0;
            
            // Check memory pressure in fallback mode
            const memUsage = process.memoryUsage().heapUsed / 1024 / 1024;
            if (memUsage > LIMITS.MEMORY * 0.9) {
              await this.cleanup();
              await new Promise(resolve => setTimeout(resolve, 1));
            }
          })
        )
      );
    }
  }

  /**
   * Advanced PDF validation with caching and quick checks
   */
  async validatePDF(buffer: ArrayBuffer): Promise<{ isValid: boolean; error?: string; metadata?: PDFMetadata }> {
    try {
      // Check cache first
      if (validationCache.has(buffer)) {
        return { isValid: validationCache.get(buffer)!, metadata: metadataCache.get(buffer) };
      }

      // Quick size validation
      if (buffer.byteLength < 67) {
        return { isValid: false, error: 'Invalid PDF: File too small' };
      }

      // Fast header check using TypedArray
      const headerView = new Uint8Array(buffer.slice(0, 8));
      if (!(headerView[0] === 0x25 && // %
            headerView[1] === 0x50 && // P
            headerView[2] === 0x44 && // D
            headerView[3] === 0x46 && // F
            headerView[4] === 0x2D)) { // -
        return { isValid: false, error: 'Invalid PDF: Wrong signature' };
      }

      // Version check
      const version = String.fromCharCode(headerView[5], headerView[6], headerView[7]);
      if (!version.match(/[0-9]\.[0-9]/)) {
        return { isValid: false, error: 'Invalid PDF: Unsupported version' };
      }

      // Load PDF with optimized settings
      const pdfDoc = await PDFDocument.load(buffer, {
        updateMetadata: false,
        ignoreEncryption: true,
        throwOnInvalidObject: true,
        parseSpeed: 1000,
        capNumbers: true
      });

      // Check for encrypted content
      if (pdfDoc.isEncrypted) {
        return { isValid: false, error: 'Invalid PDF: File is encrypted' };
      }

      // Check for minimum content
      if (pdfDoc.getPageCount() === 0) {
        return { isValid: false, error: 'Invalid PDF: No pages found' };
      }

      const metadata: PDFMetadata = {
        pageCount: pdfDoc.getPageCount(),
        isEncrypted: pdfDoc.isEncrypted,
        version: pdfDoc.getProducer() || 'Unknown',
        fileSize: buffer.byteLength,
        hasXFA: this.checkForXFA(pdfDoc)
      };

      // Cache the results
      validationCache.set(buffer, true);
      metadataCache.set(buffer, metadata);

      return { isValid: true, metadata };
    } catch (error) {
      console.error('PDF validation error:', error);
      return {
        isValid: false,
        error: error instanceof Error ? 
          `Invalid PDF: ${error.message}` : 
          'PDF validation failed'
      };
    }
  }

  /**
   * Check for XFA forms (which can cause issues)
   */
  private checkForXFA(doc: PDFDocument): boolean {
    try {
      const catalog = doc.context.lookup(doc.context.trailerInfo.Root);
      if (!(catalog instanceof PDFDict)) return false;

      const acroForm = catalog.lookup(PDFName.of('AcroForm'));
      if (!(acroForm instanceof PDFDict)) return false;

      return acroForm.has(PDFName.of('XFA'));
    } catch {
      return false;
    }
  }

  private async hashBuffer(buffer: ArrayBuffer): Promise<string> {
    const data = new Uint8Array(buffer);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
} 