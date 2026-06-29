"use client"

import * as React from "react"
import { useCrypto } from "./crypto-provider"
import { decryptText } from "@/lib/crypto"
import { NodePreview } from "./node-preview"
import { FileViewer } from "./file-viewer"
import {
  Trash,
  ArrowCounterClockwise,
  TrashSimple,
  Folder,
  CaretRight,
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
} from "@phosphor-icons/react"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import { Image as ImageIcon } from "@phosphor-icons/react"

type TrashedNode = {
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
  trashedAt: string | null
  deletesAt: string | null
}

type DecryptedTrashedNode = TrashedNode & {
  name: string
  fileIv: string | null
  nodeKey: CryptoKey | null
  url?: string | null
}

interface TrashPanelProps {
  refreshTrigger: number
  onRefresh: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatStorageSize(bytesStr: string | null) {
  if (!bytesStr) return "—"
  const bytes = parseInt(bytesStr)
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

function getTimeLeft(deletesAt: string | null): { label: string; urgent: boolean } {
  if (!deletesAt) return { label: "Unknown", urgent: false }
  const diff = new Date(deletesAt).getTime() - Date.now()
  if (diff <= 0) return { label: "Deleting soon", urgent: true }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days === 0 && hours === 0) return { label: "< 1 hour", urgent: true }
  if (days === 0) return { label: `${hours}h left`, urgent: true }
  if (days <= 3) return { label: `${days}d left`, urgent: true }
  return { label: `${days}d left`, urgent: false }
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

// ── Main Component ────────────────────────────────────────────────────────────

export function TrashPanel({ refreshTrigger, onRefresh }: TrashPanelProps) {
  const { decryptNodeKeyCascade, isReady } = useCrypto()
  const { toast } = useToast()
  const [items, setItems] = React.useState<TrashedNode[]>([])
  const [foldersMap, setFoldersMap] = React.useState<Map<string, any>>(new Map())
  const [decryptedItems, setDecryptedItems] = React.useState<DecryptedTrashedNode[]>([])
  const [loading, setLoading] = React.useState(true)
  const [actionLoading, setActionLoading] = React.useState<string | null>(null)
  const [emptyDialogOpen, setEmptyDialogOpen] = React.useState(false)
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("list")
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = React.useState(false)

  const [currentFolderId, setCurrentFolderId] = React.useState<string | null>(null)
  const prevFolderId = React.useRef<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = React.useState<{id: string, name: string}[]>([])
  const [viewerNode, setViewerNode] = React.useState<DecryptedTrashedNode | null>(null)

  const handleLoadMore = React.useCallback(() => {
    if ((window as any)._loadMoreTrashFiles) {
      ;(window as any)._loadMoreTrashFiles()
    }
  }, [])

  const observerRef = React.useRef<IntersectionObserver | null>(null)
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
    const saved = localStorage.getItem("lumora-view-mode") as "grid" | "list";
    if (saved === "grid" || saved === "list") setViewMode(saved);
  }, []);
  const fetchTrash = React.useCallback(async (cursor: string | null = null, isLoadMore: boolean = false) => {
    if (!isReady) return
    if (isLoadMore) {
      setIsLoadingMore(true)
    } else {
      if (prevFolderId.current !== currentFolderId) {
        setItems([])
        setDecryptedItems([])
        setNextCursor(null)
      }
      setLoading(true)
      prevFolderId.current = currentFolderId
    }
    try {
      let endpoint = "/api/nodes/trash?limit=50"
      if (currentFolderId) {
        endpoint += `&folderId=${currentFolderId}`
      }
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
      console.error("Failed to fetch trash", err)
    } finally {
      setLoading(false)
      setIsLoadingMore(false)
    }
  }, [isReady, currentFolderId])

  React.useEffect(() => {
    fetchTrash()
  }, [fetchTrash, refreshTrigger, currentFolderId])

