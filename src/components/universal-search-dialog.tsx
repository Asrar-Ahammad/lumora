"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useCrypto } from "./crypto-provider"
import { decryptText } from "@/lib/crypto"
import {
  MagnifyingGlassIcon,
  Folder,
  File,
  FilePdf,
  FileAudio,
  FileVideo,
  FileCode,
  FileText,
  FileDoc,
  FileXls,
  FilePpt,
  FileZip,
  Image as ImageIcon,
  Clock,
  ArrowRight,
  X
} from "@phosphor-icons/react"

interface UniversalSearchDialogProps {
  isOpen: boolean
  onClose: () => void
  onNavigate: (folderId: string, folderName: string, folderKey?: CryptoKey) => void
  onOpenViewer: (node: any, nodeKey: CryptoKey, name: string, fileIv: string) => void
  decryptedSearchNodes: SearchItem[]
  decFoldersMap: Map<string, any>
  indexing: boolean
  loadSearchIndex: () => void
}

type SearchItem = {
  id: string
  name: string
  type: "FILE" | "FOLDER"
  parentId: string | null
  mimeType: string | null
  sizeBytes: string | null
  createdAt: string
  nodeKey: CryptoKey
  fileIv?: string
  r2Key?: string
  url?: string
}

export function UniversalSearchDialog({
  isOpen,
  onClose,
  onNavigate,
  onOpenViewer,
  decryptedSearchNodes,
  decFoldersMap,
  indexing,
  loadSearchIndex
}: UniversalSearchDialogProps) {
  const [query, setQuery] = React.useState("")
  
  // Filters state
  const [filterType, setFilterType] = React.useState<"all" | "file" | "folder">("all")
  const [filterCategory, setFilterCategory] = React.useState<"all" | "doc" | "image" | "video" | "audio">("all")
  const [filterDate, setFilterDate] = React.useState<"all" | "today" | "week" | "month">("all")
  const [filterSize, setFilterSize] = React.useState<"all" | "small" | "medium" | "large">("all")
  
  // Keyboard Selection index
  const [selectedIdx, setSelectedIdx] = React.useState(0)
  const listRef = React.useRef<HTMLDivElement>(null)

  // Fetch & Decrypt Index on modal open
  React.useEffect(() => {
    if (isOpen) {
      loadSearchIndex()
    }
  }, [isOpen, loadSearchIndex])

  // Reset keyboard cursor on query/filters update
  React.useEffect(() => {
    setSelectedIdx(0)
  }, [query, filterType, filterCategory, filterDate, filterSize])

  // Get Breadcrumb path
  const getBreadcrumbPath = React.useCallback((parentId: string | null): string => {
    const crumbs: string[] = []
    let currentId = parentId
    while (currentId) {
      const folder = decFoldersMap.get(currentId)
      if (!folder) break
      crumbs.unshift(folder.name)
      currentId = folder.parentId
    }
    return crumbs.length > 0 ? crumbs.join(" / ") : ""
  }, [decFoldersMap])

  // Filter criteria execution
  const filteredResults = React.useMemo(() => {
    return decryptedSearchNodes.filter((node) => {
      // 1. Text Query Filter
      if (query.trim() !== "") {
        const matchesName = node.name.toLowerCase().includes(query.toLowerCase())
        const pathStr = getBreadcrumbPath(node.parentId).toLowerCase()
        const matchesPath = pathStr.includes(query.toLowerCase())
        if (!matchesName && !matchesPath) return false
      }

      // 2. Type Filter
      if (filterType === "file" && node.type !== "FILE") return false
      if (filterType === "folder" && node.type !== "FOLDER") return false

      // 3. Category Filter (for files)
      if (node.type === "FILE" && filterCategory !== "all") {
        const mime = node.mimeType || ""
        const ext = node.name.split(".").pop()?.toLowerCase() || ""
        
        if (filterCategory === "image" && !mime.startsWith("image/")) return false
        if (filterCategory === "video" && !mime.startsWith("video/")) return false
        if (filterCategory === "audio" && !mime.startsWith("audio/")) return false
        if (filterCategory === "doc") {
          const isDoc = mime.startsWith("text/") || 
                        mime === "application/pdf" ||
                        ext === "pdf" || ext === "docx" || ext === "doc" ||
                        ext === "xlsx" || ext === "xls" || ext === "pptx" || ext === "ppt" ||
                        ext === "txt" || ext === "md"
          if (!isDoc) return false
        }
      }

      // 4. Date Created Filter
      if (filterDate !== "all") {
        const nodeTime = new Date(node.createdAt).getTime()
        const now = Date.now()
        if (filterDate === "today") {
          const startOfToday = new Date().setHours(0,0,0,0)
          if (nodeTime < startOfToday) return false
        } else if (filterDate === "week") {
          const startOfWeek = now - 7 * 24 * 60 * 60 * 1000
          if (nodeTime < startOfWeek) return false
        } else if (filterDate === "month") {
          const startOfMonth = now - 30 * 24 * 60 * 60 * 1000
          if (nodeTime < startOfMonth) return false
        }
      }

      // 5. Size Filter
      if (filterSize !== "all" && node.type === "FILE") {
        const sizeBytes = node.sizeBytes ? parseInt(node.sizeBytes, 10) : 0
        if (filterSize === "small" && sizeBytes >= 10 * 1024 * 1024) return false
        if (filterSize === "medium" && (sizeBytes < 10 * 1024 * 1024 || sizeBytes > 100 * 1024 * 1024)) return false
        if (filterSize === "large" && sizeBytes <= 100 * 1024 * 1024) return false
      }

      return true
    })
  }, [decryptedSearchNodes, query, filterType, filterCategory, filterDate, filterSize, getBreadcrumbPath])

  // Select node action handler
  const handleSelectNode = (node: SearchItem) => {
    if (node.type === "FOLDER") {
      onNavigate(node.id, node.name, node.nodeKey)
      onClose()
    } else {
      if (node.nodeKey && node.fileIv) {
        onOpenViewer(node, node.nodeKey, node.name, node.fileIv)
        onClose()
      }
    }
  }

  // Keyboard navigation listener
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredResults.length === 0) return
    
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIdx((prev) => (prev + 1) % filteredResults.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIdx((prev) => (prev - 1 + filteredResults.length) % filteredResults.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      const selectedItem = filteredResults[selectedIdx]
      if (selectedItem) {
        handleSelectNode(selectedItem)
      }
    }
  }

  // Auto-scroll selected element into viewport view
  React.useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.children[selectedIdx] as HTMLElement
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest" })
      }
    }
  }, [selectedIdx])

  const renderIcon = (type: "FILE" | "FOLDER", mimeType: string | null, name: string) => {
    if (type === "FOLDER") return <Folder size={20} className="text-yellow-500" weight="fill" />
    
    const ext = name.split(".").pop()?.toLowerCase()
    
    if (ext === "pptx" || ext === "ppt" || ext === "odp" || mimeType === "application/vnd.ms-powerpoint") {
      return <FilePpt size={20} className="text-orange-500" weight="fill" />
    }
    if (ext === "xlsx" || ext === "xls" || ext === "ods" || mimeType === "application/vnd.ms-excel") {
      return <FileXls size={20} className="text-emerald-500" weight="fill" />
    }
    if (ext === "docx" || ext === "doc" || ext === "odt" || mimeType === "application/msword") {
      return <FileDoc size={20} className="text-blue-500" weight="fill" />
    }
    if (ext === "zip" || ext === "rar" || ext === "7z" || ext === "tar") {
      return <FileZip size={20} className="text-yellow-600" weight="fill" />
    }
    if (mimeType) {
      if (mimeType.startsWith("image/")) return <ImageIcon size={20} className="text-purple-500" weight="fill" />
      if (mimeType.startsWith("video/")) return <FileVideo size={20} className="text-rose-500" weight="fill" />
      if (mimeType.startsWith("audio/")) return <FileAudio size={20} className="text-sky-500" weight="fill" />
      if (mimeType === "application/pdf") return <FilePdf size={20} className="text-red-500" weight="fill" />
    }
    return <File size={20} className="text-muted-foreground/60" />
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden bg-background/95 dark:bg-neutral-950/95 border border-border shadow-2xl backdrop-blur-md rounded-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Universal Search</DialogTitle>
        </DialogHeader>

        {/* Input box */}
        <div 
          className="flex items-center gap-3 px-4 py-3.5 border-b border-border/80"
          onKeyDown={handleKeyDown}
        >
          <MagnifyingGlassIcon size={22} className="text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files, folders and locations..."
            className="flex-1 bg-transparent border-0 outline-none text-foreground placeholder-muted-foreground text-base focus:ring-0 focus:border-0"
            autoFocus
          />
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              ESC
            </kbd>
            <button 
              onClick={onClose} 
              className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col gap-2 p-3 bg-muted/20 border-b border-border/60">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {/* Filter: Type */}
            <span className="text-muted-foreground font-medium pr-1">Type:</span>
            <button
              onClick={() => setFilterType("all")}
              className={`px-2 py-0.5 rounded-full border transition-colors ${filterType === "all" ? "bg-primary border-primary text-primary-foreground font-semibold" : "border-border hover:bg-muted text-muted-foreground"}`}
            >
              All
            </button>
            <button
              onClick={() => setFilterType("file")}
              className={`px-2 py-0.5 rounded-full border transition-colors ${filterType === "file" ? "bg-primary border-primary text-primary-foreground font-semibold" : "border-border hover:bg-muted text-muted-foreground"}`}
            >
              Files
            </button>
            <button
              onClick={() => setFilterType("folder")}
              className={`px-2 py-0.5 rounded-full border transition-colors ${filterType === "folder" ? "bg-primary border-primary text-primary-foreground font-semibold" : "border-border hover:bg-muted text-muted-foreground"}`}
            >
              Folders
            </button>

            {/* Filter: Size */}
            {filterType !== "folder" && (
              <>
                <div className="h-3 w-px bg-border/80 mx-1" />
                <span className="text-muted-foreground font-medium pr-1">Size:</span>
                <button
                  onClick={() => setFilterSize("all")}
                  className={`px-2 py-0.5 rounded-full border transition-colors ${filterSize === "all" ? "bg-primary border-primary text-primary-foreground font-semibold" : "border-border hover:bg-muted text-muted-foreground"}`}
                >
                  Any Size
                </button>
                <button
                  onClick={() => setFilterSize("small")}
                  className={`px-2 py-0.5 rounded-full border transition-colors ${filterSize === "small" ? "bg-primary border-primary text-primary-foreground font-semibold" : "border-border hover:bg-muted text-muted-foreground"}`}
                >
                  &lt; 10MB
                </button>
                <button
                  onClick={() => setFilterSize("medium")}
                  className={`px-2 py-0.5 rounded-full border transition-colors ${filterSize === "medium" ? "bg-primary border-primary text-primary-foreground font-semibold" : "border-border hover:bg-muted text-muted-foreground"}`}
                >
                  10MB - 100MB
                </button>
                <button
                  onClick={() => setFilterSize("large")}
                  className={`px-2 py-0.5 rounded-full border transition-colors ${filterSize === "large" ? "bg-primary border-primary text-primary-foreground font-semibold" : "border-border hover:bg-muted text-muted-foreground"}`}
                >
                  &gt; 100MB
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            {/* Filter: Category (only when Files or All) */}
            {filterType !== "folder" && (
              <>
                <span className="text-muted-foreground font-medium pr-1">Category:</span>
                <button
                  onClick={() => setFilterCategory("all")}
                  className={`px-2 py-0.5 rounded-full border transition-colors ${filterCategory === "all" ? "bg-primary border-primary text-primary-foreground font-semibold" : "border-border hover:bg-muted text-muted-foreground"}`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilterCategory("doc")}
                  className={`px-2 py-0.5 rounded-full border transition-colors ${filterCategory === "doc" ? "bg-primary border-primary text-primary-foreground font-semibold" : "border-border hover:bg-muted text-muted-foreground"}`}
                >
                  Docs
                </button>
                <button
                  onClick={() => setFilterCategory("image")}
                  className={`px-2 py-0.5 rounded-full border transition-colors ${filterCategory === "image" ? "bg-primary border-primary text-primary-foreground font-semibold" : "border-border hover:bg-muted text-muted-foreground"}`}
                >
                  Images
                </button>
                <button
                  onClick={() => setFilterCategory("video")}
                  className={`px-2 py-0.5 rounded-full border transition-colors ${filterCategory === "video" ? "bg-primary border-primary text-primary-foreground font-semibold" : "border-border hover:bg-muted text-muted-foreground"}`}
                >
                  Videos
                </button>
                <button
                  onClick={() => setFilterCategory("audio")}
                  className={`px-2 py-0.5 rounded-full border transition-colors ${filterCategory === "audio" ? "bg-primary border-primary text-primary-foreground font-semibold" : "border-border hover:bg-muted text-muted-foreground"}`}
                >
                  Audio
                </button>
              </>
            )}

            {/* Filter: Created Date */}
            <div className="h-3 w-px bg-border/80 mx-1" />
            <span className="text-muted-foreground font-medium pr-1">Created:</span>
            <button
              onClick={() => setFilterDate("all")}
              className={`px-2 py-0.5 rounded-full border transition-colors ${filterDate === "all" ? "bg-primary border-primary text-primary-foreground font-semibold" : "border-border hover:bg-muted text-muted-foreground"}`}
            >
              Any Time
            </button>
            <button
              onClick={() => setFilterDate("today")}
              className={`px-2 py-0.5 rounded-full border transition-colors ${filterDate === "today" ? "bg-primary border-primary text-primary-foreground font-semibold" : "border-border hover:bg-muted text-muted-foreground"}`}
            >
              Today
            </button>
            <button
              onClick={() => setFilterDate("week")}
              className={`px-2 py-0.5 rounded-full border transition-colors ${filterDate === "week" ? "bg-primary border-primary text-primary-foreground font-semibold" : "border-border hover:bg-muted text-muted-foreground"}`}
            >
              Past Week
            </button>
            <button
              onClick={() => setFilterDate("month")}
              className={`px-2 py-0.5 rounded-full border transition-colors ${filterDate === "month" ? "bg-primary border-primary text-primary-foreground font-semibold" : "border-border hover:bg-muted text-muted-foreground"}`}
            >
              Past Month
            </button>
          </div>
        </div>

        {/* Results Container */}
        <div className="max-h-[380px] min-h-[180px] overflow-y-auto p-2" onKeyDown={handleKeyDown}>
          {indexing ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">Indexing and decrypting storage...</span>
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MagnifyingGlassIcon size={32} className="text-muted-foreground/45 mb-2" />
              <span className="text-sm font-medium text-muted-foreground">No matches found</span>
              <span className="text-xs text-muted-foreground/60">Try searching for other keywords or clearing active filters</span>
            </div>
          ) : (
            <div ref={listRef} className="flex flex-col gap-0.5">
              {filteredResults.map((item, index) => {
                const isActive = index === selectedIdx
                const path = getBreadcrumbPath(item.parentId)
                
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectNode(item)}
                    onMouseEnter={() => setSelectedIdx(index)}
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50 text-foreground"}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-1.5 bg-muted dark:bg-neutral-900 rounded-md shrink-0">
                        {renderIcon(item.type, item.mimeType, item.name)}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm truncate pr-2">{item.name}</span>
                        {path && (
                          <span className="text-[10px] text-muted-foreground/75 truncate">
                            in {path}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 select-none">
                      {item.type === "FOLDER" ? (
                        <span className="text-[10px] uppercase font-semibold tracking-wider bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 px-1.5 py-0.5 rounded">
                          Folder
                        </span>
                      ) : (
                        item.sizeBytes && (
                          <span className="text-[11px]">
                            {Math.round(parseInt(item.sizeBytes, 10) / (1024 * 1024) * 100) / 100} MB
                          </span>
                        )
                      )}
                      
                      {isActive && (
                        <ArrowRight size={14} className="text-primary animate-in fade-in slide-in-from-left-2 duration-100" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/30 text-[11px] text-muted-foreground select-none">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded border bg-background px-1 py-0.5 font-mono">↑↓</kbd> to navigate
            </span>
            <span>
              <kbd className="rounded border bg-background px-1 py-0.5 font-mono">Enter</kbd> to open
            </span>
          </div>
          <div>
            <span>
              <kbd className="rounded border bg-background px-1 py-0.5 font-mono">⌘K</kbd> to toggle
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
