import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { WorkerPool } from "../utils/workerPool";
import { createHash } from "crypto";
import { headers } from 'next/headers';

// Constants
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_PROCESSING_TIME = 180000; // 180 seconds
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks for streaming

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

// Run cache cleanup every 5 minutes
setInterval(() => pdfCache.cleanup(), 5 * 60 * 1000);

// Utility function to create a streaming response
function createStreamingResponse(data: Uint8Array, filename: string) {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    chunks.push(data.slice(i, i + CHUNK_SIZE));
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

export async function POST(request: Request) {
  const startTime = Date.now();
  const requestId = createHash('sha256').update(Date.now().toString()).digest('hex').slice(0, 8);

  try {
    // Request validation
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("multipart/form-data")) {
      throw new Error("Content type must be multipart/form-data");
    }

    const userAgent = request.headers.get('user-agent') || 'Unknown';
    console.log(`[${requestId}] Processing request from ${userAgent}`);

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length < 2) {
      throw new Error("At least two PDF files are required");
    }

    // Validate and prepare files
    let totalSize = 0;
    const pdfBuffers: ArrayBuffer[] = [];
    const fileHashes: string[] = [];
    const fileMetadata: { name: string; size: number; hash: string }[] = [];

    console.log(`[${requestId}] Processing ${files.length} files`);

    for (const file of files) {
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

      const buffer = await file.arrayBuffer();
      const hash = createHash('sha256').update(new Uint8Array(buffer)).digest('hex');
      
      pdfBuffers.push(buffer);
      fileHashes.push(hash);
      fileMetadata.push({ name: file.name, size: file.size, hash });
    }

    // Generate cache key
    const cacheKey = fileHashes.sort().join('|');
    
    // Check cache
    const cachedResult = pdfCache.get(cacheKey);
    if (cachedResult) {
      console.log(`[${requestId}] Cache hit! Serving cached result`);
      return createStreamingResponse(cachedResult, `merged-${new Date().toISOString().slice(0, 10)}.pdf`);
    }

    console.log(`[${requestId}] Cache miss. Processing files...`);

    // Process PDFs in parallel using worker pool
    const processPromises = pdfBuffers.map(buffer => 
      workerPool.processTask({ pdfBuffer: buffer })
    );

    const results = await Promise.all(processPromises);
    console.log(`[${requestId}] All workers completed processing`);

    // Merge processed PDFs
    const mergedPdf = await PDFDocument.create();
    let totalPages = 0;
    
    for (const [index, result] of results.entries()) {
      if (!result.success) {
        throw new Error(`Failed to process ${fileMetadata[index].name}: ${result.error}`);
      }

      const pdfDoc = await PDFDocument.load(result.buffer);
      const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
      totalPages += pages.length;

      console.log(`[${requestId}] Processed ${fileMetadata[index].name}: ${pages.length} pages`);

      if (Date.now() - startTime > MAX_PROCESSING_TIME) {
        throw new Error("Processing timeout exceeded");
      }
    }

    // Save with optimized settings
    const mergedPdfBytes = await mergedPdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 100
    });

    // Cache the result
    pdfCache.set(cacheKey, mergedPdfBytes);

    const processingTime = Date.now() - startTime;
    console.log(`[${requestId}] Completed merging ${totalPages} pages in ${processingTime}ms`);

    // Log cache stats
    console.log(`[${requestId}] Cache stats:`, pdfCache.getStats());

    return createStreamingResponse(mergedPdfBytes, `merged-${new Date().toISOString().slice(0, 10)}.pdf`);

  } catch (error) {
    console.error(`[${requestId}] PDF merge error:`, error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ 
      error: message,
      requestId,
      timestamp: new Date().toISOString()
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  }
} 