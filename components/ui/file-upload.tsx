'use client';

import { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Cloud, FileIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

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
}

// File validation function
const validateFiles = async (files: File[]) => {
  const validFiles: File[] = [];
  const invalidFiles: { file: File; reason: string }[] = [];

  for (const file of files) {
    if (file.type !== 'application/pdf') {
      invalidFiles.push({ file, reason: 'Not a PDF file' });
      continue;
    }
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      invalidFiles.push({ file, reason: 'File size exceeds 10MB' });
      continue;
    }
    validFiles.push(file);
  }

  return {
    valid: invalidFiles.length === 0,
    validFiles,
    invalidFiles,
    error: invalidFiles.length > 0 ? new Error('Some files are invalid') : null
  };
};

export function FileUpload({
  onFilesSelected,
  maxFiles = 10,
  acceptedFileTypes = ['application/pdf'],
  className = "",
  hideFileList = false,
  onError,
  customText
}: FileUploadProps) {
  const [isValidating, setIsValidating] = useState(false);
  const processingRef = useRef(false);

  const handleFilesSelected = useCallback(async (newFiles: File[]) => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      setIsValidating(true);

      const validationResult = await validateFiles(newFiles);

      if (!validationResult.valid) {
        if (validationResult.error) {
          onError?.(validationResult.error.message);
        } else if (validationResult.invalidFiles.length > 0) {
          const messages = validationResult.invalidFiles.map(
            ({ file, reason }) => `${file.name}: ${reason}`
          );
          onError?.(messages.join('\n'));
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
  }, [onFilesSelected, onError]);

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
          whileHover={{ scale: 1 }}
          className={cn(
            "relative overflow-hidden rounded-xl border-2 group/upload p-[14px]",
            isDragActive 
              ? "border-primary bg-primary/5" 
              : "border-muted/40",
            "transition-all duration-300 ease-in-out",
            isValidating && "opacity-50 cursor-wait"
          )}
        >
          {/* Inner dotted border - Only show on hover */}
          <div className={cn(
            "absolute rounded-lg border-[2px] border-dashed",
            "inset-[14px]",
            isDragActive 
              ? "border-primary opacity-100" 
              : "border-blue-500/60 opacity-0 group-hover/upload:opacity-100",
            "transition-all duration-300 pointer-events-none"
          )} />

          {/* Content wrapper */}
          <div className="relative px-7 py-9">
            <input {...getInputProps()} />
            
            <div className="relative flex flex-col items-center justify-center gap-8">
              {/* Icon with animation */}
              <motion.div
                initial={{ y: 0 }}
                animate={{ 
                  y: isDragActive ? -8 : 0,
                  scale: isDragActive ? 1.1 : 1
                }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="relative"
              >
                <Cloud className={cn(
                  "h-16 w-16 transition-all duration-300",
                  isDragActive 
                    ? "text-primary" 
                    : "text-muted-foreground group-hover/upload:text-primary/80"
                )} />
              </motion.div>

              {/* Text content with animations */}
              <motion.div 
                className="text-center space-y-4"
                animate={{
                  y: isDragActive ? -4 : 0
                }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                <AnimatePresence mode="wait">
                  <motion.p
                    key={isValidating ? 'validating' : isDragActive ? 'active' : 'idle'}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-lg font-medium bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"
                  >
                    {customText?.main || (
                      isValidating ? "Validating files..." :
                      isDragActive ? "Drop to add files..." :
                      "Drop PDF files here or click to browse"
                    )}
                  </motion.p>
                </AnimatePresence>

                <p className="text-sm text-muted-foreground">
                  {customText?.details}
                </p>

                {/* File type indicators */}
                <div className="flex items-center justify-center gap-2 pt-1">
                  <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    PDF Files
                  </div>
                  <div className="px-3 py-1 rounded-full bg-muted/50 text-muted-foreground text-xs">
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