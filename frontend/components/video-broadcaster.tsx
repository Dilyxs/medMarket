"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface VideoFrameWithAnnotations {
  frame: string;
  analysis: {
    frame_index: number;
    masks_detected: number;
    regions: [];
  };
}

export default function VideoBroadcaster() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const frameIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [status, setStatus] = useState<"connecting" | "open" | "closed" | "error">("connecting");
  const [frameCount, setFrameCount] = useState(0);
  const [isReversing, setIsReversing] = useState(false);
  const frameIndexRef = useRef(0);
  const reconnectDelayRef = useRef(1000); // Start with 1 second
  
  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

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

    if (!isReversing) {
      // Switch to reverse playback
      video.playbackRate = -1;
      setIsReversing(true);
      video.play();
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    // If reversing and reached the start, switch to forward
    if (isReversing && video.currentTime <= 0.1) {
      video.playbackRate = 1;
      setIsReversing(false);
      video.currentTime = 0;
      video.play();
    }
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

          const frameData: VideoFrameWithAnnotations = {
            frame: base64Frame,
            analysis: {
              frame_index: frameIndexRef.current,
              masks_detected: 0,
              regions: [],
            },
          };

          try {
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

  useEffect(() => {
    // Connect WebSocket
    connectWebSocket();

    // Start frame capture interval at 30 FPS (33ms)
    frameIntervalRef.current = setInterval(() => {
      captureAndSendFrame();
    }, 33);

    // Cleanup
    return () => {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
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

    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not connected");
      setStartPoint(null);
      setCurrentPoint(null);
      return;
    }

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

    // Send rectangle coordinates to backend
    const rectangleData = {
      type: "rectangle",
      x1,
      y1,
      x2,
      y2,
      timestamp: Date.now()
    };

    try {
      socket.send(JSON.stringify(rectangleData));
      console.log("Rectangle sent:", rectangleData);
    } catch (error) {
      console.error("Failed to send rectangle:", error);
    }

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
            <span>Direction: {isReversing ? "Reverse" : "Forward"}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
