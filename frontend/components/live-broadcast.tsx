"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface BoundingBox {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
  width: number;
  height: number;
}

interface Centroid {
  x: number;
  y: number;
}

interface Region {
  mask_index: number;
  bounding_box: BoundingBox;
  centroid: Centroid;
  area_pixels: number;
  polygon?: number[][];
}

interface AnnotationMetadata {
  frame_index: number;
  masks_detected: number;
  regions: Region[];
}

interface IncomingFrame {
  frame: string;
  metadata: AnnotationMetadata;
}

const WS_URL = process.env.NEXT_PUBLIC_BROADCAST_WS || "ws://localhost:8080/viewer";

type Status = "connecting" | "open" | "closed" | "error";

export function LiveBroadcastViewer() {
  const [status, setStatus] = useState<Status>("connecting");
  const [lastFrame, setLastFrame] = useState<IncomingFrame | null>(null);
  const [receivedCount, setReceivedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
        
        // Clear canvas if no regions detected
        if (data.metadata && data.metadata.masks_detected === 0) {
          const canvas = canvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
          }
        }
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
    return null;
  }, [lastFrame]);

  // Draw annotations on canvas overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !lastFrame?.metadata?.regions) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Wait for image to load before drawing
    const drawAnnotations = () => {
      const imgRect = img.getBoundingClientRect();
      
      // Set canvas dimensions to match displayed image size
      canvas.width = imgRect.width;
      canvas.height = imgRect.height;

      // Clear previous drawings
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Get actual image dimensions (not displayed size, but intrinsic size)
      const videoWidth = img.naturalWidth || 180;
      const videoHeight = img.naturalHeight || 180;

      // Calculate scaling factors from video space to display space
      const scaleX = canvas.width / videoWidth;
      const scaleY = canvas.height / videoHeight;

      // Draw each region's bounding box
      lastFrame.metadata.regions.forEach((region, idx) => {
        const bbox = region.bounding_box;
        
        // Scale coordinates from video space to display space
        const x = bbox.x_min * scaleX;
        const y = bbox.y_min * scaleY;
        const width = bbox.width * scaleX;
        const height = bbox.height * scaleY;

        const color = `hsl(${(idx * 137) % 360}, 70%, 50%)`;
        
        // Draw polygon if available (filled with transparency)
        if (region.polygon && region.polygon.length > 0) {
          ctx.beginPath();
          region.polygon.forEach((point, i) => {
            const px = point[0] * scaleX;
            const py = point[1] * scaleY;
            if (i === 0) {
              ctx.moveTo(px, py);
            } else {
              ctx.lineTo(px, py);
            }
          });
          ctx.closePath();
          
          // Fill with semi-transparent color
          ctx.fillStyle = color.replace('50%', '50%').replace(')', ', 0.3)');
          ctx.fill();
          
          // Stroke the outline
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          // Fallback to bounding box if no polygon
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, width, height);
        }

        // Draw centroid
        const cx = region.centroid.x * scaleX;
        const cy = region.centroid.y * scaleY;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
        ctx.fill();

        // Draw label
        ctx.fillStyle = color;
        ctx.font = "12px sans-serif";
        ctx.fillText(`Region ${region.mask_index}`, x, y - 5);
      });
    };

    // If image already loaded, draw immediately
    if (img.complete && img.naturalWidth > 0) {
      drawAnnotations();
    } else {
      // Otherwise wait for load
      img.addEventListener("load", drawAnnotations);
      return () => img.removeEventListener("load", drawAnnotations);
    }
  }, [lastFrame]);

  const annotationCount = lastFrame?.metadata?.regions?.length ?? 0;

  return (
    <div className="w-full max-w-md max-h-[500px] flex flex-col bg-card border border-border rounded-lg shadow-lg">
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
        <div className="relative h-full w-full">
          {frameUrl ? (
            <>
              <img
                ref={imgRef}
                src={frameUrl}
                alt="Broadcast frame"
                className="h-full w-full object-contain rounded-md border border-border"
              />
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 h-full w-full object-contain pointer-events-none"
                style={{ mixBlendMode: "normal" }}
              />
            </>
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
      </div>

      <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
        <span>{receivedCount} frame(s) received</span>
        <div className="flex items-center gap-3">
          <span>{annotationCount} annotation(s)</span>
          {lastFrame?.metadata && (
            <div className="flex items-center gap-1">
              {lastFrame.metadata.masks_detected > 0 ? (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-green-600 font-medium">AI Active</span>
                </>
              ) : (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
                  <span className="text-gray-500">Raw Video</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {error ? <div className="px-4 pb-2 text-xs text-red-600">{error}</div> : null}
    </div>
  );
}
