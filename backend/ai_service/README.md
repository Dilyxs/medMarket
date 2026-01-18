# SAM3 Video Segmentation & Tracking

This project performs video segmentation and object tracking using the SAM3 model from Ultralytics. It tracks objects defined by initial bounding boxes across video frames and exports detailed spatial data.

## Setup

1.  **Prerequisites**: Python 3.8+ (Python 3.11 recommended).
2.  **Install Dependencies**:
    Make sure you have the necessary libraries installed:
    ```bash
    pip install -r requirements.txt
    ```

## Usage

You can run the tracking application in two ways:

### 1. Using `run.sh` (Recommended)
This shell script runs the application with pre-defined bounding boxes optimized for the test video (`echo1.mp4`).

```bash
# Make the script executable (run valid only once)
chmod +x run.sh

# Run the script
./run.sh
```

### 2. Running `app.py` Directly
You can run the Python script manually and provide your own bounding boxes. Bounding boxes are specified as `x1,y1,x2,y2` arguments (comma-separated, no spaces within the coordinates).

**Syntax:**
```bash
python app.py <bbox1> [bbox2] [bbox3] ...
```

**Example:**
```bash
python app.py 706.5,442.5,905.25,555 598,635,725,750
```

## Output

The script processes the video and generates a JSON file with tracking analytics:

-   **Output File**: `segmentation_results.json`
-   **Content**:
    -   Basic video metadata (dimensions, path).
    -   Per-frame data:
        -   Frame index.
        -   Detected regions (masks).
        -   Region properties: Bounding Box (`x,y,w,h`), Centroid (`x,y`), and Area (pixels).

## Notes
-   **Performance**: Visual display (`result.show()`) and video saving are disabled by default to maximize processing speed.
-   **Model**: The script defaults to using `sam3.pt`.
-   **Video Path**: The script currently hardcodes the video path to `../Dataset/Echo/echo1.mp4` relative to the script directory. You can modify the `video_path` variable in `app.py` to change this.
