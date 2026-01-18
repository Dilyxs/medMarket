"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

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

interface VideoFrameWithAnnotations {
  frame: string;
  hasRectangle: boolean;
  rectangle: {
    x1: number;
    x2: number;
    y1: number;
    y2: number;
  };
}

interface IncomingFrameData {
  frame: string;
  metadata: AnnotationMetadata;
}

export default function VideoBroadcaster() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const frameIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [status, setStatus] = useState<"connecting" | "open" | "closed" | "error">("connecting");
  const [frameCount, setFrameCount] = useState(0);
  const frameIndexRef = useRef(0);
  const reconnectDelayRef = useRef(1000); // Start with 1 second
  
  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
  const [rectangle, setRectangle] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const rectangleRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  
  // Polygon overlay state
  const [polygonMetadata, setPolygonMetadata] = useState<AnnotationMetadata | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const connectWebSocket = () => {
    try {
      const socket = new WebSocket("ws://localhost:8080/broadcaster");
      
      socket.addEventListener("open", () => {
        console.log("Broadcaster WebSocket connected");
        setStatus("open");
        reconnectDelayRef.current = 1000; // Reset delay on successful connection
      });

      socket.addEventListener("close", () => {
        console.log("Broadcaster WebSocket closed, attempting reconnect...");
        setStatus("closed");
        socketRef.current = null;
        
        // Attempt reconnection with exponential backoff
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 8000); // Max 8 seconds
          connectWebSocket();
        }, reconnectDelayRef.current);
      });

      socket.addEventListener("error", (error) => {
        console.error("Broadcaster WebSocket error:", error);
        setStatus("error");
      });
      
      socket.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(event.data) as IncomingFrameData;
          if (data.metadata) {
            // Clear polygon if no regions detected
            if (data.metadata.masks_detected === 0) {
              setPolygonMetadata(null);
            } else {
              setPolygonMetadata(data.metadata);
            }
          }
        } catch (err) {
          console.error("Failed to parse broadcaster message:", err);
        }
      });

      socketRef.current = socket;
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
      setStatus("error");
      
      // Retry connection
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 8000);
        connectWebSocket();
      }, reconnectDelayRef.current);
    }
  };

  const handleVideoEnded = () => {
    const video = videoRef.current;
    if (!video) return;

    // Loop back to the beginning
    video.currentTime = 0;
    video.play();
  };

  const handleTimeUpdate = () => {
    // No longer needed
  };

  const captureAndSendFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const socket = socketRef.current;

    if (!video || !canvas || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    if (video.paused || video.ended) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas dimensions to match video
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert canvas to blob and then to base64
    canvas.toBlob(
      (blob) => {
        if (!blob || !socket || socket.readyState !== WebSocket.OPEN) return;

        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          // Remove the "data:image/jpeg;base64," prefix
          const base64Frame = base64data.split(",")[1];

          const currentRectangle = rectangleRef.current;
          const frameData: VideoFrameWithAnnotations = {
            frame: base64Frame,
            hasRectangle: currentRectangle !== null,
            rectangle: currentRectangle || { x1: 0, y1: 0, x2: 0, y2: 0 },
          };

          try {
            // Debug logging
            if (frameIndexRef.current % 30 === 0) {
              console.log("Frame data:", {
                frameIndex: frameIndexRef.current,
                frameLength: base64Frame.length,
                hasRectangle: currentRectangle !== null,
                rectangleRefValue: rectangleRef.current,
                rectangle: currentRectangle || { x1: 0, y1: 0, x2: 0, y2: 0 },
              });
            }
            socket.send(JSON.stringify(frameData));
            frameIndexRef.current++;
            setFrameCount((prev) => prev + 1);
          } catch (error) {
            console.error("Failed to send frame:", error);
          }
        };
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      0.8
    );
  };

  // Render polygons on overlay canvas
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    const container = videoContainerRef.current;
    
    if (!canvas || !video || !container) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const drawPolygons = () => {
      const rect = container.getBoundingClientRect();
      
      // Set canvas dimensions to match display size
      canvas.width = rect.width;
      canvas.height = rect.height;
      
      // Clear previous drawings
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // If no polygon metadata, just clear and return
      if (!polygonMetadata?.regions) return;
      
      // Get video dimensions for scaling
      const videoWidth = video.videoWidth || 180;
      const videoHeight = video.videoHeight || 180;
      
      const scaleX = canvas.width / videoWidth;
      const scaleY = canvas.height / videoHeight;
      
      // Draw each region
      polygonMetadata.regions.forEach((region, idx) => {
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
    
    drawPolygons();
    
    // Redraw on window resize
    window.addEventListener("resize", drawPolygons);
    return () => window.removeEventListener("resize", drawPolygons);
  }, [polygonMetadata]);
  
  useEffect(() => {
    // Connect WebSocket
    connectWebSocket();

    // Start frame capture interval with 75ms delay between frames
    frameIntervalRef.current = setInterval(() => {
      captureAndSendFrame();
    }, 150);

    // Cleanup
    return () => {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
      }
      if (reverseIntervalRef.current) {
        clearInterval(reverseIntervalRef.current);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const getRelativeCoordinates = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = videoContainerRef.current;
    const video = videoRef.current;
    if (!container || !video) return null;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert to video coordinate space
    const scaleX = video.videoWidth / rect.width;
    const scaleY = video.videoHeight / rect.height;

    return {
      display: { x, y },
      video: { x: x * scaleX, y: y * scaleY }
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const coords = getRelativeCoordinates(e);
    if (!coords) return;

    setIsDrawing(true);
    setStartPoint(coords.display);
    setCurrentPoint(coords.display);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing) return;

    const coords = getRelativeCoordinates(e);
    if (!coords) return;

    setCurrentPoint(coords.display);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPoint) return;

    const coords = getRelativeCoordinates(e);
    if (!coords) return;

    setIsDrawing(false);

    // Calculate video coordinates for both points
    const video = videoRef.current;
    const container = videoContainerRef.current;
    if (!video || !container) return;

    const rect = container.getBoundingClientRect();
    const scaleX = video.videoWidth / rect.width;
    const scaleY = video.videoHeight / rect.height;

    const x1 = Math.round(startPoint.x * scaleX);
    const y1 = Math.round(startPoint.y * scaleY);
    const x2 = Math.round(coords.display.x * scaleX);
    const y2 = Math.round(coords.display.y * scaleY);

    // Persist rectangle state - it will be embedded in every frame from now on
    const rectData = { x1, y1, x2, y2 };
    setRectangle(rectData);
    rectangleRef.current = rectData;
    console.log("Rectangle set:", rectData);

    // Reset drawing state
    setStartPoint(null);
    setCurrentPoint(null);
  };

  const getStatusColor = () => {
    switch (status) {
      case "open":
        return "bg-green-500";
      case "connecting":
        return "bg-yellow-500";
      case "closed":
      case "error":
        return "bg-red-500";
    }
  };

  const handleClearRectangle = () => {
    console.log("Clear button clicked - before:", { rectangle, rectangleRef: rectangleRef.current });
    setRectangle(null);
    rectangleRef.current = null;
    setPolygonMetadata(null);
    console.log("Clear button clicked - after:", { rectangle: null, rectangleRef: null });
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-center gap-2 text-xl font-semibold">
          Video Broadcaster
          <span className={`inline-block w-3 h-3 rounded-full ${getStatusColor()}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Video player */}
          <div 
            ref={videoContainerRef}
            className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video cursor-crosshair"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              if (isDrawing) {
                setIsDrawing(false);
                setStartPoint(null);
                setCurrentPoint(null);
              }
            }}
          >
            <video
              ref={videoRef}
              className="w-full h-full"
              autoPlay
              muted
              playsInline
              onEnded={handleVideoEnded}
              onTimeUpdate={handleTimeUpdate}
            >
              <source src="/echo1.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
            
            {/* Polygon overlay canvas */}
            <canvas
              ref={overlayCanvasRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
            />

            {/* Drawing overlay */}
            {isDrawing && startPoint && currentPoint && (
              <div
                className="absolute border-2 border-red-500 bg-red-500/20 pointer-events-none"
                style={{
                  left: Math.min(startPoint.x, currentPoint.x),
                  top: Math.min(startPoint.y, currentPoint.y),
                  width: Math.abs(currentPoint.x - startPoint.x),
                  height: Math.abs(currentPoint.y - startPoint.y),
                }}
              />
            )}
          </div>

          {/* Hidden canvas for frame extraction */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Status info */}
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Status: {status}</span>
            <span>Frames sent: {frameCount}</span>
            {/* <span>Direction: {isReversing ? "Reverse" : "Forward"}</span> */}
          </div>
          
          {/* AI Tracking Status */}
          {rectangle && (
            <div className="flex items-center justify-between gap-2 text-sm px-3 py-2 bg-green-50 border border-green-200 rounded-md">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-green-700 font-medium">AI Tracking Active</span>
                <span className="text-green-600 text-xs">
                  ({rectangle.x1}, {rectangle.y1}) → ({rectangle.x2}, {rectangle.y2})
                </span>
              </div>
              <button
                onClick={handleClearRectangle}
                className="px-3 py-1 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 border border-red-300 rounded transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
