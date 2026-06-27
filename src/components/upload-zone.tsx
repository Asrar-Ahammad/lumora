"use client"

import * as React from "react"
import { useCrypto } from "./crypto-provider"
import {
  generateNodeKey, encryptFile, encryptNodeKey,
  encryptText
} from "@/lib/crypto"
import {
  CloudArrowUp, ShieldCheck, CheckCircle, XCircle,
  File, FilePdf, FileAudio, FileVideo, FileCode, FileText,
  Spinner, WarningCircle, Plus, Trash, UploadSimple
} from "@phosphor-icons/react"
import { Image as ImageIcon } from "@phosphor-icons/react"
import { useToast } from "@/hooks/use-toast"

interface UploadZoneProps {
  parentId: string
  parentKey: CryptoKey
  aiSearchEnabled: boolean
  onUploadComplete: (hasError: boolean) => void
  initialFiles?: File[]
}

type FileStatus = "staged" | "encrypting" | "processing-ai" | "uploading" | "saving" | "done" | "error"

interface FileUploadEntry {
  id: string
  file: File
  status: FileStatus
  progress: number
  error?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getFileIcon(file: File, size = 18) {
  const mime = file.type
  if (mime.startsWith("image/")) return <ImageIcon size={size} className="text-blue-500" />
  if (mime.startsWith("video/")) return <FileVideo size={size} className="text-red-500" />
  if (mime.startsWith("audio/")) return <FileAudio size={size} className="text-emerald-500" />
  if (mime === "application/pdf") return <FilePdf size={size} className="text-rose-500" />
  if (mime.startsWith("text/") || file.name.match(/\.(json|js|ts|tsx|jsx|css|html)$/))
    return <FileCode size={size} className="text-yellow-600" />
  return <FileText size={size} className="text-gray-400" />
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

const STATUS_LABEL: Record<FileStatus, string> = {
  staged: "Ready",
  encrypting: "Encrypting…",
  "processing-ai": "AI Processing…",
  uploading: "Uploading…",
  saving: "Saving…",
  done: "Done",
  error: "Failed",
}

// ── Main Component ───────────────────────────────────────────────────────────

export function UploadZone({
  parentId, parentKey, aiSearchEnabled, onUploadComplete, initialFiles
}: UploadZoneProps) {
  const { cryptoKey } = useCrypto()
  const { toast } = useToast()
  const [isDragActive, setIsDragActive] = React.useState(false)
  const [entries, setEntries] = React.useState<FileUploadEntry[]>([])
  const [isUploading, setIsUploading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const addedInitialRef = React.useRef(false)

  // ── Update helper (uses functional update so it always has latest state) ──
  const updateEntry = React.useCallback((id: string, patch: Partial<FileUploadEntry>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }, [])

  const makeEntries = (files: File[]): FileUploadEntry[] =>
    files.map(f => ({
      id: Math.random().toString(36).slice(2) + Date.now(),
      file: f,
      status: "staged",
      progress: 0,
    }))

  // ── Stage initial files (drag-dropped onto dashboard) ──────────────────────
  React.useEffect(() => {
    if (initialFiles && initialFiles.length > 0 && !addedInitialRef.current) {
      addedInitialRef.current = true
      setEntries(prev => [...prev, ...makeEntries(initialFiles)])
    }
  }, [initialFiles])

  // ── Stage files (no upload yet) ────────────────────────────────────────────
  const stageFiles = (files: File[]) => {
    if (!files.length) return
    setEntries(prev => [...prev, ...makeEntries(files)])
  }

  const handleFilesSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return
    stageFiles(Array.from(e.target.files))
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const openFilePicker = (e: React.MouseEvent) => {
    e.stopPropagation()
    fileInputRef.current?.click()
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    setIsDragActive(e.type === "dragenter" || e.type === "dragover")
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    setIsDragActive(false)
    if (e.dataTransfer.files?.length) stageFiles(Array.from(e.dataTransfer.files))
  }

  // ── Remove a staged file ──────────────────────────────────────────────────
  const removeEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const clearDone = () => {
    setEntries(prev => prev.filter(e => e.status !== "done" && e.status !== "error"))
  }

  // ── Start uploading all staged files ───────────────────────────────────────
  const handleStartUpload = async () => {
    if (!cryptoKey || !parentKey) return

    const stagedEntries = entries.filter(e => e.status === "staged")
    if (stagedEntries.length === 0) return

    setIsUploading(true)
    toast({
      title: "Upload started",
      description: `Uploading ${stagedEntries.length} file${stagedEntries.length !== 1 ? "s" : ""}...`,
    })

    let hasError = false
    for (const entry of stagedEntries) {
      const success = await uploadSingleFile(entry)
      if (!success) {
        hasError = true
      }
    }

    setIsUploading(false)
    
    if (hasError) {
      toast({
        title: (
          <span className="flex items-center gap-2">
            <XCircle size={16} weight="fill" className="text-destructive" />
            Upload failed
          </span>
        ),
        description: "Some files failed to upload.",
        variant: "destructive",
      })
    } else {
      toast({
        title: (
          <span className="flex items-center gap-2">
            <CheckCircle size={16} weight="fill" className="text-emerald-500" />
            Upload complete
          </span>
        ),
        description: "All files uploaded successfully.",
      })
    }

    // Small delay so user sees the final 100% state
    setTimeout(() => onUploadComplete(hasError), 600)
  }

  const uploadSingleFile = async (entry: FileUploadEntry): Promise<boolean> => {
    const { id, file } = entry
    if (!cryptoKey || !parentKey) return false

    try {
      // Stage 1: Encrypt
      updateEntry(id, { status: "encrypting", progress: 0 })

      const fileNodeKey = await generateNodeKey()
      const { encryptedBlob, iv: fileIv } = await encryptFile(file, fileNodeKey)
      const metadataJson = JSON.stringify({ name: file.name, fileIv, lastModified: file.lastModified })
      const { cipherText: nameEnc, iv: nameIV } = await encryptText(metadataJson, fileNodeKey)
      const { encryptedKey: nodeKeyEnc, iv: nodeKeyIV } = await encryptNodeKey(fileNodeKey, parentKey)

      updateEntry(id, { progress: 15 })

      // Stage 2: Optional AI processing
      let captionEnc = null, captionIV = null, embeddingVector = null

      if (aiSearchEnabled) {
        updateEntry(id, { status: "processing-ai", progress: 20 })
        const bodyFormData = new FormData()
        bodyFormData.append("file", file)
        bodyFormData.append("filename", file.name)

        const transientRes = await fetch("/api/upload/process-transient", {
          method: "POST",
          body: bodyFormData,
        })
        if (transientRes.ok) {
          const { caption, embedding } = await transientRes.json()
          embeddingVector = embedding
          const encryptedCap = await encryptText(caption, fileNodeKey)
          captionEnc = encryptedCap.cipherText
          captionIV = encryptedCap.iv
        }
      }

      // Stage 3: Init R2 key
      updateEntry(id, { status: "uploading", progress: 25 })

      const initRes = await fetch("/api/upload/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
      })
      if (!initRes.ok) throw new Error(`Init failed (${initRes.status})`)
      const { r2Key } = await initRes.json()

      // Stage 4: XHR upload with real progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open("POST", `/api/upload/proxy?key=${encodeURIComponent(r2Key)}&mimeType=${encodeURIComponent(file.type)}`)

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const uploadPct = Math.round((ev.loaded / ev.total) * 65)
            updateEntry(id, { progress: 25 + uploadPct })
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`R2 upload failed: ${xhr.status}`))
        }
        xhr.onerror = () => reject(new Error("Network error"))
        xhr.send(encryptedBlob)
      })

      // Stage 5: Save to DB
      updateEntry(id, { status: "saving", progress: 92 })

      const saveRes = await fetch("/api/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId, type: "FILE", nameEnc, nameIV,
          nodeKeyEnc, nodeKeyIV,
          mimeType: file.type, sizeBytes: file.size,
          r2Key, captionEnc, captionIV, embedding: embeddingVector,
        }),
      })
      if (!saveRes.ok) throw new Error(`DB save failed (${saveRes.status})`)

      updateEntry(id, { status: "done", progress: 100 })
      return true
    } catch (err: any) {
      console.error("Upload failed for", file.name, err)
      updateEntry(id, { status: "error", error: err?.message || "Unknown error" })
      return false
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const stagedCount = entries.filter(e => e.status === "staged").length
  const doneCount = entries.filter(e => e.status === "done").length
  const errorCount = entries.filter(e => e.status === "error").length
  const totalCount = entries.length
  const totalStagedSize = entries.filter(e => e.status === "staged").reduce((s, e) => s + e.file.size, 0)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFilesSelection}
        disabled={isUploading}
      />

      {/* Drop zone – only stages files, never starts upload */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={!isUploading ? openFilePicker : undefined}
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all ${
          isUploading ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary/40 hover:bg-muted/30"
        } ${
          isDragActive
            ? "border-primary bg-primary/10 scale-[0.99] ring-2 ring-primary/20"
            : "border-border"
        }`}
      >
        <div className={`p-3.5 rounded-full mb-3 transition-colors ${isDragActive ? "bg-primary/20 text-primary" : "bg-primary/10 text-primary"}`}>
          <CloudArrowUp size={26} weight="fill" />
        </div>
        <h3 className="text-base font-semibold mb-1">
          {isDragActive ? "Drop files here" : totalCount > 0 ? "Add more files" : "Select files to upload"}
        </h3>
        <p className="text-xs text-muted-foreground max-w-xs">
          Drag & drop files, or click to browse. Files are encrypted locally before upload.
        </p>

        {aiSearchEnabled && (
          <div className="mt-3 text-xs font-semibold text-primary flex items-center gap-1.5">
            <ShieldCheck size={14} weight="fill" className="animate-pulse" />
            Secure AI Semantic Search Active
          </div>
        )}
      </div>

      {/* File list */}
      {entries.length > 0 && (
        <div className="space-y-2">

          {/* Summary */}
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span className="font-medium">
              {isUploading
                ? `Uploading ${doneCount + 1} of ${totalCount}…`
                : stagedCount > 0
                  ? `${stagedCount} file${stagedCount !== 1 ? "s" : ""} ready (${formatBytes(totalStagedSize)})`
                  : errorCount > 0
                    ? `${doneCount} done · ${errorCount} failed`
                    : `All ${doneCount} files uploaded`
              }
            </span>
            {!isUploading && (doneCount > 0 || errorCount > 0) && (
              <button
                onClick={clearDone}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear finished
              </button>
            )}
          </div>

          {/* Rows */}
          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-0.5">
            {entries.map(entry => (
              <FileRow
                key={entry.id}
                entry={entry}
                onRemove={removeEntry}
                isUploading={isUploading}
              />
            ))}
          </div>

          {/* Upload button */}
          {stagedCount > 0 && (
            <button
              onClick={handleStartUpload}
              disabled={isUploading}
              className="w-full flex items-center justify-center gap-2 py-2.5 mt-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? (
                <>
                  <Spinner size={16} className="animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <UploadSimple size={16} weight="bold" />
                  Upload {stagedCount} file{stagedCount !== 1 ? "s" : ""}
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── File Row ──────────────────────────────────────────────────────────────────

function FileRow({
  entry,
  onRemove,
  isUploading,
}: {
  entry: FileUploadEntry
  onRemove: (id: string) => void
  isUploading: boolean
}) {
  const { file, status, progress, error } = entry
  const isActive = status === "encrypting" || status === "uploading" ||
    status === "saving" || status === "processing-ai"

  return (
    <div className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all ${
      status === "done"
        ? "bg-emerald-500/5 border-emerald-500/20"
        : status === "error"
          ? "bg-destructive/5 border-destructive/20"
          : "bg-card border-border"
    }`}>
      {/* Icon */}
      <div className="flex-shrink-0 p-1.5 bg-muted rounded-lg">
        {getFileIcon(file)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="text-sm font-medium text-foreground truncate select-none" title={file.name}>
            {file.name}
          </span>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
            {formatBytes(file.size)}
          </span>
        </div>

        {/* Progress bar */}
        {(isActive || status === "done") && (
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-0.5">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                status === "done" ? "bg-emerald-500" : "bg-primary"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Status text */}
        <div className={`text-[11px] font-medium flex items-center gap-1 ${
          status === "done" ? "text-emerald-500"
            : status === "error" ? "text-destructive"
              : status === "staged" ? "text-muted-foreground/70"
                : "text-muted-foreground"
        }`}>
          {isActive && <Spinner size={11} className="animate-spin" />}
          {status === "done" && <CheckCircle size={11} weight="fill" />}
          {status === "error" && <WarningCircle size={11} weight="fill" />}
          <span>
            {status === "error" ? (error || "Upload failed") : STATUS_LABEL[status]}
            {isActive && status === "uploading" && ` ${progress}%`}
          </span>
        </div>
      </div>

      {/* Right action */}
      <div className="flex-shrink-0">
        {status === "done" && (
          <CheckCircle size={20} weight="fill" className="text-emerald-500" />
        )}
        {status === "error" && (
          <XCircle size={20} weight="fill" className="text-destructive" />
        )}
        {status === "staged" && !isUploading && (
          <button
            onClick={() => onRemove(entry.id)}
            className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
            title="Remove"
          >
            <Trash size={15} />
          </button>
        )}
        {isActive && (
          <Spinner size={18} className="animate-spin text-primary" />
        )}
      </div>
    </div>
  )
}
