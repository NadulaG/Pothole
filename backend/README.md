# Pothole Heatmap Downloader

Python CLI to fetch Google Street View images for points or a bounding box, to enable downstream ML detection of potholes and road conditions.

## Prerequisites

- A Google Maps Platform API key with Street View Image API enabled and billing set up.
- Python 3.9+

Install deps:

```bash
pip install -r requirements.txt
```

Or from the backend folder:

```bash
pip install -r backend/requirements.txt
```

## Usage

Set your API key via `.env` or environment/flag:

```bash
# backend/.env (preferred)
echo "GOOGLE_MAPS_API_KEY=your_key_here" > backend/.env

# or set env
export GOOGLE_MAPS_API_KEY=your_key_here
```

Download images for a bounding box (grid sampling):

```bash
python backend/street_view_downloader.py \
  --bbox 40.340 40.360 -74.660 -74.620 \
  --grid_step 0.002 \
  --output_dir ./images_princeton \
  --headings 0 90 180 270 \
  --max_per_minute 60
```

Download images for explicit points from CSV:

CSV format: each row `lat,lon`

```bash
python backend/street_view_downloader.py \
  --points_file ./points.csv \
  --output_dir ./images_points \
  --headings 0 180
```

Flags:

- `--api_key` or env `GOOGLE_MAPS_API_KEY`
- Automatically loads from `backend/.env` or project `.env` if present
- `--output_dir` directory to save images (default `output_images`)
- `--points_file` CSV or JSON (`[{"lat":..,"lon":..}]`)
- `--bbox LAT_MIN LAT_MAX LON_MIN LON_MAX` for grid sampling
- `--grid_step` degrees between samples (default `0.002` ~ 222m at equator)
- `--headings` list of headings to capture (default `0 90 180 270`)
- `--size` image size (default `640 640`)
- `--fov` field of view (default `90`)
- `--pitch` camera pitch (default `0`)
- `--no_metadata` skip metadata pre-check (by default uses metadata)
- `--max_per_minute` rate limit (default `60`)
- `--max_requests` cap total requests (optional)

Outputs:

- Images saved as `lat_<lat>_lon_<lon>_hdg_<heading>_<source>.jpg`
- Log file `downloads.csv` with columns: `lat, lon, heading, filename, status, source`

## Notes

- Be mindful of Google Maps Platform Terms of Service and per-request billing.
- Metadata pre-check reduces failed image requests by confirming a nearby panorama exists.
- If you hit `429 Too Many Requests`, increase `--max_per_minute` spacing or reduce concurrency.