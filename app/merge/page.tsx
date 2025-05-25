"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { FileUpload } from "@/components/ui/file-upload";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FileText, X, Upload, CheckCircle2, Download, ArrowLeft, Shield, GripVertical, Plus, AlertCircle, FileUp, FilePlus2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { clearProcessedFiles } from "@/lib/utils/file-validation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  TouchSensor,
  MeasuringStrategy
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB
const MAX_FILES = 10;

interface FileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  content: ArrayBuffer | null;
}

interface SortableFileItemProps {
  file: FileItem;
  onRemove: (file: FileItem) => void;
}

// Animation variants
const itemVariants = {
  hidden: { 
    opacity: 0, 
    y: 10,
  },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 20
    }
  }
};

// Optimize animation variants for better performance
const sortableItemVariants = {
  hidden: { 
    opacity: 0, 
    y: 10,
  },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 20
    }
  },
  dragging: { 
    scale: 1.05,
    y: -10,
    zIndex: 3,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 30,
      mass: 1
    }
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: {
      duration: 0.15
    }
  }
};

// Optimize the container animations
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

// Add these animation constants
const SPRING_ANIMATION = {
  type: "spring",
  stiffness: 500,
  damping: 30,
  mass: 0.5
};

// Update SortableFileItem component for better touch handling
const SortableFileItem = ({ file, onRemove }: SortableFileItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    over
  } = useSortable({ 
    id: file.id,
    transition: {
      duration: 200,
      easing: "ease"
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: 'relative' as const,
    touchAction: 'none',
    willChange: 'transform',
    userSelect: 'none' as const,
    WebkitUserSelect: 'none' as const,
    WebkitTapHighlightColor: 'transparent',
    WebkitTouchCallout: 'none' as const
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      variants={sortableItemVariants}
      initial="hidden"
      animate={isDragging ? "dragging" : "visible"}
      exit="exit"
      layoutId={file.id}
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border",
        "touch-none select-none will-change-transform",
        "active:cursor-grabbing",
        isDragging ? 
          "border-primary shadow-lg bg-background z-10" : 
          "hover:bg-primary/5 hover:border-primary/20",
        over ? "opacity-60 scale-[0.98] transition-all duration-200" : ""
      )}
    >
      <div 
        className={cn(
          "flex items-center gap-3 flex-1 min-w-0",
          "cursor-grab active:cursor-grabbing",
          "touch-pan-y"
        )}
        {...attributes} 
        {...listeners}
      >
        <motion.div 
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className="touch-none select-none"
        >
          <GripVertical className={cn(
            "h-5 w-5 flex-shrink-0",
            isDragging ? "text-primary" : "text-muted-foreground"
          )} />
        </motion.div>
        <div className="flex items-center gap-3 truncate flex-1 min-w-0">
          <div className="relative">
            <FileText className={cn(
              "h-5 w-5 flex-shrink-0",
              isDragging ? "text-primary" : "text-primary/80"
            )} />
            {file.content && (
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full"
              />
            )}
          </div>
          <span className={cn(
            "font-medium truncate",
            isDragging && "text-primary"
          )}>{file.name}</span>
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            ({(file.size / (1024 * 1024)).toFixed(1)} MB)
          </span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onRemove(file)}
        className={cn(
          "h-8 w-8 hover:text-destructive hover:bg-destructive/10 flex-shrink-0 ml-2",
          "sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200"
        )}
      >
        <X className="h-4 w-4" />
      </Button>
    </motion.div>
  );
};

// Add optimized chunk processing with web workers
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
const CONCURRENT_CHUNKS = 3;

// Add web worker for PDF processing
const createPDFWorker = () => {
  const workerCode = `
    self.onmessage = async (e) => {
      const { chunk, index } = e.data;
      try {
        // Process chunk
        const processedChunk = new Uint8Array(chunk);
        self.postMessage({ success: true, index, chunk: processedChunk });
      } catch (error) {
        self.postMessage({ success: false, index, error: error.message });
      }
    };
  `;

  const blob = new Blob([workerCode], { type: 'application/javascript' });
  return new Worker(URL.createObjectURL(blob));
};

