import { NextRequest, NextResponse } from 'next/server';
import { PDFService } from '@/lib/services/pdf-service';
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
    
    const formData = await request.formData();
    const files = formData.getAll('files');
    
    // Enhanced request metadata
    const deviceType = request.headers.get('X-Device-Type') || 'desktop';
    const clientMemory = parseInt(request.headers.get('X-Client-Memory') || '0');
    const totalSize = parseInt(request.headers.get('X-Total-Size') || '0');
    const priority = request.headers.get('X-Priority') || 'normal';
    const fileCount = files.length;

    // Advanced validation with size optimization
    if (!files.length) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // Dynamic optimization based on client capabilities and request size
    const isLowEndDevice = deviceType === 'mobile' || clientMemory < 4096;
    const isLargeOperation = totalSize > 100 * 1024 * 1024 || fileCount > 20;
    const isHighPriority = priority === 'high';

    // Convert files to ArrayBuffer with ultra-optimized streaming
    const bufferPromises = files.map(async (file, index) => {
      if (!(file instanceof Blob)) {
        throw new Error('Invalid file format');
      }
      
      metrics.filesProcessed++;
      
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
          const memUsage = process.memoryUsage().heapUsed / 1024 / 1024;
          metrics.peakMemory = Math.max(metrics.peakMemory, memUsage);
          
          // Force GC if memory pressure is high
          if (memUsage > 1024 && typeof global.gc === 'function') {
            global.gc();
          }
        }
        
        // Optimize chunk concatenation
        return chunks.length === 1 ? chunks[0].buffer : Buffer.concat(chunks).buffer;
      }
      
      const buffer = await file.arrayBuffer();
      metrics.bytesProcessed += buffer.byteLength;
      return buffer;
    });

    // Process in optimized dynamic batches
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
      
      // Memory optimization between batches
      if (i > 0 && i % (batchSize * 2) === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
        if (typeof global.gc === 'function') {
          global.gc();
        }
      }
    }

    // Get PDF service instance with ultra-optimized settings
    const pdfService = PDFService.getInstance();
    const result = await pdfService.processPDFs(buffers, {
      parallelProcessing: !isLowEndDevice,
      optimizeOutput: true,
      compressionLevel: isLargeOperation ? 2 : 4,
      preserveMetadata: false,
      parseSpeed: isLowEndDevice ? 1000 : 5000,
      maxConcurrentOperations: isLowEndDevice ? 4 : isHighPriority ? 128 : 64,
      memoryLimit: isLowEndDevice ? 4096 : 16384,
      chunkSize: isLowEndDevice ? 64 : 256
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
      response.headers.set('X-Compression-Ratio', (result.data!.length / totalSize).toFixed(2));
      response.headers.set('X-Peak-Memory', metrics.peakMemory.toFixed(2));
      response.headers.set('X-Files-Processed', metrics.filesProcessed.toString());
      response.headers.set('X-Total-Time', (performance.now() - metrics.startTime).toFixed(2));
    }
    
    // Optimized caching headers
    response.headers.set('Cache-Control', 'no-store, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    
    return response;

  } catch (error) {
    console.error('[PDF Merge] Error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to merge PDFs',
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