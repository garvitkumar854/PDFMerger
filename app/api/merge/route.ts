import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { Readable } from 'stream';
import { validatePDF } from '@/lib/utils/pdf-validation';

// Server-side constants
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const MEMORY_BUFFER = 0.8; // Use 80% of available memory
const MIN_CHUNK_SIZE = 512 * 1024; // 512KB

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

// Helper function to process PDF chunks with memory management
const processPDFChunks = async (chunks: ArrayBuffer[], deviceType: string) => {
  const mergedPdf = await PDFDocument.create();
  const chunkSize = getOptimalChunkSize(
    chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
    deviceType
  );

  for (let i = 0; i < chunks.length; i++) {
    try {
      const chunk = chunks[i];
      const pdfDoc = await PDFDocument.load(chunk, { ignoreEncryption: true });
      
      // Copy pages in smaller batches for better memory management
      const pageCount = pdfDoc.getPageCount();
      for (let j = 0; j < pageCount; j += 10) {
        const pageIndices = Array.from(
          { length: Math.min(10, pageCount - j) },
          (_, k) => j + k
        );
        const pages = await mergedPdf.copyPages(pdfDoc, pageIndices);
        pages.forEach(page => mergedPdf.addPage(page));
        
        // Force garbage collection if available
        if (global.gc) {
          try {
            global.gc();
          } catch (e) {
            console.warn('Failed to force garbage collection');
          }
        }
      }
    } catch (error) {
      console.error(`Error processing chunk ${i}:`, error);
      throw new Error(`Failed to process PDF chunk ${i}`);
    }
  }

  return mergedPdf;
};

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let retryCount = 0; // Declare retryCount at the function scope
  
  try {
    const formData = await request.formData();
    const files = formData.getAll('files');
    const deviceType = request.headers.get('X-Device-Type') || 'desktop';
    const totalSize = parseInt(request.headers.get('X-Total-Size') || '0');
    retryCount = parseInt(request.headers.get('X-Retry-Count') || '0'); // Assign to the declared variable

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
      
      // Validate PDF structure
      try {
        await validatePDF(new Uint8Array(buffer));
      } catch (error) {
        return NextResponse.json(
          { error: 'Invalid PDF structure' },
          { status: 400 }
        );
      }

      chunks.push(buffer);
    }

    // Process PDFs with optimized memory usage
    const mergedPdf = await processPDFChunks(chunks, deviceType);
    const mergedPdfBytes = await mergedPdf.save();

    // Calculate processing time
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

    // Handle retries using the properly scoped retryCount
    if (retryCount < MAX_RETRIES) {
      return NextResponse.json(
        { error: 'Processing failed, please retry' },
        { 
          status: 500,
          headers: {
            'Retry-After': (RETRY_DELAY * Math.pow(2, retryCount)).toString()
          }
        }
      );
    }

    return NextResponse.json(
      { error: 'Failed to merge PDFs' },
      { status: 500 }
    );
  }
}

// Route segment configuration
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60; // Maximum allowed duration for hobby plan 