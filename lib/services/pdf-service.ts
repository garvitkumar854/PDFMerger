import { PDFDocument, PDFPage } from 'pdf-lib';
import { createHash } from 'crypto';

// Advanced optimization constants
const THREAD_POOL_SIZE = Math.max(2, Math.min(navigator?.hardwareConcurrency || 4, 8));
const PAGE_BATCH_SIZE = 50; // Process 50 pages at once
const COMPRESSION_LEVEL = 0.92; // Optimal compression ratio
const MAX_CONCURRENT_LOADS = 5;

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
  compress?: boolean;
  optimizeImages?: boolean;
  removeMetadata?: boolean;
  maxQuality?: number;
}

export class PDFService {
  private static instance: PDFService;
  private processingPool: Set<Promise<any>>;
  private loadingPromises: Map<string, Promise<PDFDocument>>;

  private constructor() {
    this.processingPool = new Set();
    this.loadingPromises = new Map();
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

      const metadata: PDFMetadata = {
        pageCount: pdfDoc.getPageCount(),
        isEncrypted: pdfDoc.isEncrypted,
        version: pdfDoc.getProducer() || 'Unknown',
        fileSize: buffer.byteLength,
        hasXFA: this.checkForXFA(pdfDoc)
      };

      const isValid = metadata.pageCount > 0;
      validationCache.set(buffer, isValid);
      metadataCache.set(buffer, metadata);

      return { isValid, metadata };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'PDF validation failed'
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
    const mergedPdf = await PDFDocument.create({ updateMetadata: false });
    const loadPromises: Promise<PDFDocument>[] = [];
    const fileHashes = new Map<string, number>();

    // Load PDFs in parallel with rate limiting
    for (let i = 0; i < buffers.length; i += MAX_CONCURRENT_LOADS) {
      const batch = buffers.slice(i, i + MAX_CONCURRENT_LOADS);
      const batchPromises = batch.map(async (buffer) => {
        const hash = createHash('sha256').update(new Uint8Array(buffer)).digest('hex');
        
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

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }
    }

    // Clear caches periodically
    if (this.loadingPromises.size > 100) {
      this.loadingPromises.clear();
    }

    // Optimize output
    const mergedPdfBytes = await mergedPdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 200,
      updateFieldAppearances: false
    });

    return mergedPdfBytes;
  }

  /**
   * Optimize individual PDF page
   */
  private optimizePage(page: PDFPage): void {
    // Implement advanced page optimization if needed
    // This is a placeholder for future optimizations
  }

  /**
   * Check for XFA forms (which can cause issues)
   */
  private checkForXFA(doc: PDFDocument): boolean {
    // Implement XFA form detection
    // This is a placeholder for future implementation
    return false;
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.loadingPromises.clear();
    this.processingPool.clear();
    if (global.gc) {
      global.gc();
    }
  }
} 