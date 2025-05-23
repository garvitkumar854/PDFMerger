import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { headers } from "next/headers";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import path from "path";

// Constants
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_PROCESSING_TIME = 60000; // 60 seconds
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const REQUEST_TIMEOUT = 30000; // 30 seconds

// Cache implementation with memory management
const pdfCache = new Map<string, { data: Uint8Array; timestamp: number }>();

// Cleanup old cache entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of pdfCache.entries()) {
    if (now - value.timestamp > 5 * 60 * 1000) {
      pdfCache.delete(key);
    }
  }
}, 5 * 60 * 1000);

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

  try {
    // Get and validate content type using request headers directly
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content type must be multipart/form-data" },
        { status: 400 }
      );
    }

    // Get and validate files
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length < 2) {
      return NextResponse.json(
        { error: "At least two PDF files are required" },
        { status: 400 }
      );
    }

    // Validate file sizes and types
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

    // Generate cache key based on file metadata
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

    // Create a new PDF document with optimized settings
    const mergedPdf = await PDFDocument.create();
    
    // Process each PDF file with proper error handling
    for (const file of files) {
      try {
        // Check for timeout
        if (Date.now() - startTime > MAX_PROCESSING_TIME) {
          throw new Error("Processing timeout exceeded");
        }

        // Read file as array buffer
        const fileBuffer = await file.arrayBuffer();
        
        // Load and validate PDF
        const pdfDoc = await PDFDocument.load(new Uint8Array(fileBuffer), {
          updateMetadata: false,
          ignoreEncryption: true
        });

        // Check if PDF is valid
        if (pdfDoc.getPageCount() === 0) {
          throw new Error(`${file.name} appears to be empty or corrupted`);
        }

        // Copy pages with optimized settings
        const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
        pages.forEach(page => mergedPdf.addPage(page));

        // Clean up memory
        fileBuffer.slice(0);

      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        return NextResponse.json(
          { 
            error: `Failed to process ${file.name}. Please ensure it's a valid PDF file and not password protected.` 
          },
          { status: 400 }
        );
      }
    }

    // Save the merged PDF with optimized settings
    const mergedPdfBytes = await mergedPdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 100
    });

    // Cache the result
    pdfCache.set(cacheKey, {
      data: mergedPdfBytes,
      timestamp: Date.now()
    });

    // Return the merged PDF with appropriate headers
    return new NextResponse(mergedPdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="merged-${new Date().toISOString().slice(0, 10)}.pdf"`,
        "Cache-Control": "private, no-store",
        "Content-Length": mergedPdfBytes.byteLength.toString(),
        "X-Cache": "MISS",
        "X-Processing-Time": `${Date.now() - startTime}ms`
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