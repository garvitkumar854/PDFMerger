"use client";

import { useState, useCallback, useMemo, lazy, Suspense } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, FileText, Trash2, X, Upload, CheckCircle2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

// Lazy load heavy components with loading fallback
const FileList = lazy(() => import("@/components/pdf/FileList"));
const ProgressBar = lazy(() => import("@/components/pdf/ProgressBar"));

// Optimize animations
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05, // Reduced from 0.1
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3, // Reduced from 0.5
    },
  },
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB
const CHUNK_SIZE = 1024 * 1024; // 1MB chunks for upload

export default function MergePDF() {
  const [files, setFiles] = useState<File[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [mergedPdfUrl, setMergedPdfUrl] = useState<string | null>(null);
  const { toast } = useToast();

  // Memoize file validation
  const validateFiles = useCallback((newFiles: File[]) => {
    const pdfFiles = newFiles.filter(file => file.type === "application/pdf");
    if (pdfFiles.length !== newFiles.length) {
      toast({
        title: "Invalid file type",
        description: "Only PDF files are allowed",
        variant: "destructive",
      });
      return false;
    }

    for (const file of pdfFiles) {
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds the 50MB size limit`,
          variant: "destructive",
        });
        return false;
      }
    }

    const totalSize = [...files, ...pdfFiles].reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      toast({
        title: "Total size too large",
        description: "Total file size exceeds 100MB limit",
        variant: "destructive",
      });
      return false;
    }

    return true;
  }, [files, toast]);

  // Optimize file drop handling
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (validateFiles(acceptedFiles)) {
      setFiles(prev => [...prev, ...acceptedFiles]);
    }
  }, [validateFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
    },
    multiple: true,
    maxSize: MAX_FILE_SIZE,
  });

  // Optimize file removal
  const removeFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    if (isComplete) {
      setIsComplete(false);
      setMergedPdfUrl(null);
    }
  }, [isComplete]);

  const removeAllFiles = useCallback(() => {
    setFiles([]);
    setIsComplete(false);
    setMergedPdfUrl(null);
  }, []);

  // Optimize merge handler with chunked upload
  const handleMerge = useCallback(async () => {
    if (files.length < 2) {
      toast({
        title: files.length === 0 ? "No files selected" : "Single file selected",
        description: "Please select at least two PDF files to merge",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsMerging(true);
      setMergeProgress(0);
      setIsComplete(false);
      setMergedPdfUrl(null);

      // Improved progress updates with 99% cap
      let progressInterval: NodeJS.Timeout;
      const updateProgress = () => {
        setMergeProgress(prev => {
          if (prev >= 99) {
            clearInterval(progressInterval);
            return 99;
          }
          return prev + 2;
        });
      };
      progressInterval = setInterval(updateProgress, 30);

      const formData = new FormData();
      files.forEach((file) => {
        formData.append("files", file);
      });

      // Add timeout to fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch("/api/merge", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      clearInterval(progressInterval);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to merge PDFs");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      setMergedPdfUrl(url);
      
      // Add a small delay before reaching 100% for better visual feedback
      await new Promise(resolve => setTimeout(resolve, 500));
      setMergeProgress(100);
      setIsComplete(true);

      toast({
        title: "Success!",
        description: "PDFs merged successfully",
      });
    } catch (error) {
      console.error("Error merging PDFs:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to merge PDFs. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsMerging(false);
    }
  }, [files, toast]);

  // Optimize download handler
  const handleDownload = useCallback(() => {
    if (!mergedPdfUrl) return;

    const a = document.createElement("a");
    a.href = mergedPdfUrl;
    a.download = `merged-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(mergedPdfUrl);
  }, [mergedPdfUrl]);

  // Memoize file list with optimized animations
  const fileList = useMemo(() => (
    <AnimatePresence mode="popLayout">
      {files.map((file, index) => (
        <motion.div
          key={file.name}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.2 }}
          className="flex items-center justify-between p-4 bg-card rounded-lg shadow-sm"
        >
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary" />
            <span className="font-medium">{file.name}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => removeFile(index)}
            className="text-destructive hover:text-destructive/90"
          >
            <X className="h-4 w-4" />
          </Button>
        </motion.div>
      ))}
    </AnimatePresence>
  ), [files, removeFile]);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="container mx-auto px-4 py-8 max-w-4xl"
    >
      <motion.div
        variants={itemVariants}
        className="text-center mb-8 space-y-3"
      >
        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
          Merge Your PDFs
        </h1>
        <p className="text-muted-foreground text-lg">
          Drag and drop your PDF files to combine them into one document
        </p>
      </motion.div>

      <motion.div
        variants={itemVariants}
        className="grid gap-6 md:grid-cols-2"
      >
        <motion.div
          whileHover={{ scale: 1.01 }}
          className="col-span-2"
        >
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
              isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
            )}
          >
            <input {...getInputProps()} />
            <motion.div
              initial={{ y: 0 }}
              animate={{ y: isDragActive ? -5 : 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center justify-center gap-4"
            >
              <Upload className="h-12 w-12 text-primary" />
              <div className="space-y-2 text-center">
                <p className="text-lg font-medium">
                  {isDragActive ? "Drop your PDFs here" : "Drag & drop PDFs here"}
                </p>
                <p className="text-sm text-muted-foreground">
                  or click to select files
                </p>
              </div>
            </motion.div>
          </div>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="col-span-2 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Selected Files</h2>
            {files.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={removeAllFiles}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Remove All
              </Button>
            )}
          </div>
          <Suspense fallback={<div className="text-center">Loading...</div>}>
            <FileList files={files} onRemoveFile={removeFile} />
          </Suspense>
        </motion.div>

        <Suspense fallback={<div className="text-center">Loading...</div>}>
          {isMerging && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="col-span-2"
            >
              <ProgressBar progress={mergeProgress} />
            </motion.div>
          )}
        </Suspense>

        <AnimatePresence>
          {files.length === 1 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="col-span-2"
            >
              <Alert variant="destructive" className="text-center">
                <AlertCircle className="h-4 w-4 mx-auto" />
                <AlertDescription className="text-center">
                  Please select at least two PDF files to merge
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          variants={itemVariants}
          className="col-span-2 flex justify-center gap-4 mt-4"
        >
          {!isComplete ? (
            <Button
              size="lg"
              onClick={handleMerge}
              disabled={files.length < 2 || isMerging}
              className="relative group min-w-[200px]"
            >
              {isMerging ? (
                <div className="flex items-center justify-center gap-2">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="h-5 w-5 border-2 border-current border-t-transparent rounded-full"
                  />
                  <span>Merging...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>Merge PDFs</span>
                </div>
              )}
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={handleDownload}
              className="flex items-center justify-center gap-2 min-w-[200px]"
            >
              <Download className="h-5 w-5" />
              <span>Download Merged PDF</span>
            </Button>
          )}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}