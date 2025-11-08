import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import * as Leaflet from "leaflet";
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Remove existing heat layer
    if (heatRef.current) {
      map.removeLayer(heatRef.current);
      heatRef.current = null;
    }
    if (points && points.length) {
      const ensureHeat = async () => {
        if (!L.heatLayer) {
          await import("leaflet.heat");
        }
        // Wait until the map has a valid canvas size
        let tries = 0;
        while (true) {
          const size = map.getSize();
          if (size.x > 0 && size.y > 0) break;
          map.invalidateSize();
          await new Promise((resolve) => setTimeout(resolve, 50));
          tries += 1;
          if (tries > 40) break; // safety break after ~2s
        }
        const layer = L.heatLayer(points, heatOptions);
        layer.addTo(map);
        heatRef.current = layer;
      };
      ensureHeat();
    }
  }, [points, heatOptions]);

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
        <div className="flex items-center gap-2">
          <a href="/" className="flex items-center gap-2">
            <img src={Logo} alt="Pothole logo" className="max-h-12" />
          </a>
        </div>
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
      </header>
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
              Every year, over 25% of U.S. roads are rated "poor" or "mediocre",
              and potholes alone cost drivers over $26 billion annually in
              vehicle repairs. But in most countries, there's no scalable way to
              monitor road damage—until now. Pothole automatically maps road
              quality across the world by pulling Google Street View imagery and
              running it through a machine learning model trained to detect
              potholes and cracks. We then aggregate this data into a real-time
              heatmap that helps cities prioritize repairs and drivers avoid
              hazards.
            </p>
          </div>
        </aside>
        <main className="relative min-h-0">
          <div id="map" className="h-full" />
          <Legend gradient={gradient} />
        </main>
      </div>
    </div>
  );
}

export default App;
