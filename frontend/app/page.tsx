"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatWidget } from "@/components/chat-widget";
import { LiveBroadcastViewer } from "@/components/live-broadcast";
import { LiveChatPanel } from "@/components/live-chat";
import { BettingPanel } from "@/components/betting-panel";
import { TestDepositPanel } from "@/components/test-deposit-panel";
import { Button } from "@/components/ui/button";
import { MessageCircleIcon, User2Icon } from "lucide-react";

type User = {
  _id?: string;
  email: string;
  name?: string | null;
  newsletter?: boolean;
};

export default function Home() {
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [assistantUnlocked, setAssistantUnlocked] = useState(false);
  const assistantPriceSol = 0.4;
  const router = useRouter();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) {
          router.replace("/auth/sign-in");
          return;
        }
        const data = await res.json();
        if (data?.user) {
          setUser(data.user);
          setAuthChecked(true);
        } else {
          router.replace("/auth/sign-in");
        }
      } catch {
        router.replace("/auth/sign-in");
      }
    };
    loadUser();
  }, [router]);

  // Persist assistant unlock state for the session
  useEffect(() => {
    const stored = sessionStorage.getItem("assistantUnlocked");
    if (stored === "true") setAssistantUnlocked(true);
  }, []);

  const handleUnlockAssistant = async () => {
    try {
      const res = await fetch("/api/unlock-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ user_id: user?._id }),
      });

      if (res.ok) {
        setAssistantUnlocked(true);
        sessionStorage.setItem("assistantUnlocked", "true");
      } else {
        const error = await res.json();
        alert(`Unlock failed: ${error.error || "Unknown error"}`);
      }
    } catch (err) {
      alert(`Error unlocking assistant: ${err}`);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setMenuOpen(false);
    router.push("/auth/sign-in");
  };

  const initial = useMemo(() => {
    if (user?.name) return user.name.slice(0, 1).toUpperCase();
    if (user?.email) return user.email.slice(0, 1).toUpperCase();
    return "";
  }, [user]);

  if (!authChecked) {
    // Prevent any protected content from rendering until auth is confirmed
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar with profile menu */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="text-lg font-semibold text-foreground">medmarket</div>
        <div className="flex items-center gap-3">
          {user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((p) => !p)}
                className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm font-medium hover:border-primary/60 hover:bg-muted/60 transition"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                  {initial || <User2Icon size={16} />}
                </div>
                <div className="text-left">
                  <div className="leading-tight text-foreground">{user.name || user.email}</div>
                  <div className="leading-tight text-xs text-muted-foreground">Profile</div>
                </div>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-md border border-border bg-card shadow-lg z-50">
                  <button
                    className="w-full text-left px-4 py-2 text-sm hover:bg-muted"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/settings");
                    }}
                  >
                    Settings
                  </button>
                  <button
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-muted"
                    onClick={handleLogout}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => router.push("/auth/sign-in")}>Sign in</Button>
              <Button onClick={() => router.push("/sign-up")}>Sign up</Button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content - 4 corners */}
      <div className="grid grid-cols-[2.25fr_0.75fr] grid-rows-[2.8fr_2.2fr] gap-0 h-[calc(100vh-73px)] overflow-hidden">
        {/* Top Left - Live Viewer */}
        <div className="bg-card flex items-center justify-center border-r border-b border-border p-4 overflow-hidden">
          <LiveBroadcastViewer />
        </div>

        {/* Top Right - Live Chat + Test Panel */}
        <div className="bg-card border-b border-border p-4 overflow-hidden flex flex-col gap-3">
          <TestDepositPanel />
          <div className="flex-1 overflow-hidden">
            <LiveChatPanel />
          </div>
        </div>

        {/* Bottom Left - Place Your Bets */}
        <div className="bg-card border-r border-border p-6 overflow-hidden">
          <BettingPanel />
        </div>

        {/* Bottom Right - AI Assistant */}
        <div className="relative bg-card p-4 overflow-hidden">
          <div className={assistantUnlocked ? "" : "pointer-events-none blur-sm"}>
            {isChatOpen && (
              <ChatWidget isOpen={isChatOpen} onToggle={() => setIsChatOpen(false)} />
            )}
            {!isChatOpen && (
              <button
                onClick={() => setIsChatOpen(true)}
                className="absolute bottom-4 right-4 p-4 bg-primary text-primary-foreground rounded-full shadow-lg hover:bg-primary/90 transition z-40"
                aria-label="Open chat"
              >
                <MessageCircleIcon size={24} />
              </button>
            )}
          </div>

          {!assistantUnlocked && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-sm border border-border rounded-md flex items-center justify-center z-50">
              <div className="text-center space-y-3 p-4">
                <div className="text-lg font-semibold text-foreground">MedMarket Assistant</div>
                <div className="text-sm text-muted-foreground">Unlock for {assistantPriceSol.toFixed(2)} SOL per game</div>
                <Button
                  onClick={handleUnlockAssistant}
                  className="px-5 py-2 font-semibold bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg shadow-lg"
                >
                  Unlock for {assistantPriceSol.toFixed(2)} SOL
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
