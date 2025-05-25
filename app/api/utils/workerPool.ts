import { Worker } from 'worker_threads';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';

interface WorkerMetrics {
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  totalProcessingTime: number;
  averageProcessingTime: number;
  lastUsed: number;
  errors: string[];
  memory: {
    heapUsed: number;
    heapTotal: number;
  };
}

interface PoolMetrics {
  activeWorkers: number;
  totalWorkers: number;
  queueLength: number;
  totalProcessed: number;
  averageWaitTime: number;
  cpuUsage: number;
}

// Add efficient memory management
const MEMORY_LIMIT = process.env.NODE_ENV === 'production' ? 
  Math.floor(os.totalmem() * 0.7) : // 70% of total memory in production
  Math.floor(os.totalmem() * 0.8);  // 80% of total memory in development

export class WorkerPool extends EventEmitter {
  private workers: Map<Worker, WorkerMetrics> = new Map();
  private queue: { 
    task: any;
    addedTime: number;
    resolve: (value: any) => void; 
    reject: (reason?: any) => void;
    priority: number; // Higher number = higher priority
  }[] = [];
  private activeWorkers = 0;
  private totalProcessed = 0;
  private totalWaitTime = 0;
  private isShuttingDown = false;
  private healthCheckInterval!: NodeJS.Timeout;
  private metricsInterval!: NodeJS.Timeout;
  private lastScaleCheck = Date.now();
  private scaleCheckInterval = 5000; // 5 seconds

  constructor(
    private poolSize = Math.max(Math.floor(os.cpus().length * 0.75), 2), // Keep 75% of CPU cores, min 2
    private maxQueueSize = 200, // Increased for better throughput
    private workerTimeout = 180000, // 3 minutes timeout
    private healthCheckFrequency = 10000 // 10 seconds
  ) {
    super();
    this.initializeHealthCheck();
    this.initializeMetricsReporting();
    this.initializeMemoryMonitoring();
    
    // Pre-initialize some workers for faster startup
    for (let i = 0; i < Math.min(2, this.poolSize); i++) {
      this.createWorker().catch(console.error);
    }
  }

