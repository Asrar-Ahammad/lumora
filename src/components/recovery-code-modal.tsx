"use client"

import * as React from "react"
import { useAuth } from "@clerk/nextjs"

export function RecoveryCodeModal() {
  const { userId } = useAuth();
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    if (userId) {
      const hasSeen = localStorage.getItem(`has_seen_recovery_${userId}`);
      if (!hasSeen) {
        setIsOpen(true);
      }
    }
  }, [userId]);

  const handleDownload = () => {
    if (!userId) return;
    const blob = new Blob([`LUMORA RECOVERY CODE\nKeep this safe!\n\n${userId}`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "lumora-recovery-code.txt";
    a.click();
    URL.revokeObjectURL(url);
    
    localStorage.setItem(`has_seen_recovery_${userId}`, "true");
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl shadow-2xl max-w-lg w-full p-8 border border-border/50 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-red-500/10 text-red-500 rounded-full">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Save Your Recovery Code</h2>
        </div>
        <div className="space-y-4 text-muted-foreground text-sm leading-relaxed mb-6">
          <p>
            Lumora uses true End-to-End Encryption. Your encryption key is derived securely on your device and never sent to our servers.
          </p>
          <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-xl">
            <strong>CRITICAL WARNING:</strong> If you ever lose access to your account (e.g., password reset that changes your underlying account ID), you <strong>must</strong> have this recovery code to decrypt your existing media. We cannot recover your files without it.
          </div>
        </div>
        <div className="bg-muted p-4 rounded-xl font-mono text-sm break-all text-center select-all border border-border/50 mb-6">
          {userId}
        </div>
        <button 
          onClick={handleDownload}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 rounded-xl font-medium transition-colors shadow-sm"
        >
          Download & Acknowledge
        </button>
      </div>
    </div>
  );
}
