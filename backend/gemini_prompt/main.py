import google.generativeai as genai
import requests
import json

# Configure your API key
genai.configure(api_key="AIzaSyChXpR_lGdFNk8jEUB_wjky0AMPpN5Di8A")

# Image URL
image_url = "https://yyhtlfhxygvdqihdyoym.supabase.co/storage/v1/object/sign/hazard-images/f21cef12-51f6-4f83-83e6-b18c8de020d9-MicrosoftTeams-image_32.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9iM2NmM2YzZS02MjE0LTQ3YzQtYmQwNC01ZTI1ZjU1ZjFlYjkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJoYXphcmQtaW1hZ2VzL2YyMWNlZjEyLTUxZjYtNGY4My04M2U2LWIxOGM4ZGUwMjBkOS1NaWNyb3NvZnRUZWFtcy1pbWFnZV8zMi5qcGciLCJpYXQiOjE3NjI2MzQyNjUsImV4cCI6MTc2MzIzOTA2NX0.dtJ48z35essqnjvRXZxoAnP2lDvvlwXUlO9RsnWVyAQ"

# Fetch the image bytes
resp = requests.get(image_url)
resp.raise_for_status()

# Use Gemini 2.5 Flash for low-cost, multimodal analysis
model = genai.GenerativeModel("gemini-2.5-flash")

# Prompt: tell it to return pure JSON
prompt = """
Analyze this road image and return **only** valid JSON.
The location of this image is: "2440, 85th Street, Brooklyn, New York USA".
location_context should not include the address, but rather a description of the surroundings (e.g., "residential area", "near a school", "highway").
Severity is based on the size of the hazard and its potential damage from 0 (no hazard) to 10 (extreme hazard).
Projected worsening is categorized as "none", "slow", "moderate", or "rapid" based on the current state of the hazard and typical progression patterns.
For projected worsening, consider factors such as the current size of the weather conditions and traffic patterns of the location.
Projected repair cost is estimated based on the severity and typical repair costs for similar hazards. 
Please also include a description of why the projected repair cost is what it is. Be concise: no more than 2 sentences.

JSON schema:
{
  
  "hazard_type": string,
  "severity": number,
  "pop_density": string,
  "location_context": string,
  "description": string,
  "projected_repair_cost": number,
  "projected_worsening": string,
  "future_worsening_description": string
}
Do not include any text before or after the JSON.
"""

# Send text + image
result = model.generate_content([
    {"text": prompt},
    {"inline_data": {"mime_type": "image/jpeg", "data": resp.content}}
])

# Print raw model output
print("Raw response:\n", result.text)