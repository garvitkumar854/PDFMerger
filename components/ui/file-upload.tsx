'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProgressAnimation } from './progress-animation';
import { ProcessingProgress } from '@/lib/services/pdf-service';

// Add these constants at the top level to match the server limits
const LIMITS = {
  MAX_TOTAL_SIZE: 100 * 1024 * 1024,  // 100MB total limit (reduced from 200MB)
  MAX_FILE_SIZE: 50 * 1024 * 1024,    // 50MB per file (reduced from 100MB)
  MAX_FILES: 20                        // Max 20 files
};

// Helper function to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

// Add this component after the LIMITS constant
const FileUploadLimits = () => (
  <div className="space-y-1 text-xs sm:text-sm text-muted-foreground/80">
    <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-4 text-center">
      <span>📄 Max {LIMITS.MAX_FILES} files</span>
      <span>📦 {formatFileSize(LIMITS.MAX_FILE_SIZE)}/file</span>
      <span>💾 {formatFileSize(LIMITS.MAX_TOTAL_SIZE)} total</span>
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
  if (files.length + currentFileCount > LIMITS.MAX_FILES) {
    return {
      valid: false,
      validFiles: [],
      invalidFiles: [],
      error: new Error(
        `Cannot add more files. Maximum ${LIMITS.MAX_FILES} files allowed ` +
        `(currently have ${currentFileCount} files)`
      )
    };
  }

  // Check total size limit
  const potentialTotalSize = files.reduce((sum, file) => sum + file.size, 0) + currentTotalSize;
  if (potentialTotalSize > LIMITS.MAX_TOTAL_SIZE) {
    return {
      valid: false,
      validFiles: [],
      invalidFiles: [],
      error: new Error(
        `Total size would exceed ${formatFileSize(LIMITS.MAX_TOTAL_SIZE)} limit ` +
        `(${formatFileSize(potentialTotalSize)} > ${formatFileSize(LIMITS.MAX_TOTAL_SIZE)})`
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
    if (file.size > LIMITS.MAX_FILE_SIZE) {
      invalidFiles.push({ 
        file, 
        reason: `File size exceeds ${formatFileSize(LIMITS.MAX_FILE_SIZE)} limit ` +
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
  maxFiles = LIMITS.MAX_FILES,
  acceptedFileTypes = ['application/pdf'],
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

  // Calculate progress rate
  const calculateProgressRate = useCallback(() => {
    const history = progressHistoryRef.current;
    if (history.length < 2) return 0;

    const timeWindow = 1000; // Look at last second
    const now = Date.now();
    const recentHistory = history.filter(h => now - h.time < timeWindow);
    
    if (recentHistory.length < 2) return 0;

    const first = recentHistory[0];
    const last = recentHistory[recentHistory.length - 1];
    const progressDiff = last.progress - first.progress;
    const timeDiff = last.time - first.time;

    return (progressDiff / timeDiff) * 1000; // Progress per second
  }, []);

  // Progress simulation with dynamic stages
  useEffect(() => {
    let animationFrame: number;
    
    if (isValidating) {
      setProcessingStatus('processing');
      setTotalFiles(currentFileCount || 0);
      stageStartTimeRef.current = Date.now();
      currentStageIndexRef.current = 0;
      
      const animate = () => {
        const currentStage = PROCESSING_STAGES[currentStageIndexRef.current];
        
        if (!currentStage) {
          setProgress(100);
          setProcessingStatus('success');
          return;
        }

        const currentTime = Date.now();
        const elapsed = currentTime - stageStartTimeRef.current;
        
        // For auto-progress stages, simulate progress
        if (currentStage.autoProgress) {
          const duration = currentStage.weight * 50; // Faster for auto-progress stages
          const stageProgress = Math.min((elapsed / duration) * 100, 100);
          
          updateStageProgress(currentStage.name, stageProgress);
          
          if (stageProgress >= 100) {
            currentStageIndexRef.current++;
            stageStartTimeRef.current = currentTime;
          }
          
          const overallProgress = calculateOverallProgress(
            currentStageIndexRef.current,
            stageProgress
          );
          
          setProgress(overallProgress);
          setCurrentStage(currentStage.name);
          onProgress?.(overallProgress);
        } else {
          // For non-auto stages, use the progress from stageProgress state
          // Use a ref to avoid dependency issues
          const currentProgress = stageProgressRef.current[currentStage.name] || 0;
          
          if (currentProgress >= 100) {
            currentStageIndexRef.current++;
            stageStartTimeRef.current = currentTime;
          }
          
          const overallProgress = calculateOverallProgress(
            currentStageIndexRef.current,
            currentProgress
          );
          
          setProgress(overallProgress);
          setCurrentStage(currentStage.name);
          onProgress?.(overallProgress);
        }
        
        if (currentStageIndexRef.current < PROCESSING_STAGES.length) {
          animationFrame = requestAnimationFrame(animate);
        }
      };
      
      animationFrame = requestAnimationFrame(animate);
    } else {
      setProgress(0);
      setProcessingStatus('idle');
      setCurrentStage('preparing');
      setProcessedFiles(0);
      setStageProgress({});
      currentStageIndexRef.current = 0;
    }
    
    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [isValidating, currentFileCount, onProgress, calculateOverallProgress, updateStageProgress]);

  // Update stage progress from external events
  const updateProgress = useCallback((stage: string, progress: number) => {
    updateStageProgress(stage, progress);
  }, [updateStageProgress]);

  // Handle processing progress with dynamic rate adjustment
  const handleProgress = useCallback((progressData: ProcessingProgress) => {
    const now = Date.now();
    const { stage, progress: rawProgress, details } = progressData;

    // Update processing details
    setProcessingDetails(details);
    setCurrentStage(stage);
    setProcessedFiles(progressData.fileIndex);
    setTotalFiles(progressData.totalFiles);

    // Store progress history
    progressHistoryRef.current.push({ time: now, progress: rawProgress });
    // Keep only last 5 seconds of history
    progressHistoryRef.current = progressHistoryRef.current.filter(
      h => now - h.time < 5000
    );

    // Calculate stage-specific progress
    const stageWeight = STAGE_WEIGHTS[stage];
    if (!stageWeight) return;

    // Calculate progress rate and adjust based on stage characteristics
    const progressRate = calculateProgressRate();
    const adjustedProgress = Math.min(
      rawProgress * stageWeight.speedFactor,
      100
    );

    // Update stage progress
    setStageProgress(prev => {
      const newStageProgress = {
      ...prev,
      [stage]: adjustedProgress
      };
      // Also update the ref to avoid dependency issues
      stageProgressRef.current = newStageProgress;
      return newStageProgress;
    });

    // Calculate overall progress with dynamic weighting
    const stages = Object.keys(STAGE_WEIGHTS);
    const currentStageIndex = stages.indexOf(stage);
    let totalProgress = 0;

    // Add completed stages
    for (let i = 0; i < currentStageIndex; i++) {
      const completedStage = stages[i];
      totalProgress += STAGE_WEIGHTS[completedStage].weight;
    }

    // Add current stage progress
    const currentWeight = stageWeight.weight;
    const progressContribution = (adjustedProgress / 100) * currentWeight;

    // Apply threshold-based acceleration
    const thresholdFactor = progressRate > stageWeight.threshold ? 1.2 : 1;
    totalProgress += progressContribution * thresholdFactor;

    // Ensure progress never goes backwards
    setProgress(prev => Math.max(prev, Math.min(totalProgress, 99)));
    onProgress?.(totalProgress);

    lastUpdateRef.current = now;
  }, [calculateProgressRate, onProgress]);

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
            "relative overflow-hidden rounded-lg sm:rounded-xl border-2 group/upload p-1.5 sm:p-[14px]",
            isDragActive 
              ? "border-primary bg-primary/5" 
              : "border-muted/40",
            "transition-all duration-200 ease-out bg-background/95 shadow-lg backdrop-blur-sm touch-manipulation"
          )}
        >
          {/* Progress Animation */}
          {isValidating && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/95 backdrop-blur-sm p-6">
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
            "inset-2 sm:inset-[14px]",
            isDragActive 
              ? "border-primary opacity-100 scale-100" 
              : "border-blue-500/60 opacity-0 scale-95 group-hover/upload:scale-100 group-hover/upload:opacity-100",
            "transition-all duration-200 ease-out transform-gpu"
          )} />

          {/* Content wrapper */}
          <div className="relative px-3 sm:px-7 py-4 sm:py-9">
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
                    <Loader2 className="h-10 w-10 sm:h-16 sm:w-16 text-primary animate-spin" />
                  ) : (
                    <Upload className={cn(
                      "h-10 w-10 sm:h-16 sm:w-16",
                      isDragActive 
                        ? "text-primary" 
                        : "text-muted-foreground group-hover/upload:text-primary/80",
                      "transition-colors duration-200 ease-out"
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
                  className="text-base sm:text-lg font-semibold"
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
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {isValidating 
                    ? `${Math.round(progress)}% complete...`
                    : (customText?.details || 'or click to select files')}
                </p>
              </div>

              {/* Display limits */}
              <FileUploadLimits />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
} 