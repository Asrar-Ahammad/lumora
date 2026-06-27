"use client"

import * as React from "react"
import { File, FilePpt, FileXls, FileDoc, FileZip } from "@phosphor-icons/react"

interface DocThumbnailProps {
  blobUrl: string
  fileName: string
  fileType?: string
}

function getIcon(ext?: string) {
  switch (ext) {
    case "ppt": case "pptx": case "odp":
      return <FilePpt size={32} weight="fill" className="text-orange-500" />;
    case "xls": case "xlsx": case "ods":
      return <FileXls size={32} weight="fill" className="text-emerald-500" />;
    case "doc": case "docx": case "odt": case "rtf":
      return <FileDoc size={32} weight="fill" className="text-blue-500" />;
    case "zip": case "rar": case "7z": case "tar": case "gz":
      return <FileZip size={32} weight="fill" className="text-yellow-600" />;
    default:
      return <File size={32} className="text-muted-foreground" />;
  }
}

function getLabel(ext?: string) {
  switch (ext) {
    case "ppt": case "pptx": return "PPTX";
    case "xls": case "xlsx": return "XLSX";
    case "doc": case "docx": return "DOCX";
    case "odt": return "ODT";
    case "ods": return "ODS";
    case "odp": return "ODP";
    case "rtf": return "RTF";
    case "zip": return "ZIP";
    case "rar": return "RAR";
    default: return ext?.toUpperCase() || "FILE";
  }
}

function getAccent(ext?: string) {
  switch (ext) {
    case "ppt": case "pptx": case "odp": return "bg-orange-500/10 border-orange-500/20";
    case "xls": case "xlsx": case "ods": return "bg-emerald-500/10 border-emerald-500/20";
    case "doc": case "docx": case "odt": case "rtf": return "bg-blue-500/10 border-blue-500/20";
    case "zip": case "rar": case "7z": case "tar": case "gz": return "bg-yellow-500/10 border-yellow-500/20";
    default: return "bg-muted/10 border-border/30";
  }
}

export default function DocThumbnail({ blobUrl, fileName, fileType }: DocThumbnailProps) {
  const ext = fileType || fileName.split(".").pop()?.toLowerCase();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [loading, setLoading] = React.useState(false);
  const [rendered, setRendered] = React.useState(false);
  const [sheetHtml, setSheetHtml] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!blobUrl) {
      setRendered(false);
      setSheetHtml(null);
      return;
    }

    let active = true;
    let pptxViewer: any = null;

    async function loadPreview() {
      setLoading(true);
      try {
        const res = await fetch(blobUrl);
        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();
        if (!active) return;

        if (ext === "docx" || ext === "doc") {
          const docxPreview = await import("docx-preview");
          if (containerRef.current && active) {
            containerRef.current.innerHTML = "";
            await docxPreview.renderAsync(arrayBuffer, containerRef.current, undefined, {
              className: "docx-thumbnail-content",
              inWrapper: false,
              ignoreWidth: true,
              ignoreHeight: true,
              ignoreFonts: true,
              breakPages: false,
              useBase64URL: true,
            });
            if (active) setRendered(true);
          }
        } 
        else if (ext === "xlsx" || ext === "xls" || ext === "csv") {
          const XLSX = await import("xlsx");
          const workbook = XLSX.read(arrayBuffer, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          
          // Render only first few rows/columns for simple preview
          const html = XLSX.utils.sheet_to_html(firstSheet, { 
            id: "sheet-table-thumb",
            editable: false
          });
          if (active) {
            setSheetHtml(html);
            setRendered(true);
          }
        }
        else if (ext === "pptx" || ext === "ppt") {
          const pptxPreview = await import("pptx-preview");
          if (containerRef.current && active) {
            containerRef.current.innerHTML = "";
            pptxViewer = pptxPreview.init(containerRef.current, {
              mode: "slide",
              width: 200,
              height: 120
            });
            await pptxViewer.preview(arrayBuffer);
            if (active) setRendered(true);
          }
        }
      } catch (err) {
        console.error("Failed to load thumbnail preview for doc:", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPreview();

    return () => {
      active = false;
      if (pptxViewer && typeof pptxViewer.destroy === 'function') {
        try {
          pptxViewer.destroy();
        } catch (e) {
          console.error("Failed to destroy pptx viewer in thumbnail", e);
        }
      }
    };
  }, [blobUrl, ext]);

  // Fallback view (static icon)
  const renderFallback = () => (
    <div className={`w-full h-full flex flex-col items-center justify-center p-2 select-none gap-1.5 ${getAccent(ext)}`}>
      {getIcon(ext)}
      <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80">
        {getLabel(ext)}
      </span>
    </div>
  );

  if (!blobUrl || loading || (!rendered && !sheetHtml)) {
    return renderFallback();
  }

  if (sheetHtml) {
    return (
      <div className="w-full h-full overflow-hidden select-none bg-white p-1 text-[5px]">
        <div 
          className="sheet-thumb-table-wrapper"
          dangerouslySetInnerHTML={{ __html: sheetHtml }} 
        />
        <style jsx global>{`
          .sheet-thumb-table-wrapper table {
            width: 100%;
            border-collapse: collapse;
            font-size: 5px;
            line-height: 1.1;
          }
          .sheet-thumb-table-wrapper th,
          .sheet-thumb-table-wrapper td {
            border: 1px solid #e5e7eb;
            padding: 2px;
            text-align: left;
            max-width: 40px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .sheet-thumb-table-wrapper th {
            background: #f3f4f6;
            font-weight: bold;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className={`w-full h-full relative overflow-hidden bg-white select-none ${
      ext === "pptx" || ext === "ppt" ? "flex items-center justify-center" : ""
    }`}>
      {ext === "pptx" || ext === "ppt" ? (
        <div className="transform scale-[0.45] origin-center flex items-center justify-center w-[200px] h-[120px]">
          <div ref={containerRef} className="w-full h-full" />
        </div>
      ) : (
        <div className="transform scale-[0.25] origin-top-left w-[400%] h-[400%] p-4 docx-thumb-content">
          <div ref={containerRef} className="w-full h-full" />
        </div>
      )}
      <style jsx global>{`
        .docx-thumb-content .docx-wrapper {
          background: white !important;
          padding: 0 !important;
          box-shadow: none !important;
        }
        .docx-thumb-content .docx {
          box-shadow: none !important;
          padding: 10px !important;
          border: none !important;
        }
        .pptx-preview-slide-wrapper {
          box-shadow: none !important;
          border: none !important;
        }
      `}</style>
    </div>
  );
}
