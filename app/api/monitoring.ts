import { EventEmitter } from 'events';

interface PerformanceMetrics {
  timestamp: number;
  duration: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
  };
  cpu: {
    user: number;
    system: number;
  };
  requestCount: number;
  errorCount: number;
  averageResponseTime: number;
}

class PerformanceMonitor extends EventEmitter {
  private metrics: PerformanceMetrics[] = [];
  private startTime: number = Date.now();
  private requestCount: number = 0;
  private errorCount: number = 0;
  private totalResponseTime: number = 0;

  constructor() {
    super();
    this.initializeMonitoring();
  }

  private initializeMonitoring() {
    // Collect metrics every minute
    setInterval(() => {
      this.collectMetrics();
    }, 60000);

    // Clean up old metrics every hour
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 3600000);
  }

  private collectMetrics() {
    const metrics: PerformanceMetrics = {
      timestamp: Date.now(),
      duration: Date.now() - this.startTime,
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      averageResponseTime: this.requestCount > 0 ? this.totalResponseTime / this.requestCount : 0
    };

    this.metrics.push(metrics);
    this.emit('metrics', metrics);

    // Alert on high memory usage
    if (metrics.memory.heapUsed / metrics.memory.heapTotal > 0.85) {
      this.emit('memoryWarning', {
        usage: metrics.memory.heapUsed,
        total: metrics.memory.heapTotal
      });
    }

    // Alert on high error rate
    if (this.errorCount > 0 && this.errorCount / this.requestCount > 0.1) {
      this.emit('errorRateWarning', {
        errorRate: this.errorCount / this.requestCount,
        totalErrors: this.errorCount
      });
    }
  }

  private cleanupOldMetrics() {
    const oneHourAgo = Date.now() - 3600000;
    this.metrics = this.metrics.filter(metric => metric.timestamp > oneHourAgo);
  }

  public trackRequest(duration: number, isError: boolean = false) {
    this.requestCount++;
    this.totalResponseTime += duration;
    if (isError) {
      this.errorCount++;
    }
  }

  public getMetrics() {
    return {
      current: this.metrics[this.metrics.length - 1],
      history: this.metrics,
      summary: {
        uptime: Date.now() - this.startTime,
        totalRequests: this.requestCount,
        errorRate: this.errorCount / this.requestCount,
        averageResponseTime: this.totalResponseTime / this.requestCount
      }
    };
  }

  public reset() {
    this.metrics = [];
    this.startTime = Date.now();
    this.requestCount = 0;
    this.errorCount = 0;
    this.totalResponseTime = 0;
  }
}

export const performanceMonitor = new PerformanceMonitor();

// Add event listeners for monitoring
performanceMonitor.on('memoryWarning', (data) => {
  console.warn('High memory usage detected:', data);
});

performanceMonitor.on('errorRateWarning', (data) => {
  console.warn('High error rate detected:', data);
});

performanceMonitor.on('metrics', (metrics) => {
  // Log metrics or send to monitoring service
  if (process.env.NODE_ENV === 'production') {
    console.log('Performance metrics:', metrics);
  }
}); 