"use client"

import * as React from "react"
import { useCrypto } from "./crypto-provider"
import { decryptText } from "@/lib/crypto"
import { NodePreview } from "./node-preview"
import {
  LockKey,
  LockOpen,
  Folder,
  File,
  FilePdf,
  FileAudio,
  FileVideo,
  FileCode,
  FileText,
  Clock,
  Warning,
  CheckCircle,
  XCircle,
  GridNine,
  ListDashes,
  MagnifyingGlassIcon,
  ShieldCheck,
  Eye,
  EyeSlash,
  SignOut,
  FolderMinus
} from "@phosphor-icons/react"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Image as ImageIcon } from "@phosphor-icons/react"

type SecureNode = {
  id: string
  type: "FOLDER" | "FILE"
  mimeType: string | null
  sizeBytes: string | null
  r2Key: string | null
  nameEnc: string
  nameIV: string
  nodeKeyEnc: string
  nodeKeyIV: string
  parentId: string | null
  captionEnc: string | null
  captionIV: string | null
  createdAt: string
}

type DecryptedSecureNode = SecureNode & {
  name: string
  fileIv: string | null
  nodeKey: CryptoKey | null
  url?: string | null
}

interface SecureFolderPanelProps {
  refreshTrigger: number
  onRefresh: () => void
  onSelectNode: (node: any, openPanel: boolean) => void
  selectedNodeId: string | null
  globalFoldersMap: Map<string, any>
}

