import { NextRequest, NextResponse } from 'next/server';
import { PDFService } from '@/lib/services/pdf-service';
import { createHash } from "crypto";

// Constants for file handling
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB per file
const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB total
const MAX_PROCESSING_TIME = 55000; // 55 seconds to allow for cleanup
const MAX_FILES = 20; // Maximum number of files
const MIN_FILE_SIZE = 100; // 100 bytes minimum

// Initialize PDF service
const pdfService = PDFService.getInstance();

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const requestId = createHash('sha256').update(Date.now().toString()).digest('hex').slice(0, 8);

  console.log(`[${requestId}] Starting new merge request`);

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Operation timed out')), MAX_PROCESSING_TIME);
    });

    const result = await Promise.race([
      processRequest(request, requestId),
      timeoutPromise
    ]);

    console.log(`[${requestId}] Request completed successfully in ${(Date.now() - startTime) / 1000}s`);
    return result;
  } catch (error) {
    console.error(`[${requestId}] PDF merge error:`, error);
    
    let statusCode = 500;
    let errorMessage = 'Failed to merge PDFs';

    if (error instanceof Error) {
      if (error.message === 'Operation timed out') {
        statusCode = 408;
        errorMessage = 'Processing took too long. Try with fewer or smaller files.';
      } else if (error.message.includes('memory')) {
        statusCode = 413;
        errorMessage = 'Files too large to process. Try with smaller files.';
      } else {
        errorMessage = error.message;
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}

async function processRequest(request: NextRequest, requestId: string): Promise<NextResponse> {
  const startTime = Date.now();

  if (!request.headers.get('content-type')?.includes('multipart/form-data')) {
    console.error(`[${requestId}] Invalid content type:`, request.headers.get('content-type'));
    return NextResponse.json(
      { error: 'Invalid request format. Must be multipart/form-data.' },
      { status: 400 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error(`[${requestId}] Failed to parse form data:`, error);
    return NextResponse.json(
      { error: 'Failed to parse request data. Please try again.' },
      { status: 400 }
    );
  }

  const files = formData.getAll('files') as File[];

  // Basic validation
  if (!files?.length) {
    return NextResponse.json(
      { error: 'No PDF files provided.' },
      { status: 400 }
    );
  }

  if (files.length === 1) {
    return NextResponse.json(
      { error: 'Please provide at least 2 PDF files to merge.' },
      { status: 400 }
    );
  }

  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_FILES} files allowed.` },
      { status: 400 }
    );
  }

  // Size validation
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  console.log(`[${requestId}] Total size: ${(totalSize / (1024 * 1024)).toFixed(2)}MB`);

  if (totalSize > MAX_TOTAL_SIZE) {
    return NextResponse.json(
      { error: `Total size exceeds ${MAX_TOTAL_SIZE / (1024 * 1024)}MB limit.` },
      { status: 400 }
    );
  }

  const oversizedFile = files.find(file => file.size > MAX_FILE_SIZE);
  if (oversizedFile) {
    return NextResponse.json(
      { error: `File "${oversizedFile.name}" exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit.` },
      { status: 400 }
    );
  }

  const tooSmallFile = files.find(file => file.size < MIN_FILE_SIZE);
  if (tooSmallFile) {
    return NextResponse.json(
      { error: `File "${tooSmallFile.name}" is too small to be a valid PDF.` },
      { status: 400 }
    );
  }

  try {
    console.log(`[${requestId}] Starting merge of ${files.length} files`);

    // Convert files to array buffers with progress tracking
    const buffers: ArrayBuffer[] = [];
    for (const [index, file] of files.entries()) {
      console.log(`[${requestId}] Processing file ${index + 1}/${files.length}: ${file.name}`);
      
      try {
        const buffer = await file.arrayBuffer();
        
        // Validate each PDF
        console.log(`[${requestId}] Validating ${file.name}`);
        const validation = await pdfService.validatePDF(buffer);
        if (!validation.isValid) {
          throw new Error(`Invalid PDF file "${file.name}": ${validation.error}`);
        }

        console.log(`[${requestId}] ${file.name} validated successfully`);
        buffers.push(buffer);
      } catch (error) {
        console.error(`[${requestId}] Error processing ${file.name}:`, error);
        throw new Error(`Failed to process "${file.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Process PDFs with optimizations
    console.log(`[${requestId}] Starting PDF merge process`);
    const mergedPdfBytes = await pdfService.processPDFs(buffers, {
      optimizeImages: true,
      removeMetadata: true,
      maxQuality: 0.92
    });

    const processingTime = (Date.now() - startTime) / 1000;
    console.log(`[${requestId}] Merge completed in ${processingTime.toFixed(2)}s`);

    // Return with appropriate headers for streaming
    return new NextResponse(mergedPdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=merged.pdf',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Content-Length': mergedPdfBytes.byteLength.toString(),
        'X-Processing-Time': processingTime.toString(),
        'X-Estimated-Size': mergedPdfBytes.byteLength.toString(),
        'X-Request-ID': requestId
      },
    });
  } catch (error) {
    console.error(`[${requestId}] Error processing files:`, error);
    throw error; // Let the outer handler deal with the error
  } finally {
    // Cleanup resources
    try {
      if (global.gc) {
        global.gc();
      }
    } catch (error) {
      console.warn(`[${requestId}] Failed to run garbage collection:`, error);
    }
  }
}

// Route segment configuration
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60; // Maximum allowed duration for hobby plan 