import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { createHash } from "crypto";

// Constants adjusted for Vercel serverless limitations
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB per file (reduced from 25MB)
const MAX_TOTAL_SIZE = 40 * 1024 * 1024; // 40MB total (reduced from 45MB for safety)
const MAX_PROCESSING_TIME = 9000; // 9 seconds (reduced from 10s for safety margin)
const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB chunks for streaming (reduced from 5MB)
const MAX_FILES = 10; // Maximum number of files

// Enhanced PDF validation with more robust checks
const validatePDF = async (buffer: ArrayBuffer): Promise<{ isValid: boolean; error?: string }> => {
  try {
    // Memory optimization: Release buffer if too large
    if (buffer.byteLength > MAX_FILE_SIZE) {
      return { isValid: false, error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` };
    }

    // Check for absolute minimum file size
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
        throwOnInvalidObject: true, // Changed to true for stricter validation
        parseSpeed: 200, // Increased parsing speed
        capNumbers: true
      });

      if (!pdfDoc || pdfDoc.getPageCount() === 0) {
        return { isValid: false, error: 'Invalid PDF: No pages found' };
      }

      // Check for reasonable page count
      if (pdfDoc.getPageCount() > 1000) {
        return { isValid: false, error: 'PDF has too many pages (maximum 1000 pages)' };
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
    // Set up timeout with margin
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

    // Log processing time
    const processingTime = Date.now() - startTime;
    console.log(`[${requestId}] Processing completed in ${processingTime}ms`);

    return result;
  } catch (error) {
    console.error(`[${requestId}] PDF merge error:`, error);
    
    // Enhanced error messages
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isTimeout = errorMessage === 'Operation timed out';
    
    return NextResponse.json(
      { 
        error: isTimeout
          ? 'Operation timed out. Please try with fewer or smaller files (max 20MB per file, 40MB total).'
          : `Failed to merge PDFs: ${errorMessage}. Please ensure all files are valid PDFs.`
      },
      { 
        status: isTimeout ? 408 : 500,
        headers: {
          'Cache-Control': 'no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      }
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

  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_FILES} files allowed.` },
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
export const maxDuration = 9; // 9 seconds for safety margin 