function formatStorageSize(bytesStr: string | null) {
  if (!bytesStr) return "—"
  const bytes = parseInt(bytesStr)
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

function getFileIcon(mimeType: string | null, name: string) {
  if (!mimeType) return <File size={18} />
  if (mimeType.startsWith("image/")) return <ImageIcon size={18} className="text-blue-500" />
  if (mimeType.startsWith("video/")) return <FileVideo size={18} className="text-red-500" />
  if (mimeType.startsWith("audio/")) return <FileAudio size={18} className="text-emerald-500" />
  if (mimeType === "application/pdf") return <FilePdf size={18} className="text-rose-500" />
  if (
    mimeType.startsWith("text/") ||
    name.endsWith(".json") ||
    name.endsWith(".js") ||
    name.endsWith(".ts")
  )
    return <FileCode size={18} className="text-yellow-600" />
  return <FileText size={18} className="text-gray-500" />
}

export function SecureFolderPanel({ refreshTrigger, onRefresh, onSelectNode, selectedNodeId, globalFoldersMap }: SecureFolderPanelProps) {
  const { decryptNodeKeyCascade, isReady } = useCrypto()
  const { toast } = useToast()

  const [setupStatus, setSetupStatus] = React.useState<"loading" | "not_setup" | "locked" | "unlocked">("loading")
  const [pin, setPin] = React.useState("")
  const [showPin, setShowPin] = React.useState(false)
  const [verifying, setVerifying] = React.useState(false)

  // Setup state
  const [showSetupModal, setShowSetupModal] = React.useState(false)
  const [newPin, setNewPin] = React.useState("")
  const [showNewPin, setShowNewPin] = React.useState(false)
  const [securityQuestion, setSecurityQuestion] = React.useState("")
  const [securityAnswer, setSecurityAnswer] = React.useState("")
  const [isSecureActionLoading, setIsSecureActionLoading] = React.useState(false)

  const [items, setItems] = React.useState<SecureNode[]>([])
  const [foldersMap, setFoldersMap] = React.useState<Map<string, any>>(new Map())
  const [decryptedItems, setDecryptedItems] = React.useState<DecryptedSecureNode[]>([])
  const [loading, setLoading] = React.useState(true)
  const [actionLoading, setActionLoading] = React.useState<string | null>(null)
  
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("list")
  const [searchQuery, setSearchQuery] = React.useState("")
  
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = React.useState(false)

  React.useEffect(() => {
    const saved = localStorage.getItem("lumora-view-mode") as "grid" | "list";
    if (saved === "grid" || saved === "list") setViewMode(saved);
  }, []);

  // Check setup
  React.useEffect(() => {
    async function checkSetup() {
      try {
        const res = await fetch("/api/user/secure-folder");
        if (res.ok) {
          const json = await res.json();
          if (!json.setup) {
            setSetupStatus("not_setup");
          } else {
            // Check session storage if unlocked
            if (sessionStorage.getItem("lumora_secure_unlocked") === "true") {
              setSetupStatus("unlocked");
            } else {
              setSetupStatus("locked");
            }
          }
        }
      } catch (err) {
        console.error(err);
      }
    }
    checkSetup();
  }, []);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) return;
    setVerifying(true);
    try {
      const res = await fetch("/api/user/secure-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", pin }),
      });
      const json = await res.json();
      if (json.success) {
        sessionStorage.setItem("lumora_secure_unlocked", "true");
        setSetupStatus("unlocked");
        setPin("");
        toast({
          title: "Folder Unlocked",
          description: "You now have access to your secure files.",
        });
      } else {
        toast({
          title: "Incorrect Password",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setVerifying(false);
    }
  };

  const handleSetupSecure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPin || !securityQuestion || !securityAnswer) return;
    setIsSecureActionLoading(true);
    try {
      const res = await fetch("/api/user/secure-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup", pin: newPin, securityQuestion, securityAnswer }),
      });
      if (res.ok) {
        setSetupStatus("locked");
        setNewPin("");
        setSecurityQuestion("");
        setSecurityAnswer("");
        setShowSetupModal(false);
        toast({ title: "Secure Folder Set Up", description: "Your secure folder is ready to use." });
      } else {
        const errorData = await res.json();
        toast({ title: "Setup Failed", description: errorData.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: "Failed to setup secure folder", variant: "destructive" });
    } finally {
      setIsSecureActionLoading(false);
    }
  };

  const handleLock = () => {
    sessionStorage.removeItem("lumora_secure_unlocked");
    setSetupStatus("locked");
    setItems([]);
    setDecryptedItems([]);
    setFoldersMap(new Map());
  };

  const fetchSecure = React.useCallback(async (cursor: string | null = null, isLoadMore: boolean = false) => {
    if (!isReady || setupStatus !== "unlocked") return
    if (isLoadMore) {
      setIsLoadingMore(true)
    } else {
      setLoading(true)
    }
    try {
      let endpoint = "/api/nodes/secure?limit=50"
      if (cursor) {
        endpoint += `&cursor=${cursor}`
      }
      const res = await fetch(endpoint)
      if (res.ok) {
        const json = await res.json()
        if (isLoadMore) {
          setItems(prev => [...prev, ...(json.nodes || [])])
        } else {
          setItems(json.nodes || [])
        }
        setNextCursor(json.nextCursor || null)
        
        setFoldersMap(prev => {
          const fMap = isLoadMore ? new Map(prev) : new Map()
          if (!isLoadMore) {
            ;(json.folders || []).forEach((f: any) => fMap.set(f.id, f))
          }
          return fMap
        })
      }
    } catch (err) {
      console.error("Failed to fetch secure nodes", err)
    } finally {
      setLoading(false)
      setIsLoadingMore(false)
    }
  }, [isReady, setupStatus])

  React.useEffect(() => {
    fetchSecure()
  }, [fetchSecure, refreshTrigger])

  const observerRef = React.useRef<IntersectionObserver | null>(null)
  const handleLoadMore = React.useCallback(() => {
    if (nextCursor && !isLoadingMore) {
      fetchSecure(nextCursor, true)
    }
  }, [fetchSecure, nextCursor, isLoadingMore])

  const loadMoreRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (isLoadingMore) return
      if (observerRef.current) observerRef.current.disconnect()

      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && nextCursor) {
          handleLoadMore()
        }
      })

      if (node) observerRef.current.observe(node)
    },
    [isLoadingMore, nextCursor, handleLoadMore]
  )

  React.useEffect(() => {
    if (!isReady || !items.length) {
      setDecryptedItems([])
      return
    }
    let active = true
    async function decryptAll() {
      const list: DecryptedSecureNode[] = []
      const combinedFoldersMap = new Map(globalFoldersMap)
      foldersMap.forEach((v, k) => combinedFoldersMap.set(k, v))
      
      for (const item of items) {
        try {
          const key = await decryptNodeKeyCascade(item, combinedFoldersMap)
          const decName = await decryptText(item.nameEnc, key, item.nameIV)
          let name = decName
          let fileIv = null
          if (item.type === "FILE") {
            try {
              const parsed = JSON.parse(decName)
              name = parsed.name || parsed.filename || decName
              fileIv = parsed.fileIv || null
            } catch {
              name = decName
            }
          }
          list.push({ ...item, name, fileIv, nodeKey: key })
        } catch (err) {
          console.error("Decryption failed for secure item", item.id, err)
          list.push({ ...item, name: "Encrypted File", fileIv: null, nodeKey: null })
        }
      }
      if (active) setDecryptedItems(list)
    }
    decryptAll()
    return () => { active = false }
  }, [items, foldersMap, globalFoldersMap, decryptNodeKeyCascade, isReady])

  const handleRemoveFromSecure = async (id: string) => {
    setActionLoading(id)
    try {
      const res = await fetch(`/api/nodes?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSecure: false })
      })
      if (res.ok) {
        onRefresh()
        toast({
          title: "Removed from Secure Folder",
          description: "The item has been moved back to standard storage.",
        })
      } else {
        toast({
          title: "Error",
          description: "Could not remove item from secure folder.",
          variant: "destructive",
        })
      }
    } catch (err) {
      console.error(err)
      toast({ title: "Error", variant: "destructive" })
    } finally {
      setActionLoading(null)
    }
  }

  if (setupStatus === "loading") {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-20 text-muted-foreground">
        <LockKey size={40} className="opacity-30 mb-3 animate-pulse" />
        <p className="text-sm animate-pulse">Loading secure folder…</p>
      </div>
    )
  }

  if (setupStatus === "not_setup") {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-20">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <ShieldCheck size={32} className="text-primary" weight="fill" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Secure Folder Not Set Up</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm text-center">
          Protect your sensitive files with an additional password. You must set it up before using.
        </p>
        <button
          onClick={() => setShowSetupModal(true)}
          className="bg-primary text-primary-foreground font-medium py-2 px-6 rounded-lg hover:bg-primary/90 transition"
        >
          Setup Secure Folder
        </button>

        <Dialog open={showSetupModal} onOpenChange={setShowSetupModal}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-primary">
                <ShieldCheck size={20} />
                Setup Secure Folder
              </DialogTitle>
              <DialogDescription>
                Set a password and a security question to protect your secure folder.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSetupSecure} className="space-y-4 mt-4">
              <div className="space-y-1.5">
                <Label htmlFor="newPin" className="text-xs font-medium">Password</Label>
                <div className="relative">
                  <Input
                    id="newPin"
                    type={showNewPin ? "text" : "password"}
                    placeholder="Enter a secure password"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    className="h-9 pr-10"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPin(!showNewPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPin ? <EyeSlash size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="secQuestion" className="text-xs font-medium">Security Question</Label>
                <Input
                  id="secQuestion"
                  placeholder="e.g. What is your pet's name?"
                  value={securityQuestion}
                  onChange={(e) => setSecurityQuestion(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="secAnswer" className="text-xs font-medium">Answer</Label>
                <Input
                  id="secAnswer"
                  placeholder="Your answer"
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={!newPin || !securityQuestion || !securityAnswer || isSecureActionLoading}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/95 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium flex justify-center items-center gap-2"
                >
                  {isSecureActionLoading && <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />}
                  Complete Setup
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  if (setupStatus === "locked") {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-20">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6">
          <LockKey size={32} className="text-primary" weight="fill" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Secure Folder Locked</h3>
        <p className="text-sm text-muted-foreground mb-8 text-center max-w-xs">
          Enter your Secure Folder password to view and manage your protected files.
        </p>
        
        <form onSubmit={handleUnlock} className="flex flex-col gap-4 w-full max-w-xs">
          <div className="relative">
            <Input
              type={showPin ? "text" : "password"}
              placeholder="Enter password..."
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="pr-10"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPin ? <EyeSlash size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <button
            type="submit"
            disabled={!pin || verifying}
            className="w-full bg-primary text-primary-foreground font-medium py-2 rounded-lg hover:bg-primary/90 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {verifying ? (
              <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <LockOpen size={18} weight="bold" />
            )}
            Unlock
          </button>
        </form>
      </div>
    )
  }

  const filteredItems = decryptedItems.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <LockKey size={22} weight="fill" className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight flex items-center gap-2">
              Secure Folder
              {decryptedItems.length > 0 && (
                <Badge variant="secondary" className="text-xs font-medium">
                  {decryptedItems.length}
                </Badge>
              )}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              These files are protected by your secure password.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative w-full md:w-64">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              type="text"
              placeholder="Search secure files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 w-full bg-muted/30 border-border/50 text-sm"
            />
          </div>

          <div className="flex bg-muted/50 p-1 rounded-lg border border-border">
            <button
              onClick={() => { setViewMode("list"); localStorage.setItem("lumora-view-mode", "list"); }}
              className={`p-1 rounded-md transition-colors ${
                viewMode === "list"
                  ? "bg-card text-primary shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-muted border-transparent cursor-pointer"
              }`}
            >
              <ListDashes size={16} />
            </button>
            <button
              onClick={() => { setViewMode("grid"); localStorage.setItem("lumora-view-mode", "grid"); }}
              className={`p-1 rounded-md transition-colors ${
                viewMode === "grid"
                  ? "bg-card text-primary shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-muted border-transparent cursor-pointer"
              }`}
            >
              <GridNine size={16} />
            </button>
          </div>

          <button
            onClick={handleLock}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            <SignOut size={16} />
            Lock
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center flex-1 py-20 text-muted-foreground">
          <LockKey size={40} className="opacity-30 mb-3 animate-pulse" />
          <p className="text-sm animate-pulse">Loading secure files…</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-20">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
            <ShieldCheck size={32} className="text-muted-foreground opacity-50" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">
            {searchQuery ? "No matches found" : "Secure Folder is empty"}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm text-center">
            {searchQuery 
              ? "Try adjusting your search query."
              : "Move files here from the standard storage to keep them protected."}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredItems.map((item) => (
              <SecureCard
                key={item.id}
                item={item}
                actionLoading={actionLoading}
                onSelect={(node) => onSelectNode(node, true)}
                onRemove={handleRemoveFromSecure}
                isSelected={selectedNodeId === item.id}
              />
            ))}
          </div>
          {nextCursor && !searchQuery && (
            <div ref={loadMoreRef} className="py-6 flex justify-center items-center">
              {isLoadingMore && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Loading more...
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/40 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="px-5 py-3.5">Name</th>
                <th className="px-5 py-3.5 hidden sm:table-cell">Type</th>
                <th className="px-5 py-3.5 hidden md:table-cell">Size</th>
                <th className="px-5 py-3.5 hidden md:table-cell">Added On</th>
                <th className="px-5 py-3.5 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredItems.map((item) => (
                <SecureRow
                  key={item.id}
                  item={item}
                  actionLoading={actionLoading}
                  onSelect={(node) => onSelectNode(node, true)}
                  onRemove={handleRemoveFromSecure}
                  isSelected={selectedNodeId === item.id}
                />
              ))}
            </tbody>
          </table>
          {nextCursor && !searchQuery && (
            <div ref={loadMoreRef} className="py-6 flex justify-center items-center">
              {isLoadingMore && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Loading more...
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SecureRow({
  item,
  actionLoading,
  onSelect,
  onRemove,
  isSelected
}: {
  item: DecryptedSecureNode
  actionLoading: string | null
  onSelect: (node: any) => void
  onRemove: (id: string) => void
  isSelected: boolean
}) {
  const isRemoving = actionLoading === item.id

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <tr 
            onClick={() => onSelect(item)}
            className={`transition-colors group cursor-pointer ${isSelected ? "bg-primary/5" : "hover:bg-muted/30"}`} 
          />
        }
      >
        <td className="px-5 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-1.5 bg-muted rounded-md flex-shrink-0">
              {item.type === "FOLDER" ? (
                <Folder weight="fill" size={18} className="text-yellow-500" />
              ) : (
                getFileIcon(item.mimeType, item.name)
              )}
            </div>
            <span
              className="text-sm font-medium text-foreground/90 truncate max-w-[160px] md:max-w-xs select-none"
              title={item.name}
            >
              {item.name}
            </span>
          </div>
        </td>
        <td className="px-5 py-3.5 text-xs text-muted-foreground hidden sm:table-cell">
          {item.type === "FOLDER" ? "Folder" : item.mimeType?.split("/")[1]?.toUpperCase() || "File"}
        </td>
        <td className="px-5 py-3.5 text-xs text-muted-foreground hidden md:table-cell">
          {item.type === "FOLDER" ? "—" : formatStorageSize(item.sizeBytes)}
        </td>
        <td className="px-5 py-3.5 text-xs text-muted-foreground hidden md:table-cell">
          {new Date(item.createdAt).toLocaleDateString()}
        </td>
        <td className="px-5 py-3.5 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <Tooltip>
              <TooltipTrigger
                disabled={isRemoving}
                onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors cursor-pointer"
              >
                {isRemoving ? (
                  <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <FolderMinus size={16} />
                )}
              </TooltipTrigger>
              <TooltipContent>Remove from Secure Folder</TooltipContent>
            </Tooltip>
          </div>
        </td>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48 bg-card/85 backdrop-blur-md border border-border/80 shadow-lg rounded-xl p-1.5 animate-in fade-in-50 duration-100">
        <ContextMenuItem
          disabled={isRemoving}
          onClick={() => onRemove(item.id)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer"
        >
          <FolderMinus size={16} />
          <span>Remove from Secure Folder</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function SecureCard({
  item,
  actionLoading,
  onSelect,
  onRemove,
  isSelected
}: {
  item: DecryptedSecureNode
  actionLoading: string | null
  onSelect: (node: any) => void
  onRemove: (id: string) => void
  isSelected: boolean
}) {
  const isRemoving = actionLoading === item.id

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div 
            onClick={() => onSelect(item)}
            className={`group border rounded-2xl p-3 hover:shadow-md transition-all cursor-pointer flex flex-col gap-3 min-w-0 ${isSelected ? "bg-primary/5 border-primary/30" : "bg-card border-border hover:border-primary/50"} relative`} 
          />
        }
      >
        <div className="flex items-center justify-between gap-2 w-full min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="flex-shrink-0">
              {item.type === "FOLDER" ? (
                <Folder weight="fill" size={18} className="text-yellow-500" />
              ) : (
                <div className="scale-75 origin-left -mr-1">
                  {getFileIcon(item.mimeType, item.name)}
                </div>
              )}
            </div>
            <span
              className="text-sm font-medium text-foreground truncate select-none flex-1"
              title={item.name}
            >
              {item.name}
            </span>
          </div>
        </div>

        <div className="flex-1 w-full bg-muted/20 rounded overflow-hidden flex items-center justify-center my-1 relative min-h-[96px]">
          <NodePreview item={item} />
        </div>

        <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/50">
          <span className="text-[10px] text-muted-foreground font-medium">
            {item.type === "FOLDER" ? "Folder" : formatStorageSize(item.sizeBytes)}
          </span>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                disabled={isRemoving}
                onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors cursor-pointer"
              >
                {isRemoving ? (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <FolderMinus size={14} />
                )}
              </TooltipTrigger>
              <TooltipContent>Remove from Secure Folder</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </ContextMenuTrigger>
      
      <ContextMenuContent className="w-48 bg-card/85 backdrop-blur-md border border-border/80 shadow-lg rounded-xl p-1.5 animate-in fade-in-50 duration-100">
        <ContextMenuItem
          disabled={isRemoving}
          onClick={() => onRemove(item.id)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer"
        >
          <FolderMinus size={16} />
          <span>Remove from Secure Folder</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
