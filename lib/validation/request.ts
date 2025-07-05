import { z } from 'zod';

/**
 * File validation schema
 */
export const fileSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().min(1).max(200 * 1024 * 1024), // 200MB max
  type: z.string().refine((type) => type === 'application/pdf', {
    message: 'Only PDF files are allowed',
  }),
});

/**
 * Merge request options schema
 */
export const mergeOptionsSchema = z.object({
  compression: z.boolean().optional().default(false),
  quality: z.number().min(1).max(100).optional().default(80),
  preserveMetadata: z.boolean().optional().default(false),
  optimizeImages: z.boolean().optional().default(true),
  removeAnnotations: z.boolean().optional().default(false),
});

/**
 * Main merge request schema
 */
export const mergeRequestSchema = z.object({
  files: z.array(fileSchema).min(2, 'At least 2 files are required').max(20, 'Maximum 20 files allowed'),
  options: mergeOptionsSchema.optional().default({}),
});

/**
 * Contact form schema
 */
export const contactFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().email('Invalid email address'),
  subject: z.string().min(1, 'Subject is required').max(200, 'Subject too long'),
  message: z.string().min(10, 'Message must be at least 10 characters').max(2000, 'Message too long'),
});

/**
 * API response schema
 */
export const apiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  timestamp: z.number(),
});

/**
 * Progress update schema
 */
export const progressSchema = z.object({
  stage: z.enum(['uploading', 'processing', 'merging', 'finalizing', 'complete']),
  progress: z.number().min(0).max(100),
  currentFile: z.number().min(0),
  totalFiles: z.number().min(1),
  estimatedTimeRemaining: z.number().optional(),
});

/**
 * Validation error formatter
 */
export class ValidationErrorFormatter {
  static format(error: z.ZodError): string[] {
    return error.errors.map((err) => {
      const field = err.path.join('.');
      return `${field}: ${err.message}`;
    });
  }

  static formatFirst(error: z.ZodError): string {
    const formatted = this.format(error);
    return formatted[0] || 'Validation failed';
  }
}

/**
 * Request validator class
 */
export class RequestValidator {
  /**
   * Validate merge request
   */
  static validateMergeRequest(data: unknown): { success: true; data: z.infer<typeof mergeRequestSchema> } | { success: false; error: string } {
    try {
      const validated = mergeRequestSchema.parse(data);
      return { success: true, data: validated };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, error: ValidationErrorFormatter.formatFirst(error) };
      }
      return { success: false, error: 'Invalid request data' };
    }
  }

  /**
   * Validate contact form
   */
  static validateContactForm(data: unknown): { success: true; data: z.infer<typeof contactFormSchema> } | { success: false; error: string } {
    try {
      const validated = contactFormSchema.parse(data);
      return { success: true, data: validated };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, error: ValidationErrorFormatter.formatFirst(error) };
      }
      return { success: false, error: 'Invalid form data' };
    }
  }

  /**
   * Validate file upload
   */
  static validateFile(file: File): { success: true; data: File } | { success: false; error: string } {
    try {
      const fileData = {
        name: file.name,
        size: file.size,
        type: file.type,
      };
      
      fileSchema.parse(fileData);
      return { success: true, data: file };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { success: false, error: ValidationErrorFormatter.formatFirst(error) };
      }
      return { success: false, error: 'Invalid file' };
    }
  }

  /**
   * Validate multiple files
   */
  static validateFiles(files: File[]): { success: true; data: File[] } | { success: false; error: string } {
    if (files.length < 2) {
      return { success: false, error: 'At least 2 files are required' };
    }

    if (files.length > 20) {
      return { success: false, error: 'Maximum 20 files allowed' };
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > 200 * 1024 * 1024) {
      return { success: false, error: 'Total file size exceeds 200MB limit' };
    }

    for (const file of files) {
      const validation = this.validateFile(file);
      if (!validation.success) {
        return validation;
      }
    }

    return { success: true, data: files };
  }
}

// Type exports
export type MergeRequest = z.infer<typeof mergeRequestSchema>;
export type ContactFormData = z.infer<typeof contactFormSchema>;
export type MergeOptions = z.infer<typeof mergeOptionsSchema>;
export type ProgressUpdate = z.infer<typeof progressSchema>;
export type ApiResponse = z.infer<typeof apiResponseSchema>; 