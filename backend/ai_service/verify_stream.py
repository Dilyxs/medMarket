import asyncio
import websockets
import json
import os

async def test_stream():
    uri = "ws://localhost:8000/ws/segment_video"
    print(f"Connecting to {uri}")
    
    # Ensure server has time to start up if we ran it concurrently, 
    # but here we will assume it's running or we will start it.
    # We'll just try to connect.
    
    async with websockets.connect(uri) as websocket:
        # Send config (optional, but good to test)
        config = {
            "bboxes": [[100, 100, 200, 200]],
            # "video_path": Use default
        }
        await websocket.send(json.dumps(config))
        print("Sent config")

        frames_received = 0
        try:
            while True and frames_received < 10:
                message = await websocket.recv()
                # Message should be bytes
                if isinstance(message, bytes):
                    frames_received += 1
                    print(f"Received frame {frames_received}, size: {len(message)} bytes")
                    # Save first frame to verify
                    if frames_received == 1:
                        with open("test_frame.jpg", "wb") as f:
                            f.write(message)
                        print("Saved test_frame.jpg")
                else:
                    print(f"Received non-binary message: {message}")
        except websockets.exceptions.ConnectionClosed:
            print("Connection closed")
        
    print(f"Test finished. Received {frames_received} frames.")

if __name__ == "__main__":
    asyncio.run(test_stream())
