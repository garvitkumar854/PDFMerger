import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, File, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { validateFiles, clearProcessedFiles, removeFromProcessedFiles } from '@/lib/utils/file-validation';

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

export function FileUpload({
  onFilesSelected,
  maxFiles = 10,
  acceptedFileTypes = ['application/pdf'],
  className = "",
  hideFileList = false,
  onError,
  customText
}: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const processingRef = useRef(false);

  // Clear processed files when component unmounts
  useEffect(() => {
    return () => {
      clearProcessedFiles();
    };
  }, []);

  // Reset internal state when external files change
  useEffect(() => {
    const handleReset = () => {
      setFiles([]);
      clearProcessedFiles();
    };

    // Listen for custom reset event
    window.addEventListener('reset-file-upload', handleReset);
    return () => {
      window.removeEventListener('reset-file-upload', handleReset);
    };
  }, []);

  const handleFilesSelected = useCallback(async (newFiles: File[]) => {
    // Prevent concurrent processing
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      setIsValidating(true);
      clearProcessedFiles(); // Clear before validation

      // Validate files
      const validationResult = await validateFiles(newFiles, files);

      // Handle validation results
      if (!validationResult.valid) {
        if (validationResult.error) {
          onError?.(validationResult.error.message);
        } else {
          // Handle invalid files
          if (validationResult.invalidFiles.length > 0) {
            const messages = validationResult.invalidFiles.map(
              ({ file, reason }) => `${file.name}: ${reason}`
            );
            onError?.(messages.join('\n'));
          }
          // Handle duplicates separately
          if (validationResult.duplicates.length > 0) {
            const duplicateMessage = validationResult.duplicates.length === 1
              ? `${validationResult.duplicates[0].name} has already been added`
              : `${validationResult.duplicates.length} files were skipped (duplicates)`;
            onError?.(duplicateMessage);
          }
        }
      }

      // Update files if we have valid ones
      if (validationResult.validFiles.length > 0) {
        const updatedFiles = [...files, ...validationResult.validFiles];
        setFiles(updatedFiles);
        onFilesSelected(updatedFiles);
      }
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Failed to process files');
    } finally {
      setIsValidating(false);
      processingRef.current = false;
    }
  }, [files, onFilesSelected, onError]);

  const removeFile = useCallback((index: number) => {
    setFiles(prevFiles => {
      const fileToRemove = prevFiles[index];
      if (fileToRemove) {
        clearProcessedFiles();
        const newFiles = prevFiles.filter((_, i) => i !== index);
        onFilesSelected(newFiles);
        return newFiles;
      }
      return prevFiles;
    });
  }, [onFilesSelected]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFilesSelected,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: maxFiles - files.length,
    disabled: isValidating || files.length >= maxFiles,
    noClick: isValidating,
    noDrag: isValidating
  });

  // Calculate total size
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(1);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div
        {...getRootProps()}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-6",
          "transition-all duration-300 ease-in-out",
          isDragActive 
            ? "border-primary bg-primary/5" 
            : "border-muted hover:border-primary/50 hover:bg-primary/5",
          isValidating && "opacity-50 cursor-wait",
          files.length >= maxFiles && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center gap-4">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="relative"
          >
            <Upload className={cn(
              "h-10 w-10 transition-colors",
              isDragActive ? "text-primary" : "text-muted-foreground"
            )} />
          </motion.div>
          <div className="text-center space-y-2">
            <p className="text-sm font-medium">
              {customText?.main || (
                isValidating ? "Validating files..." :
                files.length >= maxFiles ? "Maximum files reached" :
                isDragActive ? "Drop files here..." :
                "Drop PDF files here or click to browse"
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {customText?.details || (
                files.length >= maxFiles
                  ? "Remove files to add more"
                  : `${files.length}/${maxFiles} files (${totalSizeMB}MB total)`
              )}
            </p>
          </div>
        </div>
      </div>

      {!hideFileList && files.length > 0 && (
        <AnimatePresence mode="popLayout">
          <motion.div
            layout
            className="space-y-2"
          >
            {files.map((file, index) => (
              <motion.div
                key={`${file.name}-${index}`}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <File className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{file.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({(file.size / (1024 * 1024)).toFixed(1)} MB)
                  </span>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="rounded-full p-1 hover:bg-destructive/10 hover:text-destructive ml-2 flex-shrink-0 transition-colors"
                  disabled={isValidating}
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
} 