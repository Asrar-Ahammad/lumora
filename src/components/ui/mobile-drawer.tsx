"use client";

import * as React from "react";
import { X } from "@phosphor-icons/react";

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function MobileDrawer({ isOpen, onClose, title, children }: MobileDrawerProps) {
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] md:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
      />
      {/* Bottom Sheet */}
      <div className="fixed bottom-0 left-0 right-0 max-h-[85vh] rounded-t-[24px] border-t border-border bg-popover pb-8 pt-4 px-4 shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-out animate-in slide-in-from-bottom">
        {/* Pull drag indicator handle */}
        <div className="mx-auto w-12 h-1.5 rounded-full bg-muted-foreground/20 mb-4 shrink-0" />
        
        {/* Header */}
        <div className="flex items-center justify-between mb-3 px-1 shrink-0">
          <h3 className="text-sm font-semibold text-foreground truncate max-w-[80%] select-none">
            {title || "Actions"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors cursor-pointer"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* Content list */}
        <div className="overflow-y-auto pr-1 flex flex-col gap-1">
          {children}
        </div>
      </div>
    </div>
  );
}
