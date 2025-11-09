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
    Analyze this road image and return **only** valid JSON.
    The location of this image is: {location}.
    location_context should not include the address, but rather a description of the surroundings 
    (e.g., "residential area", "near a school", "highway").
    Severity is based on the size of the hazard and its potential damage from 0 (no hazard) to 10 (extreme hazard).
    Projected worsening is categorized as "none", "slow", "moderate", or "rapid" based on the current state of the hazard 
    and typical progression patterns.
    Projected repair cost is estimated based on the severity and typical repair costs for similar hazards. 
    Include a brief reason (max two sentences).

    If model is not a clear road or safety hazard or is clearly not realisitic, return an error (do not return JSON).
    For hazard_type, first consider classifying the hazard into one of the following categories:
    - pothole, flooding, debris, damaged_signage
    Otherwise, return your own classification in hazard_type. 
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
