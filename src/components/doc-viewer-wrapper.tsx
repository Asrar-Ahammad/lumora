"use client"

import * as React from "react"
import { File, Download, FilePpt, FileXls, FileDoc } from "@phosphor-icons/react"

interface DocViewerWrapperProps {
  blobUrl: string
  fileName: string
  fileType?: string
  onDownload?: () => void
}

export default function DocViewerWrapper({ blobUrl, fileName, fileType, onDownload }: DocViewerWrapperProps) {
  const ext = fileType || fileName.split(".").pop()?.toLowerCase();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [sheetHtml, setSheetHtml] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!blobUrl) return;
    let active = true;
    let pptxViewer: any = null;

    async function renderDocument() {
      setLoading(true);
      setError(null);
      setSheetHtml(null);

      try {
        const res = await fetch(blobUrl);
        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();

        if (!active) return;

        // DOCX - use docx-preview
        if (ext === "docx" || ext === "doc") {
          const docxPreview = await import("docx-preview");
          if (containerRef.current) {
            containerRef.current.innerHTML = "";
            await docxPreview.renderAsync(arrayBuffer, containerRef.current, undefined, {
              className: "docx-preview-content",
              inWrapper: true,
              ignoreWidth: false,
              ignoreHeight: false,
              ignoreFonts: false,
              breakPages: true,
              useBase64URL: true,
            });
          }
        }
        // XLSX / XLS - use SheetJS
        else if (ext === "xlsx" || ext === "xls" || ext === "csv") {
          const XLSX = await import("xlsx");
          const workbook = XLSX.read(arrayBuffer, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const html = XLSX.utils.sheet_to_html(firstSheet, { id: "sheet-table" });
          if (active) setSheetHtml(html);
        }
        // PPTX - use pptx-preview
        else if (ext === "pptx" || ext === "ppt") {
          const pptxPreview = await import("pptx-preview");
          if (containerRef.current && active) {
            containerRef.current.innerHTML = "";
            pptxViewer = pptxPreview.init(containerRef.current, {
              mode: "list",
            });
            await pptxViewer.preview(arrayBuffer);
          }
        }
        else {
          if (active) setError("unsupported");
        }
      } catch (err: any) {
        console.error("Document render error:", err);
        if (active) setError(err.message || "Failed to render document");
      } finally {
        if (active) setLoading(false);
      }
    }

    renderDocument();
    return () => {
      active = false;
      if (pptxViewer && typeof pptxViewer.destroy === 'function') {
        try {
          pptxViewer.destroy();
        } catch (e) {
          console.error("Failed to destroy pptx viewer", e);
        }
      }
    };
  }, [blobUrl, ext]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mb-4" />
        <span className="text-sm text-muted-foreground">Rendering document...</span>
      </div>
    );
  }

  // Unsupported or rendering fallback
  if (error) {
    const icon = ext === "pptx" || ext === "ppt"
      ? <FilePpt size={48} weight="fill" className="text-orange-500" />
      : ext === "xls" || ext === "xlsx"
        ? <FileXls size={48} weight="fill" className="text-emerald-500" />
        : ext === "doc" || ext === "docx"
          ? <FileDoc size={48} weight="fill" className="text-blue-500" />
          : <File size={48} className="text-muted-foreground" />;

    const label = error === "unsupported"
      ? "This file type can't be previewed in-browser"
      : `Failed to render: ${error}`;

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-card rounded-lg min-h-[300px] gap-4">
        <div className="p-6 bg-muted rounded-2xl shadow-sm">{icon}</div>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-foreground mb-1 truncate max-w-md select-none" title={fileName}>
            {fileName}
          </h3>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
        {onDownload && (
          <button
            onClick={onDownload}
            className="mt-2 bg-primary text-primary-foreground hover:bg-primary/95 px-6 py-2.5 rounded-lg font-medium shadow transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Download size={18} />
            Decrypt & Download
          </button>
        )}
      </div>
    );
  }

  // XLSX rendered as HTML table
  if (sheetHtml) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-auto bg-card rounded-lg">
        <div
          className="sheet-viewer-content p-2"
          dangerouslySetInnerHTML={{ __html: sheetHtml }}
        />
        <style jsx global>{`
          .sheet-viewer-content table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
          }
          .sheet-viewer-content th,
          .sheet-viewer-content td {
            border: 1px solid hsl(var(--border));
            padding: 6px 10px;
            text-align: left;
            white-space: nowrap;
          }
          .sheet-viewer-content th {
            background: hsl(var(--muted));
            font-weight: 600;
            color: hsl(var(--muted-foreground));
            position: sticky;
            top: 0;
            z-index: 1;
          }
          .sheet-viewer-content tr:hover td {
            background: hsl(var(--muted) / 0.3);
          }
        `}</style>
      </div>
    );
  }

  // DOCX & PPTX render directly into containerRef
  return (
    <div className={`flex-1 flex flex-col h-full overflow-auto rounded-lg ${ext === "pptx" || ext === "ppt" ? "bg-muted/35 dark:bg-neutral-900" : "bg-white dark:bg-neutral-50"
      }`}>
      <div
        ref={containerRef}
        className={ext === "pptx" || ext === "ppt" ? "pptx-viewer-content flex flex-col items-center p-6 w-full" : "docx-viewer-content"}
      />
      <style jsx global>{`
        .docx-viewer-content {
          padding: 0;
          min-height: 100%;
        }
        .docx-viewer-content .docx-wrapper {
          background: white !important;
          padding: 16px !important;
        }
        .docx-viewer-content .docx-wrapper > section.docx {
          box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important;
          margin-bottom: 16px !important;
          padding: 40px 50px !important;
        }

        /* PPTX styling */
        .pptx-viewer-content {
          width: 100%;
          min-height: 100%;
          box-sizing: border-box;
        }
        .pptx-viewer-content .pptx-preview-wrapper {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
        }
        .pptx-viewer-content .pptx-preview-slide-wrapper {
          background: white;
          border: 1px solid hsl(var(--border));
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
          border-radius: 8px;
          overflow: hidden;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          max-width: 100%;
          position: relative;
        }
        .pptx-viewer-content .pptx-preview-slide-wrapper:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
        }
      `}</style>
    </div>
  );
}