// Add optimized file processing
const processFileInChunks = async (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const chunks: ArrayBuffer[] = [];
    let processedChunks = 0;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const workers: Worker[] = [];
    
    const cleanup = () => {
      workers.forEach(worker => worker.terminate());
      URL.revokeObjectURL(file.name);
    };

    try {
      // Create worker pool
      for (let i = 0; i < CONCURRENT_CHUNKS; i++) {
        const worker = createPDFWorker();
        worker.onerror = (error) => {
          cleanup();
          reject(error);
        };
        workers.push(worker);
      }

      // Process chunks with workers
      let currentChunk = 0;
      const processNextChunk = () => {
        if (currentChunk >= totalChunks) return;

        const start = currentChunk * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const worker = workers[currentChunk % workers.length];
        worker.onmessage = (e) => {
          const { success, index, chunk: processedChunk, error } = e.data;
          
          if (!success) {
            cleanup();
            reject(new Error(error));
            return;
          }

          chunks[index] = processedChunk;
          processedChunks++;

          if (processedChunks === totalChunks) {
            cleanup();
            resolve(concatenateChunks(chunks));
          } else {
            processNextChunk();
          }
        };

        worker.postMessage({ chunk, index: currentChunk });
        currentChunk++;
      };

      // Start initial chunk processing
      for (let i = 0; i < Math.min(CONCURRENT_CHUNKS, totalChunks); i++) {
        processNextChunk();
      }
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
};

// Optimize chunk concatenation
const concatenateChunks = (chunks: ArrayBuffer[]): ArrayBuffer => {
  const totalSize = chunks.reduce((size, chunk) => size + chunk.byteLength, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;

  chunks.forEach(chunk => {
    result.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  });

  return result.buffer;
};

// Add optimized file validation
const validatePDFHeader = async (file: File): Promise<boolean> => {
  const header = await file.slice(0, 5).arrayBuffer();
  const view = new Uint8Array(header);
  return view[0] === 0x25 && // %
         view[1] === 0x50 && // P
         view[2] === 0x44 && // D
         view[3] === 0x46 && // F
         view[4] === 0x2D;   // -
};

// Cache for validated files
const validatedFiles = new WeakMap<File, boolean>();

// Add helper function for file validation
const validateFile = async (file: File): Promise<{ isValid: boolean; error?: string }> => {
  try {
    // 1. Basic file checks
    if (!file) {
      return { isValid: false, error: 'Invalid file object' };
    }

    if (file.size === 0) {
      return { isValid: false, error: 'File is empty' };
    }

    if (file.size > MAX_FILE_SIZE) {
      return { 
        isValid: false, 
        error: `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB` 
      };
    }

    // 2. File type validation
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPDF) {
      return { isValid: false, error: 'Only PDF files are allowed' };
    }

    // 3. Try to read the first few bytes to verify it's a valid PDF
    try {
      const header = await file.slice(0, 5).arrayBuffer();
      const view = new Uint8Array(header);
      const isPDFHeader = view[0] === 0x25 && // %
                         view[1] === 0x50 && // P
                         view[2] === 0x44 && // D
                         view[3] === 0x46 && // F
                         view[4] === 0x2D;   // -
      
      if (!isPDFHeader) {
        return { isValid: false, error: 'Invalid PDF format: Missing PDF signature' };
      }
    } catch (error) {
      return { isValid: false, error: 'Could not read file header' };
    }

    return { isValid: true };
  } catch (error) {
    return { 
      isValid: false, 
      error: error instanceof Error ? error.message : 'Unknown validation error' 
    };
  }
};

export default function MergePDF() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [mergedPdfUrl, setMergedPdfUrl] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();
  const { isLoaded, userId } = useAuth();
  const router = useRouter();

  // Update sensors configuration for better mobile handling
  const sensors = useSensors(
    useSensor(TouchSensor, {
      // Activate immediately on touch
      activationConstraint: {
        delay: 0,
        tolerance: 0
      }
    }),
    useSensor(PointerSensor, {
      // Better touch handling
      activationConstraint: {
        distance: 8, // Minimum distance before drag starts
        tolerance: 5, // Movement tolerance
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Protect the route
  useEffect(() => {
    if (isLoaded && !userId) {
      router.push(`/sign-in?fallbackRedirectUrl=${encodeURIComponent("/merge")}`);
    }
  }, [isLoaded, userId, router]);

  // Cleanup on unmount
  useEffect(() => {
    let progressInterval: NodeJS.Timeout | undefined;

    return () => {
      if (mergedPdfUrl) {
        URL.revokeObjectURL(mergedPdfUrl);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      clearProcessedFiles();
    };
  }, [mergedPdfUrl]);

  // Update handleFileUpload with improved validation and error handling
  const handleFileUpload = useCallback(async (uploadedFiles: File[]) => {
    const newFiles: FileItem[] = [];
    const errors: string[] = [];
    const processedFiles = new Set<string>();

    // Show processing state
    setIsMerging(true);

    try {
      // 1. First validate all files before processing
      const validationResults = await Promise.all(
        uploadedFiles.map(async (file) => ({
          file,
          validation: await validateFile(file)
        }))
      );

      // 2. Check for validation errors
      const invalidFiles = validationResults.filter(result => !result.validation.isValid);
      if (invalidFiles.length > 0) {
        invalidFiles.forEach(({ file, validation }) => {
          errors.push(`${file.name}: ${validation.error}`);
        });
        throw new Error('Some files failed validation');
      }

      // 3. Process valid files
      for (const { file } of validationResults) {
        try {
          // Skip if already processed
          if (processedFiles.has(file.name)) {
            console.log(`Skipping duplicate file: ${file.name}`);
            continue;
          }
          processedFiles.add(file.name);

          // Read file content
          console.log(`Processing file: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)}MB)`);
          const arrayBuffer = await file.arrayBuffer();
          
          if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            throw new Error('Failed to read file content');
          }

          // Add to new files
          newFiles.push({
            id: crypto.randomUUID(),
            name: file.name,
            size: file.size,
            type: file.type,
            content: arrayBuffer
          });

          console.log(`Successfully processed: ${file.name}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Error processing ${file.name}:`, errorMessage);
          errors.push(`${file.name}: ${errorMessage}`);
        }
      }

      // 4. Handle results
      if (errors.length > 0) {
        // Show errors but don't throw if we have some successful files
        toast({
          title: `${errors.length} File Processing Error${errors.length > 1 ? 's' : ''}`,
          description: errors.join('\n'),
          variant: "destructive",
          duration: 5000, // Show for 5 seconds due to multiple lines
        });
      }

      if (newFiles.length > 0) {
        setFiles(prev => [...prev, ...newFiles]);
        toast({
          title: "Files Added Successfully",
          description: `Added ${newFiles.length} file${newFiles.length === 1 ? '' : 's'} (${(newFiles.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024)).toFixed(1)}MB total)`,
          variant: "default",
        });
      } else {
        throw new Error('No files were successfully processed');
      }
    } catch (error) {
      // Show error toast
      const errorMessage = error instanceof Error ? error.message : 'Failed to process files';
      toast({
        title: "Error",
        description: errors.length > 0 ? errors.join('\n') : errorMessage,
        variant: "destructive",
        duration: 5000, // Show for 5 seconds due to multiple lines
      });
    } finally {
      // Reset processing state
      setIsMerging(false);
    }
  }, [toast, setFiles]);

  const handleRemoveFile = useCallback((fileToRemove: FileItem) => {
    // Clean up file resources
    if (fileToRemove.content) {
      fileToRemove.content = null;
    }

    // Clear processed files
    clearProcessedFiles();

    // Update files state
    setFiles(prevFiles => {
      const newFiles = prevFiles.filter(file => file.id !== fileToRemove.id);
      
      // Reset state if no files remain
      if (newFiles.length === 0) {
        if (mergedPdfUrl) {
          URL.revokeObjectURL(mergedPdfUrl);
          setMergedPdfUrl(null);
        }
        setIsComplete(false);
        setMergeProgress(0);
        setIsMerging(false);
      }
      
      return newFiles;
    });

    // Show removal notification
    setTimeout(() => {
      toast({
        title: "File Removed",
        description: `${fileToRemove.name} has been removed`,
        variant: "default",
      });
    }, 0);

    // Abort any ongoing operations
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, [mergedPdfUrl, toast]);

  const handleClearAll = useCallback(() => {
    const fileCount = files.length;
    if (fileCount === 0) return;

    // Clean up files and clear processed files list
    setFiles([]);
    clearProcessedFiles();

    // Trigger FileUpload component reset
    window.dispatchEvent(new Event('reset-file-upload'));

    // Clean up other states
    if (mergedPdfUrl) {
      URL.revokeObjectURL(mergedPdfUrl);
      setMergedPdfUrl(null);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    setIsMerging(false);
    setMergeProgress(0);
    setIsComplete(false);

    // Show clear notification
    setTimeout(() => {
      toast({
        title: "Files Cleared",
        description: `Removed ${fileCount} file${fileCount === 1 ? '' : 's'}`,
        variant: "default",
      });
    }, 0);
  }, [files.length, mergedPdfUrl, toast]);

  // Calculate remaining capacity
  const getRemainingCapacity = useCallback(() => {
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const remainingSize = MAX_TOTAL_SIZE - totalSize;
    return {
      totalSize,
      remainingSize,
      totalFiles: files.length,
      remainingFiles: MAX_FILES - files.length
    };
  }, [files]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setFiles((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, []);

  const handleMerge = useCallback(async () => {
    if (files.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select PDF files to merge",
        variant: "destructive",
      });
      return;
    }

    if (files.length < 2) {
      toast({
        title: "Not enough files",
        description: "Please select at least 2 PDF files to merge",
        variant: "destructive",
      });
      return;
    }

    // Check total size
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      toast({
        title: "Total size exceeded",
        description: `Total size (${(totalSize / (1024 * 1024)).toFixed(1)}MB) exceeds the limit of ${(MAX_TOTAL_SIZE / (1024 * 1024)).toFixed(0)}MB. Please remove some files.`,
        variant: "destructive",
      });
      return;
    }

    // Cancel any existing merge operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    try {
      setIsMerging(true);
      setMergeProgress(0);
      setIsComplete(false);
      if (mergedPdfUrl) {
        URL.revokeObjectURL(mergedPdfUrl);
        setMergedPdfUrl(null);
      }

      // Prepare form data
      const formData = new FormData();
      
      // Show initial progress
      setMergeProgress(10);

      // Add files to form data with progress tracking
      const totalFiles = files.length;
      for (let i = 0; i < files.length; i++) {
        const fileItem = files[i];
        
        try {
          if (!fileItem.content) {
            throw new Error(`Content missing for file: ${fileItem.name}`);
          }

          // Create a blob from the content
          const blob = new Blob([fileItem.content], { type: 'application/pdf' });
          
          // Verify PDF structure
          const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
          const isPDFHeader = header[0] === 0x25 && // %
                            header[1] === 0x50 && // P
                            header[2] === 0x44 && // D
                            header[3] === 0x46 && // F
                            header[4] === 0x2D;   // -
          
          if (!isPDFHeader) {
            throw new Error(`Invalid PDF format: ${fileItem.name}`);
          }

          // Add to form data
          formData.append("files", new File([blob], fileItem.name, { type: 'application/pdf' }));
          
          // Update progress (10-50%)
          setMergeProgress(10 + Math.floor((i + 1) / totalFiles * 40));
        } catch (error) {
          throw new Error(`Error processing ${fileItem.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Set headers for better performance
      const headers = new Headers({
        'Accept': 'application/pdf',
        'Accept-Encoding': 'gzip, deflate',
      });

      // Start merge request
      setMergeProgress(50);
      const response = await fetch("/api/merge", {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current.signal,
        headers
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to merge PDFs' }));
        throw new Error(errorData.error || "Failed to merge PDFs");
      }

      // Read response as blob with progress tracking
      setMergeProgress(60);
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get response reader");
      }

      const chunks: Uint8Array[] = [];
      let receivedLength = 0;
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        receivedLength += value.length;
        
        // Update progress (60-90%)
        setMergeProgress(60 + Math.floor((receivedLength / totalSize) * 30));
      }

      // Combine chunks and create blob
      setMergeProgress(90);
      const blob = new Blob(chunks, { type: 'application/pdf' });
      
      if (blob.size === 0) {
        throw new Error("Generated PDF is empty");
      }

      // Verify merged PDF
      const mergedHeader = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
      const isMergedPDFValid = mergedHeader[0] === 0x25 && // %
                              mergedHeader[1] === 0x50 && // P
                              mergedHeader[2] === 0x44 && // D
                              mergedHeader[3] === 0x46 && // F
                              mergedHeader[4] === 0x2D;   // -

      if (!isMergedPDFValid) {
        throw new Error("Generated PDF is corrupted");
      }

      // Create URL and finish
      const url = URL.createObjectURL(blob);
      setMergedPdfUrl(url);
      setMergeProgress(100);
      setIsComplete(true);

      toast({
        title: "Success!",
        description: `PDFs merged successfully (${(blob.size / (1024 * 1024)).toFixed(1)}MB)`,
        variant: "default",
      });

    } catch (error) {
      console.error("Error merging PDFs:", error);
      let errorMessage = "Failed to merge PDFs. Please try again.";
      
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          errorMessage = "Operation cancelled. Please try again.";
        } else {
          errorMessage = error.message;
        }
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
        duration: 5000,
      });

      // Reset states on error
      setIsComplete(false);
      setMergeProgress(0);
      if (mergedPdfUrl) {
        URL.revokeObjectURL(mergedPdfUrl);
        setMergedPdfUrl(null);
      }
    } finally {
      setIsMerging(false);
      abortControllerRef.current = null;
    }
  }, [files, mergedPdfUrl, toast]);

  const handleDownload = useCallback(() => {
    if (!mergedPdfUrl) return;

    const a = document.createElement("a");
    a.href = mergedPdfUrl;
    a.download = `merged-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [mergedPdfUrl]);

  // Update the merge button to be disabled when limits are exceeded
  const isOverLimit = useCallback(() => {
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const hasOversizedFiles = files.some(file => file.size > MAX_FILE_SIZE);
    
    return {
      isOverLimit: files.length > MAX_FILES || totalSize > MAX_TOTAL_SIZE || hasOversizedFiles,
      reason: files.length > MAX_FILES 
        ? `Too many files (max ${MAX_FILES})` 
        : totalSize > MAX_TOTAL_SIZE 
          ? `Total size exceeds ${(MAX_TOTAL_SIZE / (1024 * 1024)).toFixed(0)}MB` 
          : hasOversizedFiles 
            ? 'Some files exceed 100MB'
            : ''
    };
  }, [files]);

  // Cleanup function for memory management
  useEffect(() => {
    return () => {
      // Cleanup URLs
      if (mergedPdfUrl) {
        URL.revokeObjectURL(mergedPdfUrl);
      }
      // WeakMap entries will be automatically garbage collected
      // when their key objects are no longer referenced
    };
  }, [mergedPdfUrl]);

  if (!isLoaded || !userId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Shield className="w-12 h-12 text-primary mx-auto animate-pulse" />
          <h2 className="text-2xl font-bold">Authentication Required</h2>
          <p className="text-muted-foreground">Please sign in to access this feature.</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="min-h-screen bg-gradient-to-b from-background to-background/80"
    >
      <div className="container mx-auto py-3 sm:py-6 px-3 sm:px-6 lg:max-w-4xl xl:max-w-5xl">
        <motion.div 
          variants={itemVariants} 
          className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4 sm:mb-8"
        >
          <Link 
            href="/" 
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-all duration-200 ease-out rounded-lg px-2.5 py-1.5 hover:bg-primary/5 w-full sm:w-auto justify-center sm:justify-start text-sm sm:text-base"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
          <motion.h1 
            className="text-xl sm:text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent text-center sm:text-left"
          >
            Merge PDFs
          </motion.h1>
        </motion.div>

        <AnimatePresence mode="wait">
          {!isComplete ? (
            <motion.div
              key="upload"
              variants={itemVariants}
              className="space-y-3 sm:space-y-4 lg:space-y-6"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-lg sm:rounded-xl blur-xl" />
                <div className="relative">
                  <FileUpload
                    onFilesSelected={handleFileUpload}
                    maxFiles={MAX_FILES}
                    currentTotalSize={files.reduce((sum, file) => sum + file.size, 0)}
                    currentFileCount={files.length}
                    customText={{
                      main: "Drop PDFs here or tap to browse",
                      details: `${MAX_FILES - files.length} files remaining • ${((MAX_TOTAL_SIZE - files.reduce((sum, file) => sum + file.size, 0)) / (1024 * 1024)).toFixed(1)}MB available`
                    }}
                    onError={(error) => {
                      toast({
                        title: "Error",
                        description: error,
                        variant: "destructive",
                      });
                    }}
                  />
                </div>
              </div>

              {files.length > 0 && (
                <div className="space-y-3 bg-card/95 p-3 sm:p-5 rounded-lg sm:rounded-xl shadow-lg border border-primary/20 backdrop-blur-sm">
                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <div className="space-y-0.5 w-full sm:w-auto">
                        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                          Selected Files
                          <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                            {files.length}
                          </span>
                        </h2>
                        <div className="flex flex-col gap-0.5">
                          <p className="text-xs text-muted-foreground">
                            {(files.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024)).toFixed(1)}MB total
                          </p>
                          <p className="text-xs flex items-center gap-1.5 text-muted-foreground">
                            <GripVertical className="h-3 w-3" />
                            Drag files to reorder them
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearAll}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 w-full sm:w-auto text-xs"
                      >
                        Clear All
                      </Button>
                    </div>
                  </div>

                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    modifiers={[restrictToVerticalAxis]}
                    measuring={{
                      droppable: {
                        strategy: MeasuringStrategy.Always
                      }
                    }}
                  >
                    <SortableContext
                      items={files}
                      strategy={verticalListSortingStrategy}
                    >
                      <motion.div 
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        className="space-y-1.5 max-h-[calc(100vh-300px)] sm:max-h-[250px] overflow-y-auto overscroll-contain custom-scrollbar"
                      >
                        <AnimatePresence mode="popLayout">
                          {files.map((file) => (
                            <SortableFileItem
                              key={file.id}
                              file={file}
                              onRemove={handleRemoveFile}
                            />
                          ))}
                        </AnimatePresence>
                      </motion.div>
                    </SortableContext>
                  </DndContext>

                  {files.length >= 2 ? (
                    <div className="space-y-2">
                      <Button
                        onClick={handleMerge}
                        disabled={isMerging || isOverLimit().isOverLimit}
                        className={cn(
                          "w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 transition-all duration-300 py-3 sm:py-4 text-sm sm:text-base",
                          isOverLimit().isOverLimit && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {isMerging ? (
                          <>
                            <div className="mr-2 h-4 w-4 animate-spin border-2 border-primary-foreground border-t-transparent rounded-full" />
                            Merging...
                          </>
                        ) : isOverLimit().isOverLimit ? (
                          <>
                            <AlertCircle className="mr-2 h-4 w-4" />
                            {isOverLimit().reason}
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Merge {files.length} PDFs
                          </>
                        )}
                      </Button>

                      {isMerging && (
                        <div className="space-y-1.5">
                          <Progress value={mergeProgress} className="h-1.5" />
                          <p className="text-xs text-muted-foreground text-center">
                            Processing... {Math.round(mergeProgress)}%
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2.5">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      Add one more PDF to merge
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={SPRING_ANIMATION}
              className="bg-card/95 p-4 sm:p-8 rounded-lg sm:rounded-xl shadow-lg border border-primary/20 backdrop-blur-sm text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ ...SPRING_ANIMATION, delay: 0.1 }}
                className="rounded-full bg-primary/10 p-3 w-fit mx-auto mb-4"
              >
                <CheckCircle2 className="h-7 w-7 sm:h-10 sm:w-10 text-primary" />
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING_ANIMATION, delay: 0.2 }}
              >
                <h2 className="text-lg sm:text-2xl font-semibold text-foreground mb-1.5">PDF Merged Successfully!</h2>
                <p className="text-sm text-muted-foreground mb-5 sm:mb-8">
                  Your files have been combined into a single PDF
                </p>
              </motion.div>
                
              <div className="flex flex-col gap-2 sm:gap-3 max-w-sm mx-auto">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...SPRING_ANIMATION, delay: 0.3 }}
                >
                  <Button
                    onClick={handleDownload}
                    size="lg"
                    className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90 py-3 sm:py-4 text-sm sm:text-lg transition-all duration-200 ease-out transform-gpu hover:scale-[1.02]"
                  >
                    <Download className="h-4 w-4 sm:h-5 sm:w-5" />
                    Download PDF
                  </Button>
                </motion.div>
                  
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...SPRING_ANIMATION, delay: 0.4 }}
                >
                  <Button
                    onClick={handleClearAll}
                    variant="outline"
                    size="lg"
                    className="w-full gap-2 border-primary/20 hover:bg-primary/5 py-3 sm:py-4 text-sm sm:text-lg transition-all duration-200 ease-out transform-gpu hover:scale-[1.02]"
                  >
                    <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                    Merge More PDFs
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}