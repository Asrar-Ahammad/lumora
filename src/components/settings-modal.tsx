"use client"

import * as React from "react"
import { 
  X, ShieldCheck, Warning, Key, CaretRight, 
  ToggleLeft, ToggleRight, Gear, CheckCircle, XCircle,
  Bell, BellSlash, DownloadSimple, Export, Plus, DeviceMobile,
  Sun, Moon
} from "@phosphor-icons/react"
import { useCrypto } from "./crypto-provider"
import { useToast } from "@/hooks/use-toast"
import { subscribeUser, unsubscribeUser, sendNotification } from "@/app/pwa-actions"
import { useTheme } from "next-themes"
import { flushSync } from "react-dom"

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  aiSearchEnabled: boolean;
  onToggleAISearch: (enabled: boolean) => Promise<void>;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function SettingsModal({ 
  isOpen, 
  onClose, 
  aiSearchEnabled, 
  onToggleAISearch 
}: SettingsModalProps) {
  const { recoveryCode, setRecoveryCode } = useCrypto()
  const { toast } = useToast()
  
  // State variables for AI search
  const [showWarning, setShowWarning] = React.useState(false)
  const [isUpdating, setIsUpdating] = React.useState(false)
  const [passphraseInput, setPassphraseInput] = React.useState("")

  // State variables for PWA & Push Notifications
  const [isSupported, setIsSupported] = React.useState(false)
  const [subscription, setSubscription] = React.useState<PushSubscription | null>(null)
  const [messageInput, setMessageInput] = React.useState("")
  const [isSubscribing, setIsSubscribing] = React.useState(false)
  const [isSendingTest, setIsSendingTest] = React.useState(false)
  const [isIOS, setIsIOS] = React.useState(false)
  const [isStandalone, setIsStandalone] = React.useState(false)
  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null)

  // Theme
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  const currentTheme = theme === "system" ? resolvedTheme : theme

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Listen to beforeinstallprompt event
  React.useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  // Check PWA and Push notification capabilities
  React.useEffect(() => {
    if (!isOpen) return;

    const checkSupport = async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window;
      setIsSupported(supported);

      if (supported) {
        setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream);
        setIsStandalone(window.matchMedia("(display-mode: standalone)").matches);

        try {
          const registration = await navigator.serviceWorker.register("/sw.js", {
            scope: "/",
            updateViaCache: "none",
          });
          const sub = await registration.pushManager.getSubscription();
          setSubscription(sub);

          // Sync local subscription state with server side
          if (sub) {
            await subscribeUser(JSON.parse(JSON.stringify(sub)));
          }
        } catch (err) {
          console.error("Error registering service worker:", err);
        }
      }
    };

    checkSupport();
  }, [isOpen]);

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

  // Subscribe / Unsubscribe from Push notifications
  const handleTogglePush = async () => {
    if (isSubscribing) return;
    setIsSubscribing(true);
    try {
      if (subscription) {
        // Unsubscribe
        await subscription.unsubscribe();
        await unsubscribeUser();
        setSubscription(null);
        toast({
          title: (
            <span className="flex items-center gap-2">
              <CheckCircle size={16} weight="fill" className="text-emerald-500" />
              Unsubscribed
            </span>
          ),
          description: "You have unsubscribed from push notifications.",
        });
      } else {
        // Subscribe
        const registration = await navigator.serviceWorker.ready;
        const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!publicKey) {
          throw new Error("VAPID public key is not configured in `.env`.");
        }
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        setSubscription(sub);
        await subscribeUser(JSON.parse(JSON.stringify(sub)));
        toast({
          title: (
            <span className="flex items-center gap-2">
              <CheckCircle size={16} weight="fill" className="text-emerald-500" />
              Subscribed to Push Notifications
            </span>
          ),
          description: "This device will now receive secure push notifications.",
        });
      }
    } catch (err: any) {
      console.error("Error toggling push notifications:", err);
      toast({
        title: (
          <span className="flex items-center gap-2">
            <XCircle size={16} weight="fill" className="text-destructive" />
            Notification Setup Failed
          </span>
        ),
        description: err.message || "Make sure notifications are allowed in your browser settings.",
        variant: "destructive",
      });
    } finally {
      setIsSubscribing(false);
    }
  };

  // Dispatch test notification
  const handleSendTestNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || isSendingTest) return;
    setIsSendingTest(true);
    try {
      const res = await sendNotification(messageInput.trim());
      if (res.success) {
        setMessageInput("");
        toast({
          title: (
            <span className="flex items-center gap-2">
              <CheckCircle size={16} weight="fill" className="text-emerald-500" />
              Notification Sent
            </span>
          ),
          description: "A test notification was successfully sent to this device.",
        });
      } else {
        throw new Error(res.error || "Failed to deliver notification");
      }
    } catch (err: any) {
      console.error("Test notification failed:", err);
      toast({
        title: (
          <span className="flex items-center gap-2">
            <XCircle size={16} weight="fill" className="text-destructive" />
            Dispatch Failed
          </span>
        ),
        description: err.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  // Trigger browser app install prompt
  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    setDeferredPrompt(null);
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
          {/* Section 0: Appearance */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Appearance</h3>

            <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card/50">
              <div className="space-y-1">
                <h4 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  {mounted && currentTheme === "dark" ? (
                    <Moon size={16} className="text-primary" />
                  ) : (
                    <Sun size={16} className="text-primary" />
                  )}
                  Theme
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed pr-4">
                  {mounted && currentTheme === "dark" ? "Dark mode is active. Switch to light mode for a brighter interface." : "Light mode is active. Switch to dark mode for a dimmer interface."}
                </p>
              </div>

              <button
                onClick={(e) => {
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
                      { clipPath },
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
                }}
                className="text-primary hover:scale-105 active:scale-95 transition-all outline-none cursor-pointer"
              >
                {mounted && currentTheme === "dark" ? (
                  <ToggleRight size={44} weight="fill" className="text-primary" />
                ) : (
                  <ToggleLeft size={44} weight="light" className="text-muted-foreground" />
                )}
              </button>
            </div>
          </div>

          <div className="h-[1px] bg-border" />

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

          <div className="h-[1px] bg-border" />

          {/* Section 3: App & Notifications */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">App & Notifications (PWA)</h3>

            {/* Install Prompt */}
            {!isStandalone && (
              <div className="p-4 rounded-xl border border-border bg-card/50 space-y-3">
                <div className="space-y-1">
                  <h4 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    <DeviceMobile size={16} className="text-primary" />
                    Install Lumora App
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Install Lumora as a standalone Progressive Web Application on your home screen for quick, premium access and offline shell support.
                  </p>
                </div>

                {deferredPrompt ? (
                  <button
                    onClick={handleInstallClick}
                    className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/95 px-4 py-2 rounded-lg text-xs font-medium transition-all shadow-sm"
                  >
                    <DownloadSimple size={15} weight="bold" />
                    Install Lumora App
                  </button>
                ) : isIOS ? (
                  <div className="bg-muted/50 p-3 rounded-lg border border-border text-xs text-muted-foreground leading-relaxed space-y-1">
                    <span className="font-semibold text-foreground flex items-center gap-1">
                      iOS Install Instructions:
                    </span>
                    <p className="flex items-center gap-1 flex-wrap font-medium">
                      Tap the Share button
                      <Export size={14} className="text-primary inline mx-0.5" />
                      and then choose
                      <span className="text-foreground flex items-center gap-0.5 border border-border bg-card px-1 py-0.5 rounded shadow-sm text-[11px]">
                        <Plus size={10} className="inline text-primary" /> Add to Home Screen
                      </span>
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground italic">
                    Open this app in a compatible browser (like Chrome or Safari) to enable direct installation.
                  </p>
                )}
              </div>
            )}

            {/* Push Notifications Manager */}
            {isSupported ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border bg-card/50">
                  <div className="space-y-1">
                    <h4 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      {subscription ? (
                        <Bell size={16} className="text-primary animate-bounce" />
                      ) : (
                        <BellSlash size={16} className="text-muted-foreground" />
                      )}
                      Push Notifications
                    </h4>
                    <p className="text-xs text-muted-foreground leading-relaxed pr-4">
                      Receive alerts on your device for completed file processing, secure sharing invitations, and storage limits.
                    </p>
                  </div>

                  <button 
                    onClick={handleTogglePush} 
                    disabled={isSubscribing}
                    className="text-primary hover:scale-105 active:scale-95 transition-all outline-none"
                  >
                    {subscription ? (
                      <ToggleRight size={44} weight="fill" className="text-primary" />
                    ) : (
                      <ToggleLeft size={44} weight="light" className="text-muted-foreground" />
                    )}
                  </button>
                </div>

                {/* Send Test Notification Form */}
                {subscription && (
                  <form onSubmit={handleSendTestNotification} className="p-4 rounded-xl border border-dashed border-border bg-card/25 space-y-3 animate-in fade-in duration-200">
                    <div className="space-y-1">
                      <h4 className="text-xs font-semibold text-foreground">Test Push Dispatch</h4>
                      <p className="text-[10px] text-muted-foreground">
                        Enter a message below to test if your subscription is working correctly.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        placeholder="Hello from Lumora!"
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
                        disabled={isSendingTest}
                      />
                      <button 
                        type="submit"
                        disabled={!messageInput.trim() || isSendingTest}
                        className="bg-muted hover:bg-muted/80 text-foreground border border-border disabled:opacity-50 px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                      >
                        {isSendingTest ? "Sending..." : "Send Test"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-border bg-destructive/10 text-destructive text-xs leading-relaxed flex items-center gap-2">
                <Warning size={20} />
                <span>Web push notifications are not supported by this browser. Try Chrome, Edge, or Safari on iOS 16.4+.</span>
              </div>
            )}
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
