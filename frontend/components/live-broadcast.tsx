"use client";

import { useEffect, useMemo, useState } from "react";

// Backend Data Structures
interface BoundingBox {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
  width: number;
  height: number;
}

interface Region {
  mask_index: number;
  bounding_box: BoundingBox;
  centroid: { x: number; y: number };
  area_pixels: number;
}

interface MLAnalysisResult {
    frame_index: number;
    masks_detected: number;
    regions: Region[];
}

interface IncomingFrame {
  frame?: string | number[];
  analysis?: MLAnalysisResult;
}

const WS_URL = process.env.NEXT_PUBLIC_BROADCAST_WS || "ws://localhost:8080/viewer";

type Status = "connecting" | "open" | "closed" | "error";

export function LiveBroadcastViewer() {
  const [status, setStatus] = useState<Status>("connecting");
  const [lastFrame, setLastFrame] = useState<IncomingFrame | null>(null);
  const [receivedCount, setReceivedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{width: number, height: number} | null>(null);

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
        // Handle plain text messages (like "stream has ended")
        if (typeof event.data === 'string' && !event.data.trim().startsWith('{')) {
          console.log("Viewer: Received text message:", event.data);
          return;
        }
        
        const data = JSON.parse(event.data) as IncomingFrame;
        // console.log("Viewer: Received frame", data);
        if (data.frame) console.log("Viewer received frame data length:", data.frame.length);
        setLastFrame(data);
        setReceivedCount((c) => c + 1);
      } catch (err) {
        console.error("Failed to parse broadcast message", err, "Raw data:", event.data);
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

  // Determine annotations from analysis results
  const regions = lastFrame?.analysis?.regions || [];
  const maskCount = lastFrame?.analysis?.masks_detected || 0;

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

      <div className="flex-1 relative p-3 overflow-hidden bg-black flex items-center justify-center">
        {frameUrl ? (
            <div className="relative w-full h-full flex items-center justify-center">
                <canvas 
                    ref={(canvas) => {
                        if (!canvas || !frameUrl || !imageDimensions) return;
                        
                        const ctx = canvas.getContext('2d');
                        if (!ctx) return;
                        
                        // Set canvas size to match image
                        canvas.width = imageDimensions.width;
                        canvas.height = imageDimensions.height;
                        
                        // Load and draw the base image
                        const img = new window.Image();
                        img.onload = () => {
                            ctx.drawImage(img, 0, 0);
                            
                            // Draw masks on top
                            regions.forEach((region, i) => {
                                if (region.mask) {
                                    const maskImg = new window.Image();
                                    maskImg.onload = () => {
                                        // Create a temporary canvas for the mask
                                        const tempCanvas = document.createElement('canvas');
                                        tempCanvas.width = imageDimensions.width;
                                        tempCanvas.height = imageDimensions.height;
                                        const tempCtx = tempCanvas.getContext('2d');
                                        if (!tempCtx) return;
                                        
                                        // Draw mask at full size
                                        tempCtx.drawImage(maskImg, 0, 0, imageDimensions.width, imageDimensions.height);
                                        
                                        // Get mask data
                                        const maskData = tempCtx.getImageData(0, 0, imageDimensions.width, imageDimensions.height);
                                        
                                        // Create colored overlay
                                        const overlayData = ctx.createImageData(imageDimensions.width, imageDimensions.height);
                                        const colors = [
                                            [255, 0, 0],      // Red
                                            [0, 255, 0],      // Green  
                                            [0, 0, 255],      // Blue
                                            [255, 255, 0],    // Yellow
                                        ];
                                        const color = colors[i % colors.length];
                                        
                                        for (let j = 0; j < maskData.data.length; j += 4) {
                                            const alpha = maskData.data[j]; // Grayscale value from mask
                                            if (alpha > 128) {
                                                overlayData.data[j] = color[0];
                                                overlayData.data[j + 1] = color[1];
                                                overlayData.data[j + 2] = color[2];
                                                overlayData.data[j + 3] = 120; // Semi-transparent
                                            }
                                        }
                                        
                                        // Draw overlay on main canvas
                                        ctx.putImageData(overlayData, 0, 0);
                                    };
                                    maskImg.src = `data:image/png;base64,${region.mask}`;
                                }
                            });
                        };
                        img.src = frameUrl;
                    }}
                    className="max-h-full max-w-full object-contain"
                />
            </div>
        ) : (
          <div className="text-sm text-muted-foreground text-center">
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
        <span>{maskCount} object(s) detected</span>
      </div>

      {error ? <div className="px-4 pb-2 text-xs text-red-600">{error}</div> : null}
    </div>
  );
}
