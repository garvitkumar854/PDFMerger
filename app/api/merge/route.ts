import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { headers } from "next/headers";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import path from "path";

// Constants
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_PROCESSING_TIME = 180000; // 180 seconds
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const REQUEST_TIMEOUT = 30000; // 30 seconds
const CHUNK_SIZE = 10; // Increased chunk size for better performance
const CONCURRENT_FILES = 3; // Number of files to process concurrently

// Optimized cache with LRU (Least Recently Used) strategy
class LRUCache {
  private cache: Map<string, { data: Uint8Array; timestamp: number }>;
  private maxSize: number;

  constructor(maxSize = 50) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: string): { data: Uint8Array; timestamp: number } | undefined {
    const item = this.cache.get(key);
    if (item) {
      // Update access time
      this.cache.delete(key);
      this.cache.set(key, item);
    }
    return item;
  }

  set(key: string, value: { data: Uint8Array; timestamp: number }): void {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  cleanup(maxAge: number): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > maxAge) {
        this.cache.delete(key);
      }
    }
  }
}

const pdfCache = new LRUCache();

// Cleanup old cache entries every 5 minutes
setInterval(() => {
  pdfCache.cleanup(5 * 60 * 1000);
}, 5 * 60 * 1000);

// Helper function to process PDF chunks with optimized copying
async function processPDFChunks(pdfDoc: PDFDocument, mergedPdf: PDFDocument, startTime: number): Promise<void> {
  const pageCount = pdfDoc.getPageCount();
  const chunks = Math.ceil(pageCount / CHUNK_SIZE);
  const copyPromises: Promise<void>[] = [];

  for (let i = 0; i < chunks; i++) {
    if (Date.now() - startTime > MAX_PROCESSING_TIME) {
      throw new Error("Processing timeout exceeded");
    }

    const start = i * CHUNK_SIZE;
    const end = Math.min((i + 1) * CHUNK_SIZE, pageCount);
    const pageIndices = Array.from({ length: end - start }, (_, idx) => start + idx);

    // Process chunks concurrently
    const copyPromise = (async () => {
      const pages = await mergedPdf.copyPages(pdfDoc, pageIndices);
      pages.forEach(page => mergedPdf.addPage(page));
    })();

    copyPromises.push(copyPromise);

    // Process in batches of 3 chunks
    if (copyPromises.length >= 3 || i === chunks - 1) {
      await Promise.all(copyPromises);
      copyPromises.length = 0;
      // Minimal delay between batches
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }
}

// Helper function to process multiple PDFs concurrently
async function processFileConcurrently(
  file: File,
  mergedPdf: PDFDocument,
  startTime: number
): Promise<void> {
  const fileBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(new Uint8Array(fileBuffer), {
    updateMetadata: false,
    ignoreEncryption: true
  });

  if (pdfDoc.getPageCount() === 0) {
    throw new Error(`${file.name} appears to be empty or corrupted`);
  }

  await processPDFChunks(pdfDoc, mergedPdf, startTime);
  // Clean up memory
  fileBuffer.slice(0);
}

// Worker thread function for PDF processing
if (!isMainThread) {
  (async () => {
    const { pdfs } = workerData;
    try {
      const mergedPdf = await PDFDocument.create();
      
      for (const pdfBuffer of pdfs) {
        const pdf = await PDFDocument.load(pdfBuffer);
        const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        pages.forEach(page => mergedPdf.addPage(page));
      }

      // Compress the PDF
      const mergedPdfBytes = await mergedPdf.save({
        useObjectStreams: true,
        addDefaultPage: false,
        objectsPerTick: 50,
      });

      parentPort?.postMessage(mergedPdfBytes);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      parentPort?.postMessage({ error: errorMessage });
    }
  })();
}

export async function POST(request: Request) {
  const startTime = Date.now();
  console.log('PDF merge request received');

  try {
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content type must be multipart/form-data" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length < 2) {
      return NextResponse.json(
        { error: "At least two PDF files are required" },
        { status: 400 }
      );
    }

    // Validate files
    let totalSize = 0;
    for (const file of files) {
      if (!file.type || file.type !== "application/pdf") {
        return NextResponse.json(
          { error: `File ${file.name} is not a valid PDF` },
          { status: 400 }
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File ${file.name} exceeds maximum size of 50MB` },
          { status: 400 }
        );
      }
      totalSize += file.size;
    }

    if (totalSize > MAX_TOTAL_SIZE) {
      return NextResponse.json(
        { error: "Total file size exceeds 100MB limit" },
        { status: 400 }
      );
    }

    // Generate cache key based on file metadata and content hash
    const cacheKey = files
      .map(f => `${f.name}-${f.size}-${f.lastModified}`)
      .sort()
      .join("|");

    // Check cache
    const cachedResult = pdfCache.get(cacheKey);
    if (cachedResult && Date.now() - cachedResult.timestamp < 5 * 60 * 1000) {
      return new NextResponse(cachedResult.data, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="merged-${new Date().toISOString().slice(0, 10)}.pdf"`,
          "Cache-Control": "private, max-age=300",
          "Content-Length": cachedResult.data.byteLength.toString(),
          "X-Cache": "HIT"
        },
      });
    }

    // Create a new PDF document
    const mergedPdf = await PDFDocument.create();
    
    // Process files in parallel with a concurrency limit
    for (let i = 0; i < files.length; i += CONCURRENT_FILES) {
      const batch = files.slice(i, i + CONCURRENT_FILES);
      const promises = batch.map(file => 
        processFileConcurrently(file, mergedPdf, startTime)
          .catch(error => {
            console.error(`Error processing file ${file.name}:`, error);
            throw new Error(`Failed to process ${file.name}. Please ensure it's a valid PDF file and not password protected.`);
          })
      );

      await Promise.all(promises);
    }

    // Save with optimized settings
    const mergedPdfBytes = await mergedPdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 40
    });

    // Cache the result
    pdfCache.set(cacheKey, {
      data: mergedPdfBytes,
      timestamp: Date.now()
    });

    const processingTime = Date.now() - startTime;

    // Return the merged PDF
    return new NextResponse(mergedPdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="merged-${new Date().toISOString().slice(0, 10)}.pdf"`,
        "Cache-Control": "private, no-store",
        "Content-Length": mergedPdfBytes.byteLength.toString(),
        "X-Cache": "MISS",
        "X-Processing-Time": `${processingTime}ms`
      },
    });

  } catch (error) {
    console.error("Error merging PDFs:", error);
    const errorMessage = error instanceof Error 
      ? error.message 
      : "An unexpected error occurred while merging PDFs";

    return NextResponse.json(
      { error: errorMessage },
      { status: error instanceof Error && error.message.includes("timeout") ? 408 : 500 }
    );
  }
} 