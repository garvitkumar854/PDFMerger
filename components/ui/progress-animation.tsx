import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Loader2, CheckCircle2, AlertCircle, Clock, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useRef } from 'react';

interface ProgressAnimationProps {
  progress: number;
  status: 'idle' | 'processing' | 'success' | 'error';
  currentStage?: string;
  totalFiles?: number;
  processedFiles?: number;
  className?: string;
  stageProgress?: { [key: string]: number };
  details?: {
    pagesProcessed: number;
    totalPages: number;
    currentFilePages: number;
    bytesProcessed: number;
    totalBytes: number;
    timeElapsed: number;
    estimatedTimeRemaining: number;
    currentStage: number;
    totalStages: number;
  };
}

// Predefined progress points for smoother transitions
const PROGRESS_POINTS = [10, 25, 30, 45, 58, 69, 75, 89, 95, 99, 100];

// Format time in seconds to human readable format with millisecond precision
const formatTime = (ms: number) => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
};

// Optimized bytes formatter with caching
const formatBytes = (() => {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const cache = new Map<number, string>();

  return (bytes: number) => {
    if (cache.has(bytes)) return cache.get(bytes)!;
    if (bytes === 0) return '0 B';
    
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const result = `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
    cache.set(bytes, result);
    return result;
  };
})();

// Calculate processing speed with smoothing
const calculateSpeed = (bytesProcessed: number, timeElapsed: number) => {
  const speed = bytesProcessed / (timeElapsed / 1000);
  return formatBytes(Math.round(speed));
};

export function ProgressAnimation({
  progress,
  status,
  currentStage = 'processing',
  totalFiles = 0,
  processedFiles = 0,
  className,
  stageProgress,
  details
}: ProgressAnimationProps) {
  // Use motion values for smooth animations
  const progressValue = useMotionValue(0);
  const roundedProgress = useTransform(progressValue, Math.round);
  const displayProgress = useTransform(roundedProgress, v => `${Math.min(v, 100)}%`);
  
  // Reference for tracking previous progress
  const prevProgressRef = useRef(0);
  
  // Smooth progress animation
  useEffect(() => {
    // Find the next target progress point
    const targetProgress = PROGRESS_POINTS.find(p => p >= progress) ?? progress;
    
    // Only animate if we're moving forward
    if (targetProgress > prevProgressRef.current) {
      animate(progressValue, targetProgress, {
        duration: 0.5,
        ease: "easeOut"
      });
      prevProgressRef.current = targetProgress;
    }
  }, [progress, progressValue]);

  return (
    <div className={cn("relative w-full", className)}>
      {/* Main progress bar with optimized animations */}
      <div className="relative h-4 w-full overflow-hidden rounded-full bg-secondary/20">
        <motion.div
          className="h-full bg-primary"
          style={{ width: progressValue.get() + '%' }}
          animate={{ 
            width: progress + '%',
            transition: { 
              type: "spring", 
              stiffness: 100, 
              damping: 30,
              mass: 0.5 
            }
          }}
        />
        
        {/* Optimized gradient animation */}
        {status === 'processing' && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            initial={{ x: '-100%' }}
            animate={{ 
              x: '100%',
              transition: {
                repeat: Infinity,
                duration: 1,
                ease: "linear"
              }
            }}
          />
        )}
      </div>

      {/* Progress details with optimized rendering */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500 }}
            >
              {status === 'processing' && (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              )}
              {status === 'success' && (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              {status === 'error' && (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
            </motion.div>
            <motion.span 
              className="text-sm font-medium"
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500 }}
            >
              {status === 'processing' ? currentStage 
                : status === 'success' ? 'Complete' 
                : 'Error'}
            </motion.span>
          </div>
          
          {/* Optimized file counter */}
          {totalFiles > 0 && (
            <motion.p 
              className="text-xs text-muted-foreground"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 500 }}
            >
              Processing file {processedFiles} of {totalFiles}
            </motion.p>
          )}

          {/* Enhanced progress details with optimized updates */}
          {details && (
            <motion.div 
              className="space-y-1 text-xs text-muted-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="flex items-center gap-2">
                <FileText className="h-3 w-3" />
                <span>
                  {details.pagesProcessed.toLocaleString()} / {details.totalPages.toLocaleString()} pages
                  ({formatBytes(details.bytesProcessed)} / {formatBytes(details.totalBytes)})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3" />
                <span>
                  {formatTime(details.timeElapsed)} elapsed
                  {details.estimatedTimeRemaining > 0 && 
                    ` • ${formatTime(details.estimatedTimeRemaining)} remaining`}
                </span>
              </div>
            </motion.div>
          )}
        </div>

        {/* Optimized percentage counter */}
        <div className="flex flex-col items-end justify-between">
          <motion.div
            className="text-2xl font-bold tabular-nums"
            style={{ opacity: progressValue.get() > 0 ? 1 : 0 }}
          >
            {displayProgress}
          </motion.div>

          {/* Optimized speed indicator */}
          {details && details.bytesProcessed > 0 && (
            <motion.div 
              className="text-xs text-muted-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {calculateSpeed(details.bytesProcessed, details.timeElapsed)}/s
            </motion.div>
          )}
        </div>
      </div>

      {/* Stage progress indicators */}
      {details && (
        <div className="mt-4 flex gap-1">
          {Array.from({ length: details.totalStages }).map((_, i) => (
            <motion.div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full",
                i < details.currentStage ? "bg-primary" : "bg-secondary/20"
              )}
              initial={{ scaleX: 0 }}
              animate={{ 
                scaleX: i <= details.currentStage ? 1 : 0,
                transition: { 
                  type: "spring",
                  stiffness: 500,
                  damping: 30,
                  delay: i * 0.1
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
} 