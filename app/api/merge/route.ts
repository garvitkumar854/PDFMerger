import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { headers } from "next/headers";

// Cache for merged PDFs (in-memory cache)
const cache = new Map<string, ArrayBuffer>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function POST(request: Request) {
  try {
    // Validate request method
    if (request.method !== "POST") {
      return NextResponse.json(
        { error: "Method not allowed" },
        { status: 405 }
      );
    }

    // Validate content type
    const contentType = (await headers()).get("content-type");
    if (!contentType?.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content type must be multipart/form-data" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    // Validate files
    if (!files || files.length < 2) {
      return NextResponse.json(
        { error: "At least two PDF files are required" },
        { status: 400 }
      );
    }

    // Check cache
    const cacheKey = files.map(f => f.name).sort().join("|");
    const cachedPdf = cache.get(cacheKey);
    if (cachedPdf) {
      return new NextResponse(cachedPdf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": "attachment; filename=merged.pdf",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    // Create a new PDF document
    const mergedPdf = await PDFDocument.create();

    // Process each PDF file
    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        
        // Copy all pages from the current PDF
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        
        // Add the copied pages to the merged PDF
        copiedPages.forEach((page) => {
          mergedPdf.addPage(page);
        });
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        return NextResponse.json(
          { error: `Failed to process ${file.name}. Please ensure it's a valid PDF file.` },
          { status: 400 }
        );
      }
    }

    // Save the merged PDF
    const mergedPdfBytes = await mergedPdf.save();

    // Cache the result
    cache.set(cacheKey, mergedPdfBytes);
    setTimeout(() => cache.delete(cacheKey), CACHE_TTL);

    // Return the merged PDF
    return new NextResponse(mergedPdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=merged.pdf",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("Error merging PDFs:", error);
    return NextResponse.json(
      { error: "Failed to merge PDFs" },
      { status: 500 }
    );
  }
} 