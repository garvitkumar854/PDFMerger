import { PDFDocument } from 'pdf-lib';

export interface FileValidationError {
  message: string;
  code: string;
}

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB
export const MAX_FILES = 10;

export interface ValidationResult {
  validFiles: File[];
  invalidFiles: Array<{
    file: File;
    reason: string;
  }>;
  totalSize: number;
  error?: FileValidationError;
}

// Keep track of processed files globally
let processedFiles = new Set<string>();

export function clearProcessedFiles(): void {
  processedFiles = new Set<string>();
}

export function removeFromProcessedFiles(filename: string) {
  // This function is kept for backward compatibility
  clearProcessedFiles();
}

function normalizeFileName(file: File): string {
  // Create a unique identifier using name, size, and current timestamp
  return `${file.name.toLowerCase().trim()}-${file.size}-${Date.now()}`;
}

// Add a debug function to help track the state of processed files
function getProcessedFilesDebug(): string[] {
  return Array.from(processedFiles);
}

export async function validatePDF(file: File): Promise<FileValidationError | undefined> {
  if (!file) {
    return {
      message: 'No file provided',
      code: 'NO_FILE'
    };
  }

  // Check file size
  if (file.size === 0) {
    return {
      message: 'File is empty',
      code: 'EMPTY_FILE'
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      message: `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
      code: 'FILE_TOO_LARGE'
    };
  }

  // Validate file type
  const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPDF) {
    return {
      message: 'Only PDF files are allowed',
      code: 'INVALID_FILE_TYPE'
    };
  }

  try {
    const smallBuffer = await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer(); // First 1MB max
    const pdfDoc = await PDFDocument.load(smallBuffer, {
      updateMetadata: false,
      ignoreEncryption: true,
      throwOnInvalidObject: false
    });

    // Additional PDF validation if needed
    if (!pdfDoc || !pdfDoc.getPageCount()) {
      return {
        message: 'Invalid PDF format: No pages found',
        code: 'INVALID_PDF'
      };
    }

    return undefined;
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : 'Invalid PDF format',
      code: 'INVALID_PDF'
    };
  }
}

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

      // Validate PDF structure
      const validation = await validatePDF(file);
      if (validation) {
        result.invalidFiles.push({
          file,
          reason: validation.message
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