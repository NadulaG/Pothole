import google.generativeai as genai
import requests
from dotenv import load_dotenv
import os

load_dotenv()  # Load environment variables from .env file


# Configure Gemini API key once
genai.configure(api_key=os.getenv("NADULAS_GEMINI_API_KEY"))

def analyze_hazard_image(url: str, location: str) -> dict:
    """Analyzes a road hazard image via Gemini 2.5 Flash and returns parsed JSON."""
    
    # 1. Fetch image bytes
    resp = requests.get(url)
    resp.raise_for_status()
    
    # 2. Prepare model and prompt
    model = genai.GenerativeModel("gemini-2.5-flash")

    prompt = f"""
    Analyze the road image and output only valid JSON.

    Use {location} for the location.
    location_context = short description of surroundings (e.g., “residential area”, “highway”), not an address.
    description = detailed description of the hazard and its dangers.
    severity: 0–10, based on realistic danger (no exaggeration).
    projected_worsening: "none", "slow", "moderate", or "rapid".
    projected_repair_cost: estimated from severity and typical repair costs.
    future_worsening_description: realistic description of how the hazard might worsen over time.

    If the image is not a real road or clear safety hazard, return an error (not JSON).
    hazard_type: choose from pothole, flooding, debris, damaged_signage; otherwise use your own label.

    JSON schema:
    {{
      "hazard_type": string,
      "severity": number,
      "location_context": string,
      "description": string,
      "projected_repair_cost": number,
      "projected_worsening": string,
      "future_worsening_description": string
    }}
    Return only JSON — no markdown or explanations.
    """

    # 3. Generate content
    result = model.generate_content([
        {"text": prompt},
        {"inline_data": {"mime_type": "image/jpeg", "data": resp.content}}
    ])

    # 4. Try parsing the result into JSON
    try:
        import json
        data = json.loads(result.text)
        return data
    except Exception:
        # Return raw text if JSON parse fails
        return {"error": "Model did not return valid JSON", "raw_output": result.text}
