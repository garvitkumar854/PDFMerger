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
}

interface PoolMetrics {
  activeWorkers: number;
  totalWorkers: number;
  queueLength: number;
  totalProcessed: number;
  averageWaitTime: number;
  cpuUsage: number;
}

export class WorkerPool extends EventEmitter {
  private workers: Map<Worker, WorkerMetrics> = new Map();
  private queue: { 
    task: any;
    addedTime: number;
    resolve: (value: any) => void; 
    reject: (reason?: any) => void; 
  }[] = [];
  private activeWorkers = 0;
  private totalProcessed = 0;
  private totalWaitTime = 0;
  private isShuttingDown = false;
  private healthCheckInterval: NodeJS.Timeout;
  private metricsInterval: NodeJS.Timeout;

  constructor(
    private poolSize = Math.max(os.cpus().length - 1, 1),
    private maxQueueSize = 100,
    private workerTimeout = 300000, // 5 minutes
    private healthCheckFrequency = 30000 // 30 seconds
  ) {
    super();
    this.initializeHealthCheck();
    this.initializeMetricsReporting();
  }

  private initializeHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckFrequency);
  }

  private initializeMetricsReporting(): void {
    this.metricsInterval = setInterval(() => {
      this.reportMetrics();
    }, 60000); // Report metrics every minute
  }

  private async performHealthCheck(): Promise<void> {
    const now = Date.now();
    
    // Check for idle workers
    for (const [worker, metrics] of this.workers.entries()) {
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

    // Scale workers based on load
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
    const queueLength = this.queue.length;
    const currentWorkers = this.workers.size;
    
    if (queueLength > currentWorkers && currentWorkers < this.poolSize) {
      // Scale up
      this.createWorker().catch(console.error);
    } else if (queueLength === 0 && currentWorkers > Math.ceil(this.poolSize / 2)) {
      // Scale down if idle
      const excessWorkers = Array.from(this.workers.entries())
        .filter(([, metrics]) => metrics.totalTasks === 0)
        .slice(0, currentWorkers - Math.ceil(this.poolSize / 2));
      
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
    const worker = new Worker(path.join(process.cwd(), 'app/api/workers/pdfWorker.ts'));
    
    this.workers.set(worker, {
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
      lastUsed: Date.now(),
      errors: []
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

  async processTask(task: any): Promise<any> {
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
        reject
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
          worker.postMessage(task);
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
        if (!this.workers.has(worker)) {
          this.workers.set(worker, {
            totalTasks: 0,
            successfulTasks: 0,
            failedTasks: 0,
            totalProcessingTime: 0,
            averageProcessingTime: 0,
            lastUsed: Date.now(),
            errors: []
          });
        }
        await runTask(worker);
      } else {
        this.queue.push(taskWrapper);
      }
    });
  }

  private async processNextTask() {
    if (this.queue.length === 0) return;

    const nextTask = this.queue.shift();
    if (nextTask) {
      const availableWorker = Array.from(this.workers.entries())
        .find(([worker]) => !worker.listenerCount('message'))?.[0];
      
      const worker = availableWorker || await this.createWorker();
      if (!this.workers.has(worker)) {
        this.workers.set(worker, {
          totalTasks: 0,
          successfulTasks: 0,
          failedTasks: 0,
          totalProcessingTime: 0,
          averageProcessingTime: 0,
          lastUsed: Date.now(),
          errors: []
        });
      }
      
      try {
        const result = await this.processTask(nextTask.task);
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
    
    // Wait for active tasks to complete
    while (this.activeWorkers > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Terminate all workers
    await Promise.all(Array.from(this.workers.keys()).map(worker => this.terminateWorker(worker)));
    
    this.workers.clear();
    this.queue = [];
    this.activeWorkers = 0;
    this.emit('shutdown');
  }
} 