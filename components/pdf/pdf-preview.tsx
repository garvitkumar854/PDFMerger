import { useState, useEffect, useCallback, memo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { motion, Reorder, AnimatePresence } from 'framer-motion';
import { Loader2, RotateCw, Trash, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface PDFPreviewProps {
  file: File;
  onPageDelete?: (pageNumber: number) => void;
  onPageRotate?: (pageNumber: number, angle: number) => void;
  onPagesReorder?: (newOrder: number[]) => void;
  className?: string;
}

const PDFPage = memo(({ file, pageNumber, width, rotate }: { file: File; pageNumber: number; width: number; rotate: number }) => (
  <Page
    pageNumber={pageNumber}
    width={width}
    rotate={rotate}
    renderTextLayer={false}
    renderAnnotationLayer={false}
    loading={
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      </div>
    }
  />
));
PDFPage.displayName = 'PDFPage';

export function PDFPreview({
  file,
  onPageDelete,
  onPageRotate,
  onPagesReorder,
  className,
}: PDFPreviewProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageRotations, setPageRotations] = useState<Record<number, number>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [thumbnails, setThumbnails] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (numPages > 0) {
      setThumbnails(Array.from({ length: numPages }, (_, i) => i + 1));
      setLoading(false);
    }
  }, [numPages]);

  const handleDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setError(null);
  }, []);

  const handleDocumentLoadError = useCallback((error: Error) => {
    console.error('Error loading PDF:', error);
    setError('Failed to load PDF. Please make sure the file is not corrupted.');
    setLoading(false);
  }, []);

  const rotatePage = useCallback((pageNumber: number) => {
    const currentRotation = pageRotations[pageNumber] || 0;
    const newRotation = (currentRotation + 90) % 360;
    setPageRotations((prev) => ({ ...prev, [pageNumber]: newRotation }));
    onPageRotate?.(pageNumber, newRotation);
  }, [pageRotations, onPageRotate]);

  const deletePage = useCallback((pageNumber: number) => {
    onPageDelete?.(pageNumber);
    setThumbnails((prev) => prev.filter((p) => p !== pageNumber));
  }, [onPageDelete]);

  const handleReorder = useCallback((newOrder: number[]) => {
    setThumbnails(newOrder);
    onPagesReorder?.(newOrder);
  }, [onPagesReorder]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="relative aspect-[3/4] w-full max-w-2xl mx-auto border rounded-lg overflow-hidden">
            <Document
              file={file}
              onLoadSuccess={handleDocumentLoadSuccess}
              onLoadError={handleDocumentLoadError}
              loading={
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              }
            >
              <PDFPage
                file={file}
                pageNumber={currentPage}
                width={800}
                rotate={pageRotations[currentPage] || 0}
              />
            </Document>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/90 dark:bg-black/90 rounded-full px-4 py-2 shadow-lg">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Page {currentPage} of {numPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                disabled={currentPage === numPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Reorder.Group
            axis="x"
            values={thumbnails}
            onReorder={handleReorder}
            className="flex gap-4 overflow-x-auto pb-4 px-2 custom-scrollbar"
          >
            <AnimatePresence>
              {thumbnails.map((pageNum) => (
                <Reorder.Item
                  key={pageNum}
                  value={pageNum}
                  className="relative group cursor-grab active:cursor-grabbing"
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    whileHover={{ scale: 1.05 }}
                    className={cn(
                      "relative aspect-[3/4] w-24 border rounded-lg overflow-hidden bg-white",
                      currentPage === pageNum && "ring-2 ring-primary"
                    )}
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    <Document file={file}>
                      <PDFPage
                        file={file}
                        pageNumber={pageNum}
                        width={96}
                        rotate={pageRotations[pageNum] || 0}
                      />
                    </Document>
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-white hover:text-white hover:bg-white/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          rotatePage(pageNum);
                        }}
                      >
                        <RotateCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-white hover:text-white hover:bg-white/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePage(pageNum);
                        }}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="absolute bottom-1 right-1 bg-white/90 dark:bg-black/90 rounded-full w-5 h-5 flex items-center justify-center text-xs">
                      {pageNum}
                    </div>
                  </motion.div>
                </Reorder.Item>
              ))}
            </AnimatePresence>
          </Reorder.Group>
        </>
      )}
    </div>
  );
} 