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
  ArrowUp, ArrowDown
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
};

type DecryptedNodeData = NodeData & {
  name: string;
  fileIv: string | null;
  nodeKey: CryptoKey | null;
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
  onTriggerCreateFolder
}: MediaGalleryProps) {
  const { decryptNodeKeyCascade, cryptoKey, isReady } = useCrypto()
  const { toast } = useToast()

  const decryptedCache = React.useRef<Map<string, { decNodes: DecryptedNodeData[]; foldersMap: Map<string, any> }>>(new Map())
  const [foldersMap, setFoldersMap] = React.useState<Map<string, any>>(new Map())
  const [loading, setLoading] = React.useState(true)
  const [decryptedItems, setDecryptedItems] = React.useState<DecryptedNodeData[]>([])

  // Viewer state
  const [viewerNode, setViewerNode] = React.useState<any | null>(null)
  const [viewerKey, setViewerKey] = React.useState<CryptoKey | null>(null)

  // Picker States
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [pickerAction, setPickerAction] = React.useState<"move" | "copy" | null>(null)
  const [pickerNode, setPickerNode] = React.useState<DecryptedNodeData | null>(null)
  const [actionLoading, setActionLoading] = React.useState(false)
  const [pickerFolders, setPickerFolders] = React.useState<any[]>([])
  const [deleteNodeId, setDeleteNodeId] = React.useState<string | null>(null)

  // Rename States
  const [renameNodeId, setRenameNodeId] = React.useState<string | null>(null)

  const deleteNode = React.useMemo(() => {
    return decryptedItems.find((item) => item.id === deleteNodeId) || null;
  }, [deleteNodeId, decryptedItems]);

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
        } catch {}
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

  const handleMoveTo = async (node: DecryptedNodeData, targetParentId: string | null) => {
    setActionLoading(true);
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
        throw new Error(errData.error || "Move failed");
      }

      toast({
        title: (
          <span className="flex items-center gap-2">
            <CheckCircle size={16} weight="fill" className="text-emerald-500" />
            Moved successfully
          </span>
        ),
        description: `"${node.name}" has been moved.`,
      });

      onRefresh();
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
    }
  };

  const handleMoveNodeDirectly = async (draggedNodeId: string, targetParentId: string | null) => {
    const node = decryptedItems.find((n: any) => n.id === draggedNodeId);
    if (!node) return;
    await handleMoveTo(node, targetParentId);
  };

  const handleCopyTo = async (node: DecryptedNodeData, targetParentId: string | null) => {
    setActionLoading(true);
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
        throw new Error("Copy API failed");
      }

      const data = await res.json();
      const copiedNode = data.node;

      if (node.type === "FOLDER") {
        await copyDescendants(node.id, copiedNode.id, node.nodeKey!);
      }

      toast({
        title: (
          <span className="flex items-center gap-2">
            <CheckCircle size={16} weight="fill" className="text-emerald-500" />
            Copied successfully
          </span>
        ),
        description: `"${node.name}" has been duplicated.`,
      });

      onRefresh();
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
              } catch {}
              
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
    if (!pickerNode) return;
    if (pickerAction === "move") {
      handleMoveTo(pickerNode, targetParentId);
    } else if (pickerAction === "copy") {
      handleCopyTo(pickerNode, targetParentId);
    }
  };


  // Clear client-side decrypted cache on refresh trigger (upload, delete, move, copy, etc.)
  React.useEffect(() => {
    decryptedCache.current.clear();
  }, [refreshTrigger]);

  // 1. Fetch, decrypt, and cache nodes (SWR-based client caching)
  React.useEffect(() => {
    if (!isReady) return;

    let active = true;

    async function fetchAndDecryptNodes() {
      const cacheKey = `${currentFolderId || "root"}-${activeCategory}-${query}`;
      const cached = decryptedCache.current.get(cacheKey);

      if (cached) {
        setDecryptedItems(cached.decNodes);
        setFoldersMap(cached.foldersMap);
        setLoading(false);
      } else {
        setDecryptedItems([]);
        setLoading(true);
      }

      try {
        let endpoint = `/api/nodes?parentId=${currentFolderId || ""}`;
        if (query.trim()) {
          endpoint = `/api/search?q=${encodeURIComponent(query)}`;
        } else if (activeCategory !== "drive") {
          endpoint = `/api/nodes?category=${activeCategory}`;
        }

        const res = await fetch(endpoint);
        if (res.ok && active) {
          const json = await res.json();
          const rawNodes: NodeData[] = json.nodes || [];
          
          const fMap = new Map();
          (json.folders || []).forEach((f: any) => {
            fMap.set(f.id, f);
          });

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
                    } catch {}
                  }
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
            setDecryptedItems(list);
            decryptedCache.current.set(cacheKey, { decNodes: list, foldersMap: fMap });
          }
        }
      } catch (err) {
        console.error("Failed to fetch and decrypt nodes", err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchAndDecryptNodes();

    return () => {
      active = false;
    };
  }, [currentFolderId, query, activeCategory, refreshTrigger, isReady, decryptNodeKeyCascade]);

  // 3. Client-side local query filtering
  return (
    <>
      <MediaGalleryContent 
        decryptedItems={decryptedItems}
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
        onMoveTo={(node: any) => { setPickerNode(node); setPickerAction("move"); setPickerOpen(true); }}
        onCopyTo={(node: any) => { setPickerNode(node); setPickerAction("copy"); setPickerOpen(true); }}
        onRename={(node: any) => setRenameNodeId(node.id)}
        onMoveNodeDirectly={handleMoveNodeDirectly}
        renameNodeId={renameNodeId}
        setRenameNodeId={setRenameNodeId}
        onRenameSubmit={handleRenameSubmit}
        onDownloadNode={handleDownloadNode}
      />
      {pickerOpen && (
        <DestinationPickerModal
          isOpen={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onConfirm={handlePickerConfirm}
          currentNodeId={pickerNode?.id || null}
          currentNodeType={pickerNode?.type || null}
          title={pickerAction === "move" ? "Move to..." : "Copy to..."}
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
            <th className="px-6 py-3.5">Name</th>
            <th className="px-6 py-3.5 hidden sm:table-cell">Type</th>
            <th className="px-6 py-3.5 hidden md:table-cell">Size</th>
            {activeCategory && activeCategory !== "drive" && (
              <th className="px-6 py-3.5 hidden md:table-cell">Location</th>
            )}
            <th className="px-6 py-3.5 hidden lg:table-cell">Created At</th>
            <th className="px-6 py-3.5 text-right"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <tr key={i}>
              <td className="px-6 py-3.5 flex items-center gap-3 min-w-0">
                <Skeleton className="h-8 w-8 rounded-md flex-shrink-0" />
                <Skeleton className="h-4 w-40" />
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
  renameNodeId, setRenameNodeId, onRenameSubmit, onDownloadNode
}: any) {
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
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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
          />
        ))}
      </div>
    ) : (
      <div className="border border-border rounded-xl bg-card shadow-sm relative">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-muted/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider select-none">
              <th 
                className="px-6 py-3.5 cursor-pointer hover:bg-muted/60 transition-colors group/header"
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
              <th className="px-6 py-3.5 text-right"></th>
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
                onRenameSubmit={onRenameSubmit}
                dropdownOpenId={dropdownOpenId}
                setDropdownOpenId={setDropdownOpenId}
                onDownloadNode={onDownloadNode}
              />
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger className="flex-1 w-full min-h-[450px] block">
          {renderContent()}
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
    </>
  );
}

