import { PDFDocument, PDFPage, PDFName, PDFDict } from 'pdf-lib';
import { createHash } from 'crypto';
import { estimatePDFMemoryUsage } from '@/lib/utils/pdf-validation';

// Constants for optimization
const MAX_CONCURRENT_LOADS = 3;
const PAGE_BATCH_SIZE = 10;
const CLEANUP_INTERVAL = 50;
const MEMORY_LIMIT = 1024 * 1024 * 1024; // 1GB

// Cache for PDF validation and metadata
const validationCache = new WeakMap<ArrayBuffer, boolean>();
const metadataCache = new WeakMap<ArrayBuffer, PDFMetadata>();

interface PDFMetadata {
  pageCount: number;
  isEncrypted: boolean;
  version: string;
  fileSize: number;
  hasXFA: boolean;
}

interface ProcessingOptions {
  optimizeImages?: boolean;
  removeMetadata?: boolean;
  maxQuality?: number;
  maxConcurrentLoads?: number;
  pageBatchSize?: number;
}

export class PDFService {
  private static instance: PDFService;
  private processingPool: Set<Promise<any>>;
  private loadingPromises: Map<string, Promise<PDFDocument>>;
  private operationCount: number;
  private totalMemoryUsage: number;

  private constructor() {
    this.processingPool = new Set();
    this.loadingPromises = new Map();
    this.operationCount = 0;
    this.totalMemoryUsage = 0;
  }

  static getInstance(): PDFService {
    if (!PDFService.instance) {
      PDFService.instance = new PDFService();
    }
    return PDFService.instance;
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
   * Process PDFs in parallel with advanced optimizations
   */
  async processPDFs(
    buffers: ArrayBuffer[],
    options: ProcessingOptions = {}
  ): Promise<Uint8Array> {
    if (!buffers.length) {
      throw new Error('No PDF buffers provided');
    }

    try {
      const mergedPdf = await PDFDocument.create({ 
        updateMetadata: false 
      });
      
      const loadPromises: Promise<PDFDocument>[] = [];
      const fileHashes = new Map<string, number>();

      // Estimate memory usage
      for (const buffer of buffers) {
        const memoryEstimate = await estimatePDFMemoryUsage(new Uint8Array(buffer));
        await this.checkMemoryLimit(memoryEstimate);
      }

      // Load PDFs in parallel with rate limiting
      for (let i = 0; i < buffers.length; i += MAX_CONCURRENT_LOADS) {
        const batch = buffers.slice(i, i + MAX_CONCURRENT_LOADS);
        const batchPromises = batch.map(async (buffer) => {
          const hash = createHash('sha256')
            .update(new Uint8Array(buffer))
            .digest('hex');
          
          // Reuse already loaded PDFs
          if (this.loadingPromises.has(hash)) {
            return this.loadingPromises.get(hash)!;
          }

          const loadPromise = PDFDocument.load(buffer, {
            updateMetadata: false,
            ignoreEncryption: true,
            throwOnInvalidObject: true,
            parseSpeed: 1000,
            capNumbers: true
          });

          this.loadingPromises.set(hash, loadPromise);
          fileHashes.set(hash, (fileHashes.get(hash) || 0) + 1);

          return loadPromise;
        });

        loadPromises.push(...batchPromises);
        await Promise.all(batchPromises); // Rate limit loading
      }

      // Process all PDFs
      const docs = await Promise.all(loadPromises);

      // Process pages in optimized batches
      for (const doc of docs) {
        const pageCount = doc.getPageCount();
        const pageBatches = Math.ceil(pageCount / PAGE_BATCH_SIZE);

        for (let i = 0; i < pageBatches; i++) {
          const startPage = i * PAGE_BATCH_SIZE;
          const endPage = Math.min((i + 1) * PAGE_BATCH_SIZE, pageCount);
          const pageIndices = Array.from(
            { length: endPage - startPage },
            (_, idx) => startPage + idx
          );

          // Copy pages in parallel
          const pages = await mergedPdf.copyPages(doc, pageIndices);
          pages.forEach(page => {
            if (options.optimizeImages) {
              this.optimizePage(page);
            }
            mergedPdf.addPage(page);
          });

          // Periodic cleanup
          this.operationCount++;
          if (this.operationCount % CLEANUP_INTERVAL === 0) {
            this.cleanup();
          }
        }
      }

      // Final cleanup
      this.cleanup();

      // Optimize output
      const mergedPdfBytes = await mergedPdf.save({
        useObjectStreams: true,
        addDefaultPage: false,
        objectsPerTick: 200,
        updateFieldAppearances: false
      });

      return mergedPdfBytes;
    } catch (error) {
      console.error('PDF processing error:', error);
      this.cleanup(); // Ensure cleanup on error
      throw error;
    }
  }

  /**
   * Optimize individual PDF page
   */
  private optimizePage(page: PDFPage): void {
    try {
      // Remove unnecessary metadata
      const names = ['PieceInfo', 'Metadata', 'Thumb'].map(name => 
        PDFName.of(name)
      );
      
      for (const name of names) {
        if (page.node.has(name)) {
          page.node.delete(name);
        }
      }
    } catch (error) {
      console.warn('Page optimization warning:', error);
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

  private async checkMemoryLimit(newUsage: number) {
    if (this.totalMemoryUsage + newUsage > MEMORY_LIMIT) {
      this.cleanup();
      this.totalMemoryUsage = 0;
      throw new Error('Memory limit exceeded');
    }
    this.totalMemoryUsage += newUsage;
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    try {
      // Clear caches if they're too large
      if (this.loadingPromises.size > 100) {
        this.loadingPromises.clear();
      }

      this.processingPool.clear();
      
      // Reset operation count periodically
      if (this.operationCount > 1000) {
        this.operationCount = 0;
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  }
} 