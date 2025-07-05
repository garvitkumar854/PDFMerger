import { NextRequest, NextResponse } from 'next/server';
import { PDFService } from '@/lib/services/pdf-service';
import { ErrorHandler } from '@/lib/utils/error-handler';
import { RequestValidator } from '@/lib/validation/request';
import { rateLimiters, getRateLimitHeaders } from '@/lib/rate-limit';
import { Readable } from 'stream';

// Configure for maximum performance within Vercel hobby plan limits
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Set to maximum allowed for Vercel hobby plan (60 seconds)

// Advanced performance metrics
const metrics = {
  startTime: 0,
  bytesProcessed: 0,
  filesProcessed: 0,
  peakMemory: 0
};

export async function POST(request: NextRequest) {
  try {
    metrics.startTime = performance.now();
    console.log('[PDF Merge] Starting new merge request with ultra-performance settings');
    
    // Rate limiting
    const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                    request.headers.get('x-real-ip') || 
                    'unknown';
    
    try {
      await rateLimiters.merge.check(clientIP);
    } catch (error) {
      const headers = getRateLimitHeaders({
        success: false,
        remaining: 0,
        resetTime: Date.now() + 60000,
        limit: 10
      });
      
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429, headers }
      );
    }
    
    let formData: FormData;
    let files: FormDataEntryValue[];
    
    try {
      formData = await request.formData();
      files = formData.getAll('files');
    } catch (error) {
      console.error('FormData parsing error:', error);
      return NextResponse.json({ 
        error: 'Invalid request format. Please ensure files are properly uploaded.' 
      }, { status: 400 });
    }
    
    // Enhanced request metadata
    const deviceType = request.headers.get('X-Device-Type') || 'desktop';
    const clientMemory = parseInt(request.headers.get('X-Client-Memory') || '0');
    const totalSize = parseInt(request.headers.get('X-Total-Size') || '0');
    const priority = request.headers.get('X-Priority') || 'normal';
    const fileCount = files.length;

    // Advanced validation with size optimization
    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // Validate file count
    if (fileCount > 20) {
      return NextResponse.json({ error: 'Maximum 20 files allowed' }, { status: 400 });
    }

    // Validate each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!(file instanceof Blob)) {
        return NextResponse.json({ 
          error: `Invalid file format at position ${i + 1}. Please ensure all files are valid PDFs.` 
        }, { status: 400 });
      }
    }

    // Dynamic optimization based on client capabilities and request size
    const isLowEndDevice = deviceType === 'mobile' || clientMemory < 4096;
    const isLargeOperation = totalSize > 100 * 1024 * 1024 || fileCount > 20;
    const isHighPriority = priority === 'high';

    // Convert files to ArrayBuffer with ultra-optimized streaming
    const bufferPromises = files.map(async (file, index) => {
      // File validation already done above, but double-check
      if (!(file instanceof Blob)) {
        throw new Error(`Invalid file format at position ${index + 1}`);
      }
      
      metrics.filesProcessed++;
      
      // Validate file type
      if (file.type !== 'application/pdf') {
        throw new Error(`File ${index + 1} is not a PDF`);
      }

      // Validate file size
      if (file.size > 200 * 1024 * 1024) {
        throw new Error(`File ${index + 1} exceeds 200MB limit`);
      }
      
      // Enhanced streaming for large files
      if (file.size > 50 * 1024 * 1024) {
        const chunks: Uint8Array[] = [];
        let bytesRead = 0;
        
        const reader = file.stream().getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          chunks.push(value);
          bytesRead += value.length;
          metrics.bytesProcessed += value.length;
          
          // Monitor memory usage
          if (typeof process !== 'undefined') {
            const memUsage = process.memoryUsage().heapUsed / 1024 / 1024;
            metrics.peakMemory = Math.max(metrics.peakMemory, memUsage);
            
            // Force GC if memory pressure is high
            if (memUsage > 1024 && typeof global.gc === 'function') {
              global.gc();
            }
          }
        }
        
        // Optimize chunk concatenation
        return chunks.length === 1 ? chunks[0].buffer : Buffer.concat(chunks).buffer;
      }
      
      const buffer = await file.arrayBuffer();
      metrics.bytesProcessed += buffer.byteLength;
      return buffer;
    });

    // Process in optimized dynamic batches - Faster processing
    const batchSize = isLowEndDevice ? 4 : isHighPriority ? 16 : 8;
    const buffers: ArrayBuffer[] = [];
    
    for (let i = 0; i < bufferPromises.length; i += batchSize) {
      const batch = bufferPromises.slice(i, i + batchSize);
      const results = await Promise.all(batch);
      // Convert all buffers to ArrayBuffer type
      const convertedBuffers = results.map(buffer => {
        if (buffer instanceof SharedArrayBuffer) {
          const temp = new ArrayBuffer(buffer.byteLength);
          new Uint8Array(temp).set(new Uint8Array(buffer));
          return temp;
        }
        return buffer;
      });
      buffers.push(...convertedBuffers);
      
      // Minimal memory optimization for speed
      if (i > 0 && i % (batchSize * 4) === 0) {
        if (typeof global.gc === 'function') {
          global.gc();
        }
      }
    }

    // Validate total size
    const actualTotalSize = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
    if (actualTotalSize > 200 * 1024 * 1024) {
      return NextResponse.json({ error: 'Total file size exceeds 200MB limit' }, { status: 400 });
    }

    // Get PDF service instance with ultra-optimized settings for speed
    const pdfService = PDFService.getInstance();
    const result = await pdfService.processPDFs(buffers, {
      parallelProcessing: true, // Always use parallel processing for speed
      optimizeOutput: true,
      compressionLevel: isLargeOperation ? 1 : 2, // Lower compression for speed
      preserveMetadata: false,
      parseSpeed: isLowEndDevice ? 2000 : 10000, // Much faster parsing
      maxConcurrentOperations: isLowEndDevice ? 8 : isHighPriority ? 256 : 128, // More concurrent operations
      memoryLimit: isLowEndDevice ? 8192 : 32768, // Higher memory limits
      chunkSize: isLowEndDevice ? 128 : 512, // Larger chunks for speed
      removeAnnotations: false,
      optimizeImages: false // Disable image optimization for speed
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Ultra-optimized streaming with dynamic chunk sizing
    const baseChunkSize = isLargeOperation ? 512 * 1024 : 2 * 1024 * 1024;
    const chunkSize = isLowEndDevice ? baseChunkSize / 2 : baseChunkSize;
    
    const stream = new ReadableStream({
      async start(controller) {
        const data = result.data!;
        const totalChunks = Math.ceil(data.length / chunkSize);
        let processedSize = 0;
        
        for (let i = 0; i < data.length; i += chunkSize) {
          const chunk = data.slice(i, i + chunkSize);
          controller.enqueue(chunk);
          
          processedSize += chunk.length;
          const progress = (processedSize / data.length) * 100;
          
          // Dynamic delay for huge files to prevent memory pressure
          if (isLargeOperation && i > 0) {
            const delayInterval = isLowEndDevice ? 25 * 1024 * 1024 : 100 * 1024 * 1024;
            if (i % delayInterval === 0) {
              await new Promise(resolve => setTimeout(resolve, isLowEndDevice ? 5 : 1));
            }
          }
        }
        controller.close();
      }
    });

    const response = new NextResponse(stream);
    
    // Enhanced response headers with detailed metrics
    response.headers.set('Content-Type', 'application/pdf');
    response.headers.set('Content-Length', result.data!.length.toString());
    
    if (result.stats) {
      response.headers.set('X-Total-Pages', result.stats.totalPages.toString());
      response.headers.set('X-Total-Size', result.stats.totalSize.toString());
      response.headers.set('X-Processing-Time', result.stats.processingTime.toString());
      response.headers.set('X-Compression-Ratio', result.stats.compressionRatio.toFixed(2));
      response.headers.set('X-Peak-Memory', metrics.peakMemory.toFixed(2));
      response.headers.set('X-Files-Processed', metrics.filesProcessed.toString());
      response.headers.set('X-Total-Time', (performance.now() - metrics.startTime).toFixed(2));
    }
    
    // Add rate limit headers
    const rateLimitResult = await rateLimiters.merge.check(clientIP);
    const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
    Object.entries(rateLimitHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    
    // Optimized caching headers
    response.headers.set('Cache-Control', 'no-store, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    
    return response;

  } catch (error) {
    const errorDetails = ErrorHandler.handle(error, {
      component: 'MergeAPI',
      action: 'POST',
      timestamp: Date.now()
    });

    console.error('[PDF Merge] Error:', errorDetails);
    
    return NextResponse.json(
      { 
        error: ErrorHandler.createUserMessage(error),
        metrics: {
          peakMemory: metrics.peakMemory.toFixed(2),
          filesProcessed: metrics.filesProcessed,
          bytesProcessed: metrics.bytesProcessed,
          totalTime: (performance.now() - metrics.startTime).toFixed(2)
        }
      },
      { status: 500 }
    );
  }
} 