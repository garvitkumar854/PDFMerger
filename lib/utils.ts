import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function clearProcessedFiles() {
  // Clear any processed files from memory
  const processedFiles = new Set<string>();
  return processedFiles;
}
