"use client"

import * as React from "react"
import { useCrypto } from "./crypto-provider"
import { decryptText, decryptFile } from "@/lib/crypto"
import { FileViewer } from "./file-viewer"
import {
  File,
  Image as ImageIcon,
  FileVideo,
  FileAudio,
  FilePdf,
  FileCode,
  FileText,
  Eye,
  Info,
  Trash,
  ArrowDown,
  ArrowUp,
  Download,
  CaretDown,
  Cloud,
  Warning,
  CheckCircle,
  XCircle,
  Database,
  DotsThreeVertical
} from "@phosphor-icons/react"
import { useToast } from "@/hooks/use-toast"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"

interface StoragePanelProps {
  onSelectNode: (node: any, openPanel: boolean) => void;
  selectedNodeId: string | null;
  refreshTrigger: number;
  onRefresh: () => void;
}

type DecryptedFile = {
  id: string;
  type: "FILE";
  mimeType: string | null;
  sizeBytes: string | null;
  r2Key: string | null;
  name: string;
  fileIv: string | null;
  nodeKey: CryptoKey | null;
  createdAt: string;
};

function getFileIcon(mimeType: string | null, name: string) {
  if (!mimeType) return <File size={18} />;
  if (mimeType.startsWith("image/")) return <ImageIcon size={18} className="text-blue-500" />;
  if (mimeType.startsWith("video/")) return <FileVideo size={18} className="text-red-500" />;
  if (mimeType.startsWith("audio/")) return <FileAudio size={18} className="text-emerald-500" />;
  if (mimeType === "application/pdf") return <FilePdf size={18} className="text-rose-500" />;
  if (mimeType.startsWith("text/") || name.endsWith(".json") || name.endsWith(".js") || name.endsWith(".ts")) {
    return <FileCode size={18} className="text-yellow-600" />;
  }
  return <FileText size={18} className="text-gray-500" />;
}

