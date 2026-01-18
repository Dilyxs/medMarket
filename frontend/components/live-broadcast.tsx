"use client";

import { useEffect, useMemo, useState } from "react";

interface Annotation {
  color?: string;
  rect?: { x?: number; y?: number; width?: number; height?: number };
  dot?: { x?: number; y?: number; radius?: number };
}

interface IncomingFrame {
  frame?: string | number[];
  annotations?: Annotation[];
}

const WS_URL = process.env.NEXT_PUBLIC_BROADCAST_WS || "ws://localhost:8080/viewer";

type Status = "connecting" | "open" | "closed" | "error";

export function LiveBroadcastViewer() {
  const [status, setStatus] = useState<Status>("connecting");
  const [lastFrame, setLastFrame] = useState<IncomingFrame | null>(null);
  const [receivedCount, setReceivedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const socket = new WebSocket(WS_URL);

    socket.addEventListener("open", () => {
      if (!isMounted) return;
      setStatus("open");
      setError(null);
    });

    socket.addEventListener("message", (event) => {
      if (!isMounted) return;
      try {
        const data = JSON.parse(event.data) as IncomingFrame;
        setLastFrame(data);
        setReceivedCount((c) => c + 1);
      } catch (err) {
        console.error("Failed to parse broadcast message", err);
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

  const frameUrl = useMemo(() => {
    if (!lastFrame?.frame) return null;
    if (typeof lastFrame.frame === "string") {
      return `data:image/jpeg;base64,${lastFrame.frame}`;
    }
    // If frame is an array of bytes, try to convert to base64
    if (Array.isArray(lastFrame.frame)) {
      try {
        const uint = Uint8Array.from(lastFrame.frame as number[]);
        const bin = String.fromCharCode(...uint);
        const b64 = btoa(bin);
        return `data:image/jpeg;base64,${b64}`;
      } catch (err) {
        console.error("Failed to convert frame", err);
      }
    }
    return null;
  }, [lastFrame]);

  const annotationCount = lastFrame?.annotations?.length ?? 0;

  return (
    <div className="w-full h-full flex flex-col bg-card border border-border rounded-lg shadow-lg">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              status === "open" ? "bg-green-500" : status === "connecting" ? "bg-amber-400" : "bg-red-500"
            }`}
            aria-hidden
          />
          <span className="text-sm font-medium text-foreground">Live Stream</span>
        </div>
        <span className="text-xs text-muted-foreground">{status}</span>
      </div>

      <div className="flex-1 p-3 overflow-hidden">
        {frameUrl ? (
          <img
            src={frameUrl}
            alt="Broadcast frame"
            className="h-full w-full object-contain rounded-md border border-border"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground text-center px-4">
            {status === "connecting"
              ? "Connecting to live stream..."
              : status === "open"
              ? "No frame received yet."
              : "Stream unavailable."}
          </div>
        )}
      </div>

      <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
        <span>{receivedCount} frame(s) received</span>
        <span>{annotationCount} annotation(s)</span>
      </div>

      {error ? <div className="px-4 pb-2 text-xs text-red-600">{error}</div> : null}
    </div>
  );
}
