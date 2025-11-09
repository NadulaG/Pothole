import argparse
import csv
import json
import math
import os
import time
from collections import deque
from typing import List, Tuple, Optional

import requests
from tqdm import tqdm
import tempfile
import shutil
import tempfile
import shutil

STREET_VIEW_IMAGE_URL = "https://maps.googleapis.com/maps/api/streetview"
STREET_VIEW_METADATA_URL = "https://maps.googleapis.com/maps/api/streetview/metadata"

# Optional dotenv support to load API key from .env
try:
    from dotenv import load_dotenv  # type: ignore
    _DOTENV_AVAILABLE = True
except Exception:
    _DOTENV_AVAILABLE = False


def _ensure_env_loaded():
    if not _DOTENV_AVAILABLE:
        return
    # Prefer backend/.env (same dir as this script), then project root .env
    candidates = [
        os.path.join(os.path.dirname(__file__), ".env"),
        os.path.join(os.getcwd(), ".env"),
    ]
    for p in candidates:
        if os.path.exists(p):
            # Do not override existing env values
            load_dotenv(p, override=False)
            break


class RateLimiter:
    def __init__(self, max_per_minute: int):
        self.max_per_minute = max_per_minute
        self.timestamps = deque()

    def wait(self):
        now = time.time()
        # Remove timestamps older than 60 seconds
        while self.timestamps and now - self.timestamps[0] > 60:
            self.timestamps.popleft()
        if len(self.timestamps) >= self.max_per_minute:
            sleep_for = 60 - (now - self.timestamps[0])
            if sleep_for > 0:
                time.sleep(sleep_for)
        # Record the request timestamp
        self.timestamps.append(time.time())


def parse_points_file(path: str) -> List[Tuple[float, float]]:
    points: List[Tuple[float, float]] = []
    with open(path, "r", newline="") as f:
        # try CSV first
        try:
            reader = csv.reader(f)
            for row in reader:
                if not row or len(row) < 2:
                    continue
                try:
                    lat = float(row[0])
                    lon = float(row[1])
                except ValueError:
                    # Maybe has headers; try DictReader
                    break
                points.append((lat, lon))
            if points:
                return points
        except csv.Error:
            pass

    # Fallback to JSON with [{"lat":..., "lon":...}, ...]
    with open(path, "r") as jf:
        data = json.load(jf)
        for item in data:
            lat = float(item["lat"]) if "lat" in item else float(item["latitude"])  # type: ignore
            lon = float(item["lon"]) if "lon" in item else float(item["longitude"])  # type: ignore
            points.append((lat, lon))
    return points


def generate_grid(bbox: Tuple[float, float, float, float], step_deg: float) -> List[Tuple[float, float]]:
    lat_min, lat_max, lon_min, lon_max = bbox
    points: List[Tuple[float, float]] = []
    if lat_min > lat_max or lon_min > lon_max:
        raise ValueError("Invalid bbox: ensure lat_min <= lat_max and lon_min <= lon_max")
    lat = lat_min
    while lat <= lat_max + 1e-9:
        lon = lon_min
        while lon <= lon_max + 1e-9:
            points.append((round(lat, 6), round(lon, 6)))
            lon += step_deg
        lat += step_deg
    return points


def request_with_retries(url: str, params: dict, max_retries: int = 3, timeout: int = 20) -> requests.Response:
    attempt = 0
    while True:
        attempt += 1
        try:
            resp = requests.get(url, params=params, timeout=timeout)
        except requests.RequestException as e:
            if attempt <= max_retries:
                time.sleep(min(2 ** attempt, 10))
                continue
            raise e

        if resp.status_code in (200, 404):
            return resp
        if resp.status_code == 429:
            retry_after = resp.headers.get("Retry-After")
            wait_s = float(retry_after) if retry_after else min(2 ** attempt, 60)
            time.sleep(wait_s)
        elif resp.status_code >= 500 and attempt <= max_retries:
            time.sleep(min(2 ** attempt, 10))
        else:
            return resp


def street_view_metadata(api_key: str, lat: float, lon: float) -> dict:
    params = {
        "key": api_key,
        "location": f"{lat},{lon}",
    }
    resp = request_with_retries(STREET_VIEW_METADATA_URL, params)
    try:
        return resp.json()
    except Exception:
        return {"status": "ERROR", "http_status": resp.status_code}


def street_view_image_url(
    api_key: str,
    size: Tuple[int, int],
    heading: int,
    fov: int,
    pitch: int,
    location: Optional[Tuple[float, float]] = None,
    pano_id: Optional[str] = None,
):
    params = {
        "key": api_key,
        "size": f"{size[0]}x{size[1]}",
        "heading": str(heading),
        "fov": str(fov),
        "pitch": str(pitch),
    }
    if pano_id:
        params["pano"] = pano_id
    elif location:
        lat, lon = location
        params["location"] = f"{lat},{lon}"
    else:
        raise ValueError("Either location or pano_id must be provided")
    return STREET_VIEW_IMAGE_URL, params


def save_image(content: bytes, out_path: str):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(content)


