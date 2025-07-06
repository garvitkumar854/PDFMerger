'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProgressAnimation } from './progress-animation';
import { ProcessingProgress } from '@/lib/services/pdf-service';

const DEFAULT_CONFIG = {
  MAX_FILES: 20,
  MAX_FILE_SIZE: 25 * 1024 * 1024,    // 25MB per file (production-optimized)
  MAX_TOTAL_SIZE: 50 * 1024 * 1024,   // 50MB total (production-optimized)
  ALLOWED_TYPES: ['application/pdf'],
  CHUNK_SIZE: 2 * 1024 * 1024,        // 2MB chunks
  PARALLEL_UPLOADS: 3,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  UPLOAD_TIMEOUT: 60000,              // 60 seconds
  PROCESSING_TIMEOUT: 90000,          // 90 seconds
};

// Helper function to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

// Enhanced FileUploadLimits component for better mobile display
const FileUploadLimits = ({ isMobile }: { isMobile: boolean }) => (
  <div className="space-y-1 text-xs sm:text-sm text-muted-foreground/80">
    <div className={cn(
      "flex items-center justify-center gap-1 sm:gap-4 text-center",
      isMobile ? "flex-col gap-0.5" : "flex-row"
    )}>
      <span className={cn(
        "whitespace-nowrap",
        isMobile && "text-xs"
      )}>📄 Max {DEFAULT_CONFIG.MAX_FILES} files</span>
      <span className={cn(
        "whitespace-nowrap",
        isMobile && "text-xs"
      )}>📦 {formatFileSize(DEFAULT_CONFIG.MAX_FILE_SIZE)}/file</span>
      <span className={cn(
        "whitespace-nowrap",
        isMobile && "text-xs"
      )}>💾 {formatFileSize(DEFAULT_CONFIG.MAX_TOTAL_SIZE)} total</span>
    </div>
  </div>
);

export interface FileUploadProps {
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
  currentTotalSize?: number;
  currentFileCount?: number;
  onProgress?: (progress: number) => void;
}

