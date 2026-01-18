"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatWidget } from "@/components/chat-widget";
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

      {/* Main Content */}
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <h1 className="text-4xl font-bold text-foreground mb-4">Welcome to medmarket</h1>
        <p className="text-lg text-muted-foreground max-w-2xl text-center">
          Upload or describe medical market data, and let our AI assistant help you understand and analyze it.
        </p>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl">
          <div className="p-6 border border-border rounded-lg">
            <h3 className="font-semibold text-foreground mb-2">Describe Your Data</h3>
            <p className="text-sm text-muted-foreground">
              Tell the AI what you see on your screen, and it will ask clarifying questions to understand your medical market data better.
            </p>
          </div>

          <div className="p-6 border border-border rounded-lg">
            <h3 className="font-semibold text-foreground mb-2">Get Insights</h3>
            <p className="text-sm text-muted-foreground">
              Receive personalized analysis and recommendations based on your data and market trends.
            </p>
          </div>

          <div className="p-6 border border-border rounded-lg">
            <h3 className="font-semibold text-foreground mb-2">Real-time Assistance</h3>
            <p className="text-sm text-muted-foreground">
              Our AI assistant is always ready to help you clarify details and understand your medical market information.
            </p>
          </div>
        </div>
      </div>

      {/* Chat Widget */}
      {isChatOpen && <ChatWidget isOpen={isChatOpen} onToggle={() => setIsChatOpen(false)} />}

      {/* Toggle Button (when chat is closed) */}
      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-4 right-4 p-4 bg-primary text-primary-foreground rounded-full shadow-lg hover:bg-primary/90 transition z-40"
          aria-label="Open chat"
        >
          <MessageCircleIcon size={24} />
        </button>
      )}
    </div>
  );
}
