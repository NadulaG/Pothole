from flask import Flask, jsonify, request
from gemini_prompt.main import analyze_hazard_image
from coord_to_address import coord_to_address
from supabase import create_client, Client
from dotenv import load_dotenv
from street_view import generate_folder
from street_hazard_upload import upload_local_file_to_supabase
from werkzeug.exceptions import BadRequest
import os
import re
import json
import threading
from flask_cors import CORS
from datetime import datetime, timezone

load_dotenv()

# Initialize
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "hazard-images")
supabase: Client = create_client(url, key)

app = Flask(__name__)

# CORS: allow Vite dev ports and handle preflight
CORS(
    app,
    origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
)

# Example: POST endpoint (with preflight support)
@app.route('/submit', methods=['POST', 'OPTIONS'])
def submit_image(): 
    if request.method == 'OPTIONS':
        # Flask-CORS should handle this, but explicitly return OK to avoid 403s
        return ('', 204)
    data = request.get_json()
    url = data.get("url")
    lat = data.get("lat")
    lng = data.get("lng")
    location = coord_to_address(lat, lng) # Convert coordinates to address
    analysis = analyze_hazard_image(url, location) # Analyze image with Gemini

    # Helper to normalize severity into an int within [0, 10];
    # return None if it cannot be parsed so DB default can apply.
    def _normalize_severity(value):
        if value is None:
            return None
        try:
            # Accept numbers directly
            if isinstance(value, (int, float)):
                val = int(round(value))
            else:
                # Attempt to extract a number from strings like "7", "7/10", "severity: 5"
                import re
                m = re.search(r"(-?\d+(?:\.\d+)?)", str(value))
                if not m:
                    return None
                val = int(round(float(m.group(1))))
            # Clamp to valid range
            if val < 0:
                val = 0
            if val > 10:
                val = 10
            return val
        except Exception:
            return None

    # Build insert payload; if Gemini failed, still insert minimal row and let defaults apply
    severity = _normalize_severity(analysis.get("severity")) if isinstance(analysis, dict) else None
    description = (analysis.get("description") if isinstance(analysis, dict) else None)

    # Do not insert any row where description is missing or empty
    if (description is None) or (not isinstance(description, str)) or (description.strip() == ""):
        return jsonify({
            "error": "Description missing or empty; not inserting hazard",
            "details": "Backend requires non-null description to insert",
            "analysis": analysis
        }), 422

    row = {
        "source": "public",
        "images": [url],
        "location": location,
        "lat": lat,
        "lng": lng,
        # Optional AI fields — omit if unavailable so DB defaults apply
        "hazard_type": (analysis.get("hazard_type") if isinstance(analysis, dict) else None),
        "severity": severity,
        "location_context": (analysis.get("location_context") if isinstance(analysis, dict) else None),
        "description": description,
        "projected_repair_cost": (analysis.get("projected_repair_cost") if isinstance(analysis, dict) else None),
        "projected_worsening": (analysis.get("projected_worsening") if isinstance(analysis, dict) else None),
        "future_worsening_description": (analysis.get("future_worsening_description") if isinstance(analysis, dict) else None),
    }

    # Drop None values so Postgres uses column defaults and avoids NOT NULL violations
    row = {k: v for k, v in row.items() if v is not None}

    try:
        supabase.table("hazards").insert(row).execute()
    except Exception as e:
        print("[Supabase Error]", e)
        return jsonify({"error": "Failed to insert into Supabase", "details": str(e)}), 500
    
    return analysis # Return the analysis result as JSON

pattern = re.compile(r"lat_([-\d\.]+)_lon_([-\d\.]+)_hdg_(\d+)")
def _to_float(name, val):
    try:
        return float(val)
    except (TypeError, ValueError):
        raise BadRequest(f"Missing/invalid '{name}'")

