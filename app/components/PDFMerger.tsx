import React, { useState, useCallback, useMemo } from 'react';
import { FileWithPath } from 'react-dropzone';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { DndContext, DragEndEvent } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove } from '@dnd-kit/sortable';
import FileDropzone from './FileDropzone';
import SortableFileItem from './SortableFileItem';
import ProgressBar from './ProgressBar';
import { ErrorHandler } from '@/lib/utils/error-handler';
import { RequestValidator } from '@/lib/validation/request';
import { useToast } from '@/components/ui/use-toast';

type ProgressStage = 'uploading' | 'processing' | 'merging' | 'finalizing' | 'complete' | 'idle';

// Extend Navigator interface for deviceMemory
interface ExtendedNavigator extends Navigator {
  deviceMemory?: number;
}

const PDFMerger: React.FC = () => {
  const [files, setFiles] = useState<FileWithPath[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<ProgressStage>('idle');
  const { toast } = useToast();

  // Memoized validation
  const validationResult = useMemo(() => {
    if (files.length === 0) return { isValid: false, error: null };
    return RequestValidator.validateFiles(files);
  }, [files]);

  const handleDrop = useCallback((acceptedFiles: FileWithPath[]) => {
    try {
      // Validate new files
      const validation = RequestValidator.validateFiles(acceptedFiles);
      if (!validation.success) {
        toast({
          title: "Invalid files",
          description: validation.error,
          variant: "destructive",
        });
        return;
      }

      // Check total files limit
      if (files.length + acceptedFiles.length > 20) {
        toast({
          title: "Too many files",
          description: "Maximum 20 files allowed",
          variant: "destructive",
        });
        return;
      }

      setFiles(prev => [...prev, ...acceptedFiles]);
      setError(null);
      
      toast({
        title: "Files added",
        description: `${acceptedFiles.length} file(s) added successfully`,
      });
    } catch (error) {
      const errorDetails = ErrorHandler.handle(error, {
        component: 'PDFMerger',
        action: 'handleDrop'
      });
      
      toast({
        title: "Error adding files",
        description: ErrorHandler.createUserMessage(error),
        variant: "destructive",
      });
    }
  }, [files.length, toast]);

  const handleRemove = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setError(null);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setFiles((items) => {
        const oldIndex = items.findIndex((item) => `file-${item.path}` === active.id);
        const newIndex = items.findIndex((item) => `file-${item.path}` === over?.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, []);

  const updateProgress = useCallback((currentProgress: number, currentStage: ProgressStage) => {
    setProgress(currentProgress);
    setStage(currentStage);
  }, []);

  const handleMerge = useCallback(async () => {
    if (files.length < 2) {
      setError('Please add at least 2 PDF files to merge');
      return;
    }

    // Final validation before processing
    const validation = RequestValidator.validateFiles(files);
    if (!validation.success) {
      setError(validation.error);
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setCurrentFile(0);
    setError(null);
    setStage('uploading');

    try {
      const formData = new FormData();
      let totalSize = 0;
      let uploadedSize = 0;

      // First pass: calculate total size
      files.forEach(file => {
        totalSize += file.size;
      });

      // Second pass: upload files with progress tracking
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        formData.append('files', file);
        setCurrentFile(i + 1);
        uploadedSize += file.size;
        updateProgress((uploadedSize / totalSize) * 30, 'uploading'); // Upload phase is 30% of total progress
      }

      setStage('processing');
      updateProgress(35, 'processing');

      // Get device memory safely
      const extendedNavigator = navigator as ExtendedNavigator;
      const deviceMemory = extendedNavigator.deviceMemory || 0;

      const response = await fetch('/api/merge', {
        method: 'POST',
        body: formData,
        headers: {
          'X-Device-Type': /mobile|android|ios/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
          'X-Total-Size': totalSize.toString(),
          'X-Client-Memory': deviceMemory.toString(),
          'X-Priority': 'normal'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to merge PDFs');
      }

      setStage('merging');
      
      // Handle progress updates from response headers
      const reader = response.body?.getReader();
      const contentLength = parseInt(response.headers.get('Content-Length') || '0');
      let receivedLength = 0;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            updateProgress(95, 'finalizing');
            break;
          }

          receivedLength += value.length;
          const mergeProgress = (receivedLength / contentLength) * 60; // Merge phase is 60% of total progress
          updateProgress(35 + mergeProgress, 'merging');
        }

        updateProgress(100, 'complete');

        // Create and download the merged PDF
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'merged.pdf';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        // Show success message
        toast({
          title: "Merge successful!",
          description: "Your PDF has been merged and downloaded.",
        });

        // Reset after a short delay to show completion
        setTimeout(() => {
          setIsProcessing(false);
          setProgress(0);
          setCurrentFile(0);
          setStage('idle');
        }, 2000);
      }
    } catch (err) {
      const errorDetails = ErrorHandler.handle(err, {
        component: 'PDFMerger',
        action: 'handleMerge'
      });
      
      setError(ErrorHandler.createUserMessage(err));
      setStage('idle');
      setIsProcessing(false);
      setProgress(0);
      setCurrentFile(0);
      
      toast({
        title: "Merge failed",
        description: ErrorHandler.createUserMessage(err),
        variant: "destructive",
      });
    }
  }, [files, updateProgress, toast]);

  const handleClearAll = useCallback(() => {
    setFiles([]);
    setError(null);
    setProgress(0);
    setCurrentFile(0);
    setStage('idle');
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <FileDropzone onDrop={handleDrop} disabled={isProcessing} />
      
      <div className="space-y-4">
        <DndContext 
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          {files.length > 0 && (
            <button
              onClick={handleClearAll}
              disabled={isProcessing}
              className="mb-4 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm sm:text-base w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear All
            </button>
          )}
          <SortableContext 
            items={files.map(file => `file-${file.path}`)}
            strategy={rectSortingStrategy}
          >
            {files.map((file, index) => (
              <SortableFileItem
                key={`file-${file.path}`}
                id={`file-${file.path}`}
                file={file}
                index={index}
                onRemove={() => handleRemove(index)}
                disabled={isProcessing}
              />
            ))}
          </SortableContext>
        </DndContext>

        {files.length > 0 && (
          <ProgressBar
            progress={progress}
            isProcessing={isProcessing}
            totalFiles={files.length}
            currentFile={currentFile}
            stage={stage}
          />
        )}

        {error && (
          <div className="text-red-500 text-sm text-center p-3 bg-red-50 rounded-lg">
            {error}
          </div>
        )}

        {('error' in validationResult && validationResult.error) && !isProcessing && (
          <div className="text-amber-600 text-sm text-center p-3 bg-amber-50 rounded-lg">
            {validationResult.error}
          </div>
        )}

        <button
          onClick={handleMerge}
          disabled={
            isProcessing ||
            files.length < 2 ||
            (("isValid" in validationResult) ? !validationResult.isValid : validationResult.success === false)
          }
          className={`w-full py-3 px-4 rounded-lg text-white font-medium transition-all duration-200
            ${isProcessing || files.length < 2 || (("isValid" in validationResult) ? !validationResult.isValid : validationResult.success === false)
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-lg hover:shadow-xl'
            }
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        >
          {isProcessing ? 'Merging PDFs...' : 'Merge PDFs'}
        </button>

        {files.length > 0 && (
          <div className="text-xs text-gray-500 text-center">
            {files.length} file(s) selected • Total size: {(files.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024)).toFixed(1)} MB
          </div>
        )}
      </div>
    </div>
  );
};

export default PDFMerger; 