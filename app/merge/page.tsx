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
  DragEndEvent
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

// Add animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: {
      duration: 0.2,
      ease: "easeOut",
      when: "beforeChildren",
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.2,
      ease: "easeOut"
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

const sortableItemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
  dragging: { 
    scale: 1.02,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
    cursor: "grabbing"
  }
};

const SortableFileItem = ({ file, onRemove }: SortableFileItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: file.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : 1,
    position: 'relative' as const
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      variants={sortableItemVariants}
      initial="hidden"
      animate={isDragging ? "dragging" : "visible"}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={SPRING_ANIMATION}
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border bg-background/50 backdrop-blur-sm group",
        "hover:bg-primary/5 hover:border-primary/20",
        "transition-all duration-200 ease-out transform-gpu",
        isDragging && "border-primary/30"
      )}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0" {...attributes} {...listeners}>
        <motion.div 
          whileHover={{ scale: 1.1 }}
          transition={SPRING_ANIMATION}
          className="cursor-grab active:cursor-grabbing"
        >
          <GripVertical className={cn(
            "h-5 w-5 text-muted-foreground flex-shrink-0",
            "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
            isDragging && "opacity-100"
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
                className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full"
              />
            )}
          </div>
          <span className="font-medium truncate">{file.name}</span>
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
          "opacity-0 group-hover:opacity-100 transition-all duration-200 ease-out"
        )}
      >
        <X className="h-4 w-4" />
      </Button>
    </motion.div>
  );
};

// Add efficient file processing utilities
const processFileInChunks = async (file: File, chunkSize = 64 * 1024): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    const chunks: ArrayBuffer[] = [];
    let offset = 0;

    const readNextChunk = () => {
      const slice = file.slice(offset, offset + chunkSize);
      fileReader.readAsArrayBuffer(slice);
    };

    fileReader.onload = (e) => {
      if (e.target?.result) {
        chunks.push(e.target.result as ArrayBuffer);
        offset += chunkSize;
        if (offset < file.size) {
          readNextChunk();
        } else {
          // Combine all chunks
          const completeBuffer = new ArrayBuffer(file.size);
          const view = new Uint8Array(completeBuffer);
          let position = 0;
          chunks.forEach(chunk => {
            view.set(new Uint8Array(chunk), position);
            position += chunk.byteLength;
          });
          resolve(completeBuffer);
        }
      }
    };

    fileReader.onerror = () => reject(fileReader.error);
    readNextChunk();
  });
};

// Optimized PDF validation
const validatePdfHeader = (buffer: ArrayBuffer): boolean => {
  const header = new Uint8Array(buffer.slice(0, 5));
  return header[0] === 0x25 && // %
         header[1] === 0x50 && // P
         header[2] === 0x44 && // D
         header[3] === 0x46 && // F
         header[4] === 0x2D;   // -
};

