declare module './FileDropzone' {
  import { FC } from 'react';
  import { FileWithPath } from 'react-dropzone';
  
  interface FileDropzoneProps {
    onDrop: (files: FileWithPath[]) => void;
    disabled?: boolean;
  }
  
  const FileDropzone: FC<FileDropzoneProps>;
  export default FileDropzone;
}

declare module './SortableFileItem' {
  import { FC } from 'react';
  import { FileWithPath } from 'react-dropzone';
  
  interface SortableFileItemProps {
    id: string;
    file: FileWithPath;
    index: number;
    onRemove: () => void;
    disabled?: boolean;
  }
  
  const SortableFileItem: FC<SortableFileItemProps>;
  export default SortableFileItem;
}

declare module './ProgressBar' {
  import { FC } from 'react';
  
  interface ProgressBarProps {
    progress: number;
    isProcessing: boolean;
    totalFiles: number;
    currentFile: number;
  }
  
  const ProgressBar: FC<ProgressBarProps>;
  export default ProgressBar;
} 