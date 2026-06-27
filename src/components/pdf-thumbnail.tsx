"use client"

import * as React from "react"
import { Document, Page, pdfjs } from "react-pdf"

// Reuse the same worker as the full PDF viewer
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PdfThumbnailProps {
  blobUrl: string;
}

export default function PdfThumbnail({ blobUrl }: PdfThumbnailProps) {
  return (
    <Document
      file={blobUrl}
      loading={
        <div className="w-full h-full flex items-center justify-center">
          <span className="w-3 h-3 border-2 border-primary/40 border-t-transparent rounded-full animate-spin" />
        </div>
      }
      error={
        <div className="w-full h-full flex items-center justify-center text-[8px] text-muted-foreground">
          PDF
        </div>
      }
    >
      <Page
        pageNumber={1}
        width={180}
        renderTextLayer={false}
        renderAnnotationLayer={false}
        className="pointer-events-none select-none"
      />
    </Document>
  )
}
