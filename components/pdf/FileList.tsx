"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { FileText, X } from "lucide-react";

interface FileListProps {
  files: File[];
  onRemoveFile: (index: number) => void;
}

export default function FileList({ files, onRemoveFile }: FileListProps) {
  return (
    <AnimatePresence>
      {files.map((file, index) => (
        <motion.div
          key={file.name}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="flex items-center justify-between p-4 bg-card rounded-lg shadow-sm"
        >
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary" />
            <span className="font-medium">{file.name}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRemoveFile(index)}
            className="text-destructive hover:text-destructive/90"
          >
            <X className="h-4 w-4" />
          </Button>
        </motion.div>
      ))}
    </AnimatePresence>
  );
} 