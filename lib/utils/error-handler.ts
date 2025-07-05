/**
 * Comprehensive error handling utility
 */

export interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  timestamp: number;
  userAgent?: string;
  url?: string;
}

export interface ErrorDetails {
  message: string;
  code?: string;
  context: ErrorContext;
  originalError?: unknown;
}

// Extend global window interface for gtag
declare global {
  interface Window {
    gtag?: (command: string, targetId: string, config?: Record<string, any>) => void;
  }
}

export class ErrorHandler {
  private static isProduction = process.env.NODE_ENV === 'production';
  private static errorLog: ErrorDetails[] = [];

  /**
   * Handle and log errors with context
   */
  static handle(error: unknown, context: Partial<ErrorContext> = {}): ErrorDetails {
    const errorDetails: ErrorDetails = {
      message: this.getErrorMessage(error),
      code: this.getErrorCode(error),
      context: {
        timestamp: Date.now(),
        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        ...context,
      },
      originalError: error,
    };

    // Log error
    this.logError(errorDetails);

    // In production, you could send to external service
    if (this.isProduction) {
      this.sendToExternalService(errorDetails);
    }

    return errorDetails;
  }

  /**
   * Handle async errors
   */
  static async handleAsync<T>(
    promise: Promise<T>,
    context: Partial<ErrorContext> = {}
  ): Promise<{ data: T | null; error: ErrorDetails | null }> {
    try {
      const data = await promise;
      return { data, error: null };
    } catch (error) {
      const errorDetails = this.handle(error, context);
      return { data: null, error: errorDetails };
    }
  }

  /**
   * Get user-friendly error message
   */
  static getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error === 'object' && 'message' in error) {
      return String(error.message);
    }
    return 'An unexpected error occurred';
  }

  /**
   * Get error code for categorization
   */
  static getErrorCode(error: unknown): string {
    if (error instanceof Error) {
      if (error.name === 'NetworkError') return 'NETWORK_ERROR';
      if (error.name === 'TypeError') return 'TYPE_ERROR';
      if (error.name === 'RangeError') return 'RANGE_ERROR';
      return 'GENERAL_ERROR';
    }
    return 'UNKNOWN_ERROR';
  }

  /**
   * Log error to console with formatting
   */
  private static logError(errorDetails: ErrorDetails): void {
    const { message, code, context } = errorDetails;
    
    console.group(`🚨 Error [${code}] - ${context.component || 'Unknown'}`);
    console.error('Message:', message);
    console.error('Context:', context);
    console.error('Timestamp:', new Date(context.timestamp).toISOString());
    console.groupEnd();

    // Keep last 100 errors in memory
    this.errorLog.push(errorDetails);
    if (this.errorLog.length > 100) {
      this.errorLog.shift();
    }
  }

  /**
   * Send error to external service (placeholder for Sentry, etc.)
   */
  private static sendToExternalService(errorDetails: ErrorDetails): void {
    // Placeholder for external error tracking service
    // In production, you would integrate with Sentry, LogRocket, etc.
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'exception', {
        description: errorDetails.message,
        fatal: false,
      });
    }
  }

  /**
   * Get error statistics
   */
  static getErrorStats(): {
    totalErrors: number;
    errorsByCode: Record<string, number>;
    recentErrors: ErrorDetails[];
  } {
    const errorsByCode: Record<string, number> = {};
    
    this.errorLog.forEach(error => {
      const code = error.code || 'UNKNOWN';
      errorsByCode[code] = (errorsByCode[code] || 0) + 1;
    });

    return {
      totalErrors: this.errorLog.length,
      errorsByCode,
      recentErrors: this.errorLog.slice(-10), // Last 10 errors
    };
  }

  /**
   * Clear error log
   */
  static clearErrorLog(): void {
    this.errorLog = [];
  }

  /**
   * Create user-friendly error message
   */
  static createUserMessage(error: unknown): string {
    const message = this.getErrorMessage(error);
    const code = this.getErrorCode(error);

    switch (code) {
      case 'NETWORK_ERROR':
        return 'Network connection issue. Please check your internet connection and try again.';
      case 'TYPE_ERROR':
        return 'Invalid file format. Please ensure you\'re uploading valid PDF files.';
      case 'RANGE_ERROR':
        return 'File size too large. Please try with smaller files.';
      default:
        return 'Something went wrong. Please try again or contact support if the problem persists.';
    }
  }
}

// Global error handler for unhandled errors
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    ErrorHandler.handle(event.error, {
      component: 'Global',
      action: 'Unhandled Error',
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    ErrorHandler.handle(event.reason, {
      component: 'Global',
      action: 'Unhandled Promise Rejection',
    });
  });
} 