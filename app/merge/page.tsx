"use client";

import { useState, useCallback } from "react";
import { FileUpload } from "@/components/ui/file-upload";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, FileText, X, Upload, CheckCircle2, Download, ArrowLeft, Shield, GripVertical, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import Link from "next/link";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB

export default function MergePDF() {
  const [files, setFiles] = useState<File[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [mergedPdfUrl, setMergedPdfUrl] = useState<string | null>(null);
  const { toast } = useToast();
  const { isLoaded, userId } = useAuth();
  const router = useRouter();

  // Protect the route
  useEffect(() => {
    if (isLoaded && !userId) {
      router.push("/sign-in?redirect_url=/merge");
    }
  }, [isLoaded, userId, router]);

  const handleFilesSelected = useCallback((newFiles: File[]) => {
    // Check for duplicates
    const existingFileNames = new Set(files.map(f => f.name));
    const uniqueNewFiles = newFiles.filter(file => !existingFileNames.has(file.name));
    
    if (uniqueNewFiles.length < newFiles.length) {
      toast({
        title: "Duplicate files removed",
        description: "Some files were already added and have been skipped.",
        variant: "default",
      });
    }

    const updatedFiles = [...files, ...uniqueNewFiles];
    const totalSize = updatedFiles.reduce((sum, file) => sum + file.size, 0);
    
    if (totalSize > MAX_TOTAL_SIZE) {
      toast({
        title: "Total size too large",
        description: "Total file size exceeds 100MB limit",
        variant: "destructive",
      });
      return;
    }
    
    setFiles(updatedFiles);
  }, [files, toast]);

  const handleReorder = useCallback((reorderedFiles: any[]) => {
    const newFiles = reorderedFiles.map(file => new File([file], file.name, { type: file.type }));
    setFiles(newFiles);
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const resetState = useCallback(() => {
    setFiles([]);
    setIsMerging(false);
    setMergeProgress(0);
    setIsComplete(false);
    setMergedPdfUrl(null);
  }, []);

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

      let progressInterval = setInterval(() => {
        setMergeProgress(prev => Math.min(prev + 2, 99));
      }, 30);

      const formData = new FormData();
      files.forEach((file) => {
        formData.append("files", file);
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

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

  const handleDownload = useCallback(() => {
    if (!mergedPdfUrl) return;

    const a = document.createElement("a");
    a.href = mergedPdfUrl;
    a.download = `merged-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [mergedPdfUrl]);

  if (!isLoaded || !userId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Shield className="w-12 h-12 text-primary mx-auto animate-pulse" />
          <h2 className="text-2xl font-bold">Authentication Required</h2>
          <p className="text-muted-foreground">Please sign in to access this feature.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-2xl mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-12">
          <Link 
            href="/" 
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg px-4 py-2 hover:bg-primary/5"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Merge PDFs
          </h1>
        </div>

        <AnimatePresence mode="wait">
          {!isComplete ? (
            <motion.div
              key="upload-section"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="p-1 rounded-xl bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20">
                <FileUpload
                  onFilesSelected={handleFilesSelected}
                  maxFiles={10}
                  acceptedFileTypes={["application/pdf"]}
                  className="bg-card shadow-lg rounded-xl border-primary/20 min-h-[300px] flex items-center justify-center"
                  hideFileList
                />
              </div>

              {files.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4 bg-card p-6 rounded-xl shadow-lg border border-primary/20"
                >
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h2 className="text-lg font-semibold text-foreground">Selected Files</h2>
                      <p className="text-sm text-muted-foreground">Drag files to reorder them</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFiles([])}
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      Clear All
                    </Button>
                  </div>

                  <Reorder.Group
                    axis="y"
                    values={files}
                    onReorder={handleReorder}
                    className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar"
                  >
                    {files.map((file) => (
                      <Reorder.Item
                        key={file.name}
                        value={file}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        whileDrag={{ 
                          scale: 1.02,
                          backgroundColor: "hsl(var(--primary) / 0.1)",
                          cursor: "grabbing"
                        }}
                        className="flex items-center justify-between p-3 rounded-lg border bg-background/50 backdrop-blur-sm hover:bg-primary/5 transition-colors cursor-grab active:cursor-grabbing"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          <div className="flex items-center gap-3 truncate flex-1 min-w-0">
                            <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                            <span className="font-medium truncate">{file.name}</span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveFile(files.indexOf(file))}
                          className="h-8 w-8 hover:text-destructive hover:bg-destructive/10 flex-shrink-0 ml-2"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </Reorder.Item>
                    ))}
                  </Reorder.Group>

                  <Button
                    onClick={handleMerge}
                    disabled={isMerging || files.length < 2}
                    className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 transition-all duration-300"
                  >
                    {isMerging ? (
                      <>
                        <Upload className="mr-2 h-4 w-4 animate-spin" />
                        Merging...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Merge PDFs ({files.length} files)
                      </>
                    )}
                  </Button>

                  {isMerging && (
                    <div className="space-y-2">
                      <Progress value={mergeProgress} className="h-2" />
                      <p className="text-sm text-muted-foreground text-center">
                        Processing... {Math.round(mergeProgress)}%
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="success-section"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card p-8 rounded-xl shadow-lg border border-primary/20 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="rounded-full bg-primary/10 p-4 w-fit mx-auto mb-6"
              >
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </motion.div>
              
              <h2 className="text-2xl font-semibold text-foreground mb-3">PDF Merged Successfully!</h2>
              <p className="text-muted-foreground mb-8">
                Your files have been combined into a single PDF
              </p>
              
              <div className="flex flex-col gap-4">
                <Button
                  onClick={handleDownload}
                  size="lg"
                  className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Download className="h-4 w-4" />
                  Download PDF
                </Button>
                
                <Button
                  onClick={resetState}
                  variant="outline"
                  size="lg"
                  className="w-full gap-2 border-primary/20 hover:bg-primary/5"
                >
                  <Plus className="h-4 w-4" />
                  Merge More PDFs
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}