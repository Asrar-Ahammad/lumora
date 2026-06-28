"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { useCrypto } from "./crypto-provider"
import { Skeleton } from "@/components/ui/skeleton"
import { decryptText, encryptNodeKey, encryptText, decryptFile } from "@/lib/crypto"
import { FileViewer } from "./file-viewer"
import JSZip from "jszip"
import {
  Folder, File, FilePdf, FileAudio, FileVideo, FileCode,
  FileText, Info, Download, Trash, Eye, CaretRight, ShieldCheck,
  CheckCircle, XCircle, FolderOpen, ArrowSquareOut, Copy, UploadSimple,
  FolderPlus, Warning, PencilSimple, DotsThreeVertical, Check, X,
  ArrowUp, ArrowDown, User, Play, Image as ImageIcon, FileDoc, FileXls, FilePpt, FileZip, Star, CheckSquareOffset, LockKey
} from "@phosphor-icons/react"
import { useToast } from "@/hooks/use-toast"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import { DestinationPickerModal } from "./destination-picker-modal"
import { NodePreview } from "./node-preview"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { MobileDrawer } from "@/components/ui/mobile-drawer"
import dynamic from "next/dynamic"

type NodeData = {
  id: string;
  type: "FOLDER" | "FILE";
  mimeType: string | null;
  sizeBytes: string | null;
  r2Key: string | null;
  nameEnc: string;
  nameIV: string;
  nodeKeyEnc: string;
  nodeKeyIV: string;
  parentId: string | null;
  captionEnc: string | null;
  captionIV: string | null;
  createdAt: string;
  url: string | null;
  starred: boolean;
};

type DecryptedNodeData = NodeData & {
  name: string;
  fileIv: string | null;
  nodeKey: CryptoKey | null;
  lastModified?: string | null;
  locationPath?: any[];
};

interface MediaGalleryProps {
  query: string; // Will receive search query
  localQuery: string; // Will receive local search query
  currentFolderId: string | null;
  onNavigate: (folderId: string | null, folderName?: string, folderKey?: CryptoKey | null) => void;
  viewMode: "grid" | "list";
  activeCategory: string;
  onSelectNode: (node: DecryptedNodeData | null, openPanel?: boolean) => void;
  onCloseInfoPanel?: () => void;
  selectedNodeId: string | null;
  refreshTrigger: number;
  onRefresh: () => void;
  onTriggerUpload?: () => void;
  onTriggerCreateFolder?: () => void;
  isInfoPanelOpen?: boolean;
  onMoveToSecure?: (id: string, e?: React.MouseEvent) => void;
}

