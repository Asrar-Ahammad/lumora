"use client"

import * as React from "react";
import { Gear, Sun, Moon, UploadIcon, MagnifyingGlassIcon, ListIcon } from "@phosphor-icons/react";
import { UserButton } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { flushSync } from "react-dom";

interface TopbarProps {
  query: string;
  setQuery: (q: string) => void;
  onUploadClick: () => void;
  onSettingsClick: () => void;
  onMenuClick?: () => void;
}

export function Topbar({ query, setQuery, onUploadClick, onSettingsClick, onMenuClick }: TopbarProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
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
        <div className="relative flex items-center w-full group">
          <div className="absolute left-4 text-muted-foreground group-focus-within:text-primary transition-colors">
            <MagnifyingGlassIcon size={20} />
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full bg-muted/40 hover:bg-muted/60 focus:bg-background border border-neutral-300 dark:border-neutral-700 focus:border-border transition-colors rounded-full py-3 pl-12 pr-4 outline-none focus:ring-1 focus:ring-primary/30 text-foreground text-sm"
          />
        </div>
      </div>
      <div className="flex items-center gap-1.5 md:gap-4 ml-2 md:ml-4 text-muted-foreground shrink-0">
        <button 
          onClick={onUploadClick} 
          className="p-2.5 bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 rounded-full transition-colors flex items-center gap-2 cursor-pointer"
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
