import { PDFDocument } from 'pdf-lib';
import { validateFile, validateFiles } from '@/lib/utils/file-validation';
import { processPDFInWorker } from '@/app/api/workers/pdfWorker';
import fs from 'fs/promises';
import path from 'path';

describe('PDF Merger Tests', () => {
  let samplePDF1: Uint8Array;
  let samplePDF2: Uint8Array;

  beforeAll(async () => {
    // Create sample PDFs for testing
    const doc1 = await PDFDocument.create();
    doc1.addPage();
    doc1.addPage();
    samplePDF1 = await doc1.save();

    const doc2 = await PDFDocument.create();
    doc2.addPage();
    samplePDF2 = await doc2.save();
  });

  describe('File Validation', () => {
    test('validates valid PDF file', async () => {
      const file = new File([samplePDF1], 'test1.pdf', { type: 'application/pdf' });
      const result = await validateFile(file, []);
      expect(result.error).toBeNull();
      expect(result.isDuplicate).toBeFalsy();
    });

    test('detects duplicate files', async () => {
      const file1 = new File([samplePDF1], 'test.pdf', { type: 'application/pdf' });
      const file2 = new File([samplePDF2], 'test.pdf', { type: 'application/pdf' });
      const result = await validateFile(file2, [file1]);
      expect(result.isDuplicate).toBeTruthy();
    });

    test('validates file size limits', async () => {
      const largeArray = new Uint8Array(51 * 1024 * 1024); // 51MB
      const file = new File([largeArray], 'large.pdf', { type: 'application/pdf' });
      const result = await validateFile(file, []);
      expect(result.error?.code).toBe('FILE_TOO_LARGE');
    });

    test('validates total size limits', async () => {
      const mediumArray = new Uint8Array(40 * 1024 * 1024); // 40MB
      const file1 = new File([mediumArray], 'medium1.pdf', { type: 'application/pdf' });
      const file2 = new File([mediumArray], 'medium2.pdf', { type: 'application/pdf' });
      const file3 = new File([mediumArray], 'medium3.pdf', { type: 'application/pdf' });
      const result = await validateFiles([file1, file2, file3], []);
      expect(result?.code).toBe('TOTAL_SIZE_EXCEEDED');
    });
  });

  describe('PDF Processing', () => {
    test('processes valid PDF', async () => {
      const result = await processPDFInWorker(samplePDF1);
      expect(result.success).toBeTruthy();
      expect(result.pageCount).toBe(2);
    });

    test('handles corrupted PDF', async () => {
      const corruptedPDF = new Uint8Array([...samplePDF1.slice(0, 50), 0, 0, 0]);
      const result = await processPDFInWorker(corruptedPDF);
      expect(result.success).toBeFalsy();
      expect(result.error).toBeDefined();
    });

    test('optimizes large PDF', async () => {
      const doc = await PDFDocument.create();
      for (let i = 0; i < 20; i++) {
        doc.addPage();
      }
      const largePDF = await doc.save();
      const result = await processPDFInWorker(largePDF);
      expect(result.success).toBeTruthy();
      expect(result.metrics.isOptimized).toBeTruthy();
    });
  });

  describe('End-to-End Tests', () => {
    test('merges multiple PDFs', async () => {
      const files = [
        new File([samplePDF1], 'test1.pdf', { type: 'application/pdf' }),
        new File([samplePDF2], 'test2.pdf', { type: 'application/pdf' })
      ];

      const formData = new FormData();
      files.forEach(file => formData.append('files', file));

      const response = await fetch('/api/merge', {
        method: 'POST',
        body: formData
      });

      expect(response.ok).toBeTruthy();
      const blob = await response.blob();
      expect(blob.type).toBe('application/pdf');
      expect(blob.size).toBeGreaterThan(0);

      // Verify merged PDF structure
      const arrayBuffer = await blob.arrayBuffer();
      const mergedDoc = await PDFDocument.load(arrayBuffer);
      expect(mergedDoc.getPageCount()).toBe(3); // 2 pages from first + 1 from second
    });
  });
}); 