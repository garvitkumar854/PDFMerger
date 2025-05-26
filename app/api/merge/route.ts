import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { Readable } from 'stream';
import { validatePDF, isPDFCorrupted, estimatePDFMemoryUsage } from '@/lib/utils/pdf-validation';
import pLimit from 'p-limit';
import { chunk } from 'lodash';

// Server-side constants with optimized values
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const MEMORY_BUFFER = 0.7;
const MAX_CONCURRENT_OPERATIONS = 12;
const CHUNK_SIZE = 8;
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB total
const SMALL_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB
const SKIP_SANITIZATION_THRESHOLD = 10 * 1024 * 1024; // 10MB
const LARGE_FILE_PARSE_SPEED = 1500;
const SMALL_FILE_PARSE_SPEED = 4000;

// Route configuration
export const runtime = 'nodejs';
export const preferredRegion = ['fra1'];
export const maxDuration = 300;
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

  // Progress tracking constants
  const VALIDATION_WEIGHT = 0.1; // 10% for initial validation
  const LOADING_WEIGHT = 0.2;    // 20% for loading
  const MERGING_WEIGHT = 0.6;    // 60% for merging
  const SAVING_WEIGHT = 0.1;     // 10% for saving

  // Update progress with weighted calculation
  const updateProgress = (phase: 'validation' | 'loading' | 'merging' | 'saving', phaseProgress: number) => {
    let weightedProgress = 0;
    switch (phase) {
      case 'validation':
        weightedProgress = phaseProgress * VALIDATION_WEIGHT;
        break;
      case 'loading':
        weightedProgress = VALIDATION_WEIGHT + (phaseProgress * LOADING_WEIGHT);
        break;
      case 'merging':
        weightedProgress = (VALIDATION_WEIGHT + LOADING_WEIGHT) + (phaseProgress * MERGING_WEIGHT);
        break;
      case 'saving':
        weightedProgress = (VALIDATION_WEIGHT + LOADING_WEIGHT + MERGING_WEIGHT) + (phaseProgress * SAVING_WEIGHT);
        break;
    }
    currentProgress = Math.min(Math.round(weightedProgress * 100), 99);
  };

  // Optimize PDF loading options based on file sizes
  const loadOptions = {
    ignoreEncryption: true,
    updateMetadata: false,
    throwOnInvalidObject: false,
    parseSpeed: avgFileSize < SMALL_FILE_THRESHOLD ? SMALL_FILE_PARSE_SPEED : LARGE_FILE_PARSE_SPEED
  };

  // Initial validation phase
  for (let i = 0; i < chunks.length; i++) {
    updateProgress('validation', (i + 1) / chunks.length);
    await validatePDF(new Uint8Array(chunks[i]));
  }

  // Create worker pool for parallel processing with dynamic concurrency
  const concurrentOps = Math.min(
    MAX_CONCURRENT_OPERATIONS,
    Math.ceil(chunks.length / 2)
  );
  const limit = pLimit(concurrentOps);
  
  // Process files in optimized chunks
  const fileChunks = chunk(chunks, CHUNK_SIZE);
  const processedChunks: PDFDocument[] = [];

  // First pass: Load and count pages
  const loadedDocs = await Promise.all(
    chunks.map(async (pdfBuffer, index) => {
      const doc = await PDFDocument.load(pdfBuffer, loadOptions);
      totalPages += doc.getPageCount();
      updateProgress('loading', (index + 1) / chunks.length);
      return doc;
    })
  );

  // Second pass: Merge documents with page-based progress
  for (const [chunkIndex, currentChunk] of fileChunks.entries()) {
    if (signal.aborted) throw new Error('Operation cancelled');

    // Process chunk of files in parallel with optimized memory management
    const chunkResults = await Promise.all(
      currentChunk.map((pdfBuffer: ArrayBuffer, index: number) =>
        limit(async () => {
          try {
            const pdfDoc = loadedDocs[chunkIndex * CHUNK_SIZE + index];
            const pageIndices = pdfDoc.getPageIndices();

            // Batch copy pages for better performance
            const pages = await mergedPdf.copyPages(pdfDoc, pageIndices);
            pages.forEach(page => {
              mergedPdf.addPage(page);
              processedPages++;
              updateProgress('merging', processedPages / totalPages);
            });

            processedFiles++;

            // Clean up document after processing
            if (!isSmallMerge) {
              (pdfDoc as any).context.trailerInfo = null;
              (pdfDoc as any).catalog = null;
            }

            return currentProgress;
          } catch (error) {
            console.error(`Error processing file in chunk ${chunkIndex}:`, error);
            throw error;
          }
        })
      )
    );

    // Force garbage collection between chunks for large merges
    if (global.gc && !isSmallMerge && chunkIndex % 2 === 1) {
      try {
        global.gc();
      } catch (e) {}
    }
  }

  // Optimize save options based on merge size
  const saveOptions = {
    useObjectStreams: !isSmallMerge,
    addDefaultPage: false,
    objectsPerTick: isSmallMerge ? 1000 : 500,
    updateMetadata: false
  };

  console.log('[PDF Merge] Saving merged PDF...');
  updateProgress('saving', 0.5); // 50% through saving phase
  const mergedPdfBytes = await mergedPdf.save(saveOptions);
  updateProgress('saving', 1); // 100% complete

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
  }, 270000); // 4.5 minutes to ensure we stay within Vercel's 5-minute limit

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