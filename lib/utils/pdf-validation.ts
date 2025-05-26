/**
 * Utility functions for PDF validation
 */

import { PDFDocument } from 'pdf-lib';

// Cache for validation results
const validationCache = new WeakMap<ArrayBuffer, boolean>();

/**
 * Quick check of PDF header
 */
export function hasValidPDFHeader(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 5) return false;

  const header = new Uint8Array(buffer.slice(0, 5));
  return header[0] === 0x25 && // %
         header[1] === 0x50 && // P
         header[2] === 0x44 && // D
         header[3] === 0x46 && // F
         header[4] === 0x2D;   // -
}

/**
 * Check for PDF trailer
 */
export function hasValidPDFTrailer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 6) return false;

  const view = new Uint8Array(buffer);
  const last1024Bytes = view.slice(Math.max(0, view.length - 1024));
  const trailerString = new TextDecoder().decode(last1024Bytes);
  
  return trailerString.includes('%%EOF');
}

/**
 * Validate PDF structure
 */
export async function validatePDFStructure(file: File): Promise<{ isValid: boolean; error?: string }> {
  try {
    const buffer = await file.arrayBuffer();

    // Check cache first
    if (validationCache.has(buffer)) {
      return { isValid: validationCache.get(buffer)! };
    }

    // Size checks
    if (file.size < 100) {
      return { isValid: false, error: 'File is too small to be a valid PDF' };
    }

    // Header check
    if (!hasValidPDFHeader(buffer)) {
      return { isValid: false, error: 'Invalid PDF header' };
    }

    // Trailer check
    if (!hasValidPDFTrailer(buffer)) {
      return { isValid: false, error: 'Invalid PDF trailer' };
    }

    // Basic content check
    const content = await file.text();
    if (!content.includes('/Type') || !content.includes('/Page')) {
      return { isValid: false, error: 'Missing required PDF elements' };
    }

    // Cache the result
    validationCache.set(buffer, true);
    return { isValid: true };

  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? 
        `PDF validation failed: ${error.message}` : 
        'PDF validation failed'
    };
  }
}

/**
 * Clean up validation cache
 */
export function clearValidationCache(): void {
  // WeakMap entries will be automatically garbage collected
  // when their key objects are no longer referenced
}

/**
 * PDF validation utilities
 */

/**
 * Validates a PDF file structure
 * @param data PDF file data as Uint8Array
 * @returns Promise that resolves if PDF is valid, rejects if invalid
 */
export const validatePDF = async (buffer: Uint8Array): Promise<boolean> => {
  try {
    // Minimal size check
    if (buffer.length < 32) return false;
    
    // Fast header check using DataView for better performance
    const view = new DataView(buffer.buffer);
    if (!(view.getUint8(0) === 0x25 && // %
          view.getUint8(1) === 0x50 && // P
          view.getUint8(2) === 0x44 && // D
          view.getUint8(3) === 0x46 && // F
          view.getUint8(4) === 0x2D))  // -
    {
      return false;
    }

    // Quick EOF check in last 1024 bytes for faster validation
    const tail = buffer.slice(-Math.min(1024, buffer.length));
    if (!new TextDecoder().decode(tail).includes('%%EOF')) {
      return false;
    }

    // Optimized PDF loading with dynamic parse speed
    const pdfDoc = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
      parseSpeed: buffer.length < 20 * 1024 * 1024 ? 6000 : 3000
    });

    // Quick structure validation
    if (pdfDoc.getPageCount() === 0) return false;

    // Only check first page metadata for speed
    const firstPage = pdfDoc.getPage(0);
    const { width, height } = firstPage.getSize();
    
    return width > 0 && height > 0;
  } catch {
    return false;
  }
};

/**
 * Checks if a PDF file appears to be corrupted
 */
export const isPDFCorrupted = async (buffer: Uint8Array): Promise<boolean> => {
  try {
    // Quick size validation
    if (buffer.length < 32) return true;

    // Fast header check using DataView
    const view = new DataView(buffer.buffer);
    const headerValid = view.getUint8(0) === 0x25 && // %
                       view.getUint8(1) === 0x50 && // P
                       view.getUint8(2) === 0x44 && // D
                       view.getUint8(3) === 0x46 && // F
                       view.getUint8(4) === 0x2D;   // -
    
    if (!headerValid) return true;

    // Quick EOF check
    const tail = buffer.slice(-Math.min(1024, buffer.length));
    if (!new TextDecoder().decode(tail).includes('%%EOF')) return true;

    // Load PDF with optimized settings
    const pdfDoc = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
      parseSpeed: buffer.length < 20 * 1024 * 1024 ? 6000 : 3000
    });

    // Basic structure check
    if (pdfDoc.getPageCount() === 0) return true;

    // Only check first and last page for speed
    const pages = pdfDoc.getPages();
    const checkPages = [pages[0], pages[pages.length - 1]];

    for (const page of checkPages) {
      const { width, height } = page.getSize();
      if (!width || !height || width <= 0 || height <= 0) return true;
    }

    return false;
  } catch {
    return true;
  }
};

/**
 * Estimates the memory usage for processing a PDF with enhanced accuracy
 */
export const estimatePDFMemoryUsage = async (buffer: Uint8Array): Promise<number> => {
  try {
    // Quick size-based estimation for small files
    if (buffer.length < 15 * 1024 * 1024) {
      return Math.ceil(buffer.length * 2); // Conservative estimate for small files
    }

    const pdfDoc = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
      parseSpeed: 2000
    });

    const pageCount = pdfDoc.getPageCount();
    const totalSize = buffer.length;

    // Optimized memory estimation
    const baseMemory = totalSize * 1.2; // Reduced from 1.5
    const pageMemory = pageCount * 256 * 1024; // Reduced from 512KB to 256KB per page
    const metadataMemory = Math.min(totalSize * 0.05, 2 * 1024 * 1024); // Reduced from 5MB to 2MB
    
    // Reduced processing buffer
    const processingBuffer = Math.min(
      totalSize * 0.15, // Reduced from 0.2
      30 * 1024 * 1024 // Reduced from 50MB to 30MB
    );

    // Calculate total estimated memory with reduced safety margin
    const estimatedMemory = baseMemory + pageMemory + metadataMemory + processingBuffer;
    const safetyMargin = totalSize > 50 * 1024 * 1024 ? 1.1 : 1.05; // Reduced margins
    
    return Math.ceil(estimatedMemory * safetyMargin);
  } catch {
    // Fallback estimation if analysis fails
    return Math.ceil(buffer.length * 2);
  }
};

/**
 * Estimates the quality/integrity of a PDF file
 * @param data PDF file data
 * @returns score from 0-1 where 1 is highest quality
 */
export function getPDFQualityScore(data: Uint8Array): number {
  try {
    const content = new TextDecoder().decode(data);
    let score = 1.0;

    // Check header quality
    if (!content.startsWith('%PDF-1.')) {
      score -= 0.3;
    }

    // Check EOF marker
    if (!content.endsWith('%%EOF\n')) {
      score -= 0.2;
    }

    // Check xref table
    if (!content.includes('xref')) {
      score -= 0.3;
    }

    // Check for linearization
    if (!content.includes('/Linearized')) {
      score -= 0.1;
    }

    // Check object structure
    const objCount = (content.match(/\d+\s+\d+\s+obj/g) || []).length;
    if (objCount < 10) {
      score -= 0.1;
    }

    return Math.max(0, score);
  } catch (error) {
    return 0;
  }
} 