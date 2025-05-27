import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { Readable } from 'stream';
import { validatePDF, isPDFCorrupted, estimatePDFMemoryUsage } from '@/lib/utils/pdf-validation';
import pLimit from 'p-limit';
import { chunk } from 'lodash';

// Optimized server-side constants
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const MEMORY_BUFFER = 0.65; // Reduced from 0.7 for more concurrent operations
const MAX_CONCURRENT_OPERATIONS = 24; // Increased from 16 for better parallelization
const CHUNK_SIZE = 16; // Increased from 12 for better throughput
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB total
const SMALL_FILE_THRESHOLD = 20 * 1024 * 1024; // Increased from 15MB
const SKIP_SANITIZATION_THRESHOLD = 20 * 1024 * 1024; // Increased from 15MB
const LARGE_FILE_PARSE_SPEED = 3000; // Increased from 2000
const SMALL_FILE_PARSE_SPEED = 6000; // Increased from 5000

// Route configuration
export const runtime = 'nodejs';
export const preferredRegion = ['iad1'];
export const maxDuration = 59;
export const dynamic = 'force-dynamic';

// Helper function to validate file size
const validateFileSize = (size: number, fileIndex: number) => {
  if (size > MAX_FILE_SIZE) {
    throw new Error(`File ${fileIndex + 1} exceeds maximum size limit of 200MB`);
  }
};

// Optimized PDF sanitization with caching
const sanitizePDFBuffer = async (buffer: ArrayBuffer): Promise<Uint8Array> => {
  try {
    const pdfDoc = await PDFDocument.load(buffer, { 
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false
    });
    
    const pages = pdfDoc.getPages();
    await Promise.all(pages.map(async (page) => {
      try {
        const contents = page.node.Contents();
        if (contents) {
          page.drawText('', { x: 0, y: 0, size: 0 });
        }
      } catch (e) {
        console.warn('Error cleaning page:', e);
      }
    }));

    return await pdfDoc.save({
      addDefaultPage: false,
      useObjectStreams: true,
      objectsPerTick: 100
    });
  } catch (e) {
    console.error('Error sanitizing PDF:', e);
    throw new Error('Invalid PDF structure');
  }
};

