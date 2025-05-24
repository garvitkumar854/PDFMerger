export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB
export const MAX_FILES = 10;

export interface FileValidationError {
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: FileValidationError;
  validFiles: File[];
  invalidFiles: Array<{ file: File; reason: string }>;
}

// Keep track of processed files globally
let processedFiles = new Set<string>();

export function clearProcessedFiles() {
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

async function validatePDFStructure(file: File): Promise<boolean> {
  try {
    const buffer = await file.slice(0, 1024).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    // Look for PDF signature %PDF-
    for (let i = 0; i < bytes.length - 4; i++) {
      if (bytes[i] === 0x25 && // %
          bytes[i + 1] === 0x50 && // P
          bytes[i + 2] === 0x44 && // D
          bytes[i + 3] === 0x46 && // F
          bytes[i + 4] === 0x2D) { // -
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function validateFiles(
  newFiles: File[],
  existingFiles: File[] = []
): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: false,
    validFiles: [],
    invalidFiles: []
  };

  // Early returns for basic validations
  if (!newFiles.length) {
    result.error = {
      code: 'NO_FILES',
      message: 'No files selected'
    };
    return result;
  }

  if (existingFiles.length + newFiles.length > MAX_FILES) {
    result.error = {
      code: 'TOO_MANY_FILES',
      message: `Maximum ${MAX_FILES} files allowed. You can add ${MAX_FILES - existingFiles.length} more files.`
    };
    return result;
  }

  // Calculate sizes
  const existingSize = existingFiles.reduce((sum, file) => sum + file.size, 0);
  const newSize = newFiles.reduce((sum, file) => sum + file.size, 0);
  
  if (existingSize + newSize > MAX_TOTAL_SIZE) {
    result.error = {
      code: 'TOTAL_SIZE_EXCEEDED',
      message: `Total size cannot exceed ${MAX_TOTAL_SIZE / (1024 * 1024)}MB. You have ${((MAX_TOTAL_SIZE - existingSize) / (1024 * 1024)).toFixed(1)}MB remaining.`
    };
    return result;
  }

  // Process each file
  for (const file of newFiles) {
    // Skip empty files
    if (file.size === 0) {
      result.invalidFiles.push({
        file,
        reason: 'File is empty'
      });
      continue;
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      result.invalidFiles.push({
        file,
        reason: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`
      });
      continue;
    }

    // Validate file type
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      result.invalidFiles.push({
        file,
        reason: 'Only PDF files are allowed'
      });
      continue;
    }

    // Validate PDF structure
    const isValidPDF = await validatePDFStructure(file);
    if (!isValidPDF) {
      result.invalidFiles.push({
        file,
        reason: 'Invalid or corrupted PDF file'
      });
      continue;
    }

    // If all validations pass, add to valid files
    result.validFiles.push(file);
  }

  // Set final validation status
  result.valid = result.validFiles.length > 0 && result.invalidFiles.length === 0;

  return result;
}

// Export for debugging
export { getProcessedFilesDebug }; 