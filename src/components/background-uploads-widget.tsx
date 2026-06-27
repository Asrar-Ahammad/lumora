"use client";

import * as React from "react";
import { useUpload, UploadEntry, UploadStatus } from "./upload-provider";
import {
  CloudArrowUp,
  CheckCircle,
  WarningCircle,
  XCircle,
  Spinner,
  X,
  CaretUp,
  CaretDown,
  Trash,
  File,
  FilePdf,
  FileAudio,
  FileVideo,
  FileCode,
  FileText,
  ArrowClockwise,
} from "@phosphor-icons/react";
import { Image as ImageIcon } from "@phosphor-icons/react";

// Helper for formatting sizes
function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// Helper for file icons
function getFileIcon(name: string, size = 16) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) {
    return <ImageIcon size={size} className="text-blue-500" />;
  }
  if (["mp4", "mov", "mkv", "avi", "webm"].includes(ext)) {
    return <FileVideo size={size} className="text-red-500" />;
  }
  if (["mp3", "wav", "ogg", "flac"].includes(ext)) {
    return <FileAudio size={size} className="text-emerald-500" />;
  }
  if (ext === "pdf") {
    return <FilePdf size={size} className="text-rose-500" />;
  }
  if (["json", "js", "ts", "tsx", "jsx", "css", "html", "py", "sh"].includes(ext)) {
    return <FileCode size={size} className="text-yellow-600" />;
  }
  return <FileText size={size} className="text-gray-400" />;
}

const STATUS_LABEL: Record<UploadStatus, string> = {
  staged: "Staged",
  encrypting: "Encrypting…",
  "processing-ai": "AI Processing…",
  uploading: "Uploading…",
  saving: "Saving…",
  done: "Done",
  error: "Failed",
};

export function BackgroundUploadsWidget() {
  const { entries, clearCompleted, removeEntry, retryUpload } = useUpload();
  const [isMinimized, setIsMinimized] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(true);

  // Count metrics
  const activeEntries = entries.filter(
    (e) =>
      e.status === "encrypting" ||
      e.status === "processing-ai" ||
      e.status === "uploading" ||
      e.status === "saving"
  );
  const activeCount = activeEntries.length;
  const doneCount = entries.filter((e) => e.status === "done").length;
  const errorCount = entries.filter((e) => e.status === "error").length;
  const totalCount = entries.length;

  // Calculate overall progress of active/completed uploads
  const totalProgress = entries.reduce((acc, e) => acc + e.progress, 0);
  const averageProgress = totalCount > 0 ? Math.round(totalProgress / totalCount) : 0;

  // Re-enable visibility when new uploads start
  React.useEffect(() => {
    if (activeCount > 0) {
      setIsVisible(true);
    }
  }, [activeCount]);

  // If no files are queued/uploading or uploaded, don't show the widget
  if (entries.length === 0 || !isVisible) {
    return null;
  }

  return (
    <div className="fixed bottom-24 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:w-80 z-40 bg-background border border-border shadow-2xl rounded-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-200">
      
      {/* Widget Header */}
      <div 
        onClick={() => setIsMinimized(prev => !prev)}
        className="flex items-center justify-between px-4 py-3 bg-card border-b border-border cursor-pointer select-none hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          {activeCount > 0 ? (
            <Spinner size={16} className="animate-spin text-primary" />
          ) : (
            <CloudArrowUp size={18} className="text-primary" />
          )}
          <span className="text-xs font-semibold text-foreground">
            {activeCount > 0
              ? `Uploading ${activeCount} file${activeCount !== 1 ? "s" : ""} (${averageProgress}%)`
              : doneCount === totalCount
              ? "All uploads complete"
              : `${doneCount} uploaded · ${errorCount} failed`}
          </span>
        </div>

        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setIsMinimized(prev => !prev)}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
            title={isMinimized ? "Expand" : "Minimize"}
          >
            {isMinimized ? <CaretUp size={14} /> : <CaretDown size={14} />}
          </button>
          
          {/* Close button – only allows hiding widget if no active uploads */}
          {activeCount === 0 && (
            <button
              onClick={() => {
                setIsVisible(false);
                setTimeout(clearCompleted, 300); // clear history when closed
              }}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              title="Close Panel"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Widget Content (Collapsible) */}
      {!isMinimized && (
        <div className="flex flex-col bg-card/45 animate-in slide-in-from-top-2 duration-150">
          
          {/* Active upload list */}
          <div className="max-h-60 overflow-y-auto p-3 space-y-2 border-b border-border">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`flex items-center gap-3 p-2 rounded-xl border text-xs transition-all ${
                  entry.status === "done"
                    ? "bg-emerald-500/5 border-emerald-500/10"
                    : entry.status === "error"
                    ? "bg-destructive/5 border-destructive/10"
                    : "bg-background border-border"
                }`}
              >
                {/* File icon */}
                <div className="p-1 bg-muted rounded">
                  {getFileIcon(entry.name, 14)}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <p className="font-medium text-foreground truncate select-none" title={entry.name}>
                      {entry.name}
                    </p>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {formatBytes(entry.size)}
                    </span>
                  </div>

                  {/* Progress bar */}
                  {entry.status !== "done" && entry.status !== "error" && (
                    <div className="w-full h-1 bg-muted rounded-full overflow-hidden mb-0.5">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${entry.progress}%` }}
                      />
                    </div>
                  )}

                  {/* Status label */}
                  <div
                    className={`text-[10px] font-medium flex items-center gap-1 ${
                      entry.status === "done"
                        ? "text-emerald-500"
                        : entry.status === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {entry.status !== "done" && entry.status !== "error" && (
                      <Spinner size={10} className="animate-spin text-primary" />
                    )}
                    {entry.status === "done" && <CheckCircle size={10} weight="fill" />}
                    {entry.status === "error" && <XCircle size={10} weight="fill" />}
                    <span>{STATUS_LABEL[entry.status]}</span>
                  </div>
                </div>

                {/* Cancel staged upload button */}
                {entry.status === "staged" && (
                  <button
                    onClick={() => removeEntry(entry.id)}
                    className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-muted"
                    title="Remove"
                  >
                    <Trash size={12} />
                  </button>
                )}

                {/* Retry options for failed uploads */}
                {entry.status === "error" && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => retryUpload(entry.id)}
                      className="p-1 text-primary hover:bg-primary/10 rounded transition-colors cursor-pointer"
                      title="Retry Upload"
                    >
                      <ArrowClockwise size={12} weight="bold" />
                    </button>
                    <button
                      onClick={() => removeEntry(entry.id)}
                      className="p-1 text-muted-foreground hover:text-destructive rounded hover:bg-muted cursor-pointer"
                      title="Remove"
                    >
                      <Trash size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Action Footer */}
          <div className="px-3 py-2 bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {doneCount} of {totalCount} completed
            </span>
            {(doneCount > 0 || errorCount > 0) && activeCount === 0 && (
              <button
                onClick={clearCompleted}
                className="font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                Clear completed
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
