import React, { useState, useCallback } from 'react';
import { FileWithPath } from 'react-dropzone';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { DndContext, DragEndEvent } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove } from '@dnd-kit/sortable';
import FileDropzone from './FileDropzone';
import SortableFileItem from './SortableFileItem';
import ProgressBar from './ProgressBar';

type ProgressStage = 'uploading' | 'processing' | 'merging' | 'finalizing' | 'complete' | 'idle';

const PDFMerger: React.FC = () => {
  const [files, setFiles] = useState<FileWithPath[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<ProgressStage>('idle');

  const handleDrop = useCallback((acceptedFiles: FileWithPath[]) => {
    setFiles(prev => [...prev, ...acceptedFiles]);
    setError(null);
  }, []);

  const handleRemove = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
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

  const updateProgress = (currentProgress: number, currentStage: ProgressStage) => {
    setProgress(currentProgress);
    setStage(currentStage);
  };

  const handleMerge = async () => {
    if (files.length < 2) {
      setError('Please add at least 2 PDF files to merge');
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

      const response = await fetch('/api/merge', {
        method: 'POST',
        body: formData,
        headers: {
          'X-Device-Type': /mobile|android|ios/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
          'X-Total-Size': totalSize.toString()
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

        // Reset after a short delay to show completion
        setTimeout(() => {
          setIsProcessing(false);
          setProgress(0);
          setCurrentFile(0);
          setStage('idle');
        }, 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to merge PDFs');
      setStage('idle');
      setIsProcessing(false);
      setProgress(0);
      setCurrentFile(0);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <FileDropzone onDrop={handleDrop} disabled={isProcessing} />
      
      <div className="space-y-4">
        <DndContext 
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
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
          <div className="text-red-500 text-sm text-center">
            {error}
          </div>
        )}

        <button
          onClick={handleMerge}
          disabled={isProcessing || files.length < 2}
          className={`w-full py-2 px-4 rounded-lg text-white font-medium
            ${isProcessing
              ? 'bg-gray-400 cursor-not-allowed'
              : files.length < 2
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-500 hover:bg-blue-600 transition-colors'
            }`}
        >
          {isProcessing ? 'Processing...' : 'Merge PDFs'}
        </button>
      </div>
    </div>
  );
};

export default PDFMerger; 