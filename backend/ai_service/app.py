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
from ultralytics.models.sam import SAM as SAM3VideoPredictor
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

# Global session storage
# sessions[session_id] = { "model": model_instance, "frame_index": int }
sessions: Dict[str, Any] = {}

# Helper function to extract regions (User's logic)
def extract_regions(result, frame_index: int) -> Dict[str, Any]:
    import base64
    from io import BytesIO
    from PIL import Image
    
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
                
                # Convert mask to base64 PNG for frontend
                mask_uint8 = (mask_np * 255).astype(np.uint8)
                mask_pil = Image.fromarray(mask_uint8, mode='L')
                buffer = BytesIO()
                mask_pil.save(buffer, format='PNG')
                mask_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
                
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
                    "area_pixels": area,
                    "mask": mask_base64  # Add mask data
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

# @app.post("/stream/start")
# async def start_stream(
#     image: UploadFile = File(...),
#     bboxes: str = Form(...) # JSON string
# ):
#     """
#     Start a new segmentation session with the first frame and bounding boxes.
#     Returns a session_id.
#     """
#     try:
#         bboxes_list = json.loads(bboxes)
#     except Exception:
#         raise HTTPException(status_code=400, detail="Invalid bboxes JSON")

#     session_id = str(uuid.uuid4())
#     logger.info(f"Starting session {session_id} with bboxes {bboxes_list}")

#     # Load Model
#     model_path = os.path.join(os.path.dirname(__file__), "sam3.pt")
#     if not os.path.exists(model_path):
#         raise HTTPException(status_code=500, detail="Model sam3.pt not found")

#     try:
#         model = SAM(model_path)
        
#         # decode image
#         frame0 = load_image_from_upload(image)
#         if frame0 is None:
#              raise HTTPException(status_code=400, detail="Invalid image file")

#         # Resize for speed/memory (Target 256 max dim)
#         TARGET_DIM = 256
#         h, w = frame0.shape[:2]
#         scale = min(TARGET_DIM / h, TARGET_DIM / w)
#         new_w, new_h = int(w * scale), int(h * scale)
#         frame_resized = cv2.resize(frame0, (new_w, new_h))
        
#         # Scale input bboxes
#         scaled_bboxes = []
#         for box in bboxes_list:
#             # box is [x1, y1, x2, y2]
#             scaled_bboxes.append([
#                 box[0] * scale,
#                 box[1] * scale,
#                 box[2] * scale,
#                 box[3] * scale
#             ])

#         # Run inference on resized frame
#         results = model(frame_resized, bboxes=scaled_bboxes, imgsz=256)
        
#         # Extract data (in resized coords)
#         result_data = extract_regions(results[0], frame_index=0)
        
#         # Scale results back to original coords
#         next_bboxes = []
#         for region in result_data["regions"]:
#             bbox = region["bounding_box"]
            
#             # Scale back bbox
#             orig_bbox = {
#                 "x_min": int(bbox["x_min"] / scale),
#                 "y_min": int(bbox["y_min"] / scale),
#                 "x_max": int(bbox["x_max"] / scale),
#                 "y_max": int(bbox["y_max"] / scale),
#             }
#             orig_bbox["width"] = orig_bbox["x_max"] - orig_bbox["x_min"]
#             orig_bbox["height"] = orig_bbox["y_max"] - orig_bbox["y_min"]
#             region["bounding_box"] = orig_bbox
            
#             # Scale back centroid
#             region["centroid"]["x"] = int(region["centroid"]["x"] / scale)
#             region["centroid"]["y"] = int(region["centroid"]["y"] / scale)
            
#             # Scale back area (approx)
#             region["area_pixels"] = int(region["area_pixels"] / (scale * scale))

#             # Store bbox for tracking (original coords? No, session state should ideally store original to be consistent?)
#             # Actually, next `process_frame` will resize again. 
#             # So we should store ORIGINAL coords in session, and scale them down again in `process_frame`.
#             next_bboxes.append([
#                 orig_bbox["x_min"], orig_bbox["y_min"], orig_bbox["x_max"], orig_bbox["y_max"]
#             ])

#         print("next_bboxes", next_bboxes)

#         # Save session
#         sessions[session_id] = {
#             "model": model,
#             "frame_index": 0,
#             "current_bboxes": next_bboxes # Stored in original scale
#         }

#         print(session_id,result_data)

#         return {
#             "status": "success",
#             "session_id": session_id,
#             "frame_data": result_data
#         }

#     except Exception as e:
#         logger.error(f"Error starting stream: {e}")
#         import traceback
#         traceback.print_exc()
#         raise HTTPException(status_code=500, detail=str(e))