// Process PDFs with optimized settings and enhanced progress tracking
const processPDFChunks = async (
  chunks: ArrayBuffer[],
  signal: AbortSignal
): Promise<{ data: Uint8Array; progress: number }> => {
  console.log(`[PDF Merge] Starting merge process with ${chunks.length} files`);
  const mergedPdf = await PDFDocument.create();
  let processedFiles = 0;
  let processedPages = 0;
  let totalPages = 0;
  let currentProgress = 0;
  const startTime = Date.now();

  // Calculate total size for optimization decisions
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const isSmallMerge = totalSize <= SMALL_FILE_THRESHOLD * chunks.length;
  const avgFileSize = totalSize / chunks.length;

  // Dynamic concurrency based on file sizes and count
  const concurrentOps = Math.min(
    MAX_CONCURRENT_OPERATIONS,
    Math.max(8, Math.ceil(chunks.length / 2))
  );
  const limit = pLimit(concurrentOps);

  // Optimize batch size based on file characteristics
  const batchSize = Math.min(
    8,
    Math.max(4, Math.ceil(chunks.length / (avgFileSize > SMALL_FILE_THRESHOLD ? 2 : 4)))
  );

  // Load PDFs in parallel with optimized settings
  const loadOptions = {
    ignoreEncryption: true,
    updateMetadata: false,
    throwOnInvalidObject: false,
    parseSpeed: avgFileSize < SMALL_FILE_THRESHOLD ? SMALL_FILE_PARSE_SPEED : LARGE_FILE_PARSE_SPEED
  };

  // Process files in optimized chunks with parallel loading
  const loadedDocs: PDFDocument[] = [];
  
  // Load PDFs in parallel with dynamic batch sizing
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const batchDocs = await Promise.all(
      batch.map(async (pdfBuffer) => {
        const doc = await PDFDocument.load(pdfBuffer, loadOptions);
        totalPages += doc.getPageCount();
        return doc;
      })
    );
    loadedDocs.push(...batchDocs);
    
    // Update progress for loading phase (0-30%)
    currentProgress = Math.min(30, Math.round((i / chunks.length) * 30));
  }

  // Process pages in parallel with optimized batching
  const pagePromises: Promise<void>[] = [];
  for (const doc of loadedDocs) {
    const pageCount = doc.getPageCount();
    const pageIndices = doc.getPageIndices();
    
    // Dynamic page batch size based on total pages
    const pageBatchSize = Math.min(
      20,
      Math.max(10, Math.ceil(pageCount / (concurrentOps / 2)))
    );

    for (let i = 0; i < pageCount; i += pageBatchSize) {
      const batchIndices = pageIndices.slice(i, i + pageBatchSize);
      pagePromises.push(
        limit(async () => {
          const pages = await mergedPdf.copyPages(doc, batchIndices);
          pages.forEach(page => {
            mergedPdf.addPage(page);
            processedPages++;
            
            // Update progress for merging phase (30-90%)
            currentProgress = 30 + Math.min(60, Math.round((processedPages / totalPages) * 60));
          });
          processedFiles++;
        })
      );
    }

    // Aggressive cleanup for large documents
    if (!isSmallMerge) {
      (doc as any).context.trailerInfo = null;
      (doc as any).catalog = null;
    }
  }

  // Wait for all page processing to complete
  await Promise.all(pagePromises);

  // Optimize save options based on merge size and file count
  const saveOptions = {
    useObjectStreams: !isSmallMerge,
    addDefaultPage: false,
    objectsPerTick: isSmallMerge ? 3000 : 2000, // Increased values
    updateMetadata: false
  };

  console.log('[PDF Merge] Saving merged PDF...');
  const mergedPdfBytes = await mergedPdf.save(saveOptions);

  const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[PDF Merge] Merge completed in ${processingTime}s`);
  
  return { data: mergedPdfBytes, progress: 100 };
};

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const controller = new AbortController();
  const { signal } = controller;
  let retryCount = 0;

  // Set timeout for the entire operation
  const timeout = setTimeout(() => {
    controller.abort();
  }, 55000); // 55 seconds to ensure we stay within Vercel's 60-second limit

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

    // Process and validate files
    const chunks: ArrayBuffer[] = [];
    for (const file of files) {
      if (!(file instanceof Blob)) {
        return NextResponse.json(
          { error: 'Invalid file format' },
          { status: 400 }
        );
      }

      try {
        validateFileSize(file.size, chunks.length);
        const buffer = await file.arrayBuffer();
        
        await validatePDF(new Uint8Array(buffer));
        if (await isPDFCorrupted(new Uint8Array(buffer))) {
          return NextResponse.json(
            { error: `File ${chunks.length + 1} appears to be corrupted` },
            { status: 400 }
          );
        }

        chunks.push(buffer);
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : `Error processing file ${chunks.length + 1}` },
          { status: 400 }
        );
      }
    }

    // Process PDFs with optimized settings
    const { data: mergedPdfBytes, progress } = await processPDFChunks(chunks, signal);
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[PDF Merge] Merge completed in ${processingTime}s`);

    // Stream the response
    const stream = new Readable();
    stream.push(Buffer.from(mergedPdfBytes));
    stream.push(null);

    const response = new NextResponse(stream as any);
    response.headers.set('Content-Type', 'application/pdf');
    response.headers.set('Content-Length', mergedPdfBytes.length.toString());
    response.headers.set('X-Processing-Time', processingTime);
    response.headers.set('X-Progress', progress.toString());
    response.headers.set('Cache-Control', 'no-store');
    
    return response;
  } catch (error) {
    console.error('[PDF Merge] Error:', error);
    
    if (signal.aborted) {
      return NextResponse.json(
        { error: 'Operation timed out' },
        { status: 408 }
      );
    }
    
    // Handle retries
    if (retryCount < MAX_RETRIES) {
      return NextResponse.json(
        { error: 'Temporary error, please retry', retryAfter: RETRY_DELAY },
        { status: 503 }
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