import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { headers } from "next/headers";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import path from "path";

// Constants
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const REQUEST_TIMEOUT = 30000; // 30 seconds

// Cache with automatic cleanup
class PDFCache {
  private cache = new Map<string, { data: ArrayBuffer; timestamp: number }>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  set(key: string, data: ArrayBuffer) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  get(key: string): ArrayBuffer | undefined {
    const item = this.cache.get(key);
    if (item && Date.now() - item.timestamp < CACHE_TTL) {
      return item.data;
    }
    if (item) {
      this.cache.delete(key);
    }
    return undefined;
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp >= CACHE_TTL) {
        this.cache.delete(key);
      }
    }
  }
}

const pdfCache = new PDFCache();

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
  try {
    // Validate request method
    if (request.method !== "POST") {
      return NextResponse.json(
        { error: "Method not allowed" },
        { status: 405 }
      );
    }

    // Validate content type
    const headersList = await headers();
    const contentType = headersList.get("content-type");
    if (!contentType?.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content type must be multipart/form-data" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    // Validate files
    if (!files || files.length < 2) {
      return NextResponse.json(
        { error: "At least two PDF files are required" },
        { status: 400 }
      );
    }

    // Validate file sizes
    let totalSize = 0;
    for (const file of files) {
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

    // Check cache
    const cacheKey = files.map(f => `${f.name}-${f.size}`).sort().join("|");
    const cachedPdf = pdfCache.get(cacheKey);
    if (cachedPdf) {
      return new NextResponse(cachedPdf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": "attachment; filename=merged.pdf",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    // Convert files to array buffers
    const pdfBuffers = await Promise.all(
      files.map(file => file.arrayBuffer())
    );

    // Process PDFs in a worker thread
    const worker = new Worker(__filename, {
      workerData: { pdfs: pdfBuffers },
    });

    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error("PDF processing timeout"));
      }, REQUEST_TIMEOUT);

      worker.on("message", (result) => {
        clearTimeout(timeout);
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result);
        }
      });

      worker.on("error", reject);
      worker.on("exit", (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });

    const mergedPdfBytes = result as ArrayBuffer;

    // Cache the result
    pdfCache.set(cacheKey, mergedPdfBytes);

    // Return the merged PDF
    return new NextResponse(mergedPdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=merged.pdf",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("Error merging PDFs:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to merge PDFs";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
} 