/**
 * Performance monitoring and optimization utilities
 */

export interface PerformanceMetrics {
  timestamp: number;
  duration: number;
  memoryUsage?: number;
  cpuUsage?: number;
  operation: string;
  success: boolean;
  error?: string;
}

export interface PerformanceConfig {
  enableMonitoring: boolean;
  logThreshold: number; // Log operations slower than this (ms)
  maxMetrics: number; // Maximum number of metrics to keep in memory
  enableMemoryTracking: boolean;
  enableCPUTracking: boolean;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private config: PerformanceConfig;
  private isEnabled: boolean;

  constructor(config: Partial<PerformanceConfig> = {}) {
    this.config = {
      enableMonitoring: true,
      logThreshold: 1000, // 1 second
      maxMetrics: 1000,
      enableMemoryTracking: true,
      enableCPUTracking: false,
      ...config
    };
    this.isEnabled = this.config.enableMonitoring;
  }

  /**
   * Measure performance of an async operation
   */
  async measure<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: Record<string, any>
  ): Promise<T> {
    if (!this.isEnabled) {
      return await fn();
    }

    const startTime = globalThis.performance.now();
    const startMemory = this.config.enableMemoryTracking ? this.getMemoryUsage() : undefined;

    try {
      const result = await fn();
      const duration = globalThis.performance.now() - startTime;
      
      this.recordMetric({
        timestamp: Date.now(),
        duration,
        memoryUsage: startMemory,
        operation,
        success: true,
        ...context
      });

      return result;
    } catch (error) {
      const duration = globalThis.performance.now() - startTime;
      
      this.recordMetric({
        timestamp: Date.now(),
        duration,
        memoryUsage: startMemory,
        operation,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        ...context
      });

      throw error;
    }
  }

  /**
   * Measure performance of a synchronous operation
   */
  measureSync<T>(
    operation: string,
    fn: () => T,
    context?: Record<string, any>
  ): T {
    if (!this.isEnabled) {
      return fn();
    }

    const startTime = globalThis.performance.now();
    const startMemory = this.config.enableMemoryTracking ? this.getMemoryUsage() : undefined;

    try {
      const result = fn();
      const duration = globalThis.performance.now() - startTime;
      
      this.recordMetric({
        timestamp: Date.now(),
        duration,
        memoryUsage: startMemory,
        operation,
        success: true,
        ...context
      });

      return result;
    } catch (error) {
      const duration = globalThis.performance.now() - startTime;
      
      this.recordMetric({
        timestamp: Date.now(),
        duration,
        memoryUsage: startMemory,
        operation,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        ...context
      });

      throw error;
    }
  }

  /**
   * Record a performance metric
   */
  private recordMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);

    // Keep only the latest metrics
    if (this.metrics.length > this.config.maxMetrics) {
      this.metrics = this.metrics.slice(-this.config.maxMetrics);
    }

    // Log slow operations
    if (metric.duration > this.config.logThreshold) {
      console.warn(`[Performance] Slow operation detected:`, {
        operation: metric.operation,
        duration: `${metric.duration.toFixed(2)}ms`,
        memoryUsage: metric.memoryUsage ? `${metric.memoryUsage.toFixed(2)}MB` : 'N/A',
        timestamp: new Date(metric.timestamp).toISOString()
      });
    }
  }

  /**
   * Get current memory usage
   */
  private getMemoryUsage(): number | undefined {
    if (typeof process !== 'undefined') {
      const memUsage = process.memoryUsage();
      return memUsage.heapUsed / 1024 / 1024; // Convert to MB
    }
    return undefined;
  }

  /**
   * Get performance statistics
   */
  getStats(): {
    totalOperations: number;
    averageDuration: number;
    slowOperations: number;
    errorRate: number;
    memoryUsage: number | undefined;
    recentMetrics: PerformanceMetrics[];
  } {
    if (this.metrics.length === 0) {
      return {
        totalOperations: 0,
        averageDuration: 0,
        slowOperations: 0,
        errorRate: 0,
        memoryUsage: this.getMemoryUsage(),
        recentMetrics: []
      };
    }

    const totalOperations = this.metrics.length;
    const averageDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0) / totalOperations;
    const slowOperations = this.metrics.filter(m => m.duration > this.config.logThreshold).length;
    const errorRate = this.metrics.filter(m => !m.success).length / totalOperations;
    const recentMetrics = this.metrics.slice(-10);

    return {
      totalOperations,
      averageDuration,
      slowOperations,
      errorRate,
      memoryUsage: this.getMemoryUsage(),
      recentMetrics
    };
  }

  /**
   * Get metrics for a specific operation
   */
  getOperationStats(operation: string): {
    count: number;
    averageDuration: number;
    successRate: number;
    slowCount: number;
  } {
    const operationMetrics = this.metrics.filter(m => m.operation === operation);
    
    if (operationMetrics.length === 0) {
      return {
        count: 0,
        averageDuration: 0,
        successRate: 0,
        slowCount: 0
      };
    }

    const count = operationMetrics.length;
    const averageDuration = operationMetrics.reduce((sum, m) => sum + m.duration, 0) / count;
    const successRate = operationMetrics.filter(m => m.success).length / count;
    const slowCount = operationMetrics.filter(m => m.duration > this.config.logThreshold).length;

    return {
      count,
      averageDuration,
      successRate,
      slowCount
    };
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...config };
    this.isEnabled = this.config.enableMonitoring;
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor({
  enableMonitoring: process.env.NODE_ENV === 'production',
  logThreshold: 500, // 500ms
  maxMetrics: 1000,
  enableMemoryTracking: true,
  enableCPUTracking: false
});

// Performance decorator for methods
export function measurePerformance(operation?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const operationName = operation || `${target.constructor.name}.${propertyName}`;

    descriptor.value = async function (...args: any[]) {
      return await performanceMonitor.measure(operationName, () => method.apply(this, args));
    };
  };
}

// Utility functions
export const performance = {
  /**
   * Measure time taken for a function
   */
  time: <T>(fn: () => T): T => {
    const start = globalThis.performance.now();
    const result = fn();
    const end = globalThis.performance.now();
    console.log(`Operation took ${(end - start).toFixed(2)}ms`);
    return result;
  },

  /**
   * Measure time taken for an async function
   */
  timeAsync: async <T>(fn: () => Promise<T>): Promise<T> => {
    const start = globalThis.performance.now();
    const result = await fn();
    const end = globalThis.performance.now();
    console.log(`Async operation took ${(end - start).toFixed(2)}ms`);
    return result;
  },

  /**
   * Get current memory usage
   */
  getMemoryUsage: (): number | undefined => {
    if (typeof process !== 'undefined') {
      const memUsage = process.memoryUsage();
      return memUsage.heapUsed / 1024 / 1024;
    }
    return undefined;
  },

  /**
   * Format bytes to human readable format
   */
  formatBytes: (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}; 