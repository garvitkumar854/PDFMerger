import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { WorkerPool } from "../utils/workerPool";
import { createHash } from "crypto";
import { headers } from 'next/headers';
import { performanceMonitor } from "../monitoring";

// Constants
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB
const MAX_PROCESSING_TIME = 300000; // 5 minutes
const SMALL_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB
const MEDIUM_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks for streaming

// Enhanced PDF validation with more robust checks
const validatePDF = async (buffer: ArrayBuffer): Promise<{ isValid: boolean; error?: string }> => {
  try {
    // Check for absolute minimum file size (even smallest valid PDF should be at least 67 bytes)
    if (buffer.byteLength < 67) {
      return { isValid: false, error: 'File is too small to be a valid PDF (minimum 67 bytes)' };
    }

    // Get the first 1024 bytes to search for PDF header
    const headerBuffer = new Uint8Array(buffer.slice(0, Math.min(1024, buffer.byteLength)));
    const headerString = new TextDecoder().decode(headerBuffer);

    // Check for PDF signature anywhere in the first 1024 bytes
    // Some PDFs might have extra bytes before the header
    if (!headerString.includes('%PDF-')) {
      // Try checking for binary PDF signature as fallback
      const hasBinarySignature = headerBuffer.some((byte, index, array) => {
        if (index > array.length - 5) return false;
        return (
          array[index] === 0x25 && // %
          array[index + 1] === 0x50 && // P
          array[index + 2] === 0x44 && // D
          array[index + 3] === 0x46 && // F
          array[index + 4] === 0x2D // -
        );
      });

      if (!hasBinarySignature) {
        return { isValid: false, error: 'Invalid PDF header: Missing PDF signature' };
      }
    }

    // Try to load and parse the PDF with different options
    let pdfDoc;
    try {
      // First attempt with standard options
      pdfDoc = await PDFDocument.load(buffer, {
        updateMetadata: false,
        ignoreEncryption: true,
        throwOnInvalidObject: false
      });
    } catch (e) {
      // Second attempt with more lenient options
      try {
        pdfDoc = await PDFDocument.load(buffer, {
          updateMetadata: false,
          ignoreEncryption: true,
          throwOnInvalidObject: false,
          parseSpeed: 100,
          capNumbers: true
        });
      } catch (e2) {
        return { 
          isValid: false, 
          error: `Failed to parse PDF: ${e2 instanceof Error ? e2.message.replace('Error: ', '') : 'Invalid PDF structure'}`
        };
      }
    }

    // Additional validations
    if (!pdfDoc) {
      return { isValid: false, error: 'Failed to load PDF document' };
    }

    const pageCount = pdfDoc.getPageCount();
    if (pageCount === 0) {
      return { isValid: false, error: 'PDF has no pages' };
    }

    // Check for corrupted objects
    try {
      const pages = pdfDoc.getPages();
      await Promise.all(pages.map(async (page) => {
        // Try to access basic page properties to verify integrity
        const { width, height } = page.getSize();
        if (!width || !height || width <= 0 || height <= 0) {
          throw new Error('Invalid page dimensions');
        }
      }));
    } catch (e) {
      return { 
        isValid: false, 
        error: 'PDF contains corrupted pages or objects' 
      };
    }

    return { isValid: true };
  } catch (error) {
    return { 
      isValid: false, 
      error: error instanceof Error ? 
        error.message.replace(/Error: /g, '') : 
        'Invalid PDF structure'
    };
  }
};

// Initialize worker pool with monitoring
const workerPool = new WorkerPool();

// Enhanced monitoring
workerPool.on('metrics', (metrics) => {
  performanceMonitor.trackRequest(metrics.averageWaitTime);
});

// Enhanced error handling
const createErrorResponse = (error: string, status: number = 400) => {
  performanceMonitor.trackRequest(0, true);
  return NextResponse.json(
    { error },
    { status, headers: { 'Content-Type': 'application/json' } }
  );
};

export async function POST(request: Request) {
  const startTime = Date.now();
  const requestId = createHash('sha256').update(Date.now().toString()).digest('hex').slice(0, 8);
  let timeoutId: NodeJS.Timeout | undefined;
  let abortController: AbortController | undefined;

  try {
    // Request validation with timeout handling
    abortController = new AbortController();
    timeoutId = setTimeout(() => {
      abortController?.abort();
      throw new Error("Request timeout exceeded");
    }, MAX_PROCESSING_TIME);

    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("multipart/form-data")) {
      return createErrorResponse("Content type must be multipart/form-data");
    }

    const userAgent = request.headers.get('user-agent') || 'Unknown';
    console.log(`[${requestId}] Processing request from ${userAgent}`);

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length < 2) {
      return createErrorResponse("At least two PDF files are required");
    }

    if (files.length > 10) {
      return createErrorResponse("Maximum 10 files allowed");
    }

    console.log(`[${requestId}] Processing ${files.length} files`);

    // Validate and process files
    const processedFiles: { buffer: ArrayBuffer; name: string }[] = [];
    let totalSize = 0;

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return createErrorResponse(`File ${file.name} exceeds maximum size of 100MB`);
      }

      totalSize += file.size;
      if (totalSize > MAX_TOTAL_SIZE) {
        return createErrorResponse("Total file size exceeds 200MB limit");
      }

      const buffer = await file.arrayBuffer();
      const validation = await validatePDF(buffer);
      
      if (!validation.isValid) {
        return createErrorResponse(`Invalid PDF file (${file.name}): ${validation.error}`);
      }

      processedFiles.push({ buffer, name: file.name });
    }

    // Create and optimize the merged PDF
    const mergedPdf = await PDFDocument.create();
    
    // Process PDFs in sequence to maintain order
    for (const { buffer, name } of processedFiles) {
      try {
        const pdfDoc = await PDFDocument.load(buffer, { 
          ignoreEncryption: true,
          updateMetadata: false,
          throwOnInvalidObject: false
        });

        const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
        pages.forEach(page => mergedPdf.addPage(page));

        console.log(`[${requestId}] Processed ${name}: ${pages.length} pages`);
      } catch (error) {
        console.error(`[${requestId}] Error processing ${name}:`, error);
        return createErrorResponse(`Failed to process ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      if (Date.now() - startTime > MAX_PROCESSING_TIME) {
        throw new Error("Processing timeout exceeded");
      }
    }

    // Save with optimized settings
    const mergedPdfBytes = await mergedPdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: Math.min(50, Math.ceil(mergedPdf.getPageCount() / 2))
    });

    const duration = Date.now() - startTime;
    performanceMonitor.trackRequest(duration);

    console.log(`[${requestId}] Successfully merged ${files.length} files in ${duration}ms`);
    
    // Return optimized streaming response
    return new NextResponse(mergedPdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="merged-${new Date().toISOString().slice(0, 10)}.pdf"`,
        'Content-Length': mergedPdfBytes.length.toString(),
        'Cache-Control': 'no-store'
      }
    });

  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to merge PDFs',
      error instanceof Error && error.message.includes('timeout') ? 408 : 500
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (abortController) abortController.abort();
  }
} 