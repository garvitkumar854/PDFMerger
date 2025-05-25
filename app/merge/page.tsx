"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { FileUpload } from "@/components/ui/file-upload";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FileText, X, Upload, CheckCircle2, Download, ArrowLeft, Shield, GripVertical, Plus, AlertCircle } from "lucide-react";
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

  const handleFilesSelected = useCallback(async (selectedFiles: File[]) => {
    try {
      // Process each file to get content
      const newFiles: FileItem[] = await Promise.all(
        selectedFiles.map(async (file) => {
          const content = await file.arrayBuffer();
          return {
            id: `${file.name}-${Date.now()}-${Math.random()}`,
            name: file.name,
            size: file.size,
            type: file.type,
            content: content
          };
        })
      );

      // Update files state, adding new files to the existing ones
      setFiles(prevFiles => [...prevFiles, ...newFiles]);

      // Reset merge states when files change
      if (mergedPdfUrl) {
        URL.revokeObjectURL(mergedPdfUrl);
        setMergedPdfUrl(null);
      }
      setIsComplete(false);
      setMergeProgress(0);
      setIsMerging(false);

      // Show success message
      toast({
        title: "Files Added",
        description: `Successfully added ${newFiles.length} file${newFiles.length === 1 ? '' : 's'}`,
        variant: "default",
      });
    } catch (error) {
      console.error('Error processing files:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process files",
        variant: "destructive",
      });
    }
  }, [mergedPdfUrl, toast]);

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
    // Validate file count
    if (files.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select PDF files to merge",
        variant: "destructive",
      });
      return;
    }

    if (files.length === 1) {
      toast({
        title: "Single file selected",
        description: "Please select at least two PDF files to merge",
        variant: "destructive",
      });
      return;
    }

    if (files.length > MAX_FILES) {
      toast({
        title: "Too many files",
        description: `Cannot merge more than ${MAX_FILES} files. Please remove some files.`,
        variant: "destructive",
      });
      return;
    }

    // Validate total size
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

      // Calculate total size
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);

      // Prepare form data
      const formData = new FormData();

      // Add files to form data with progress tracking
      let processedSize = 0;
      for (const fileItem of files) {
        if (!fileItem.content) {
          throw new Error(`Content not found for file ${fileItem.name}`);
        }

        try {
          // Create a blob from the content
          const blob = new Blob([fileItem.content], { type: 'application/pdf' });
          
          // Double-check the PDF structure
          const firstBytes = await blob.slice(0, 1024).arrayBuffer();
          const header = new Uint8Array(firstBytes);
          
          // Look for PDF signature
          let hasPdfSignature = false;
          for (let i = 0; i < header.length - 4; i++) {
            if (header[i] === 0x25 && // %
                header[i + 1] === 0x50 && // P
                header[i + 2] === 0x44 && // D
                header[i + 3] === 0x46 && // F
                header[i + 4] === 0x2D) { // -
              hasPdfSignature = true;
              break;
            }
          }

          if (!hasPdfSignature) {
            throw new Error(`${fileItem.name} appears to be corrupted or is not a valid PDF`);
          }

          // Create a new file with the verified content
          const file = new File([blob], fileItem.name, { 
            type: 'application/pdf',
            lastModified: Date.now()
          });

          formData.append("files", file);

          // Update progress
          processedSize += fileItem.size;
          const progress = (processedSize / totalSize) * 30; // First 30% for file processing
          setMergeProgress(Math.min(30, progress));
        } catch (error) {
          throw new Error(`Failed to process ${fileItem.name}: ${error instanceof Error ? error.message : 'Invalid PDF structure'}`);
        }
      }

      abortControllerRef.current = new AbortController();

      // Start progress tracking for merge operation
      let mergeStartTime = Date.now();
      progressInterval = setInterval(() => {
        const elapsed = Date.now() - mergeStartTime;
        const progress = Math.min(85, 30 + (elapsed / 1000) * 5); // Increase by 5% per second up to 85%
        setMergeProgress(progress);
      }, 100);

      const response = await fetch("/api/merge", {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current.signal,
      });

      clearProgressInterval();

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to merge PDFs' }));
        throw new Error(errorData.error || "Failed to merge PDFs");
      }

      const blob = await response.blob();
      
      if (blob.size === 0) {
        throw new Error("Generated PDF is empty");
      }

      // Verify merged PDF header
      const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
      if (!(header[0] === 0x25 && // %
            header[1] === 0x50 && // P
            header[2] === 0x44 && // D
            header[3] === 0x46 && // F
            header[4] === 0x2D)) { // -
        throw new Error("Generated PDF appears to be corrupted");
      }

      // Clean up old URL if it exists
      if (mergedPdfUrl) {
        URL.revokeObjectURL(mergedPdfUrl);
      }

      const url = URL.createObjectURL(blob);
      setMergedPdfUrl(url);
      setMergeProgress(100);
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
      <div className="container mx-auto py-4 sm:py-6 lg:py-6 px-4 sm:px-6 lg:max-w-4xl xl:max-w-5xl">
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 sm:mb-8">
          <Link 
            href="/" 
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-all duration-200 ease-out rounded-lg px-3 py-1.5 hover:bg-primary/5 w-full sm:w-auto justify-center sm:justify-start"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
          <motion.h1 
            className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent text-center sm:text-left"
          >
            Merge PDFs
          </motion.h1>
        </motion.div>

        <AnimatePresence mode="wait">
          {!isComplete ? (
            <motion.div
              key="upload"
              variants={itemVariants}
              className="space-y-4 lg:space-y-6"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-xl blur-xl" />
                <div className="relative">
                  <FileUpload
                    onFilesSelected={handleFilesSelected}
                    maxFiles={MAX_FILES}
                    acceptedFileTypes={["application/pdf"]}
                    className="bg-card/95 shadow-lg rounded-xl border-primary/20 min-h-[200px] sm:min-h-[250px] lg:min-h-[300px] backdrop-blur-sm transition-all duration-300"
                    hideFileList={true}
                    currentTotalSize={files.reduce((sum, file) => sum + file.size, 0)}
                    currentFileCount={files.length}
                    onError={(error) => {
                      toast({
                        title: "Cannot Add Files",
                        description: error,
                        variant: "destructive",
                      });
                    }}
                    customText={{
                      main: files.length === 0 
                        ? "Drop your PDF files here or click to browse" 
                        : "Drop more PDF files here or click to browse",
                      details: (() => {
                        const { totalSize, remainingSize, totalFiles, remainingFiles } = getRemainingCapacity();
                        if (files.length === 0) {
                          return `Upload up to ${MAX_FILES} PDF files (max ${(MAX_TOTAL_SIZE / (1024 * 1024)).toFixed(0)}MB total)`;
                        }
                        return `${totalFiles}/${MAX_FILES} files (${(totalSize / (1024 * 1024)).toFixed(1)}MB used, ${(remainingSize / (1024 * 1024)).toFixed(1)}MB remaining)`;
                      })()
                    }}
                  />
                </div>
              </div>

              {files.length > 0 && (
                <div className="space-y-4 bg-card/95 p-4 sm:p-5 lg:p-6 rounded-xl shadow-lg border border-primary/20 backdrop-blur-sm transition-all duration-300">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="space-y-1 w-full sm:w-auto">
                      <h2 className="text-base sm:text-lg font-semibold text-foreground flex items-center gap-2">
                        Selected Files
                        <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs sm:text-sm font-medium text-primary">
                          {files.length}
                        </span>
                      </h2>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {files.length} file{files.length !== 1 ? 's' : ''} selected ({(files.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024)).toFixed(1)}MB total)
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearAll}
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 w-full sm:w-auto text-xs sm:text-sm"
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
                        <div className="space-y-1.5 max-h-[200px] lg:max-h-[250px] overflow-y-auto custom-scrollbar">
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
                    <div className="space-y-3">
                      <Button
                        onClick={handleMerge}
                        disabled={isMerging || isOverLimit().isOverLimit}
                        className={cn(
                          "w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 transition-all duration-300 py-4 lg:py-5 text-base sm:text-lg",
                          isOverLimit().isOverLimit && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {isMerging ? (
                          <>
                            <Upload className="mr-2 h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                            Merging...
                          </>
                        ) : isOverLimit().isOverLimit ? (
                          <>
                            <AlertCircle className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                            {isOverLimit().reason}
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                            Merge PDFs ({files.length} files)
                          </>
                        )}
                      </Button>

                      {isMerging && (
                        <div className="space-y-2">
                          <Progress value={mergeProgress} className="h-2" />
                          <p className="text-sm text-muted-foreground text-center">
                            Processing... {Math.round(mergeProgress)}%
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      Add at least one more PDF file to merge
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
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="bg-card/95 p-6 lg:p-8 rounded-xl shadow-lg border border-primary/20 backdrop-blur-sm text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ 
                  type: "spring",
                  stiffness: 500,
                  damping: 30,
                  delay: 0.1
                }}
                className="rounded-full bg-primary/10 p-3 lg:p-4 w-fit mx-auto mb-5"
              >
                <CheckCircle2 className="h-8 w-8 lg:h-10 lg:w-10 text-primary" />
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.2 }}
              >
                <h2 className="text-xl lg:text-2xl font-semibold text-foreground mb-2">PDF Merged Successfully!</h2>
                <p className="text-muted-foreground mb-6 lg:mb-8">
                  Your files have been combined into a single PDF
                </p>
              </motion.div>
                
              <div className="flex flex-col gap-3 max-w-sm mx-auto">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: 0.3 }}
                >
                  <Button
                    onClick={handleDownload}
                    size="lg"
                    className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90 py-4 lg:py-5 text-base lg:text-lg transition-all duration-200 ease-out transform-gpu hover:scale-[1.02]"
                  >
                    <Download className="h-5 w-5" />
                    Download PDF
                  </Button>
                </motion.div>
                  
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: 0.4 }}
                >
                  <Button
                    onClick={handleClearAll}
                    variant="outline"
                    size="lg"
                    className="w-full gap-2 border-primary/20 hover:bg-primary/5 py-4 lg:py-5 text-base lg:text-lg transition-all duration-200 ease-out transform-gpu hover:scale-[1.02]"
                  >
                    <Plus className="h-5 w-5" />
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