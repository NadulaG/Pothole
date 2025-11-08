"""
model_tool.py
This file defines your image-processing tool(s) for Dedalus.
"""

from ultralytics import YOLO
import os

# ✅ Load your YOLO model once (so it doesn't reload every time)
# Make sure best.pt is in the same folder or give full path
model = YOLO(os.path.join(os.path.dirname(__file__), "best.pt"))

def process_image(image_path: str) -> dict:
    # Run YOLO inference
    results = model(image_path, conf=0.5)[0]  # first (and only) batch
    potholes = []

    # Loop over all bounding boxes
    for box in results.boxes:
        x1, y1, x2, y2 = map(float, box.xyxy[0])   # bounding box
        conf = float(box.conf[0])                  # confidence
        cls_id = int(box.cls[0])                   # class index
        cls_name = model.names[cls_id]             # e.g., "pothole"

        potholes.append({
            "bbox": [x1, y1, x2, y2],
            "conf": conf,
            "cls": cls_name
        })

    # Create a human-friendly summary
    n = len(potholes)
    if n == 0:
        summary = "No potholes detected."
    elif n == 1:
        summary = "Detected 1 pothole."
    else:
        summary = f"Detected {n} potholes."

    # Optional: save annotated image (for your dashboard or website)
    annotated_path = os.path.splitext(image_path)[0] + "_annotated.jpg"
    annotated_image = results.plot()
    results.save(filename=annotated_path)

    return {
        "summary": summary,
        "count": n,
        "detections": potholes,
        "annotated_image": annotated_path
    }
