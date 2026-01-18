import asyncio
import requests
import json
import os
import sys
import cv2
import time

def run_client():
    base_url = "http://localhost:8000"
    
    # Path to video
    video_path = os.path.join(os.path.dirname(__file__), "..", "..", "Dataset", "Echo", "echo1.mp4")
    if not os.path.exists(video_path):
        print(f"Video not found: {video_path}")
        return

    # Bboxes
    bboxes = [[100, 100, 200, 200]]

    # open video
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print("Could not open video")
        return

    # Read first frame
    ret, frame0 = cap.read()
    if not ret:
        print("Empty video")
        return

    # Encode first frame
    ret, buffer = cv2.imencode('.jpg', frame0)
    if not ret:
        print("Could not encode frame")
        return
    
    print("Starting stream...")
    
    # Start stream
    try:
        files = {'image': ('frame0.jpg', buffer.tobytes(), 'image/jpeg')}
        data = {'bboxes': json.dumps(bboxes)}
        
        t0 = time.time()
        resp = requests.post(f"{base_url}/stream/start", files=files, data=data)
        print(f"Start Response: {resp.status_code}, Time: {time.time()-t0:.3f}s")
        
        if resp.status_code != 200:
            print(resp.text)
            return
            
        start_data = resp.json()
        session_id = start_data.get("session_id")
        print(f"Session ID: {session_id}")
        print(f"Frame 0 regions: {start_data.get('frame_data', {}).get('regions')}")

        # Stream loop
        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            frame_idx += 1
            if frame_idx > 20: # Limit for testing
                print("Stopping early for test...")
                break

            # Send frame
            ret, buffer = cv2.imencode('.jpg', frame)
            files = {'image': (f'frame{frame_idx}.jpg', buffer.tobytes(), 'image/jpeg')}
            data = {'session_id': session_id}
            
            t1 = time.time()
            resp = requests.post(f"{base_url}/stream/frame", files=files, data=data)
            dt = time.time() - t1
            
            if resp.status_code == 200:
                fdata = resp.json().get("frame_data", {})
                n_masks = fdata.get("masks_detected", 0)
                print(f"Frame {frame_idx}: {n_masks} masks, {dt:.3f}s")
            else:
                print(f"Frame {frame_idx} error: {resp.status_code}")
                break
                
        # End stream
        requests.post(f"{base_url}/stream/end", data={'session_id': session_id})
        print("Stream ended.")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        cap.release()

if __name__ == "__main__":
    run_client()
