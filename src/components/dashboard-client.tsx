"use client"

import * as React from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { UploadModal } from "./upload-modal";
import { MediaGallery } from "./media-gallery";
import { SettingsModal } from "./settings-modal";
import { TrashPanel } from "./trash-panel";
import { StoragePanel } from "./storage-panel";
import { useCrypto } from "./crypto-provider";
import { decryptText, generateNodeKey, encryptText, encryptNodeKey } from "@/lib/crypto";
import { FileViewer } from "./file-viewer";
import { UniversalSearchDialog } from "./universal-search-dialog";
import { 
  FolderPlus, GridNine, List, Info, ShieldCheck, Folder, 
  FileText, Calendar, HardDrive, MagnifyingGlass, CloudArrowUp,
  Question, CheckCircle, XCircle, X, Star
} from "@phosphor-icons/react";
import { useUser } from "@clerk/nextjs";
import { useToast } from "@/hooks/use-toast";

type SelectedNodeData = {
  id: string;
  type: "FOLDER" | "FILE";
  mimeType: string | null;
  sizeBytes: string | null;
  r2Key: string | null;
  name: string;
  fileIv: string | null;
  nodeKey: CryptoKey | null;
  captionEnc: string | null;
  captionIV: string | null;
  createdAt: string;
};

