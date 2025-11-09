import os
import re
import cv2
import pandas as pd
from pathlib import Path
from ultralytics import YOLO

def detect_potholes(
    images_dir: str = "backend/nj_images",
    conf_thresh: float = 0.25,
    model_path: str = "backend/CV_model/best.pt",
    device=0,
    outputs_dir: str = "outputs",
    annotated_dirname: str = "annotated"
):
    """
    Run YOLO-based pothole detection over a folder of images, save CSVs and annotated images.

    Args:
        images_dir (str): Folder containing input images. Filenames must match:
                          lat_<LAT>_lon_<LON>_hdg_<HEADING>*.jpg
        conf_thresh (float): Confidence threshold for detections.
        model_path (str): Path to YOLO .pt weights.
        device (int|str): GPU id (e.g., 0) or "cpu".
        outputs_dir (str): Where to write CSVs and annotated folder.
        annotated_dirname (str): Subfolder name under outputs_dir for annotated images.

    Returns:
        (df_per_image, df_per_coordinate, annotated_count)
    """
    pattern = re.compile(r"lat_([-\d\.]+)_lon_([-\d\.]+)_hdg_(\d+)")
    model = YOLO(model_path)

    Path(outputs_dir).mkdir(exist_ok=True)
    annotated_dir = Path(outputs_dir) / annotated_dirname
    annotated_dir.mkdir(parents=True, exist_ok=True)

    records = []
    annotated_saved = 0

    for root, _, files in os.walk(images_dir):
        for fname in sorted(files):
            if not fname.lower().endswith((".jpg", ".jpeg", ".png", ".bmp", ".webp")):
                continue

            m = pattern.search(fname)
            if not m:
                # Skip files that don't match naming pattern
                continue

            lat, lon, hdg = float(m.group(1)), float(m.group(2)), int(m.group(3))
            img_path = os.path.join(root, fname)

            try:
                results = model.predict(
                    img_path,
                    conf=conf_thresh,
                    device=device,
                    verbose=False
                )
                r = results[0]
                boxes = r.boxes

                # Map class IDs -> names
                names = getattr(r, "names", None) or getattr(model.model, "names", {}) or {}
                pothole_count = 0

                if boxes is not None and boxes.shape[0] > 0:
                    cls_ids = boxes.cls.tolist()
                    confs = boxes.conf.tolist()
                    for cls_id, conf in zip(cls_ids, confs):
                        name = names.get(int(cls_id), str(int(cls_id))).lower()
                        if name == "pothole" and conf >= conf_thresh:
                            pothole_count += 1

                # Save annotated image (Ultralytics returns BGR ndarray suitable for cv2.imwrite)
                annotated = r.plot()  # labels+conf drawn by default
                out_annot_path = annotated_dir / fname
                cv2.imwrite(str(out_annot_path), annotated)
                annotated_saved += 1

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

    # Build per-image DataFrame
    df = pd.DataFrame(records)
    if df.empty:
        print("⚠️ No valid images found / no detections.")
        # Still write empty CSVs for consistency
        (Path(outputs_dir) / "pothole_per_image.csv").write_text("")
        (Path(outputs_dir) / "pothole_per_coordinate.csv").write_text("")
        return df, pd.DataFrame(), annotated_saved

    # Aggregate across headings per coordinate
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
    agg_both = pd.merge(agg_sum, agg_max, on=["lat", "lon"])

    # Filter out coordinates with zero total potholes
    agg_both = agg_both[agg_both["pothole_count_sum"] != 0]

    # Save CSVs
    df.to_csv(Path(outputs_dir) / "pothole_per_image.csv", index=False)
    agg_both.to_csv(Path(outputs_dir) / "pothole_per_coordinate.csv", index=False)

    print(f"✅ Done. Annotated images saved to: {annotated_dir}")
    print(f"   {annotated_saved} annotated files written.")
    print(f"   Coordinates with potholes: {len(agg_both)}")
    return df, agg_both, annotated_saved


detect_potholes()