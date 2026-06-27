"use client"

import * as React from "react";
import { Gear, Sun, Moon, UploadIcon, MagnifyingGlassIcon, ListIcon } from "@phosphor-icons/react";
import {
  Folder,
  File,
  FilePdf,
  FileAudio,
  FileVideo,
  FileCode,
  FileText,
  FileDoc,
  FileXls,
  FilePpt,
  FileZip,
  Image as ImageIcon,
  ArrowRight,
  ArrowBendDownLeft
} from "@phosphor-icons/react";
import { UserButton } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { flushSync } from "react-dom";

interface TopbarProps {
  query: string;
  setQuery: (q: string) => void;
  onUploadClick: () => void;
  onSettingsClick: () => void;
  onMenuClick?: () => void;
  onSearchClick?: () => void;
  decryptedSearchNodes?: any[];
  decFoldersMap?: Map<string, any>;
  loadSearchIndex?: () => void;
  isSearchIndexLoaded?: boolean;
  onNavigate?: (folderId: string, folderName: string, folderKey?: CryptoKey) => void;
  onOpenViewer?: (node: any, nodeKey: CryptoKey, name: string, fileIv: string) => void;
}

export function Topbar({
  query,
  setQuery,
  onUploadClick,
  onSettingsClick,
  onMenuClick,
  onSearchClick,
  decryptedSearchNodes = [],
  decFoldersMap = new Map(),
  loadSearchIndex,
  isSearchIndexLoaded = false,
  onNavigate,
  onOpenViewer
}: TopbarProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [suggestionIdx, setSuggestionIdx] = React.useState(0);
  
  const searchContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Close dropdown on click outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentTheme = theme === "system" ? resolvedTheme : theme;

  const handleThemeToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const nextTheme = currentTheme === "dark" ? "light" : "dark";

    if (typeof document === "undefined" || !(document as any).startViewTransition) {
      setTheme(nextTheme);
      return;
    }

    const x = e.clientX;
    const y = e.clientY;

    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    document.documentElement.classList.add("theme-transitioning");
    if (nextTheme === "light") {
      document.documentElement.classList.add("transition-to-light");
    }

    const transition = (document as any).startViewTransition(() => {
      flushSync(() => {
        setTheme(nextTheme);
      });
    });

    transition.ready.then(() => {
      const isDark = nextTheme === "dark";
      const clipPath = isDark
        ? [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`]
        : [`circle(${endRadius}px at ${x}px ${y}px)`, `circle(0px at ${x}px ${y}px)`];

      document.documentElement.animate(
        {
          clipPath,
        },
        {
          duration: 400,
          easing: "ease-in-out",
          fill: "forwards",
          pseudoElement: isDark ? "::view-transition-new(root)" : "::view-transition-old(root)",
        }
      );
    });

    transition.finished.finally(() => {
      document.documentElement.classList.remove("transition-to-light");
      document.documentElement.classList.remove("theme-transitioning");
    });
  };

  // Input Focus triggers index fetch
  const handleInputFocus = () => {
    if (loadSearchIndex) {
      loadSearchIndex();
    }
    setShowSuggestions(true);
  };

  // Get Breadcrumb path for folders
  const getBreadcrumbPath = React.useCallback((parentId: string | null): string => {
    const crumbs: string[] = [];
    let currentId = parentId;
    while (currentId) {
      const folder = decFoldersMap.get(currentId);
      if (!folder) break;
      crumbs.unshift(folder.name);
      currentId = folder.parentId;
    }
    return crumbs.length > 0 ? crumbs.join(" / ") : "";
  }, [decFoldersMap]);

  // Compute top 5 matching items for suggestions
  const suggestions = React.useMemo(() => {
    if (query.trim() === "") return [];
    return decryptedSearchNodes
      .filter((node) => {
        const matchesName = node.name.toLowerCase().includes(query.toLowerCase());
        const pathStr = getBreadcrumbPath(node.parentId).toLowerCase();
        const matchesPath = pathStr.includes(query.toLowerCase());
        return matchesName || matchesPath;
      })
      .slice(0, 5);
  }, [decryptedSearchNodes, query, getBreadcrumbPath]);

  // Reset index when query updates
  React.useEffect(() => {
    setSuggestionIdx(0);
  }, [query]);

  // Suggestion action select
  const handleSelectSuggestion = (node: any) => {
    setShowSuggestions(false);
    if (node.type === "FOLDER") {
      if (onNavigate) {
        onNavigate(node.id, node.name, node.nodeKey);
      }
    } else {
      if (onOpenViewer && node.nodeKey && node.fileIv) {
        onOpenViewer(node, node.nodeKey, node.name, node.fileIv);
      }
    }
  };

  // Keyboard actions inside input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0 || !showSuggestions) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSuggestionIdx((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSuggestionIdx((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selectedNode = suggestions[suggestionIdx];
      if (selectedNode) {
        handleSelectSuggestion(selectedNode);
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const renderIcon = (type: "FILE" | "FOLDER", mimeType: string | null, name: string) => {
    if (type === "FOLDER") return <Folder size={18} className="text-yellow-500" weight="fill" />;
    
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "pptx" || ext === "ppt" || ext === "odp" || mimeType === "application/vnd.ms-powerpoint") {
      return <FilePpt size={18} className="text-orange-500" weight="fill" />;
    }
    if (ext === "xlsx" || ext === "xls" || ext === "ods" || mimeType === "application/vnd.ms-excel") {
      return <FileXls size={18} className="text-emerald-500" weight="fill" />;
    }
    if (ext === "docx" || ext === "doc" || ext === "odt" || mimeType === "application/msword") {
      return <FileDoc size={18} className="text-blue-500" weight="fill" />;
    }
    if (ext === "zip" || ext === "rar" || ext === "7z" || ext === "tar") {
      return <FileZip size={18} className="text-yellow-600" weight="fill" />;
    }
    if (mimeType) {
      if (mimeType.startsWith("image/")) return <ImageIcon size={18} className="text-purple-500" weight="fill" />;
      if (mimeType.startsWith("video/")) return <FileVideo size={18} className="text-rose-500" weight="fill" />;
      if (mimeType.startsWith("audio/")) return <FileAudio size={18} className="text-sky-500" weight="fill" />;
      if (mimeType === "application/pdf") return <FilePdf size={18} className="text-red-500" weight="fill" />;
    }
    return <File size={18} className="text-muted-foreground/60" />;
  };

  return (
    <header className="h-[60px] md:h-[72px] flex items-center justify-between px-3 md:px-6 bg-background sticky top-0 z-10 gap-2">
      <div className="flex-1 max-w-3xl flex items-center gap-2 md:gap-4">
        {/* Mobile hamburger menu */}
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="md:hidden p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
            title="Open menu"
          >
            <ListIcon size={22} />
          </button>
        )}
        {/* Mobile search icon (only visible on mobile, triggers Universal Search dialog) */}
        {onSearchClick && (
          <button
            onClick={onSearchClick}
            className="md:hidden p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
            title="Search files"
          >
            <MagnifyingGlassIcon size={22} />
          </button>
        )}
        <div ref={searchContainerRef} className="hidden md:flex relative items-center w-full group">
          <div className="absolute left-4 text-muted-foreground group-focus-within:text-primary transition-colors">
            <MagnifyingGlassIcon size={20} />
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
            placeholder="Search files..."
            className="w-full bg-muted/40 hover:bg-muted/60 focus:bg-background border border-neutral-300 dark:border-neutral-700 focus:border-border transition-colors rounded-full py-3 pl-12 pr-16 outline-none focus:ring-1 focus:ring-primary/30 text-foreground text-sm"
          />
          {/* Cmd+K indicator inside search input */}
          <div className="absolute right-4 flex items-center gap-1 pointer-events-none select-none">
            <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted/90 px-1.5 font-mono text-[9px] font-medium text-muted-foreground/80">
              <span>⌘</span>K
            </kbd>
          </div>

          {/* Autocomplete suggestion card */}
          {showSuggestions && query.trim() !== "" && (
            <div className="absolute top-[calc(100%+6px)] left-0 w-full bg-background border border-border/80 shadow-xl rounded-2xl overflow-hidden backdrop-blur-md z-[50] p-1 flex flex-col gap-0.5 animate-in fade-in slide-in-from-top-2 duration-100 select-none">
              {!isSearchIndexLoaded ? (
                <div className="flex items-center justify-center py-4 gap-2 text-xs text-muted-foreground">
                  <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span>Decrypting search index...</span>
                </div>
              ) : suggestions.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  No suggestions found matching &quot;{query}&quot;
                </div>
              ) : (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Quick Suggestions
                  </div>
                  {suggestions.map((item, index) => {
                    const isActive = index === suggestionIdx;
                    const path = getBreadcrumbPath(item.parentId);
                    
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelectSuggestion(item)}
                        onMouseEnter={() => setSuggestionIdx(index)}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                          isActive ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-1 bg-muted dark:bg-neutral-900 rounded shrink-0">
                            {renderIcon(item.type, item.mimeType, item.name)}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs truncate">{item.name}</span>
                            {path && (
                              <span className="text-[9px] text-muted-foreground/75 truncate">
                                in {path}
                              </span>
                            )}
                          </div>
                        </div>
                        {isActive && (
                          <div className="flex items-center gap-1.5 text-[9px] text-primary shrink-0 animate-in fade-in duration-100">
                            <span>Open</span>
                            <ArrowBendDownLeft size={10} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 md:gap-4 ml-2 md:ml-4 text-muted-foreground shrink-0">
        <button
          onClick={onUploadClick}
          className="hidden md:flex p-2.5 bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 rounded-full transition-colors items-center gap-2 cursor-pointer"
          title="Upload media"
        >
          <UploadIcon size={18} weight="bold" />
          <span className="hidden sm:inline text-sm font-medium pr-1">Upload</span>
        </button>
        <button
          onClick={handleThemeToggle}
          className="p-2.5 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
          title="Toggle theme"
        >
          {mounted && currentTheme === "dark" ? <Sun size={24} /> : <Moon size={24} />}
        </button>
        <button
          onClick={onSettingsClick}
          className="hidden sm:block p-2.5 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
          title="Settings"
        >
          <Gear size={24} />
        </button>
        <div className="w-8 h-8 rounded-full overflow-hidden bg-muted flex items-center justify-center ml-2">
          <UserButton />
        </div>
      </div>
    </header>
  );
}
