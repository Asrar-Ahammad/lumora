"use client"

import * as React from "react"
import {
  X, MagnifyingGlassPlus, MagnifyingGlassMinus, ArrowClockwise, Play, Pause,
  Download, FilePdf, FileAudio, FileVideo, FileCode,
  FileText, File, ArrowLeft
} from "@phosphor-icons/react"
import { decryptFile } from "@/lib/crypto"
import dynamic from "next/dynamic"

const PdfViewer = dynamic(() => import("./pdf-viewer"), { ssr: false })
const DocViewerWrapper = dynamic(() => import("./doc-viewer-wrapper"), { ssr: false })

interface FileViewerProps {
  isOpen: boolean;
  onClose: () => void;
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

export function FileViewer({ isOpen, onClose, node, nodeKey }: FileViewerProps) {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null)
  const [textContent, setTextContent] = React.useState<string | null>(null)
  const [csvData, setCsvData] = React.useState<string[][] | null>(null)

  // Image controls state
  const [scale, setScale] = React.useState(1)
  const [rotate, setRotate] = React.useState(0)

  // Audio controls state
  const [audioPlaying, setAudioPlaying] = React.useState(false)
  const audioRef = React.useRef<HTMLAudioElement | null>(null)
  const [audioProgress, setAudioProgress] = React.useState(0)
  const [audioDuration, setAudioDuration] = React.useState(0)

  React.useEffect(() => {
    if (!isOpen) return;

    let localBlobUrl: string | null = null;
    let active = true;

    setLoading(true);
    setError(null);
    setTextContent(null);
    setCsvData(null);
    setScale(1);
    setRotate(0);
    setAudioPlaying(false);
    setAudioProgress(0);

    async function loadAndDecrypt() {
      try {
        const fileIv = node.fileIv;
        if (!nodeKey || !fileIv) throw new Error("Missing decryption keys");

        const res = await fetch(node.url);
        if (!res.ok) throw new Error("Failed to fetch encrypted file");

        const encryptedBuffer = await res.arrayBuffer();
        const decryptedBlob = await decryptFile(encryptedBuffer, nodeKey, fileIv);
        const typedBlob = new Blob([decryptedBlob], { type: node.mimeType || "application/octet-stream" });

        if (!active) return;

        localBlobUrl = URL.createObjectURL(typedBlob);
        setBlobUrl(localBlobUrl);

        // Check if file type is text or csv
        const isText =
          node.mimeType.startsWith("text/") ||
          node.mimeType === "application/json" ||
          node.mimeType === "application/javascript" ||
          node.name.endsWith(".md") ||
          node.name.endsWith(".csv");

        if (isText) {
          const text = await decryptedBlob.text();
          if (node.name.endsWith(".csv")) {
            // Parse CSV
            const rows = text.split("\n").map(row => row.split(","));
            setCsvData(rows.filter(r => r.length > 0 && r.some(cell => cell.trim() !== "")));
          } else {
            setTextContent(text);
          }
        }
      } catch (err: any) {
        console.error(err);
        if (active) setError(err.message || "Decryption failed");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadAndDecrypt();
    return () => {
      active = false;
      if (localBlobUrl) {
        URL.revokeObjectURL(localBlobUrl);
      }
    };
  }, [isOpen, node, nodeKey]);

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = node.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!isOpen) return null;

  // Renderers
  const renderImage = () => {
    return (
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative min-h-[400px]">
        <img
          src={blobUrl!}
          alt={node.name}
          style={{
            transform: `scale(${scale}) rotate(${rotate}deg)`,
            transition: "transform 0.2s ease"
          }}
          className="max-h-[78vh] max-w-full object-contain rounded-lg shadow-md"
        />
        {/* Controls */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md rounded-full px-4 py-2 flex items-center gap-4 text-white text-sm shadow-lg border border-white/10 z-10">
          <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="hover:text-primary transition-colors cursor-pointer">
            <MagnifyingGlassMinus size={20} />
          </button>
          <span className="font-mono min-w-[3rem] text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(3, s + 0.25))} className="hover:text-primary transition-colors cursor-pointer">
            <MagnifyingGlassPlus size={20} />
          </button>
          <div className="w-[1px] h-4 bg-white/20" />
          <button onClick={() => setRotate(r => (r + 90) % 360)} className="hover:text-primary transition-colors cursor-pointer">
            <ArrowClockwise size={20} />
          </button>
        </div>
      </div>
    )
  }

  const renderVideo = () => {
    return (
      <div className="flex-1 flex items-center justify-center p-4 bg-black rounded-lg overflow-hidden">
        <video src={blobUrl!} controls autoPlay className="max-h-[78vh] max-w-full rounded-lg" />
      </div>
    )
  }

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setAudioProgress(audioRef.current.currentTime);
    }
  };

  const handleAudioLoadedMetadata = () => {
    if (audioRef.current) {
      setAudioDuration(audioRef.current.duration);
    }
  };