def run_downloader(
    api_key: str,
    points: List[Tuple[float, float]],
    output_dir: str,
    headings: List[int],
    size: Tuple[int, int] = (640, 640),
    fov: int = 90,
    pitch: int = 0,
    use_metadata: bool = True,
    max_per_minute: int = 30000,
    max_requests: Optional[int] = None,
):
    os.makedirs(output_dir, exist_ok=True)
    limiter = RateLimiter(max_per_minute)
    log_path = os.path.join(output_dir, "downloads.csv")
    log_file = open(log_path, "a", newline="")
    log_writer = csv.writer(log_file)
    if os.stat(log_path).st_size == 0:
        log_writer.writerow(["lat", "lon", "heading", "filename", "status", "source"])  # header

    total_requests = 0
    for lat, lon in tqdm(points, desc="Points", unit="pt"):
        pano_id: Optional[str] = None
        src = "location"
        if use_metadata:
            md = street_view_metadata(api_key, lat, lon)
            status = md.get("status", "UNKNOWN")
            if status == "OK":
                pano_id = md.get("pano_id")
                loc = md.get("location") or {}
                lat = float(loc.get("lat", lat))
                lon = float(loc.get("lng", lon))
                src = "pano" if pano_id else "location"
            else:
                # no panorama nearby; skip
                for hdg in headings:
                    log_writer.writerow([lat, lon, hdg, "", status, "metadata"])
                continue

        for heading in headings:
            if max_requests is not None and total_requests >= max_requests:
                log_file.flush()
                log_file.close()
                return
            # Rate limit before each request
            limiter.wait()
            url, params = street_view_image_url(
                api_key=api_key,
                size=size,
                heading=heading,
                fov=fov,
                pitch=pitch,
                location=None if pano_id else (lat, lon),
                pano_id=pano_id,
            )
            resp = request_with_retries(url, params, max_retries=3)
            total_requests += 1
            status = resp.status_code
            if status == 200:
                filename = f"lat_{lat}_lon_{lon}_hdg_{heading}_{src}.jpg"
                out_path = os.path.join(output_dir, filename)
                save_image(resp.content, out_path)
                log_writer.writerow([lat, lon, heading, filename, "OK", src])
            else:
                log_writer.writerow([lat, lon, heading, "", f"HTTP_{status}", src])

    log_file.flush()
    log_file.close()


def parse_args():
    _ensure_env_loaded()
    parser = argparse.ArgumentParser(
        description="Download Google Street View images for specified points or bounding boxes."
    )
    parser.add_argument("--api_key", type=str, default=os.environ.get("GOOGLE_MAPS_API_KEY"), help="Google Maps API key or set GOOGLE_MAPS_API_KEY env var")
    parser.add_argument("--output_dir", type=str, default="output_images", help="Directory to save images")
    parser.add_argument("--points_file", type=str, help="CSV or JSON file with points: CSV rows 'lat,lon' or JSON [{'lat':..,'lon':..}]")
    parser.add_argument("--bbox", type=float, nargs=4, metavar=("LAT_MIN", "LAT_MAX", "LON_MIN", "LON_MAX"), help="Bounding box to sample (lat_min lat_max lon_min lon_max)")
    parser.add_argument("--grid_step", type=float, default=0.002, help="Grid step in degrees (approx 222m at equator)")
    parser.add_argument("--headings", type=int, nargs="*", default=[0, 90, 180, 270], help="Headings to capture (degrees)")
    parser.add_argument("--size", type=int, nargs=2, default=[640, 640], help="Image size width height")
    parser.add_argument("--fov", type=int, default=90, help="Field of view (degrees)")
    parser.add_argument("--pitch", type=int, default=0, help="Camera pitch (-90 to 90)")
    parser.add_argument("--no_metadata", action="store_true", help="Skip Street View metadata pre-check")
    parser.add_argument("--max_per_minute", type=int, default=60, help="Rate limit requests per minute")
    parser.add_argument("--max_requests", type=int, default=None, help="Optional cap on total requests")
    args = parser.parse_args()
    if not args.api_key:
        raise SystemExit("Missing API key. Set --api_key or GOOGLE_MAPS_API_KEY.")
    if not args.points_file and not args.bbox:
        raise SystemExit("Provide either --points_file or --bbox.")
    return args


def main():
    args = parse_args()

    if args.points_file:
        points = parse_points_file(args.points_file)
    else:
        lat_min, lat_max, lon_min, lon_max = args.bbox
        points = generate_grid((lat_min, lat_max, lon_min, lon_max), args.grid_step)

    run_downloader(
        api_key=args.api_key,
        points=points,
        output_dir=args.output_dir,
        headings=args.headings,
        size=(args.size[0], args.size[1]),
        fov=args.fov,
        pitch=args.pitch,
        use_metadata=(not args.no_metadata),
        max_per_minute=args.max_per_minute,
        max_requests=args.max_requests,
    )

def generate_folder(lat_min, lat_max, lon_min, lon_max, grid_step: float = 0.002):
    """Generates a folder of Street View images for a given bounding box."""
    _ensure_env_loaded()
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not api_key:
        raise ValueError("Missing API key. Set GOOGLE_MAPS_API_KEY env var.")

    # Use a temporary directory
    temp_dir = tempfile.mkdtemp()

    try:
        # Generate points from bbox
        points = generate_grid((lat_min, lat_max, lon_min, lon_max), grid_step)

        # Call the existing downloader function
        run_downloader(
            api_key=api_key,
            points=points,
            output_dir=temp_dir,
            # Use defaults from parse_args for other params
            headings=[0, 90, 180, 270],
            size=(640, 640),
            fov=90,
            pitch=0,
            use_metadata=True,
            max_per_minute=30000,
            max_requests=None,
        )
        return temp_dir
    except Exception as e:
        # Clean up the temporary directory in case of an error
        shutil.rmtree(temp_dir)
        raise e


if __name__ == "__main__":
    main()