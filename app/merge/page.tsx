"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { FileUpload } from "@/components/ui/file-upload";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FileText, X, Upload, CheckCircle2, Download, ArrowLeft, Shield, GripVertical, Plus, AlertCircle, FileUp, FilePlus2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { clearProcessedFiles } from "@/lib/utils/file-validation";
import { validatePDF } from "@/lib/utils/pdf-validation";
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
import { css } from "@emotion/react";
import React from "react";
import { PDFDocument } from "pdf-lib";

// Constants must match server-side limits
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB per file
const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB total
const MAX_FILES = 20;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second
const UPLOAD_CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks for better performance
const PARALLEL_UPLOADS = 3;
const NETWORK_ERRORS = [
  'failed to fetch',
  'network',
  'timeout',
  'connection',
  'offline'
];

// Performance optimization constants
const UPLOAD_TIMEOUT = 120000; // 120 seconds for upload
const PROCESSING_TIMEOUT = 180000; // 180 seconds for processing
const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks for better mobile handling
const MAX_PARALLEL_CHUNKS = 3; // Maximum parallel chunk uploads
const MIN_CHUNK_SIZE = 512 * 1024; // 512KB minimum chunk size
const MEMORY_LIMIT = 50 * 1024 * 1024; // 50MB memory limit for processing

interface FileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
}

