"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChatMessage {
  user: string;
  text: string;
  ts: number;
}

type ConnStatus = "connecting" | "open" | "closed" | "error";

const WS_URL = process.env.NEXT_PUBLIC_CHAT_WS || "ws://localhost:8080/chat";

export function LiveChatPanel() {
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [userLabel, setUserLabel] = useState<string>("Guest");
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load current user name/email for display
  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        const u = data.user;
        if (u?.name) setUserLabel(u.name);
        else if (u?.email) setUserLabel(u.email);
      } catch {
        /* ignore */
      }
    };
    loadUser();
  }, []);

  // Connect WebSocket
  useEffect(() => {
    let isMounted = true;
    const socket = new WebSocket(WS_URL);
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      if (!isMounted) return;
      setStatus("open");
      setError(null);
    });

    socket.addEventListener("message", (event) => {
      if (!isMounted) return;
      try {
        const payload = JSON.parse(event.data);
        const text = payload.text || payload.message || payload.content || "";
        const user = payload.user || payload.username || "Anon";
        const ts = Number(payload.ts) || Date.now();
        if (!text) return;
        setMessages((prev) => [...prev, { user, text, ts }]);
      } catch (err) {
        console.error("live chat parse error", err);
      }
    });

    socket.addEventListener("close", () => {
      if (!isMounted) return;
      setStatus("closed");
    });

    socket.addEventListener("error", () => {
      if (!isMounted) return;
      setStatus("error");
      setError("Connection error");
    });

    return () => {
      isMounted = false;
      socket.close();
    };
  }, []);

  const canSend = status === "open" && input.trim().length > 0;

  const handleSend = () => {
    if (!canSend) return;
    const payload = { user: userLabel || "Anon", text: input.trim(), ts: Date.now() };
    try {
      socketRef.current?.send(JSON.stringify(payload));
      setInput("");
    } catch (err) {
      console.error("live chat send error", err);
      setError("Failed to send message");
    }
  };

  const statusDot = useMemo(() => {
    if (status === "open") return "bg-green-500";
    if (status === "connecting") return "bg-amber-400";
    if (status === "error") return "bg-red-500";
    return "bg-gray-400";
  }, [status]);

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${statusDot}`} aria-hidden />
          <span className="text-sm font-medium text-foreground">Live Chat</span>
        </div>
        <span className="text-xs text-muted-foreground">{status}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm">
        {messages.length === 0 ? (
          <div className="text-muted-foreground text-center text-sm mt-8">
            {status === "connecting" ? "Connecting to chat..." : "No messages yet."}
          </div>
        ) : (
          messages.map((m, idx) => (
            <div key={idx} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{m.user === userLabel ? "You" : m.user}</span>
                <span>·</span>
                <span>{new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div className="rounded-md bg-muted text-foreground px-3 py-2">{m.text}</div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {error ? <div className="px-4 text-xs text-red-600 pb-1">{error}</div> : null}

      <div className="border-t border-border px-3 py-3 flex items-center gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={status === "open" ? "Type a message" : "Connecting..."}
          disabled={status !== "open"}
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <Button onClick={handleSend} disabled={!canSend} className="px-3">
          Send
        </Button>
      </div>
    </div>
  );
}
