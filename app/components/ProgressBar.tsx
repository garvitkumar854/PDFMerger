'use client';

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence, useSpring } from 'framer-motion';

export type ProgressStage = 'uploading' | 'preparing' | 'validating' | 'processing' | 'merging' | 'finalizing' | 'complete' | 'idle';

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

  useEffect(() => {
    progressSpring.set(progress);
  }, [progress, progressSpring]);

  // Get stage color
  const getStageColor = (stage: ProgressStage) => {
    switch (stage) {
      case 'uploading':
        return 'bg-blue-400';
      case 'preparing':
        return 'bg-blue-500';
      case 'validating':
        return 'bg-purple-500';
      case 'processing':
        return 'bg-green-500';
      case 'merging':
        return 'bg-yellow-500';
      case 'finalizing':
        return 'bg-orange-500';
      case 'complete':
        return 'bg-emerald-500';
      default:
        return 'bg-gray-500';
    }
  };

  // Get stage text
  const getStageText = (stage: ProgressStage) => {
    switch (stage) {
      case 'uploading':
        return 'Uploading files...';
      case 'preparing':
        return 'Preparing files...';
      case 'validating':
        return 'Validating PDFs...';
      case 'processing':
        return `Processing file ${currentFile} of ${totalFiles}`;
      case 'merging':
        return 'Merging PDFs...';
      case 'finalizing':
        return 'Finalizing...';
      case 'complete':
        return 'Complete!';
      default:
        return 'Ready';
    }
  };

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
        <AnimatePresence mode="wait">
          <motion.span
            key={stage}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2 }}
          >
            {getStageText(stage)}
          </motion.span>
        </AnimatePresence>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full dark:bg-gray-700 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${getStageColor(stage)}`}
          style={{ width: `${progress}%` }}
          transition={{ type: "spring", stiffness: 100, damping: 30 }}
        />
      </div>
    </div>
  );
};

export default ProgressBar; 