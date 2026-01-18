# API Integration Documentation: MedMarket Video Streaming with AI Object Tracking

## Overview

This document describes the integration between the Go WebSocket video streaming backend and the Python AI service for real-time object tracking using SAM3 (Segment Anything Model 3).

## Architecture

```
┌──────────────┐         WebSocket          ┌──────────────┐
│              │ ◄─────────────────────────► │              │
│  Broadcaster │    VideoFrameValere         │   Go Server  │
│  (Frontend)  │                             │   :8080      │
│              │                             │              │
└──────────────┘                             └───────┬──────┘
                                                     │
                                                     │ HTTP POST
                                                     │ (Multipart)
                                                     │
┌──────────────┐         WebSocket          ┌───────▼──────┐
│              │ ◄─────────────────────────┤ │              │
│   Viewers    │  VideoFrameWithAnnotations │ │ Python AI    │
│  (Frontend)  │                            │ │ Service      │
│              │                            │ │ :8000        │
└──────────────┘                            └──────────────┘
```

## System Components

### 1. Go WebSocket Server (`:8080`)
- **Location**: `backend/server/`
- **Purpose**: WebSocket hub for video streaming from broadcaster to multiple viewers
- **Key Features**: 
  - Real-time frame distribution
  - AI service integration
  - Session management
  - Graceful error handling

### 2. Python AI Service (`:8000`)
- **Location**: `backend/ai_service/`
- **Purpose**: SAM3-based object segmentation and tracking
- **Key Features**:
  - Pre-loaded model at startup (fast inference)
  - Stateful session-based tracking
  - Bounding box propagation across frames

## Data Structures

### VideoFrameValere (Broadcaster → Go Server)
```json
{
  "frame": "<base64-encoded-image>",
  "hasrectangle": true,
  "rectangle": {
    "x1": 100.5,
    "y1": 150.2,
    "x2": 250.8,
    "y2": 300.1
  }
}
```

### VideoFrameWithAnnotations (Go Server → Viewers)
```json
{
  "frame": "<base64-encoded-image>",
  "metadata": {
    "frame_index": 42,
    "masks_detected": 1,
    "regions": [
      {
        "mask_index": 0,
        "bounding_box": {
          "x_min": 100,
          "y_min": 150,
          "x_max": 250,
          "y_max": 300,
          "width": 150,
          "height": 150
        },
        "centroid": {
          "x": 175,
          "y": 225
        },
        "area_pixels": 15000
      }
    ]
  }
}
```

### RectangleDataValere (Go Struct)
```go
type RectangleDataValere struct {
    X1 float64 `json:"x1"`  // Top-left X
    Y1 float64 `json:"y1"`  // Top-left Y
    X2 float64 `json:"x2"`  // Bottom-right X
    Y2 float64 `json:"y2"`  // Bottom-right Y
}
```

### Region (AI Tracking Result)
```go
type Region struct {
    MaskIndex   int         `json:"mask_index"`
    BoundingBox BoundingBox `json:"bounding_box"`
    Centroid    Centroid    `json:"centroid"`
    AreaPixels  int         `json:"area_pixels"`
}
```

## API Endpoints

### Python AI Service Endpoints

#### 1. `GET /health`
**Purpose**: Check if AI service is ready and model is loaded

**Response**:
```json
{
  "status": "ready",
  "model_loaded": true
}
```

**Status Codes**:
- `200 OK`: Service is ready
- `503 Service Unavailable`: Model not loaded

---

#### 2. `POST /stream/start`
**Purpose**: Start a new tracking session with initial bounding box

**Request** (Multipart Form Data):
- `image`: File (JPEG/PNG image)
- `bboxes`: String (JSON array: `[[x1, y1, x2, y2]]`)

**Example**:
```bash
curl -X POST http://localhost:8000/stream/start \
  -F "image=@frame.jpg" \
  -F 'bboxes=[[100, 150, 250, 300]]'
```

**Response**:
```json
{
  "status": "success",
  "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "frame_data": {
    "frame_index": 0,
    "masks_detected": 1,
    "regions": [
      {
        "mask_index": 0,
        "bounding_box": {
          "x_min": 100,
          "y_min": 150,
          "x_max": 250,
          "y_max": 300,
          "width": 150,
          "height": 150
        },
        "centroid": { "x": 175, "y": 225 },
        "area_pixels": 15000
      }
    ]
  }
}
```