  const handleNodeClick = (item: DecryptedTrashedNode) => {
    if (item.type === "FOLDER") {
      setCurrentFolderId(item.id)
      setBreadcrumbs(prev => [...prev, { id: item.id, name: item.name }])
    } else {
      setViewerNode(item)
    }
  }

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      setCurrentFolderId(null)
      setBreadcrumbs([])
    } else {
      const crumb = breadcrumbs[index]
      setCurrentFolderId(crumb.id)
      setBreadcrumbs(breadcrumbs.slice(0, index + 1))
    }
  }

  React.useEffect(() => {
    ;(window as any)._loadMoreTrashFiles = () => {
      if (nextCursor && !isLoadingMore) {
        fetchTrash(nextCursor, true)
      }
    }
    return () => {
      delete (window as any)._loadMoreTrashFiles
    }
  }, [fetchTrash, nextCursor, isLoadingMore])

  // ── Decrypt node names client-side ──────────────────────────────────────
  React.useEffect(() => {
    if (!isReady || !items.length) {
      setDecryptedItems([])
      return
    }
    let active = true
    async function decryptAll() {
      const list: DecryptedTrashedNode[] = []
      for (const item of items) {
        try {
          const key = await decryptNodeKeyCascade(item, foldersMap)
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
          console.error("Decryption failed for trashed item", item.id, err)
          list.push({ ...item, name: "Encrypted File", fileIv: null, nodeKey: null })
        }
      }
      if (active) setDecryptedItems(list)
    }
    decryptAll()
    return () => { active = false }
  }, [items, foldersMap, decryptNodeKeyCascade, isReady])

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleRestore = async (id: string) => {
    setActionLoading(id + "-restore")
    try {
      const res = await fetch(`/api/nodes/trash?id=${id}`, { method: "PATCH" })
      if (res.ok) {
        onRefresh()
        toast({
          title: (
            <span className="flex items-center gap-2">
              <CheckCircle size={16} weight="fill" className="text-emerald-500" />
              Item restored
            </span>
          ),
          description: "The item has been restored to your drive.",
        })
      } else {
        toast({
          title: (
            <span className="flex items-center gap-2">
              <XCircle size={16} weight="fill" className="text-destructive" />
              Failed to restore item
            </span>
          ),
          description: "Could not restore the item.",
          variant: "destructive",
        })
      }
    } catch (err) {
      console.error("Restore failed", err)
      toast({
        title: (
          <span className="flex items-center gap-2">
            <XCircle size={16} weight="fill" className="text-destructive" />
            Failed to restore item
          </span>
        ),
        description: "An unexpected error occurred.",
        variant: "destructive",
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeleteForever = async (id: string) => {
    setActionLoading(id + "-delete")
    try {
      const res = await fetch(`/api/nodes/trash?id=${id}`, { method: "DELETE" })
      if (res.ok) {
        onRefresh()
        toast({
          title: (
            <span className="flex items-center gap-2">
              <CheckCircle size={16} weight="fill" className="text-emerald-500" />
              Item deleted
            </span>
          ),
          description: "The item has been permanently deleted.",
        })
      } else {
        toast({
          title: (
            <span className="flex items-center gap-2">
              <XCircle size={16} weight="fill" className="text-destructive" />
              Failed to delete item
            </span>
          ),
          description: "Could not permanently delete the item.",
          variant: "destructive",
        })
      }
    } catch (err) {
      console.error("Permanent delete failed", err)
      toast({
        title: (
          <span className="flex items-center gap-2">
            <XCircle size={16} weight="fill" className="text-destructive" />
            Failed to delete item
          </span>
        ),
        description: "An unexpected error occurred.",
        variant: "destructive",
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleEmptyTrash = async () => {
    setActionLoading("empty")
    setEmptyDialogOpen(false)
    try {
      const res = await fetch("/api/nodes/trash?all=true", { method: "DELETE" })
      if (res.ok) {
        onRefresh()
        toast({
          title: (
            <span className="flex items-center gap-2">
              <CheckCircle size={16} weight="fill" className="text-emerald-500" />
              Trash cleared
            </span>
          ),
          description: "All trashed items have been permanently deleted.",
        })
      } else {
        toast({
          title: (
            <span className="flex items-center gap-2">
              <XCircle size={16} weight="fill" className="text-destructive" />
              Failed to clear trash
            </span>
          ),
          description: "Could not empty the trash.",
          variant: "destructive",
        })
      }
    } catch (err) {
      console.error("Empty trash failed", err)
      toast({
        title: (
          <span className="flex items-center gap-2">
            <XCircle size={16} weight="fill" className="text-destructive" />
            Failed to clear trash
          </span>
        ),
        description: "An unexpected error occurred.",
        variant: "destructive",
      })
    } finally {
      setActionLoading(null)
    }
  }

  const hasUrgent = decryptedItems.some((item) => getTimeLeft(item.deletesAt).urgent)

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-destructive/10 rounded-lg">
            <Trash size={22} weight="fill" className="text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight flex items-center gap-2">
              <span 
                className={`cursor-pointer hover:underline ${breadcrumbs.length > 0 ? "text-muted-foreground hover:text-foreground" : ""}`}
                onClick={() => handleBreadcrumbClick(-1)}
              >
                Trash
              </span>
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.id}>
                  <CaretRight size={14} className="text-muted-foreground" />
                  <span 
                    className={`cursor-pointer hover:underline max-w-[120px] truncate ${idx === breadcrumbs.length - 1 ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => handleBreadcrumbClick(idx)}
                    title={crumb.name}
                  >
                    {crumb.name}
                  </span>
                </React.Fragment>
              ))}
              {decryptedItems.length > 0 && (
                <Badge variant="secondary" className="text-xs font-medium ml-2">
                  {decryptedItems.length}
                </Badge>
              )}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Files are permanently deleted after 30 days
            </p>
          </div>
        </div>

        {decryptedItems.length > 0 && (
          <div className="flex items-center justify-between w-full md:justify-end gap-2">
            {/* View Mode Toggle */}
            <div className="flex bg-muted/50 p-1 rounded-lg border border-border">
              <button
                onClick={() => { setViewMode("list"); localStorage.setItem("lumora-view-mode", "list"); }}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === "list"
                    ? "bg-card text-primary shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:bg-muted border-transparent cursor-pointer"
                }`}
                title="List view"
              >
                <ListDashes size={16} />
              </button>
              <button
                onClick={() => { setViewMode("grid"); localStorage.setItem("lumora-view-mode", "grid"); }}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === "grid"
                    ? "bg-card text-primary shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:bg-muted border-transparent cursor-pointer"
                }`}
                title="Grid view"
              >
                <GridNine size={16} />
              </button>
            </div>

            <button
              onClick={() => setEmptyDialogOpen(true)}
              disabled={actionLoading === "empty"}
              className="flex items-center gap-2 px-3 py-2 text-white dark:bg-red-800 text-sm font-medium rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50 dark:hover:bg-red-500/90 cursor-pointer"
            >
              <TrashSimple size={16} weight="fill" />
              {actionLoading === "empty" ? "Emptying…" : "Empty Trash"}
            </button>

            {/* Empty trash confirmation dialog (controlled) */}
            <AlertDialog open={emptyDialogOpen} onOpenChange={setEmptyDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    <span className="flex items-center gap-2">
                      <Warning size={20} className="text-destructive" weight="fill" />
                      Empty Trash?
                    </span>
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all{" "}
                    <strong className="text-foreground">{decryptedItems.length} item{decryptedItems.length !== 1 ? "s" : ""}</strong>{" "}
                    in your Trash. This action{" "}
                    <strong className="text-destructive">cannot be undone</strong>.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleEmptyTrash}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Yes, Empty Trash
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {/* Urgent warning banner */}
      {hasUrgent && (
        <div className="mb-4 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-medium">
          <Warning size={16} weight="fill" className="shrink-0" />
          Some items will be permanently deleted soon. Restore them if you need them.
        </div>
      )}

      {/* Content */}
      {loading && decryptedItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-20 text-muted-foreground">
          <Trash size={40} className="opacity-30 mb-3 animate-pulse" />
          <p className="text-sm animate-pulse">Loading trash…</p>
        </div>
      ) : decryptedItems.length === 0 ? (
        <EmptyTrash />
      ) : viewMode === "grid" ? (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {decryptedItems.map((item) => (
              <TrashCard
                key={item.id}
                item={item}
                actionLoading={actionLoading}
                onRestore={handleRestore}
                onDeleteForever={handleDeleteForever}
                onClick={() => handleNodeClick(item)}
              />
            ))}
          </div>
          {nextCursor && (
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
                <th className="px-5 py-3.5 hidden md:table-cell">Trashed On</th>
                <th className="px-5 py-3.5 whitespace-nowrap">
                  <span className="flex items-center gap-1">
                    Expires
                  </span>
                </th>
                <th className="px-5 py-3.5 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {decryptedItems.map((item) => (
                <TrashRow
                  key={item.id}
                  item={item}
                  actionLoading={actionLoading}
                  onRestore={handleRestore}
                  onDeleteForever={handleDeleteForever}
                  onClick={() => handleNodeClick(item)}
                />
              ))}
            </tbody>
          </table>
          {nextCursor && (
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
          )}
        </div>
      )}

      {viewerNode && viewerNode.nodeKey && (
        <FileViewer
          isOpen={!!viewerNode}
          onClose={() => setViewerNode(null)}
          node={viewerNode as any}
          nodeKey={viewerNode.nodeKey}
        />
      )}
    </div>
  )
}

// ── Trash Row ─────────────────────────────────────────────────────────────────

function TrashRow({
  item,
  actionLoading,
  onRestore,
  onDeleteForever,
  onClick,
}: {
  item: DecryptedTrashedNode
  actionLoading: string | null
  onRestore: (id: string) => void
  onDeleteForever: (id: string) => void
  onClick: () => void
}) {
  const { label, urgent } = getTimeLeft(item.deletesAt)
  const isRestoring = actionLoading === item.id + "-restore"
  const isDeleting = actionLoading === item.id + "-delete"
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <tr className="hover:bg-muted/30 transition-colors group cursor-pointer" onClick={onClick} />
        }
      >
        {/* Name */}
        <td className="px-5 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-1.5 bg-muted rounded-md flex-shrink-0 opacity-60">
              {item.type === "FOLDER" ? (
                <Folder weight="fill" size={18} className="text-yellow-500" />
              ) : (
                getFileIcon(item.mimeType, item.name)
              )}
            </div>
            <span
              className="text-sm font-medium text-foreground/70 truncate max-w-[160px] md:max-w-xs select-none"
              title={item.name}
            >
              {item.name}
            </span>
          </div>
        </td>

        {/* Type */}
        <td className="px-5 py-3.5 text-xs text-muted-foreground hidden sm:table-cell">
          {item.type === "FOLDER" ? "Folder" : item.mimeType?.split("/")[1]?.toUpperCase() || "File"}
        </td>

        {/* Size */}
        <td className="px-5 py-3.5 text-xs text-muted-foreground hidden md:table-cell">
          {item.type === "FOLDER" ? "—" : formatStorageSize(item.sizeBytes)}
        </td>

        {/* Trashed On */}
        <td className="px-5 py-3.5 text-xs text-muted-foreground hidden md:table-cell">
          {item.trashedAt ? new Date(item.trashedAt).toLocaleDateString() : "—"}
        </td>

        {/* Auto-Delete countdown */}
        <td className="px-5 py-3.5 whitespace-nowrap">
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${
              urgent
                ? "bg-destructive/10 text-destructive border-destructive/20"
                : "bg-muted text-muted-foreground border-transparent"
            }`}
          >
            <Clock size={11} weight={urgent ? "fill" : "regular"} />
            {label}
          </span>
        </td>

        {/* Actions */}
        <td className="px-5 py-3.5 text-right">
          <div className="flex items-center justify-end gap-1.5">
            {/* Restore button */}
            <Tooltip>
              <TooltipTrigger
                disabled={isRestoring || isDeleting}
                onClick={(e) => { e.stopPropagation(); onRestore(item.id); }}
                className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 cursor-pointer"
                aria-label="Restore"
              >
                {isRestoring ? (
                  <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ArrowCounterClockwise size={16} weight="bold" />
                )}
              </TooltipTrigger>
              <TooltipContent>Restore</TooltipContent>
            </Tooltip>

            {/* Delete Forever button */}
            <Tooltip>
              <TooltipTrigger
                disabled={isRestoring || isDeleting}
                onClick={(e) => { e.stopPropagation(); setDeleteDialogOpen(true); }}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40 cursor-pointer"
                aria-label="Delete Forever"
              >
                {isDeleting ? (
                  <span className="inline-block w-4 h-4 border-2 border-destructive border-t-transparent rounded-full animate-spin" />
                ) : (
                  <TrashSimple size={16} weight="bold" />
                )}
              </TooltipTrigger>
              <TooltipContent>Delete Forever</TooltipContent>
            </Tooltip>
          </div>
        </td>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48 bg-card/85 backdrop-blur-md border border-border/80 shadow-lg rounded-xl p-1.5 animate-in fade-in-50 duration-100 select-none">
        <ContextMenuItem
          disabled={isRestoring || isDeleting}
          onClick={() => onRestore(item.id)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <ArrowCounterClockwise size={16} />
          <span>Restore</span>
        </ContextMenuItem>
        <ContextMenuSeparator className="-mx-1.5 my-1 h-px bg-border/50" />
        <ContextMenuItem
          disabled={isRestoring || isDeleting}
          onClick={() => setDeleteDialogOpen(true)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-destructive/10 hover:text-destructive text-destructive cursor-pointer transition-colors"
        >
          <TrashSimple size={16} />
          <span>Delete Forever</span>
        </ContextMenuItem>
      </ContextMenuContent>

      {/* Delete forever confirmation dialog (controlled) */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <span className="flex items-center gap-2">
                <Warning size={20} className="text-destructive" weight="fill" />
                Delete Forever?
              </span>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong className="text-foreground select-none">&ldquo;{item.name}&rdquo;</strong> will be permanently
              deleted and{" "}
              <strong className="text-destructive">cannot be recovered</strong>. The encrypted
              file will be removed from storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDeleteForever(item.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContextMenu>
  )
}

// ── Trash Card ────────────────────────────────────────────────────────────────

function TrashCard({
  item,
  actionLoading,
  onRestore,
  onDeleteForever,
  onClick,
}: {
  item: DecryptedTrashedNode
  actionLoading: string | null
  onRestore: (id: string) => void
  onDeleteForever: (id: string) => void
  onClick: () => void
}) {
  const { label, urgent } = getTimeLeft(item.deletesAt)
  const isRestoring = actionLoading === item.id + "-restore"
  const isDeleting = actionLoading === item.id + "-delete"
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div className="group border rounded-2xl p-3 bg-card hover:shadow-md transition-all cursor-pointer flex flex-col gap-3 min-w-0 border-border hover:border-primary/50 relative" onClick={onClick} />
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

        {/* Middle Area: File Preview */}
        <div className="flex-1 w-full bg-muted/20 rounded overflow-hidden flex items-center justify-center my-1 relative min-h-[96px]">
          <NodePreview item={item} />
        </div>

        <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/50">
          <span
            className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
              urgent
                ? "bg-destructive/10 text-destructive border-destructive/20"
                : "bg-muted text-muted-foreground border-transparent"
            }`}
          >
            <Clock size={11} weight={urgent ? "fill" : "regular"} />
            {label}
          </span>
          
          <div className="flex items-center gap-1">
            {/* Restore button */}
            <Tooltip>
              <TooltipTrigger
                disabled={isRestoring || isDeleting}
                onClick={(e) => { e.stopPropagation(); onRestore(item.id); }}
                className="p-1 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 cursor-pointer"
                aria-label="Restore"
              >
                {isRestoring ? (
                  <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ArrowCounterClockwise size={14} weight="bold" />
                )}
              </TooltipTrigger>
              <TooltipContent>Restore</TooltipContent>
            </Tooltip>

            {/* Delete Forever button */}
            <Tooltip>
              <TooltipTrigger
                disabled={isRestoring || isDeleting}
                onClick={(e) => { e.stopPropagation(); setDeleteDialogOpen(true); }}
                className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40 cursor-pointer"
                aria-label="Delete Forever"
              >
                {isDeleting ? (
                  <span className="inline-block w-4 h-4 border-2 border-destructive border-t-transparent rounded-full animate-spin" />
                ) : (
                  <TrashSimple size={14} weight="bold" />
                )}
              </TooltipTrigger>
              <TooltipContent>Delete Forever</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48 bg-card/85 backdrop-blur-md border border-border/80 shadow-lg rounded-xl p-1.5 animate-in fade-in-50 duration-100 select-none">
        <ContextMenuItem
          disabled={isRestoring || isDeleting}
          onClick={() => onRestore(item.id)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-muted text-foreground cursor-pointer transition-colors"
        >
          <ArrowCounterClockwise size={16} />
          <span>Restore</span>
        </ContextMenuItem>
        <ContextMenuSeparator className="-mx-1.5 my-1 h-px bg-border/50" />
        <ContextMenuItem
          disabled={isRestoring || isDeleting}
          onClick={() => setDeleteDialogOpen(true)}
          className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg hover:bg-destructive/10 hover:text-destructive text-destructive cursor-pointer transition-colors"
        >
          <TrashSimple size={16} />
          <span>Delete Forever</span>
        </ContextMenuItem>
      </ContextMenuContent>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <span className="flex items-center gap-2">
                <Warning size={20} className="text-destructive" weight="fill" />
                Delete Forever?
              </span>
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong className="text-foreground">{item.name}</strong>.
              This action <strong className="text-destructive">cannot be undone</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDeleteForever(item.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContextMenu>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyTrash() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 py-24 text-center">
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-full bg-muted/60 flex items-center justify-center">
          <Trash size={44} weight="thin" className="text-muted-foreground/50" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border-2 border-background">
          <span className="text-xs font-bold text-primary">0</span>
        </div>
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1.5">Trash is Empty</h3>
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
        Files you delete will appear here. They are automatically removed after{" "}
        <span className="font-medium text-foreground">30 days</span>.
      </p>
    </div>
  )
}
