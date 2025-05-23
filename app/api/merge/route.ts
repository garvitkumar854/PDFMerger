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

// File size thresholds
const SIZE_THRESHOLDS = {
  TINY: 512 * 1024,    // 512KB
  SMALL: 2 * 1024 * 1024,    // 2MB
  MEDIUM: 10 * 1024 * 1024,  // 10MB
  LARGE: 25 * 1024 * 1024    // 25MB
};

// Processing configurations based on file size
const PROCESSING_CONFIGS = {
  TINY: {
    chunkSize: 0,  // No chunking needed
    objectsPerTick: 150
  },
  SMALL: {
    chunkSize: 20,
    objectsPerTick: 100
  },
  MEDIUM: {
    chunkSize: 10,
    objectsPerTick: 50
  },
  LARGE: {
    chunkSize: 5,
    objectsPerTick: 25
  }
};

// Enhanced cache with size-based expiration
const pdfCache = new Map<string, { 
  data: Uint8Array; 
  timestamp: number;
  size: number;
}>();

// Adaptive cache cleanup
setInterval(() => {
  const now = Date.now();
  const maxAge = {
    tiny: 30 * 60 * 1000,    // 30 minutes for tiny files
    small: 15 * 60 * 1000,   // 15 minutes for small files
    medium: 10 * 60 * 1000,  // 10 minutes for medium files
    large: 5 * 60 * 1000     // 5 minutes for large files
  };

  for (const [key, value] of pdfCache.entries()) {
    const threshold = value.size <= SIZE_THRESHOLDS.TINY ? maxAge.tiny :
                     value.size <= SIZE_THRESHOLDS.SMALL ? maxAge.small :
                     value.size <= SIZE_THRESHOLDS.MEDIUM ? maxAge.medium :
                     maxAge.large;
    
    if (now - value.timestamp > threshold) {
      pdfCache.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Get processing config based on total size
function getProcessingConfig(totalSize: number) {
  if (totalSize <= SIZE_THRESHOLDS.TINY) return PROCESSING_CONFIGS.TINY;
  if (totalSize <= SIZE_THRESHOLDS.SMALL) return PROCESSING_CONFIGS.SMALL;
  if (totalSize <= SIZE_THRESHOLDS.MEDIUM) return PROCESSING_CONFIGS.MEDIUM;
  return PROCESSING_CONFIGS.LARGE;
}

// Optimized PDF merging function
async function mergePDFs(pdfDoc: PDFDocument, mergedPdf: PDFDocument, config: typeof PROCESSING_CONFIGS.TINY): Promise<void> {
  const pageCount = pdfDoc.getPageCount();
  
  // For tiny files or small page counts, merge directly
  if (config.chunkSize === 0 || pageCount <= 20) {
    const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
    pages.forEach(page => mergedPdf.addPage(page));
    return;
  }

  // For larger files, use chunked processing
  const chunks = Math.ceil(pageCount / config.chunkSize);
  for (let i = 0; i < chunks; i++) {
    const start = i * config.chunkSize;
    const end = Math.min((i + 1) * config.chunkSize, pageCount);
    const pageIndices = Array.from({ length: end - start }, (_, idx) => start + idx);

    const pages = await mergedPdf.copyPages(pdfDoc, pageIndices);
    pages.forEach(page => mergedPdf.addPage(page));

    // Minimal delay only for very large files
    if (pageCount > 100) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }
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

    // Calculate total size and validate files
    let totalSize = 0;
    for (const file of files) {
      if (!file.type || file.type !== "application/pdf") {
        throw new Error(`File ${file.name} is not a valid PDF`);
      }

      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`File ${file.name} exceeds maximum size of 50MB`);
      }
      totalSize += file.size;
    }

    if (totalSize > MAX_TOTAL_SIZE) {
      throw new Error("Total file size exceeds 100MB limit");
    }

    // Get processing configuration based on total size
    const config = getProcessingConfig(totalSize);

    // Check cache with size-based expiration
    const cacheKey = files
      .map(f => `${f.name}-${f.size}-${f.lastModified}`)
      .sort()
      .join("|");

    const cachedResult = pdfCache.get(cacheKey);
    if (cachedResult) {
      const maxAge = cachedResult.size <= SIZE_THRESHOLDS.TINY ? 30 * 60 * 1000 :
                    cachedResult.size <= SIZE_THRESHOLDS.SMALL ? 15 * 60 * 1000 :
                    cachedResult.size <= SIZE_THRESHOLDS.MEDIUM ? 10 * 60 * 1000 :
                    5 * 60 * 1000;

      if (Date.now() - cachedResult.timestamp <= maxAge) {
        return new NextResponse(cachedResult.data, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="merged-${new Date().toISOString().slice(0, 10)}.pdf"`,
            "Content-Length": cachedResult.data.byteLength.toString(),
          },
        });
      }
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

        await mergePDFs(pdfDoc, mergedPdf, config);
        fileBuffer.slice(0);
        
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        throw new Error(`Failed to process ${file.name}. Please ensure it's a valid PDF file.`);
      }

      if (Date.now() - startTime > MAX_PROCESSING_TIME) {
        throw new Error("Processing timeout exceeded");
      }
    }

    // Save with optimized settings based on file size
    const mergedPdfBytes = await mergedPdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: config.objectsPerTick
    });

    if (!mergedPdfBytes || mergedPdfBytes.length === 0) {
      throw new Error("Failed to generate merged PDF");
    }

    // Cache result with size information
    pdfCache.set(cacheKey, {
      data: mergedPdfBytes,
      timestamp: Date.now(),
      size: mergedPdfBytes.length
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