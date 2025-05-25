import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { createHash } from "crypto";

// Constants adjusted for Vercel serverless limitations
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB per file
const MAX_TOTAL_SIZE = 45 * 1024 * 1024; // 45MB total (Vercel limit is 50MB)
const MAX_PROCESSING_TIME = 10000; // 10 seconds (Vercel has 10s timeout on hobby plan)
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
    if (!headerString.includes('%PDF-')) {
      return { isValid: false, error: 'Invalid PDF header: Missing PDF signature' };
    }

    // Try to load and parse the PDF with optimized options for serverless
    try {
      const pdfDoc = await PDFDocument.load(buffer, {
        updateMetadata: false,
        ignoreEncryption: true,
        throwOnInvalidObject: false,
        parseSpeed: 150, // Faster parsing
        capNumbers: true
      });

      if (!pdfDoc || pdfDoc.getPageCount() === 0) {
        return { isValid: false, error: 'Invalid PDF: No pages found' };
      }

      return { isValid: true };
    } catch (e) {
      return { 
        isValid: false, 
        error: `Invalid PDF: ${e instanceof Error ? e.message.replace('Error: ', '') : 'Failed to parse'}`
      };
    }
  } catch (error) {
    return { 
      isValid: false, 
      error: error instanceof Error ? 
        error.message.replace(/Error: /g, '') : 
        'Invalid PDF structure'
    };
  }
};

// Add type for the response
type APIResponse = NextResponse<Uint8Array | { error: string }>;

export async function POST(request: NextRequest): Promise<APIResponse> {
  const startTime = Date.now();
  const requestId = createHash('sha256').update(Date.now().toString()).digest('hex').slice(0, 8);

  try {
    // Set up timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Operation timed out'));
      }, MAX_PROCESSING_TIME);
    });

    // Process request with timeout
    const result = await Promise.race([
      processRequest(request),
      timeoutPromise
    ]);

    return result;
  } catch (error) {
    console.error('PDF merge error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error && error.message === 'Operation timed out'
          ? 'Operation timed out. Please try with fewer or smaller files.'
          : 'Failed to merge PDFs. Please try again.'
      },
      { status: error instanceof Error && error.message === 'Operation timed out' ? 408 : 500 }
    );
  }
}

async function processRequest(request: NextRequest): Promise<APIResponse> {
  // Check content type
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

  if (files.length > 10) {
    return NextResponse.json(
      { error: 'Maximum 10 files allowed.' },
      { status: 400 }
    );
  }

  // Check sizes
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > MAX_TOTAL_SIZE) {
    return NextResponse.json(
      { error: `Total size exceeds ${MAX_TOTAL_SIZE / (1024 * 1024)}MB limit.` },
      { status: 400 }
    );
  }

  // Check individual file sizes
  const oversizedFile = files.find(file => file.size > MAX_FILE_SIZE);
  if (oversizedFile) {
    return NextResponse.json(
      { error: `File "${oversizedFile.name}" exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit.` },
      { status: 400 }
    );
  }

  try {
    // Create a new PDF document with optimized settings
    const mergedPdf = await PDFDocument.create();
    
    // Process each file with optimized memory usage
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      
      // Validate PDF
      const validation = await validatePDF(buffer);
      if (!validation.isValid) {
        return NextResponse.json(
          { error: `Invalid PDF file "${file.name}": ${validation.error}` },
          { status: 400 }
        );
      }

      // Load and merge with optimized settings
      const pdf = await PDFDocument.load(buffer, {
        ignoreEncryption: true,
        updateMetadata: false,
        throwOnInvalidObject: false,
        parseSpeed: 150,
        capNumbers: true
      });

      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
    }

    // Save with optimized settings
    const mergedPdfBytes = await mergedPdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 100,
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
    console.error(`Error processing files:`, error);
    return NextResponse.json(
      { error: 'Failed to process PDFs. Please ensure all files are valid PDFs.' },
      { status: 500 }
    );
  }
}

// Route segment configuration optimized for Vercel
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 10; // 10 seconds for Vercel hobby plan 