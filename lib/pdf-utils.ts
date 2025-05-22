import { PDFDocument } from "pdf-lib";

// Function to convert a File to ArrayBuffer
export const fileToArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

// Function to merge PDFs
export const mergePDFs = async (pdfFiles: File[]): Promise<Uint8Array> => {
  try {
    const mergedPdf = await PDFDocument.create();
    
    for (const file of pdfFiles) {
      const fileBuffer = await fileToArrayBuffer(file);
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
      
      copiedPages.forEach((page) => {
        mergedPdf.addPage(page);
      });
    }
    
    return await mergedPdf.save();
  } catch (error) {
    console.error("Error merging PDFs:", error);
    throw new Error("Failed to merge PDFs");
  }
};

// Function to save the merged PDF
export const saveMergedPDF = (pdfBytes: Uint8Array, fileName: string = "merged-document.pdf"): void => {
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up the URL object
  setTimeout(() => URL.revokeObjectURL(url), 100);
};

// Function to generate a thumbnail from a PDF file (first page)
// Note: In a real app, you would use a library like pdf.js to render a preview
export const generatePdfThumbnail = async (file: File): Promise<string> => {
  try {
    // This is a placeholder function - in a real app you would generate
    // an actual thumbnail from the PDF's first page
    return URL.createObjectURL(file);
  } catch (error) {
    console.error("Error generating thumbnail:", error);
    return "";
  }
};