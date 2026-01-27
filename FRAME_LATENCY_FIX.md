# Frame Latency Fix Documentation

## Problem
The video broadcaster component was experiencing significant latency between frames, making the video stream appear very slow and choppy.

## Root Cause
The frame capture interval in `frontend/components/video-broadcaster.tsx` was set to **150ms** between each frame capture (line 312). This resulted in only approximately **6.67 frames per second (FPS)**, which is far too slow for smooth video playback.

## Solution
The frame capture interval has been reduced to **33ms**, which provides approximately **30 FPS**. This is a standard frame rate for smooth video streaming.

### Technical Details

**Before:**
```typescript
frameIntervalRef.current = setInterval(() => {
  captureAndSendFrame();
}, 150); // ~6.67 FPS
```

**After:**
```typescript
frameIntervalRef.current = setInterval(() => {
  captureAndSendFrame();
}, 33); // ~30 FPS
```

## Performance Impact

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Frame Interval | 150ms | 33ms | **4.5x faster** |
| Frame Rate | ~6.67 FPS | ~30 FPS | **4.5x improvement** |
| Latency per frame | 150ms | 33ms | **117ms reduction** |

## Additional Fixes
- Removed unused `reverseIntervalRef` reference that was causing cleanup errors
- Added clear comment explaining the FPS target for future maintainability

## Testing Recommendations
1. Load the video broadcaster component
2. Observe the frame rate is now smooth and responsive
3. Check the browser console to verify frames are being sent at ~30 FPS
4. Monitor WebSocket connection to ensure it can handle the increased throughput
5. Check backend logs to verify frames are being processed efficiently

## Notes
- 30 FPS is the standard for smooth video streaming
- If performance issues occur with 30 FPS, consider:
  - Reducing video resolution
  - Adjusting JPEG quality (currently 0.8)
  - Implementing frame skipping if backend processing is slow

## Future Enhancements
- **Consider using `requestAnimationFrame`**: Instead of `setInterval`, using `requestAnimationFrame` could provide better timing accuracy and performance, especially under heavy load. This would require refactoring the frame capture logic to be frame-based rather than time-based, but could result in smoother frame delivery
