"use client"

import * as React from "react"
import { 
  X, ShieldCheck, Warning, Key, CaretRight, 
  ToggleLeft, ToggleRight, Gear, CheckCircle, XCircle
} from "@phosphor-icons/react"
import { useCrypto } from "./crypto-provider"
import { useToast } from "@/hooks/use-toast"

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  aiSearchEnabled: boolean;
  onToggleAISearch: (enabled: boolean) => Promise<void>;
}

export function SettingsModal({ 
  isOpen, 
  onClose, 
  aiSearchEnabled, 
  onToggleAISearch 
}: SettingsModalProps) {
  const { recoveryCode, setRecoveryCode } = useCrypto()
  const { toast } = useToast()
  const [showWarning, setShowWarning] = React.useState(false)
  const [isUpdating, setIsUpdating] = React.useState(false)
  const [passphraseInput, setPassphraseInput] = React.useState("")

  if (!isOpen) return null;

  const handleToggleClick = () => {
    if (!aiSearchEnabled) {
      setShowWarning(true);
    } else {
      executeToggle(false);
    }
  };

  const executeToggle = async (enabled: boolean) => {
    setIsUpdating(true);
    try {
      await onToggleAISearch(enabled);
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdating(false);
      setShowWarning(false);
    }
  };

  const handleUpdateRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphraseInput.trim()) return;

    try {
      await setRecoveryCode(passphraseInput);
      setPassphraseInput("");
      toast({
        title: (
          <span className="flex items-center gap-2">
            <CheckCircle size={16} weight="fill" className="text-emerald-500" />
            Recovery key updated
          </span>
        ),
        description: "Your local encryption key cache has been regenerated.",
      });
    } catch (err) {
      console.error(err);
      toast({
        title: (
          <span className="flex items-center gap-2">
            <XCircle size={16} weight="fill" className="text-destructive" />
            Failed to update key
          </span>
        ),
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background border border-border shadow-2xl rounded-2xl w-full max-w-lg flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <Gear size={22} className="text-primary" />
            <h2 className="text-base font-semibold text-foreground">Settings</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
          {/* Section 1: Security & AI */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI & Search Settings</h3>
            
            <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border bg-card/50">
              <div className="space-y-1">
                <h4 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <ShieldCheck size={16} className="text-primary" />
                  Semantic Search (AI Mode)
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed pr-4">
                  Enable secure, privacy-preserving semantic search. When uploading files, their content is transiently processed on our server to generate matching search vectors. No unencrypted raw data is ever saved.
                </p>
              </div>

              <button 
                onClick={handleToggleClick} 
                disabled={isUpdating}
                className="text-primary hover:scale-105 active:scale-95 transition-all outline-none"
              >
                {aiSearchEnabled ? (
                  <ToggleRight size={44} weight="fill" className="text-primary" />
                ) : (
                  <ToggleLeft size={44} weight="light" className="text-muted-foreground" />
                )}
              </button>
            </div>
          </div>

          <div className="h-[1px] bg-border" />

          {/* Section 2: End-to-End Encryption */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">End-to-End Encryption</h3>
            
            <form onSubmit={handleUpdateRecovery} className="space-y-4 p-4 rounded-xl border border-border bg-card/50">
              <div className="space-y-1">
                <h4 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Key size={16} className="text-primary" />
                  Custom Recovery Passphrase
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Your recovery passphrase is the root secret used to derive your local cryptographic key. Enter a new passphrase to update your local vault key.
                </p>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <input 
                  type="password" 
                  placeholder="New Passphrase (min 8 chars)"
                  value={passphraseInput}
                  onChange={(e) => setPassphraseInput(e.target.value)}
                  className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
                />
                <button 
                  type="submit"
                  disabled={passphraseInput.length < 8}
                  className="bg-primary text-primary-foreground hover:bg-primary/95 disabled:opacity-50 px-4 py-2 rounded-lg text-xs font-medium transition-colors shadow-sm"
                >
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Inner Warning Dialog Modal */}
        {showWarning && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-card border border-border shadow-2xl rounded-xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3 text-yellow-500 mb-4">
                <Warning size={28} weight="fill" />
                <h3 className="text-lg font-semibold text-foreground">AI Processing Notice</h3>
              </div>
              
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                Activating secure semantic search means that when you upload new files, their unencrypted contents will be transiently processed on our server to extract a search caption and calculate a numeric embedding.
                <br /><br />
                The unencrypted contents are **never stored** on the server. Only the safe numeric vector is written to the database for matching, ensuring your files remain fully private.
              </p>

              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => setShowWarning(false)}
                  className="px-4 py-2 text-sm font-medium hover:bg-muted border border-border rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => executeToggle(true)}
                  className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/95 rounded-lg shadow transition-colors flex items-center gap-1.5"
                >
                  <ShieldCheck size={16} />
                  Enable Semantic Search
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
