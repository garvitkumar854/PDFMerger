import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { FiUploadCloud } from 'react-icons/fi';

interface FileDropzoneProps {
  onDrop: (files: File[]) => void;
  disabled?: boolean;
}

const FileDropzone: React.FC<FileDropzoneProps> = ({ onDrop, disabled }) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    disabled,
    multiple: true
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
        ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input {...getInputProps()} />
      <FiUploadCloud className="mx-auto h-12 w-12 text-gray-400" />
      <p className="mt-2 text-sm text-gray-600">
        {isDragActive
          ? 'Drop the PDF files here...'
          : disabled
          ? 'Processing...'
          : 'Drag & drop PDF files here, or click to select files'}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Only PDF files are accepted
      </p>
    </div>
  );
};

export default FileDropzone; 