  private initializeHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      try {
        this.performHealthCheck();
      } catch (error) {
        console.error('Health check error:', error);
      }
    }, this.healthCheckFrequency);
  }

  private initializeMetricsReporting(): void {
    this.metricsInterval = setInterval(() => {
      try {
        this.reportMetrics();
      } catch (error) {
        console.error('Metrics reporting error:', error);
      }
    }, 30000);
  }

  private initializeMemoryMonitoring() {
    setInterval(() => {
      const used = process.memoryUsage();
      if (used.heapUsed > MEMORY_LIMIT) {
        this.handleMemoryPressure();
      }
    }, 30000); // Check every 30 seconds
  }

  private async handleMemoryPressure() {
    // Terminate idle workers
    const now = Date.now();
    for (const [worker, metrics] of this.workers.entries()) {
      if (now - metrics.lastUsed > 30000) { // 30 seconds idle
        await this.terminateWorker(worker);
      }
    }
    
    // Force garbage collection if available
    if (global.gc) {
      try {
        global.gc();
      } catch (e) {
        // Ignore if gc is not available
      }
    }
  }

  private async performHealthCheck(): Promise<void> {
    const now = Date.now();
    
    // Check for idle workers
    const workerEntries = Array.from(this.workers.entries());
    for (const [worker, metrics] of workerEntries) {
      if (now - metrics.lastUsed > this.workerTimeout) {
        await this.terminateWorker(worker);
      }
    }

    // Check queue health
    if (this.queue.length > 0) {
      const oldestTask = this.queue[0];
      const waitTime = now - oldestTask.addedTime;
      
      if (waitTime > 60000) { // 1 minute wait threshold
        this.emit('queueWarning', {
          queueLength: this.queue.length,
          oldestTaskWaitTime: waitTime
        });
      }
    }

    // Dynamic scaling based on load and memory
    this.adjustWorkerCount();
  }

  private async terminateWorker(worker: Worker): Promise<void> {
    try {
      await worker.terminate();
    } catch (error) {
      console.error('Error terminating worker:', error);
    }
    this.workers.delete(worker);
    this.activeWorkers = Math.max(0, this.activeWorkers - 1);
  }

  private adjustWorkerCount(): void {
    const now = Date.now();
    if (now - this.lastScaleCheck < this.scaleCheckInterval) {
      return;
    }
    this.lastScaleCheck = now;

    const queueLength = this.queue.length;
    const currentWorkers = this.workers.size;
    const memoryUsage = process.memoryUsage();
    const memoryPressure = memoryUsage.heapUsed / MEMORY_LIMIT;
    
    // Calculate optimal worker count based on multiple factors
    let desiredWorkers = Math.min(
      this.poolSize,
      Math.max(
        2, // Minimum workers
        Math.ceil(queueLength * 0.75), // 75% of queue length
        Math.floor(this.poolSize * (1 - memoryPressure)) // Reduce workers under memory pressure
      )
    );

    // Adjust for high memory pressure
    if (memoryPressure > 0.85) {
      desiredWorkers = Math.min(desiredWorkers, Math.ceil(this.poolSize * 0.5));
    }

    if (currentWorkers < desiredWorkers) {
      // Scale up gradually
      const workersToAdd = Math.min(
        desiredWorkers - currentWorkers,
        Math.ceil((desiredWorkers - currentWorkers) * 0.5) // Add 50% of difference
      );
      for (let i = 0; i < workersToAdd; i++) {
        this.createWorker().catch(console.error);
      }
    } else if (currentWorkers > desiredWorkers) {
      // Scale down idle workers
      const excessWorkers = Array.from(this.workers.entries())
        .filter(([, metrics]) => Date.now() - metrics.lastUsed > 30000)
        .slice(0, currentWorkers - desiredWorkers);
      
      for (const [worker] of excessWorkers) {
        this.terminateWorker(worker).catch(console.error);
      }
    }
  }

  private reportMetrics(): void {
    const metrics: PoolMetrics = {
      activeWorkers: this.activeWorkers,
      totalWorkers: this.workers.size,
      queueLength: this.queue.length,
      totalProcessed: this.totalProcessed,
      averageWaitTime: this.totalProcessed > 0 ? this.totalWaitTime / this.totalProcessed : 0,
      cpuUsage: process.cpuUsage().user / 1000000 // Convert to seconds
    };

    this.emit('metrics', metrics);
  }

  private async createWorker(): Promise<Worker> {
    const worker = new Worker(path.join(process.cwd(), 'app/api/workers/pdfWorker.js'));
    
    this.workers.set(worker, {
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
      lastUsed: Date.now(),
      errors: [],
      memory: {
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal: process.memoryUsage().heapTotal
      }
    });

    worker.on('error', (err) => {
      console.error('Worker error:', err);
      const metrics = this.workers.get(worker);
      if (metrics) {
        metrics.errors.push(err.message);
        metrics.failedTasks++;
      }
      this.emit('workerError', { error: err, workerId: worker.threadId });
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker stopped with exit code ${code}`);
        this.emit('workerExit', { code, workerId: worker.threadId });
      }
      this.workers.delete(worker);
      this.activeWorkers = Math.max(0, this.activeWorkers - 1);
    });

    return worker;
  }

  async processTask(task: any, priority: number = 1): Promise<any> {
    if (this.isShuttingDown) {
      throw new Error('Worker pool is shutting down');
    }

    if (this.queue.length >= this.maxQueueSize) {
      throw new Error('Task queue is full');
    }

    return new Promise(async (resolve, reject) => {
      const taskWrapper = {
        task,
        addedTime: Date.now(),
        resolve,
        reject,
        priority
      };

      const runTask = async (worker: Worker) => {
        const startTime = Date.now();
        const metrics = this.workers.get(worker);
        
        if (metrics) {
          metrics.lastUsed = startTime;
          metrics.totalTasks++;
        }

        try {
          this.activeWorkers++;
          
          const messageHandler = (result: any) => {
            worker.off('message', messageHandler);
            this.activeWorkers--;
            
            if (metrics) {
              const processingTime = Date.now() - startTime;
              metrics.totalProcessingTime += processingTime;
              metrics.averageProcessingTime = metrics.totalProcessingTime / metrics.totalTasks;
              
              if (result.success) {
                metrics.successfulTasks++;
              } else {
                metrics.failedTasks++;
                metrics.errors.push(result.error || 'Unknown error');
              }
            }

            this.totalProcessed++;
            this.totalWaitTime += Date.now() - taskWrapper.addedTime;
            this.processNextTask();
            resolve(result);
          };
          
          worker.on('message', messageHandler);
          
          // Ensure proper buffer transfer
          if (task.pdfBuffer && task.pdfBuffer instanceof ArrayBuffer) {
            worker.postMessage(task, [task.pdfBuffer]);
          } else if (task.pdfBuffer && task.pdfBuffer.buffer instanceof ArrayBuffer) {
            // If it's a TypedArray, transfer its buffer
            worker.postMessage({ ...task, pdfBuffer: task.pdfBuffer.buffer }, [task.pdfBuffer.buffer]);
          } else {
            worker.postMessage(task);
          }
        } catch (error) {
          this.activeWorkers--;
          if (metrics) {
            metrics.failedTasks++;
            metrics.errors.push(error instanceof Error ? error.message : 'Unknown error');
          }
          reject(error);
        }
      };

      if (this.activeWorkers < this.poolSize) {
        const availableWorker = Array.from(this.workers.entries())
          .find(([worker]) => !worker.listenerCount('message'))?.[0];
        
        const worker = availableWorker || await this.createWorker();
        await runTask(worker);
      } else {
        // Insert task in priority order
        const insertIndex = this.queue.findIndex(t => t.priority < priority);
        if (insertIndex === -1) {
          this.queue.push(taskWrapper);
        } else {
          this.queue.splice(insertIndex, 0, taskWrapper);
        }
      }
    });
  }

  private async processNextTask() {
    if (this.queue.length === 0) return;

    // Process highest priority task first
    const nextTask = this.queue.shift();
    if (nextTask) {
      const availableWorker = Array.from(this.workers.entries())
        .find(([worker]) => !worker.listenerCount('message'))?.[0];
      
      const worker = availableWorker || await this.createWorker();
      try {
        const result = await this.processTask(nextTask.task, nextTask.priority);
        nextTask.resolve(result);
      } catch (error) {
        nextTask.reject(error);
      }
    }
  }

  async getMetrics(): Promise<PoolMetrics & { workerMetrics: WorkerMetrics[] }> {
    return {
      activeWorkers: this.activeWorkers,
      totalWorkers: this.workers.size,
      queueLength: this.queue.length,
      totalProcessed: this.totalProcessed,
      averageWaitTime: this.totalProcessed > 0 ? this.totalWaitTime / this.totalProcessed : 0,
      cpuUsage: process.cpuUsage().user / 1000000,
      workerMetrics: Array.from(this.workers.values())
    };
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    clearInterval(this.healthCheckInterval);
    clearInterval(this.metricsInterval);
    
    // Cancel all pending tasks
    this.queue.forEach(task => {
      task.reject(new Error('Worker pool is shutting down'));
    });
    this.queue = [];
    
    // Wait for active tasks to complete with timeout
    const timeout = setTimeout(() => {
      console.warn('Worker pool shutdown timeout reached, forcing termination');
      this.forceTerminate();
    }, 30000); // 30 seconds timeout

    try {
      while (this.activeWorkers > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      clearTimeout(timeout);
    } catch (error) {
      console.error('Error during worker pool shutdown:', error);
      this.forceTerminate();
    }

    this.emit('shutdown');
  }

  private forceTerminate(): void {
    // Force terminate all workers
    for (const [worker] of this.workers) {
      try {
        worker.terminate();
      } catch (error) {
        console.error('Error terminating worker:', error);
      }
    }
    
    this.workers.clear();
    this.queue = [];
    this.activeWorkers = 0;
    this.totalProcessed = 0;
    this.totalWaitTime = 0;
  }
} 