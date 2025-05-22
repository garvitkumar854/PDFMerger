export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_FILE_TYPES = ['application/pdf'];

export interface FileValidationError {
  code: string;
  message: string;
}

export function validateFile(file: File): FileValidationError | null {
  if (!file) {
    return {
      code: 'NO_FILE',
      message: 'No file selected',
    };
  }

  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return {
      code: 'INVALID_TYPE',
      message: 'Only PDF files are allowed',
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      code: 'FILE_TOO_LARGE',
      message: `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  return null;
}

export function validateFiles(files: File[]): FileValidationError | null {
  if (!files.length) {
    return {
      code: 'NO_FILES',
      message: 'No files selected',
    };
  }

  for (const file of files) {
    const error = validateFile(file);
    if (error) return error;
  }

  return null;
} 