@app.post("/stream/start")
async def start_stream(
    image: UploadFile = File(...),
    bboxes: str = Form(...),  # JSON string
):
    """
    Start a new segmentation session with the first frame and bounding boxes.
    Returns a session_id.
    """
    print("[/stream/start] ===== start_stream called =====")
    print(f"[/stream/start] image.filename={getattr(image, 'filename', None)} "
          f"content_type={getattr(image, 'content_type', None)}")
    print(f"[/stream/start] raw bboxes (string)={bboxes}")

    try:
        print("[/stream/start] Parsing bboxes JSON...")
        bboxes_list = json.loads(bboxes)
        print(f"[/stream/start] Parsed bboxes_list type={type(bboxes_list)} value={bboxes_list}")
    except Exception as e:
        print(f"[/stream/start] ERROR parsing bboxes JSON: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail="Invalid bboxes JSON")

    session_id = str(uuid.uuid4())
    print(f"[/stream/start] Generated session_id={session_id}")
    logger.info(f"Starting session {session_id} with bboxes {bboxes_list}")

    # Load Model
    model_path = os.path.join(os.path.dirname(__file__), "sam3.pt")
    print(f"[/stream/start] Resolved model_path={model_path}")
    if not os.path.exists(model_path):
        print(f"[/stream/start] ERROR: model file not found at {model_path}")
        raise HTTPException(status_code=500, detail="Model sam3.pt not found")
    print("[/stream/start] Model file exists.")

    try:
        print("[/stream/start] Initializing SAM3VideoPredictor...")
        model = SAM3VideoPredictor(model_path)
        print("[/stream/start] SAM3VideoPredictor initialized successfully.")

        # decode image
        print("[/stream/start] Decoding uploaded image into frame0...")
        frame0 = load_image_from_upload(image)
        if frame0 is None:
            print("[/stream/start] ERROR: frame0 is None (invalid image).")
            raise HTTPException(status_code=400, detail="Invalid image file")

        print(f"[/stream/start] frame0 loaded. type={type(frame0)} "
              f"shape={getattr(frame0, 'shape', None)} dtype={getattr(frame0, 'dtype', None)}")

        # Resize for speed/memory (Target 256 max dim)
        TARGET_DIM = 256
        h, w = frame0.shape[:2]
        print(f"[/stream/start] Original dims: h={h}, w={w}. TARGET_DIM={TARGET_DIM}")

        scale = min(TARGET_DIM / h, TARGET_DIM / w)
        new_w, new_h = int(w * scale), int(h * scale)
        print(f"[/stream/start] Computed scale={scale}")
        print(f"[/stream/start] Resized dims: new_h={new_h}, new_w={new_w}")

        print("[/stream/start] Resizing frame0 -> frame_resized...")
        frame_resized = cv2.resize(frame0, (new_w, new_h))
        print(f"[/stream/start] frame_resized shape={frame_resized.shape} dtype={frame_resized.dtype}")

        # Scale input bboxes
        print("[/stream/start] Scaling input bboxes to resized coordinates...")
        scaled_bboxes = []
        for i, box in enumerate(bboxes_list):
            print(f"[/stream/start] bbox[{i}] original={box}")

            # box is [x1, y1, x2, y2]
            scaled = [
                box[0] * scale,
                box[1] * scale,
                box[2] * scale,
                box[3] * scale,
            ]
            scaled_bboxes.append(scaled)
            print(f"[/stream/start] bbox[{i}] scaled={scaled}")

        print(f"[/stream/start] scaled_bboxes final={scaled_bboxes}")

        # Run inference on resized frame using track() method
        print("[/stream/start] Running inference with track()...")
        print(f"[/stream/start] Calling model.track(frame_resized, bboxes=scaled_bboxes, persist=True, imgsz=256)")
        results = model.track(frame_resized, bboxes=scaled_bboxes, persist=True, imgsz=256)
        print("[/stream/start] Inference done.")
        print(f"[/stream/start] results type={type(results)} len={len(results) if hasattr(results, '__len__') else 'N/A'}")

        # Extract data (in resized coords)
        print("[/stream/start] Extracting regions from results[0] at frame_index=0...")
        result_data = extract_regions(results[0], frame_index=0)
        print("[/stream/start] extract_regions done.")
        print(f"[/stream/start] result_data keys={list(result_data.keys()) if isinstance(result_data, dict) else type(result_data)}")
        if isinstance(result_data, dict) and "regions" in result_data:
            print(f"[/stream/start] number of regions={len(result_data['regions'])}")

        # Scale results back to original coords
        print("[/stream/start] Scaling result regions back to original coordinates...")
        next_bboxes = []
        for r_idx, region in enumerate(result_data.get("regions", [])):
            print(f"[/stream/start] region[{r_idx}] pre-scale keys={list(region.keys())}")

            bbox = region["bounding_box"]
            print(f"[/stream/start] region[{r_idx}] bbox (resized coords)={bbox}")

            # Scale back bbox
            orig_bbox = {
                "x_min": int(bbox["x_min"] / scale),
                "y_min": int(bbox["y_min"] / scale),
                "x_max": int(bbox["x_max"] / scale),
                "y_max": int(bbox["y_max"] / scale),
            }
            orig_bbox["width"] = orig_bbox["x_max"] - orig_bbox["x_min"]
            orig_bbox["height"] = orig_bbox["y_max"] - orig_bbox["y_min"]
            region["bounding_box"] = orig_bbox
            print(f"[/stream/start] region[{r_idx}] bbox (orig coords)={orig_bbox}")

            # Scale back centroid
            old_cx, old_cy = region["centroid"]["x"], region["centroid"]["y"]
            region["centroid"]["x"] = int(old_cx / scale)
            region["centroid"]["y"] = int(old_cy / scale)
            print(f"[/stream/start] region[{r_idx}] centroid resized=({old_cx},{old_cy}) "
                  f"orig=({region['centroid']['x']},{region['centroid']['y']})")

            # Scale back area (approx)
            old_area = region.get("area_pixels", None)
            if old_area is not None:
                region["area_pixels"] = int(old_area / (scale * scale))
            print(f"[/stream/start] region[{r_idx}] area resized={old_area} orig={region.get('area_pixels')}")

            # Store bbox for tracking in ORIGINAL coords (session state)
            nb = [orig_bbox["x_min"], orig_bbox["y_min"], orig_bbox["x_max"], orig_bbox["y_max"]]
            next_bboxes.append(nb)
            print(f"[/stream/start] region[{r_idx}] next_bbox stored={nb}")

        print("[/stream/start] next_bboxes", next_bboxes)

        # Save session
        print("[/stream/start] Saving session state...")
        print(f"[/stream/start] sessions before save: has_session={session_id in sessions} total_sessions={len(sessions)}")

        sessions[session_id] = {
            "model": model,
            "frame_index": 0,
            "current_bboxes": next_bboxes,  # Stored in original scale
        }

        print(f"[/stream/start] sessions after save: has_session={session_id in sessions} total_sessions={len(sessions)}")
        print("[/stream/start] session_id, result_data:", session_id, result_data)

        response = {
            "status": "success",
            "session_id": session_id,
            "frame_data": result_data
        }
        print(f"[/stream/start] Returning response keys={list(response.keys())}")
        print("[/stream/start] ===== start_stream finished successfully =====")

        return response

    except HTTPException as he:
        # Don’t double-wrap HTTPException
        print(f"[/stream/start] HTTPException raised: status_code={he.status_code} detail={he.detail}")
        raise
    except Exception as e:
        print(f"[/stream/start] ERROR starting stream: {e}")
        import traceback
        traceback.print_exc()
        logger.error(f"Error starting stream: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/stream/frame")
async def process_frame(
    session_id: str = Form(...),
    image: UploadFile = File(...)
):
    """
    Process a subsequent frame in the session.
    """
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = sessions[session_id]
    model = session["model"]
    current_bboxes = session.get("current_bboxes", []) # Original scale
    
    session["frame_index"] += 1
    current_idx = session["frame_index"]
    
    try:
        frame = load_image_from_upload(image)
        if frame is None:
             raise HTTPException(status_code=400, detail="Invalid image file")
             
        if not current_bboxes:
             return {
                 "status": "success",
                 "frame_data": {
                     "frame_index": current_idx,
                     "masks_detected": 0,
                     "regions": []
                 },
                 "message": "No tracking target (object lost)"
             }

        # Resize
        TARGET_DIM = 256
        h, w = frame.shape[:2]
        scale = min(TARGET_DIM / h, TARGET_DIM / w)
        new_w, new_h = int(w * scale), int(h * scale)
        frame_resized = cv2.resize(frame, (new_w, new_h))
        
        # Scale bboxes
        scaled_bboxes = []
        for box in current_bboxes:
            scaled_bboxes.append([
                box[0] * scale,
                box[1] * scale,
                box[2] * scale,
                box[3] * scale
            ])

        # Run predict with track() method
        results = model.track(frame_resized, bboxes=scaled_bboxes, persist=True, imgsz=256)
        
        # Extract data
        result_data = extract_regions(results[0], frame_index=current_idx)
        
        # Scale results back and update tracking bboxes
        next_bboxes = []
        for region in result_data["regions"]:
            bbox = region["bounding_box"]
            
            # Scale back
            orig_bbox = {
                "x_min": int(bbox["x_min"] / scale),
                "y_min": int(bbox["y_min"] / scale),
                "x_max": int(bbox["x_max"] / scale),
                "y_max": int(bbox["y_max"] / scale),
            }
            orig_bbox["width"] = orig_bbox["x_max"] - orig_bbox["x_min"]
            orig_bbox["height"] = orig_bbox["y_max"] - orig_bbox["y_min"]
            region["bounding_box"] = orig_bbox
            
            region["centroid"]["x"] = int(region["centroid"]["x"] / scale)
            region["centroid"]["y"] = int(region["centroid"]["y"] / scale)
            region["area_pixels"] = int(region["area_pixels"] / (scale * scale))
            
            next_bboxes.append([
                orig_bbox["x_min"], orig_bbox["y_min"], orig_bbox["x_max"], orig_bbox["y_max"]
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


