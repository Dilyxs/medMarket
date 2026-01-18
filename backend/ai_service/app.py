import torch
# Monkey-patch torch.compile to handle False mode (workaround for SAM3 bug)
_original_compile = torch.compile
def _patched_compile(model, **kwargs):
    mode = kwargs.get('mode', None)
    if mode is False or mode is None:
        # Return model unchanged if compile is disabled
        return model
    return _original_compile(model, **kwargs)
torch.compile = _patched_compile

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional, Dict, Any
from ultralytics import SAM
import os
import cv2
import json
import logging
import asyncio
from pathlib import Path
import shutil
import tempfile
import uuid
import numpy as np

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="SAM3 Video Segmentation API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model instance (loaded at startup)
sam_model = None
model_loaded = False

# Global session storage
# sessions[session_id] = { "frame_index": int, "current_bboxes": list }
# Note: model is now global, not per-session
sessions: Dict[str, Any] = {}

@app.on_event("startup")
async def load_model():
    """Load SAM3 model at application startup to save time on first request"""
    global sam_model, model_loaded
    model_path = os.path.join(os.path.dirname(__file__), "sam3.pt")
    if not os.path.exists(model_path):
        logger.error(f"Model file not found at {model_path}")
        model_loaded = False
        return
    
    try:
        logger.info("Loading SAM3 model at startup...")
        sam_model = SAM(model_path)
        model_loaded = True
        logger.info("SAM3 model loaded successfully!")
    except Exception as e:
        logger.error(f"Failed to load SAM3 model: {e}")
        model_loaded = False

# Helper function to extract regions (User's logic)
def extract_regions(result, frame_index: int) -> Dict[str, Any]:
    frame_data = {
        "frame_index": frame_index,
        "masks_detected": 0,
        "regions": []
    }
    
    if result.masks is not None and hasattr(result.masks, 'data'):
        num_masks = len(result.masks.data)
        frame_data["masks_detected"] = num_masks
        
        for mask_idx, mask in enumerate(result.masks.data):
            # Ultralytics masks can be on GPU
            mask_np = mask.cpu().numpy() if hasattr(mask, 'cpu') else np.array(mask)
            nonzero = np.where(mask_np > 0)
            
            if len(nonzero[0]) > 0:
                y_min = int(nonzero[0].min())
                y_max = int(nonzero[0].max())
                x_min = int(nonzero[1].min())
                x_max = int(nonzero[1].max())
                centroid_y = int(np.mean(nonzero[0]))
                centroid_x = int(np.mean(nonzero[1]))
                area = int(np.sum(mask_np > 0))
                
                region_info = {
                    "mask_index": mask_idx,
                    "bounding_box": {
                        "x_min": x_min,
                        "y_min": y_min,
                        "x_max": x_max,
                        "y_max": y_max,
                        "width": x_max - x_min,
                        "height": y_max - y_min
                    },
                    "centroid": {
                        "x": centroid_x,
                        "y": centroid_y
                    },
                    "area_pixels": area
                }
                frame_data["regions"].append(region_info)
    
    return frame_data

def load_image_from_upload(upload_file: UploadFile):
    # Read bytes
    file_bytes = upload_file.file.read()
    # Convert to numpy array
    nparr = np.frombuffer(file_bytes, np.uint8)
    # Decode image
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    return img

@app.get("/")
async def root():
    return {"message": "SAM3 Streaming API is running"}

@app.get("/health")
async def health_check():
    """Health check endpoint that returns model loading status"""
    return {
        "status": "ready" if model_loaded else "not_ready",
        "model_loaded": model_loaded
    }

@app.post("/stream/start")
async def start_stream(
    image: UploadFile = File(...),
    bboxes: str = Form(...) # JSON string
):
    """
    Start a new segmentation session with the first frame and bounding boxes.
    Returns a session_id.
    """
    if not model_loaded or sam_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet")
    
    try:
        bboxes_list = json.loads(bboxes)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid bboxes JSON")

    session_id = str(uuid.uuid4())
    logger.info(f"Starting session {session_id} with bboxes {bboxes_list}")

    try:
        # decode image
        frame0 = load_image_from_upload(image)
        if frame0 is None:
             raise HTTPException(status_code=400, detail="Invalid image file")

        # Run inference on first frame with prompts using global model
        results = sam_model(frame0, bboxes=bboxes_list)
        
        # Extract data
        result_data = extract_regions(results[0], frame_index=0)
        
        # Calculate new bboxes for next frame from masks
        next_bboxes = []
        for region in result_data["regions"]:
            bbox = region["bounding_box"]
            # Format: [x_min, y_min, x_max, y_max]
            next_bboxes.append([
                bbox["x_min"], bbox["y_min"], bbox["x_max"], bbox["y_max"]
            ])
            
        if not next_bboxes:
             logger.warning("No masks found in first frame, tracking might fail")

        # Save session (no longer storing model per-session)
        sessions[session_id] = {
            "frame_index": 0,
            "current_bboxes": next_bboxes
        }

        return {
            "status": "success",
            "session_id": session_id,
            "frame_data": result_data
        }

    except Exception as e:
        logger.error(f"Error starting stream: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/stream/frame")
async def process_frame(
    session_id: str = Form(...),
    image: UploadFile = File(...)
):
    """
    Process a subsequent frame in the session.
    """
    if not model_loaded or sam_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet")
    
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = sessions[session_id]
    current_bboxes = session.get("current_bboxes", [])
    
    session["frame_index"] += 1
    current_idx = session["frame_index"]
    
    try:
        frame = load_image_from_upload(image)
        if frame is None:
             raise HTTPException(status_code=400, detail="Invalid image file")
             
        if not current_bboxes:
             # Object lost previously
             return {
                 "status": "success",
                 "frame_data": {
                     "frame_index": current_idx,
                     "masks_detected": 0,
                     "regions": []
                 },
                 "message": "No tracking target (object lost)"
             }

        # Run predict with propagated bboxes using global model
        results = sam_model(frame, bboxes=current_bboxes)
        
        # Extract data
        result_data = extract_regions(results[0], frame_index=current_idx)
        
        # Update bboxes for next frame
        next_bboxes = []
        for region in result_data["regions"]:
            bbox = region["bounding_box"]
             # Add padding? 
             # For now, just strict box
            next_bboxes.append([
                bbox["x_min"], bbox["y_min"], bbox["x_max"], bbox["y_max"]
            ])
        
        session["current_bboxes"] = next_bboxes
        
        return {
            "status": "success",
            "frame_data": result_data
        }

    except Exception as e:
        logger.error(f"Error processing frame {current_idx}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/stream/end")
async def end_stream(session_id: str = Form(...)):
    if session_id in sessions:
        # Cleanup
        del sessions[session_id]
        logger.info(f"Ended session {session_id}")
        return {"status": "success", "message": "Session ended"}
    else:
        return {"status": "warning", "message": "Session not found or already ended"}