interface SortableFileItemProps {
  file: FileItem;
  onRemove: (file: FileItem) => void;
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

// Animation variants
const itemVariants = {
  hidden: { 
    opacity: 0, 
    y: 20,
    scale: 0.95
  },
  visible: { 
    opacity: 1, 
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25,
      mass: 0.5
    }
  },
  exit: {
    opacity: 0,
    y: 10,
    scale: 0.95,
    transition: {
      duration: 0.2
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

// Add type for API error response
interface APIErrorResponse {
  error: string;
}

// Add progress tracking types
interface ProgressState {
  phase: 'preparing' | 'uploading' | 'processing' | 'downloading' | 'complete';
  progress: number;
  detail?: string;
}

// Add smooth progress animation configuration
const PROGRESS_ANIMATION = {
  initial: { width: "0%" },
  animate: { width: "100%" },
  transition: { duration: 0.5, ease: "easeInOut" }
};

// Update SortableFileItem component with forwardRef
const SortableFileItem = React.forwardRef<HTMLDivElement, SortableFileItemProps>(({ file, onRemove }, ref) => {
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
      duration: 100, // Faster transition for better responsiveness
      easing: "ease-out"
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 999 : 1,
  };

  // Combine the refs
  const combinedRef = useMemo(() => {
    return (element: HTMLDivElement | null) => {
      setNodeRef(element);
      if (typeof ref === 'function') {
        ref(element);
      } else if (ref) {
        ref.current = element;
      }
    };
  }, [ref, setNodeRef]);

  return (
    <motion.div
      ref={combinedRef}
      style={style}
      variants={sortableItemVariants}
      initial="hidden"
      animate={isDragging ? "dragging" : "visible"}
      exit="exit"
      layoutId={file.id}
      className={cn(
        "flex items-center justify-between p-2 sm:p-3 rounded-lg border bg-background/50",
        "group hover:border-primary/20 touch-manipulation",
        isDragging ? "border-primary shadow-lg bg-background z-50" : "hover:bg-primary/5",
        over ? "opacity-50 scale-95 transition-all duration-200" : ""
      )}
    >
      <div 
        className={cn(
          "flex items-center gap-2 sm:gap-3 flex-1 min-w-0 touch-manipulation",
          isDragging ? "cursor-grabbing" : "cursor-grab"
        )}
        {...attributes} 
        {...listeners}
      >
        <motion.div 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="touch-manipulation"
        >
          <GripVertical className={cn(
            "h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0",
            isDragging ? "text-primary" : "text-muted-foreground"
          )} />
        </motion.div>
        <div className="flex items-center gap-2 sm:gap-3 truncate flex-1 min-w-0">
          <div className="relative">
            <FileText className={cn(
              "h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0",
              isDragging ? "text-primary" : "text-primary/80"
            )} />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 min-w-0 flex-1">
            <span className={cn(
              "font-medium truncate text-sm sm:text-base",
              isDragging && "text-primary"
            )}>{file.name}</span>
            <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
              ({(file.size / (1024 * 1024)).toFixed(1)} MB)
            </span>
          </div>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onRemove(file)}
        className={cn(
          "h-7 w-7 sm:h-8 sm:w-8 hover:text-destructive hover:bg-destructive/10 flex-shrink-0 ml-1 sm:ml-2",
          "opacity-100 transition-opacity duration-200 touch-manipulation"
        )}
      >
        <X className="h-3 w-3 sm:h-4 sm:w-4" />
      </Button>
    </motion.div>
  );
});

// Add display name for the component
SortableFileItem.displayName = 'SortableFileItem';

// Optimized file processing function
const processFiles = async (files: FileItem[]): Promise<FormData> => {
  const formData = new FormData();
  
  for (const file of files) {
    try {
      const arrayBuffer = await file.file.arrayBuffer();
      const validationResult = await validatePDF(new Uint8Array(arrayBuffer));
      
      if (!validationResult.isValid) {
        throw new Error(`${file.name} is not a valid PDF: ${validationResult.error}`);
      }
      
      formData.append('files', file.file);
    } catch (error) {
      throw new Error(`Error processing ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  return formData;
};

// Add device detection
const getDeviceType = () => {
  const ua = navigator.userAgent;
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet';
  }
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
};

// Add optimized chunk size calculation
const calculateChunkSize = (fileSize: number, deviceType: string) => {
  if (deviceType === 'mobile') {
    // Smaller chunks for mobile devices
    return Math.min(Math.max(MIN_CHUNK_SIZE, Math.floor(fileSize / 10)), CHUNK_SIZE);
  }
  return CHUNK_SIZE;
};

// Add memory management
const checkMemoryUsage = async () => {
  if ('memory' in performance) {
    const memory = (performance as any).memory;
    if (memory.usedJSHeapSize > MEMORY_LIMIT) {
      // Force garbage collection if available
      if ('gc' in window) {
        try {
          (window as any).gc();
        } catch (e) {
          console.warn('Failed to force garbage collection');
        }
      }
      // Wait for memory to be freed
      await new Promise(resolve => setTimeout(resolve, 100));
    }
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
  const [processingPhase, setProcessingPhase] = useState<string>('');

  // Optimized sensors configuration for better mobile performance
  const sensors = useSensors(
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150, // Reduced delay for faster response
        tolerance: 5, // Reduced tolerance for better precision
        distance: 3, // Slightly higher distance to prevent accidental drags
      }
    }),
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Reduced distance for faster activation
        delay: 0 // No delay for pointer events
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

  const handleFileSelect = useCallback((uploadedFiles: File[]) => {
    if (!uploadedFiles?.length) return;

    const newFiles: FileItem[] = [];
    const errors: string[] = [];

    for (const file of uploadedFiles) {
      if (!file.type.includes('pdf')) {
        errors.push(`${file.name} is not a PDF file`);
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name} exceeds ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB limit`);
        continue;
      }

      newFiles.push({
        id: Math.random().toString(36).substring(7),
        name: file.name,
        size: file.size,
        type: file.type,
        file: file
      });
    }

    if (errors.length > 0) {
      toast({
        title: "Some files were not added",
        description: errors.join('\n'),
        variant: "destructive",
        duration: 5000,
      });
    }

    if (newFiles.length > 0) {
      setFiles(prevFiles => [...prevFiles, ...newFiles]);
    }
  }, [toast]);

  const handleRemoveFile = useCallback((fileToRemove: FileItem) => {
    setFiles(prevFiles => prevFiles.filter(f => f.id !== fileToRemove.id));
    
    // Reset states if no files remain
    if (files.length <= 1) {
      setMergeProgress(0);
      setIsComplete(false);
      if (mergedPdfUrl) {
        URL.revokeObjectURL(mergedPdfUrl);
        setMergedPdfUrl(null);
      }
    }
  }, [files.length, mergedPdfUrl]);

  const handleClearAll = useCallback(() => {
    setFiles([]);
    setMergeProgress(0);
    setIsComplete(false);
    if (mergedPdfUrl) {
      URL.revokeObjectURL(mergedPdfUrl);
      setMergedPdfUrl(null);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, [mergedPdfUrl]);

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

  // Progress simulation function
  const simulateProgress = useCallback((
    start: number, 
    end: number, 
    duration: number,
    progressInterval: NodeJS.Timeout | undefined,
    setProgress: (value: number) => void
  ) => {
    const step = (end - start) / (duration / 100); // Update every 100ms
    let currentProgress = start;
    
    return new Promise<NodeJS.Timeout>((resolve) => {
      const interval = setInterval(() => {
        currentProgress = Math.min(currentProgress + step, end);
        setProgress(Math.floor(currentProgress));
        
        if (currentProgress >= end) {
          clearInterval(interval);
          resolve(interval);
        }
      }, 100);
    });
  }, []);

  const handleMerge = useCallback(async (retryCount = 0) => {
    if (!files.length) return;

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      toast({
        title: "Error",
        description: `Total size exceeds ${(MAX_TOTAL_SIZE / (1024 * 1024)).toFixed(0)}MB limit`,
        variant: "destructive",
      });
      return;
    }

    setIsMerging(true);
    setMergeProgress(0);
    setProcessingPhase('Preparing files...');
    
    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();
    let progressInterval: NodeJS.Timeout | undefined;

    // Clear previous merged PDF URL
    if (mergedPdfUrl) {
      URL.revokeObjectURL(mergedPdfUrl);
      setMergedPdfUrl(null);
    }

    try {
      // Calculate expected processing time for better progress tracking
      const totalPages = await calculateTotalPages(files);
      const expectedProcessingTime = estimateProcessingTime(totalSize, totalPages, files.length);
      console.log(`[PDF Merge] Expected processing time: ${expectedProcessingTime}s`);

      // Stage 1: Initial preparation (0-15%) - Faster
      setProcessingPhase('Preparing files...');
      progressInterval = await simulateProgress(0, 15, 500, progressInterval, setMergeProgress);

      // Stage 2: File validation (15-30%) - Faster
      setProcessingPhase('Validating PDFs...');
      progressInterval = await simulateProgress(15, 30, 800, progressInterval, setMergeProgress);

      // Process files with progress tracking
      const formData = new FormData();
      files.forEach(file => formData.append('files', file.file));

      setProcessingPhase('Uploading files...');
      const response = await fetch("/api/merge", {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current?.signal,
        headers: {
          "X-Request-ID": Math.random().toString(36).substring(7),
          "X-Retry-Count": retryCount.toString(),
          "X-Total-Size": totalSize.toString(),
          "X-File-Count": files.length.toString(),
          "X-Device-Type": window.innerWidth < 768 ? 'mobile' : 'desktop',
          "X-Expected-Time": expectedProcessingTime.toString(),
          "X-Priority": "high"
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        const retryAfter = parseInt(response.headers.get('Retry-After') || '0');
        
        if (response.status === 503 && retryCount < RETRY_ATTEMPTS) {
          toast({
            title: "Retrying...",
            description: `Attempt ${retryCount + 1} of ${RETRY_ATTEMPTS}`,
            variant: "default",
          });

          await new Promise(resolve => setTimeout(resolve, retryAfter || RETRY_DELAY * Math.pow(2, retryCount)));
          return handleMerge(retryCount + 1);
        }

        throw new Error(errorData.error || "Failed to merge PDFs");
      }

      // Stage 3: Processing response (30-70%)
      setProcessingPhase('Merging PDFs...');
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Failed to get response reader");

      const chunks: Uint8Array[] = [];
      let receivedLength = 0;
      const contentLength = parseInt(response.headers.get('Content-Length') || '0');
      const startTime = Date.now();

      // Stage 4: Reading and processing chunks (70-90%)
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        receivedLength += value.length;
        
        // Calculate progress for chunk processing
        const chunkProgress = Math.min(
          70 + ((receivedLength / contentLength) * 20),
          90
        );
        setMergeProgress(Math.floor(chunkProgress));
      }

      // Stage 5: Final processing (90-98%)
      setProcessingPhase('Finalizing...');
      progressInterval = await simulateProgress(90, 98, 300, progressInterval, setMergeProgress);

      // Create blob and URL
      const blob = new Blob(chunks, { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      // Stage 6: Completion (98-100%)
      setProcessingPhase('Complete!');
      progressInterval = await simulateProgress(98, 100, 200, progressInterval, setMergeProgress);
      
      setMergedPdfUrl(url);
      setIsComplete(true);

      const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[PDF Merge] Actual processing time: ${processingTime}s`);

      toast({
        title: "Success!",
        description: `PDFs merged successfully (${(blob.size / (1024 * 1024)).toFixed(1)}MB)`,
        variant: "default",
      });

    } catch (error) {
      console.error("[PDF Merge] Error:", error);
      
      // Check if it's an abort error (cancellation)
      if (error instanceof Error && error.name === 'AbortError') {
        console.log("[PDF Merge] Request was cancelled");
        return;
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
        duration: 5000,
      });

      setIsComplete(false);
      setMergeProgress(0);
      setProcessingPhase('');
      if (mergedPdfUrl) {
        URL.revokeObjectURL(mergedPdfUrl);
        setMergedPdfUrl(null);
      }
    } finally {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      setIsMerging(false);
      setProcessingPhase('');
    }
      }, [files, mergedPdfUrl, toast, simulateProgress]);

  // Helper function to calculate total pages
  const calculateTotalPages = async (files: FileItem[]): Promise<number> => {
    let totalPages = 0;
    for (const file of files) {
      try {
        const arrayBuffer = await file.file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        totalPages += pdf.getPageCount();
      } catch (e) {
        console.warn('[PDF Merge] Error counting pages:', e);
        // Estimate pages based on file size if counting fails
        totalPages += Math.ceil(file.size / (100 * 1024)); // Assume 100KB per page
      }
    }
    return totalPages;
  };

  // Helper function to estimate processing time
  const estimateProcessingTime = (totalSize: number, totalPages: number, fileCount: number): number => {
    // Base processing time (in seconds)
    const baseTime = 2;
    
    // Size factor (1MB = 1 second)
    const sizeFactor = totalSize / (1024 * 1024);
    
    // Page factor (10 pages = 1 second)
    const pageFactor = totalPages / 10;
    
    // File count factor (each file adds 0.5 seconds)
    const fileFactor = fileCount * 0.5;
    
    // Device performance factor
    const isLowEndDevice = navigator.hardwareConcurrency <= 4;
    const deviceFactor = isLowEndDevice ? 1.5 : 1;
    
    // Calculate total estimated time
    const estimatedTime = (baseTime + sizeFactor + pageFactor + fileFactor) * deviceFactor;
    
    // Cap the maximum estimated time
    return Math.min(Math.max(estimatedTime, 5), 300); // Between 5 and 300 seconds
  };

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

  // Add custom scrollbar styles for better mobile experience
  const globalStyles = css`
    .custom-scrollbar {
      -webkit-overflow-scrolling: touch;
      scrollbar-width: thin;
      scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
    }
    
    .custom-scrollbar::-webkit-scrollbar {
      width: 6px;
    }
    
    .custom-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }
    
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background-color: rgba(0, 0, 0, 0.2);
      border-radius: 3px;
    }
    
    @media (pointer: coarse) {
      .custom-scrollbar::-webkit-scrollbar {
        width: 2px;
      }
    }
  `;

  const handleCancelMerge = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsMerging(false);
    setMergeProgress(0);
    setProcessingPhase('');
    toast({
      title: "Merge cancelled",
      description: "PDF merging has been cancelled",
      variant: "default",
    });
  }, [toast]);

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
      <div className="container mx-auto py-2 sm:py-6 px-2 sm:px-6 lg:max-w-4xl xl:max-w-5xl">
        <motion.div 
          variants={itemVariants} 
          className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-8"
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
              className="space-y-2 sm:space-y-4 lg:space-y-6"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-lg sm:rounded-xl blur-xl" />
                <div className="relative">
                  <FileUpload
                    onFilesSelected={handleFileSelect}
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
                <div className="space-y-2 sm:space-y-3 bg-card/95 p-2 sm:p-5 rounded-lg sm:rounded-xl shadow-lg border border-primary/20 backdrop-blur-sm">
                  <div className="space-y-2">
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
                  </div>

                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    modifiers={[restrictToVerticalAxis]}
                  >
                    <SortableContext
                      items={files}
                      strategy={verticalListSortingStrategy}
                    >
                      <motion.div 
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        className="space-y-1.5 max-h-[calc(100vh-400px)] sm:max-h-[250px] overflow-y-auto overscroll-contain custom-scrollbar touch-manipulation"
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
                      {!isMerging ? (
                        <Button
                          onClick={() => handleMerge(0)}
                          disabled={files.length < 2}
                          className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 transition-all duration-300 py-3 sm:py-4 text-sm sm:text-base"
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Merge {files.length} PDFs
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            onClick={handleCancelMerge}
                            variant="destructive"
                            className="flex-1 py-3 sm:py-4 text-sm sm:text-base"
                          >
                            <X className="mr-2 h-4 w-4" />
                            Cancel
                          </Button>
                        </div>
                      )}

                      {isMerging && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="space-y-1.5"
                        >
                          <div className="relative h-1.5 w-full bg-primary/20 rounded-full overflow-hidden">
                            <motion.div
                              className="absolute left-0 top-0 h-full bg-primary rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${mergeProgress}%` }}
                              transition={{
                                type: "spring",
                                stiffness: 100,
                                damping: 30,
                                restDelta: 0.001
                              }}
                            />
                            <motion.div
                              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                              initial={{ x: '-100%' }}
                              animate={{ 
                                x: '100%',
                                transition: {
                                  repeat: Infinity,
                                  duration: 1.5,
                                  ease: "linear"
                                }
                              }}
                            />
                          </div>
                          <motion.p 
                            className="text-xs text-muted-foreground text-center"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                          >
                            {processingPhase} {Math.round(mergeProgress)}%
                          </motion.p>
                        </motion.div>
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