**Status Codes**:
- `200 OK`: Session created successfully
- `400 Bad Request`: Invalid image or bboxes format
- `503 Service Unavailable`: Model not loaded

---

#### 3. `POST /stream/frame`
**Purpose**: Process subsequent frame in existing session

**Request** (Multipart Form Data):
- `session_id`: String (UUID from `/stream/start`)
- `image`: File (JPEG/PNG image)

**Example**:
```bash
curl -X POST http://localhost:8000/stream/frame \
  -F "session_id=a1b2c3d4-e5f6-7890-abcd-ef1234567890" \
  -F "image=@frame2.jpg"
```

**Response**:
```json
{
  "status": "success",
  "frame_data": {
    "frame_index": 1,
    "masks_detected": 1,
    "regions": [...]
  }
}
```

**Status Codes**:
- `200 OK`: Frame processed successfully
- `404 Not Found`: Session ID not found
- `400 Bad Request`: Invalid image
- `503 Service Unavailable`: Model not loaded

---

#### 4. `POST /stream/end`
**Purpose**: End tracking session and free resources

**Request** (Multipart Form Data):
- `session_id`: String (UUID)

**Response**:
```json
{
  "status": "success",
  "message": "Session ended"
}
```

**Status Codes**:
- `200 OK`: Session ended (or already ended)

---

### Go WebSocket Server Endpoints

#### 1. `WebSocket /broadcaster`
**Purpose**: Broadcaster connection for streaming video

**Message Format**: `VideoFrameValere` (JSON)

**Behavior**:
- Receives frames from broadcaster
- If `hasrectangle=false`: Pass through with empty metadata
- If `hasrectangle=true`: 
  - First frame: Call `/stream/start`
  - Subsequent frames: Call `/stream/frame`
- Distributes annotated frames to all viewers

**Connection Lifecycle**:
1. Upgrade HTTP → WebSocket
2. Read frames in loop
3. On disconnect: Cleanup AI session (call `/stream/end`)

---

#### 2. `WebSocket /viewer`
**Purpose**: Viewer connection for receiving video stream

**Query Parameters**:
- `id`: Integer (auto-generated if not provided)

**Message Format**: `VideoFrameWithAnnotations` (JSON)

