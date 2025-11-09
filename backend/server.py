from flask import Flask, jsonify, request
from gemini_prompt.main import analyze_hazard_image
from coord_to_address import coord_to_address
from supabase import create_client, Client
from dotenv import load_dotenv
import os

# Initialize
url = "https://yyhtlfhxygvdqihdyoym.supabase.co"
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

if __name__ == '__main__':
    app.run(debug=True)
