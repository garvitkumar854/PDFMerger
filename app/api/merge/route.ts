import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { WorkerPool } from "../utils/workerPool";
import { createHash } from "crypto";
import { headers } from 'next/headers';

// Constants
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_PROCESSING_TIME = 300000; // 5 minutes
const SMALL_FILE_THRESHOLD = 5 * 1024 * 1024; // 5MB
const MEDIUM_FILE_THRESHOLD = 20 * 1024 * 1024; // 20MB
const CHUNK_SIZE = 512 * 1024; // 512KB chunks for better streaming

// Initialize worker pool with monitoring
const workerPool = new WorkerPool();

// Enhanced monitoring
workerPool.on('metrics', (metrics) => {
  console.log('Worker Pool Metrics:', metrics);
});

workerPool.on('queueWarning', (warning) => {
  console.warn('Queue Warning:', warning);
});

workerPool.on('workerError', ({ error, workerId }) => {
  console.error(`Worker ${workerId} error:`, error);
});

// Enhanced cache with TTL, size limits, and analytics
class PDFCache {
  private cache = new Map<string, {
    data: Uint8Array;
    timestamp: number;
    size: number;
    hits: number;
    lastAccessed: number;
  }>();
  private maxSize = 500 * 1024 * 1024; // 500MB total cache size
  private currentSize = 0;
  private stats = {
    totalHits: 0,
    totalMisses: 0,
    totalEvictions: 0,
    averageAccessTime: 0
  };

  set(key: string, data: Uint8Array): void {
    const hash = createHash('sha256').update(data).digest('hex');
    
    // Check for duplicates with content-based deduplication
    for (const [existingKey, value] of this.cache.entries()) {
      const existingHash = createHash('sha256').update(value.data).digest('hex');
      if (existingHash === hash) {
        value.hits++;
        value.lastAccessed = Date.now();
        this.cache.set(key, value);
        return;
      }
    }

    // Implement LRU eviction if cache is full
    while (this.currentSize + data.length > this.maxSize && this.cache.size > 0) {
      const oldestKey = Array.from(this.cache.entries())
        .reduce((oldest, current) => {
          const currentScore = current[1].lastAccessed + (current[1].hits * 1000);
          const oldestScore = oldest[1].lastAccessed + (oldest[1].hits * 1000);
          return currentScore < oldestScore ? current : oldest;
        })[0];
      
      const oldEntry = this.cache.get(oldestKey);
      if (oldEntry) {
        this.currentSize -= oldEntry.size;
        this.cache.delete(oldestKey);
        this.stats.totalEvictions++;
      }
    }

    // Add new entry
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      size: data.length,
      hits: 1,
      lastAccessed: Date.now()
    });
    this.currentSize += data.length;
  }

  get(key: string): Uint8Array | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      const now = Date.now();
      // Check if entry is still valid (less than 30 minutes old)
      if (now - entry.timestamp < 30 * 60 * 1000) {
        entry.hits++;
        entry.lastAccessed = now;
        this.stats.totalHits++;
        return entry.data;
      }
      // Remove expired entry
      this.currentSize -= entry.size;
      this.cache.delete(key);
      this.stats.totalMisses++;
    } else {
      this.stats.totalMisses++;
    }
    return undefined;
  }

  getStats() {
    return {
      ...this.stats,
      cacheSize: this.currentSize,
      maxSize: this.maxSize,
      utilization: (this.currentSize / this.maxSize) * 100,
      entryCount: this.cache.size,
      hitRate: this.stats.totalHits / (this.stats.totalHits + this.stats.totalMisses) * 100
    };
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > 30 * 60 * 1000) {
        this.currentSize -= entry.size;
        this.cache.delete(key);
        this.stats.totalEvictions++;
      }
    }
  }
}

const pdfCache = new PDFCache();
const cleanupInterval = setInterval(() => pdfCache.cleanup(), 5 * 60 * 1000);

// Cleanup on module unload
if (process.env.NODE_ENV !== 'production') {
  process.on('beforeExit', () => {
    clearInterval(cleanupInterval);
    workerPool.shutdown().catch(console.error);
  });
}

// Cleanup on production server shutdown
if (process.env.NODE_ENV === 'production') {
  process.on('SIGTERM', () => {
    clearInterval(cleanupInterval);
    workerPool.shutdown().catch(console.error);
  });
}

// Utility function to create a streaming response
function createStreamingResponse(data: Uint8Array, filename: string) {
  // For small files, return directly without streaming
  if (data.length < SMALL_FILE_THRESHOLD) {
    return new NextResponse(data, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': data.length.toString(),
        'Cache-Control': 'no-cache'
      }
    });
  }

  // For larger files, use streaming with optimized chunks
  const chunks: Uint8Array[] = [];
  const chunkSize = data.length < MEDIUM_FILE_THRESHOLD ? 1024 * 1024 : CHUNK_SIZE;
  
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize));
  }

  const stream = new ReadableStream({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(chunk));
      controller.close();
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': data.length.toString(),
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked'
    }
  });
}