**Behavior**:
- Receives annotated frames from broadcaster
- Write-only connection (viewers don't send data)

---

#### 3. `WebSocket /chat`
**Purpose**: Real-time chat (not related to AI integration)

---

## Integration Workflow

### Startup Sequence

1. **Start Python AI Service**:
   ```bash
   cd backend/ai_service
   python app.py
   ```
   - FastAPI loads SAM3 model at startup
   - Service ready on `http://localhost:8000`
   - `/health` endpoint returns `model_loaded: true`

2. **Start Go Server**:
   ```bash
   cd backend/server
   go run main.go
   ```
   - Loads `.env` for `AI_SERVICE_URL`
   - Creates `BroadcastServerHub` with AI client
   - Server ready on `http://localhost:8080`

### Runtime Flow

#### Scenario 1: Frames Without Annotation
```
1. Broadcaster sends: {frame: "...", hasrectangle: false}
2. Go server passes through: {frame: "...", metadata: {}}
3. All viewers receive frame with empty metadata
```

#### Scenario 2: First Frame With Annotation
```
1. Broadcaster sends: {frame: "...", hasrectangle: true, rectangle: {...}}
2. Go server:
   a. Decodes base64 frame → raw bytes
   b. Converts rectangle {x1,y1,x2,y2} → [[x1,y1,x2,y2]]
   c. Calls POST /stream/start with frame + bboxes
   d. Receives session_id + initial metadata
   e. Stores session_id in hub
3. Go server sends: {frame: "...", metadata: {regions: [...]}}
4. All viewers receive annotated frame
```

#### Scenario 3: Subsequent Frames With Annotation
```
1. Broadcaster sends: {frame: "...", hasrectangle: true}
2. Go server:
   a. Decodes base64 frame
   b. Calls POST /stream/frame with session_id + frame
   c. Receives updated metadata (tracked objects)
3. Go server sends: {frame: "...", metadata: {regions: [...]}}
4. All viewers receive annotated frame
```

#### Scenario 4: Broadcaster Disconnect
```
1. Broadcaster WebSocket closes
2. Go server cleanup (deferred):
   a. Calls POST /stream/end with session_id
   b. Python service deletes session
   c. Clears session_id in hub
3. Go server sends "stream has ended" to all viewers
4. Viewers disconnect
```

#### Scenario 5: AI Service Error
```
1. Broadcaster sends annotated frame
2. Go server calls AI service → timeout/error
3. Go server logs error
4. Go server sends frame with empty metadata (graceful degradation)
5. Viewers receive frame without annotations
6. Stream continues (no crash)
```

## Configuration

### Environment Variables (`.env`)

```bash
# Python AI Service URL
AI_SERVICE_URL=http://localhost:8000

# HTTP request timeout (seconds)
AI_REQUEST_TIMEOUT=10
```

### Go Configuration Defaults

```go
// AI client timeout: 10 seconds
AIClient: NewAIServiceClient(aiServiceURL, 10*time.Second)

// Channel buffer sizes
VideoDetailsChan: make(chan VideoFrameWithAnnotations, 1000)
UserReceivingVideoDetails: make(chan VideoFrameWithAnnotations, 1000)
```

### Python Configuration

```python
# Model path (must exist)
model_path = "backend/ai_service/sam3.pt"

# FastAPI host/port
uvicorn app:app --host 0.0.0.0 --port 8000
```

## Error Handling

### Go Server

| Error Scenario | Behavior |
|---------------|----------|
| AI service unreachable | Log error, send frame with empty metadata |
| AI service timeout | Log error, send frame with empty metadata |
| Invalid base64 frame | Log error, send frame with empty metadata |
| AI session not found | Log error, send frame with empty metadata |
| Broadcaster disconnect | Cleanup AI session, notify viewers |

### Python AI Service

| Error Scenario | Behavior |
|---------------|----------|
| Model not loaded | Return 503 Service Unavailable |
| Invalid session ID | Return 404 Not Found |
| Invalid image format | Return 400 Bad Request |
| SAM3 inference error | Return 500 Internal Server Error |
| Missing model file | Log error at startup, return 503 |

## Performance Considerations

### Frame Processing Pipeline

```
Broadcaster → WebSocket → Go Decode → AI HTTP Call → AI Inference → Response → Viewer
             (<1ms)      (1-2ms)      (2-5ms)       (50-200ms)    (2-5ms)    (<1ms)
```

**Bottleneck**: AI inference (50-200ms per frame)

### Throughput

- **Without AI** (hasrectangle=false): ~1000 fps (limited by network)
- **With AI** (hasrectangle=true): ~5-20 fps (limited by AI processing)

### Dynamic Frame Skipping

The frontend implements request-response flow:
1. Send frame
2. Wait for annotated response
3. Send next frame

This naturally throttles frame rate to match AI processing speed. No queuing or dropping needed.

### Memory Usage

- **Go Server**: ~10-50 MB (channel buffers, WebSocket connections)
- **Python AI Service**: 
  - Base: ~500 MB (SAM3 model loaded in memory)
  - Per session: ~10-20 MB (session state, bboxes)
  - Peak during inference: ~1-2 GB (GPU/CPU tensors)

## Testing

### Test AI Service

```bash
# Check health
curl http://localhost:8000/health

# Start session with dummy bbox
curl -X POST http://localhost:8000/stream/start \
  -F "image=@test_frame.jpg" \
  -F 'bboxes=[[100, 100, 200, 200]]'

# Process frame (use session_id from above)
curl -X POST http://localhost:8000/stream/frame \
  -F "session_id=YOUR_SESSION_ID" \
  -F "image=@test_frame2.jpg"

# End session
curl -X POST http://localhost:8000/stream/end \
  -F "session_id=YOUR_SESSION_ID"
```

### Test Go Server

```bash
# Test viewer connection
wscat -c ws://localhost:8080/viewer

# Test broadcaster connection
wscat -c ws://localhost:8080/broadcaster

# Send test frame (in wscat)
{"frame":"<base64>","hasrectangle":false,"rectangle":{}}
```

## Troubleshooting

### Issue: "Model not loaded yet"

**Cause**: Python service started but model loading failed

**Solution**:
1. Check `backend/ai_service/sam3.pt` exists
2. Check Python logs for loading errors
3. Verify GPU/CUDA availability (if using GPU)
4. Check disk space and memory

### Issue: "Session not found"

**Cause**: Session expired or AI service restarted

**Solution**:
1. AI sessions are in-memory only
2. Restart broadcast to create new session
3. Implement session recovery in future (not in current scope)

### Issue: Frames with empty metadata

**Cause**: AI service error or timeout

**Solution**:
1. Check Python service logs
2. Verify AI service is responding: `curl http://localhost:8000/health`
3. Increase timeout if frames are large: Update `AI_REQUEST_TIMEOUT` in `.env`
4. Check network connectivity between Go and Python services

### Issue: Slow frame rate

**Cause**: AI processing time too long

**Solution**:
1. Check GPU availability: SAM3 runs 10x faster on GPU
2. Reduce frame resolution on broadcaster side
3. Current design: N=1 (process every frame)
4. Frontend already implements dynamic skipping via request-response

## Future Improvements

### Not Implemented (Out of Demo Scope)

1. **Session Recovery**: Auto-restart sessions on AI service reconnect
2. **Multi-Broadcaster**: Support multiple simultaneous broadcasts
3. **Session Persistence**: Save sessions to Redis/database
4. **Frame Skipping Server-Side**: Skip every Nth frame in Go (currently N=1)
5. **Async AI Processing**: Background goroutine for non-blocking inference
6. **Circuit Breaker**: Disable AI calls after repeated failures
7. **Metrics**: Prometheus metrics for latency, throughput, errors
8. **Auto-Detection**: Detect objects without user-drawn bounding box

## File Reference

### Backend Structure

```
backend/
├── .env                          # Environment variables
├── ai_service/
│   ├── app.py                    # FastAPI server with SAM3
│   ├── requirements.txt          # Python dependencies
│   ├── sam3.pt                   # SAM3 model weights (not in repo)
│   └── run.sh                    # Start script
└── server/
    ├── main.go                   # Entry point, loads .env
    ├── go.mod                    # Go dependencies
    └── pkg/
        ├── FeedForwarder.go      # WebSocket hub, AI integration
        ├── ai_client.go          # HTTP client for AI service
        ├── ChatHub.go            # Chat functionality
        └── solana.go             # Solana integration (reference)
```

### Key Files

| File | Purpose |
|------|---------|
| [backend/ai_service/app.py](backend/ai_service/app.py) | Python FastAPI server with SAM3 endpoints |
| [backend/server/main.go](backend/server/main.go) | Go entry point, environment loading |
| [backend/server/pkg/FeedForwarder.go](backend/server/pkg/FeedForwarder.go) | Video streaming hub with AI integration |
| [backend/server/pkg/ai_client.go](backend/server/pkg/ai_client.go) | HTTP client for Python AI service |
| [backend/.env](backend/.env) | Configuration (AI service URL, timeout) |

## Quick Start Guide

### 1. Install Dependencies

**Python**:
```bash
cd backend/ai_service
pip install -r requirements.txt
```

**Go**:
```bash
cd backend/server
go mod download
```

### 2. Download Model

Place `sam3.pt` in `backend/ai_service/` directory.

### 3. Start Services

**Terminal 1** (Python AI):
```bash
cd backend/ai_service
python app.py
```

**Terminal 2** (Go Server):
```bash
cd backend/server
go run main.go
```

### 4. Verify

```bash
# Check AI service
curl http://localhost:8000/health

# Check Go server
curl http://localhost:8080/
```

### 5. Connect Frontend

- Broadcaster connects to: `ws://localhost:8080/broadcaster`
- Viewers connect to: `ws://localhost:8080/viewer`

---

## Summary

The integration enables real-time object tracking in medical video streams:

- **Broadcaster** sends frames with optional bounding box annotations
- **Go server** orchestrates WebSocket streaming and AI processing
- **Python AI service** provides SAM3-based segmentation and tracking
- **Viewers** receive frames with AI-generated region metadata
- **Graceful degradation** ensures stream continues even if AI fails
- **Session cleanup** prevents memory leaks on disconnect

All components are production-ready for demo purposes with proper error handling, logging, and configuration management.
