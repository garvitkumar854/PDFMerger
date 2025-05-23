import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, File, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
  acceptedFileTypes?: string[];
  className?: string;
  hideFileList?: boolean;
}

export function FileUpload({
  onFilesSelected,
  maxFiles = 10,
  acceptedFileTypes = ['application/pdf'],
  className,
  hideFileList = false,
}: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(acceptedFiles);
    onFilesSelected(acceptedFiles);
  }, [onFilesSelected]);

  const removeFile = useCallback((index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    onFilesSelected(newFiles);
  }, [files, onFilesSelected]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedFileTypes.reduce((acc, curr) => ({ ...acc, [curr]: [] }), {}),
    maxFiles,
  });

  return (
    <div className={cn('relative w-full h-full flex flex-col', className)}>
      <div
        {...getRootProps()}
        className={cn(
          'flex-1 w-full rounded-lg border-2 transition-all duration-300',
          'group/upload cursor-pointer',
          isDragActive 
            ? 'border-primary border-dashed bg-primary/5' 
            : 'border-muted hover:border-dashed hover:border-primary/50'
        )}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <input {...getInputProps()} />
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center gap-4 p-6 text-center"
          >
            <motion.div
              whileHover={{ scale: 1.1, rotate: 15 }}
              whileTap={{ scale: 0.9 }}
              className="relative"
            >
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full transform -translate-y-1" />
              <Upload 
                className={cn(
                  'h-12 w-12 relative transition-colors transform-gpu',
                  isDragActive ? 'text-primary scale-110' : 'text-muted-foreground group-hover/upload:text-primary/80'
                )} 
              />
            </motion.div>
            <div className="space-y-2 relative">
              <motion.p
                animate={{ scale: isDragActive ? 1.05 : 1 }}
                className="text-lg font-medium"
              >
                {isDragActive ? 'Drop your PDFs here' : 'Drag & drop PDFs here'}
              </motion.p>
              <p className="text-sm text-muted-foreground">
                or click to select files
                <br />
                <span className="text-xs">
                  (max {maxFiles} files)
                </span>
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      {!hideFileList && files.length > 0 && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 mt-4"
          >
            {files.map((file, index) => (
              <motion.div
                key={`${file.name}-${index}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center justify-between rounded-lg border p-3 bg-card"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <File className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{file.name}</span>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="rounded-full p-1 hover:bg-muted ml-2 flex-shrink-0"
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