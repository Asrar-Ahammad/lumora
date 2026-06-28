"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Folder, HardDrive, CaretRight } from "@phosphor-icons/react"

interface FolderData {
  id: string
  name: string
  parentId: string | null
}

interface DestinationPickerModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (targetParentId: string | null) => void
  excludeFolderIds: string[]
  currentNodeName?: string | null
  title: string
  folders: FolderData[]
  actionLoading?: boolean
}

export function DestinationPickerModal({
  isOpen,
  onClose,
  onConfirm,
  excludeFolderIds,
  currentNodeName = null,
  title,
  folders,
  actionLoading = false,
}: DestinationPickerModalProps) {
  const [selectedFolderId, setSelectedFolderId] = React.useState<string | null>(null)
  const [expandedFolderIds, setExpandedFolderIds] = React.useState<Set<string>>(new Set())

  // 1. Calculate descendants to exclude if moving/copying a folder
  const excludedIds = React.useMemo(() => {
    const ids = new Set<string>()
    
    function recurse(id: string) {
      ids.add(id)
      const children = folders.filter((f) => f.parentId === id)
      for (const child of children) {
        recurse(child.id)
      }
    }

    for (const folderId of excludeFolderIds) {
      recurse(folderId)
    }

    return ids
  }, [excludeFolderIds, folders])

  // 2. Build the indented folder tree list
  const folderTree = React.useMemo(() => {
    const list: (FolderData & { depth: number; hasChildren: boolean })[] = []

    function build(parentId: string | null, depth: number) {
      const levelFolders = folders.filter(
        (f) => f.parentId === parentId && !excludedIds.has(f.id)
      )
      // Sort alphabetically by name
      levelFolders.sort((a, b) => a.name.localeCompare(b.name))

      for (const folder of levelFolders) {
        const hasChildren = folders.some((f) => f.parentId === folder.id && !excludedIds.has(f.id))
        list.push({ ...folder, depth, hasChildren })
        
        // Only recurse if expanded
        if (expandedFolderIds.has(folder.id)) {
          build(folder.id, depth + 1)
        }
      }
    }

    build(null, 0)
    return list
  }, [folders, excludedIds, expandedFolderIds])

  // Reset selection and collapse all folders by default on open
  React.useEffect(() => {
    if (isOpen) {
      setSelectedFolderId(null)
      setExpandedFolderIds(new Set())
    }
  }, [isOpen])

  const handleConfirm = () => {
    onConfirm(selectedFolderId)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border border-border shadow-xl rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-foreground flex items-center gap-2 select-none">
            {title}
          </DialogTitle>
          {currentNodeName && (
            <p className="text-xs text-muted-foreground mt-1 select-none">
              {title.startsWith("Move") ? "Moving" : "Copying"}: <strong className="text-foreground">{currentNodeName}</strong>
            </p>
          )}
        </DialogHeader>

        <div className="py-4">
          <p className="text-xs text-muted-foreground mb-3 select-none">
            Select a target destination folder:
          </p>

          <div className="max-h-64 overflow-y-auto border border-border rounded-xl bg-muted/20 p-2 space-y-1">
            {/* Root / My Drive Option */}
            <button
              onClick={() => setSelectedFolderId(null)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-left transition-all border cursor-pointer ${
                selectedFolderId === null
                  ? "bg-primary/10 border-primary/20 text-primary font-medium shadow-xs"
                  : "border-transparent text-foreground hover:bg-muted"
              }`}
            >
              <HardDrive size={18} weight={selectedFolderId === null ? "fill" : "regular"} />
              <span className="select-none">My Drive (Root)</span>
            </button>

            {/* Folder Tree Items */}
            {folderTree.map((folder) => {
              const isSelected = selectedFolderId === folder.id
              const isExpanded = expandedFolderIds.has(folder.id)
              return (
                <div
                  key={folder.id}
                  onClick={() => {
                    setSelectedFolderId(folder.id)
                    if (folder.hasChildren) {
                      setExpandedFolderIds((prev) => {
                        const next = new Set(prev)
                        if (next.has(folder.id)) {
                          next.delete(folder.id)
                        } else {
                          next.add(folder.id)
                        }
                        return next
                      })
                    }
                  }}
                  style={{ paddingLeft: `${(folder.depth + 1) * 12 + 12}px` }}
                  className={`w-full flex items-center gap-2 py-2 pr-3 text-sm rounded-lg text-left transition-all border relative group cursor-pointer ${
                    isSelected
                      ? "bg-primary/10 border-primary/20 text-primary font-medium shadow-xs"
                      : "border-transparent text-foreground hover:bg-muted"
                  }`}
                  role="button"
                >
                  {folder.hasChildren && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpandedFolderIds((prev) => {
                          const next = new Set(prev)
                          if (next.has(folder.id)) {
                            next.delete(folder.id)
                          } else {
                            next.add(folder.id)
                          }
                          return next
                        })
                      }}
                      className="absolute left-0 p-1 hover:bg-muted-foreground/10 rounded-sm z-10 transition-transform duration-150 cursor-pointer flex items-center justify-center"
                      style={{ left: `${folder.depth * 12 + 10}px`, width: "16px", height: "16px" }}
                    >
                      <CaretRight
                        size={10}
                        className={`text-muted-foreground/60 transition-transform ${
                          isExpanded ? "rotate-90" : ""
                        }`}
                      />
                    </button>
                  )}
                  <Folder
                    size={18}
                    weight={isSelected ? "fill" : "regular"}
                    className="text-yellow-500 flex-shrink-0"
                  />
                  <span className="truncate select-none">{folder.name}</span>
                </div>
              )
            })}

            {folderTree.length === 0 && (
              <div className="text-center py-8 text-xs text-muted-foreground select-none">
                No folders available.
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex justify-end gap-3 pt-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={actionLoading}
            className="text-xs px-4"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={actionLoading}
            className="text-xs px-4 bg-primary text-primary-foreground hover:bg-primary/95 shadow-sm"
          >
            {actionLoading ? (
              <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              "Confirm"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
