import * as React from "react";
import { decryptFile } from "@/lib/crypto";
import dynamic from "next/dynamic";
import { Play, FileAudio, Folder } from "@phosphor-icons/react";

const PdfThumbnail = dynamic(() => import("./pdf-thumbnail"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-muted/40 animate-pulse" />,
});

const DocThumbnail = dynamic(() => import("./doc-thumbnail"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-muted/40 animate-pulse" />,
});

export function NodePreview({ item }: { item: any }) {
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [textPreview, setTextPreview] = React.useState<string | null>(null);
  const [sheetPreview, setSheetPreview] = React.useState<string[][] | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  React.useEffect(() => {
    if (item.type !== "FILE" || !item.url || !item.nodeKey || !item.fileIv) return;

    let active = true;
    let localUrl: string | null = null;

    const loadPreview = async () => {
      const isImage = item.mimeType?.startsWith("image/");
      const isText = item.mimeType?.startsWith("text/") || item.name.endsWith(".md") || item.name.endsWith(".json") || item.name.endsWith(".js");
      const isCsv = item.name.endsWith(".csv");
      const isPdf = item.mimeType === "application/pdf";
      const ext = item.name.split(".").pop()?.toLowerCase();
      const isDoc = ext === "docx" || ext === "doc" || ext === "xlsx" || ext === "xls" || ext === "pptx" || ext === "ppt";

      if (!isImage && !isText && !isCsv && !isPdf && !isDoc) return;

      setPreviewLoading(true);
      try {
        const res = await fetch(item.url);
        if (!res.ok) return;

        const encryptedBuffer = await res.arrayBuffer();
        const decryptedBlob = await decryptFile(encryptedBuffer, item.nodeKey, item.fileIv);

        if (!active) return;

        if (isImage) {
          localUrl = URL.createObjectURL(decryptedBlob);
          setPreviewUrl(localUrl);
        } else if (isText) {
          const text = await decryptedBlob.text();
          setTextPreview(text.substring(0, 150));
        } else if (isCsv) {
          const text = await decryptedBlob.text();
          const rows = text.split("\n").slice(0, 4).map(r => r.split(",").slice(0, 3));
          setSheetPreview(rows);
        } else if (isPdf || isDoc) {
          localUrl = URL.createObjectURL(decryptedBlob);
          setPreviewUrl(localUrl);
        }
      } catch (err) {
        console.error("Preview load failed", item.id, err);
      } finally {
        if (active) setPreviewLoading(false);
      }
    };

    loadPreview();

    return () => {
      active = false;
      if (localUrl) {
        URL.revokeObjectURL(localUrl);
      }
    };
  }, [item]);

  const isImage = item.mimeType?.startsWith("image/");
  const isText = item.mimeType?.startsWith("text/") || item.name.endsWith(".md") || item.name.endsWith(".json") || item.name.endsWith(".js");
  const isCsv = item.name.endsWith(".csv");
  const isPdf = item.mimeType === "application/pdf";
  const isAudio = item.mimeType?.startsWith("audio/");
  const isVideo = item.mimeType?.startsWith("video/");

  if (previewLoading) {
    return (
      <div className="w-full h-24 rounded bg-muted/40 animate-pulse flex items-center justify-center">
        <span className="w-4 h-4 border-2 border-primary/40 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isImage && previewUrl) {
    return (
      <div className="w-full h-24 rounded overflow-hidden border border-border/30 bg-muted/10 flex items-center justify-center">
        <img src={previewUrl} alt="" className="w-full h-full object-cover select-none pointer-events-none" />
      </div>
    );
  }

  if (isText && textPreview) {
    return (
      <div className="w-full h-24 rounded border border-border/40 bg-muted/10 p-2 text-[8px] font-mono overflow-hidden text-left text-muted-foreground/80 leading-tight break-all select-none">
        {textPreview}
      </div>
    );
  }

  if (isCsv && sheetPreview) {
    return (
      <div className="w-full h-24 rounded border border-border/40 bg-muted/10 p-1 overflow-hidden select-none flex flex-col gap-0.5 text-[7px]">
        {sheetPreview.map((row, rIdx) => (
          <div key={rIdx} className="flex gap-0.5 w-full">
            {row.map((cell, cIdx) => (
              <div key={cIdx} className="flex-1 bg-card border border-border/20 px-1 py-0.5 truncate text-center">
                {cell}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (isPdf && previewUrl) {
    return (
      <div className="w-full h-28 rounded overflow-hidden border border-border/30 bg-white dark:bg-neutral-900 flex items-start justify-center select-none pointer-events-none">
        <PdfThumbnail blobUrl={previewUrl} />
      </div>
    );
  }

  if (isPdf && !previewUrl) {
    return (
      <div className="w-full h-28 rounded border border-border/40 bg-white dark:bg-card p-2.5 flex flex-col gap-1.5 shadow-sm overflow-hidden select-none text-left">
        <div className="flex items-center gap-1.5 border-b border-border/20 pb-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
          <div className="h-2 w-16 bg-muted rounded" />
        </div>
        <div className="h-1.5 w-full bg-muted/70 rounded" />
        <div className="h-1.5 w-5/6 bg-muted/50 rounded" />
        <div className="h-1.5 w-4/6 bg-muted/40 rounded" />
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className="w-full h-24 rounded border border-border/40 bg-black relative flex items-center justify-center overflow-hidden">
        <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-white">
          <Play size={12} weight="fill" />
        </div>
        <span className="absolute bottom-1 right-1 text-[8px] px-1 py-0.5 bg-black/60 text-white rounded font-mono">VIDEO</span>
      </div>
    );
  }

  if (isAudio) {
    return (
      <div className="w-full h-24 rounded border border-border/40 bg-muted/10 flex flex-col items-center justify-center p-2 select-none text-muted-foreground gap-1.5">
        <FileAudio size={24} className="text-primary/70 animate-pulse" />
        <div className="flex items-center gap-0.5 h-3 justify-center">
          <div className="w-0.5 h-2 bg-primary/40 rounded-full" />
          <div className="w-0.5 h-3 bg-primary/60 rounded-full" />
          <div className="w-0.5 h-1.5 bg-primary/40 rounded-full" />
          <div className="w-0.5 h-2 bg-primary/50 rounded-full" />
        </div>
      </div>
    );
  }

  if (item.type === "FOLDER") {
    return (
      <div className="w-full h-24 rounded border border-border/30 bg-yellow-500/5 dark:bg-yellow-500/10 flex flex-col items-center justify-center p-2 select-none text-yellow-500/80 gap-1.5">
        <Folder weight="fill" size={32} />
        <span className="text-[9px] font-semibold text-yellow-600/70 dark:text-yellow-500/60 uppercase">Folder</span>
      </div>
    );
  }

  // Document files (Word, Excel, etc.)
  const isDoc = !isImage && !isText && !isCsv && !isPdf && !isAudio && !isVideo && item.type === "FILE";
  if (isDoc) {
    const ext = item.name.split(".").pop()?.toLowerCase();
    return (
      <div className="w-full h-24 rounded overflow-hidden select-none">
        <DocThumbnail blobUrl={previewUrl || ""} fileName={item.name} fileType={ext} />
      </div>
    );
  }

  return (
    <div className="w-full h-24 rounded border border-border/40 bg-muted/10 flex items-center justify-center p-2 select-none">
      <span className="text-[10px] font-medium text-muted-foreground uppercase">{item.mimeType?.split("/")[1] || "FILE"}</span>
    </div>
  );
}
