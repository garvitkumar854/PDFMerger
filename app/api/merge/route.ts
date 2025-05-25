import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { WorkerPool } from "../utils/workerPool";
import { createHash } from "crypto";
import { headers } from 'next/headers';
import { performanceMonitor } from "../monitoring";

// Constants
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB
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

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = createHash('sha256').update(Date.now().toString()).digest('hex').slice(0, 8);
  let timeoutId: NodeJS.Timeout | undefined;
  let abortController: AbortController | undefined;

  try {
    // Check if the request is multipart/form-data
    if (!request.headers.get('content-type')?.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Invalid request format. Must be multipart/form-data.' },
        { status: 400 }
      );
    }

    // Get form data
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    // Validate files
    if (!files || files.length === 0) {
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

    // Check total size
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      return NextResponse.json(
        { error: `Total file size exceeds ${MAX_TOTAL_SIZE / (1024 * 1024)}MB limit.` },
        { status: 400 }
      );
    }

    // Create a new PDF document
    const mergedPdf = await PDFDocument.create();

    // Process each file
    for (const file of files) {
      try {
        // Read file as ArrayBuffer
        const buffer = await file.arrayBuffer();
        
        // Load the PDF document
        const pdf = await PDFDocument.load(buffer, {
          ignoreEncryption: true,
          updateMetadata: false,
          throwOnInvalidObject: false
        });

        // Copy all pages
        const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        pages.forEach(page => mergedPdf.addPage(page));

      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        return NextResponse.json(
          { error: `Failed to process file ${file.name}. Please ensure it's a valid PDF.` },
          { status: 400 }
        );
      }
    }

    // Save the merged PDF with optimized settings
    const mergedPdfBytes = await mergedPdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 50,
      updateFieldAppearances: false
    });

    // Return the merged PDF
    return new NextResponse(mergedPdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=merged.pdf',
        'Cache-Control': 'no-cache',
        'Content-Length': mergedPdfBytes.length.toString()
      },
    });

  } catch (error) {
    console.error('PDF merge error:', error);
    return NextResponse.json(
      { error: 'Failed to merge PDFs. Please try again.' },
      { status: 500 }
    );
  }
}

// Replace the old config export with the new route segment config
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60; 