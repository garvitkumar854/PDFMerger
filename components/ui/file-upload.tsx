'use client';

import { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

// Add these constants at the top level
const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB total limit
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB per file

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
  acceptedFileTypes?: string[];
  className?: string;
  hideFileList?: boolean;
  onError?: (error: string) => void;
  customText?: {
    main: string;
    details: string;
  };
  currentTotalSize?: number; // Add this prop
  currentFileCount?: number; // Add this prop
}

// Update the validation function
const validateFiles = async (files: File[], currentTotalSize = 0, currentFileCount = 0) => {
  const validFiles: File[] = [];
  const invalidFiles: { file: File; reason: string }[] = [];
  let newTotalSize = currentTotalSize;

  // First check if adding these files would exceed the total count
  if (files.length + currentFileCount > 10) {
    return {
      valid: false,
      validFiles: [],
      invalidFiles: [],
      error: new Error(`Cannot add more files. Maximum limit is 10 files (currently have ${currentFileCount} files)`)
    };
  }

  // Then check if adding these files would exceed the total size limit
  const potentialTotalSize = files.reduce((sum, file) => sum + file.size, 0) + currentTotalSize;
  if (potentialTotalSize > MAX_TOTAL_SIZE) {
    return {
      valid: false,
      validFiles: [],
      invalidFiles: [],
      error: new Error(`Total size would exceed 200MB limit (${(potentialTotalSize / (1024 * 1024)).toFixed(1)}MB > 200MB)`)
    };
  }

  for (const file of files) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      invalidFiles.push({ file, reason: 'Not a PDF file' });
      continue;
    }
    if (file.size > MAX_FILE_SIZE) {
      invalidFiles.push({ file, reason: 'File size exceeds 100MB' });
      continue;
    }
    
    newTotalSize += file.size;
    validFiles.push(file);
  }

  return {
    valid: invalidFiles.length === 0,
    validFiles,
    invalidFiles,
    error: invalidFiles.length > 0 ? new Error('Some files are invalid') : null,
    totalSize: newTotalSize
  };
};

export function FileUpload({
  onFilesSelected,
  maxFiles = 10,
  acceptedFileTypes = ['application/pdf'],
  className = "",
  hideFileList = false,
  onError,
  customText,
  currentTotalSize = 0,
  currentFileCount = 0
}: FileUploadProps) {
  const [isValidating, setIsValidating] = useState(false);
  const processingRef = useRef(false);

  const handleFilesSelected = useCallback(async (newFiles: File[]) => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      setIsValidating(true);

      const validationResult = await validateFiles(newFiles, currentTotalSize, currentFileCount);

      if (!validationResult.valid) {
        if (validationResult.error) {
          onError?.(validationResult.error.message);
          return; // Exit early on validation error
        } else if (validationResult.invalidFiles.length > 0) {
          const messages = validationResult.invalidFiles.map(
            ({ file, reason }) => `${file.name}: ${reason}`
          );
          onError?.(messages.join('\n'));
          return; // Exit early on validation error
        }
      }

      if (validationResult.validFiles.length > 0) {
        onFilesSelected(validationResult.validFiles);
      }
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Failed to process files');
    } finally {
      setIsValidating(false);
      processingRef.current = false;
    }
  }, [onFilesSelected, onError, currentTotalSize, currentFileCount]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFilesSelected,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles,
    disabled: isValidating,
    noClick: isValidating,
    noDrag: isValidating
  });

  // Extract only the necessary props from getRootProps
  const { ref, ...rootProps } = getRootProps();

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div {...rootProps}>
        <motion.div
          ref={ref}
          initial={false}
          animate={{ scale: 1 }}
          whileHover={{ scale: 1.005 }}
          transition={{ 
            type: "spring",
            stiffness: 500,
            damping: 30,
            mass: 0.5
          }}
          style={{ 
            transform: 'none'
          }}
          className={cn(
            "relative overflow-hidden rounded-lg sm:rounded-xl border-2 group/upload p-2 sm:p-[14px]",
            isDragActive 
              ? "border-primary bg-primary/5" 
              : "border-muted/40",
            "transition-all duration-200 ease-out bg-background/95 shadow-lg backdrop-blur-sm",
            isValidating && "opacity-50 cursor-wait"
          )}
        >
          {/* Inner dotted border - Only show on hover */}
          <div className={cn(
            "absolute rounded-lg border-[2px] border-dashed",
            "inset-2 sm:inset-[14px]",
            isDragActive 
              ? "border-primary opacity-100 scale-100" 
              : "border-blue-500/60 opacity-0 scale-95 group-hover/upload:scale-100 group-hover/upload:opacity-100",
            "transition-all duration-200 ease-out transform-gpu"
          )} />

          {/* Content wrapper */}
          <div className="relative px-4 sm:px-7 py-6 sm:py-9">
            <input {...getInputProps()} />
            
            <div className="relative flex flex-col items-center justify-center gap-5 sm:gap-8">
              {/* Icon with animation */}
              <motion.div
                initial={false}
                animate={{ 
                  y: isDragActive ? -8 : 0,
                  scale: isDragActive ? 1.1 : 1
                }}
                transition={{ 
                  type: "spring",
                  stiffness: 500,
                  damping: 30,
                  mass: 0.5
                }}
                className="relative transform-gpu"
              >
                <div className="relative">
                  <Upload className={cn(
                    "h-12 w-12 sm:h-16 sm:w-16",
                    isDragActive 
                      ? "text-primary" 
                      : "text-muted-foreground group-hover/upload:text-primary/80",
                    "transition-colors duration-200 ease-out"
                  )} />
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: isDragActive ? 1 : 0 }}
                    transition={{ 
                      type: "spring",
                      stiffness: 500,
                      damping: 30,
                      mass: 0.5
                    }}
                    className="absolute -bottom-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center"
                  >
                    <Plus className="h-3 w-3 text-white" />
                  </motion.div>
                </div>
              </motion.div>

              {/* Text content with animations */}
              <motion.div 
                initial={false}
                animate={{
                  y: isDragActive ? -4 : 0
                }}
                transition={{ 
                  type: "spring",
                  stiffness: 500,
                  damping: 30,
                  mass: 0.5
                }}
                className="text-center space-y-3 sm:space-y-4 transform-gpu"
              >
                <AnimatePresence mode="wait">
                  <motion.p
                    key={isValidating ? 'validating' : isDragActive ? 'active' : 'idle'}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{
                      duration: 0.2,
                      ease: "easeOut"
                    }}
                    className="text-base sm:text-lg font-medium text-foreground transform-gpu"
                  >
                    {customText?.main || (
                      isValidating ? "Validating files..." :
                      isDragActive ? "Drop to add files..." :
                      "Drop PDFs here or tap to browse"
                    )}
                  </motion.p>
                </AnimatePresence>

                <p className="text-xs sm:text-sm text-muted-foreground transition-opacity duration-200 ease-out">
                  {customText?.details}
                </p>

                {/* File type indicators */}
                <div className="flex items-center justify-center gap-2">
                  <div className="px-2 sm:px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium transition-transform duration-200 ease-out hover:scale-105">
                    PDF Files
                  </div>
                  <div className="px-2 sm:px-3 py-1 rounded-full bg-muted/50 text-muted-foreground text-xs transition-transform duration-200 ease-out hover:scale-105">
                    Max {maxFiles} files
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
} 