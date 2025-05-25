/**
 * Utility functions for PDF validation
 */

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