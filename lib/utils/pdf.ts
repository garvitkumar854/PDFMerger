import { PDFDocument } from "pdf-lib";

// Convert File to ArrayBuffer
export const fileToArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

// Validate PDF structure
export const validatePdfStructure = async (file: File): Promise<{ valid: boolean; error?: string }> => {
  try {
    const buffer = await fileToArrayBuffer(file);
    const headerBytes = new Uint8Array(buffer.slice(0, 1024));
    
    // Look for PDF signature
    let hasPdfSignature = false;
    for (let i = 0; i < headerBytes.length - 4; i++) {
      if (headerBytes[i] === 0x25 && // %
          headerBytes[i + 1] === 0x50 && // P
          headerBytes[i + 2] === 0x44 && // D
          headerBytes[i + 3] === 0x46 && // F
          headerBytes[i + 4] === 0x2D) { // -
        hasPdfSignature = true;
        break;
      }
    }

    if (!hasPdfSignature) {
      return { 
        valid: false, 
        error: `${file.name} appears to be corrupted or is not a valid PDF` 
      };
    }

    // Try to load the PDF to verify its structure
    await PDFDocument.load(buffer);
    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      error: `${file.name} is not a valid PDF: ${error instanceof Error ? error.message : 'Invalid structure'}`
    };
  }
};

// Merge PDFs with progress tracking
export const mergePDFs = async (
  pdfFiles: File[],
  onProgress?: (progress: number) => void
): Promise<Uint8Array> => {
  try {
    const mergedPdf = await PDFDocument.create();
    const totalFiles = pdfFiles.length;
    
    for (let i = 0; i < pdfFiles.length; i++) {
      const file = pdfFiles[i];
      const fileBuffer = await fileToArrayBuffer(file);
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
      
      copiedPages.forEach((page) => {
        mergedPdf.addPage(page);
      });

      // Report progress
      if (onProgress) {
        const progress = ((i + 1) / totalFiles) * 100;
        onProgress(progress);
      }
    }
    
    return await mergedPdf.save();
  } catch (error) {
    console.error("Error merging PDFs:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to merge PDFs");
  }
};

// Save merged PDF with cleanup
export const saveMergedPDF = (
  pdfBytes: Uint8Array, 
  fileName: string = `merged-${new Date().toISOString().slice(0, 10)}.pdf`
): void => {
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up the URL object after a short delay
  setTimeout(() => URL.revokeObjectURL(url), 100);
}; 