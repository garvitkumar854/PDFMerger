import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Tailwind class merging utility
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// File processing utilities
export function clearProcessedFiles() {
  const processedFiles = new Set<string>();
  return processedFiles;
}

// File size formatting
export function formatFileSize(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// File validation utilities
export const FILE_SIZE_LIMITS = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB per file
  MAX_TOTAL_SIZE: 200 * 1024 * 1024, // 200MB total
  MAX_FILES: 10
} as const;

export function validateFileSize(file: File): { valid: boolean; error?: string } {
  if (file.size > FILE_SIZE_LIMITS.MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size (${formatFileSize(file.size)}) exceeds ${formatFileSize(FILE_SIZE_LIMITS.MAX_FILE_SIZE)} limit`
    };
  }
  return { valid: true };
}

export function validateTotalSize(currentSize: number, newSize: number): { valid: boolean; error?: string } {
  const totalSize = currentSize + newSize;
  if (totalSize > FILE_SIZE_LIMITS.MAX_TOTAL_SIZE) {
    return {
      valid: false,
      error: `Total size (${formatFileSize(totalSize)}) would exceed ${formatFileSize(FILE_SIZE_LIMITS.MAX_TOTAL_SIZE)} limit`
    };
  }
  return { valid: true };
}

// Animation constants
export const SPRING_ANIMATION = {
  type: "spring",
  stiffness: 500,
  damping: 30,
  mass: 0.5
} as const;

export const EASE_ANIMATION = {
  type: "ease",
  duration: 0.2,
  ease: "easeOut"
} as const; 