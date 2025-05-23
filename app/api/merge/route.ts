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
const CHUNK_SIZE = 5; // Process 5 pages at a time for better stability
const CONCURRENT_FILES = 3; // Number of files to process concurrently
const SMALL_FILE_THRESHOLD = 1024 * 1024; // 1MB threshold for small files

// Simple in-memory cache
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

// Fast merge for small PDFs
async function fastMergePDFs(pdfDoc: PDFDocument, mergedPdf: PDFDocument): Promise<void> {
  const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
  pages.forEach(page => mergedPdf.addPage(page));
}

// Chunked merge for larger PDFs
async function chunkedMergePDFs(pdfDoc: PDFDocument, mergedPdf: PDFDocument): Promise<void> {
  const pageCount = pdfDoc.getPageCount();
  const chunkSize = 10; // Increased chunk size for better performance
  const chunks = Math.ceil(pageCount / chunkSize);

  for (let i = 0; i < chunks; i++) {
    const start = i * chunkSize;
    const end = Math.min((i + 1) * chunkSize, pageCount);
    const pageIndices = Array.from({ length: end - start }, (_, idx) => start + idx);

    const pages = await mergedPdf.copyPages(pdfDoc, pageIndices);
    pages.forEach(page => mergedPdf.addPage(page));

    // Minimal delay only for large files
    if (pageCount > 50) {
      await new Promise(resolve => setTimeout(resolve, 1));
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

  await chunkedMergePDFs(pdfDoc, mergedPdf);
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
  console.log('PDF merge request received');
  const startTime = Date.now();

  try {
    // Validate request
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("multipart/form-data")) {
      throw new Error("Content type must be multipart/form-data");
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length < 2) {
      throw new Error("At least two PDF files are required");
    }

    // Calculate total size and check if we can use fast merge
    let totalSize = 0;
    let canUseFastMerge = true;
    
    for (const file of files) {
      if (!file.type || file.type !== "application/pdf") {
        throw new Error(`File ${file.name} is not a valid PDF`);
      }

      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`File ${file.name} exceeds maximum size of 50MB`);
      }
      
      totalSize += file.size;
      if (file.size > SMALL_FILE_THRESHOLD) {
        canUseFastMerge = false;
      }
    }

    if (totalSize > MAX_TOTAL_SIZE) {
      throw new Error("Total file size exceeds 100MB limit");
    }

    // Check cache
    const cacheKey = files
      .map(f => `${f.name}-${f.size}-${f.lastModified}`)
      .sort()
      .join("|");

    const cachedResult = pdfCache.get(cacheKey);
    if (cachedResult && Date.now() - cachedResult.timestamp < 5 * 60 * 1000) {
      console.log('Returning cached result');
      return new NextResponse(cachedResult.data, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="merged-${new Date().toISOString().slice(0, 10)}.pdf"`,
          "Cache-Control": "private, max-age=300",
          "Content-Length": cachedResult.data.byteLength.toString(),
        },
      });
    }

    // Create new PDF
    console.log('Creating new merged PDF');
    const mergedPdf = await PDFDocument.create();

    // Process each file
    for (const file of files) {
      try {
        console.log(`Processing ${file.name}`);
        const fileBuffer = await file.arrayBuffer();
        
        const pdfDoc = await PDFDocument.load(fileBuffer, {
          updateMetadata: false,
          ignoreEncryption: true
        });

        if (pdfDoc.getPageCount() === 0) {
          throw new Error(`${file.name} appears to be empty`);
        }

        // Use appropriate merge method based on file size
        if (canUseFastMerge) {
          await fastMergePDFs(pdfDoc, mergedPdf);
        } else {
          await chunkedMergePDFs(pdfDoc, mergedPdf);
        }
        
        // Clear buffer
        fileBuffer.slice(0);
        
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        throw new Error(`Failed to process ${file.name}. Please ensure it's a valid PDF file.`);
      }

      // Check timeout
      if (Date.now() - startTime > MAX_PROCESSING_TIME) {
        throw new Error("Processing timeout exceeded");
      }
    }

    // Save merged PDF
    console.log('Saving merged PDF');
    const mergedPdfBytes = await mergedPdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: canUseFastMerge ? 100 : 40 // Higher value for small files
    });

    if (!mergedPdfBytes || mergedPdfBytes.length === 0) {
      throw new Error("Failed to generate merged PDF");
    }

    // Cache result
    pdfCache.set(cacheKey, {
      data: mergedPdfBytes,
      timestamp: Date.now()
    });

    console.log('Sending response');
    return new NextResponse(mergedPdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="merged-${new Date().toISOString().slice(0, 10)}.pdf"`,
        "Content-Length": mergedPdfBytes.byteLength.toString(),
      },
    });

  } catch (error) {
    console.error("PDF merge error:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
} 