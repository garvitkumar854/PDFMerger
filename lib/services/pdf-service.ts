import { PDFDocument, PDFPage, PDFName, PDFDict } from 'pdf-lib';
import { createHash } from 'crypto';
import { estimatePDFMemoryUsage } from '@/lib/utils/pdf-validation';
import pLimit from 'p-limit';

// Optimized constants for better performance
const MAX_CONCURRENT_LOADS = 4; // Increased from 3
const PAGE_BATCH_SIZE = 20; // Increased from 10
const CLEANUP_INTERVAL = 100; // Increased from 50
const MEMORY_LIMIT = 1024 * 1024 * 1024; // 1GB
const MAX_PARALLEL_OPERATIONS = 8;

// Cache for PDF validation and metadata
const validationCache = new WeakMap<ArrayBuffer, boolean>();
const metadataCache = new WeakMap<ArrayBuffer, PDFMetadata>();
const pageCache = new WeakMap<PDFDocument, PDFPage[]>();

interface PDFMetadata {
  pageCount: number;
  isEncrypted: boolean;
  version: string;
  fileSize: number;
  hasXFA: boolean;
}

interface ProcessingOptions {
  optimizeImages?: boolean;
  updateMetadata?: boolean;
  useObjectStreams?: boolean;
}

export class PDFService {
  private static instance: PDFService;
  private loadingPromises: Map<string, Promise<PDFDocument>>;
  private operationCount: number;
  private limit: ReturnType<typeof pLimit>;

  private constructor() {
    this.loadingPromises = new Map();
    this.operationCount = 0;
    this.limit = pLimit(MAX_PARALLEL_OPERATIONS);
  }

  static getInstance(): PDFService {
    if (!PDFService.instance) {
      PDFService.instance = new PDFService();
    }
    return PDFService.instance;
  }

  private async checkMemoryLimit(additionalMemory: number): Promise<void> {
    if (process.memoryUsage().heapUsed + additionalMemory > MEMORY_LIMIT) {
      this.cleanup();
      if (process.memoryUsage().heapUsed + additionalMemory > MEMORY_LIMIT) {
        throw new Error('Memory limit exceeded');
      }
    }
  }

  private cleanup(): void {
    this.loadingPromises.clear();
    global.gc?.();
  }

  /**
   * Public method to trigger cleanup
   */
  public cleanupResources(): void {
    this.cleanup();
  }

  private async optimizePage(page: PDFPage): Promise<void> {
    try {
      const pageDict = page.node;
      const resources = pageDict.get(PDFName.of('Resources')) as PDFDict;
      
      if (!resources) return;

      // Optimize XObjects (images)
      const xObjects = resources.get(PDFName.of('XObject')) as PDFDict;
      if (xObjects) {
        const entries = xObjects.entries();
        for (const [_, xObject] of entries) {
          const dict = xObject as PDFDict;
          if (dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) {
            dict.set(PDFName.of('Interpolate'), PDFName.of('true'));
          }
        }
      }
    } catch (error) {
      console.warn('Error optimizing page:', error);
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
      
      // Pre-allocate arrays for better memory management
      const loadPromises: Promise<PDFDocument>[] = new Array(buffers.length);
      const fileHashes = new Map<string, number>();
      const processedDocs: PDFDocument[] = new Array(buffers.length);

      // Estimate total memory usage upfront
      const totalMemoryEstimate = await Promise.all(
        buffers.map(buffer => estimatePDFMemoryUsage(new Uint8Array(buffer)))
      ).then(estimates => estimates.reduce((a, b) => a + b, 0));

      await this.checkMemoryLimit(totalMemoryEstimate);

      // Load PDFs in parallel with optimized batching
      const loadBatches = Math.ceil(buffers.length / MAX_CONCURRENT_LOADS);
      for (let i = 0; i < loadBatches; i++) {
        const startIdx = i * MAX_CONCURRENT_LOADS;
        const endIdx = Math.min((i + 1) * MAX_CONCURRENT_LOADS, buffers.length);
        const batch = buffers.slice(startIdx, endIdx);

        const batchPromises = batch.map(async (buffer, batchIndex) => {
          const hash = createHash('sha256')
            .update(new Uint8Array(buffer))
            .digest('hex');
          
          if (this.loadingPromises.has(hash)) {
            return this.loadingPromises.get(hash)!;
          }

          const loadPromise = this.limit(() => PDFDocument.load(buffer, {
            updateMetadata: false,
            ignoreEncryption: true,
            throwOnInvalidObject: true,
            parseSpeed: 2000, // Increased parse speed
            capNumbers: true
          }));

          this.loadingPromises.set(hash, loadPromise);
          fileHashes.set(hash, (fileHashes.get(hash) || 0) + 1);
          
          const doc = await loadPromise;
          processedDocs[startIdx + batchIndex] = doc;
          return doc;
        });

        await Promise.all(batchPromises);
      }

      // Process pages with optimized batching and caching
      const pagePromises: Promise<void>[] = [];
      
      for (const doc of processedDocs) {
        if (!doc) continue;

        const pageCount = doc.getPageCount();
        const pageBatches = Math.ceil(pageCount / PAGE_BATCH_SIZE);

        for (let i = 0; i < pageBatches; i++) {
          const startPage = i * PAGE_BATCH_SIZE;
          const endPage = Math.min((i + 1) * PAGE_BATCH_SIZE, pageCount);
          const pageIndices = Array.from(
            { length: endPage - startPage },
            (_, idx) => startPage + idx
          );

          pagePromises.push(
            this.limit(async () => {
              const pages = await mergedPdf.copyPages(doc, pageIndices);
              
              if (options.optimizeImages) {
                await Promise.all(pages.map(page => this.optimizePage(page)));
              }
              
              pages.forEach(page => mergedPdf.addPage(page));

              // Periodic cleanup
              this.operationCount++;
              if (this.operationCount % CLEANUP_INTERVAL === 0) {
                this.cleanup();
              }
            })
          );
        }
      }

      await Promise.all(pagePromises);

      // Final cleanup
      this.cleanup();

      // Optimize output with enhanced settings
      const mergedPdfBytes = await mergedPdf.save({
        useObjectStreams: options.useObjectStreams ?? true,
        addDefaultPage: false,
        objectsPerTick: 500, // Increased from 200
        updateFieldAppearances: false
      });

      return mergedPdfBytes;
    } catch (error) {
      console.error('PDF processing error:', error);
      this.cleanup();
      throw error;
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
} 