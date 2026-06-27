"use client"

import * as React from "react"
import { Document, Page, pdfjs } from "react-pdf"
import { CaretLeft, CaretRight, MagnifyingGlassPlus, MagnifyingGlassMinus } from "@phosphor-icons/react"

// Set worker Src
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PdfViewerProps {
  blobUrl: string;
  name: string;
}

export default function PdfViewer({ blobUrl, name }: PdfViewerProps) {
  const [numPages, setNumPages] = React.useState<number | null>(null);
  const [pageNumber, setPageNumber] = React.useState<number>(1);
  const [scale, setScale] = React.useState<number>(1.0);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
  }

  return (
    <div className="flex-1 flex flex-col h-full rounded-lg overflow-hidden border border-border bg-muted/20 select-none">
      {/* Control Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <button 
            disabled={pageNumber <= 1} 
            onClick={() => setPageNumber(p => p - 1)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
          >
            <CaretLeft size={16} />
          </button>
          <span className="text-xs font-medium text-muted-foreground">
            Page {pageNumber} of {numPages || "..."}
          </span>
          <button 
            disabled={numPages === null || pageNumber >= numPages} 
            onClick={() => setPageNumber(p => p + 1)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
          >
            <CaretRight size={16} />
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <MagnifyingGlassMinus size={16} />
          </button>
          <span className="text-xs font-medium text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <button 
            onClick={() => setScale(s => Math.min(2.0, s + 0.1))}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Zoom In"
          >
            <MagnifyingGlassPlus size={16} />
          </button>
        </div>
      </div>

      {/* PDF Pages Container */}
      <div className="flex-1 w-full overflow-auto p-4 flex justify-center items-start">
        <Document
          file={blobUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex flex-col items-center justify-center p-12">
              <span className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-xs text-muted-foreground">Loading PDF Document...</p>
            </div>
          }
          error={
            <p className="text-xs text-destructive p-4">Failed to load PDF document.</p>
          }
        >
          <Page 
            pageNumber={pageNumber} 
            scale={scale} 
            renderTextLayer={false}
            renderAnnotationLayer={false}
            className="shadow-md border border-border/50 bg-white rounded-md overflow-hidden"
          />
        </Document>
      </div>
    </div>
  );
}
