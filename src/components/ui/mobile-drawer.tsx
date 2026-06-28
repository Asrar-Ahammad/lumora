"use client";

import * as React from "react";

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function MobileDrawer({ isOpen, onClose, title, children }: MobileDrawerProps) {
  const [offsetY, setOffsetY] = React.useState(0);
  const dragStart = React.useRef<number | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      setOffsetY(0);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    dragStart.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragStart.current === null) return;

    // Check if the user is scrolling the content and not at the top
    if (scrollRef.current && scrollRef.current.scrollTop > 0) {
      return;
    }

    const currentY = e.touches[0].clientY;
    const diff = currentY - dragStart.current;

    if (diff > 0) {
      // It's safe to set offset. We only slide down.
      setOffsetY(diff);
    }
  };

  const handleTouchEnd = () => {
    if (dragStart.current === null) return;
    if (offsetY > 100) {
      onClose();
    }
    setOffsetY(0);
    dragStart.current = null;
  };

  return (
    <div className="fixed inset-0 z-[10000] md:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
      />
      {/* Bottom Sheet */}
      <div 
        className="fixed bottom-0 left-0 right-0 max-h-[85vh] rounded-t-[24px] border-t border-border bg-popover pb-8 pt-4 px-4 shadow-2xl z-50 flex flex-col transform transition-transform animate-in slide-in-from-bottom"
        style={{ 
          transform: offsetY > 0 ? `translateY(${offsetY}px)` : undefined, 
          transition: dragStart.current !== null ? "none" : "transform 0.3s ease-out"
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull drag indicator handle */}
        <div className="mx-auto w-12 h-1.5 rounded-full bg-muted-foreground/20 mb-4 shrink-0" />
        
        {/* Header */}
        <div className="flex items-center justify-center mb-3 px-1 shrink-0 pb-2">
          <h3 className="text-sm font-semibold text-foreground truncate max-w-[80%] select-none">
            {title || "Actions"}
          </h3>
        </div>

        {/* Content list */}
        <div 
          ref={scrollRef}
          className="overflow-y-auto pr-1 flex flex-col gap-1"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
