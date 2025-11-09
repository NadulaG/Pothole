from flask import Flask, jsonify, request
from gemini_prompt.main import analyze_hazard_image
from coord_to_address import coord_to_address
from supabase import create_client, Client
from dotenv import load_dotenv
from street_view import generate_folder
import os
from flask_cors import CORS
import re

load_dotenv()

# Initialize
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
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

    # Do not insert any row where description is null/missing
    if description is None:
        return jsonify({
            "error": "Description missing from analysis; not inserting hazard",
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

# Example: SURVEY endpoint
@app.route('/survey', methods=['POST'])
def survey():
    data = request.get_json()
    lat_min = data.get("lat_min")
    lat_max = data.get("lat_max")
    lng_min  = data.get("lng_min")
    lng_max = data.get("lng_max")
    grid_step = data.get("grid_step")
    
    folder_path = generate_folder(lat_min, lat_max, lng_min, lng_max, grid_step) # Generate Street View images for the area

    pattern = re.compile(r"lat_([-\d\.]+)_lon_([-\d\.]+)_hdg_(\d+)")


    for root, _, files in os.walk(folder_path):
        for fname in sorted(files):

            # Only images
            if not fname.lower().endswith((".jpg", ".jpeg", ".png")):
                continue

            # Extract lat/lon/heading from filename
            m = pattern.search(fname)
            if not m:
                print(f"Skipping {fname}: does not match naming pattern")
                continue

            lat = float(m.group(1))
            lng = float(m.group(2))
            hdg = int(m.group(3))

            # Build a "url" for your local image:
            # If you want, upload to Supabase first and use the public URL instead.
            img_path = os.path.join(root, fname)

            print(f"\nProcessing: {fname}")
            print(f"  → lat={lat}, lng={lng}, hdg={hdg}")

            # 1. Reverse geocode
            location = coord_to_address(lat, lng)

            # 2. Run Gemini hazard analysis
            analysis = analyze_hazard_image(img_path, location)

            # 3. Store results
            row = {
                "source": "streetview",
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

    return "Survey endpoint - not implemented yet"

if __name__ == '__main__':
    app.run(debug=True, port=5001)
