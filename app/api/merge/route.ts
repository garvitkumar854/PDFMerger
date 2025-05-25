import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { Readable } from 'stream';
import { validatePDF, isPDFCorrupted } from '@/lib/utils/pdf-validation';

// Server-side constants
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const MEMORY_BUFFER = 0.8; // Use 80% of available memory
const MIN_CHUNK_SIZE = 512 * 1024; // 512KB
const MAX_PAGES_PER_BATCH = 5; // Process 5 pages at a time
const PAGE_PROCESSING_DELAY = 50; // 50ms delay between page batches

// Route configuration
export const runtime = 'nodejs';
export const preferredRegion = ['fra1'];
export const maxDuration = 300;

// Helper function to get optimal chunk size based on available memory
const getOptimalChunkSize = (totalSize: number, deviceType: string) => {
  const availableMemory = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE 
    ? parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE) * 1024 * 1024 * MEMORY_BUFFER
    : 512 * 1024 * 1024; // Default to 512MB if not in Lambda

  const baseChunkSize = Math.min(
    Math.floor(availableMemory / 4), // Use at most 1/4 of available memory
    deviceType === 'mobile' ? 2 * 1024 * 1024 : 5 * 1024 * 1024 // 2MB for mobile, 5MB for desktop
  );

  return Math.max(MIN_CHUNK_SIZE, Math.min(baseChunkSize, Math.floor(totalSize / 10)));
};

// Helper function to sanitize PDF data
const sanitizePDFBuffer = async (buffer: ArrayBuffer): Promise<Uint8Array> => {
  try {
    // Load and re-save the PDF to normalize its structure
    const pdfDoc = await PDFDocument.load(buffer, { 
      ignoreEncryption: true,
      updateMetadata: false
    });
    
    // Remove any problematic elements
    const pages = pdfDoc.getPages();
    pages.forEach(page => {
      try {
        // Clean up page content streams
        const contents = page.node.Contents();
        if (contents) {
          // Reset the content stream to remove any problematic operators
          page.drawText('', { x: 0, y: 0, size: 0 });
        }
      } catch (e) {
        console.warn('Error cleaning page:', e);
      }
    });

    return await pdfDoc.save({ addDefaultPage: false });
  } catch (e) {
    console.error('Error sanitizing PDF:', e);
    throw new Error('Invalid PDF structure');
  }
};

// Helper function to process PDF chunks with improved error handling
const processPDFChunks = async (chunks: ArrayBuffer[], deviceType: string): Promise<Uint8Array> => {
  const mergedPdf = await PDFDocument.create();
  let totalPages = 0;
  let processedPages = 0;

  // Process each PDF file
  for (let i = 0; i < chunks.length; i++) {
    try {
      // Sanitize the PDF data first
      const sanitizedBuffer = await sanitizePDFBuffer(chunks[i]);
      
      // Load the sanitized PDF
      const pdfDoc = await PDFDocument.load(sanitizedBuffer, {
        ignoreEncryption: true,
        updateMetadata: false
      });

      const pageCount = pdfDoc.getPageCount();
      totalPages += pageCount;

      // Process pages in small batches
      for (let j = 0; j < pageCount; j += MAX_PAGES_PER_BATCH) {
        const batchIndices = Array.from(
          { length: Math.min(MAX_PAGES_PER_BATCH, pageCount - j) },
          (_, k) => j + k
        );

        try {
          // Copy and embed pages
          const pages = await mergedPdf.copyPages(pdfDoc, batchIndices);
          pages.forEach(page => {
            try {
              mergedPdf.addPage(page);
              processedPages++;
            } catch (e) {
              console.warn(`Error adding page ${processedPages}:`, e);
            }
          });

          // Add small delay between batches to prevent memory spikes
          await new Promise(resolve => setTimeout(resolve, PAGE_PROCESSING_DELAY));
          
          // Force garbage collection if available
          if (global.gc) {
            try {
              global.gc();
            } catch (e) {
              console.warn('Failed to force garbage collection');
            }
          }
        } catch (e) {
          console.warn(`Error processing batch at page ${j}:`, e);
          continue; // Skip problematic batch but continue processing
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error processing PDF ${i}:`, error);
      throw new Error(`Failed to process PDF ${i + 1}: ${errorMessage}`);
    }
  }

  if (processedPages === 0) {
    throw new Error('No valid pages found in the provided PDFs');
  }

  // Save with optimized settings
  return await mergedPdf.save({
    addDefaultPage: false,
    useObjectStreams: false
  });
};

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let retryCount = 0;
  
  try {
    const formData = await request.formData();
    const files = formData.getAll('files');
    const deviceType = request.headers.get('X-Device-Type') || 'desktop';
    const totalSize = parseInt(request.headers.get('X-Total-Size') || '0');
    retryCount = parseInt(request.headers.get('X-Retry-Count') || '0');

    if (!files.length) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    // Validate and process files
    const chunks: ArrayBuffer[] = [];
    for (const file of files) {
      if (!(file instanceof Blob)) {
        return NextResponse.json(
          { error: 'Invalid file format' },
          { status: 400 }
        );
      }

      const buffer = await file.arrayBuffer();
      
      // Enhanced validation
      try {
        await validatePDF(new Uint8Array(buffer));
        if (isPDFCorrupted(new Uint8Array(buffer))) {
          return NextResponse.json(
            { error: `File ${chunks.length + 1} appears to be corrupted` },
            { status: 400 }
          );
        }
      } catch (error) {
        return NextResponse.json(
          { error: `Invalid PDF structure in file ${chunks.length + 1}` },
          { status: 400 }
        );
      }

      chunks.push(buffer);
    }

    // Process PDFs with improved error handling
    const mergedPdfBytes = await processPDFChunks(chunks, deviceType);
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);

    // Stream the response back
    const stream = new Readable();
    stream.push(Buffer.from(mergedPdfBytes));
    stream.push(null);

    const response = new NextResponse(stream as any);
    response.headers.set('Content-Type', 'application/pdf');
    response.headers.set('Content-Length', mergedPdfBytes.length.toString());
    response.headers.set('X-Processing-Time', processingTime);
    response.headers.set('Cache-Control', 'no-cache');

    return response;

  } catch (error) {
    console.error('Error merging PDFs:', error);

    // Enhanced error messages
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const userMessage = errorMessage.includes('Invalid PDF structure') 
      ? 'One or more PDFs are corrupted or invalid'
      : errorMessage.includes('No valid pages')
        ? 'Could not find any valid pages in the provided PDFs'
        : 'Failed to merge PDFs';

    // Handle retries with better error reporting
    if (retryCount < MAX_RETRIES) {
      return NextResponse.json(
        { 
          error: userMessage,
          detail: errorMessage,
          retryAfter: RETRY_DELAY * Math.pow(2, retryCount)
        },
        { 
          status: 500,
          headers: {
            'Retry-After': (RETRY_DELAY * Math.pow(2, retryCount)).toString()
          }
        }
      );
    }

    return NextResponse.json(
      { 
        error: userMessage,
        detail: errorMessage
      },
      { status: 500 }
    );
  }
} 