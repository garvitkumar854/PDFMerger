import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FiFileText, FiMenu, FiX } from 'react-icons/fi';
import { FileWithPath } from 'react-dropzone';

interface SortableFileItemProps {
  id: string;
  file: FileWithPath;
  index: number;
  onRemove: () => void;
  disabled?: boolean;
}

const SortableFileItem: React.FC<SortableFileItemProps> = ({
  id,
  file,
  index,
  onRemove,
  disabled
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-white rounded-lg border ${
        isDragging ? 'border-blue-500 shadow-lg' : 'border-gray-200'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        className={`text-gray-400 hover:text-gray-600 ${
          disabled ? 'cursor-not-allowed' : 'cursor-grab'
        }`}
        {...attributes}
        {...listeners}
        disabled={disabled}
      >
        <FiMenu className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-2 flex-1 min-w-0">
        <FiFileText className="w-5 h-5 text-blue-500 flex-shrink-0" />
        <div className="truncate">
          <p className="text-sm sm:text-base font-medium text-gray-700 truncate">
            {file.name}
          </p>
          <p className="text-xs sm:text-sm text-gray-500">
            {formatFileSize(file.size)}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className={`p-1.5 text-gray-600 bg-gray-100 rounded-full
          hover:bg-gray-200 transition-colors flex items-center justify-center
          min-w-[24px] min-h-[24px] touch-manipulation flex-shrink-0
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        aria-label="Remove file"
      >
        <FiX className="w-4 h-4" />
      </button>
    </div>
  );
};

export default SortableFileItem; 