"use client"

import * as React from "react"
import { decryptFile } from "@/lib/crypto"
import { FileText, Folder, FileVideo, FileAudio, FileArchive, FileCode, FilePdf, File as FileGeneric, Image as ImageIcon } from "@phosphor-icons/react"
import dynamic from "next/dynamic"

const Document = dynamic(() => import("react-pdf").then(mod => {
  mod.pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${mod.pdfjs.version}/build/pdf.worker.min.mjs`;
  return mod.Document;
}), { ssr: false })
const Page = dynamic(() => import("react-pdf").then(mod => mod.Page), { ssr: false })

interface FilePreviewThumbProps {
  node: {
    id: string;
    name: string;
    mimeType: string;
    url: string;
    sizeBytes: string;
    fileIv?: string;
  };
  nodeKey?: CryptoKey | null;
}

function getFallbackIcon(mime: string, name: string) {
  if (mime.startsWith("image/")) return <ImageIcon size={36} className="text-blue-500" />
  if (mime.startsWith("video/")) return <FileVideo size={36} className="text-red-500" />
  if (mime.startsWith("audio/")) return <FileAudio size={36} className="text-emerald-500" />
  if (mime === "application/pdf") return <FilePdf size={36} className="text-rose-500" />
  if (mime.startsWith("text/") || name.match(/\.(json|js|ts|tsx|jsx|css|html)$/)) return <FileCode size={36} className="text-yellow-600" />
  if (mime.includes("zip") || mime.includes("tar") || mime.includes("compressed")) return <FileArchive size={36} className="text-orange-500" />
  return <FileText size={36} className="text-gray-400" />
}

export function FilePreviewThumb({ node, nodeKey }: FilePreviewThumbProps) {
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null)
  const [textContent, setTextContent] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const mime = node.mimeType || ""
  const isText =
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/javascript" ||
    node.name.endsWith(".md") ||
    node.name.endsWith(".csv")

  const isImage = mime.startsWith("image/")
  const isPdf = mime === "application/pdf"
  
  const shouldPreview = isText || isImage || isPdf

  React.useEffect(() => {
    if (!shouldPreview) {
      setLoading(false)
      return
    }

    let localBlobUrl: string | null = null
    let active = true

    setLoading(true)
    setError(null)
    setBlobUrl(null)
    setTextContent(null)

    async function loadAndDecrypt() {
      try {
        const fileIv = node.fileIv
        if (!nodeKey || !fileIv) throw new Error("Missing keys")

        const res = await fetch(node.url)
        if (!res.ok) throw new Error("Fetch failed")

        const encryptedBuffer = await res.arrayBuffer()
        const decryptedBlob = await decryptFile(encryptedBuffer, nodeKey, fileIv)

        if (!active) return

        localBlobUrl = URL.createObjectURL(decryptedBlob)
        
        if (isText) {
          const text = await decryptedBlob.text()
          setTextContent(text)
        } else {
          setBlobUrl(localBlobUrl)
        }
      } catch (err: any) {
        console.error("Preview error:", err)
        if (active) setError(err.message || "Decryption failed")
      } finally {
        if (active) setLoading(false)
      }
    }

    loadAndDecrypt()

    return () => {
      active = false
      if (localBlobUrl) URL.revokeObjectURL(localBlobUrl)
    }
  }, [node, nodeKey, shouldPreview])

  if (!shouldPreview || error) {
    return (
      <div className="p-4 bg-muted rounded-xl inline-block mb-3 text-primary/80">
        {getFallbackIcon(mime, node.name)}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="w-24 h-24 sm:w-32 sm:h-32 bg-muted/50 rounded-xl mb-3 flex items-center justify-center border border-border mx-auto">
        <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (isImage && blobUrl) {
    return (
      <div className="w-32 h-32 bg-muted/30 rounded-xl mb-3 border border-border overflow-hidden flex items-center justify-center relative mx-auto shadow-sm">
        <img src={blobUrl} alt={node.name} className="w-full h-full object-cover" />
      </div>
    )
  }

  if (isText && textContent !== null) {
    return (
      <div className="w-full h-32 bg-muted/10 rounded-xl mb-3 border border-border overflow-hidden p-2 text-left relative shadow-inner mx-auto max-w-full">
        <pre className="text-[9px] sm:text-[10px] text-muted-foreground font-mono whitespace-pre-wrap break-words opacity-80 select-none">
          {textContent.slice(0, 300)}
          {textContent.length > 300 && "..."}
        </pre>
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent pointer-events-none" />
      </div>
    )
  }

  if (isPdf && blobUrl) {
    return (
      <div className="w-24 h-32 bg-white rounded-md mb-3 border border-border overflow-hidden flex items-center justify-center shadow-sm relative pointer-events-none mx-auto scale-90 sm:scale-100">
        <Document file={blobUrl} loading={<span className="text-[10px] text-muted-foreground">Loading...</span>}>
          <Page 
            pageNumber={1} 
            width={120} 
            renderTextLayer={false} 
            renderAnnotationLayer={false}
          />
        </Document>
        <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent pointer-events-none" />
      </div>
    )
  }

  return null
}
