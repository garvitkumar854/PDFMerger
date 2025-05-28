import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { Readable } from 'stream';
import { validatePDF, isPDFCorrupted } from '@/lib/utils/pdf-validation';
import { PDFService } from '@/lib/services/pdf-service';
import pLimit from 'p-limit';

// Optimized server-side constants
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const MAX_CONCURRENT_OPERATIONS = 8;
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB total
const SMALL_FILE_THRESHOLD = 20 * 1024 * 1024;

// Configure runtime
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Validate file size
function validateFileSize(size: number, index: number): void {
  if (size > MAX_FILE_SIZE) {
    throw new Error(`File ${index + 1} exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const controller = new AbortController();
  const { signal } = controller;
  let retryCount = 0;

  // Set timeout for the entire operation
  const timeout = setTimeout(() => {
    controller.abort();
  }, 280000); // 280 seconds to ensure we stay within the 300-second limit

  try {
    console.log('[PDF Merge] Starting new merge request');
    const formData = await request.formData();
    const files = formData.getAll('files');
    const deviceType = request.headers.get('X-Device-Type') || 'desktop';
    const totalSize = parseInt(request.headers.get('X-Total-Size') || '0');
    retryCount = parseInt(request.headers.get('X-Retry-Count') || '0');

    console.log(`[PDF Merge] Request details: Device=${deviceType}, Files=${files.length}, TotalSize=${totalSize}bytes`);

    // Validate request
    if (!files.length) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    if (files.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 PDF files are required' },
        { status: 400 }
      );
    }

    if (totalSize > MAX_TOTAL_SIZE) {
      return NextResponse.json(
        { error: 'Total file size exceeds 200MB limit' },
        { status: 400 }
      );
    }

    // Process files in parallel with optimized validation
    const limit = pLimit(MAX_CONCURRENT_OPERATIONS);
    const buffers: ArrayBuffer[] = [];
    
    await Promise.all(
      files.map((file, index) => 
        limit(async () => {
          if (!(file instanceof Blob)) {
            throw new Error('Invalid file format');
          }

          validateFileSize(file.size, index);
          const buffer = await file.arrayBuffer();
          
          // Run validations in parallel
          const [validationResult, corruptionCheck] = await Promise.all([
            validatePDF(new Uint8Array(buffer)),
            isPDFCorrupted(new Uint8Array(buffer))
          ]);

          if (!validationResult.isValid) {
            throw new Error(`File ${index + 1} is not a valid PDF`);
          }

          if (corruptionCheck) {
            throw new Error(`File ${index + 1} appears to be corrupted`);
          }

          buffers[index] = buffer;
        })
      )
    );

    // Get PDF service instance
    const pdfService = PDFService.getInstance();

    // Process PDFs with optimized settings
    const mergedPdfBytes = await pdfService.processPDFs(buffers, {
      optimizeImages: true,
      useObjectStreams: totalSize > SMALL_FILE_THRESHOLD
    });

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[PDF Merge] Merge completed in ${processingTime}s`);

    // Stream the response with optimized settings
    const stream = new Readable();
    stream.push(Buffer.from(mergedPdfBytes));
    stream.push(null);

    const response = new NextResponse(stream as any);
    response.headers.set('Content-Type', 'application/pdf');
    response.headers.set('Content-Length', mergedPdfBytes.length.toString());
    response.headers.set('X-Processing-Time', processingTime);
    response.headers.set('Cache-Control', 'no-store');
    
    return response;

  } catch (error) {
    console.error('[PDF Merge] Error:', error);

    // Handle retries for specific errors
    if (
      retryCount < MAX_RETRIES && 
      error instanceof Error && 
      (error.message.includes('timeout') || error.message.includes('memory'))
    ) {
      return NextResponse.json(
        { error: 'Processing error, please retry' },
        { 
          status: 503,
          headers: {
            'Retry-After': (RETRY_DELAY * Math.pow(2, retryCount)).toString()
          }
        }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to merge PDFs' },
      { status: 500 }
    );

  } finally {
    clearTimeout(timeout);
  }
} 