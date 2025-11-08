import os
import re
import pandas as pd
from inference_sdk import InferenceHTTPClient

# --- Settings ---
images_dir = "backend/kolkata_city"              # path to your images
model_id = "pothole-clzln/1"                  # Roboflow model slug
api_key = "TJKVvtTRokcRh0CEzgCg"             # replace with your key
conf_thresh = 0.20                            # confidence threshold
# ----------------

# Initialize Roboflow client
CLIENT = InferenceHTTPClient(
    api_url="https://detect.roboflow.com",
    api_key=api_key
)

# Helper regex to parse filename pattern
pattern = re.compile(r"lat_([-\d\.]+)_lon_([-\d\.]+)_hdg_(\d+)")

records = []

# Iterate and count potholes
for root, _, files in os.walk(images_dir):
    for fname in sorted(files):
        if not fname.lower().endswith((".jpg", ".jpeg", ".png", ".bmp", ".webp")):
            continue

        m = pattern.search(fname)
        if not m:
            continue

        lat, lon, hdg = float(m.group(1)), float(m.group(2)), int(m.group(3))
        img_path = os.path.join(root, fname)

        # Run inference through Roboflow API
        try:
            result = CLIENT.infer(img_path, model=model_id)
            predictions = result.get("predictions", [])
        except Exception as e:
            print(f"Error processing {fname}: {e}")
            predictions = []

        # Count only potholes above confidence threshold
        count = sum(
            1 for pred in predictions
            if pred["class"].lower() == "pothole" and pred["confidence"] >= conf_thresh
        )

        records.append({
            "filename": fname,
            "lat": lat,
            "lon": lon,
            "hdg": hdg,
            "pothole_count": count
        })

# Convert to DataFrame
df = pd.DataFrame(records)

# Aggregate across headings for same coordinate
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

# Merge for both perspectives
agg_both = pd.merge(agg_sum, agg_max, on=["lat", "lon"])

# Save results
df.to_csv("pothole_per_image.csv", index=False)
agg_both.to_csv("pothole_per_coordinate.csv", index=False)

print("Done ✅")
print(agg_both.head())
