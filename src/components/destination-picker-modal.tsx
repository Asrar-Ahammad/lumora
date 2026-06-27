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
  currentNodeId: string | null
  currentNodeType: "FOLDER" | "FILE" | null
  title: string
  folders: FolderData[]
  actionLoading?: boolean
}

export function DestinationPickerModal({
  isOpen,
  onClose,
  onConfirm,
  currentNodeId,
  currentNodeType,
  title,
  folders,
  actionLoading = false,
}: DestinationPickerModalProps) {
  const [selectedFolderId, setSelectedFolderId] = React.useState<string | null>(null)

  // 1. Calculate descendants to exclude if moving/copying a folder
  const excludedIds = React.useMemo(() => {
    const ids = new Set<string>()
    if (!currentNodeId || currentNodeType !== "FOLDER") return ids

    function recurse(id: string) {
      ids.add(id)
      const children = folders.filter((f) => f.parentId === id)
      for (const child of children) {
        recurse(child.id)
      }
    }

    recurse(currentNodeId)
    return ids
  }, [currentNodeId, currentNodeType, folders])

  // 2. Build the indented folder tree list
  const folderTree = React.useMemo(() => {
    const list: (FolderData & { depth: number })[] = []

    function build(parentId: string | null, depth: number) {
      const levelFolders = folders.filter(
        (f) => f.parentId === parentId && !excludedIds.has(f.id)
      )
      // Sort alphabetically by name
      levelFolders.sort((a, b) => a.name.localeCompare(b.name))

      for (const folder of levelFolders) {
        list.push({ ...folder, depth })
        build(folder.id, depth + 1)
      }
    }

    build(null, 0)
    return list
  }, [folders, excludedIds])

  // Reset selection on open
  React.useEffect(() => {
    if (isOpen) {
      setSelectedFolderId(null)
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
        </DialogHeader>

        <div className="py-4">
          <p className="text-xs text-muted-foreground mb-3 select-none">
            Select a target destination folder:
          </p>

          <div className="max-h-64 overflow-y-auto border border-border rounded-xl bg-muted/20 p-2 space-y-1">
            {/* Root / My Drive Option */}
            <button
              onClick={() => setSelectedFolderId(null)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-left transition-all border ${
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
              return (
                <button
                  key={folder.id}
                  onClick={() => setSelectedFolderId(folder.id)}
                  style={{ paddingLeft: `${(folder.depth + 1) * 12 + 12}px` }}
                  className={`w-full flex items-center gap-2 py-2 pr-3 text-sm rounded-lg text-left transition-all border relative group ${
                    isSelected
                      ? "bg-primary/10 border-primary/20 text-primary font-medium shadow-xs"
                      : "border-transparent text-foreground hover:bg-muted"
                  }`}
                >
                  <CaretRight
                    size={10}
                    className="absolute text-muted-foreground/60"
                    style={{ left: `${folder.depth * 12 + 12}px` }}
                  />
                  <Folder
                    size={18}
                    weight={isSelected ? "fill" : "regular"}
                    className="text-yellow-500 flex-shrink-0"
                  />
                  <span className="truncate select-none">{folder.name}</span>
                </button>
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
