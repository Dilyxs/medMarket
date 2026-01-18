"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// Configuration
const AI_SERVICE_URL = "http://localhost:8000"; // Adjust if needed
const BROADCAST_WS_URL = process.env.NEXT_PUBLIC_BROADCAST_WS_SENDER || "ws://localhost:8080/broadcaster";

export function BroadcasterView() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Ready");
  
  const [sourceType, setSourceType] = useState<"camera" | "file">("camera");
  const [videoList, setVideoList] = useState<string[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<string>("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const isStreamingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  
  // Drag selection state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{x: number, y: number} | null>(null);
  const [dragEnd, setDragEnd] = useState<{x: number, y: number} | null>(null);

  // Initialize Camera or File
  useEffect(() => {
    const setupSource = async () => {
      if (sourceType === "camera") {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: 640, height: 480 } 
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.src = "";
                videoRef.current.loop = false;
            }
            setStatus("Ready (Camera)");
        } catch (err) {
            console.error("Error accessing camera:", err);
            setStatus("Error: Camera access denied");
        }
      } else {
          // File mode: clear camera stream if any
          if (videoRef.current) {
              if (videoRef.current.srcObject) {
                  const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
                  tracks.forEach(t => t.stop());
                  videoRef.current.srcObject = null;
              }
              if (selectedVideo) {
                  // Construct URL to Go backend static file
                  // Construct URL to Go backend static file
                  const url = `http://localhost:8080/videos/${selectedVideo}`;
                  videoRef.current.crossOrigin = "anonymous"; // Important for canvas: set BEFORE src
                  videoRef.current.src = url;
                  videoRef.current.loop = false; // Don't loop video files
                  setStatus(`Ready (Loaded ${selectedVideo})`);
              } else {
                  setStatus("Select a video...");
              }
          }
      }
    };
    setupSource();
  }, [sourceType, selectedVideo]);

  // Handle video ended event for file sources
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => {
      console.log("Video ended, stopping stream...");
      if (isStreamingRef.current) {
        stopStream();
      }
    };

    video.addEventListener('ended', handleEnded);
    return () => {
      video.removeEventListener('ended', handleEnded);
    };
  }, []);

  // Fetch video list
  useEffect(() => {
      if (sourceType === "file" && videoList.length === 0) {
          fetch("http://localhost:8080/api/videos")
            .then(res => res.json())
            .then(data => {
                setVideoList(data);
                if (data.length > 0) setSelectedVideo(data[0]);
            })
            .catch(err => console.error("Failed to fetch videos:", err));
      }
  }, [sourceType, videoList.length]);

  // const handleFileChange = ... removed

  // Connect to Go Backend Broadcaster Endpoint
  const connectWebSocket = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(BROADCAST_WS_URL);
    
    ws.onopen = () => console.log("Broadcaster WebSocket connected");
    ws.onclose = () => console.log("Broadcaster WebSocket closed");
    ws.onerror = (err) => console.error("Broadcaster WebSocket error", err);
    
    socketRef.current = ws;
  };

  const loop = async () => {
      if (!isStreamingRef.current) return;
      if (isProcessingRef.current) return; 

      isProcessingRef.current = true;
      try {
        await processFrame();
      } finally {
        isProcessingRef.current = false;
      }
      
      if (isStreamingRef.current) {
          setTimeout(loop, 100); 
      }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLVideoElement>) => {
    if (isStreaming || !videoRef.current) return;
    
    const rect = videoRef.current.getBoundingClientRect();
    setDragStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDragEnd({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLVideoElement>) => {
    if (!isDragging || !videoRef.current) return;
    
    const rect = videoRef.current.getBoundingClientRect();
    setDragEnd({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseUp = async (e: React.MouseEvent<HTMLVideoElement>) => {
    if (!isDragging || !dragStart || !dragEnd || !videoRef.current || !canvasRef.current) {
      setIsDragging(false);
      return;
    }
    
    setIsDragging(false);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Ensure video has loaded dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.error("Video dimensions not available yet");
      setStatus("Error: Video not loaded");
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas to match video's intrinsic dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    console.log(`Canvas set to ${canvas.width}x${canvas.height} (video intrinsic size)`);
    
    ctx.drawImage(video, 0, 0);
    
    const rect = video.getBoundingClientRect();
    const scaleX = video.videoWidth / rect.width;
    const scaleY = video.videoHeight / rect.height;
    
    // Convert drag coordinates to video coordinates
    const x1 = Math.min(dragStart.x, dragEnd.x) * scaleX;
    const y1 = Math.min(dragStart.y, dragEnd.y) * scaleY;
    const x2 = Math.max(dragStart.x, dragEnd.x) * scaleX;
    const y2 = Math.max(dragStart.y, dragEnd.y) * scaleY;
    
    // Ensure minimum box size (at least 20x20 pixels)
    const minSize = 20;
    if (Math.abs(x2 - x1) < minSize || Math.abs(y2 - y1) < minSize) {
      console.warn("Selection too small, using minimum size");
      const centerX = (x1 + x2) / 2;
      const centerY = (y1 + y2) / 2;
      const initialBbox = [[
        Math.max(0, centerX - minSize/2),
        Math.max(0, centerY - minSize/2),
        Math.min(video.videoWidth, centerX + minSize/2),
        Math.min(video.videoHeight, centerY + minSize/2)
      ]];
      await startTracking(initialBbox, canvas, blob => blob);
      setDragStart(null);
      setDragEnd(null);
      return;
    }
    
    console.log(`Drag selection: (${x1.toFixed(0)}, ${y1.toFixed(0)}) to (${x2.toFixed(0)}, ${y2.toFixed(0)})`);

    const initialBbox = [[
      Math.max(0, x1),
      Math.max(0, y1),
      Math.min(video.videoWidth, x2),
      Math.min(video.videoHeight, y2)
    ]];
    
    console.log(`Initial bbox:`, initialBbox);
    
    setDragStart(null);
    setDragEnd(null);

    canvas.toBlob(async (blob: Blob | null) => {
      if (!blob) return;
      await startTracking(initialBbox, canvas, () => blob);
    }, "image/jpeg");
  };

  const startTracking = async (initialBbox: number[][], canvas: HTMLCanvasElement, getBlobFn: () => Blob | null) => {
    const blob = getBlobFn();
    if (!blob) return;
        
        const formData = new FormData();
        formData.append("image", blob, "frame0.jpg");
        formData.append("bboxes", JSON.stringify(initialBbox));

        try {
            setStatus("Starting AI Session...");
            const res = await fetch(`${AI_SERVICE_URL}/stream/start`, {
                method: "POST",
                body: formData,
            });
            const data = await res.json();
            
            if (data.session_id) {
                setSessionId(data.session_id);
                sessionIdRef.current = data.session_id; // Store in ref for immediate access
                setIsStreaming(true);
                isStreamingRef.current = true;
                connectWebSocket();
                setStatus("Streaming...");
                
                // Ensure video is playing for file sources
                if (videoRef.current && sourceType === "file") {
                    videoRef.current.play().catch(err => {
                        console.error("Failed to play video:", err);
                    });
                }
                
                // Send frame 0 immediately before starting the loop
                // We need to wait for WebSocket to be ready
                const waitForSocket = async () => {
                    const maxWait = 2000; // 2 seconds
                    const checkInterval = 50;
                    let elapsed = 0;
                    
                    while (elapsed < maxWait) {
                        if (socketRef.current?.readyState === WebSocket.OPEN) {
                            // Socket is ready, send frame 0
                            const reader = new FileReader();
                            reader.readAsDataURL(blob);
                            reader.onloadend = () => {
                                const base64data = reader.result?.toString().split(",")[1];
                                const payload = {
                                    frame: base64data,
                                    analysis: data.frame_data
                                };
                                socketRef.current?.send(JSON.stringify(payload));
                                console.log("Sent frame 0 to BroadcastHub");
                                
                                // Now start the loop for subsequent frames
                                loop();
                            };
                            return;
                        }
                        await new Promise(resolve => setTimeout(resolve, checkInterval));
                        elapsed += checkInterval;
                    }
                    
                    // Timeout - start loop anyway
                    console.warn("WebSocket not ready after 2s, starting loop anyway");
                    loop();
                };
                
                waitForSocket();
            } else {
                setStatus("Error: Failed to start session");
            }
        } catch (err) {
            console.error(err);
            setStatus("Error: AI Service unreachable");
        }
  };

  const processFrame = async () => {
      if (!videoRef.current || !canvasRef.current || !socketRef.current || !sessionIdRef.current) return;
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      if (!ctx || socketRef.current.readyState !== WebSocket.OPEN) {
          return;
      }

      // Log video progress
      console.log(`Processing frame at time: ${video.currentTime.toFixed(2)}s / ${video.duration.toFixed(2)}s`);

      ctx.drawImage(video, 0, 0);
      
      return new Promise<void>((resolve) => {
          canvas.toBlob(async (blob: Blob | null) => {
              if (!blob) { resolve(); return; }

              const reader = new FileReader();
              reader.readAsDataURL(blob);
              reader.onloadend = async () => {
                 const base64data = reader.result?.toString().split(",")[1];
                 
                 const formData = new FormData();
                 formData.append("session_id", sessionIdRef.current);
                 formData.append("image", blob, "frame.jpg");

                 try {
                     const t0 = performance.now();
                     const res = await fetch(`${AI_SERVICE_URL}/stream/frame`, {
                         method: "POST",
                         body: formData
                     });
                     const t1 = performance.now();
                     console.log(`AI Interface took ${(t1-t0).toFixed(0)}ms`);
                     
                     if (!res.ok) {
                         console.error("Frame processing failed");
                         resolve();
                         return;
                     }

                     const result = await res.json();
                     
                     const payload = {
                         frame: base64data,
                         analysis: result.frame_data
                     };
                     
                     socketRef.current?.send(JSON.stringify(payload));

                 } catch (err) {
                     console.error("Frame loop error:", err);
                 }
                 resolve();
              }
          }, "image/jpeg", 0.8);
      });
  };

  const stopStream = async () => {
      isStreamingRef.current = false;
      
      if (sessionIdRef.current) {
          try {
              const formData = new FormData();
              formData.append("session_id", sessionIdRef.current);
              await fetch(`${AI_SERVICE_URL}/stream/end`, { method: "POST", body: formData });
          } catch (e) { console.error(e) }
      }
      if (socketRef.current) socketRef.current.close();
      
      setIsStreaming(false);
      setSessionId(null);
      sessionIdRef.current = null;
      setStatus("Ready");
  };

  return (
    <div className="flex flex-col gap-4 p-4 border rounded-lg bg-card">
        <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Broadcaster View</h2>
            <div className="flex gap-2">
                <Button 
                    variant={sourceType === "camera" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSourceType("camera")}
                >
                    Camera
                </Button>
                <Button 
                    variant={sourceType === "file" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSourceType("file")}
                >
                    Server File
                </Button>
            </div>
        </div>

        {sourceType === "file" && (
            <div className="flex gap-2 items-center">
                <select 
                    className="text-sm p-1 border rounded bg-background text-foreground"
                    value={selectedVideo}
                    onChange={(e) => setSelectedVideo(e.target.value)}
                >
                    {videoList.map(v => (
                        <option key={v} value={v}>{v}</option>
                    ))}
                </select>
            </div>
        )}
        <div className="relative border border-border rounded overflow-hidden bg-black aspect-video max-w-[640px]">
            <video 
                ref={videoRef}
                autoPlay 
                playsInline
                muted
                className="w-full h-full object-cover cursor-crosshair"
                onMouseDown={!isStreaming ? handleMouseDown : undefined}
                onMouseMove={!isStreaming ? handleMouseMove : undefined}
                onMouseUp={!isStreaming ? handleMouseUp : undefined}
                onMouseLeave={() => {
                  if (isDragging) {
                    setIsDragging(false);
                    setDragStart(null);
                    setDragEnd(null);
                  }
                }}
            />
            {/* Drag selection overlay */}
            {isDragging && dragStart && dragEnd && (
              <div 
                className="absolute border-2 border-green-500 bg-green-500/20 pointer-events-none"
                style={{
                  left: `${Math.min(dragStart.x, dragEnd.x)}px`,
                  top: `${Math.min(dragStart.y, dragEnd.y)}px`,
                  width: `${Math.abs(dragEnd.x - dragStart.x)}px`,
                  height: `${Math.abs(dragEnd.y - dragStart.y)}px`,
                }}
              />
            )}
            {/* Overlay Status */}
            <div className="absolute top-2 left-2 bg-black/50 text-white px-2 py-1 text-sm rounded">
                Status: {status}
            </div>
            {!isStreaming && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="bg-black/70 text-white px-4 py-2 rounded">
                        Click and drag to select region
                    </span>
                </div>
            )}
        </div>
        
        <canvas ref={canvasRef} className="hidden" />
        
        {isStreaming && (
            <Button variant="destructive" onClick={stopStream}>
                Stop Broadcast
            </Button>
        )}
    </div>
  );
}
