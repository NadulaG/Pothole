import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import * as Leaflet from "leaflet";
import PotholeDetector from "./components/PotholeDetector";
const L = Leaflet;
if (typeof window !== "undefined") {
  // Ensure Leaflet is available globally for plugins like leaflet.heat
  // eslint-disable-next-line no-undef
  window.L = Leaflet;
}
import Legend from "./components/Legend.jsx";
import Logo from "/logo.png";

const DEFAULT_CENTER = [40.3439, -74.6562]; // Princeton area
const DEFAULT_ZOOM = 13;

function App() {
  const [view, setView] = useState("map");
  const [points, setPoints] = useState([]);
  // Fixed heatmap parameters per request
  const HEAT_RADIUS = 50; // max radius
  const HEAT_BLUR = 5; // minimum blur
  const HEAT_MIN_OPACITY = 0.55; // slightly above 50%
  const HEAT_MAX = 3; // maximum cap
  const gradient = {
    0.0: "#3b0b0b",
    0.33: "#7a1212",
    0.66: "#cf3a3a",
    1.0: "#ff6b6b",
  };
  const heatOptions = useMemo(
    () => ({
      radius: HEAT_RADIUS,
      blur: HEAT_BLUR,
      minOpacity: HEAT_MIN_OPACITY,
      max: HEAT_MAX,
      gradient,
    }),
    []
  );
  const mapRef = useRef(null);
  const heatRef = useRef(null);
  const searchInputRef = useRef(null);
  const roadDataRef = useRef({ ways: [] });
  const highlightGroupRef = useRef(null);
  const [search, setSearch] = useState("Princeton, NJ");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mapRef.current) return;
    const map = L.map("map").setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    mapRef.current = map;
    // Auto-load sample once the map is initialized
    loadSample();
  }, []);

  // Fetch OSM roads (highways) for current bounds via Overpass
  const fetchRoadsForBounds = async (bounds) => {
    const south = bounds.getSouth();
    const west = bounds.getWest();
    const north = bounds.getNorth();
    const east = bounds.getEast();
    const q = `[
      out:json][timeout:25];
      (
        way["highway"](${south},${west},${north},${east});
      );
      (._;>;);
      out body;`;
    try {
      const resp = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(q)}`,
      });
      const json = await resp.json();
      const nodes = new Map();
      for (const el of json.elements || []) {
        if (el.type === "node") nodes.set(el.id, { lat: el.lat, lon: el.lon });
      }
      const ways = [];
      for (const el of json.elements || []) {
        if (el.type === "way" && Array.isArray(el.nodes)) {
          const coords = el.nodes
            .map((nid) => nodes.get(nid))
            .filter(Boolean)
            .map((n) => [n.lat, n.lon]);
          if (coords.length >= 2) ways.push(coords);
        }
      }
      roadDataRef.current.ways = ways;
    } catch (e) {
      console.error("Failed to fetch roads from Overpass", e);
      roadDataRef.current.ways = [];
    }
  };

  // Find short segment along the nearest road to a point (approximate planar calc)
  const closestSegmentNearPoint = (lat, lon, ways) => {
    let best = null;
    let bestDist2 = Infinity;
    const toRad = Math.PI / 180;
    const cosLat = Math.cos(lat * toRad);
    const proj = (la, lo) => [lo * cosLat, la];
    const P = proj(lat, lon);
    const lerp = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
    for (const coords of ways) {
      for (let i = 0; i < coords.length - 1; i++) {
        const A = coords[i];
        const B = coords[i + 1];
        const Ap = proj(A[0], A[1]);
        const Bp = proj(B[0], B[1]);
        const vx = Bp[0] - Ap[0];
        const vy = Bp[1] - Ap[1];
        const wx = P[0] - Ap[0];
        const wy = P[1] - Ap[1];
        const vv = vx * vx + vy * vy;
        if (vv === 0) continue;
        let t = (wx * vx + wy * vy) / vv;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const Cx = Ap[0] + vx * t;
        const Cy = Ap[1] + vy * t;
        const dx = P[0] - Cx;
        const dy = P[1] - Cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist2) {
          bestDist2 = d2;
          const t0 = Math.max(0, t - 0.1);
          const t1 = Math.min(1, t + 0.1);
          const p0 = lerp([A[0], A[1]], [B[0], B[1]], t0);
          const p1 = lerp([A[0], A[1]], [B[0], B[1]], t1);
          best = [p0, p1];
        }
      }
    }
    return best;
  };

  // Build street-line highlights instead of heat circles
  useEffect(() => {
    if (view !== 'map') return;
    const map = mapRef.current;
    if (!map) return;
    // Remove existing heat layer if present
    if (heatRef.current) {
      map.removeLayer(heatRef.current);
      heatRef.current = null;
    }
    // Clear previous highlights
    if (highlightGroupRef.current) {
      map.removeLayer(highlightGroupRef.current);
      highlightGroupRef.current = null;
    }
    const pointsArr = points;
    if (!pointsArr || pointsArr.length === 0) return;
    const setup = async () => {
      // Ensure roads are available for current bounds
      if (!roadDataRef.current.ways || roadDataRef.current.ways.length === 0) {
        const b = map.getBounds();
        await fetchRoadsForBounds(b);
      }
      const ways = roadDataRef.current.ways || [];
      const group = L.layerGroup();
      if (ways.length === 0) {
        // Fallback: draw small markers if roads not available
        for (const [la, lo] of pointsArr) {
          L.circleMarker([la, lo], {
            radius: 3,
            color: "#ff6b6b",
            weight: 2,
            opacity: 0.9,
            fillOpacity: 0.9,
          }).addTo(group);
        }
      } else {
        for (const [la, lo] of pointsArr) {
          const seg = closestSegmentNearPoint(la, lo, ways);
          if (seg) {
            L.polyline(seg, {
              color: "#ff6b6b",
              weight: 5,
              opacity: 0.85,
            }).addTo(group);
          } else {
            // If no segment is near, drop a tiny marker to indicate location
            L.circleMarker([la, lo], {
              radius: 2,
              color: "#ff6b6b",
              weight: 2,
              opacity: 0.8,
              fillOpacity: 0.8,
            }).addTo(group);
          }
        }
      }
      group.addTo(map);
      highlightGroupRef.current = group;
    };
    setup();
  }, [points, view]);

  const loadSample = async () => {
    try {
      setLoading(true);
      const res = await fetch("/sample-heatmap.json");
      const data = await res.json();
      setPoints(normalize(data));
    } catch (e) {
      console.error("Failed to load sample dataset", e);
    }
    setLoading(false);
  };

  // Removed: auto-load effect; now called after map initialization above

  const normalize = (data) => {
    if (!Array.isArray(data)) return [];
    return data
      .map((d) => {
        if (Array.isArray(d)) {
          const [lat, lon, intensity] = d;
          return [Number(lat), Number(lon), Number(intensity ?? 0.5)];
        }
        const lat = Number(d.lat ?? d.latitude);
        const lon = Number(d.lon ?? d.lng ?? d.longitude);
        const intensity = Number(d.intensity ?? d.weight ?? 0.5);
        return [lat, lon, intensity];
      })
      .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
  };

  const doSearch = async () => {
    const q = search?.trim();
    if (!q) return;
    try {
      // Remove focus from the input and close suggestions immediately
      if (searchInputRef.current) searchInputRef.current.blur();
      setShowSuggestions(false);
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          q
        )}&format=json&limit=1`
      );
      const arr = await resp.json();
      if (Array.isArray(arr) && arr.length > 0) {
        const { lat, lon } = arr[0];
        const map = mapRef.current;
        if (map) map.setView([Number(lat), Number(lon)], 13);
      } else {
        alert("Location not found");
      }
    } catch (e) {
      console.error("Search failed", e);
    }
  };

  // Fetch autocomplete suggestions when typing
  useEffect(() => {
    const q = search?.trim();
    if (!isSearchFocused || !q || q.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      setHighlightIndex(-1);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          q
        )}&format=json&limit=6`;
        const resp = await fetch(url);
        const arr = await resp.json();
        setSuggestions(Array.isArray(arr) ? arr : []);
        setShowSuggestions(true);
        setHighlightIndex(-1);
      } catch (e) {
        console.error("Suggestion fetch failed", e);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [search, isSearchFocused]);

  const selectSuggestion = (item) => {
    if (!item) return;
    const map = mapRef.current;
    setSearch(item.display_name);
    setShowSuggestions(false);
    setSuggestions([]);
    setHighlightIndex(-1);
    // Remove focus from the input after selecting a suggestion
    if (searchInputRef.current) searchInputRef.current.blur();
    if (map) {
      const lat = Number(item.lat);
      const lon = Number(item.lon);
      const bb = item.boundingbox;
      if (Array.isArray(bb) && bb.length === 4) {
        const south = Number(bb[0]);
        const north = Number(bb[1]);
        const west = Number(bb[2]);
        const east = Number(bb[3]);
        const bounds = L.latLngBounds([south, west], [north, east]);
        map.fitBounds(bounds, { padding: [24, 24] });
      } else {
        map.setView([lat, lon], 13);
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-stone-900 text-stone-100">
      <header className="relative z-1200 flex items-center justify-between px-4 py-2 border-b border-stone-700 bg-stone-900/70 backdrop-blur">
        <div className="flex items-center gap-4">
          <a href="/" className="flex items-center gap-2">
            <img src={Logo} alt="Pothole logo" className="max-h-12" />
          </a>
          <nav className="flex gap-2">
            <button
              className={`rounded px-3 py-2 text-sm ${
                view === "map"
                  ? "bg-amber-600"
                  : "bg-stone-700 hover:bg-stone-600"
              }`}
              onClick={() => setView("map")}
            >
              Map View
            </button>
            <button
              className={`rounded px-3 py-2 text-sm ${
                view === "detector"
                  ? "bg-amber-600"
                  : "bg-stone-700 hover:bg-stone-600"
              }`}
              onClick={() => setView("detector")}
            >
              Pothole Detector
            </button>
          </nav>
        </div>
        {view === "map" && (
          <div className="flex items-center gap-2 relative">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search city or address"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => {
                setIsSearchFocused(true);
                setShowSuggestions(suggestions.length > 0);
              }}
              onBlur={() =>
                setTimeout(() => {
                  setIsSearchFocused(false);
                  setShowSuggestions(false);
                }, 150)
              }
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlightIndex((i) =>
                    Math.min(i + 1, suggestions.length - 1)
                  );
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlightIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  if (highlightIndex >= 0 && suggestions[highlightIndex]) {
                    selectSuggestion(suggestions[highlightIndex]);
                  } else {
                    doSearch();
                  }
                }
              }}
              className="min-w-64 rounded border border-stone-700 bg-stone-800 px-3 py-2 text-sm focus:outline-none focus:ring focus:ring-amber-700"
            />
            <button
              className="rounded bg-amber-600 px-3 py-2 text-sm hover:bg-amber-700"
              onClick={doSearch}
            >
              Go
            </button>
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-80 max-w-[360px] rounded border border-stone-700 bg-stone-800 shadow-lg z-[10000]">
                {suggestions.map((s, idx) => (
                  <div
                    key={`${s.place_id}-${idx}`}
                    className={`${
                    idx === highlightIndex ? "bg-stone-700" : ""
                  } cursor-pointer px-3 py-2 text-sm text-stone-200 hover:bg-stone-700`}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectSuggestion(s);
                    }}
                  >
                    {s.display_name}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </header>
      {view === "map" ? (
        <div className="grid grid-cols-[320px_1fr] h-[calc(100vh-56px)] min-h-0">
          <aside className="overflow-auto border-r border-stone-700 bg-stone-900 p-3">
            <div className="mb-4">
              <h2 className="mb-2 text-base">Data</h2>
              <p className="text-sm text-stone-400">
                Using preloaded sample dataset.
              </p>
              <div className="mt-2 flex gap-3 text-sm text-stone-400">
                <span>{points.length} points</span>
                {loading && <span>Loading…</span>}
              </div>
            </div>

            <hr className="my-4 border-t border-stone-700" />

            <div>
              <h2 className="mb-2 text-base">About</h2>
              <p className="text-sm text-stone-400">
                Every year, over 25% of U.S. roads are rated "poor" or
                "mediocre", and potholes alone cost drivers over $26 billion
                annually in vehicle repairs. But in most countries, there's no
                scalable way to monitor road damage—until now. Pothole
                automatically maps road quality across the world by pulling
                Google Street View imagery and running it through a machine
                learning model trained to detect potholes and cracks. We then
                aggregate this data into a real-time heatmap that helps cities
                prioritize repairs and drivers avoid hazards.
              </p>
            </div>
          </aside>
          <main className="relative min-h-0">
            <div id="map" className="h-full" />
            <Legend gradient={gradient} />
          </main>
        </div>
      ) : (
        <PotholeDetector />
      )}
    </div>
  );
}

export default App;