export function MediaGallery({
  query,
  localQuery,
  currentFolderId,
  onNavigate,
  viewMode,
  activeCategory,
  onSelectNode,
  onCloseInfoPanel,
  selectedNodeId,
  refreshTrigger,
  onRefresh,
  onTriggerUpload,
  onTriggerCreateFolder,
  isInfoPanelOpen,
  onMoveToSecure
}: MediaGalleryProps) {
  const { decryptNodeKeyCascade, cryptoKey, isReady } = useCrypto()
  const { toast } = useToast()

  const decryptedCache = React.useRef<Map<string, { decNodes: DecryptedNodeData[]; foldersMap: Map<string, any>; nextCursor: string | null }>>(new Map())
  const [foldersMap, setFoldersMap] = React.useState<Map<string, any>>(new Map())
  const [loading, setLoading] = React.useState(true)
  const [decryptedItems, setDecryptedItems] = React.useState<DecryptedNodeData[]>([])
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = React.useState(false)

  // Viewer state
  const [viewerNode, setViewerNode] = React.useState<any | null>(null)
  const [viewerKey, setViewerKey] = React.useState<CryptoKey | null>(null)

  // Picker States
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [pickerAction, setPickerAction] = React.useState<"move" | "copy" | null>(null)
  const [pickerNodes, setPickerNodes] = React.useState<DecryptedNodeData[]>([])
  const [isMultiSelectMode, setIsMultiSelectMode] = React.useState(false)
  const [selectedItemIds, setSelectedItemIds] = React.useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = React.useState(false)
  const [pickerFolders, setPickerFolders] = React.useState<any[]>([])
  const [deleteNodeId, setDeleteNodeId] = React.useState<string | null>(null)

  // Rename States
  const [renameNodeId, setRenameNodeId] = React.useState<string | null>(null)

  const deleteNode = React.useMemo(() => {
    return decryptedItems.find((item) => item.id === deleteNodeId) || null;
  }, [deleteNodeId, decryptedItems]);

  const handleToggleStar = async (item: DecryptedNodeData) => {
    const originalStarred = item.starred;
    const nextStarred = !originalStarred;

    // Optimistic UI update
    setDecryptedItems((prev) =>
      prev.map((x) => (x.id === item.id ? { ...x, starred: nextStarred } : x))
    );

    // Update in-memory decryption cache in place to prevent UI re-fetching/refreshing
    const cacheKey = `${currentFolderId || "root"}-${activeCategory}-${debouncedQuery}`;
    const cached = decryptedCache.current.get(cacheKey);
    if (cached) {
      cached.decNodes = cached.decNodes.map((x) =>
        x.id === item.id ? { ...x, starred: nextStarred } : x
      );
    }

    try {
      const res = await fetch(`/api/nodes?id=${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starred: nextStarred }),
      });

      if (!res.ok) {
        throw new Error("Failed to update starring state");
      }

      toast({
        title: nextStarred ? "Added to Starred" : "Removed from Starred",
        description: `Successfully updated ${item.name}`,
      });
    } catch (err) {
      console.error(err);
      // Revert cache on error
      if (cached) {
        cached.decNodes = cached.decNodes.map((x) =>
          x.id === item.id ? { ...x, starred: originalStarred } : x
        );
      }
      // Revert UI on error
      setDecryptedItems((prev) =>
        prev.map((x) => (x.id === item.id ? { ...x, starred: originalStarred } : x))
      );
      toast({
        title: "Error",
        description: "Could not update star. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Load and decrypt folders when opening the picker
  React.useEffect(() => {
    if (!pickerOpen) return;
    let active = true;

    async function loadFolders() {
      const list: any[] = [];
      for (const [id, folder] of foldersMap.entries()) {
        try {
          const key = await decryptNodeKeyCascade(folder, foldersMap);
          const decName = await decryptText(folder.nameEnc, key, folder.nameIV);
          list.push({ id, name: decName, parentId: folder.parentId });
        } catch (err) {
          console.error("Failed to decrypt folder name for picker", id, err);
        }
      }
      if (active) {
        setPickerFolders(list);
      }
    }

    loadFolders();
    return () => { active = false; };
  }, [pickerOpen, foldersMap, decryptNodeKeyCascade]);

  // Recursive copy descendants helper
  async function copyDescendants(originalFolderId: string, copiedFolderId: string, copiedFolderKey: CryptoKey) {
    const res = await fetch(`/api/nodes?parentId=${originalFolderId}`);
    if (!res.ok) throw new Error("Failed to fetch folder children");
    const { nodes, folders } = await res.json();

    const ancestorMap = new Map();
    folders.forEach((f: any) => ancestorMap.set(f.id, f));

    for (const child of nodes) {
      const childKey = await decryptNodeKeyCascade(child, ancestorMap);
      const decName = await decryptText(child.nameEnc, childKey, child.nameIV);
      let name = decName;
      if (child.type === "FILE") {
        try {
          const parsed = JSON.parse(decName);
          name = parsed.name || parsed.filename;
        } catch { }
      }

      const { encryptedKey: childKeyEnc, iv: childKeyIV } = await encryptNodeKey(childKey, copiedFolderKey);
      const { cipherText: childNameEnc, iv: childNameIV } = await encryptText(name, childKey);

      const copyRes = await fetch("/api/nodes/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId: child.id,
          targetParentId: copiedFolderId,
          nodeKeyEnc: childKeyEnc,
          nodeKeyIV: childKeyIV,
          nameEnc: childNameEnc,
          nameIV: childNameIV,
        }),
      });

      if (!copyRes.ok) {
        throw new Error("Failed to copy child node");
      }

      const copyData = await copyRes.json();
      const newChildNode = copyData.node;

      if (child.type === "FOLDER") {
        await copyDescendants(child.id, newChildNode.id, childKey);
      }
    }
  }

  const handleMoveTo = async (nodes: DecryptedNodeData[], targetParentId: string | null) => {
    setActionLoading(true);
    let successCount = 0;
    try {
      let targetParentKey: CryptoKey;
      if (targetParentId === null) {
        if (!cryptoKey) throw new Error("Root key not ready");
        targetParentKey = cryptoKey;
      } else {
        const folder = foldersMap.get(targetParentId);
        if (!folder) throw new Error("Target folder not found");
        targetParentKey = await decryptNodeKeyCascade(folder, foldersMap);
      }

      for (const node of nodes) {
        const { encryptedKey: nodeKeyEnc, iv: nodeKeyIV } = await encryptNodeKey(node.nodeKey!, targetParentKey);

        const res = await fetch("/api/nodes/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: node.id,
            targetParentId,
            nodeKeyEnc,
            nodeKeyIV,
          }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || `Move failed for ${node.name}`);
        }
        successCount++;
      }

      toast({
        title: (
          <span className="flex items-center gap-2">
            <CheckCircle size={16} weight="fill" className="text-emerald-500" />
            Moved successfully
          </span>
        ),
        description: `${successCount} item(s) have been moved.`,
      });

      onRefresh();
      setIsMultiSelectMode(false);
      setSelectedItemIds(new Set());
    } catch (err: any) {
      console.error("Move failed", err);
      toast({
        title: (
          <span className="flex items-center gap-2">
            <XCircle size={16} weight="fill" className="text-destructive" />
            Move failed
          </span>
        ),
        description: err.message || "An unexpected error occurred during move.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
      setPickerOpen(false);
      setPickerNodes([]);
    }
  };

  const handleMoveNodeDirectly = async (draggedNodeId: string, targetParentId: string | null) => {
    const node = decryptedItems.find((n: any) => n.id === draggedNodeId);
    if (!node) return;
    await handleMoveTo([node], targetParentId);
  };

  const handleCopyTo = async (nodes: DecryptedNodeData[], targetParentId: string | null) => {
    setActionLoading(true);
    let successCount = 0;
    try {
      let targetParentKey: CryptoKey;
      if (targetParentId === null) {
        if (!cryptoKey) throw new Error("Root key not ready");
        targetParentKey = cryptoKey;
      } else {
        const folder = foldersMap.get(targetParentId);
        if (!folder) throw new Error("Target folder not found");
        targetParentKey = await decryptNodeKeyCascade(folder, foldersMap);
      }

      for (const node of nodes) {
        const { encryptedKey: nodeKeyEnc, iv: nodeKeyIV } = await encryptNodeKey(node.nodeKey!, targetParentKey);
        let copyNameText = node.name;
        if (node.type === "FILE") {
          let fileIv = node.fileIv;
          let lastModified = node.lastModified;

          if (!fileIv) {
            try {
              const decName = await decryptText(node.nameEnc, node.nodeKey!, node.nameIV);
              const parsed = JSON.parse(decName);
              fileIv = parsed.fileIv;
              if (parsed.lastModified) lastModified = parsed.lastModified;
            } catch (err) {
              console.error("Failed to decrypt existing metadata during copy", err);
            }
          }

          copyNameText = JSON.stringify({
            name: node.name,
            fileIv: fileIv || null,
            lastModified: lastModified || Date.now()
          });
        }
        const { cipherText: nameEnc, iv: nameIV } = await encryptText(copyNameText, node.nodeKey!);

        const res = await fetch("/api/nodes/copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: node.id,
            targetParentId,
            nodeKeyEnc,
            nodeKeyIV,
            nameEnc,
            nameIV,
          }),
        });

        if (!res.ok) {
          throw new Error(`Copy API failed for ${node.name}`);
        }

        const data = await res.json();
        const copiedNode = data.node;

        if (node.type === "FOLDER") {
          await copyDescendants(node.id, copiedNode.id, node.nodeKey!);
        }
        successCount++;
      }

      toast({
        title: (
          <span className="flex items-center gap-2">
            <CheckCircle size={16} weight="fill" className="text-emerald-500" />
            Copied successfully
          </span>
        ),
        description: `${successCount} item(s) have been duplicated.`,
      });

      onRefresh();
      setIsMultiSelectMode(false);
      setSelectedItemIds(new Set());
    } catch (err) {
      console.error("Copy failed", err);
      toast({
        title: (
          <span className="flex items-center gap-2">
            <XCircle size={16} weight="fill" className="text-destructive" />
            Copy failed
          </span>
        ),
        description: "An unexpected error occurred during copy.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
      setPickerOpen(false);
      setPickerNodes([]);
    }
  };

  const handleDownloadNode = async (node: any) => {
    if (!node) return;

    if (node.type === "FILE") {
      toast({
        title: "Downloading file...",
        description: "Decrypting file contents in browser...",
      });

      try {
        if (!node.nodeKey || !node.fileIv) {
          throw new Error("Missing file decryption key metadata");
        }

        const res = await fetch(node.url);
        if (!res.ok) throw new Error("Failed to download file from server");

        const encryptedBuffer = await res.arrayBuffer();
        const decryptedBlob = await decryptFile(encryptedBuffer, node.nodeKey, node.fileIv);

        const blobUrl = URL.createObjectURL(decryptedBlob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = node.name;
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
          description: `File "${node.name}" downloaded successfully.`,
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
    } else {
      toast({
        title: "Preparing folder download...",
        description: "Fetching folder structure...",
      });

      try {
        const res = await fetch("/api/nodes?category=all");
        if (!res.ok) throw new Error("Failed to fetch node list");
        const json = await res.json();

        const rawNodes = json.nodes || [];
        const folders = json.folders || [];

        const fMap = new Map();
        folders.forEach((f: any) => fMap.set(f.id, f));
        rawNodes.forEach((n: any) => {
          if (n.type === "FOLDER") fMap.set(n.id, n);
        });

        const folderNames = new Map<string, string>();
        const folderKeys = new Map<string, CryptoKey>();

        folderNames.set(node.id, node.name);
        folderKeys.set(node.id, node.nodeKey);

        const getDecryptedFolderName = async (folderId: string): Promise<string> => {
          if (folderNames.has(folderId)) return folderNames.get(folderId)!;
          const folder = fMap.get(folderId);
          if (!folder) return "Unknown Folder";

          try {
            const key = await decryptNodeKeyCascade(folder, fMap);
            folderKeys.set(folderId, key);
            const decName = await decryptText(folder.nameEnc, key, folder.nameIV);
            folderNames.set(folderId, decName);
            return decName;
          } catch (err) {
            console.error("Failed to decrypt folder name", folderId, err);
            return "Encrypted Folder";
          }
        };

        const allFiles = rawNodes.filter((n: any) => n.type === "FILE");
        const filesToZip: { fileNode: any; relativePath: string }[] = [];

        const collectFiles = async (currentFolderId: string, currentPath: string) => {
          const filesInFolder = allFiles.filter((f: any) => f.parentId === currentFolderId);
          for (const file of filesInFolder) {
            try {
              const fileKey = await decryptNodeKeyCascade(file, fMap);
              const decName = await decryptText(file.nameEnc, fileKey, file.nameIV);
              let filename = decName;
              let fileIv = null;
              try {
                const parsed = JSON.parse(decName);
                filename = parsed.name || parsed.filename;
                fileIv = parsed.fileIv;
              } catch { }

              filesToZip.push({
                fileNode: { ...file, name: filename, fileIv, nodeKey: fileKey },
                relativePath: currentPath ? `${currentPath}/${filename}` : filename
              });
            } catch (err) {
              console.error("Skipping file decryption failure in collect", file.id, err);
            }
          }

          const subfolders = folders.filter((f: any) => f.parentId === currentFolderId);
          for (const sub of subfolders) {
            const subName = await getDecryptedFolderName(sub.id);
            await collectFiles(sub.id, currentPath ? `${currentPath}/${subName}` : subName);
          }
        };

        await collectFiles(node.id, "");

        if (filesToZip.length === 0) {
          toast({
            title: "Download complete",
            description: "Folder is empty, downloaded empty zip.",
          });
          const zip = new JSZip();
          const zipBlob = await zip.generateAsync({ type: "blob" });
          const blobUrl = URL.createObjectURL(zipBlob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = `${node.name}.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
          return;
        }

        toast({
          title: "Downloading folder files...",
          description: `Preparing to download and decrypt ${filesToZip.length} files...`,
        });

        const zip = new JSZip();

        for (let i = 0; i < filesToZip.length; i++) {
          const { fileNode, relativePath } = filesToZip[i];

          try {
            if (!fileNode.nodeKey || !fileNode.fileIv) continue;

            const fileUrl = fileNode.r2Key
              ? `/api/media/download?key=${encodeURIComponent(fileNode.r2Key)}`
              : `/api/media/download?key=${encodeURIComponent(fileNode.id)}`;

            const fileRes = await fetch(fileUrl);
            if (!fileRes.ok) throw new Error("Failed to fetch file contents");

            const encryptedBuffer = await fileRes.arrayBuffer();
            const decryptedBlob = await decryptFile(encryptedBuffer, fileNode.nodeKey, fileNode.fileIv);

            zip.file(relativePath, decryptedBlob);
          } catch (err) {
            console.error("Failed to add file to zip", fileNode.id, err);
          }
        }

        toast({
          title: "Generating ZIP archive...",
          description: "Compressing files in browser...",
        });

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const blobUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `${node.name}.zip`;
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
          description: `Folder "${node.name}" downloaded in ZIP format.`,
        });
      } catch (err) {
        console.error("Folder download failed", err);
        toast({
          title: (
            <span className="flex items-center gap-2">
              <XCircle size={16} weight="fill" className="text-destructive" />
              Download failed
            </span>
          ),
          description: "Could not create zip archive.",
          variant: "destructive",
        });
      }
    }
  };

  const handleRenameSubmit = async (node: any, newName: string) => {
    if (!node || !newName.trim() || !node.nodeKey) return;
    try {
      let finalNameText = newName.trim();
      if (node.type === "FILE") {
        let fileIv = node.fileIv;
        let lastModified = node.lastModified;

        if (!fileIv) {
          try {
            const decName = await decryptText(node.nameEnc, node.nodeKey, node.nameIV);
            const parsed = JSON.parse(decName);
            fileIv = parsed.fileIv;
            if (parsed.lastModified) lastModified = parsed.lastModified;
          } catch (err) {
            console.error("Failed to decrypt existing metadata during rename", err);
          }
        }

        finalNameText = JSON.stringify({
          name: newName.trim(),
          fileIv: fileIv || null,
          lastModified: lastModified || Date.now()
        });
      }
      const { cipherText: nameEnc, iv: nameIV } = await encryptText(finalNameText, node.nodeKey);

      const res = await fetch(`/api/nodes?id=${node.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nameEnc, nameIV }),
      });

      if (!res.ok) {
        throw new Error("Rename API request failed");
      }

      toast({
        title: (
          <span className="flex items-center gap-2">
            <CheckCircle size={16} weight="fill" className="text-emerald-500" />
            Renamed successfully
          </span>
        ),
        description: `Item is now named "${newName.trim()}".`,
      });

      onRefresh();
    } catch (err) {
      console.error("Rename failed", err);
      toast({
        title: (
          <span className="flex items-center gap-2">
            <XCircle size={16} weight="fill" className="text-destructive" />
            Rename failed
          </span>
        ),
        description: "An unexpected error occurred during rename.",
        variant: "destructive",
      });
    } finally {
      setRenameNodeId(null);
    }
  };

  const handlePickerConfirm = (targetParentId: string | null) => {
    if (pickerNodes.length === 0) return;
    if (pickerAction === "move") {
      handleMoveTo(pickerNodes, targetParentId);
    } else if (pickerAction === "copy") {
      handleCopyTo(pickerNodes, targetParentId);
    }
  };

  // Debounce the semantic search query to prevent rapid API calls while typing
  const [debouncedQuery, setDebouncedQuery] = React.useState(query);

  React.useEffect(() => {
    if (!query.trim()) {
      setDebouncedQuery("");
      return;
    }

    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 400);

    return () => {
      clearTimeout(handler);
    };
  }, [query]);

  // Track previous refreshTrigger to detect changes
  const prevRefreshTrigger = React.useRef(refreshTrigger);
  const hasMounted = React.useRef(false);

  const handleToggleSelect = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (next.size === 0) setIsMultiSelectMode(false);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleEnableMultiSelect = (id: string) => {
    setIsMultiSelectMode(true);
    setSelectedItemIds(new Set([id]));
  };

  // Fetch, decrypt, and cache nodes
  React.useEffect(() => {
    if (!isReady) return;

    // Clear cache when refreshTrigger changes (upload, delete, move, etc.)
    if (prevRefreshTrigger.current !== refreshTrigger) {
      decryptedCache.current.clear();
      prevRefreshTrigger.current = refreshTrigger;
    }

    let active = true;

    async function fetchAndDecryptNodes(cursor: string | null = null, isLoadMore: boolean = false) {
      const cacheKey = `${currentFolderId || "root"}-${activeCategory}-${debouncedQuery}`;
      
      if (!isLoadMore) {
        const cached = decryptedCache.current.get(cacheKey);
        // Only serve from cache if we've mounted before (not first load)
        if (cached && hasMounted.current) {
          setDecryptedItems(cached.decNodes);
          setFoldersMap(cached.foldersMap);
          setNextCursor(cached.nextCursor);
          setLoading(false);
          return;
        } else {
          setDecryptedItems([]);
          setNextCursor(null);
          setLoading(true);
        }
      } else {
        setIsLoadingMore(true);
      }

      try {
        let endpoint = `/api/nodes?parentId=${currentFolderId || ""}`;
        if (debouncedQuery.trim()) {
          endpoint = `/api/search?q=${encodeURIComponent(debouncedQuery)}`;
        } else if (activeCategory !== "drive") {
          endpoint = `/api/nodes?category=${activeCategory}`;
        }
        
        const sep = endpoint.includes("?") ? "&" : "?";
        endpoint += `${sep}limit=50`;
        if (cursor) {
          endpoint += `&cursor=${cursor}`;
        }

        const res = await fetch(endpoint);
        if (res.ok && active) {
          const json = await res.json();
          const rawNodes: NodeData[] = json.nodes || [];
          const returnedNextCursor = json.nextCursor || null;

          const fMap = isLoadMore ? new Map(foldersMap) : new Map();
          if (!isLoadMore) {
            (json.folders || []).forEach((f: any) => {
              fMap.set(f.id, f);
            });
          }

          // Decrypt all nodes client-side
          const list: DecryptedNodeData[] = [];
          for (const item of rawNodes) {
            try {
              const key = await decryptNodeKeyCascade(item, fMap);
              const decName = await decryptText(item.nameEnc, key, item.nameIV);
              let name = decName;
              let fileIv = null;
              let lastModified = null;
              const locationPath: any[] = [];

              if (item.type === "FILE") {
                try {
                  const parsed = JSON.parse(decName);
                  name = parsed.name || parsed.filename;
                  fileIv = parsed.fileIv;
                  lastModified = parsed.lastModified;
                } catch {
                  name = decName;
                }
              }

              // Reconstruct folder location path
              let currId = item.parentId;
              while (currId) {
                const folder = fMap.get(currId);
                if (!folder) break;
                try {
                  const folderKey = await decryptNodeKeyCascade(folder, fMap);
                  const folderName = await decryptText(folder.nameEnc, folderKey, folder.nameIV);
                  locationPath.unshift({
                    id: folder.id,
                    name: folder.parentId === null ? "Root" : folderName,
                    key: folderKey
                  });
                } catch (err) {
                  console.error("Failed to decrypt parent folder name", currId, err);
                }
                currId = folder.parentId;
              }

              // Fallback to Root if it's at the root level (locationPath is empty)
              if (locationPath.length === 0) {
                const rootNode = Array.from(fMap.values()).find((f: any) => f.parentId === null);
                if (rootNode) {
                  try {
                    const rootKey = await decryptNodeKeyCascade(rootNode, fMap);
                    locationPath.push({
                      id: rootNode.id,
                      name: "Root",
                      key: rootKey
                    });
                  } catch { }
                }
              }
              list.push({ ...item, name, fileIv, lastModified, nodeKey: key, locationPath });
            } catch (err) {
              console.error("Decryption failed for item", item.id, err);
              list.push({ ...item, name: "Decryption Error", fileIv: null, lastModified: null, nodeKey: null, locationPath: [] });
            }
          }

          if (active) {
            setFoldersMap(fMap);
            setNextCursor(returnedNextCursor);
            
            if (isLoadMore) {
              setDecryptedItems(prev => {
                const combined = [...prev, ...list];
                decryptedCache.current.set(cacheKey, { decNodes: combined, foldersMap: fMap, nextCursor: returnedNextCursor });
                return combined;
              });
            } else {
              setDecryptedItems(list);
              decryptedCache.current.set(cacheKey, { decNodes: list, foldersMap: fMap, nextCursor: returnedNextCursor });
            }
            hasMounted.current = true;
          }
        }
      } catch (err) {
        console.error("Failed to fetch and decrypt nodes", err);
      } finally {
        if (active) {
          setLoading(false);
          setIsLoadingMore(false);
        }
      }
    }

    fetchAndDecryptNodes();

    // Attach to window so we can trigger loadMore from side the effect
    (window as any)._loadMoreNodes = () => {
      if (nextCursor && !isLoadingMore) {
        fetchAndDecryptNodes(nextCursor, true);
      }
    };

    return () => {
      active = false;
      delete (window as any)._loadMoreNodes;
    };
  }, [currentFolderId, debouncedQuery, activeCategory, refreshTrigger, isReady, decryptNodeKeyCascade, nextCursor, isLoadingMore, foldersMap]);
  
  const handleLoadMore = React.useCallback(() => {
    if ((window as any)._loadMoreNodes) {
      (window as any)._loadMoreNodes();
    }
  }, []);

  // Filter out unstarred items in Starred category without full refetch
  const displayItems = React.useMemo(() => {
    if (activeCategory === "starred") {
      return decryptedItems.filter(item => item.starred);
    }
    return decryptedItems;
  }, [decryptedItems, activeCategory]);

  // 3. Client-side local query filtering
  return (
    <>
      <MediaGalleryContent
        decryptedItems={displayItems}
        loading={loading}
        viewMode={viewMode}
        activeCategory={activeCategory}
        onNavigate={onNavigate}
        onSelectNode={onSelectNode}
        onCloseInfoPanel={onCloseInfoPanel}
        selectedNodeId={selectedNodeId}
        onDelete={handleDelete}
        onOpenViewer={handleOpenViewer}
        viewerNode={viewerNode}
        viewerKey={viewerKey}
        setViewerNode={setViewerNode}
        setViewerKey={setViewerKey}
        localQuery={localQuery}
        onTriggerUpload={onTriggerUpload}
        onTriggerCreateFolder={onTriggerCreateFolder}
        onMoveTo={(node: any) => { 
          setPickerNodes(isMultiSelectMode && selectedItemIds.has(node.id) ? decryptedItems.filter((i) => selectedItemIds.has(i.id)) : [node]); 
          setPickerAction("move"); 
          setPickerOpen(true); 
        }}
        onCopyTo={(node: any) => { 
          setPickerNodes(isMultiSelectMode && selectedItemIds.has(node.id) ? decryptedItems.filter((i) => selectedItemIds.has(i.id)) : [node]); 
          setPickerAction("copy"); 
          setPickerOpen(true); 
        }}
        onRename={(node: any) => setRenameNodeId(node.id)}
        onMoveNodeDirectly={handleMoveNodeDirectly}
        renameNodeId={renameNodeId}
        setRenameNodeId={setRenameNodeId}
        onRenameSubmit={handleRenameSubmit}
        onDownloadNode={handleDownloadNode}
        toggleStar={handleToggleStar}
        isInfoPanelOpen={isInfoPanelOpen}
        hasMore={!!nextCursor}
        isLoadingMore={isLoadingMore}
        onLoadMore={handleLoadMore}
        isMultiSelectMode={isMultiSelectMode}
        selectedItemIds={selectedItemIds}
        handleToggleSelect={handleToggleSelect}
        handleEnableMultiSelect={handleEnableMultiSelect}
        setPickerAction={setPickerAction}
        setPickerNodes={setPickerNodes}
        setPickerOpen={setPickerOpen}
        setIsMultiSelectMode={setIsMultiSelectMode}
        setSelectedItemIds={setSelectedItemIds}
        onMoveToSecure={onMoveToSecure}
      />
      {pickerOpen && (
        <DestinationPickerModal
          isOpen={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onConfirm={handlePickerConfirm}
          excludeFolderIds={pickerNodes.filter(n => n.type === "FOLDER").map(n => n.id)}
          currentNodeName={pickerNodes.length === 1 ? pickerNodes[0].name : `${pickerNodes.length} items`}
          title={pickerAction === "move" ? "Move to" : "Copy to"}
          folders={pickerFolders}
          actionLoading={actionLoading}
        />
      )}
      {deleteNode && (
        <AlertDialog open={!!deleteNodeId} onOpenChange={(open) => !open && setDeleteNodeId(null)}>
          <AlertDialogContent className="sm:max-w-md bg-card border border-border shadow-xl rounded-xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-semibold text-foreground flex items-center gap-2 select-none">
                <Warning size={20} className="text-amber-500" weight="fill" />
                Move to Trash?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground select-none mt-2">
                Are you sure you want to move <strong className="text-foreground select-none">&ldquo;{deleteNode.name}&rdquo;</strong> to the Trash bin? It will remain in Trash for 30 days before being permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex justify-end gap-3 pt-4">
              <AlertDialogCancel onClick={() => setDeleteNodeId(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-amber-500 hover:bg-amber-600 text-white border-none shadow-sm hover:cursor-pointer"
              >
                {actionLoading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  "Move to Trash"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );



  function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteNodeId(id);
  }

  async function confirmDelete() {
    if (!deleteNodeId) return;

    const originalDecryptedItems = decryptedItems;
    // Optimistic UI Update: immediately hide the deleted item
    setDecryptedItems((prev) => prev.filter((item) => item.id !== deleteNodeId));

    setActionLoading(true);
    try {
      const res = await fetch(`/api/nodes?id=${deleteNodeId}`, { method: "DELETE" });
      if (res.ok) {
        onRefresh();
        onSelectNode(null);
        toast({
          title: (
            <span className="flex items-center gap-2">
              <CheckCircle size={16} weight="fill" className="text-emerald-500" />
              Moved to Trash
            </span>
          ),
          description: "The item has been moved to the trash bin.",
        });
      } else {
        // Rollback
        setDecryptedItems(originalDecryptedItems);
        toast({
          title: (
            <span className="flex items-center gap-2">
              <XCircle size={16} weight="fill" className="text-destructive" />
              Failed to delete item
            </span>
          ),
          description: "Could not move the item to Trash.",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Delete failed", err);
      // Rollback
      setDecryptedItems(originalDecryptedItems);
      toast({
        title: (
          <span className="flex items-center gap-2">
            <XCircle size={16} weight="fill" className="text-destructive" />
            Failed to delete item
          </span>
        ),
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
      setDeleteNodeId(null);
    }
  }

  function handleOpenViewer(item: any, nodeKey: CryptoKey, name: string, fileIv: string) {
    onCloseInfoPanel?.();
    setViewerNode({
      id: item.id,
      name,
      mimeType: item.mimeType || "application/octet-stream",
      url: item.url,
      sizeBytes: item.sizeBytes,
      fileIv,
    });
    setViewerKey(nodeKey);
  }
}

function MediaGallerySkeleton({ viewMode, activeCategory }: { viewMode: "grid" | "list"; activeCategory?: string }) {
  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="border border-border rounded-xl p-4 bg-card aspect-square flex flex-col justify-between animate-pulse"
          >
            <div className="flex items-start justify-between">
              <Skeleton className="h-10 w-10 rounded-lg" />
            </div>
            <div className="mt-4 min-w-0">
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm animate-pulse">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-muted/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <th className="px-6 py-3.5 w-full">Name</th>
            <th className="px-6 py-3.5 hidden sm:table-cell">Type</th>
            <th className="px-6 py-3.5 hidden md:table-cell">Size</th>
            {activeCategory && activeCategory !== "drive" && (
              <th className="px-6 py-3.5 hidden md:table-cell">Location</th>
            )}
            <th className="px-6 py-3.5 hidden lg:table-cell">Created At</th>
            <th className="px-6 py-3.5 text-right w-12"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <tr key={i}>
              <td className="px-6 py-3.5 w-full">
                <div className="flex items-center gap-3 w-full">
                  <Skeleton className="h-8 w-8 rounded-md flex-shrink-0" />
                  <Skeleton className="h-4 w-40" />
                </div>
              </td>
              <td className="px-6 py-3.5 hidden sm:table-cell">
                <Skeleton className="h-4 w-12" />
              </td>
              <td className="px-6 py-3.5 hidden md:table-cell">
                <Skeleton className="h-4 w-16" />
              </td>
              {activeCategory && activeCategory !== "drive" && (
                <td className="px-6 py-3.5 hidden md:table-cell">
                  <Skeleton className="h-4 w-24" />
                </td>
              )}
              <td className="px-6 py-3.5 hidden lg:table-cell">
                <Skeleton className="h-4 w-20" />
              </td>
              <td className="px-6 py-3.5 text-right">
                <Skeleton className="h-6 w-12 ml-auto" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Separate view rendering component to keep it clean and handle props
function MediaGalleryContent({
  decryptedItems, loading, viewMode, activeCategory, onNavigate, onSelectNode, onCloseInfoPanel, selectedNodeId, onDelete, onOpenViewer,
  viewerNode, viewerKey, setViewerNode, setViewerKey, localQuery,
  onTriggerUpload, onTriggerCreateFolder, onMoveTo, onCopyTo, onRename, onMoveNodeDirectly,
  renameNodeId, setRenameNodeId, onRenameSubmit, onDownloadNode, toggleStar,
  isInfoPanelOpen, hasMore, isLoadingMore, onLoadMore,
  isMultiSelectMode, selectedItemIds, handleToggleSelect, handleEnableMultiSelect,
  setPickerAction, setPickerNodes, setPickerOpen, setIsMultiSelectMode, setSelectedItemIds,
  onMoveToSecure
}: any) {
  const observerRef = React.useRef<IntersectionObserver | null>(null);
  const loadMoreRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (isLoadingMore) return;
      if (observerRef.current) observerRef.current.disconnect();

      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          onLoadMore();
        }
      });

      if (node) observerRef.current.observe(node);
    },
    [isLoadingMore, hasMore, onLoadMore]
  );
  const [sortKey, setSortKey] = React.useState<"name" | "size" | "createdAt">("name");
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">("asc");

  const filteredItems = React.useMemo(() => {
    if (!localQuery?.trim()) return decryptedItems;
    const q = localQuery.toLowerCase();
    return decryptedItems.filter((item: any) => item.name.toLowerCase().includes(q));
  }, [decryptedItems, localQuery]);

  const sortedItems = React.useMemo(() => {
    const items = [...filteredItems];
    items.sort((a: any, b: any) => {
      // Group folders on top
      if (a.type !== b.type) {
        return a.type === "FOLDER" ? -1 : 1;
      }

      let valA: any = "";
      let valB: any = "";

      if (sortKey === "name") {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortKey === "size") {
        valA = parseInt(a.sizeBytes || "0");
        valB = parseInt(b.sizeBytes || "0");
      } else if (sortKey === "createdAt") {
        valA = new Date(a.createdAt).getTime();
        valB = new Date(b.createdAt).getTime();
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return items;
  }, [filteredItems, sortKey, sortDirection]);

  const handleSort = (key: "name" | "size" | "createdAt") => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const [dropdownOpenId, setDropdownOpenId] = React.useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = React.useState<{ top: number; left: number } | null>(null);
  const [mobileDrawerItem, setMobileDrawerItem] = React.useState<any | null>(null);

  const handleOptionsClick = (item: any, trigger: HTMLElement) => {
    if (window.innerWidth < 768) {
      setMobileDrawerItem(item);
    } else {
      const rect = trigger.getBoundingClientRect();
      const nextOpen = dropdownOpenId === item.id ? null : item.id;
      setDropdownOpenId(nextOpen);

      if (nextOpen) {
        const hasPreview = item.type === "FILE" && item.nodeKey && item.fileIv;
        const itemsCount = item.type === "FOLDER" ? 6 : (hasPreview ? 7 : 6);
        const menuHeight = itemsCount * 32 + 14;

        const shouldOpenUpward = window.innerHeight - rect.bottom < menuHeight;
        const topPos = shouldOpenUpward
          ? rect.top - menuHeight + window.scrollY
          : rect.bottom + window.scrollY;

        const leftPos = Math.max(
          8,
          Math.min(
            rect.right - 176 + window.scrollX,
            window.innerWidth - 176 - 8 + window.scrollX
          )
        );

        setDropdownPosition({
          top: topPos,
          left: leftPos,
        });
      } else {
        setDropdownPosition(null);
      }
    }
  };

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

  if (loading && !decryptedItems.length) {
    return <MediaGallerySkeleton viewMode={viewMode} activeCategory={activeCategory} />;
  }

  const renderContent = () => {
    if (!sortedItems.length) {
      return (
        <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-border rounded-2xl bg-muted/10 p-6 min-h-[300px] flex flex-col justify-center items-center">
          <Folder size={48} className="mx-auto opacity-40 mb-3" />
          <p className="font-medium text-sm">No files or folders found</p>
          <p className="text-xs text-muted-foreground mt-1">Upload files or create folders to get started.</p>
        </div>
      );
    }

    return viewMode === "grid" ? (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "1rem" }}>
        {sortedItems.map((item: any) => (
          <GridItem
            key={item.id}
            item={item}
            activeCategory={activeCategory}
            onNavigate={onNavigate}
            onSelect={onSelectNode}
            selectedNodeId={selectedNodeId}
            onDelete={onDelete}
            onOpenViewer={onOpenViewer}
            onMoveTo={onMoveTo}
            onCopyTo={onCopyTo}
            onRename={onRename}
            onMoveNodeDirectly={onMoveNodeDirectly}
            renameNodeId={renameNodeId}
            setRenameNodeId={setRenameNodeId}
            onRenameSubmit={onRenameSubmit}
            onDownloadNode={onDownloadNode}
            onOptionsClick={handleOptionsClick}
            isDropdownOpen={dropdownOpenId === item.id}
            isMultiSelectMode={isMultiSelectMode}
            selectedItemIds={selectedItemIds}
            onToggleSelect={handleToggleSelect}
            onEnableMultiSelect={handleEnableMultiSelect}
            onMoveToSecure={onMoveToSecure}
          />
        ))}
      </div>
    ) : (
      <div className="border border-border rounded-xl bg-card shadow-sm relative">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-muted/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider select-none">
              <th
                className="px-6 py-3.5 cursor-pointer hover:bg-muted/60 transition-colors group/header w-full"
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
              <th className="px-6 py-3.5 hidden sm:table-cell">Type</th>
              <th
                className="px-6 py-3.5 hidden md:table-cell cursor-pointer hover:bg-muted/60 transition-colors group/header"
                onClick={() => handleSort("size")}
              >
                <div className="flex items-center gap-1.5">
                  <span>Size</span>
                  {sortKey === "size" ? (
                    sortDirection === "asc" ? <ArrowUp size={14} className="text-primary" /> : <ArrowDown size={14} className="text-primary" />
                  ) : (
                    <ArrowUp size={14} className="opacity-0 group-hover/header:opacity-50 transition-opacity" />
                  )}
                </div>
              </th>
              {activeCategory !== "drive" && (
                <th className="px-6 py-3.5 hidden md:table-cell">Location</th>
              )}
              <th
                className="px-6 py-3.5 hidden lg:table-cell cursor-pointer hover:bg-muted/60 transition-colors group/header"
                onClick={() => handleSort("createdAt")}
              >
                <div className="flex items-center gap-1.5">
                  <span>Created At</span>
                  {sortKey === "createdAt" ? (
                    sortDirection === "asc" ? <ArrowUp size={14} className="text-primary" /> : <ArrowDown size={14} className="text-primary" />
                  ) : (
                    <ArrowUp size={14} className="opacity-0 group-hover/header:opacity-50 transition-opacity" />
                  )}
                </div>
              </th>
              <th className="px-6 py-3.5 text-right w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedItems.map((item: any) => (
              <ListItem
                key={item.id}
                item={item}
                activeCategory={activeCategory}
                onNavigate={onNavigate}
                onSelect={onSelectNode}
                selectedNodeId={selectedNodeId}
                onDelete={onDelete}
                onOpenViewer={onOpenViewer}
                onMoveTo={onMoveTo}
                onCopyTo={onCopyTo}
                onRename={onRename}
                onMoveNodeDirectly={onMoveNodeDirectly}
                renameNodeId={renameNodeId}
                setRenameNodeId={setRenameNodeId}
                onOptionsClick={handleOptionsClick}
                isDropdownOpen={dropdownOpenId === item.id}
                onDownloadNode={onDownloadNode}
                toggleStar={handleToggleStar}
                isMultiSelectMode={isMultiSelectMode}
                selectedItemIds={selectedItemIds}
                onToggleSelect={handleToggleSelect}
                onEnableMultiSelect={handleEnableMultiSelect}
                onMoveToSecure={onMoveToSecure}
              />
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderLoadMoreIndicator = () => {
    if (!hasMore) return null;
    return (
      <div ref={loadMoreRef} className="py-6 flex justify-center items-center">
        {isLoadingMore ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading more...
          </div>
        ) : (
          <div className="h-6" /> // spacer to trigger observer
        )}
      </div>
    );
  };

  const renderSharedControls = () => {
    return (
      <>
        {isMultiSelectMode && selectedItemIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-5 duration-200">
            <div className="bg-popover border border-border shadow-xl rounded-full px-4 py-2.5 flex items-center gap-4">
              <span className="text-sm font-medium whitespace-nowrap">
                {selectedItemIds.size} item{selectedItemIds.size !== 1 ? 's' : ''} selected
              </span>
              <div className="w-px h-4 bg-border" />
              <button
                onClick={() => {
                  setPickerAction("move");
                  setPickerNodes(decryptedItems.filter((i: any) => selectedItemIds.has(i.id)));
                  setPickerOpen(true);
                }}
                className="text-sm font-medium text-primary hover:text-primary/80 transition-colors cursor-pointer whitespace-nowrap"
              >
                Move
              </button>
              <button
                onClick={() => {
                  setPickerAction("copy");
                  setPickerNodes(decryptedItems.filter((i: any) => selectedItemIds.has(i.id)));
                  setPickerOpen(true);
                }}
                className="text-sm font-medium text-primary hover:text-primary/80 transition-colors cursor-pointer whitespace-nowrap"
              >
                Copy
              </button>
              <button
                onClick={() => {
                  setIsMultiSelectMode(false);
                  setSelectedItemIds(new Set());
                }}
                className="p-1 text-muted-foreground hover:bg-muted rounded-full transition-colors cursor-pointer"
                title="Cancel"
              >
                <XCircle size={18} />
              </button>
            </div>
          </div>
        )}

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

        <MobileDrawer
          isOpen={!!mobileDrawerItem}
          onClose={() => setMobileDrawerItem(null)}
          title={mobileDrawerItem?.name || "Actions"}
        >
          {mobileDrawerItem && (
            <>
              {/* ── Quick Actions ── */}
              <p className="px-4 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 select-none">Quick Actions</p>
              <button
                onClick={() => {
                  const item = mobileDrawerItem;
                  setMobileDrawerItem(null);
                  if (item.type === "FOLDER") {
                    onNavigate(item.id, item.name, item.nodeKey!);
                  } else if (item.nodeKey && item.fileIv) {
                    onOpenViewer(item, item.nodeKey!, item.name, item.fileIv!);
                  }
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-foreground hover:bg-muted font-medium text-left rounded-xl transition-colors cursor-pointer text-sm"
              >
                {mobileDrawerItem.type === "FOLDER" ? <FolderOpen size={18} /> : <Eye size={18} />}
                <span>{mobileDrawerItem.type === "FOLDER" ? "Open" : "Preview"}</span>
              </button>
              <button
                onClick={() => {
                  const item = mobileDrawerItem;
                  setMobileDrawerItem(null);
                  toggleStar(item);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-foreground hover:bg-muted font-medium text-left rounded-xl transition-colors cursor-pointer text-sm"
              >
                <Star size={18} weight={mobileDrawerItem.starred ? "fill" : "regular"} className={mobileDrawerItem.starred ? "text-yellow-500" : ""} />
                <span>{mobileDrawerItem.starred ? "Remove Star" : "Add to Starred"}</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const item = mobileDrawerItem;
                  setMobileDrawerItem(null);
                  onSelectNode(item, true);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-foreground hover:bg-muted font-medium text-left rounded-xl transition-colors cursor-pointer text-sm"
              >
                <Info size={18} />
                <span>Item Details</span>
              </button>

              {/* ── Organize ── */}
              <div className="h-px bg-border my-1.5" />
              <p className="px-4 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 select-none">Organize</p>
              <button
                onClick={() => {
                  const item = mobileDrawerItem;
                  setMobileDrawerItem(null);
                  onMoveTo(item);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-foreground hover:bg-muted font-medium text-left rounded-xl transition-colors cursor-pointer text-sm"
              >
                <ArrowSquareOut size={18} />
                <span>Move to</span>
              </button>
              <button
                onClick={() => {
                  const item = mobileDrawerItem;
                  setMobileDrawerItem(null);
                  onCopyTo(item);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-foreground hover:bg-muted font-medium text-left rounded-xl transition-colors cursor-pointer text-sm"
              >
                <Copy size={18} />
                <span>Copy to</span>
              </button>
              <button
                onClick={() => {
                  const item = mobileDrawerItem;
                  setMobileDrawerItem(null);
                  onRename(item);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-foreground hover:bg-muted font-medium text-left rounded-xl transition-colors cursor-pointer text-sm"
              >
                <PencilSimple size={18} />
                <span>Rename</span>
              </button>
              <button
                onClick={() => {
                  const item = mobileDrawerItem;
                  setMobileDrawerItem(null);
                  handleEnableMultiSelect(item.id);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-foreground hover:bg-muted font-medium text-left rounded-xl transition-colors cursor-pointer text-sm"
              >
                <CheckSquareOffset size={18} />
                <span>Select Multiple</span>
              </button>

              {/* ── Danger Zone ── */}
              {mobileDrawerItem.parentId !== null && (
                <>
                  <div className="h-px bg-border my-1.5" />
                  <p className="px-4 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-destructive/40 select-none">Danger Zone</p>
                  <button
                    onClick={(e) => {
                      const item = mobileDrawerItem;
                      setMobileDrawerItem(null);
                      onDelete(item.id, e);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-destructive hover:bg-destructive/10 font-medium text-left rounded-xl transition-colors cursor-pointer text-sm"
                  >
                    <Trash size={18} />
                    <span>Move to Trash</span>
                  </button>
                </>
              )}
            </>
          )}
        </MobileDrawer>

        {dropdownOpenId && dropdownPosition && (() => {
          const item = sortedItems.find((x: any) => x.id === dropdownOpenId);
          if (!item) return null;
          return createPortal(
            <div
              style={{
                position: "absolute",
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
              }}
              className="w-44 rounded-xl border border-border bg-popover shadow-lg py-1.5 z-[9999] text-left text-xs animate-in fade-in-50 duration-100 select-none"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  setDropdownOpenId(null);
                  if (item.type === "FOLDER") {
                    onNavigate(item.id, item.name, item.nodeKey!);
                  } else if (item.nodeKey && item.fileIv) {
                    onOpenViewer(item, item.nodeKey!, item.name, item.fileIv!);
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-foreground hover:bg-muted font-medium text-left cursor-pointer"
              >
                {item.type === "FOLDER" ? <FolderOpen size={15} /> : <Eye size={15} />}
                <span>{item.type === "FOLDER" ? "Open" : "Preview"}</span>
              </button>
              <button
                onClick={() => {
                  setDropdownOpenId(null);
                  toggleStar(item);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-foreground hover:bg-muted font-medium text-left cursor-pointer"
              >
                <Star size={15} weight={item.starred ? "fill" : "regular"} className={item.starred ? "text-yellow-500" : ""} />
                <span>{item.starred ? "Remove Star" : "Add to Starred"}</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDropdownOpenId(null);
                  onSelectNode(item, true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-foreground hover:bg-muted font-medium text-left cursor-pointer"
              >
                <Info size={15} />
                <span>Item Details</span>
              </button>
              <button
                onClick={() => {
                  setDropdownOpenId(null);
                  onMoveTo(item);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-foreground hover:bg-muted font-medium text-left cursor-pointer"
              >
                <ArrowSquareOut size={15} />
                <span>Move to</span>
              </button>
              <button
                onClick={() => {
                  setDropdownOpenId(null);
                  onCopyTo(item);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-foreground hover:bg-muted font-medium text-left cursor-pointer"
              >
                <Copy size={15} />
                <span>Copy to</span>
              </button>
              <button
                onClick={() => {
                  setDropdownOpenId(null);
                  onRename(item);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-foreground hover:bg-muted font-medium text-left cursor-pointer"
              >
                <PencilSimple size={15} />
                <span>Rename</span>
              </button>
              {item.parentId !== null && (
                <>
                  <div className="h-px bg-border my-1" />
                  <button
                    onClick={(e) => {
                      setDropdownOpenId(null);
                      onDelete(item.id, e);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-destructive hover:bg-destructive/10 font-medium text-left cursor-pointer"
                  >
                    <Trash size={15} />
                    <span>Move to Trash</span>
                  </button>
                </>
              )}
            </div>,
            document.body
          );
        })()}
      </>
    );
  };

  const isMobileDevice = typeof window !== 'undefined' && (window.matchMedia("(max-width: 768px)").matches || ("ontouchstart" in window));

  if (isMobileDevice) {
    return (
      <>
        <div className="flex-1 w-full min-h-[450px]">
          {renderContent()}
          {renderLoadMoreIndicator()}
        </div>
        {renderSharedControls()}
      </>
    );
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger className="flex-1 w-full min-h-[450px] block">
          {renderContent()}
          {renderLoadMoreIndicator()}
        </ContextMenuTrigger>

        {/* Canvas Context Menu Options */}
        <ContextMenuContent className="w-52 bg-card/85 backdrop-blur-md border border-border/80 shadow-lg rounded-xl p-1.5 animate-in fade-in-50 duration-100 select-none">
          <ContextMenuItem
            onClick={onTriggerUpload}
            className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
          >
            <UploadSimple size={16} />
            <span>Upload File</span>
          </ContextMenuItem>
          {activeCategory === "drive" && (
            <ContextMenuItem
              onClick={onTriggerCreateFolder}
              className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
            >
              <FolderPlus size={16} />
              <span>Create New Folder</span>
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {renderSharedControls()}
    </>
  );
}

function getFileIcon(mimeType: string | null, name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  
  // PowerPoint
  if (ext === "pptx" || ext === "ppt" || ext === "odp" || mimeType === "application/vnd.ms-powerpoint" || mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    return <FilePpt size={20} className="text-orange-500" weight="fill" />;
  }
  
  // Excel
  if (ext === "xlsx" || ext === "xls" || ext === "ods" || mimeType === "application/vnd.ms-excel" || mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    return <FileXls size={20} className="text-emerald-500" weight="fill" />;
  }
  
  // Word
  if (ext === "docx" || ext === "doc" || ext === "odt" || mimeType === "application/msword" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return <FileDoc size={20} className="text-blue-500" weight="fill" />;
  }
  
  // Zip/Archive
  if (ext === "zip" || ext === "rar" || ext === "7z" || ext === "tar" || ext === "gz" || mimeType === "application/zip" || mimeType === "application/x-rar-compressed") {
    return <FileZip size={20} className="text-yellow-600" weight="fill" />;
  }

  if (mimeType) {
    if (mimeType.startsWith("image/")) return <ImageIcon size={20} className="text-purple-500" weight="fill" />;
    if (mimeType.startsWith("video/")) return <FileVideo size={20} className="text-rose-500" weight="fill" />;
    if (mimeType.startsWith("audio/")) return <FileAudio size={20} className="text-sky-500" weight="fill" />;
    if (mimeType === "application/pdf") return <FilePdf size={20} className="text-red-500" weight="fill" />;
    if (mimeType.startsWith("text/") || ext === "json" || ext === "js" || ext === "ts" || ext === "md") {
      return <FileCode size={20} className="text-amber-500" weight="fill" />;
    }
  }
  
  // Extension check fallbacks
  if (ext === "pdf") return <FilePdf size={20} className="text-red-500" weight="fill" />;
  if (ext === "csv") return <FileXls size={20} className="text-emerald-500" weight="fill" />;
  if (ext === "txt" || ext === "md") return <FileText size={20} className="text-gray-400" weight="fill" />;
  
  // Default normal file icon for random types
  return <File size={20} className="text-muted-foreground/60" />;
}

// Map MIME types to simple, human-readable labels
function getFileTypeLabel(mimeType: string | null, name: string): string {
  if (!mimeType) return "File";

  // Check by file extension first (most reliable)
  const ext = name.split(".").pop()?.toLowerCase();
  const extMap: Record<string, string> = {
    pdf: "PDF", doc: "Word", docx: "Word", odt: "Document",
    xls: "Excel", xlsx: "Excel", ods: "Spreadsheet", csv: "CSV",
    ppt: "PowerPoint", pptx: "PowerPoint", odp: "Slides",
    rtf: "Rich Text", txt: "Text", md: "Markdown",
    json: "JSON", js: "JavaScript", ts: "TypeScript", jsx: "JSX", tsx: "TSX",
    html: "HTML", css: "CSS", xml: "XML", yaml: "YAML", yml: "YAML",
    py: "Python", java: "Java", cpp: "C++", c: "C", rs: "Rust", go: "Go",
    zip: "ZIP", rar: "RAR", "7z": "Archive", tar: "Archive", gz: "Archive",
    png: "PNG", jpg: "JPEG", jpeg: "JPEG", gif: "GIF", webp: "WebP",
    svg: "SVG", bmp: "BMP", ico: "Icon",
    mp4: "MP4", mov: "MOV", avi: "AVI", mkv: "MKV", webm: "WebM",
    mp3: "MP3", wav: "WAV", ogg: "OGG", flac: "FLAC", aac: "AAC",
    exe: "Executable", dmg: "Disk Image", apk: "APK", iso: "ISO",
  };
  if (ext && extMap[ext]) return extMap[ext];

  // Fallback: simplify MIME type
  if (mimeType.startsWith("image/")) return mimeType.split("/")[1]?.toUpperCase() || "Image";
  if (mimeType.startsWith("video/")) return mimeType.split("/")[1]?.toUpperCase() || "Video";
  if (mimeType.startsWith("audio/")) return mimeType.split("/")[1]?.toUpperCase() || "Audio";
  if (mimeType.startsWith("text/")) return "Text";

  return "File";
}

// FORMAT STORAGE SIZE
const formatStorageSize = (bytesStr: string | null) => {
  if (!bytesStr) return "—";
  const bytes = parseInt(bytesStr);
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

// FORMAT CREATED AT TIME/DATE HELPER
const formatCreatedAt = (createdAtString: string) => {
  if (!createdAtString) return "—";
  const date = new Date(createdAtString);
  const now = new Date();

  const isToday = date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return "Today, " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return "Yesterday, " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString();
};

// GET BASE NAME & EXTENSION HELPERS
const getBaseName = (name: string, type: string) => {
  if (type === "FOLDER") return name;
  const lastDotIndex = name.lastIndexOf(".");
  if (lastDotIndex === -1) return name;
  return name.substring(0, lastDotIndex);
};

const getExtension = (name: string, type: string) => {
  if (type === "FOLDER") return "";
  const lastDotIndex = name.lastIndexOf(".");
  if (lastDotIndex === -1) return "";
  return name.substring(lastDotIndex);
};

// GRID ITEM SUBCOMPONENT (Now takes pre-decrypted properties)
function GridItem({ item, activeCategory, onNavigate, onSelect, selectedNodeId, onDelete, onOpenViewer, onMoveTo, onCopyTo, onRename, onMoveNodeDirectly, renameNodeId, setRenameNodeId, onRenameSubmit, onDownloadNode, toggleStar, onOptionsClick, isDropdownOpen, isMultiSelectMode, selectedItemIds, onToggleSelect, onEnableMultiSelect, onMoveToSecure }: any) {
  const isSelected = isMultiSelectMode ? selectedItemIds.has(item.id) : item.id === selectedNodeId;
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [tempName, setTempName] = React.useState(getBaseName(item.name, item.type));
  const isSubmitting = React.useRef(false);


  React.useEffect(() => {
    setTempName(getBaseName(item.name, item.type));
  }, [item.name, item.type]);

  React.useEffect(() => {
    if (renameNodeId !== item.id) {
      isSubmitting.current = false;
    }
  }, [renameNodeId, item.id]);

  const [isRenamingLoading, setIsRenamingLoading] = React.useState(false);

  const handleSubmit = async (newName: string) => {
    if (isSubmitting.current) return;
    const ext = getExtension(item.name, item.type);
    const finalName = newName.trim() + ext;
    if (finalName && finalName !== item.name) {
      isSubmitting.current = true;
      setIsRenamingLoading(true);
      try {
        await onRenameSubmit(item, finalName);
      } catch (err) {
        console.error("Rename submit failed", err);
      } finally {
        setIsRenamingLoading(false);
      }
    } else {
      setRenameNodeId(null);
    }
  };

  const handleClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isMultiSelectMode) {
      onToggleSelect(item.id);
      return;
    }
    const isMobile = window.matchMedia("(max-width: 768px)").matches || ("ontouchstart" in window);
    if (isMobile) {
      // On mobile, single tap opens directly
      if (item.type === "FOLDER") {
        onNavigate(item.id, item.name, item.nodeKey);
      } else if (item.nodeKey && item.fileIv) {
        onOpenViewer(item, item.nodeKey, item.name, item.fileIv);
      }
    } else {
      onSelect(item, false);
    }
  };

  const handleDoubleClick = () => {
    if (item.type === "FOLDER") {
      onNavigate(item.id, item.name, item.nodeKey);
    } else if (item.nodeKey && item.fileIv) {
      onOpenViewer(item, item.nodeKey, item.name, item.fileIv);
    }
  };

  const handleOpen = () => {
    if (item.type === "FOLDER") {
      onNavigate(item.id, item.name, item.nodeKey);
    } else if (item.nodeKey && item.fileIv) {
      onOpenViewer(item, item.nodeKey, item.name, item.fileIv);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ id: item.id }));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (item.type === "FOLDER") {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    if (item.type === "FOLDER") {
      e.preventDefault();
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (item.type === "FOLDER") {
      e.preventDefault();
      setIsDragOver(false);
      try {
        const dataStr = e.dataTransfer.getData("application/json");
        if (!dataStr) return;
        const dragData = JSON.parse(dataStr);
        if (dragData && dragData.id && dragData.id !== item.id) {
          onMoveNodeDirectly(dragData.id, item.id);
        }
      } catch (err) {
        console.error("Drop parsing failed", err);
      }
    }
  };

  const isMobileDevice = typeof window !== 'undefined' && (window.matchMedia("(max-width: 768px)").matches || ("ontouchstart" in window));

  const longPressTimer = React.useRef<NodeJS.Timeout | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobileDevice) return;
    const target = e.currentTarget;
    longPressTimer.current = setTimeout(() => {
      onOptionsClick(item, target as HTMLElement);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchMove = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const gridContent = (
    <div
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onContextMenu={(e) => {
        if (isMobileDevice) {
          e.preventDefault();
          e.stopPropagation();
          // Fallback if long press didn't trigger
          onOptionsClick(item, e.currentTarget);
        } else {
          handleClick(e as any);
        }
      }}
      draggable={activeCategory === "drive" && renameNodeId !== item.id}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`group border rounded-2xl p-3 bg-card hover:shadow-md transition-all cursor-pointer flex flex-col gap-3 min-w-0 ${isDragOver ? "border-dashed border-2 border-primary bg-primary/10 ring-2 ring-primary/30 animate-pulse" :
          isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:border-primary/50"
        }`}
    >
      <div className="flex items-center justify-between gap-2 w-full min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isMultiSelectMode ? (
            <div 
              className="flex-shrink-0 cursor-pointer flex items-center justify-center p-1"
              onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id); }}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                {isSelected && <Check weight="bold" size={12} />}
              </div>
            </div>
          ) : (
            <div className="flex-shrink-0">
              {item.type === "FOLDER" ? (
                <Folder weight="fill" size={18} className="text-yellow-500" />
              ) : (
                <div className="scale-75 origin-left -mr-1">
                  {getFileIcon(item.mimeType, item.name)}
                </div>
              )}
            </div>
          )}

          {renameNodeId === item.id ? (
            <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                disabled={isRenamingLoading}
                className="w-full bg-muted border border-primary rounded px-2 py-0.5 outline-none text-xs text-foreground focus:ring-1 focus:ring-primary/30 min-w-0 disabled:opacity-50"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isRenamingLoading) {
                    e.stopPropagation();
                    handleSubmit(tempName.trim());
                  } else if (e.key === "Escape" && !isRenamingLoading) {
                    e.stopPropagation();
                    setRenameNodeId(null);
                  }
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
              />
            </div>
          ) : (
            <h4 className="text-xs font-semibold text-foreground truncate select-none flex items-center gap-1" title={item.name}>
              {item.name}
              {item.starred && (
                <Star size={12} weight="fill" className="text-yellow-500 shrink-0 ml-0.5" />
              )}
            </h4>
          )}
        </div>

        <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOptionsClick(item, e.currentTarget);
            }}
            className={`p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer ${
              isDropdownOpen ? "opacity-100 bg-muted/50" : "opacity-100 md:opacity-0 md:group-hover:opacity-100"
            }`}
            title="More actions"
          >
            <DotsThreeVertical size={18} weight="bold" />
          </button>
        </div>
      </div>

      {/* Middle Area: File Preview (dynamic from decryptFile or custom fallback styles) */}
      <div className="w-full">
        <NodePreview item={item} />
      </div>
    </div>
  );

  if (isMobileDevice) {
    return gridContent;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={gridContent} />

      <ContextMenuContent className="w-48 bg-card/85 backdrop-blur-md border border-border/80 shadow-lg rounded-xl p-1.5 animate-in fade-in-50 duration-100 select-none">
        <ContextMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onEnableMultiSelect(item.id);
          }}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <CheckSquareOffset size={16} />
          <span>Select Multiple</span>
        </ContextMenuItem>
        <ContextMenuSeparator className="-mx-1.5 my-1 h-px bg-border/50" />
        <ContextMenuItem
          onClick={() => toggleStar(item)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <Star size={16} weight={item.starred ? "fill" : "regular"} className={item.starred ? "text-yellow-500" : ""} />
          <span>{item.starred ? "Remove Star" : "Add to Starred"}</span>
        </ContextMenuItem>
        <ContextMenuSeparator className="-mx-1.5 my-1 h-px bg-border/50" />
        <ContextMenuItem
          onClick={handleOpen}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          {item.type === "FOLDER" ? <FolderOpen size={16} /> : <Eye size={16} />}
          <span>{item.type === "FOLDER" ? "Open" : "Preview"}</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => onDownloadNode(item)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <Download size={16} />
          <span>Download</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onSelect(item, true);
          }}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <Info size={16} />
          <span>Item Details</span>
        </ContextMenuItem>
        <ContextMenuSeparator className="-mx-1.5 my-1 h-px bg-border/50" />
        <ContextMenuItem
          onClick={() => onMoveTo(item)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <ArrowSquareOut size={16} />
          <span>Move to</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => onCopyTo(item)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <Copy size={16} />
          <span>Copy to</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => onRename(item)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <PencilSimple size={16} />
          <span>Rename</span>
        </ContextMenuItem>
        {item.parentId !== null && (
          <>
            <ContextMenuSeparator className="-mx-1.5 my-1 h-px bg-border/50" />
            {onMoveToSecure && (
              <ContextMenuItem
                onClick={(e: any) => onMoveToSecure(item.id, e)}
                className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-primary/10 text-primary cursor-pointer transition-colors"
              >
                <LockKey size={16} />
                <span>Move to Secure Folder</span>
              </ContextMenuItem>
            )}
            <ContextMenuItem
              onClick={(e: any) => onDelete(item.id, e)}
              className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-destructive/10 text-destructive cursor-pointer transition-colors"
            >
              <Trash size={16} />
              <span>Delete</span>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

// LIST ITEM SUBCOMPONENT (Now takes pre-decrypted properties)
function ListItem({ item, activeCategory, onNavigate, onSelect, selectedNodeId, onDelete, onOpenViewer, onMoveTo, onCopyTo, onRename, onMoveNodeDirectly, renameNodeId, setRenameNodeId, onRenameSubmit, onOptionsClick, isDropdownOpen, onDownloadNode, toggleStar, isMultiSelectMode, selectedItemIds, onToggleSelect, onEnableMultiSelect, onMoveToSecure }: any) {
  const isSelected = isMultiSelectMode ? selectedItemIds.has(item.id) : item.id === selectedNodeId;
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [tempName, setTempName] = React.useState(getBaseName(item.name, item.type));
  const isSubmitting = React.useRef(false);

  React.useEffect(() => {
    setTempName(getBaseName(item.name, item.type));
  }, [item.name, item.type]);

  React.useEffect(() => {
    if (renameNodeId !== item.id) {
      isSubmitting.current = false;
    }
  }, [renameNodeId, item.id]);

  const [isRenamingLoading, setIsRenamingLoading] = React.useState(false);

  const handleSubmit = async (newName: string) => {
    if (isSubmitting.current) return;
    const ext = getExtension(item.name, item.type);
    const finalName = newName.trim() + ext;
    if (finalName && finalName !== item.name) {
      isSubmitting.current = true;
      setIsRenamingLoading(true);
      try {
        await onRenameSubmit(item, finalName);
      } catch (err) {
        console.error("Rename submit failed", err);
      } finally {
        setIsRenamingLoading(false);
      }
    } else {
      setRenameNodeId(null);
    }
  };



  const handleClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isMultiSelectMode) {
      onToggleSelect(item.id);
      return;
    }
    const isMobile = window.matchMedia("(max-width: 768px)").matches || ("ontouchstart" in window);
    if (isMobile) {
      if (item.type === "FOLDER") {
        onNavigate(item.id, item.name, item.nodeKey);
      } else if (item.nodeKey && item.fileIv) {
        onOpenViewer(item, item.nodeKey, item.name, item.fileIv);
      }
    } else {
      onSelect(item, false);
    }
  };

  const handleDoubleClick = () => {
    if (item.type === "FOLDER") {
      onNavigate(item.id, item.name, item.nodeKey);
    } else if (item.nodeKey && item.fileIv) {
      onOpenViewer(item, item.nodeKey, item.name, item.fileIv);
    }
  };

  const handleOpen = () => {
    if (item.type === "FOLDER") {
      onNavigate(item.id, item.name, item.nodeKey);
    } else if (item.nodeKey && item.fileIv) {
      onOpenViewer(item, item.nodeKey, item.name, item.fileIv);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ id: item.id }));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (item.type === "FOLDER") {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    if (item.type === "FOLDER") {
      e.preventDefault();
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (item.type === "FOLDER") {
      e.preventDefault();
      setIsDragOver(false);
      try {
        const dataStr = e.dataTransfer.getData("application/json");
        if (!dataStr) return;
        const dragData = JSON.parse(dataStr);
        if (dragData && dragData.id && dragData.id !== item.id) {
          onMoveNodeDirectly(dragData.id, item.id);
        }
      } catch (err) {
        console.error("Drop parsing failed", err);
      }
    }
  };

  const isMobileDevice = typeof window !== 'undefined' && (window.matchMedia("(max-width: 768px)").matches || ("ontouchstart" in window));

  const longPressTimer = React.useRef<NodeJS.Timeout | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobileDevice) return;
    const target = e.currentTarget;
    longPressTimer.current = setTimeout(() => {
      onOptionsClick(item, target as HTMLElement);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchMove = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const rowContent = (
    <tr
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onContextMenu={(e) => {
        if (isMobileDevice) {
          e.preventDefault();
          e.stopPropagation();
          // Fallback if long press didn't trigger
          onOptionsClick(item, e.currentTarget);
        } else {
          handleClick(e as any);
        }
      }}
      draggable={activeCategory === "drive" && renameNodeId !== item.id}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`cursor-pointer transition-colors group ${isDragOver ? "bg-primary/10 border-2 border-dashed border-primary animate-pulse" :
          isSelected ? "bg-primary/5 hover:bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/40"
        } ${isDropdownOpen ? "relative z-30" : ""}`}
    >
      <td className="px-6 py-3.5 w-full max-w-0">
        <div className="flex items-center gap-3 w-full min-w-0">
          {isMultiSelectMode ? (
            <div 
              className="flex-shrink-0 cursor-pointer flex items-center justify-center p-1 -ml-1"
              onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id); }}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                {isSelected && <Check weight="bold" size={12} />}
              </div>
            </div>
          ) : (
            <div className="p-1.5 bg-muted rounded-md group-hover:bg-primary/10 group-hover:text-primary transition-colors flex-shrink-0">
              {item.type === "FOLDER" ? (
                <Folder weight="fill" size={20} className="text-yellow-500" />
              ) : (
                <div className="scale-90 origin-left">
                  {getFileIcon(item.mimeType, item.name)}
                </div>
              )}
            </div>
          )}
          {renameNodeId === item.id ? (
            <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                disabled={isRenamingLoading}
                className="bg-muted border border-primary rounded px-2 py-0.5 outline-none text-sm text-foreground focus:ring-1 focus:ring-primary/30 w-full min-w-0 disabled:opacity-50"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isRenamingLoading) {
                    e.stopPropagation();
                    handleSubmit(tempName.trim());
                  } else if (e.key === "Escape" && !isRenamingLoading) {
                    e.stopPropagation();
                    setRenameNodeId(null);
                  }
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
              />
              {isRenamingLoading ? (
                <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0 m-1" />
              ) : (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSubmit(tempName.trim());
                    }}
                    className="p-1 hover:bg-emerald-500/10 text-emerald-500 rounded transition-colors cursor-pointer flex-shrink-0"
                    title="Save"
                  >
                    <Check size={14} weight="bold" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenameNodeId(null);
                    }}
                    className="p-1 hover:bg-destructive/10 text-destructive rounded transition-colors cursor-pointer flex-shrink-0"
                    title="Cancel"
                  >
                    <X size={14} weight="bold" />
                  </button>
                </>
              )}
            </div>
          ) : (
            <span className="text-sm font-medium text-foreground truncate flex-1 min-w-0 select-none flex items-center gap-1" title={item.name}>
              {item.name}
              {item.starred && (
                <Star size={13} weight="fill" className="text-yellow-500 shrink-0 ml-0.5" />
              )}
            </span>
          )}
        </div>
      </td>

      <td className="px-6 py-3.5 text-xs text-muted-foreground hidden sm:table-cell">
        {item.type === "FOLDER" ? "Folder" : (item.name.split(".").pop()?.toUpperCase() || "File")}
      </td>

      <td className="px-6 py-3.5 text-xs text-muted-foreground hidden md:table-cell">
        {formatStorageSize(item.sizeBytes)}
      </td>

      {activeCategory !== "drive" && (
        <td className="px-6 py-3.5 text-xs text-muted-foreground hidden md:table-cell min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {item.locationPath && item.locationPath.length > 0 ? (
              item.locationPath.map((loc: any, idx: number) => (
                <React.Fragment key={loc.id}>
                  {idx > 0 && <span className="opacity-45 select-none mx-0.5">/</span>}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate(loc.id, loc.name, loc.key);
                    }}
                    className="text-primary hover:underline hover:text-primary/80 transition-colors font-medium text-[11px] cursor-pointer"
                  >
                    {loc.name}
                  </button>
                </React.Fragment>
              ))
            ) : (
              <span className="opacity-45 select-none">—</span>
            )}
          </div>
        </td>
      )}

      <td className="px-6 py-3.5 text-xs text-muted-foreground hidden lg:table-cell">
        {formatCreatedAt(item.createdAt)}
      </td>

      <td className="px-6 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="relative inline-block text-left">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOptionsClick(item, e.currentTarget);
            }}
            className={`p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer ${
              isDropdownOpen ? "opacity-100 bg-muted/50" : "opacity-100 md:opacity-0 md:group-hover:opacity-100"
            }`}
            title="More actions"
          >
            <DotsThreeVertical size={18} weight="bold" />
          </button>
        </div>
      </td>
    </tr>
  );

  if (isMobileDevice) {
    return rowContent;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={rowContent} />

      <ContextMenuContent className="w-48 bg-card/85 backdrop-blur-md border border-border/80 shadow-lg rounded-xl p-1.5 animate-in fade-in-50 duration-100 select-none">
        <ContextMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onEnableMultiSelect(item.id);
          }}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <CheckSquareOffset size={16} />
          <span>Select Multiple</span>
        </ContextMenuItem>
        <ContextMenuSeparator className="-mx-1.5 my-1 h-px bg-border/50" />
        <ContextMenuItem
          onClick={() => toggleStar(item)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <Star size={16} weight={item.starred ? "fill" : "regular"} className={item.starred ? "text-yellow-500" : ""} />
          <span>{item.starred ? "Remove Star" : "Add to Starred"}</span>
        </ContextMenuItem>
        <ContextMenuSeparator className="-mx-1.5 my-1 h-px bg-border/50" />
        <ContextMenuItem
          onClick={handleOpen}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          {item.type === "FOLDER" ? <FolderOpen size={16} /> : <Eye size={16} />}
          <span>{item.type === "FOLDER" ? "Open" : "Preview"}</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => onDownloadNode(item)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <Download size={16} />
          <span>Download</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onSelect(item, true);
          }}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <Info size={16} />
          <span>Item Details</span>
        </ContextMenuItem>
        <ContextMenuSeparator className="-mx-1.5 my-1 h-px bg-border/50" />
        <ContextMenuItem
          onClick={() => onMoveTo(item)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <ArrowSquareOut size={16} />
          <span>Move to</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => onCopyTo(item)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <Copy size={16} />
          <span>Copy to</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => onRename(item)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <PencilSimple size={16} />
          <span>Rename</span>
        </ContextMenuItem>
        {item.parentId !== null && (
          <>
            <ContextMenuSeparator className="-mx-1.5 my-1 h-px bg-border/50" />
            {onMoveToSecure && (
              <ContextMenuItem
                onClick={(e: any) => onMoveToSecure(item.id, e)}
                className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-primary/10 text-primary cursor-pointer transition-colors"
              >
                <LockKey size={16} />
                <span>Move to Secure Folder</span>
              </ContextMenuItem>
            )}
            <ContextMenuItem
              onClick={(e: any) => onDelete(item.id, e)}
              className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-destructive/10 text-destructive cursor-pointer transition-colors"
            >
              <Trash size={16} />
              <span>Delete</span>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
