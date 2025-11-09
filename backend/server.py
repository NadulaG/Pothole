from flask import Flask, jsonify, request
from gemini_prompt.main import analyze_hazard_image
from coord_to_address import coord_to_address
from supabase import create_client, Client
from dotenv import load_dotenv
from street_view import generate_folder
from street_hazard_upload import upload_local_file_to_supabase
from werkzeug.exceptions import BadRequest
import os, re, json, threading


# Initialize
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "hazard-images")
supabase: Client = create_client(url, key)

app = Flask(__name__)

# Example: POST endpoint
@app.route('/submit', methods=['POST'])
def submit_image(): 
    data = request.get_json()
    url = data.get("url")
    lat = data.get("lat")
    lng = data.get("lng")
    location = coord_to_address(lat, lng) # Convert coordinates to address
    analysis = analyze_hazard_image(url, location) # Analyze image with Gemini


    row = {
        "source": "public",
        "images": [url],
        "location": location,
        "lat": lat,
        "lng": lng,
        "hazard_type": analysis.get("hazard_type"),
        "severity": analysis.get("severity"),
        "location_context": analysis.get("location_context"),
        "description": analysis.get("description"),
        "projected_repair_cost": analysis.get("projected_repair_cost"),
        "projected_worsening": analysis.get("projected_worsening"),
        "future_worsening_description": analysis.get("future_worsening_description"),
    }

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

def process_survey_in_background(lat_min, lat_max, lon_min, lon_max, grid_step):
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

                # 5) Build and insert row in hazards table
                row = {
                    "source": "streetview",
                    "image_url": image_url,         # <- single URL column is simplest
                    "lat": lat,
                    "lon": lon,
                    "heading": hdg,
                    "location": location,
                    "hazard_type": analysis.get("hazard_type"),
                    "severity": analysis.get("severity"),
                    "location_context": analysis.get("location_context"),
                    "description": analysis.get("description"),
                    "projected_repair_cost": analysis.get("projected_repair_cost"),
                    "projected_worsening": analysis.get("projected_worsening"),
                    "future_worsening_description": analysis.get("future_worsening_description"),
                    "storage_path": storage_path,   # useful if you need to manage files later
                }

                resp = supabase.table("hazards").insert(row).execute()
                inserted.append(resp.data[0] if resp.data else row)

            except FileNotFoundError:
                failures.append({"filename": fname, "error": "File not found"})
            except Exception as e:
                failures.append({"filename": fname, "error": str(e)})

    print(f"Survey processing finished. Inserted: {len(inserted)}, Failed: {len(failures)}")

@app.route('/survey', methods=['POST'])
def survey():
    data = request.get_json(silent=True) or {}

    lat_min = _to_float('lat_min', data.get('lat_min'))
    lat_max = _to_float('lat_max', data.get('lat_max'))
    # accept lng_* but we’ll treat as lon_*
    lon_min = _to_float('lng_min/lon_min', data.get('lon_min', data.get('lng_min')))
    lon_max = _to_float('lng_max/lon_max', data.get('lon_max', data.get('lng_max')))
    grid_step = float(data.get('grid_step', 0.005))  # ≈100m of latitude

    # normalize bounds if user swapped them
    if lat_min > lat_max: lat_min, lat_max = lat_max, lat_min
    if lon_min > lon_max: lon_min, lon_max = lon_max, lon_min

    thread = threading.Thread(target=process_survey_in_background, args=(lat_min, lat_max, lon_min, lon_max, grid_step))
    thread.start()

    return jsonify({
        "ok": True,
        "message": "Survey processing started in the background."
    }), 202

if __name__ == '__main__':
    app.run(debug=True)