function formatStorageSize(bytes: number) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function StoragePanel({
  onSelectNode,
  selectedNodeId,
  refreshTrigger,
  onRefresh
}: StoragePanelProps) {
  const { cryptoKey, decryptNodeKeyCascade, isReady } = useCrypto();
  const { toast } = useToast();

  const [loading, setLoading] = React.useState(true);
  const [files, setFiles] = React.useState<DecryptedFile[]>([]);
  const [totalSize, setTotalSize] = React.useState(0);
  
  // Storage categories breakdown sizes
  const [stats, setStats] = React.useState({
    documents: 0,
    media: 0,
    audio: 0,
    archive: 0
  });

  // Filter & Sort States
  const [typeFilter, setTypeFilter] = React.useState<"all" | "docs" | "media" | "audio" | "others">("all");
  const [timeFilter, setTimeFilter] = React.useState<"all" | "today" | "7days" | "30days">("all");
  const [isTypeOpen, setIsTypeOpen] = React.useState(false);
  const [isTimeOpen, setIsTimeOpen] = React.useState(false);
  const [sortKey, setSortKey] = React.useState<"name" | "size">("size");
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">("desc");

  const handleSort = (key: "name" | "size") => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection(key === "size" ? "desc" : "asc");
    }
  };
  const [dropdownOpenId, setDropdownOpenId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!dropdownOpenId) return;
    const handleClose = () => setDropdownOpenId(null);
    window.addEventListener("click", handleClose);
    window.addEventListener("contextmenu", handleClose);
    return () => {
      window.removeEventListener("click", handleClose);
      window.removeEventListener("contextmenu", handleClose);
    };
  }, [dropdownOpenId]);

  // File Viewer state
  const [viewerNode, setViewerNode] = React.useState<any | null>(null);
  const [viewerKey, setViewerKey] = React.useState<CryptoKey | null>(null);

  // Load and decrypt files
  React.useEffect(() => {
    if (!isReady || !cryptoKey) return;
    let active = true;

    async function loadFiles() {
      setLoading(true);
      try {
        const res = await fetch("/api/nodes?category=all");
        if (!res.ok) throw new Error("Failed to fetch nodes");
        const json = await res.json();
        
        const rawNodes = json.nodes || [];
        const folders = json.folders || [];
        const fMap = new Map();
        folders.forEach((f: any) => fMap.set(f.id, f));

        const decryptedFiles: DecryptedFile[] = [];
        let total = 0;
        let docs = 0;
        let media = 0;
        let audio = 0;
        let archive = 0;

        for (const item of rawNodes) {
          if (item.type !== "FILE") continue;

          try {
            const key = await decryptNodeKeyCascade(item, fMap);
            const decName = await decryptText(item.nameEnc, key, item.nameIV);
            let name = decName;
            let fileIv = null;

            try {
              const parsed = JSON.parse(decName);
              name = parsed.name || parsed.filename;
              fileIv = parsed.fileIv;
            } catch {}

            const size = item.sizeBytes ? parseInt(item.sizeBytes) : 0;
            total += size;

            const mime = item.mimeType ? item.mimeType.toLowerCase() : "";
            if (mime.startsWith("image/") || mime.startsWith("video/")) {
              media += size;
            } else if (mime.startsWith("audio/")) {
              audio += size;
            } else if (
              mime.startsWith("text/") ||
              mime === "application/pdf" ||
              mime.includes("document") ||
              mime.includes("sheet") ||
              mime.includes("presentation") ||
              mime.includes("msword") ||
              mime.includes("wordprocessingml") ||
              mime.includes("spreadsheetml") ||
              mime.includes("powerpoint")
            ) {
              docs += size;
            } else {
              archive += size;
            }

            decryptedFiles.push({
              id: item.id,
              type: "FILE",
              mimeType: item.mimeType,
              sizeBytes: item.sizeBytes,
              r2Key: item.r2Key,
              name,
              fileIv,
              nodeKey: key,
              createdAt: item.createdAt
            });
          } catch (err) {
            console.error("Failed decrypting file", item.id, err);
          }
        }

        if (active) {
          setFiles(decryptedFiles);
          setTotalSize(total);
          setStats({
            documents: docs,
            media,
            audio,
            archive
          });
        }
      } catch (err) {
        console.error("Failed to load files for storage breakdown", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadFiles();
    return () => {
      active = false;
    };
  }, [isReady, cryptoKey, refreshTrigger, decryptNodeKeyCascade]);

  // Handle document deletion
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/nodes?id=${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        onRefresh();
        toast({
          title: (
            <span className="flex items-center gap-2">
              <CheckCircle size={16} weight="fill" className="text-emerald-500" />
              File trashed
            </span>
          ),
          description: "File was moved to trash successfully."
        });
      } else {
        throw new Error("Delete failed");
      }
    } catch (err) {
      console.error(err);
      toast({
        title: (
          <span className="flex items-center gap-2">
            <XCircle size={16} weight="fill" className="text-destructive" />
            Delete failed
          </span>
        ),
        description: "Could not move file to trash.",
        variant: "destructive"
      });
    }
  };

  // Open the file viewer modal
  const handleOpenViewer = (item: DecryptedFile) => {
    if (item.nodeKey && item.fileIv) {
      setViewerNode({
        id: item.id,
        name: item.name,
        mimeType: item.mimeType || "application/octet-stream",
        url: item.r2Key ? `/api/media/download?key=${encodeURIComponent(item.r2Key)}` : "",
        sizeBytes: item.sizeBytes || "0",
        fileIv: item.fileIv
      });
      setViewerKey(item.nodeKey);
    }
  };

  const handleDownloadFile = async (file: DecryptedFile) => {
    if (!file) return;
    toast({
      title: "Downloading file...",
      description: "Decrypting file contents in browser...",
    });
    
    try {
      if (!file.nodeKey || !file.fileIv) {
        throw new Error("Missing file decryption key metadata");
      }
      
      const fileUrl = file.r2Key 
        ? `/api/media/download?key=${encodeURIComponent(file.r2Key)}` 
        : `/api/media/download?key=${encodeURIComponent(file.id)}`;

      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error("Failed to download file from server");
      
      const encryptedBuffer = await res.arrayBuffer();
      const decryptedBlob = await decryptFile(encryptedBuffer, file.nodeKey, file.fileIv);
      
      const blobUrl = URL.createObjectURL(decryptedBlob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      
      toast({
        title: (
          <span className="flex items-center gap-2">
            <CheckCircle size={16} weight="fill" className="text-emerald-500" />
            Download complete
          </span>
        ),
        description: `File "${file.name}" downloaded successfully.`,
      });
    } catch (err) {
      console.error("File download failed", err);
      toast({
        title: (
          <span className="flex items-center gap-2">
            <XCircle size={16} weight="fill" className="text-destructive" />
            Download failed
          </span>
        ),
        description: "Could not decrypt and download the file.",
        variant: "destructive",
      });
    }
  };

  // Close dropdowns on outside click
  React.useEffect(() => {
    const handleClose = () => {
      setIsTypeOpen(false);
      setIsTimeOpen(false);
    };
    window.addEventListener("click", handleClose);
    return () => window.removeEventListener("click", handleClose);
  }, []);

  // Filter files
  const filteredFiles = React.useMemo(() => {
    let result = [...files];

    // Filter by type
    if (typeFilter !== "all") {
      result = result.filter(file => {
        const mime = file.mimeType ? file.mimeType.toLowerCase() : "";
        if (typeFilter === "docs") {
          return (
            mime.startsWith("text/") ||
            file.mimeType === "application/pdf" ||
            mime.includes("document") ||
            mime.includes("sheet") ||
            mime.includes("presentation") ||
            mime.includes("msword") ||
            mime.includes("wordprocessingml") ||
            mime.includes("spreadsheetml") ||
            mime.includes("powerpoint")
          );
        }
        if (typeFilter === "media") {
          return mime.startsWith("image/") || mime.startsWith("video/");
        }
        if (typeFilter === "audio") {
          return mime.startsWith("audio/");
        }
        if (typeFilter === "others") {
          return (
            !mime.startsWith("image/") &&
            !mime.startsWith("video/") &&
            !mime.startsWith("audio/") &&
            !mime.startsWith("text/") &&
            file.mimeType !== "application/pdf" &&
            !mime.includes("document") &&
            !mime.includes("sheet") &&
            !mime.includes("presentation") &&
            !mime.includes("msword") &&
            !mime.includes("wordprocessingml") &&
            !mime.includes("spreadsheetml") &&
            !mime.includes("powerpoint")
          );
        }
        return true;
      });
    }

    // Filter by uploaded date
    if (timeFilter !== "all") {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      result = result.filter(file => {
        if (!file.createdAt) return true;
        const fileDate = new Date(file.createdAt);
        if (isNaN(fileDate.getTime())) return true;

        const fileDayStart = new Date(fileDate.getFullYear(), fileDate.getMonth(), fileDate.getDate());
        const diffTime = todayStart.getTime() - fileDayStart.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        if (timeFilter === "today") return diffDays <= 0;
        if (timeFilter === "7days") return diffDays <= 7;
        if (timeFilter === "30days") return diffDays <= 30;
        return true;
      });
    }

    // Sort by key
    result.sort((a, b) => {
      let valA: any = "";
      let valB: any = "";

      if (sortKey === "name") {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortKey === "size") {
        valA = a.sizeBytes ? parseInt(a.sizeBytes) : 0;
        valB = b.sizeBytes ? parseInt(b.sizeBytes) : 0;
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [files, typeFilter, timeFilter, sortKey, sortDirection]);

  // Capacity math (Max capacity is 15 GB)
  const maxCapacity = 15 * 1024 * 1024 * 1024;
  const percentUsed = Math.min(100, (totalSize / maxCapacity) * 100);

  const percentDocs = totalSize > 0 ? (stats.documents / maxCapacity) * 100 : 0;
  const percentMedia = totalSize > 0 ? (stats.media / maxCapacity) * 100 : 0;
  const percentAudio = totalSize > 0 ? (stats.audio / maxCapacity) * 100 : 0;
  const percentArchive = totalSize > 0 ? (stats.archive / maxCapacity) * 100 : 0;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col select-none">
      
      {/* Top Header Row */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-foreground tracking-tight">Storage</h2>
      </div>

      {/* Filter Chips Row */}
      <div className="flex items-center gap-2.5 mb-6">
        {/* Type Filter Chip */}
        <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              setIsTypeOpen(!isTypeOpen);
              setIsTimeOpen(false);
            }}
            className={`px-3 py-1.5 rounded-lg border border-border text-xs font-medium bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-all flex items-center gap-1 ${
              typeFilter !== "all" ? "border-primary bg-primary/5 text-primary hover:bg-primary/10" : ""
            }`}
          >
            <span>
              {typeFilter === "all" && "Type"}
              {typeFilter === "docs" && "Documents"}
              {typeFilter === "media" && "Images & Videos"}
              {typeFilter === "audio" && "Audio"}
              {typeFilter === "others" && "Others"}
            </span>
            <CaretDown size={12} />
          </button>

          {isTypeOpen && (
            <div className="absolute left-0 mt-1 w-44 rounded-xl border border-border bg-popover shadow-lg py-1.5 z-50 animate-in fade-in-50 duration-100 text-xs">
              <button
                onClick={() => { setTypeFilter("all"); setIsTypeOpen(false); }}
                className={`w-full text-left px-3 py-2 hover:bg-muted ${typeFilter === "all" ? "font-semibold text-primary bg-primary/5" : "text-foreground"}`}
              >
                All types
              </button>
              <button
                onClick={() => { setTypeFilter("docs"); setIsTypeOpen(false); }}
                className={`w-full text-left px-3 py-2 hover:bg-muted ${typeFilter === "docs" ? "font-semibold text-primary bg-primary/5" : "text-foreground"}`}
              >
                Documents
              </button>
              <button
                onClick={() => { setTypeFilter("media"); setIsTypeOpen(false); }}
                className={`w-full text-left px-3 py-2 hover:bg-muted ${typeFilter === "media" ? "font-semibold text-primary bg-primary/5" : "text-foreground"}`}
              >
                Images & Videos
              </button>
              <button
                onClick={() => { setTypeFilter("audio"); setIsTypeOpen(false); }}
                className={`w-full text-left px-3 py-2 hover:bg-muted ${typeFilter === "audio" ? "font-semibold text-primary bg-primary/5" : "text-foreground"}`}
              >
                Audio
              </button>
              <button
                onClick={() => { setTypeFilter("others"); setIsTypeOpen(false); }}
                className={`w-full text-left px-3 py-2 hover:bg-muted ${typeFilter === "others" ? "font-semibold text-primary bg-primary/5" : "text-foreground"}`}
              >
                Others
              </button>
            </div>
          )}
        </div>

        {/* Uploaded Date Filter Chip */}
        <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              setIsTimeOpen(!isTimeOpen);
              setIsTypeOpen(false);
            }}
            className={`px-3 py-1.5 rounded-lg border border-border text-xs font-medium bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-all flex items-center gap-1 ${
              timeFilter !== "all" ? "border-primary bg-primary/5 text-primary hover:bg-primary/10" : ""
            }`}
          >
            <span>
              {timeFilter === "all" && "Uploaded"}
              {timeFilter === "today" && "Today"}
              {timeFilter === "7days" && "Last 7 days"}
              {timeFilter === "30days" && "Last 30 days"}
            </span>
            <CaretDown size={12} />
          </button>

          {isTimeOpen && (
            <div className="absolute left-0 mt-1 w-44 rounded-xl border border-border bg-popover shadow-lg py-1.5 z-50 animate-in fade-in-50 duration-100 text-xs">
              <button
                onClick={() => { setTimeFilter("all"); setIsTimeOpen(false); }}
                className={`w-full text-left px-3 py-2 hover:bg-muted ${timeFilter === "all" ? "font-semibold text-primary bg-primary/5" : "text-foreground"}`}
              >
                Any time
              </button>
              <button
                onClick={() => { setTimeFilter("today"); setIsTimeOpen(false); }}
                className={`w-full text-left px-3 py-2 hover:bg-muted ${timeFilter === "today" ? "font-semibold text-primary bg-primary/5" : "text-foreground"}`}
              >
                Today
              </button>
              <button
                onClick={() => { setTimeFilter("7days"); setIsTimeOpen(false); }}
                className={`w-full text-left px-3 py-2 hover:bg-muted ${timeFilter === "7days" ? "font-semibold text-primary bg-primary/5" : "text-foreground"}`}
              >
                Last 7 days
              </button>
              <button
                onClick={() => { setTimeFilter("30days"); setIsTimeOpen(false); }}
                className={`w-full text-left px-3 py-2 hover:bg-muted ${timeFilter === "30days" ? "font-semibold text-primary bg-primary/5" : "text-foreground"}`}
              >
                Last 30 days
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Storage Breakdown Metric Block */}
      <div className="bg-card/45 border border-border/80 rounded-2xl p-5 md:p-6 mb-8 shadow-sm">
        <div className="mb-4">
          <span className="text-2xl font-semibold text-foreground tracking-tight">
            {formatStorageSize(totalSize)}
          </span>
          <span className="text-sm font-medium text-muted-foreground ml-1">
            of 15 GB used
          </span>
        </div>

        {/* Dynamic segmented progress bar */}
        <div className="w-full h-3 bg-muted rounded-full overflow-hidden flex mb-5 border border-border/10">
          {percentDocs > 0 && (
            <div 
              style={{ width: `${percentDocs}%` }} 
              className="h-full bg-blue-500 transition-all duration-500" 
              title={`Documents: ${formatStorageSize(stats.documents)}`}
            />
          )}
          {percentMedia > 0 && (
            <div 
              style={{ width: `${percentMedia}%` }} 
              className="h-full bg-indigo-500 transition-all duration-500" 
              title={`Photos & Media: ${formatStorageSize(stats.media)}`}
            />
          )}
          {percentAudio > 0 && (
            <div 
              style={{ width: `${percentAudio}%` }} 
              className="h-full bg-emerald-500 transition-all duration-500" 
              title={`Audio: ${formatStorageSize(stats.audio)}`}
            />
          )}
          {percentArchive > 0 && (
            <div 
              style={{ width: `${percentArchive}%` }} 
              className="h-full bg-amber-500 transition-all duration-500" 
              title={`Archive & Others: ${formatStorageSize(stats.archive)}`}
            />
          )}
        </div>

        {/* Legend categories list */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-muted-foreground select-none">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
            <span>Documents ({formatStorageSize(stats.documents)})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />
            <span>Photos & Media ({formatStorageSize(stats.media)})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            <span>Audio ({formatStorageSize(stats.audio)})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            <span>Archive & Others ({formatStorageSize(stats.archive)})</span>
          </div>
        </div>
      </div>

      {/* Files List Table */}
      <div className="border border-border rounded-2xl bg-card shadow-sm flex-1 relative">
        <table className="w-full text-left border-collapse table-fixed">
          <thead>
            <tr className="bg-muted/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider select-none font-sans">
              <th 
                className="px-6 py-3.5 w-[70%] cursor-pointer hover:bg-muted/60 transition-colors group/header"
                onClick={() => handleSort("name")}
              >
                <div className="flex items-center gap-1.5">
                  <span>Name</span>
                  {sortKey === "name" ? (
                    sortDirection === "asc" ? <ArrowUp size={14} className="text-primary" /> : <ArrowDown size={14} className="text-primary" />
                  ) : (
                    <ArrowUp size={14} className="opacity-0 group-hover/header:opacity-50 transition-opacity" />
                  )}
                </div>
              </th>
              <th 
                className="px-6 py-3.5 text-right w-[30%] whitespace-nowrap cursor-pointer hover:bg-muted/60 transition-colors group/header"
                onClick={() => handleSort("size")}
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Size</span>
                  {sortKey === "size" ? (
                    sortDirection === "asc" ? <ArrowUp size={14} className="text-primary" /> : <ArrowDown size={14} className="text-primary" />
                  ) : (
                    <ArrowUp size={14} className="opacity-0 group-hover/header:opacity-50 transition-opacity" />
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-md bg-muted/60 flex-shrink-0" />
                      <div className="h-4 w-48 bg-muted/60 rounded" />
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="h-4 w-16 bg-muted/60 rounded ml-auto" />
                  </td>
                </tr>
              ))
            ) : filteredFiles.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-6 py-16 text-center text-muted-foreground">
                  <Database size={40} className="mx-auto opacity-35 mb-2.5" />
                  <p className="font-medium text-sm">No files in storage matching filters</p>
                </td>
              </tr>
            ) : (
              filteredFiles.map((file, index) => {
                const isSelected = file.id === selectedNodeId;
                const isNearBottom = index >= filteredFiles.length - 2;
                return (
                  <ContextMenu 
                    key={file.id}
                    onOpenChange={(open) => {
                      if (open) {
                        setDropdownOpenId(null);
                      }
                    }}
                  >
                    <ContextMenuTrigger
                      render={
                        <tr
                          onClick={() => {
                            setDropdownOpenId(null);
                            onSelectNode(file, false);
                          }}
                          onDoubleClick={() => handleOpenViewer(file)}
                          onContextMenu={() => {
                            setDropdownOpenId(null);
                            onSelectNode(file, false);
                          }}
                          className={`cursor-pointer transition-colors group ${
                            isSelected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/40"
                          } ${dropdownOpenId === file.id ? "relative z-30" : ""}`}
                        />
                      }
                    >
                      <td className="px-6 py-3.5 min-w-0">
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 bg-muted rounded-md group-hover:bg-primary/10 group-hover:text-primary transition-colors flex-shrink-0">
                            {getFileIcon(file.mimeType, file.name)}
                          </div>
                          <span className="text-sm font-medium text-foreground truncate select-none flex-1" title={file.name}>
                            {file.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-right text-sm font-medium text-foreground">
                        <div className="flex items-center justify-end gap-3">
                          <span className="select-none text-muted-foreground">
                            {formatStorageSize(file.sizeBytes ? parseInt(file.sizeBytes) : 0)}
                          </span>
                          
                          {/* Three-dots actions dropdown */}
                          <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setDropdownOpenId(dropdownOpenId === file.id ? null : file.id)}
                              className={`p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-all cursor-pointer ${
                                dropdownOpenId === file.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                              }`}
                              title="More actions"
                            >
                              <DotsThreeVertical size={16} weight="bold" />
                            </button>
                            
                            {dropdownOpenId === file.id && (
                              <div className={`absolute right-0 w-44 rounded-xl border border-border bg-popover shadow-lg py-1.5 z-50 animate-in fade-in-50 duration-100 text-left text-xs font-normal ${
                                isNearBottom ? "bottom-full mb-1" : "mt-1"
                              }`}>
                                {file.nodeKey && file.fileIv && (
                                  <button
                                    onClick={() => {
                                      setDropdownOpenId(null);
                                      handleOpenViewer(file);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-foreground cursor-pointer"
                                  >
                                    <Eye size={14} />
                                    <span>Quick View</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setDropdownOpenId(null);
                                    onSelectNode(file, true);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-foreground cursor-pointer"
                                >
                                  <Info size={14} />
                                  <span>Item Details</span>
                                </button>
                                <div className="h-px bg-border/50 my-1" />
                                <button
                                  onClick={(e) => {
                                    setDropdownOpenId(null);
                                    handleDelete(file.id, e);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-destructive/10 text-destructive cursor-pointer"
                                >
                                  <Trash size={14} />
                                  <span>Move to Trash</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </ContextMenuTrigger>

                    <ContextMenuContent className="w-48 bg-card/85 backdrop-blur-md border border-border/80 shadow-lg rounded-xl p-1.5 animate-in fade-in-50 duration-100 select-none">
                      {file.nodeKey && file.fileIv && (
                        <>
                          <ContextMenuItem
                            onClick={() => handleOpenViewer(file)}
                            className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
                          >
                            <Eye size={16} />
                            <span>Quick View</span>
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() => handleDownloadFile(file)}
                            className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
                          >
                            <Download size={16} />
                            <span>Download</span>
                          </ContextMenuItem>
                        </>
                      )}
                      <ContextMenuItem
                        onClick={() => onSelectNode(file, true)}
                        className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
                      >
                        <Info size={16} />
                        <span>Item Details</span>
                      </ContextMenuItem>
                      <ContextMenuSeparator className="-mx-1.5 my-1 h-px bg-border/50" />
                      <ContextMenuItem
                        onClick={(e: any) => handleDelete(file.id, e)}
                        className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-destructive/10 hover:text-destructive text-destructive cursor-pointer transition-colors"
                      >
                        <Trash size={16} />
                        <span>Move to Trash</span>
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* File Viewer Modal Integration */}
      {viewerNode && viewerKey && (
        <FileViewer
          isOpen={!!viewerNode}
          onClose={() => {
            setViewerNode(null);
            setViewerKey(null);
          }}
          node={viewerNode}
          nodeKey={viewerKey}
        />
      )}
    </div>
  );
}
