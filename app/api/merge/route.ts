import { NextRequest, NextResponse } from 'next/server';
import { PDFService } from '@/lib/services/pdf-service';
import { createHash } from "crypto";

// Constants for file handling
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB per file
const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB total
const MAX_PROCESSING_TIME = 300000; // 5 minutes for large files
const MAX_FILES = 20; // Maximum number of files

// Initialize PDF service
const pdfService = PDFService.getInstance();

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const requestId = createHash('sha256').update(Date.now().toString()).digest('hex').slice(0, 8);

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Operation timed out')), MAX_PROCESSING_TIME);
    });

    const result = await Promise.race([
      processRequest(request, requestId),
      timeoutPromise
    ]);

    return result;
  } catch (error) {
    console.error(`[${requestId}] PDF merge error:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to merge PDFs' },
      { status: error instanceof Error && error.message === 'Operation timed out' ? 408 : 500 }
    );
  }
}

async function processRequest(request: NextRequest, requestId: string): Promise<NextResponse> {
  const startTime = Date.now();

  if (!request.headers.get('content-type')?.includes('multipart/form-data')) {
    return NextResponse.json(
      { error: 'Invalid request format. Must be multipart/form-data.' },
      { status: 400 }
    );
  }

  const formData = await request.formData();
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

  try {
    console.log(`[${requestId}] Starting merge of ${files.length} files, total size: ${(totalSize / (1024 * 1024)).toFixed(2)}MB`);

    // Convert files to array buffers
    const buffers: ArrayBuffer[] = [];
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      
      // Validate each PDF
      const validation = await pdfService.validatePDF(buffer);
      if (!validation.isValid) {
        throw new Error(`Invalid PDF file "${file.name}": ${validation.error}`);
      }

      buffers.push(buffer);
    }

    // Process PDFs with optimizations
    const mergedPdfBytes = await pdfService.processPDFs(buffers, {
      compress: true,
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
        'Cache-Control': 'no-cache',
        'Content-Length': mergedPdfBytes.byteLength.toString(),
        'X-Processing-Time': processingTime.toString(),
        'X-Estimated-Size': mergedPdfBytes.byteLength.toString()
      },
    });
  } catch (error) {
    console.error(`[${requestId}] Error processing files:`, error);
    return NextResponse.json(
      { error: 'Failed to process PDFs. Please ensure all files are valid PDFs.' },
      { status: 500 }
    );
  } finally {
    // Cleanup resources
    if (global.gc) {
      global.gc();
    }
  }
}

// Route segment configuration
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300; // 5 minutes for large files 