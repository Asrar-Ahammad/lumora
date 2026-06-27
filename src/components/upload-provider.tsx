"use client";

import * as React from "react";
import { useCrypto } from "./crypto-provider";
import { useToast } from "@/hooks/use-toast";
import {
  generateNodeKey,
  encryptFile,
  encryptNodeKey,
  encryptText,
} from "@/lib/crypto";
import { sendNotification } from "@/app/pwa-actions";

export type UploadStatus =
  | "staged"
  | "encrypting"
  | "processing-ai"
  | "uploading"
  | "saving"
  | "done"
  | "error";

export interface UploadEntry {
  id: string;
  name: string;
  size: number;
  status: UploadStatus;
  progress: number;
  error?: string;
  parentId: string;
}

interface UploadContextType {
  entries: UploadEntry[];
  isUploading: boolean;
  addUploads: (
    files: File[],
    parentId: string,
    parentKey: CryptoKey,
    aiSearchEnabled: boolean
  ) => void;
  clearCompleted: () => void;
  removeEntry: (id: string) => void;
  retryUpload: (id: string) => void;
}

const UploadContext = React.createContext<UploadContextType | undefined>(undefined);

export function useUpload() {
  const context = React.useContext(UploadContext);
  if (!context) {
    throw new Error("useUpload must be used within an UploadProvider");
  }
  return context;
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const { cryptoKey } = useCrypto();
  const { toast } = useToast();
  const [entries, setEntries] = React.useState<UploadEntry[]>([]);
  const queueRef = React.useRef<{
    file: File;
    id: string;
    parentId: string;
    parentKey: CryptoKey;
    aiSearchEnabled: boolean;
  }[]>([]);
  const taskMapRef = React.useRef<Map<string, {
    file: File;
    parentId: string;
    parentKey: CryptoKey;
    aiSearchEnabled: boolean;
  }>>(new Map());
  const isProcessingRef = React.useRef(false);

  // Derive if any file is actively uploading
  const isUploading = entries.some(
    (e) =>
      e.status === "encrypting" ||
      e.status === "processing-ai" ||
      e.status === "uploading" ||
      e.status === "saving"
  );

  const updateEntry = React.useCallback(
    (id: string, patch: Partial<UploadEntry>) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
      );
    },
    []
  );

  // Background queue processing loop
  const processQueue = React.useCallback(async () => {
    if (isProcessingRef.current || queueRef.current.length === 0 || !cryptoKey) {
      return;
    }

    isProcessingRef.current = true;
    const task = queueRef.current[0];

    const { file, id, parentId, parentKey, aiSearchEnabled } = task;

    try {
      // 1. Encrypting
      updateEntry(id, { status: "encrypting", progress: 0 });
      const fileNodeKey = await generateNodeKey();
      const { encryptedBlob, iv: fileIv } = await encryptFile(file, fileNodeKey);
      const metadataJson = JSON.stringify({
        name: file.name,
        fileIv,
        lastModified: file.lastModified,
      });
      const { cipherText: nameEnc, iv: nameIV } = await encryptText(
        metadataJson,
        fileNodeKey
      );
      const { encryptedKey: nodeKeyEnc, iv: nodeKeyIV } = await encryptNodeKey(
        fileNodeKey,
        parentKey
      );

      updateEntry(id, { progress: 15 });

      // 2. AI Processing
      let captionEnc = null;
      let captionIV = null;
      let embeddingVector = null;

      if (aiSearchEnabled) {
        updateEntry(id, { status: "processing-ai", progress: 20 });
        const bodyFormData = new FormData();
        bodyFormData.append("file", file);
        bodyFormData.append("filename", file.name);

        const transientRes = await fetch("/api/upload/process-transient", {
          method: "POST",
          body: bodyFormData,
        });
        if (transientRes.ok) {
          const { caption, embedding } = await transientRes.json();
          embeddingVector = embedding;
          const encryptedCap = await encryptText(caption, fileNodeKey);
          captionEnc = encryptedCap.cipherText;
          captionIV = encryptedCap.iv;
        }
      }

      // 3. Init R2 Key
      updateEntry(id, { status: "uploading", progress: 25 });
      const initRes = await fetch("/api/upload/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
      });
      if (!initRes.ok) throw new Error(`Init failed (${initRes.status})`);
      const { r2Key } = await initRes.json();

      // 4. XHR upload with progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(
          "POST",
          `/api/upload/proxy?key=${encodeURIComponent(r2Key)}&mimeType=${encodeURIComponent(
            file.type
          )}`
        );

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const uploadPct = Math.round((ev.loaded / ev.total) * 65);
            updateEntry(id, { progress: 25 + uploadPct });
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`R2 upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(encryptedBlob);
      });

      // 5. Save to database
      updateEntry(id, { status: "saving", progress: 92 });
      const saveRes = await fetch("/api/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId,
          type: "FILE",
          nameEnc,
          nameIV,
          nodeKeyEnc,
          nodeKeyIV,
          mimeType: file.type,
          sizeBytes: file.size,
          r2Key,
          captionEnc,
          captionIV,
          embedding: embeddingVector,
        }),
      });
      if (!saveRes.ok) throw new Error(`DB save failed (${saveRes.status})`);

      // 6. Complete
      updateEntry(id, { status: "done", progress: 100 });

      // Dispatch global window event so folders refresh automatically
      window.dispatchEvent(new Event("lumora-upload-complete"));

      // Trigger Web Push Notification if user is subscribed (Fire and forget server action)
      sendNotification(`Successfully uploaded "${file.name}" to Lumora Secure Drive!`).catch(
        (err) => console.log("Failed to send PWA notification:", err)
      );
    } catch (err: any) {
      console.error(`Background upload failed for ${file.name}:`, err);
      updateEntry(id, {
        status: "error",
        error: err?.message || "Internal upload failure",
      });
    } finally {
      // Dequeue first item and schedule next loop run
      queueRef.current.shift();
      isProcessingRef.current = false;
      processQueue();
    }
  }, [cryptoKey, updateEntry]);

  // Run queue loop when files are added or crypto key changes
  React.useEffect(() => {
    if (cryptoKey && queueRef.current.length > 0 && !isProcessingRef.current) {
      processQueue();
    }
  }, [cryptoKey, entries, processQueue]);

  // Queue files interface
  const addUploads = React.useCallback(
    (
      files: File[],
      parentId: string,
      parentKey: CryptoKey,
      aiSearchEnabled: boolean
    ) => {
      const newEntries = files.map((file) => {
        const id = Math.random().toString(36).slice(2) + Date.now();
        
        // Save task details for potential retries
        taskMapRef.current.set(id, {
          file,
          parentId,
          parentKey,
          aiSearchEnabled,
        });

        // Push task definitions to mutable queue reference
        queueRef.current.push({
          file,
          id,
          parentId,
          parentKey,
          aiSearchEnabled,
        });

        return {
          id,
          name: file.name,
          size: file.size,
          status: "staged" as UploadStatus,
          progress: 0,
          parentId,
        };
      });

      setEntries((prev) => [...prev, ...newEntries]);

      toast({
        title: "Background upload queued",
        description: `Queued ${files.length} file${files.length !== 1 ? "s" : ""} to upload.`,
      });
    },
    [toast]
  );

  const clearCompleted = React.useCallback(() => {
    setEntries((prev) =>
      prev.filter((e) => e.status !== "done" && e.status !== "error")
    );
  }, []);

  const removeEntry = React.useCallback((id: string) => {
    // Remove from UI state
    setEntries((prev) => prev.filter((e) => e.id !== id));
    // Remove from in-memory processing queue if still staged
    queueRef.current = queueRef.current.filter((q) => q.id !== id);
    // Clean up task map
    taskMapRef.current.delete(id);
  }, []);

  const retryUpload = React.useCallback((id: string) => {
    const task = taskMapRef.current.get(id);
    if (!task) return;

    // 1. Update UI state back to staged
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, status: "staged", progress: 0, error: undefined } : e
      )
    );

    // 2. Re-queue the task
    queueRef.current.push({
      file: task.file,
      id,
      parentId: task.parentId,
      parentKey: task.parentKey,
      aiSearchEnabled: task.aiSearchEnabled,
    });

    // 3. Trigger processing
    processQueue();
  }, [processQueue]);

  return (
    <UploadContext.Provider
      value={{
        entries,
        isUploading,
        addUploads,
        clearCompleted,
        removeEntry,
        retryUpload,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
}