  const toggleAudio = () => {
    if (audioRef.current) {
      if (audioPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setAudioPlaying(!audioPlaying);
    }
  };

  const renderAudio = () => {
    const progressPercent = audioDuration ? (audioProgress / audioDuration) * 100 : 0;
    const formatTime = (time: number) => {
      const mins = Math.floor(time / 60);
      const secs = Math.floor(time % 60);
      return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-card rounded-lg border border-border min-h-[300px]">
        <audio
          ref={audioRef}
          src={blobUrl!}
          onTimeUpdate={handleAudioTimeUpdate}
          onLoadedMetadata={handleAudioLoadedMetadata}
          onEnded={() => setAudioPlaying(false)}
        />
        <div className="p-6 bg-primary/10 text-primary rounded-full mb-6">
          <FileAudio size={48} weight="fill" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-1 text-center truncate max-w-md select-none">{node.name}</h3>
        <p className="text-sm text-muted-foreground mb-6">Audio Track • {node.mimeType}</p>

        {/* Customized audio UI */}
        <div className="w-full max-w-md bg-muted/30 rounded-xl p-4 border border-border shadow-sm">
          {/* Progress bar */}
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mb-2 relative cursor-pointer" onClick={(e) => {
            if (audioRef.current && audioDuration) {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              audioRef.current.currentTime = pct * audioDuration;
            }
          }}>
            <div className="absolute top-0 left-0 h-full bg-primary" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground font-mono mb-4">
            <span>{formatTime(audioProgress)}</span>
            <span>{formatTime(audioDuration)}</span>
          </div>

          <div className="flex items-center justify-center gap-4">
            <button
              onClick={toggleAudio}
              className="bg-primary text-primary-foreground p-3 rounded-full hover:scale-105 transition-transform flex items-center justify-center cursor-pointer"
            >
              {audioPlaying ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderPdf = () => {
    return (
      <PdfViewer blobUrl={blobUrl!} name={node.name} />
    )
  }

  const renderText = () => {
    return (
      <div className="flex-1 flex flex-col h-full rounded-lg overflow-hidden border border-border bg-muted/10 font-mono text-sm shadow-inner p-4 overflow-y-auto">
        <pre className="text-foreground leading-relaxed whitespace-pre-wrap">{textContent}</pre>
      </div>
    )
  }

  const renderCsv = () => {
    if (!csvData) return null;
    const headers = csvData[0];
    const rows = csvData.slice(1);

    return (
      <div className="flex-1 flex flex-col h-full rounded-lg overflow-hidden border border-border bg-card shadow-inner overflow-auto">
        <table className="w-full border-collapse text-sm text-left">
          <thead className="bg-muted text-muted-foreground sticky top-0 border-b border-border">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="px-4 py-3 font-semibold border-r border-border last:border-0">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-muted/30 transition-colors">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2 border-r border-border last:border-0 truncate max-w-[200px]" title={cell}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const renderDefault = () => {
    if (blobUrl) {
      // Get file extension for fileType hint
      const ext = node.name.split(".").pop()?.toLowerCase();
      return (
        <div className="flex-1 flex flex-col h-full rounded-lg overflow-hidden border border-border bg-card">
          <DocViewerWrapper
            blobUrl={blobUrl}
            fileName={node.name}
            fileType={ext}
            onDownload={handleDownload}
          />
        </div>
      )
    }
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-card rounded-lg border border-border min-h-[300px]">
        <div className="p-6 bg-muted text-muted-foreground rounded-full mb-6">
          <File size={48} />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-1 text-center truncate max-w-md select-none">{node.name}</h3>
        <p className="text-sm text-muted-foreground mb-6">No preview available for this file type</p>
        <button
          onClick={handleDownload}
          className="bg-primary text-primary-foreground hover:bg-primary/95 px-6 py-2.5 rounded-lg font-medium shadow transition-colors flex items-center gap-2 cursor-pointer"
        >
          <Download size={18} />
          Decrypt & Download
        </button>
      </div>
    )
  }

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[300px]">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mb-4" />
          <span className="text-sm text-muted-foreground">Decrypting secure file locally...</span>
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[300px] text-center p-6 text-destructive">
          <p className="font-semibold mb-2">Decryption Failed</p>
          <p className="text-sm max-w-md">{error}</p>
        </div>
      )
    }

    const type = node.mimeType;
    if (type.startsWith("image/")) return renderImage();
    if (type.startsWith("video/")) return renderVideo();
    if (type.startsWith("audio/")) return renderAudio();
    if (type === "application/pdf") return renderPdf();
    if (node.name.endsWith(".csv")) return renderCsv();
    if (textContent !== null) return renderText();

    return renderDefault();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 md:p-6 lg:p-8">
      <div className="bg-background border border-border shadow-2xl rounded-2xl w-[90vw] max-w-[90vw] h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors cursor-pointer"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground truncate max-w-lg select-none" title={node.name}>
                {node.name}
              </h2>
              <span className="text-[10px] text-muted-foreground select-none font-medium">
                Size: {node.sizeBytes ? (parseInt(node.sizeBytes) / 1024 / 1024).toFixed(2) + " MB" : "Unknown"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {blobUrl && !loading && !error && (
              <button
                onClick={handleDownload}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors cursor-pointer"
                title="Save decrypted copy"
              >
                <Download size={20} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col p-4 bg-muted/5 min-h-[300px] overflow-y-auto">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