def process_survey_in_background(lat_min, lat_max, lon_min, lon_max, grid_step, survey_id=None):
    # 1) Generate Street View images into a folder (your existing function)
    folder_path = generate_folder(lat_min, lat_max, lon_min, lon_max, grid_step)

    inserted = []
    failures = []

    for root, _, files in os.walk(folder_path):
        for fname in sorted(files):
            if not fname.lower().endswith((".jpg", ".jpeg", ".png")):
                continue

            m = pattern.search(fname)
            if not m:
                print(f"Skipping {fname}: does not match naming pattern")
                continue

            lat = float(m.group(1))
            lon = float(m.group(2))
            hdg = int(m.group(3))

            img_path = os.path.join(root, fname)

            try:
                # 2) Upload image to Supabase Storage -> get URL
                storage_prefix = f"survey/{lat:.6f}_{lon:.6f}"
                storage_path, image_url = upload_local_file_to_supabase(
                    file_path=img_path,
                    storage_prefix=storage_prefix,
                    bucket=SUPABASE_BUCKET,
                    make_public=True,       # or False + sign_seconds=...
                    # sign_seconds=3600,
                    upsert=True
                )

                # 3) Reverse geocode
                location = coord_to_address(lat, lon) or "Address not found"

                # 4) Analyze with Gemini using the URL (NOT the local path)
                # If your analyze_hazard_image can accept bytes/paths, you can change it.
                analysis = analyze_hazard_image(image_url, location)

                # If analysis is a JSON string, parse it
                if isinstance(analysis, str):
                    try:
                        analysis = json.loads(analysis)
                    except Exception:
                        analysis = {}

                # 5) Build and insert row in hazards table (match DB schema)
                # Inline normalization: clamp severity to int within [0, 10]
                raw_severity = analysis.get("severity") if isinstance(analysis, dict) else None
                severity = None
                if raw_severity is not None:
                    try:
                        severity = int(round(float(raw_severity)))
                        if severity < 0:
                            severity = 0
                        if severity > 10:
                            severity = 10
                    except Exception:
                        severity = None

                # Skip insert if description is missing or empty
                desc = analysis.get("description") if isinstance(analysis, dict) else None
                if (desc is None) or (not isinstance(desc, str)) or (desc.strip() == ""):
                    failures.append({"filename": fname, "error": "Empty description from analysis; not inserting"})
                    continue

                row = {
                    "source": "survey",
                    "images": [image_url],
                    "lat": lat,
                    "lng": lon,
                    "location": location,
                    "hazard_type": (analysis.get("hazard_type") if isinstance(analysis, dict) else None),
                    "severity": severity,
                    "location_context": (analysis.get("location_context") if isinstance(analysis, dict) else None),
                    "description": desc,
                    "projected_repair_cost": (analysis.get("projected_repair_cost") if isinstance(analysis, dict) else None),
                    "projected_worsening": (analysis.get("projected_worsening") if isinstance(analysis, dict) else None),
                    "future_worsening_description": (analysis.get("future_worsening_description") if isinstance(analysis, dict) else None),
                }

                # Drop None values so Postgres uses column defaults
                row = {k: v for k, v in row.items() if v is not None}

                resp = supabase.table("hazards").insert(row).execute()
                inserted.append(resp.data[0] if resp.data else row)

            except FileNotFoundError:
                failures.append({"filename": fname, "error": "File not found"})
            except Exception as e:
                failures.append({"filename": fname, "error": str(e)})

    print(failures)
    print(f"Survey processing finished. Inserted: {len(inserted)}, Failed: {len(failures)}")

    # Update surveys table when background job completes
    if survey_id:
        try:
            supabase\
                .from_("surveys")\
                .update({
                    "status": "complete",
                    "hazards_found": len(inserted),
                    "completed_at": datetime.now(timezone.utc).isoformat()
                })\
                .eq("id", survey_id)\
                .execute()
        except Exception as e:
            print("[Supabase Error] Failed to update survey status:", e)

@app.route('/survey', methods=['POST'])
def survey():
    data = request.get_json(silent=True) or {}

    lat_min = _to_float('lat_min', data.get('lat_min'))
    lat_max = _to_float('lat_max', data.get('lat_max'))
    # accept lng_* but we’ll treat as lon_*
    lon_min = _to_float('lng_min/lon_min', data.get('lon_min', data.get('lng_min')))
    lon_max = _to_float('lng_max/lon_max', data.get('lon_max', data.get('lng_max')))
    grid_step = float(data.get('grid_step', 0.005))  # ≈100m of latitude
    survey_id = data.get('survey_id')

    # normalize bounds if user swapped them
    if lat_min > lat_max: lat_min, lat_max = lat_max, lat_min
    if lon_min > lon_max: lon_min, lon_max = lon_max, lon_min

    thread = threading.Thread(
        target=process_survey_in_background,
        args=(lat_min, lat_max, lon_min, lon_max, grid_step, survey_id)
    )
    thread.start()

    return jsonify({
        "ok": True,
        "message": "Survey processing started in the background."
    }), 202

if __name__ == '__main__':
    app.run(debug=True, port=5001)