// Add retry utility
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === maxRetries) break;
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
  
  throw lastError;
}

// Helper function to get error message
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// Helper function to create error response
function createErrorResponse(message: string, status = 400) {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

export async function POST(request: Request) {
  const startTime = Date.now();
  const requestId = createHash('sha256').update(Date.now().toString()).digest('hex').slice(0, 8);
  let timeoutId: NodeJS.Timeout | undefined;
  let abortController: AbortController | undefined;

  try {
    // Request validation with timeout handling
    abortController = new AbortController();
    timeoutId = setTimeout(() => {
      abortController?.abort();
      throw new Error("Request timeout exceeded");
    }, MAX_PROCESSING_TIME);

    // Content type validation
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("multipart/form-data")) {
      return createErrorResponse("Content type must be multipart/form-data");
    }

    const userAgent = request.headers.get('user-agent') || 'Unknown';
    console.log(`[${requestId}] Processing request from ${userAgent}`);

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length < 2) {
      return createErrorResponse("At least two PDF files are required");
    }

    // Validate and prepare files with optimized loading
    let totalSize = 0;
    const pdfBuffers: ArrayBuffer[] = [];
    const fileMetadata: { name: string; size: number; hash: string }[] = [];

    console.log(`[${requestId}] Processing ${files.length} files`);

    // Process files in parallel with retries
    await Promise.all(files.map(async (file) => {
      if (!file.type || file.type !== "application/pdf") {
        throw new Error(`File ${file.name} is not a valid PDF`);
      }

      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`File ${file.name} exceeds maximum size of 50MB`);
      }

      totalSize += file.size;
      if (totalSize > MAX_TOTAL_SIZE) {
        throw new Error("Total file size exceeds 100MB limit");
      }

      try {
        // Optimized file loading based on size with retry
        const buffer = await retryOperation(async () => {
          if (file.size < SMALL_FILE_THRESHOLD) {
            return await file.arrayBuffer();
          } else {
            const chunks: Uint8Array[] = [];
            const reader = file.stream().getReader();
            const chunkSize = file.size < MEDIUM_FILE_THRESHOLD ? 1024 * 1024 : CHUNK_SIZE;
            
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
              
              if (Date.now() - startTime > MAX_PROCESSING_TIME) {
                throw new Error("Processing timeout exceeded");
              }
            }

            return await new Blob(chunks).arrayBuffer();
          }
        });

        const hash = createHash('sha256').update(new Uint8Array(buffer)).digest('hex');
        
        pdfBuffers.push(buffer);
        fileMetadata.push({ name: file.name, size: file.size, hash });
      } catch (error) {
        throw new Error(`Failed to load ${file.name}: ${getErrorMessage(error)}`);
      }
    }));

    // Generate cache key
    const cacheKey = fileMetadata.map(f => f.hash).sort().join('|');

    // Check cache
    const cachedResult = pdfCache.get(cacheKey);
    if (cachedResult) {
      console.log(`[${requestId}] Cache hit! Serving cached result`);
      return createStreamingResponse(cachedResult, `merged-${new Date().toISOString().slice(0, 10)}.pdf`);
    }

    console.log(`[${requestId}] Cache miss. Processing files...`);

    // Create a new PDF document
    const mergedPdf = await PDFDocument.create();

    // Process each PDF file
    for (let index = 0; index < pdfBuffers.length; index++) {
      try {
        const pdfDoc = await PDFDocument.load(pdfBuffers[index], {
          ignoreEncryption: true,
        });

        const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
        pages.forEach((page) => {
          mergedPdf.addPage(page);
        });

        console.log(`[${requestId}] Processed ${fileMetadata[index].name}: ${pages.length} pages`);
      } catch (error) {
        throw new Error(`Failed to process ${fileMetadata[index].name}: ${getErrorMessage(error)}`);
      }

      if (Date.now() - startTime > MAX_PROCESSING_TIME) {
        throw new Error("Processing timeout exceeded");
      }
    }

    // Save the merged PDF
    const mergedPdfBytes = await mergedPdf.save();
    const mergedBuffer = new Uint8Array(mergedPdfBytes);

    // Cache the result
    pdfCache.set(cacheKey, mergedBuffer);

    console.log(`[${requestId}] Successfully merged ${files.length} files`);
    return createStreamingResponse(mergedBuffer, `merged-${new Date().toISOString().slice(0, 10)}.pdf`);

  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    return createErrorResponse(getErrorMessage(error));
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (abortController) {
      abortController.abort();
    }
  }
} 