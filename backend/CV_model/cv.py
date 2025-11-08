import os
import re
import pandas as pd
from pathlib import Path
from ultralytics import YOLO

# --- Settings ---
images_dir = "backend/us_images_coarse"            # folder of images
model_path = "backend/CV_model/best.pt"            # <-- change to your weights path
conf_thresh = 0.20                                  # confidence threshold
device = 0  # GPU id (0) if available, or "cpu" to force CPU
# ----------------

# Compile filename pattern: lat_XX_lon_YY_hdg_ZZ.jpg
pattern = re.compile(r"lat_([-\d\.]+)_lon_([-\d\.]+)_hdg_(\d+)")

# Load model once
model = YOLO(model_path)

records = []

# Iterate images
for root, _, files in os.walk(images_dir):
    for fname in sorted(files):
        if not fname.lower().endswith((".jpg", ".jpeg", ".png", ".bmp", ".webp")):
            continue

        m = pattern.search(fname)
        if not m:
            # Skip files that don't match the naming pattern
            continue

        lat, lon, hdg = float(m.group(1)), float(m.group(2)), int(m.group(3))
        img_path = os.path.join(root, fname)

        try:
            # Run local inference
            results = model.predict(
                img_path,
                conf=conf_thresh,
                device=device,
                verbose=False
            )
            r = results[0]
            boxes = r.boxes

            # Map class IDs -> names (robust even for multi-class models)
            # r.names is a dict like {0: 'pothole', ...}
            names = r.names if hasattr(r, "names") else getattr(model.model, "names", {})

            pothole_count = 0
            if boxes is not None and boxes.shape[0] > 0:
                cls_ids = boxes.cls.tolist()
                confs = boxes.conf.tolist()

                for cls_id, conf in zip(cls_ids, confs):
                    name = names.get(int(cls_id), str(int(cls_id))).lower()
                    if name == "pothole" and conf >= conf_thresh:
                        pothole_count += 1

            # If your model is single-class ("pothole" only), you can replace the loop with:
            # pothole_count = int((boxes is not None) and (boxes.shape[0]))

        except Exception as e:
            print(f"Error processing {fname}: {e}")
            pothole_count = 0

        records.append({
            "filename": fname,
            "lat": lat,
            "lon": lon,
            "hdg": hdg,
            "pothole_count": pothole_count
        })

# Build DataFrame
df = pd.DataFrame(records)

# Aggregate across headings for the same coordinate
agg_sum = (
    df.groupby(["lat", "lon"], as_index=False)["pothole_count"]
      .sum()
      .rename(columns={"pothole_count": "pothole_count_sum"})
)
agg_max = (
    df.groupby(["lat", "lon"], as_index=False)["pothole_count"]
      .max()
      .rename(columns={"pothole_count": "pothole_count_max"})
)

# Merge both perspectives
agg_both = pd.merge(agg_sum, agg_max, on=["lat", "lon"])

# Save results
Path("outputs").mkdir(exist_ok=True)
df.to_csv("outputs/pothole_per_image.csv", index=False)
agg_both.to_csv("outputs/pothole_per_coordinate.csv", index=False)

print("Done ✅")
print(agg_both.head())