// Update the validation function
const validateFiles = async (files: File[], currentTotalSize = 0, currentFileCount = 0) => {
  const validFiles: File[] = [];
  const invalidFiles: { file: File; reason: string }[] = [];
  let newTotalSize = currentTotalSize;

  // Check file count limit
  if (files.length + currentFileCount > DEFAULT_CONFIG.MAX_FILES) {
    return {
      valid: false,
      validFiles: [],
      invalidFiles: [],
      error: new Error(
        `Cannot add more files. Maximum ${DEFAULT_CONFIG.MAX_FILES} files allowed ` +
        `(currently have ${currentFileCount} files)`
      )
    };
  }

  // Check total size limit
  const potentialTotalSize = files.reduce((sum, file) => sum + file.size, 0) + currentTotalSize;
  if (potentialTotalSize > DEFAULT_CONFIG.MAX_TOTAL_SIZE) {
    return {
      valid: false,
      validFiles: [],
      invalidFiles: [],
      error: new Error(
        `Total size would exceed ${formatFileSize(DEFAULT_CONFIG.MAX_TOTAL_SIZE)} limit ` +
        `(${formatFileSize(potentialTotalSize)} > ${formatFileSize(DEFAULT_CONFIG.MAX_TOTAL_SIZE)})`
      )
    };
  }

  for (const file of files) {
    // Validate file type
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      invalidFiles.push({ 
        file, 
        reason: 'Not a valid PDF file' 
      });
      continue;
    }

    // Validate file size
    if (file.size > DEFAULT_CONFIG.MAX_FILE_SIZE) {
      invalidFiles.push({ 
        file, 
        reason: `File size exceeds ${formatFileSize(DEFAULT_CONFIG.MAX_FILE_SIZE)} limit ` +
                `(${formatFileSize(file.size)})` 
      });
      continue;
    }

    // If all checks pass, add to valid files
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

interface ProcessingStage {
  name: string;
  weight: number;  // Percentage weight of total progress
  autoProgress: boolean;  // Whether this stage should auto-progress or wait for actual progress
}

const PROCESSING_STAGES: ProcessingStage[] = [
  { name: 'preparing', weight: 10, autoProgress: true },
  { name: 'validating', weight: 20, autoProgress: false },
  { name: 'merging', weight: 40, autoProgress: false },
  { name: 'optimizing', weight: 20, autoProgress: false },
  { name: 'finishing', weight: 10, autoProgress: true }
];

interface StageWeight {
  weight: number;
  threshold: number;
  speedFactor: number;
}

const STAGE_WEIGHTS: Record<string, StageWeight> = {
  preparing: { weight: 10, threshold: 5, speedFactor: 1.5 },
  validating: { weight: 20, threshold: 15, speedFactor: 1.2 },
  merging: { weight: 40, threshold: 30, speedFactor: 1.0 },
  optimizing: { weight: 20, threshold: 15, speedFactor: 1.3 },
  finishing: { weight: 10, threshold: 5, speedFactor: 1.8 }
};

export function FileUpload({
  onFilesSelected,
  maxFiles = DEFAULT_CONFIG.MAX_FILES,
  acceptedFileTypes = DEFAULT_CONFIG.ALLOWED_TYPES,
  className = "",
  hideFileList = false,
  onError,
  customText,
  currentTotalSize = 0,
  currentFileCount = 0,
  onProgress,
}: FileUploadProps) {
  const [isValidating, setIsValidating] = useState(false);
  const [dragMessage, setDragMessage] = useState<string>('');
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [currentStage, setCurrentStage] = useState('preparing');
  const [processedFiles, setProcessedFiles] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [progress, setProgress] = useState(0);
  const [stageProgress, setStageProgress] = useState<{ [key: string]: number }>({});
  const [processingDetails, setProcessingDetails] = useState<ProcessingProgress['details']>();
  const processingRef = useRef(false);
  const stageStartTimeRef = useRef<number>(0);
  const currentStageIndexRef = useRef(0);
  const lastUpdateRef = useRef<number>(0);
  const progressHistoryRef = useRef<Array<{ time: number; progress: number }>>([]);
  const stageProgressRef = useRef<{ [key: string]: number }>({});
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      const ua = navigator.userAgent;
      const isMobileDevice = /Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua) || window.innerWidth < 768;
      setIsMobile(isMobileDevice);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Calculate overall progress based on stage weights and progress
  const calculateOverallProgress = useCallback((currentStageIndex: number, currentProgress: number) => {
    let totalProgress = 0;
    
    // Add completed stages
    for (let i = 0; i < currentStageIndex; i++) {
      totalProgress += PROCESSING_STAGES[i].weight;
    }
    
    // Add current stage progress
    const currentStageWeight = PROCESSING_STAGES[currentStageIndex].weight;
    totalProgress += (currentProgress / 100) * currentStageWeight;
    
    return Math.min(totalProgress, 99);
  }, []);

  // Update progress for current stage
  const updateStageProgress = useCallback((stageName: string, progress: number) => {
    setStageProgress(prev => {
      const newStageProgress = {
      ...prev,
      [stageName]: progress
      };
      // Also update the ref to avoid dependency issues
      stageProgressRef.current = newStageProgress;
      return newStageProgress;
    });
  }, []);

  // Calculate progress rate based on history
  const calculateProgressRate = useCallback(() => {
    const history = progressHistoryRef.current;
    if (history.length < 2) return 1;

    const recent = history.slice(-5);
    const timeSpan = recent[recent.length - 1].time - recent[0].time;
    const progressSpan = recent[recent.length - 1].progress - recent[0].progress;

    if (timeSpan === 0) return 1;
    return Math.max(0.1, progressSpan / timeSpan);
  }, []);

  // Animate progress
  const animateProgress = useCallback(() => {
    if (!processingRef.current) return;

    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;
    const progressRate = calculateProgressRate();
    const speedFactor = STAGE_WEIGHTS[currentStage]?.speedFactor || 1;
    
    // Calculate new progress
    const progressIncrement = (progressRate * timeSinceLastUpdate * speedFactor) / 1000;
    const newProgress = Math.min(
      stageProgressRef.current[currentStage] + progressIncrement,
      100
    );

    // Update stage progress
    updateStageProgress(currentStage, newProgress);

    // Check if stage is complete
    if (newProgress >= 100) {
      const nextStageIndex = currentStageIndexRef.current + 1;
      if (nextStageIndex < PROCESSING_STAGES.length) {
        currentStageIndexRef.current = nextStageIndex;
        const nextStage = PROCESSING_STAGES[nextStageIndex];
        setCurrentStage(nextStage.name);
        updateStageProgress(nextStage.name, 0);
        stageStartTimeRef.current = now;
      } else {
        // All stages complete
        processingRef.current = false;
        setProcessingStatus('success');
        return;
      }
    }

    // Calculate overall progress
    const overallProgress = calculateOverallProgress(currentStageIndexRef.current, newProgress);
    
    // Update progress history
    progressHistoryRef.current.push({ time: now, progress: overallProgress });
    if (progressHistoryRef.current.length > 10) {
      progressHistoryRef.current.shift();
    }

    // Ensure progress never goes backwards
    setProgress(prev => Math.max(prev, Math.min(overallProgress, 99)));
    onProgress?.(overallProgress);

    lastUpdateRef.current = now;
  }, [calculateProgressRate, onProgress, currentStage, updateStageProgress, calculateOverallProgress]);

  const handleFilesSelected = useCallback(async (newFiles: File[]) => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      setIsValidating(true);
      setProcessingStatus('processing');

      const validationResult = await validateFiles(newFiles, currentTotalSize, currentFileCount);

      if (!validationResult.valid) {
        setProcessingStatus('error');
        if (validationResult.error) {
          onError?.(validationResult.error.message);
        } else if (validationResult.invalidFiles.length > 0) {
          const messages = validationResult.invalidFiles.map(
            ({ file, reason }) => `❌ ${file.name}: ${reason}`
          );
          onError?.(messages.join('\n'));
        }
        return;
      }

      if (validationResult.validFiles.length > 0) {
        onFilesSelected(validationResult.validFiles);
        setProcessingStatus('success');
      }
    } catch (error) {
      setProcessingStatus('error');
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
    noDrag: isValidating,
    onDragEnter: () => setDragMessage('Drop PDFs here'),
    onDragLeave: () => setDragMessage(''),
  });

  // Extract only the necessary props from getRootProps
  const { ref, ...rootProps } = getRootProps();

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div {...rootProps}>
        <motion.div
          ref={ref}
          initial={false}
          animate={{ 
            scale: isDragActive ? 1.02 : 1,
            y: isDragActive ? -4 : 0
          }}
          whileHover={{ scale: 1.005 }}
          transition={{ 
            type: "spring",
            stiffness: 500,
            damping: 30,
            mass: 0.5
          }}
          style={{ transform: 'none' }}
          className={cn(
            "relative overflow-hidden rounded-lg sm:rounded-xl border-2 group/upload touch-manipulation",
            isDragActive 
              ? "border-primary bg-primary/5" 
              : "border-muted/40",
            "transition-all duration-200 ease-out bg-background/95 shadow-lg backdrop-blur-sm",
            // Mobile-specific padding
            isMobile ? "p-1" : "p-1.5 sm:p-[14px]"
          )}
        >
          {/* Progress Animation */}
          {isValidating && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/95 backdrop-blur-sm p-4 sm:p-6">
              <ProgressAnimation
                progress={progress}
                status={processingStatus}
                currentStage={currentStage}
                totalFiles={totalFiles}
                processedFiles={processedFiles}
                stageProgress={stageProgress}
                details={processingDetails}
                className="max-w-md mx-auto"
              />
            </div>
          )}

          {/* Inner dotted border - Only show on hover */}
          <div className={cn(
            "absolute rounded-lg border-[2px] border-dashed",
            isDragActive 
              ? "border-primary opacity-100 scale-100" 
              : "border-blue-500/60 opacity-0 scale-95 group-hover/upload:scale-100 group-hover/upload:opacity-100",
            "transition-all duration-200 ease-out transform-gpu",
            // Mobile-specific positioning
            isMobile ? "inset-1" : "inset-2 sm:inset-[14px]"
          )} />

          {/* Content wrapper */}
          <div className={cn(
            "relative",
            isMobile ? "px-2 py-3" : "px-3 sm:px-7 py-4 sm:py-9"
          )}>
            <input {...getInputProps()} />
            
            <div className="relative flex flex-col items-center justify-center gap-3 sm:gap-8">
              {/* Icon with animation */}
              <motion.div
                initial={false}
                animate={{ 
                  y: isDragActive ? -8 : 0,
                  scale: isDragActive ? 1.1 : 1,
                  rotate: isValidating ? 360 : 0
                }}
                transition={{ 
                  type: "spring",
                  stiffness: 500,
                  damping: 30,
                  mass: 0.5,
                  rotate: {
                    repeat: Infinity,
                    duration: isValidating ? 2 : 0,
                    ease: "linear"
                  }
                }}
                className="relative transform-gpu"
              >
                <div className="relative">
                  {isValidating ? (
                    <Loader2 className={cn(
                      "text-primary animate-spin",
                      isMobile ? "h-8 w-8" : "h-10 w-10 sm:h-16 sm:w-16"
                    )} />
                  ) : (
                    <Upload className={cn(
                      isDragActive 
                        ? "text-primary" 
                        : "text-muted-foreground group-hover/upload:text-primary/80",
                      "transition-colors duration-200 ease-out",
                      isMobile ? "h-8 w-8" : "h-10 w-10 sm:h-16 sm:w-16"
                    )} />
                  )}
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: isDragActive && !isValidating ? 1 : 0 }}
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

              {/* Main text content */}
              <div className="space-y-2 text-center">
                <motion.h3 
                  className={cn(
                    "font-semibold",
                    isMobile ? "text-sm" : "text-base sm:text-lg"
                  )}
                  animate={{ 
                    scale: isValidating ? [1, 1.02, 1] : 1,
                    opacity: isValidating ? [1, 0.7, 1] : 1
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                >
                  {isValidating 
                    ? 'Processing files...' 
                    : (isDragActive ? dragMessage : customText?.main || 'Drop PDFs here')}
                </motion.h3>
                <p className={cn(
                  "text-muted-foreground",
                  isMobile ? "text-xs" : "text-xs sm:text-sm"
                )}>
                  {isValidating 
                    ? `${Math.round(progress)}% complete...`
                    : (customText?.details || 'or click to select files')}
                </p>
              </div>

              {/* Display limits */}
              <FileUploadLimits isMobile={isMobile} />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
} 