export function DashboardClient() {
  const { cryptoKey, decryptNodeKeyCascade, isReady, nodeKeysCache } = useCrypto();
  const { user, isLoaded: isUserLoaded } = useUser();
  const { toast } = useToast();
  React.useEffect(() => {
    if (isUserLoaded && user) {
      const sessionKey = `lumora_welcome_shown_${user.id}`;
      const shown = sessionStorage.getItem(sessionKey);
      if (!shown) {
        sessionStorage.setItem(sessionKey, "true");
        toast({
          title: (
            <span className="flex items-center gap-2">
              <CheckCircle size={16} weight="fill" className="text-emerald-500" />
              Welcome back!
            </span>
          ),
          description: `Logged in as ${user.firstName || user.username || "User"}.`,
        });
      }
    }
  }, [isUserLoaded, user, toast]);

  // Prevent default browser context menu globally so only custom menus appear
  React.useEffect(() => {
    const handleGlobalContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener("contextmenu", handleGlobalContextMenu);
    return () => {
      document.removeEventListener("contextmenu", handleGlobalContextMenu);
    };
  }, []);

  const [activeCategory, setActiveCategory] = React.useState("drive");
  const [currentFolderId, setCurrentFolderId] = React.useState<string | null>(null);
  const [currentFolderKey, setCurrentFolderKey] = React.useState<CryptoKey | null>(null);
  const [breadcrumbs, setBreadcrumbs] = React.useState<{ id: string; name: string }[]>([]);

  // UI state
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("list");
  React.useEffect(() => {
    const saved = localStorage.getItem("lumora-view-mode");
    if (saved === "grid" || saved === "list") setViewMode(saved);
  }, []);
  const [selectedNode, setSelectedNode] = React.useState<SelectedNodeData | null>(null);
  const [isInfoPanelOpen, setIsInfoPanelOpen] = React.useState(false);
  const [sidebarWidth, setSidebarWidth] = React.useState(280);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState(false);
  const [decryptedCaption, setDecryptedCaption] = React.useState<string | null>(null);
  const [decryptingCaption, setDecryptingCaption] = React.useState(false);
  const [showFolderModal, setShowFolderModal] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState("");
  const [isCreatingFolder, setIsCreatingFolder] = React.useState(false);

  // Search & Filter state
  const [query, setQuery] = React.useState("");
  const [isAISearch, setIsAISearch] = React.useState(false); // E2EE semantic search setting
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

  // Universal search & autocomplete index states
  const [isSearchDialogOpen, setIsSearchDialogOpen] = React.useState(false);
  const [decryptedSearchNodes, setDecryptedSearchNodes] = React.useState<any[]>([]);
  const [decFoldersMap, setDecFoldersMap] = React.useState<Map<string, any>>(new Map());
  const [indexingSearch, setIndexingSearch] = React.useState(false);
  const [isSearchIndexLoaded, setIsSearchIndexLoaded] = React.useState(false);
  const [globalViewerNode, setGlobalViewerNode] = React.useState<any | null>(null);
  const [globalViewerKey, setGlobalViewerKey] = React.useState<CryptoKey | null>(null);

  const [refreshTrigger, setRefreshTrigger] = React.useState(0);

  React.useEffect(() => {
    const handleUploadComplete = () => {
      setRefreshTrigger((prev) => prev + 1);
    };
    window.addEventListener("lumora-upload-complete", handleUploadComplete);
    return () => {
      window.removeEventListener("lumora-upload-complete", handleUploadComplete);
    };
  }, []);

  // Invalidate search index cache when files are added/removed/modified
  React.useEffect(() => {
    setIsSearchIndexLoaded(false);
  }, [refreshTrigger]);

  const [isUploadOpen, setIsUploadOpen] = React.useState(false);
  const [draggedFiles, setDraggedFiles] = React.useState<File[]>([]);
  const [isDashboardDragging, setIsDashboardDragging] = React.useState(false);
  const dashboardDragCounter = React.useRef(0);
  const [allNodesCountSize, setAllNodesCountSize] = React.useState<{ count: number; size: number }>({ count: 0, size: 0 });
  const [storageStats, setStorageStats] = React.useState({
    documents: 0,
    media: 0,
    audio: 0,
    archive: 0
  });
  const [trashCount, setTrashCount] = React.useState(0);

  const handleDashboardDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dashboardDragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const hasFiles = Array.from(e.dataTransfer.items).some(item => item.kind === 'file');
      if (hasFiles) {
        setIsDashboardDragging(true);
      }
    }
  };

  const handleDashboardDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dashboardDragCounter.current--;
    if (dashboardDragCounter.current === 0) {
      setIsDashboardDragging(false);
    }
  };

  const handleDashboardDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDashboardDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDashboardDragging(false);
    dashboardDragCounter.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      setDraggedFiles(files);
      setIsUploadOpen(true);
    }
  };

  const handleCloseUploadModal = () => {
    setIsUploadOpen(false);
    setDraggedFiles([]);
  };

  // 1. Initialize Root Folder once crypto is ready
  const rootInitialized = React.useRef(false);
  React.useEffect(() => {
    if (!isReady || !cryptoKey) return;
    if (rootInitialized.current) return; // Already initialized

    async function initRoot() {
      if (!cryptoKey) return;
      try {
        const res = await fetch("/api/nodes/root");
        if (!res.ok) {
          console.error("Root fetch failed with status", res.status);
          return;
        }
        const { rootNode } = await res.json();

        if (!rootNode) {
          // Initialize new root folder
          const rootKey = await generateNodeKey();
          const { cipherText: nameEnc, iv: nameIV } = await encryptText("Root", rootKey);
          const { encryptedKey: nodeKeyEnc, iv: nodeKeyIV } = await encryptNodeKey(rootKey, cryptoKey);

          const createRes = await fetch("/api/nodes/root", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nameEnc, nameIV, nodeKeyEnc, nodeKeyIV }),
          });
          const created = await createRes.json();
          rootInitialized.current = true;
          setCurrentFolderId(created.rootNode.id);
          setCurrentFolderKey(rootKey);
          setBreadcrumbs([{ id: created.rootNode.id, name: "Root" }]);
        } else {
          // Decrypt root key cascade
          const emptyAncestors = new Map();
          const rootKey = await decryptNodeKeyCascade(rootNode, emptyAncestors);
          rootInitialized.current = true;
          setCurrentFolderId(rootNode.id);
          setCurrentFolderKey(rootKey);
          setBreadcrumbs([{ id: rootNode.id, name: "Root" }]);
        }
      } catch (err) {
        console.error("Root init failed", err);
      }
    }

    initRoot();
  }, [isReady, cryptoKey, decryptNodeKeyCascade]);

  // Calculate storage space & clear search on category change
  React.useEffect(() => {
    if (!isReady || !cryptoKey) return;

    async function fetchStorageInfo() {
      try {
        const res = await fetch("/api/nodes?category=all");
        if (res.ok) {
          const json = await res.json();
          let totalSize = 0;
          let docsSize = 0;
          let mediaSize = 0;
          let audioSize = 0;
          let archiveSize = 0;

          (json.nodes || []).forEach((n: any) => {
            if (n.type === "FILE" && n.sizeBytes) {
              const size = parseInt(n.sizeBytes);
              totalSize += size;

              const mime = n.mimeType ? n.mimeType.toLowerCase() : "";
              if (mime.startsWith("image/") || mime.startsWith("video/")) {
                mediaSize += size;
              } else if (mime.startsWith("audio/")) {
                audioSize += size;
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
                docsSize += size;
              } else {
                archiveSize += size;
              }
            }
          });

          setAllNodesCountSize({ count: json.nodes.length, size: totalSize });
          setStorageStats({
            documents: docsSize,
            media: mediaSize,
            audio: audioSize,
            archive: archiveSize,
          });
        }
      } catch (err) {
        console.error("Failed to calculate storage", err);
      }
    }

    fetchStorageInfo();

    // Also fetch trash count for sidebar badge
    async function fetchTrashCount() {
      try {
        const res = await fetch("/api/nodes/trash");
        if (res.ok) {
          const json = await res.json();
          setTrashCount((json.nodes || []).length);
        }
      } catch (err) {
        console.error("Failed to fetch trash count", err);
      }
    }
    fetchTrashCount();
  }, [isReady, cryptoKey, refreshTrigger]);

  // Sync user settings from DB on mount
  React.useEffect(() => {
    if (!isReady || !cryptoKey) return;
    async function loadSettings() {
      try {
        const res = await fetch("/api/user/settings");
        if (res.ok) {
          const { aiSearch } = await res.json();
          setIsAISearch(aiSearch);
        }
      } catch (err) {
        console.error("Load settings failed", err);
      }
    }
    loadSettings();
  }, [isReady, cryptoKey]);

  const handleToggleAISearch = async (enabled: boolean) => {
    try {
      const res = await fetch("/api/user/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiSearch: enabled }),
      });
      if (res.ok) {
        setIsAISearch(enabled);
        toast({
          title: (
            <span className="flex items-center gap-2">
              <CheckCircle size={16} weight="fill" className="text-emerald-500" />
              Settings updated
            </span>
          ),
          description: enabled ? "AI Search has been enabled." : "AI Search has been disabled.",
        });
      } else {
        toast({
          title: (
            <span className="flex items-center gap-2">
              <XCircle size={16} weight="fill" className="text-destructive" />
              Failed to update settings
            </span>
          ),
          description: "Could not save settings.",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Update settings failed", err);
      toast({
        title: (
          <span className="flex items-center gap-2">
            <XCircle size={16} weight="fill" className="text-destructive" />
            Failed to update settings
          </span>
        ),
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    }
  };

  // Decrypt caption of selected file
  React.useEffect(() => {
    if (!selectedNode || !selectedNode.captionEnc || !selectedNode.captionIV || !selectedNode.nodeKey) {
      setDecryptedCaption(null);
      return;
    }

    const node = selectedNode;

    async function decryptCap() {
      setDecryptingCaption(true);
      try {
        const plaintext = await decryptText(
          node.captionEnc!, 
          node.nodeKey!, 
          node.captionIV!
        );
        setDecryptedCaption(plaintext);
      } catch (err) {
        console.error("Failed to decrypt caption", err);
        setDecryptedCaption("Failed to decrypt description.");
      } finally {
        setDecryptingCaption(false);
      }
    }

    decryptCap();
  }, [selectedNode]);

  // Load and decrypt search index in client memory
  const loadSearchIndex = React.useCallback(async () => {
    if (isSearchIndexLoaded || indexingSearch) return;
    try {
      setIndexingSearch(true);
      const res = await fetch("/api/nodes?category=all");
      if (!res.ok) throw new Error("Failed to fetch search index");
      const data = await res.json();
      
      const nodes = data.nodes || [];
      const folders = data.folders || [];
      
      const fMap = new Map();
      folders.forEach((f: any) => fMap.set(f.id, f));
      
      // Stage 1: Decrypt Folders
      const foldersDecMap = new Map<string, any>();
      await Promise.all(
        folders.map(async (folder: any) => {
          try {
            const key = await decryptNodeKeyCascade(folder, fMap);
            let name = folder.name;
            if (folder.nameEnc && folder.nameIV) {
              const decName = await decryptText(folder.nameEnc, key, folder.nameIV);
              try {
                const parsed = JSON.parse(decName);
                name = parsed.name || parsed.filename;
              } catch {
                name = decName;
              }
            }
            foldersDecMap.set(folder.id, { ...folder, name, nodeKey: key });
          } catch (err) {
            console.error("Failed to decrypt folder node:", folder.id, err);
          }
        })
      );
      setDecFoldersMap(foldersDecMap);

      // Stage 2: Decrypt Nodes
      const decryptedList: any[] = [];
      await Promise.all(
        nodes.map(async (node: any) => {
          try {
            const key = await decryptNodeKeyCascade(node, fMap);
            let name = node.name;
            if (node.nameEnc && node.nameIV) {
              const decName = await decryptText(node.nameEnc, key, node.nameIV);
              try {
                const parsed = JSON.parse(decName);
                name = parsed.name || parsed.filename;
              } catch {
                name = decName;
              }
            }
            decryptedList.push({
              ...node,
              name,
              nodeKey: key,
              fileIv: node.fileIv || undefined
            });
          } catch (err) {
            console.error("Failed to decrypt search node:", node.id, err);
          }
        })
      );
      
      setDecryptedSearchNodes(decryptedList);
      setIsSearchIndexLoaded(true);
    } catch (err) {
      console.error("Search index loader error:", err);
    } finally {
      setIndexingSearch(false);
    }
  }, [decryptNodeKeyCascade, isSearchIndexLoaded, indexingSearch]);

  // Keyboard shortcut listener for Cmd+K / Ctrl+K
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchDialogOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Traverse to a folder
  const handleNavigate = (
    folderId: string | null,
    folderName?: string,
    folderKey?: CryptoKey | null
  ) => {
    if (!folderId) return;
    setActiveCategory("drive");

    // Reconstruct breadcrumbs
    const index = breadcrumbs.findIndex((b) => b.id === folderId);
    if (index !== -1) {
      setBreadcrumbs(breadcrumbs.slice(0, index + 1));
    } else if (folderName) {
      setBreadcrumbs([...breadcrumbs, { id: folderId, name: folderName }]);
    }

    // Retrieve key from cache or arguments
    const key = folderKey || nodeKeysCache.current.get(folderId) || null;

    if (key) {
      setCurrentFolderKey(key);
      setCurrentFolderId(folderId);
      setSelectedNode(null);
      setIsInfoPanelOpen(false);
    } else {
      // Fallback in case we don't have the key yet (e.g. reload or direct path)
      const loadFolderFallback = async () => {
        try {
          const allFoldersRes = await fetch("/api/nodes?category=all");
          const { folders } = await allFoldersRes.json();
          const target = folders.find((f: any) => f.id === folderId);
          if (target) {
            const folderNodeKey = await decryptNodeKeyCascade(
              target,
              new Map(folders.map((f: any) => [f.id, f]))
            );
            if (!folderName) {
              const decryptedName = await decryptText(target.nameEnc, folderNodeKey, target.nameIV);
              setBreadcrumbs([...breadcrumbs, { id: folderId, name: decryptedName }]);
            }
            setCurrentFolderKey(folderNodeKey);
            setCurrentFolderId(folderId);
            setSelectedNode(null);
            setIsInfoPanelOpen(false);
          }
        } catch (err) {
          console.error("Navigation fallback failed", err);
        }
      };
      loadFolderFallback();
    }
  };

  const handleSelectFileFromSearch = React.useCallback(
    (node: any) => {
      setIsSearchDialogOpen(false);
      setQuery("");

      if (node.parentId) {
        const parentFolder = decFoldersMap.get(node.parentId);
        if (parentFolder) {
          handleNavigate(parentFolder.id, parentFolder.name, parentFolder.nodeKey);
        } else {
          handleNavigate(node.parentId);
        }
      } else {
        handleNavigate("root", "Root", cryptoKey);
      }

      setTimeout(() => {
        setSelectedNode(node);
        setIsInfoPanelOpen(true);
      }, 50);
    },
    [decFoldersMap, handleNavigate, cryptoKey]
  );

  const handleBreadcrumbClick = (id: string, index: number) => {
    handleNavigate(id);
  };

  // Create folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !currentFolderId || !currentFolderKey || isCreatingFolder) return;

    setIsCreatingFolder(true);
    try {
      const folderKey = await generateNodeKey();
      const { cipherText: nameEnc, iv: nameIV } = await encryptText(newFolderName, folderKey);
      const { encryptedKey: nodeKeyEnc, iv: nodeKeyIV } = await encryptNodeKey(folderKey, currentFolderKey);

      const res = await fetch("/api/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId: currentFolderId,
          type: "FOLDER",
          nameEnc,
          nameIV,
          nodeKeyEnc,
          nodeKeyIV,
        }),
      });

      if (res.ok) {
        setNewFolderName("");
        setShowFolderModal(false);
        setRefreshTrigger((prev) => prev + 1);
        toast({
          title: (
            <span className="flex items-center gap-2">
              <CheckCircle size={16} weight="fill" className="text-emerald-500" />
              Folder created
            </span>
          ),
          description: "New folder was created successfully.",
        });
      } else {
        toast({
          title: (
            <span className="flex items-center gap-2">
              <XCircle size={16} weight="fill" className="text-destructive" />
              Failed to create folder
            </span>
          ),
          description: "Could not create the folder.",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Create folder failed", err);
      toast({
        title: (
          <span className="flex items-center gap-2">
            <XCircle size={16} weight="fill" className="text-destructive" />
            Failed to create folder
          </span>
        ),
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingFolder(false);
    }
  };


  // Format storage size helper
  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  if (!isUserLoaded || !isReady || !currentFolderId || !currentFolderKey) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background overflow-hidden">
        {/* Subtle radial background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary/[0.03] blur-[100px]" />
        </div>

        <div className="relative flex flex-col items-center gap-8 max-w-sm px-6 text-center z-10">
          {/* Animated logo mark with orbiting ring */}
          <div className="relative w-20 h-20">
            {/* Outer orbiting ring */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 80 80" style={{ animation: "lumora-orbit 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite" }}>
              <circle cx="40" cy="40" r="36" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeDasharray="60 166" opacity="0.6" />
            </svg>
            {/* Secondary ring counter-rotating */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 80 80" style={{ animation: "lumora-orbit 3.6s cubic-bezier(0.4, 0, 0.2, 1) infinite reverse" }}>
              <circle cx="40" cy="40" r="28" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="30 146" opacity="0.25" />
            </svg>
            {/* Center shield / lock icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div style={{ animation: "lumora-breathe 2s ease-in-out infinite" }}>
                <ShieldCheck size={28} weight="duotone" className="text-primary" />
              </div>
            </div>
          </div>

          {/* Brand name with shimmer */}
          <div className="space-y-3">
            <h2
              className="text-3xl font-bold tracking-tight select-none"
              style={{
                background: "linear-gradient(110deg, hsl(var(--primary)) 0%, hsl(var(--primary)/0.6) 40%, hsl(var(--primary)) 50%, hsl(var(--primary)/0.6) 60%, hsl(var(--primary)) 100%)",
                backgroundSize: "200% 100%",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                animation: "lumora-shimmer 2.5s ease-in-out infinite",
              }}
            >
              Lumora
            </h2>
            <p className="text-xs text-muted-foreground/70 font-medium tracking-wide">
              Preparing your secure vault
            </p>
          </div>

          {/* Staggered loading dots */}
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-primary/60"
                style={{
                  animation: "lumora-dot 1.4s ease-in-out infinite",
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Inline keyframes */}
        <style>{`
          @keyframes lumora-orbit {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes lumora-breathe {
            0%, 100% { transform: scale(1); opacity: 0.85; }
            50% { transform: scale(1.08); opacity: 1; }
          }
          @keyframes lumora-shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
          @keyframes lumora-dot {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
            40% { transform: scale(1.2); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div 
      onDragEnter={handleDashboardDragEnter}
      onDragOver={handleDashboardDragOver}
      className="flex h-screen overflow-hidden bg-background relative"
    >
      <Sidebar 
        activeCategory={activeCategory} 
        setActiveCategory={(cat) => {
          setActiveCategory(cat);
          setQuery("");
          setSelectedNode(null);
          setIsMobileSidebarOpen(false);
        }} 
        totalSizeBytes={allNodesCountSize.size}
        trashCount={trashCount}
        storageStats={storageStats}
        width={sidebarWidth}
        setWidth={setSidebarWidth}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        isMobileOpen={isMobileSidebarOpen}
        setIsMobileOpen={setIsMobileSidebarOpen}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar 
          query={query} 
          setQuery={setQuery} 
          onUploadClick={() => setIsUploadOpen(true)} 
          onSettingsClick={() => setIsSettingsOpen(true)}
          onMenuClick={() => setIsMobileSidebarOpen(true)}
          onSearchClick={() => setIsSearchDialogOpen(true)}
          decryptedSearchNodes={decryptedSearchNodes}
          decFoldersMap={decFoldersMap}
          loadSearchIndex={loadSearchIndex}
          isSearchIndexLoaded={isSearchIndexLoaded}
          onNavigate={handleNavigate}
          onOpenViewer={(node) => {
            handleSelectFileFromSearch(node);
          }}
          aiSearchEnabled={isAISearch}
        />
        
        {isAISearch && (
          <div className="px-4 md:px-6 py-1.5 border-b border-border bg-primary/5 flex items-center gap-2 text-xs font-semibold text-primary">
            <ShieldCheck size={16} weight="fill" className="text-primary" />
            Smart AI Search Enabled
          </div>
        )}

        <main className="flex-1 flex overflow-hidden">
          {activeCategory === "trash" ? (
            /* Trash Panel – no extra padding, owns its own header */
            <TrashPanel
              refreshTrigger={refreshTrigger}
              onRefresh={() => setRefreshTrigger((prev) => prev + 1)}
            />
          ) : activeCategory === "storage" ? (
            <StoragePanel
              onSelectNode={(node, openPanel) => {
                setSelectedNode(node);
                if (openPanel) {
                  setIsInfoPanelOpen(true);
                }
              }}
              selectedNodeId={selectedNode?.id || null}
              refreshTrigger={refreshTrigger}
              onRefresh={() => setRefreshTrigger((prev) => prev + 1)}
            />
          ) : (
            /* File explorer main panel */
            <div 
              className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col pb-28"
              onClick={() => {
                setSelectedNode(null);
                setIsInfoPanelOpen(false);
              }}
            >

              {/* Folder explorer header & actions */}
              <div 
                className="flex items-center justify-between mb-4 md:mb-6 gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Breadcrumbs */}
                <div className="flex items-center gap-1 md:gap-1.5 flex-wrap text-xs md:text-sm font-medium min-w-0">
                  {activeCategory !== "drive" ? (
                    <span className="text-foreground capitalize text-base md:text-lg font-semibold tracking-tight">
                      {activeCategory}
                    </span>
                  ) : (() => {
                    // Collapse middle breadcrumbs when > 3 levels deep
                    const MAX_VISIBLE = 3; // first + last 2
                    const shouldCollapse = breadcrumbs.length > MAX_VISIBLE;
                    const visibleCrumbs = shouldCollapse
                      ? [
                          breadcrumbs[0],
                          ...breadcrumbs.slice(-2),
                        ]
                      : breadcrumbs;

                    return visibleCrumbs.map((crumb, visIdx) => {
                      // Map visible index back to real index for click handler
                      let realIdx: number;
                      if (!shouldCollapse) {
                        realIdx = visIdx;
                      } else if (visIdx === 0) {
                        realIdx = 0;
                      } else {
                        realIdx = breadcrumbs.length - 2 + (visIdx - 1);
                      }
                      const isLast = realIdx === breadcrumbs.length - 1;

                      return (
                        <React.Fragment key={crumb.id}>
                          {visIdx > 0 && <span className="text-muted-foreground/50 select-none">/</span>}
                          {/* Ellipsis for collapsed middle segments */}
                          {shouldCollapse && visIdx === 1 && (
                            <>
                              <button
                                onClick={() => handleBreadcrumbClick(breadcrumbs[1].id, 1)}
                                className="text-muted-foreground hover:text-primary transition-colors text-base md:text-lg font-semibold tracking-tight select-none cursor-pointer px-0.5"
                                title={breadcrumbs.slice(1, -2).map(b => b.name).join(" / ")}
                              >
                                …
                              </button>
                              <span className="text-muted-foreground/50 select-none">/</span>
                            </>
                          )}
                          <button
                            onClick={() => handleBreadcrumbClick(crumb.id, realIdx)}
                            className={`hover:text-primary transition-colors text-base md:text-lg font-semibold tracking-tight select-none truncate max-w-[120px] md:max-w-[200px] ${
                              isLast ? "text-foreground cursor-default" : "text-muted-foreground cursor-pointer"
                            }`}
                            disabled={isLast}
                            title={crumb.name}
                          >
                            {crumb.name}
                          </button>
                        </React.Fragment>
                      );
                    });
                  })()}
                </div>

                {/* Grid/List toggles & Folder Actions */}
                <div className="flex items-center gap-2">
                  {activeCategory === "drive" && !query.trim() && currentFolderId && (
                    <button
                      onClick={() => setShowFolderModal(true)}
                      className="p-2 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg border border-border flex items-center gap-1.5 transition-all text-xs font-medium bg-card cursor-pointer"
                    >
                      <FolderPlus size={18} />
                      <span className="hidden sm:inline">New Folder</span>
                    </button>
                  )}

                  <div className="h-8 w-[1px] bg-border mx-1" />

                  <button
                    onClick={() => { setViewMode("list"); localStorage.setItem("lumora-view-mode", "list"); }}
                    className={`p-2 rounded-lg transition-colors border ${
                      viewMode === "list"
                        ? "bg-muted text-foreground border-border cursor-pointer"
                        : "text-muted-foreground hover:bg-muted border-transparent cursor-pointer"
                    }`}
                    title="List view"
                  >
                    <List size={18} />
                  </button>
                  <button
                    onClick={() => { setViewMode("grid"); localStorage.setItem("lumora-view-mode", "grid"); }}
                    className={`p-2 rounded-lg transition-colors border ${
                      viewMode === "grid"
                        ? "bg-muted text-foreground border-border cursor-pointer"
                        : "text-muted-foreground hover:bg-muted border-transparent cursor-pointer"
                    }`}
                    title="Grid view"
                  >
                    <GridNine size={18} />
                  </button>
                </div>
              </div>

              {/* Folder Explorer component */}
              {currentFolderId && currentFolderKey && (
              <div className="flex-1">
                <MediaGallery 
                  query={isAISearch ? query : ""} 
                  localQuery={!isAISearch ? query : ""}
                  currentFolderId={currentFolderId} 
                  onNavigate={handleNavigate}
                  viewMode={viewMode}
                  activeCategory={activeCategory}
                  onSelectNode={(node, openPanel) => {
                    setSelectedNode(node);
                    if (openPanel) {
                      setIsInfoPanelOpen(true);
                    }
                  }}
                  onCloseInfoPanel={() => setIsInfoPanelOpen(false)}
                  selectedNodeId={selectedNode?.id || null}
                  refreshTrigger={refreshTrigger}
                  onRefresh={() => setRefreshTrigger((prev) => prev + 1)}
                  onTriggerUpload={() => setIsUploadOpen(true)}
                  onTriggerCreateFolder={() => setShowFolderModal(true)}
                />
              </div>
            )}
          </div>
          )} {/* end activeCategory !== "trash" */}

          {/* Collapsible right-hand detail panel – desktop */}
          {selectedNode && isInfoPanelOpen && activeCategory !== "trash" && (
            <aside className="w-[320px] border-l border-border bg-card/50 hidden lg:flex flex-col h-full overflow-y-auto animate-in slide-in-from-right duration-200">
              <div className="p-5 border-b border-border flex items-center justify-between bg-card">
                <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                  <Info size={18} />
                  Item Details
                </h3>
                <button 
                  onClick={() => setIsInfoPanelOpen(false)}
                  className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-full transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Meta details */}
                <div className="text-center pb-4 border-b border-border">
                  <div className="p-4 bg-muted rounded-xl inline-block mb-3 text-primary/80">
                    {selectedNode.type === "FOLDER" ? (
                      <Folder size={36} weight="fill" className="text-yellow-500" />
                    ) : (
                      <FileText size={36} />
                    )}
                  </div>
                  <h4 className="font-medium text-foreground text-sm truncate max-w-full px-2 select-none" title={selectedNode.name}>
                    {selectedNode.name}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1 capitalize">{selectedNode.type.toLowerCase()}</p>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground">Encryption</span>
                    <span className="text-foreground font-semibold flex items-center gap-1">
                      <ShieldCheck size={14} className="text-primary" />
                      End-to-End Encrypted
                    </span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground font-medium">
                      {selectedNode.type === "FOLDER" ? "Folder Size" : "File Size"}
                    </span>
                    <span className="text-foreground font-medium">
                      {formatSize(selectedNode.sizeBytes ? parseInt(selectedNode.sizeBytes) : 0)}
                    </span>
                  </div>

                  {selectedNode.type === "FILE" && (
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">File Type</span>
                      <span className="text-foreground font-medium truncate max-w-[150px]" title={selectedNode.mimeType || ""}>
                        {selectedNode.mimeType || "—"}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground">Uploaded At</span>
                    <span className="text-foreground font-medium flex items-center gap-1">
                      <Calendar size={13} />
                      {new Date(selectedNode.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* AI Details Decrypted Client-Side */}
                {selectedNode.type === "FILE" && (
                  <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-xs font-semibold text-primary flex items-center gap-1.5">
                        <ShieldCheck size={14} />
                        Smart AI Tags
                      </h5>
                      <div className="relative group">
                        <Question size={14} className="text-muted-foreground hover:text-primary cursor-help transition-colors" />
                        <div className="absolute bottom-full right-0 mb-2 w-48 p-2.5 bg-card text-card-foreground text-[10px] rounded-lg shadow-md border border-border opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200 z-20 font-medium leading-normal text-left">
                          To generate AI tags for new uploads, enable Smart AI Search in settings.
                        </div>
                      </div>
                    </div>
                    {decryptingCaption ? (
                      <p className="text-[11px] text-muted-foreground animate-pulse">Decrypting tags...</p>
                    ) : decryptedCaption ? (
                      <div className="flex flex-wrap gap-1.5 mt-1 select-none">
                        {decryptedCaption.split(",").map((tag, idx) => (
                          <span 
                            key={idx} 
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20"
                          >
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground leading-relaxed italic">No tags available for this file.</p>
                    )}
                  </div>
                )}
              </div>
            </aside>
          )}

          {/* Mobile info panel overlay */}
          {selectedNode && isInfoPanelOpen && activeCategory !== "trash" && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsInfoPanelOpen(false)} />
              <aside className="absolute right-0 top-0 bottom-0 w-[85vw] max-w-[360px] bg-card flex flex-col h-full overflow-y-auto animate-in slide-in-from-right duration-200 shadow-2xl">
                <div className="p-5 border-b border-border flex items-center justify-between bg-card">
                  <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                    <Info size={18} />
                    Item Details
                  </h3>
                  <button 
                    onClick={() => setIsInfoPanelOpen(false)}
                    className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-full transition-colors cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  <div className="text-center pb-4 border-b border-border">
                    <div className="p-4 bg-muted rounded-xl inline-block mb-3 text-primary/80">
                      {selectedNode.type === "FOLDER" ? (
                        <Folder size={36} weight="fill" className="text-yellow-500" />
                      ) : (
                        <FileText size={36} />
                      )}
                    </div>
                    <h4 className="font-medium text-foreground text-sm truncate max-w-full px-2 select-none" title={selectedNode.name}>
                      {selectedNode.name}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 capitalize">{selectedNode.type.toLowerCase()}</p>
                  </div>

                  <div className="space-y-4 text-xs">
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Encryption</span>
                      <span className="text-foreground font-semibold flex items-center gap-1">
                        <ShieldCheck size={14} className="text-primary" />
                        End-to-End Encrypted
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground font-medium">
                        {selectedNode.type === "FOLDER" ? "Folder Size" : "File Size"}
                      </span>
                      <span className="text-foreground font-medium">
                        {formatSize(selectedNode.sizeBytes ? parseInt(selectedNode.sizeBytes) : 0)}
                      </span>
                    </div>
                    {selectedNode.type === "FILE" && (
                      <div className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">File Type</span>
                        <span className="text-foreground font-medium truncate max-w-[150px]" title={selectedNode.mimeType || ""}>
                          {selectedNode.mimeType || "—"}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Uploaded At</span>
                      <span className="text-foreground font-medium flex items-center gap-1">
                        <Calendar size={13} />
                        {new Date(selectedNode.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {selectedNode.type === "FILE" && (
                    <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="text-xs font-semibold text-primary flex items-center gap-1.5">
                          <ShieldCheck size={14} />
                          Smart AI Tags
                        </h5>
                      </div>
                      {decryptingCaption ? (
                        <p className="text-[11px] text-muted-foreground animate-pulse">Decrypting tags...</p>
                      ) : decryptedCaption ? (
                        <div className="flex flex-wrap gap-1.5 mt-1 select-none">
                          {decryptedCaption.split(",").map((tag, idx) => (
                            <span 
                              key={idx} 
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20"
                            >
                              {tag.trim()}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground leading-relaxed italic">No tags available for this file.</p>
                      )}
                    </div>
                  )}
                </div>
              </aside>
            </div>
          )}
        </main>
      </div>

      {/* Upload modal */}
      {currentFolderId && currentFolderKey && (
        <UploadModal 
          isOpen={isUploadOpen} 
          onClose={handleCloseUploadModal} 
          parentId={currentFolderId}
          parentKey={currentFolderKey}
          aiSearchEnabled={isAISearch}
          initialFiles={draggedFiles}
          onUploadComplete={() => setRefreshTrigger((prev) => prev + 1)}
        />
      )}

      {/* Full-screen Drag and Drop Overlay */}
      {isDashboardDragging && (
        <div 
          onDragLeave={handleDashboardDragLeave}
          onDragOver={handleDashboardDragOver}
          onDrop={handleDashboardDrop}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-md border-4 border-dashed border-primary m-4 rounded-2xl animate-in fade-in duration-200"
        >
          <div className="pointer-events-none flex flex-col items-center justify-center">
            <div className="p-6 bg-primary/10 text-primary rounded-full mb-4 animate-bounce">
              <CloudArrowUp size={48} weight="fill" />
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-2">Drop files to upload</h3>
            <p className="text-sm text-muted-foreground">
              Uploading to: <span className="font-semibold text-primary select-none">{breadcrumbs[breadcrumbs.length - 1]?.name || "Root"}</span>
            </p>
          </div>
        </div>
      )}

      {/* Folder Creation Modal */}
      {showFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border shadow-xl rounded-xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-semibold text-foreground mb-4">Create New Folder</h3>
            
            <input 
              type="text" 
              placeholder="Folder Name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              disabled={isCreatingFolder}
              className="w-full bg-muted border border-border rounded-lg px-4 py-2.5 outline-none focus:border-primary text-sm text-foreground mb-6 disabled:opacity-50"
            />

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => { setShowFolderModal(false); setNewFolderName(""); }}
                disabled={isCreatingFolder}
                className="px-4 py-2 text-sm font-medium hover:bg-muted border border-border rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || isCreatingFolder}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/95 disabled:opacity-50 rounded-lg shadow transition-colors flex items-center justify-center min-w-[100px] cursor-pointer"
              >
                {isCreatingFolder ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Creating...
                  </span>
                ) : (
                  "Create Folder"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        aiSearchEnabled={isAISearch}
        onToggleAISearch={handleToggleAISearch}
      />

      {/* Universal Search Dialog */}
      <UniversalSearchDialog
        isOpen={isSearchDialogOpen}
        onClose={() => setIsSearchDialogOpen(false)}
        onNavigate={handleNavigate}
        onOpenViewer={(node) => {
          handleSelectFileFromSearch(node);
        }}
        decryptedSearchNodes={decryptedSearchNodes}
        decFoldersMap={decFoldersMap}
        indexing={indexingSearch}
        loadSearchIndex={loadSearchIndex}
        aiSearchEnabled={isAISearch}
      />

      {/* Global File Viewer for search results */}
      {globalViewerNode && globalViewerKey && (
        <FileViewer
          isOpen={!!globalViewerNode}
          onClose={() => {
            setGlobalViewerNode(null);
            setGlobalViewerKey(null);
          }}
          node={globalViewerNode}
          nodeKey={globalViewerKey}
        />
      )}
      {/* Floating Mobile Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-background/85 dark:bg-neutral-900/85 border border-border/80 shadow-2xl rounded-full px-4 py-2.5 backdrop-blur-md select-none">
        <button
          onClick={() => {
            setActiveCategory("drive");
            setSelectedNode(null);
          }}
          className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-2xl transition-colors cursor-pointer ${
            activeCategory === "drive" 
              ? "text-primary" 
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <HardDrive size={20} weight={activeCategory === "drive" ? "fill" : "regular"} />
          <span className="text-[10px] font-semibold">Drive</span>
        </button>

        {/* Floating Upload button integrated in center of tab bar */}
        <button
          onClick={() => setIsUploadOpen(true)}
          className="p-3 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full shadow-md active:scale-95 transition-transform flex items-center justify-center cursor-pointer mx-1 border border-primary/20"
          title="Upload file"
        >
          <CloudArrowUp size={20} weight="bold" />
        </button>

        <button
          onClick={() => {
            setActiveCategory("starred");
            setSelectedNode(null);
          }}
          className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-2xl transition-colors cursor-pointer ${
            activeCategory === "starred" 
              ? "text-primary" 
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Star size={20} weight={activeCategory === "starred" ? "fill" : "regular"} />
          <span className="text-[10px] font-semibold">Starred</span>
        </button>
      </div>
    </div>
  );
}
