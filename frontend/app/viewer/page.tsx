"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatWidget } from "@/components/chat-widget";
import { LiveBroadcastViewer } from "@/components/live-broadcast";
import { LiveChatPanel } from "@/components/live-chat";
import { QuizPanel } from "@/components/quiz-panel";
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
  const router = useRouter();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) {
          setUser(null);
          return;
        }
        const data = await res.json();
        setUser(data.user || null);
      } catch {
        setUser(null);
      }
    };
    loadUser();
  }, []);

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
      <div className="grid grid-cols-[2.25fr_0.75fr] grid-rows-[3fr_2fr] gap-0 h-[calc(100vh-73px)] overflow-hidden">
        {/* Top Left - Live Viewer */}
        <div className="bg-card flex items-center justify-center border-r border-b border-border p-4 overflow-hidden">
          <LiveBroadcastViewer />
        </div>

        {/* Top Right - Live Chat */}
        <div className="bg-card border-b border-border p-4 overflow-hidden flex flex-col">
          <LiveChatPanel />
        </div>

        {/* Bottom Left - Quiz Betting */}
        <div className="bg-card border-r border-border p-4 overflow-y-auto">
          <QuizPanel />
        </div>

        {/* Bottom Right - AI Assistant */}
        <div className="relative bg-card p-4 overflow-hidden">
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
      </div>
    </div>
  );
}
