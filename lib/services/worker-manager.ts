// Worker pool manager for PDF processing
export class WorkerManager {
  private static instance: WorkerManager;
  private workers: Worker[] = [];
  private taskQueue: Array<{
    type: string;
    data: any;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
  }> = [];
  private activeWorkers = new Map<Worker, boolean>();
  private messageIds = new Map<string, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
  }>();

  private constructor(private maxWorkers = navigator.hardwareConcurrency || 4) {
    this.initializeWorkers();
  }

  static getInstance(): WorkerManager {
    if (!WorkerManager.instance) {
      WorkerManager.instance = new WorkerManager();
    }
    return WorkerManager.instance;
  }

  private initializeWorkers() {
    for (let i = 0; i < this.maxWorkers; i++) {
      this.createWorker();
    }
  }

  private createWorker() {
    const worker = new Worker(new URL('../workers/pdf.worker.ts', import.meta.url));
    
    worker.onmessage = (e) => this.handleWorkerMessage(worker, e);
    worker.onerror = (e) => this.handleWorkerError(worker, e);

    this.workers.push(worker);
    this.activeWorkers.set(worker, false);

    return worker;
  }

  private handleWorkerMessage(worker: Worker, e: MessageEvent) {
    const { id, result, error } = e.data;

    if (id && this.messageIds.has(id)) {
      const { resolve, reject } = this.messageIds.get(id)!;
      this.messageIds.delete(id);

      if (error) {
        reject(new Error(error));
      } else {
        resolve(result);
      }
    }

    // Mark worker as available
    this.activeWorkers.set(worker, false);
    this.processNextTask();
  }

  private handleWorkerError(worker: Worker, error: ErrorEvent) {
    console.error('Worker error:', error);
    
    // Replace failed worker
    const index = this.workers.indexOf(worker);
    if (index !== -1) {
      this.workers[index].terminate();
      this.workers[index] = this.createWorker();
    }

    // Process next task
    this.activeWorkers.set(worker, false);
    this.processNextTask();
  }

  private async processNextTask() {
    if (this.taskQueue.length === 0) return;

    const availableWorker = this.workers.find(w => !this.activeWorkers.get(w));
    if (!availableWorker) return;

    const task = this.taskQueue.shift();
    if (!task) return;

    const { type, data, resolve, reject } = task;
    
    try {
      const id = Math.random().toString(36).substring(7);
      this.messageIds.set(id, { resolve, reject });
      this.activeWorkers.set(availableWorker, true);

      availableWorker.postMessage({ type, data, id }, this.getTransferables(data));
    } catch (error) {
      reject(error);
      this.activeWorkers.set(availableWorker, false);
      this.processNextTask();
    }
  }

  private getTransferables(data: any): Transferable[] {
    const transferables: Transferable[] = [];
    
    if (data.buffer instanceof ArrayBuffer) {
      transferables.push(data.buffer);
    }
    
    if (Array.isArray(data.buffers)) {
      data.buffers.forEach((buffer: ArrayBuffer) => {
        if (buffer instanceof ArrayBuffer) {
          transferables.push(buffer);
        }
      });
    }

    return transferables;
  }

  async executeTask<T>(type: string, data: any): Promise<T> {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ type, data, resolve, reject });
      this.processNextTask();
    });
  }

  async validatePDF(buffer: ArrayBuffer): Promise<any> {
    return this.executeTask('validate', { buffer });
  }

  async processPDFs(buffers: ArrayBuffer[], options: any = {}): Promise<Uint8Array> {
    return this.executeTask('process', { buffers, options });
  }

  cleanup() {
    // Terminate all workers
    this.workers.forEach(worker => {
      worker.terminate();
    });

    // Clear all queues and maps
    this.workers = [];
    this.taskQueue = [];
    this.activeWorkers.clear();
    this.messageIds.clear();

    // Reinitialize workers
    this.initializeWorkers();
  }
} 