// Icon mapper helper
function getFileIcon(mimeType: string | null, name: string) {
  if (!mimeType) return <File size={20} />;
  if (mimeType.startsWith("image/")) return <ImageIcon size={20} className="text-blue-500" />;
  if (mimeType.startsWith("video/")) return <FileVideo size={20} className="text-red-500" />;
  if (mimeType.startsWith("audio/")) return <FileAudio size={20} className="text-emerald-500" />;
  if (mimeType === "application/pdf") return <FilePdf size={20} className="text-rose-500" />;
  if (mimeType.startsWith("text/") || name.endsWith(".json") || name.endsWith(".js") || name.endsWith(".ts")) {
    return <FileCode size={20} className="text-yellow-600" />;
  }
  return <FileText size={20} className="text-gray-500" />;
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
function GridItem({ item, activeCategory, onNavigate, onSelect, selectedNodeId, onDelete, onOpenViewer, onMoveTo, onCopyTo, onRename, onMoveNodeDirectly, renameNodeId, setRenameNodeId, onRenameSubmit, onDownloadNode }: any) {
  const isSelected = item.id === selectedNodeId;
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

  const handleClick = () => {
    onSelect(item, false); // Select without opening details panel
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

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div 
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleClick}
            draggable={activeCategory === "drive" && renameNodeId !== item.id}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`group relative border rounded-xl p-4 bg-card hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between aspect-square ${
              isDragOver ? "border-dashed border-2 border-primary bg-primary/10 ring-2 ring-primary/30 animate-pulse" :
              isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:border-primary/50"
            }`}
          />
        }
      >
        <div className="flex items-start justify-between">
          <div className="p-2.5 bg-muted rounded-lg group-hover:bg-primary/10 group-hover:text-primary transition-colors">
            {item.type === "FOLDER" ? (
              <Folder weight="fill" size={26} className="text-yellow-500" />
            ) : (
              getFileIcon(item.mimeType, item.name)
            )}
          </div>

          <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
            {item.type === "FILE" && item.nodeKey && item.fileIv && (
              <button 
                onClick={(e) => { e.stopPropagation(); onOpenViewer(item, item.nodeKey, item.name, item.fileIv); }}
                className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                title="Quick view"
              >
                <Eye size={16} />
              </button>
            )}
            <button 
              onClick={(e) => { e.stopPropagation(); onSelect(item, true); }}
              className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
              title="View details"
            >
              <Info size={16} />
            </button>
            <button 
              onClick={(e) => onDelete(item.id, e)}
              className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-destructive"
              title="Move to Trash"
            >
              <Trash size={16} />
            </button>
          </div>
        </div>

        <div className="mt-4 min-w-0 select-none">
          {renameNodeId === item.id ? (
            <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                disabled={isRenamingLoading}
                className="w-full bg-muted border border-primary rounded px-2 py-1 outline-none text-sm text-foreground focus:ring-1 focus:ring-primary/30 min-w-0 disabled:opacity-50"
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
                    <Check size={16} weight="bold" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenameNodeId(null);
                    }}
                    className="p-1 hover:bg-destructive/10 text-destructive rounded transition-colors cursor-pointer flex-shrink-0"
                    title="Cancel"
                  >
                    <X size={16} weight="bold" />
                  </button>
                </>
              )}
            </div>
          ) : (
            <h4 className="text-sm font-medium text-foreground truncate" title={item.name}>
              {item.name}
            </h4>
          )}
          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <ShieldCheck size={12} weight="fill" className="text-primary/70" />
            {item.type === "FOLDER" ? `Folder • ${formatStorageSize(item.sizeBytes)}` : formatStorageSize(item.sizeBytes)}
          </p>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48 bg-card/85 backdrop-blur-md border border-border/80 shadow-lg rounded-xl p-1.5 animate-in fade-in-50 duration-100 select-none">
        <ContextMenuItem
          onClick={handleOpen}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <FolderOpen size={16} />
          <span>Open</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => onDownloadNode(item)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <Download size={16} />
          <span>Download</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => onSelect(item, true)}
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
          <span>Move to...</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => onCopyTo(item)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <Copy size={16} />
          <span>Copy to...</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => onRename(item)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <PencilSimple size={16} />
          <span>Rename</span>
        </ContextMenuItem>
        <ContextMenuSeparator className="-mx-1.5 my-1 h-px bg-border/50" />
        <ContextMenuItem
          onClick={(e: any) => onDelete(item.id, e)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-destructive/10 text-destructive cursor-pointer transition-colors"
        >
          <Trash size={16} />
          <span>Delete</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// LIST ITEM SUBCOMPONENT (Now takes pre-decrypted properties)
function ListItem({ item, activeCategory, onNavigate, onSelect, selectedNodeId, onDelete, onOpenViewer, onMoveTo, onCopyTo, onRename, onMoveNodeDirectly, renameNodeId, setRenameNodeId, onRenameSubmit, dropdownOpenId, setDropdownOpenId, onDownloadNode }: any) {
  const isSelected = item.id === selectedNodeId;
  const [dropdownPosition, setDropdownPosition] = React.useState<{ top: number; left: number } | null>(null);
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



  const handleClick = () => {
    setDropdownOpenId(null);
    onSelect(item, false); // Select without opening details panel
  };

  const handleDoubleClick = () => {
    setDropdownOpenId(null);
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

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) {
          setDropdownOpenId(null);
        }
      }}
    >
      <ContextMenuTrigger
        render={
          <tr 
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleClick}
            draggable={activeCategory === "drive" && renameNodeId !== item.id}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`cursor-pointer transition-colors group ${
              isDragOver ? "bg-primary/10 border-2 border-dashed border-primary animate-pulse" :
              isSelected ? "bg-primary/5 hover:bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/40"
            } ${dropdownOpenId === item.id ? "relative z-30" : ""}`}
          />
        }
      >
        <td className="px-6 py-3.5 flex items-center gap-3 min-w-0">
          <div className="p-1.5 bg-muted rounded-md group-hover:bg-primary/10 group-hover:text-primary transition-colors flex-shrink-0">
            {item.type === "FOLDER" ? (
              <Folder weight="fill" size={20} className="text-yellow-500" />
            ) : (
              getFileIcon(item.mimeType, item.name)
            )}
          </div>
          {renameNodeId === item.id ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                disabled={isRenamingLoading}
                className="bg-muted border border-primary rounded px-2 py-0.5 outline-none text-sm text-foreground focus:ring-1 focus:ring-primary/30 max-w-xs md:max-w-md min-w-0 disabled:opacity-50"
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
            <span className="text-sm font-medium text-foreground truncate max-w-xs md:max-w-md select-none" title={item.name}>
              {item.name}
            </span>
          )}
        </td>

        <td className="px-6 py-3.5 text-xs text-muted-foreground hidden sm:table-cell">
          {item.type === "FOLDER" ? "Folder" : item.mimeType?.split("/")[1]?.toUpperCase() || "File"}
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
                const rect = e.currentTarget.getBoundingClientRect();
                setDropdownOpenId(dropdownOpenId === item.id ? null : item.id);
                
                const hasPreview = item.type === "FILE" && item.nodeKey && item.fileIv;
                const itemsCount = item.type === "FOLDER" ? 5 : (hasPreview ? 6 : 5);
                const menuHeight = itemsCount * 32 + 14;
                
                const shouldOpenUpward = window.innerHeight - rect.bottom < menuHeight;
                const topPos = shouldOpenUpward 
                  ? rect.top - menuHeight + window.scrollY 
                  : rect.bottom + window.scrollY;

                setDropdownPosition({
                  top: topPos,
                  left: rect.right - 176 + window.scrollX,
                });
              }}
              className={`p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer ${
                dropdownOpenId === item.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
              title="More actions"
            >
              <DotsThreeVertical size={18} weight="bold" />
            </button>

            {dropdownOpenId === item.id && dropdownPosition && createPortal(
              <div 
                style={{
                  position: "absolute",
                  top: `${dropdownPosition.top}px`,
                  left: `${dropdownPosition.left}px`,
                }}
                className="w-44 rounded-xl border border-border bg-popover shadow-lg py-1.5 z-[9999] text-left text-xs animate-in fade-in-50 duration-100 select-none"
                onClick={(e) => e.stopPropagation()}
              >
                {item.type === "FOLDER" ? (
                  <button
                    onClick={() => {
                      setDropdownOpenId(null);
                      onNavigate(item.id, item.name, item.nodeKey);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-foreground hover:bg-muted font-medium text-left cursor-pointer"
                  >
                    <FolderOpen size={15} />
                    <span>Open</span>
                  </button>
                ) : (
                  item.nodeKey && item.fileIv && (
                    <button
                      onClick={() => {
                        setDropdownOpenId(null);
                        onOpenViewer(item, item.nodeKey!, item.name, item.fileIv!);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-foreground hover:bg-muted font-medium text-left cursor-pointer"
                    >
                      <Eye size={15} />
                      <span>Quick View</span>
                    </button>
                  )
                )}
                <button
                  onClick={() => {
                    setDropdownOpenId(null);
                    onSelect(item, true);
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
                  <span>Move to...</span>
                </button>
                <button
                  onClick={() => {
                    setDropdownOpenId(null);
                    onCopyTo(item);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-foreground hover:bg-muted font-medium text-left cursor-pointer"
                >
                  <Copy size={15} />
                  <span>Copy to...</span>
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
              </div>,
              document.body
            )}
          </div>
        </td>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48 bg-card/85 backdrop-blur-md border border-border/80 shadow-lg rounded-xl p-1.5 animate-in fade-in-50 duration-100 select-none">
        <ContextMenuItem
          onClick={handleOpen}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <FolderOpen size={16} />
          <span>Open</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => onDownloadNode(item)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <Download size={16} />
          <span>Download</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => onSelect(item, true)}
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
          <span>Move to...</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => onCopyTo(item)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <Copy size={16} />
          <span>Copy to...</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => onRename(item)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <PencilSimple size={16} />
          <span>Rename</span>
        </ContextMenuItem>
        <ContextMenuSeparator className="-mx-1.5 my-1 h-px bg-border/50" />
        <ContextMenuItem
          onClick={(e: any) => onDelete(item.id, e)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-destructive/10 text-destructive cursor-pointer transition-colors"
        >
          <Trash size={16} />
          <span>Delete</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
import { Image as ImageIcon } from "@phosphor-icons/react";
