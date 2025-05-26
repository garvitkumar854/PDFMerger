'use client';

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence, useSpring } from 'framer-motion';

type ProgressStage = 'uploading' | 'processing' | 'merging' | 'finalizing' | 'complete' | 'idle';

interface ProgressBarProps {
  progress: number;
  isProcessing: boolean;
  totalFiles: number;
  currentFile: number;
  stage: ProgressStage;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ 
  progress, 
  isProcessing, 
  totalFiles,
  currentFile,
  stage 
}) => {
  const progressSpring = useSpring(0, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  const prevStageRef = useRef<ProgressStage>('idle');
  const stageProgress = useRef<{ [key in ProgressStage]: number }>({
    idle: 0,
    uploading: 0,
    processing: 0,
    merging: 0,
    finalizing: 0,
    complete: 100
  });

  // Update progress spring smoothly
  useEffect(() => {
    progressSpring.set(progress);
  }, [progress, progressSpring]);

  // Handle stage transitions
  useEffect(() => {
    if (stage !== prevStageRef.current) {
      // Store progress for the previous stage
      stageProgress.current[prevStageRef.current] = progress;
      prevStageRef.current = stage;
    }
  }, [stage, progress]);

  // Calculate the progress text to display
  const getProgressText = () => {
    if (!isProcessing) return 'Ready to merge';
    
    switch (stage) {
      case 'uploading':
        return `Uploading file ${currentFile} of ${totalFiles} (${Math.round(progress)}%)`;
      case 'processing':
        return `Processing files (${Math.round(progress)}%)`;
      case 'merging':
        return `Merging PDFs (${Math.round(progress)}%)`;
      case 'finalizing':
        return 'Finalizing your PDF...';
      case 'complete':
        return 'Merge complete!';
      default:
        return `Processing file ${currentFile} of ${totalFiles} (${Math.round(progress)}%)`;
    }
  };

  // Get stage-specific color
  const getStageColor = () => {
    switch (stage) {
      case 'uploading':
        return 'bg-blue-500';
      case 'processing':
        return 'bg-purple-500';
      case 'merging':
        return 'bg-green-500';
      case 'finalizing':
        return 'bg-yellow-500';
      case 'complete':
        return 'bg-emerald-500';
      default:
        return 'bg-blue-500';
    }
  };

  return (
    <div className="w-full space-y-2">
      <div className="relative h-4 w-full bg-gray-200 rounded-full overflow-hidden">
        <motion.div
          className={`h-full ${getStageColor()}`}
          style={{ width: progressSpring }}
          transition={{
            type: "spring",
            stiffness: 100,
            damping: 30
          }}
        />
        {/* Animated gradient overlay for processing effect */}
        <AnimatePresence>
          {isProcessing && progress < 100 && (
            <motion.div
              initial={{ x: '-100%', opacity: 0 }}
              animate={{ 
                x: '100%', 
                opacity: [0, 1, 1, 0],
                transition: {
                  x: {
                    repeat: Infinity,
                    duration: 1.5,
                    ease: "linear"
                  },
                  opacity: {
                    repeat: Infinity,
                    duration: 1.5,
                    times: [0, 0.2, 0.8, 1]
                  }
                }
              }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            />
          )}
        </AnimatePresence>
      </div>
      <motion.div 
        className="text-sm text-gray-600 text-center"
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        key={stage} // Trigger animation on stage change
        transition={{
          duration: 0.2,
          ease: "easeOut"
        }}
      >
        {getProgressText()}
      </motion.div>
    </div>
  );
};

export default ProgressBar; 