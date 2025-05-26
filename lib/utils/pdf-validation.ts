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
    // Quick header check first
    if (buffer.length < 67) return false;
    
    const headerValid = buffer[0] === 0x25 && // %
                       buffer[1] === 0x50 && // P
                       buffer[2] === 0x44 && // D
                       buffer[3] === 0x46 && // F
                       buffer[4] === 0x2D;   // -
    
    if (!headerValid) return false;

    // Optimized PDF loading for validation
    const pdfDoc = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: true,
      parseSpeed: buffer.length < 10 * 1024 * 1024 ? 4000 : 1500
    });

    // Basic structure validation
    if (pdfDoc.getPageCount() === 0) return false;

    // Quick check of first and last pages
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const lastPage = pages[pages.length - 1];

    const validatePage = (page: any) => {
      const { width, height } = page.getSize();
      return width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height);
    };

    return validatePage(firstPage) && validatePage(lastPage);
  } catch {
    return false;
  }
};

/**
 * Checks if a PDF file appears to be corrupted
 */
export const isPDFCorrupted = async (buffer: Uint8Array): Promise<boolean> => {
  try {
    // Quick size check
    if (buffer.length < 67) return true;

    // Check PDF header
    const headerValid = buffer[0] === 0x25 && // %
                       buffer[1] === 0x50 && // P
                       buffer[2] === 0x44 && // D
                       buffer[3] === 0x46 && // F
                       buffer[4] === 0x2D;   // -
    
    if (!headerValid) return true;

    // Check for EOF marker in last 1024 bytes
    const tail = buffer.slice(-1024);
    const hasEOF = new TextDecoder().decode(tail).includes('%%EOF');
    if (!hasEOF) return true;

    // Load PDF with optimized settings
    const pdfDoc = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
      parseSpeed: buffer.length < 10 * 1024 * 1024 ? 4000 : 1500
    });

    // Verify basic structure
    if (pdfDoc.getPageCount() === 0) return true;

    // Check first and last pages only for better performance
    const pages = pdfDoc.getPages();
    const checkPages = [pages[0], pages[pages.length - 1]];

    for (const page of checkPages) {
      try {
        const { width, height } = page.getSize();
        if (!width || !height || width <= 0 || height <= 0) return true;

        // Quick content check
        const content = page.node.Contents();
        if (!content) return true;
      } catch {
        return true;
      }
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
    const pdfDoc = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
      parseSpeed: buffer.length < 10 * 1024 * 1024 ? 4000 : 1500
    });

    const pageCount = pdfDoc.getPageCount();
    const totalSize = buffer.length;

    // Enhanced memory estimation based on file characteristics
    const baseMemory = totalSize * 1.5; // Base memory for PDF structure
    const pageMemory = pageCount * 512 * 1024; // 512KB per page estimate
    const metadataMemory = Math.min(totalSize * 0.1, 5 * 1024 * 1024); // Max 5MB for metadata
    
    // Additional memory for processing overhead
    const processingBuffer = Math.min(
      totalSize * 0.2, // 20% of file size
      50 * 1024 * 1024 // Max 50MB buffer
    );

    // Calculate total estimated memory
    const estimatedMemory = baseMemory + pageMemory + metadataMemory + processingBuffer;

    // Add safety margin for very large files
    const safetyMargin = totalSize > 50 * 1024 * 1024 ? 1.2 : 1.1;
    
    return Math.ceil(estimatedMemory * safetyMargin);
  } catch {
    // Fallback estimation if analysis fails
    return Math.ceil(buffer.length * 2.5);
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