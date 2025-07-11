import { NextRequest, NextResponse } from 'next/server';
import { PDFService } from '@/lib/services/pdf-service';
import { ErrorHandler } from '@/lib/utils/error-handler';
import { RequestValidator } from '@/lib/validation/request';
import { rateLimiters, getRateLimitHeaders } from '@/lib/rate-limit';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

// Configure for production performance within Vercel limits
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Set to maximum allowed for Vercel hobby plan (60 seconds)

// Production-optimized performance metrics
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
        limit: 30
      });
      
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded. You can merge up to 30 PDFs per minute. Please wait before trying again.',
          retryAfter: 60,
          limit: 30
        },
        { status: 429, headers }
      );
    }
    
    let formData: FormData;
    let files: FormDataEntryValue[];
    
    try {
      // Check if the request has the correct content type
      const contentType = request.headers.get('content-type');
      console.log(`[PDF Merge] Request content-type: ${contentType}`);
      
      if (!contentType || !contentType.includes('multipart/form-data')) {
        console.error('Invalid content type:', contentType);
        return NextResponse.json({ 
          error: 'Invalid content type. Expected multipart/form-data.' 
        }, { status: 400 });
      }

      formData = await request.formData();
      files = formData.getAll('files');
      
      console.log(`[PDF Merge] Received ${files.length} files from FormData`);
      
      // Validate that we actually got files
      if (!files || files.length === 0) {
        console.error('[PDF Merge] No files found in FormData');
        return NextResponse.json({ 
          error: 'No files found in the request. Please ensure files are properly uploaded.' 
        }, { status: 400 });
      }
      
    } catch (error) {
      console.error('FormData parsing error:', error);
      
      // Provide more specific error messages
      if (error instanceof TypeError && error.message.includes('Failed to parse body as FormData')) {
        return NextResponse.json({ 
          error: 'Invalid request format. The request body is not properly formatted as FormData. Please ensure files are uploaded correctly.' 
        }, { status: 400 });
      }
      
      return NextResponse.json({ 
        error: 'Failed to process uploaded files. Please try again.' 
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

    // Production-optimized dynamic settings
    const isLowEndDevice = deviceType === 'mobile' || clientMemory < 2048;
    const isLargeOperation = totalSize > 25 * 1024 * 1024 || fileCount > 10;
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

      // Validate file size for production
      if (file.size > 25 * 1024 * 1024) {
        throw new Error(`File ${index + 1} exceeds 25MB limit`);
      }
      
      // Enhanced streaming for large files (files larger than 5MB)
      if (file.size > 5 * 1024 * 1024) {
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

    // Process in production-optimized batches
    const batchSize = isLowEndDevice ? 2 : isHighPriority ? 8 : 4;
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

    // Validate total size for production
    const actualTotalSize = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
    if (actualTotalSize > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'Total file size exceeds 50MB limit' }, { status: 400 });
    }

    // Add abort support
    const abortSignal = (request as any).signal || undefined;
    let aborted = false;
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        aborted = true;
        console.log('[PDF Merge] Request aborted by client');
      });
    }

    // When processing PDFs, pass abortSignal and check for abort
    const pdfService = PDFService.getInstance();
    const result = await pdfService.processPDFs(buffers, {
      parallelProcessing: true,
      optimizeOutput: true,
      compressionLevel: isLargeOperation ? 0 : 1,
      preserveMetadata: false,
      parseSpeed: isLowEndDevice ? 5000 : 10000, // Production-optimized
      maxConcurrentOperations: isLowEndDevice ? 4 : isHighPriority ? 16 : 8, // Production-optimized
      memoryLimit: isLowEndDevice ? 16384 : 32768, // Production-optimized
      chunkSize: isLowEndDevice ? 256 : 512, // Production-optimized
      removeAnnotations: false,
      optimizeImages: false,
      abortSignal // Pass abort signal to service
    });
    if (aborted) {
      console.log('[PDF Merge] Aborted during PDF processing, not sending response');
      return new Response(null, { status: 499 }); // 499 Client Closed Request
    }
    if (!result.success) {
      return NextResponse.json({ error: result.error, warnings: result.warnings }, { status: 400 });
    }
    // If for some reason no PDF data is returned, but warnings exist, return JSON with warnings
    if (!result.data) {
      return NextResponse.json({ error: 'No PDF data returned', warnings: result.warnings }, { status: 500 });
    }

    // Production-optimized streaming with dynamic chunk sizing
    const baseChunkSize = isLargeOperation ? 512 * 1024 : 1 * 1024 * 1024; // Production-optimized chunks
    const chunkSize = isLowEndDevice ? baseChunkSize / 2 : baseChunkSize;
    
    const stream = new ReadableStream({
      async start(controller) {
        const data = result.data!;
        const totalChunks = Math.ceil(data.length / chunkSize);
        let processedSize = 0;
        
        for (let i = 0; i < data.length; i += chunkSize) {
          if (aborted) {
            controller.error('Aborted');
            return;
          }
          const chunk = data.slice(i, i + chunkSize);
          controller.enqueue(chunk);
          
          processedSize += chunk.length;
          const progress = (processedSize / data.length) * 100;
          
          // Production-optimized delay for large files to prevent memory pressure
          if (isLargeOperation && i > 0) {
            const delayInterval = isLowEndDevice ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
            if (i % delayInterval === 0) {
              await new Promise(resolve => setTimeout(resolve, isLowEndDevice ? 10 : 5));
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
    
    if (aborted) {
      return new Response(null, { status: 499 });
    }
    
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