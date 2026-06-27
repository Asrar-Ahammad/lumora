"use client"

import * as React from "react";
import { UploadZone } from "./upload-zone";
import { X } from "@phosphor-icons/react";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentId: string;
  parentKey: CryptoKey;
  aiSearchEnabled: boolean;
  onUploadComplete: () => void;
  initialFiles?: File[];
}

export function UploadModal({
  isOpen,
  onClose,
  parentId,
  parentKey,
  aiSearchEnabled,
  onUploadComplete,
  initialFiles
}: UploadModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="bg-card border border-border shadow-xl rounded-2xl w-full max-w-xl relative animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Upload Files</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:bg-muted rounded-full transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <UploadZone
            parentId={parentId}
            parentKey={parentKey}
            aiSearchEnabled={aiSearchEnabled}
            initialFiles={initialFiles}
            onUploadComplete={(hasError) => {
              onUploadComplete();
              if (!hasError) {
                onClose();
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