// Cache for validated files
const validatedFiles = new WeakMap<File, boolean>();

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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement required before drag starts
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

  const handleFileUpload = useCallback(async (uploadedFiles: File[]) => {
    const newFiles: FileItem[] = [];
    const errors: string[] = [];

    // Process files in parallel with limits
    const processingPromises = uploadedFiles.map(async (file) => {
      try {
        // Check cache first
        if (!validatedFiles.has(file)) {
          const headerBuffer = await file.slice(0, 1024).arrayBuffer();
          validatedFiles.set(file, validatePdfHeader(headerBuffer));
        }

        if (!validatedFiles.get(file)) {
          throw new Error(`${file.name} is not a valid PDF file`);
        }

        // Process file in chunks
        const content = await processFileInChunks(file);
        
        newFiles.push({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          type: file.type,
          content
        });
      } catch (error) {
        errors.push(`Error processing ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    // Wait for all files to be processed
    await Promise.all(processingPromises);

    if (errors.length > 0) {
      toast({
        title: "File Processing Errors",
        description: errors.join('\n'),
        variant: "destructive",
      });
    }

    if (newFiles.length > 0) {
      setFiles(prev => [...prev, ...newFiles]);
      toast({
        title: "Files Added",
        description: `Successfully added ${newFiles.length} file${newFiles.length === 1 ? '' : 's'}`,
        variant: "default",
      });
    }
  }, [toast]);

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

    // Check individual file sizes
    const oversizedFiles = files.filter(file => file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      toast({
        title: "Files too large",
        description: `${oversizedFiles.length} file(s) exceed the 100MB limit. Please remove: ${oversizedFiles.map(f => f.name).join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    // Cancel any existing merge operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    let progressInterval: NodeJS.Timeout | undefined;

    const clearProgressInterval = () => {
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = undefined;
      }
    };

    try {
      setIsMerging(true);
      setMergeProgress(0);
      setIsComplete(false);
      setMergedPdfUrl(null);

      // Prepare form data with compression
      const formData = new FormData();
      
      // Process files in batches to manage memory
      const BATCH_SIZE = 3; // Process 3 files at a time
      const batches = [];
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        batches.push(files.slice(i, i + BATCH_SIZE));
      }

      let processedSize = 0;
      const processedFiles = [...files]; // Create a copy to preserve content

      // Animated progress function
      const animateProgress = async (from: number, to: number, duration: number) => {
        const start = Date.now();
        const animate = () => {
          const now = Date.now();
          const elapsed = now - start;
          const progress = Math.min(elapsed / duration, 1);
          
          // Easing function for smooth animation
          const eased = 1 - Math.pow(1 - progress, 3); // Cubic ease-out
          
          setMergeProgress(Math.round(from + (to - from) * eased));
          
          if (progress < 1) {
            requestAnimationFrame(animate);
          }
        };
        animate();
        // Wait for animation to complete
        await new Promise(resolve => setTimeout(resolve, duration));
      };

      // Initial progress animation
      setMergeProgress(0);
      await animateProgress(0, 20, 800); // Animate to 20% over 800ms

      for (const batch of batches) {
        await Promise.all(batch.map(async (fileItem) => {
          if (!fileItem.content) {
            throw new Error(`Content not found for file ${fileItem.name}`);
          }

          try {
            // Create a blob from the content
            const blob = new Blob([fileItem.content], { type: 'application/pdf' });
            
            // Verify PDF structure if not already validated
            if (!validatedFiles.has(new File([blob], fileItem.name))) {
              const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
              if (!validatePdfHeader(header.buffer)) {
                throw new Error(`${fileItem.name} appears to be corrupted or is not a valid PDF`);
              }
            }

            // Create a new file with the verified content
            const file = new File([blob], fileItem.name, { 
              type: 'application/pdf',
              lastModified: Date.now()
            });

            formData.append("files", file);

            // Update progress
            processedSize += fileItem.size;
          } catch (error) {
            throw new Error(`Failed to process ${fileItem.name}: ${error instanceof Error ? error.message : 'Invalid PDF structure'}`);
          }
        }));
      }

      // Animate progress for file processing completion
      await animateProgress(20, 35, 600); // Animate to 35% over 600ms

      // Now that all files are processed, we can clear their content
      processedFiles.forEach(file => {
        file.content = null;
      });

      await animateProgress(35, 50, 500); // Animate to 50% over 500ms

      abortControllerRef.current = new AbortController();

      // Add compression header
      const headers = new Headers({
        'Accept-Encoding': 'gzip, deflate',
        'Content-Encoding': 'gzip'
      });

      // Start merging operation
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

      // Animate progress for merge initialization
      await animateProgress(50, 75, 1000); // Animate to 75% over 1s

      // Create a reader to read the response as a stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get response reader");
      }

      // Accumulate chunks for the final PDF
      const chunks: Uint8Array[] = [];
      
      // Animate to 85% while receiving data
      const mergeAnimation = animateProgress(75, 85, 1200);
      
      // Read the stream
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }
        chunks.push(value);
      }

      // Wait for the merge animation to complete
      await mergeAnimation;
      
      // Animate final stages
      await animateProgress(85, 95, 800); // Animate to 95% over 800ms

      // Combine all chunks into a single blob
      const blob = new Blob(chunks, { type: 'application/pdf' });
      
      if (blob.size === 0) {
        throw new Error("Generated PDF is empty");
      }

      // Verify merged PDF header
      const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
      if (!validatePdfHeader(header.buffer)) {
        throw new Error("Generated PDF appears to be corrupted");
      }

      // Clean up old URL if it exists
      if (mergedPdfUrl) {
        URL.revokeObjectURL(mergedPdfUrl);
      }

      const url = URL.createObjectURL(blob);
      setMergedPdfUrl(url);
      
      // Final progress animation
      await animateProgress(95, 100, 500); // Animate to 100% over 500ms
      setIsComplete(true);

      toast({
        title: "Success!",
        description: `PDFs merged successfully (${(blob.size / (1024 * 1024)).toFixed(1)}MB)`,
        variant: "default"
      });

    } catch (error) {
      console.error("Error merging PDFs:", error);
      let errorMessage = "Failed to merge PDFs. Please try again.";
      
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          errorMessage = "The operation was cancelled. Please try with fewer or smaller files.";
        } else {
          // Clean up the error message
          errorMessage = error.message.replace(/Error: /g, '').replace(/\[object \w+\]/g, 'PDF');
        }
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsMerging(false);
      if (!isComplete) {
        setMergeProgress(0);
      }
      clearProgressInterval();
      abortControllerRef.current = null;

      // Clean up any temporary blobs
      if (!isComplete && mergedPdfUrl) {
        URL.revokeObjectURL(mergedPdfUrl);
        setMergedPdfUrl(null);
      }

      // Clear file contents to free memory
      setFiles(prevFiles => prevFiles.map(file => ({
        ...file,
        content: null
      })));

      // Force garbage collection if available
      if (typeof window.gc === 'function') {
        try {
          window.gc();
        } catch (e) {
          // Ignore if gc is not available
        }
      }
    }
  }, [files, isComplete, mergedPdfUrl, toast]);

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
                <div className="space-y-3 bg-card/95 p-3 sm:p-5 rounded-lg sm:rounded-xl shadow-lg border border-primary/20 backdrop-blur-sm transition-all duration-300">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="space-y-0.5 w-full sm:w-auto">
                      <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                        Selected Files
                        <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                          {files.length}
                        </span>
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {(files.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024)).toFixed(1)}MB total
                      </p>
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

                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={files}
                      strategy={verticalListSortingStrategy}
                    >
                      <AnimatePresence mode="popLayout">
                        <div className="space-y-1.5 max-h-[160px] sm:max-h-[250px] overflow-y-auto custom-scrollbar">
                          {files.map((file) => (
                            <SortableFileItem
                              key={file.id}
                              file={file}
                              onRemove={handleRemoveFile}
                            />
                          ))}
                        </div>
                      </AnimatePresence>
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