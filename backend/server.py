from flask import Flask, jsonify, request
from gemini_prompt.main import analyze_hazard_image
from coord_to_address import coord_to_address
from supabase import create_client, Client
from dotenv import load_dotenv
from street_view import generate_folder
import os
import re

# Initialize
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
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

def generate_folder(lat_min, lat_max, lon_min, lon_max):
    """Generates a folder of Street View images for a given bounding box."""
    bbox = (lat_min, lat_max, lon_min, lon_max)
    temp_dir = tempfile.mkdtemp()

    try:
        download_grid_images(
            api_key=os.environ.get("GOOGLE_MAPS_API_KEY"),
            bbox=bbox,
            output_dir=temp_dir,
            headings=[0, 90, 180, 270]
        )
        return temp_dir
    except Exception as e:
        # Clean up the temporary directory in case of an error
        shutil.rmtree(temp_dir)
        raise e

if __name__ == '__main__':
    app.run(debug=True)
