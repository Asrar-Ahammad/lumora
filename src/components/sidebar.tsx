"use client"

import * as React from "react";
import { 
  Folder, FileText, Star, Video, Archive, HardDrive, 
  Image as ImageIcon, MusicNote, Trash, CaretLeft, CaretRight,
  Cloud, ShieldCheck, X
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";

interface SidebarProps {
  activeCategory: string;
  setActiveCategory: (cat: string) => void;
  totalSizeBytes: number;
  trashCount: number;
  storageStats: {
    documents: number;
    media: number;
    audio: number;
    archive: number;
  };
  width: number;
  setWidth: (width: number) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isMobileOpen?: boolean;
  setIsMobileOpen?: (open: boolean) => void;
}

export function Sidebar({ 
  activeCategory, 
  setActiveCategory, 
  totalSizeBytes, 
  trashCount, 
  storageStats,
  width,
  setWidth,
  isCollapsed,
  setIsCollapsed,
  isMobileOpen,
  setIsMobileOpen
}: SidebarProps) {
  // Format total storage used
  const formatStorage = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const percentUsed = Math.min(100, (totalSizeBytes / (15 * 1024 * 1024 * 1024)) * 100);

  // Resize handler
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(200, Math.min(480, startWidth + deltaX));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside 
        className="hidden md:flex flex-col h-screen bg-background border-r border-border relative select-none flex-shrink-0 transition-all duration-300 ease-out"
        style={{ width: isCollapsed ? 72 : width }}
      >
      {/* Header Block */}
      <div className={`p-6 pb-2 flex items-center justify-between gap-3 ${isCollapsed ? "px-2 py-4 flex-col gap-4" : ""}`}>
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="bg-primary text-primary-foreground p-1.5 rounded-full shadow-sm flex-shrink-0">
            <HardDrive weight="fill" size={24} />
          </div>
          {!isCollapsed && <h1 className="text-xl font-medium tracking-tight truncate select-none">Lumora</h1>}
        </div>
        
        {/* Collapse toggle button */}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors border border-border bg-card shrink-0 cursor-pointer"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <CaretRight size={16} /> : <CaretLeft size={16} />}
        </button>
      </div>

      <nav className={`flex-1 px-3 mt-4 overflow-y-auto space-y-6 ${isCollapsed ? "px-1.5" : ""}`}>
        {/* My Drive Button */}
        <div>
          <button 
            onClick={() => setActiveCategory("drive")}
            className={`flex items-center transition-colors font-medium ${
              isCollapsed
                ? `w-11 h-11 rounded-full mx-auto justify-center ${activeCategory === "drive" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground cursor-pointer"}`
                : `w-full justify-start gap-4 px-4 py-2.5 rounded-full ${activeCategory === "drive" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground cursor-pointer"}`
            }`}
            title={isCollapsed ? "My Drive" : undefined}
          >
            <HardDrive size={22} weight={activeCategory === "drive" ? "fill" : "regular"} className="flex-shrink-0" />
            {!isCollapsed && <span className="truncate">My Drive</span>}
          </button>
        </div>

        {/* Categories Section */}
        <div>
          {!isCollapsed && (
            <h3 className="px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 select-none">Categories</h3>
          )}
          <ul className="space-y-1">
            <NavItem 
              icon={<FileText size={22} />} 
              label="Documents" 
              active={activeCategory === "documents"} 
              onClick={() => setActiveCategory("documents")}
              isCollapsed={isCollapsed}
            />
            <NavItem 
              icon={<ImageIcon size={22} />} 
              label="Photos" 
              active={activeCategory === "photos" || activeCategory === "media"} 
              onClick={() => setActiveCategory("photos")}
              isCollapsed={isCollapsed}
            />
            <NavItem 
              icon={<Video size={22} />} 
              label="Videos" 
              active={activeCategory === "videos"} 
              onClick={() => setActiveCategory("videos")}
              isCollapsed={isCollapsed}
            />
            <NavItem 
              icon={<MusicNote size={22} />} 
              label="Audio" 
              active={activeCategory === "audio"} 
              onClick={() => setActiveCategory("audio")}
              isCollapsed={isCollapsed}
            />
            <NavItem 
              icon={<Archive size={22} />} 
              label="Archive" 
              active={activeCategory === "archive"} 
              onClick={() => setActiveCategory("archive")}
              isCollapsed={isCollapsed}
            />
          </ul>
        </div>

        {/* Trash Section */}
        <div>
          {!isCollapsed && (
            <h3 className="px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 select-none">Other</h3>
          )}
          <ul className="space-y-1">
            <li>
              <button
                onClick={() => setActiveCategory("trash")}
                className={`flex items-center transition-colors relative font-medium ${
                  isCollapsed
                    ? `w-11 h-11 rounded-full mx-auto justify-center ${activeCategory === "trash" ? "bg-destructive/10 text-destructive" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground cursor-pointer"}`
                    : `w-full gap-4 px-4 py-2.5 rounded-full ${activeCategory === "trash" ? "bg-destructive/10 text-destructive" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground cursor-pointer"}`
                }`}
                title={isCollapsed ? "Trash" : undefined}
              >
                <Trash
                  size={22}
                  weight={activeCategory === "trash" ? "fill" : "regular"}
                  className={`flex-shrink-0 ${activeCategory === "trash" ? "text-destructive" : ""}`}
                />
                {!isCollapsed && <span className="flex-1 text-left truncate">Trash</span>}
                {trashCount > 0 && (
                  <Badge
                    variant={activeCategory === "trash" ? "destructive" : "secondary"}
                    className={
                      isCollapsed 
                        ? "absolute -top-1.5 -right-1.5 text-[9px] h-4.5 min-w-[18px] px-1 font-semibold rounded-full flex items-center justify-center scale-90 shadow-sm"
                        : "text-[10px] h-5 min-w-[20px] px-1.5 font-semibold"
                    }
                  >
                    {trashCount > 99 ? "99+" : trashCount}
                  </Badge>
                )}
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveCategory("storage")}
                className={`flex items-center transition-colors relative font-medium ${
                  isCollapsed
                    ? `w-11 h-11 rounded-full mx-auto justify-center ${activeCategory === "storage" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground cursor-pointer"}`
                    : `w-full gap-4 px-4 py-2.5 rounded-full ${activeCategory === "storage" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground cursor-pointer"}`
                }`}
                title={isCollapsed ? "Storage" : undefined}
              >
                <Cloud
                  size={22}
                  weight={activeCategory === "storage" ? "fill" : "regular"}
                  className={`flex-shrink-0 ${activeCategory === "storage" ? "text-primary" : ""}`}
                />
                {!isCollapsed && <span className="flex-1 text-left truncate">Storage</span>}
              </button>
            </li>
          </ul>
        </div>
      </nav>

      {/* Storage Indicator */}
      {!isCollapsed ? (
        <div 
          onClick={() => setActiveCategory("storage")}
          className={`p-6 mt-auto border-t border-border bg-muted/10 relative group/storage flex-shrink-0 cursor-pointer hover:bg-muted/20 transition-colors ${
            activeCategory === "storage" ? "bg-muted/30" : ""
          }`}
        >
          <div className="flex justify-between text-xs font-medium text-foreground mb-1.5 select-none">
            <span>Storage</span>
            <span>{formatStorage(totalSizeBytes)} of 15 GB</span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-2 cursor-pointer relative">
            <div 
              className="h-full bg-primary transition-all duration-500" 
              style={{ width: `${percentUsed}%` }} 
            />
          </div>

          {/* Tooltip storage breakdown card */}
          <div className="absolute bottom-[85px] left-6 right-6 p-4 bg-popover border border-border shadow-lg rounded-xl opacity-0 scale-95 pointer-events-none group-hover/storage:opacity-100 group-hover/storage:scale-100 transition-all duration-200 origin-bottom z-30 select-none space-y-2.5">
            <h4 className="text-xs font-semibold text-foreground border-b border-border/60 pb-1.5">Storage Breakdown</h4>
            <div className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Documents
                </span>
                <span className="text-foreground">{formatStorage(storageStats.documents)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  Photos & Media
                </span>
                <span className="text-foreground">{formatStorage(storageStats.media)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Audio
                </span>
                <span className="text-foreground">{formatStorage(storageStats.audio)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Archive & Others
                </span>
                <span className="text-foreground">{formatStorage(storageStats.archive)}</span>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-muted-foreground leading-relaxed select-none pl-7 relative">
            <span className="absolute left-0 top-0.5 text-primary/70">
              <ShieldCheck size={16} weight="fill" />
            </span>
            <span>Secure E2EE files. Max capacity is shared across all types.</span>
          </div>
        </div>
      ) : (
        <div 
          onClick={() => setActiveCategory("storage")}
          className={`py-6 mt-auto border-t border-border bg-muted/10 flex flex-col items-center justify-center gap-1 select-none flex-shrink-0 cursor-pointer hover:bg-muted/20 transition-colors ${
            activeCategory === "storage" ? "bg-muted/30" : ""
          }`}
          title={`${formatStorage(totalSizeBytes)} used of 15 GB`}
        >
          <div className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-[10px] font-bold text-foreground bg-popover">
            {Math.round(percentUsed)}%
          </div>
        </div>
      )}

      {/* Resizable drag handle */}
      {!isCollapsed && (
        <div 
          onMouseDown={handleMouseDown}
          className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary/40 active:bg-primary transition-colors z-50 select-none"
        />
      )}
    </aside>

      {/* Mobile sidebar overlay */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsMobileOpen?.(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[280px] bg-background flex flex-col h-full overflow-y-auto animate-in slide-in-from-left duration-200 shadow-2xl">
            {/* Header */}
            <div className="p-6 pb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="bg-primary text-primary-foreground p-1.5 rounded-full shadow-sm flex-shrink-0">
                  <HardDrive weight="fill" size={24} />
                </div>
                <h1 className="text-xl font-medium tracking-tight truncate select-none">Lumora</h1>
              </div>
              <button 
                onClick={() => setIsMobileOpen?.(false)}
                className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors border border-border bg-card shrink-0 cursor-pointer"
                title="Close menu"
              >
                <X size={16} />
              </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 mt-4 overflow-y-auto space-y-6">
              <div>
                <button 
                  onClick={() => setActiveCategory("drive")}
                  className={`flex items-center w-full justify-start gap-4 px-4 py-2.5 rounded-full transition-colors font-medium ${
                    activeCategory === "drive" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground cursor-pointer"
                  }`}
                >
                  <HardDrive size={22} weight={activeCategory === "drive" ? "fill" : "regular"} className="flex-shrink-0" />
                  <span className="truncate">My Drive</span>
                </button>
              </div>

              <div>
                <h3 className="px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 select-none">Categories</h3>
                <ul className="space-y-1">
                  <NavItem icon={<FileText size={22} />} label="Documents" active={activeCategory === "documents"} onClick={() => setActiveCategory("documents")} isCollapsed={false} />
                  <NavItem icon={<ImageIcon size={22} />} label="Photos" active={activeCategory === "photos" || activeCategory === "media"} onClick={() => setActiveCategory("photos")} isCollapsed={false} />
                  <NavItem icon={<Video size={22} />} label="Videos" active={activeCategory === "videos"} onClick={() => setActiveCategory("videos")} isCollapsed={false} />
                  <NavItem icon={<MusicNote size={22} />} label="Audio" active={activeCategory === "audio"} onClick={() => setActiveCategory("audio")} isCollapsed={false} />
                  <NavItem icon={<Archive size={22} />} label="Archive" active={activeCategory === "archive"} onClick={() => setActiveCategory("archive")} isCollapsed={false} />
                </ul>
              </div>

              <div>
                <h3 className="px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 select-none">Other</h3>
                <ul className="space-y-1">
                  <li>
                    <button
                      onClick={() => setActiveCategory("trash")}
                      className={`flex items-center w-full gap-4 px-4 py-2.5 rounded-full transition-colors font-medium ${
                        activeCategory === "trash" ? "bg-destructive/10 text-destructive" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground cursor-pointer"
                      }`}
                    >
                      <Trash size={22} weight={activeCategory === "trash" ? "fill" : "regular"} className={`flex-shrink-0 ${activeCategory === "trash" ? "text-destructive" : ""}`} />
                      <span className="flex-1 text-left truncate">Trash</span>
                      {trashCount > 0 && (
                        <Badge variant={activeCategory === "trash" ? "destructive" : "secondary"} className="text-[10px] h-5 min-w-[20px] px-1.5 font-semibold">
                          {trashCount > 99 ? "99+" : trashCount}
                        </Badge>
                      )}
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => setActiveCategory("storage")}
                      className={`flex items-center w-full gap-4 px-4 py-2.5 rounded-full transition-colors font-medium ${
                        activeCategory === "storage" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground cursor-pointer"
                      }`}
                    >
                      <Cloud size={22} weight={activeCategory === "storage" ? "fill" : "regular"} className={`flex-shrink-0 ${activeCategory === "storage" ? "text-primary" : ""}`} />
                      <span className="flex-1 text-left truncate">Storage</span>
                    </button>
                  </li>
                </ul>
              </div>
            </nav>

            {/* Storage indicator */}
            <div 
              onClick={() => setActiveCategory("storage")}
              className={`p-6 mt-auto border-t border-border bg-muted/10 flex-shrink-0 cursor-pointer hover:bg-muted/20 transition-colors ${
                activeCategory === "storage" ? "bg-muted/30" : ""
              }`}
            >
              <div className="flex justify-between text-xs font-medium text-foreground mb-1.5 select-none">
                <span>Storage</span>
                <span>{formatStorage(totalSizeBytes)} of 15 GB</span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-2">
                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${percentUsed}%` }} />
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  isCollapsed: boolean;
}

function NavItem({ icon, label, active, onClick, isCollapsed }: NavItemProps) {
  return (
    <li>
      <button 
        onClick={onClick}
        className={`flex items-center rounded-full font-medium transition-colors ${
          isCollapsed 
            ? `justify-center w-11 h-11 mx-auto ${active ? "bg-muted/85 text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground cursor-pointer"}`
            : `justify-start w-full gap-4 px-4 py-2.5 ${active ? "bg-muted/85 text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground cursor-pointer"}`
        }`}
        title={isCollapsed ? label : undefined}
      >
        <span className="flex-shrink-0">{icon}</span>
        {!isCollapsed && <span className="truncate">{label}</span>}
      </button>
    </li>
  );
}
