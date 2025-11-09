import requests

def coord_to_address(lat, lon):
    """Convert coordinates to address using OpenStreetMap Nominatim API safely."""
    url = f"https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat={lat}&lon={lon}"
    headers = {
        # Nominatim requires a user-agent or it may reject the request
        "User-Agent": "HazardDetectionApp/1.0 (contact@example.com)"
    }

    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"[coord_to_address] Network or HTTP error: {e}")
        return "Address lookup failed"

    # Try parsing JSON safely
    try:
        data = response.json()
    except ValueError:
        print(f"[coord_to_address] Non-JSON response: {response.text[:200]}")
        return "Address lookup failed"

    # Check API errors
    if "error" in data:
        return "Address not found"

    return data.get("display_name", "Address not found")