import { PDFDocument } from 'pdf-lib';

export interface FileValidationError {
  message: string;
  code: string;
}

export interface PDFValidationResult {
  isValid: boolean;
  error?: FileValidationError;
}

export interface ValidationResult {
  validFiles: File[];
  invalidFiles: Array<{
    file: File;
    reason: string;
  }>;
  totalSize: number;
  error?: FileValidationError;
}

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB
export const MAX_FILES = 10;

// Keep track of processed files globally
let processedFiles = new Set<string>();

export function clearProcessedFiles(): void {
  processedFiles = new Set<string>();
}

export function removeFromProcessedFiles(filename: string) {
  processedFiles.delete(filename);
}

function normalizeFileName(file: File): string {
  // Create a unique identifier using name, size, and current timestamp
  return `${file.name.toLowerCase().trim()}-${file.size}-${Date.now()}`;
}

// Add a debug function to help track the state of processed files
function getProcessedFilesDebug(): string[] {
  return Array.from(processedFiles);
}

const validatePDF = async (file: File): Promise<PDFValidationResult> => {
  try {
    // Add signature validation
    const header = await file.slice(0, 5).arrayBuffer();
    const view = new Uint8Array(header);
    const hasValidSignature = view[0] === 0x25 && // %
                             view[1] === 0x50 && // P
                             view[2] === 0x44 && // D
                             view[3] === 0x46 && // F
                             view[4] === 0x2D;   // -
    
    if (!hasValidSignature) {
      return { 
        isValid: false, 
        error: {
          message: 'Invalid PDF format',
          code: 'INVALID_PDF_FORMAT'
        }
      };
    }
    
    // Add version check
    const versionBytes = await file.slice(5, 8).arrayBuffer();
    const version = new TextDecoder().decode(versionBytes);
    if (!version.match(/^[0-9]\.[0-9]$/)) {
      return { 
        isValid: false, 
        error: {
          message: 'Unsupported PDF version',
          code: 'UNSUPPORTED_PDF_VERSION'
        }
      };
    }
    
    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'PDF_VALIDATION_ERROR'
      }
    };
  }
};

export async function validateFiles(
  files: File[],
  existingFiles: File[] = []
): Promise<ValidationResult> {
  const result: ValidationResult = {
    validFiles: [],
    invalidFiles: [],
    totalSize: 0,
    error: undefined
  };

  // Check total number of files
  if (files.length + existingFiles.length > MAX_FILES) {
    result.error = {
      message: `Too many files. Maximum ${MAX_FILES} files allowed.`,
      code: 'TOO_MANY_FILES'
    };
    return result;
  }

  // Calculate initial total size from existing files
  let totalSize = existingFiles.reduce((sum, file) => sum + file.size, 0);

  // Process each file
  for (const file of files) {
    try {
      // Update total size
      totalSize += file.size;
      if (totalSize > MAX_TOTAL_SIZE) {
        result.error = {
          message: `Total size exceeds ${MAX_TOTAL_SIZE / (1024 * 1024)}MB limit`,
          code: 'TOTAL_SIZE_EXCEEDED'
        };
        return result;
      }

      // Check individual file size
      if (file.size > MAX_FILE_SIZE) {
        result.invalidFiles.push({
          file,
          reason: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`
        });
        continue;
      }

      // Validate PDF structure
      const validation = await validatePDF(file);
      if (!validation.isValid) {
        result.invalidFiles.push({
          file,
          reason: validation.error?.message || 'Invalid PDF file'
        });
        continue;
      }

      // If all validations pass, add to valid files
      result.validFiles.push(file);
    } catch (error) {
      result.invalidFiles.push({
        file,
        reason: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  result.totalSize = totalSize;
  return result;
}

// Export for debugging
export { getProcessedFilesDebug }; 