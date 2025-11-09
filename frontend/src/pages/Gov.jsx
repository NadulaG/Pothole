import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import AuthGuard from "../components/AuthGuard";

export default function Gov() {
  return (
    <AuthGuard>
      <GovInner />
    </AuthGuard>
  );
}

function GovInner() {
  const [filters, setFilters] = useState({
    types: [],
    minSeverity: 0,
    source: [],
    start: null,
    end: null,
    heat: false,
  });
  const [hazards, setHazards] = useState([]);
  const [allHazards, setAllHazards] = useState([]);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const layerGroupRef = useRef(null);
  const drawLayerRef = useRef(null);
  const [drawMode, setDrawMode] = useState("idle"); // 'idle' | 'box' | 'polygon'
  const startPointRef = useRef(null);
  const rectRef = useRef(null);
  const polyLineRef = useRef(null);
  const polygonRef = useRef(null);
  const [selectedPolygon, setSelectedPolygon] = useState(null); // GeoJSON geometry
  const [uiMsg, setUiMsg] = useState("");
  const [drawStep, setDrawStep] = useState(0); // 0 idle, 1 choose type, 2 draw
  const [helpOpen, setHelpOpen] = useState(false); // help overlay toggle
  const [analysisOpen, setAnalysisOpen] = useState(false); // full analysis modal toggle
  const [analysisHazard, setAnalysisHazard] = useState(null); // selected hazard for analysis
  const [surveySubmitting, setSurveySubmitting] = useState(false); // calling backend
  const [surveyRunning, setSurveyRunning] = useState(false); // background survey indicator

  // Dynamic filter options and helpers
  const typeStats = useMemo(() => {
    const counts = new Map();
    allHazards.forEach((h) => {
      const t = (h.hazard_type || h.type || "").trim();
      if (!t) return;
      counts.set(t, (counts.get(t) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }, [allHazards]);

  const sourceStats = useMemo(() => {
    const counts = new Map();
    allHazards.forEach((h) => {
      const s = (h.source || "").toString().trim();
      if (!s) return;
      counts.set(s, (counts.get(s) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }, [allHazards]);

  const toggleFilterValue = (key, value) => {
    setFilters((f) => {
      const set = new Set(f[key] || []);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...f, [key]: Array.from(set) };
    });
  };

  const clearFilterValues = (key) => {
    setFilters((f) => ({ ...f, [key]: [] }));
  };

  const isSelected = (key, value) => {
    return (filters[key] || []).includes(value);
  };

  useEffect(() => {
    if (mapRef.current) return;
    const map = Leaflet.map("gov-map").setView([40.3439, -74.6562], 10);
    Leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    layerGroupRef.current = Leaflet.layerGroup().addTo(map);
    drawLayerRef.current = Leaflet.layerGroup().addTo(map);
    mapRef.current = map;
    fetchHazards();
    fetchAllHazards();
  }, []);

  // Auto-apply filters: refetch hazards whenever filters change
  useEffect(() => {
    fetchHazards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const fetchHazards = async () => {
    let query = supabase
      .from("hazards")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (filters.types.length) query = query.in("hazard_type", filters.types);
    if (filters.minSeverity > 0)
      query = query.gte("severity", filters.minSeverity);
    if (filters.source.length) query = query.in("source", filters.source);
    if (filters.start) query = query.gte("created_at", filters.start);
    if (filters.end) query = query.lte("created_at", filters.end);
    const { data, error } = await query;
    if (error) {
      console.error(error);
      return;
    }
    setHazards(data || []);
    drawMarkers(data || []);
  };

  // Fetch unfiltered hazards for deriving stable filter options
  const fetchAllHazards = async () => {
    const { data, error } = await supabase
      .from("hazards")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) {
      console.error(error);
      return;
    }
    setAllHazards(data || []);
  };

  const drawMarkers = (rows) => {
    const map = mapRef.current;
    if (!map) return;
    const lg = layerGroupRef.current;
    lg.clearLayers();
    markersRef.current = [];
    rows.forEach((h) => {
      const m = Leaflet.circleMarker([h.lat, h.lng], {
        radius: 6,
        color: severityColor(h.severity),
        weight: 2,
        opacity: 0.9,
        fillOpacity: 0.9,
      }).bindPopup(popupHtml(h));
      // Attach handler to open full analysis modal from popup button
      m.on("popupopen", (e) => {
        try {
          const container = e?.popup?._container || e?.popup?.getElement?.();
          const btn = container?.querySelector?.(".gov-full-analysis-btn");
          if (btn) {
            btn.addEventListener("click", () => {
              setAnalysisHazard(h);
              setAnalysisOpen(true);
            });
          }
        } catch (_) {}
      });
      m.addTo(lg);
      markersRef.current.push(m);
    });
  };

  const popupHtml = (h) => {
    const img =
      Array.isArray(h.images) && h.images.length
        ? `<img src="${h.images[0]}" style="max-height:120px; margin-top:8px"/>`
        : "";
    return `<div>
      <strong>${h.hazard_type}</strong> · sev ${h.severity} · ${h.source}<br/>
      status ${h.status}<br/>
      ${img}
      <div style="margin-top:8px">
        <button type="button" class="cursor-pointer px-2 py-1 rounded text-sm bg-[#2f4a2f] text-white hover:bg-[#3b5d3b] gov-full-analysis-btn" data-hid="${h.id}">
          View Details
        </button>
      </div>
    </div>`;
  };

  const severityColor = (s) => {
    const colors = [
      "#2ecc71",
      "#27ae60",
      "#f1c40f",
      "#e67e22",
      "#e74c3c",
      "#c0392b",
    ];
    return colors[Math.min(colors.length - 1, Math.max(0, s))];
  };

  const lngLat = (ll) => [ll.lng, ll.lat];

  // Drawing controls
  useEffect(() => {
    const map = mapRef.current;
    const dl = drawLayerRef.current;
    if (!map || !dl) return;
    // cleanup temp visuals when switching modes
    const cleanupTemp = () => {
      if (rectRef.current) {
        dl.removeLayer(rectRef.current);
        rectRef.current = null;
      }
      if (polyLineRef.current) {
        dl.removeLayer(polyLineRef.current);
        polyLineRef.current = null;
      }
      setUiMsg("");
    };
    cleanupTemp();

    if (drawMode === "box") {
      setUiMsg("Click to start box, move mouse, click to finish.");
      const onMove = (e) => {
        if (!startPointRef.current) return;
        const bounds = Leaflet.latLngBounds(startPointRef.current, e.latlng);
        if (!rectRef.current) {
          rectRef.current = Leaflet.rectangle(bounds, {
            color: "#2f4a2f",
            weight: 2,
            fillOpacity: 0.1,
          });
          rectRef.current.addTo(dl);
        } else {
          rectRef.current.setBounds(bounds);
        }
      };
      const onClick = (e) => {
        if (!startPointRef.current) {
          startPointRef.current = e.latlng;
        } else {
          const bounds = Leaflet.latLngBounds(startPointRef.current, e.latlng);
          if (!rectRef.current) {
            rectRef.current = Leaflet.rectangle(bounds, {
              color: "#2f4a2f",
              weight: 2,
              fillOpacity: 0.1,
            });
            rectRef.current.addTo(dl);
          }
          const sw = bounds.getSouthWest();
          const ne = bounds.getNorthEast();
          const nw = Leaflet.latLng(ne.lat, sw.lng);
          const se = Leaflet.latLng(sw.lat, ne.lng);
          // Create a persistent polygon from the rectangle so it stays visible
          if (polygonRef.current) {
            dl.removeLayer(polygonRef.current);
            polygonRef.current = null;
          }
          polygonRef.current = Leaflet.polygon([sw, se, ne, nw], {
            color: "#2f4a2f",
            weight: 2,
            fillOpacity: 0.1,
          });
          polygonRef.current.addTo(dl);
          // Remove the temporary rectangle
          if (rectRef.current) {
            dl.removeLayer(rectRef.current);
            rectRef.current = null;
          }
          setSelectedPolygon({
            type: "Polygon",
            coordinates: [
              [lngLat(sw), lngLat(se), lngLat(ne), lngLat(nw), lngLat(sw)],
            ],
          });
          setDrawMode("idle");
          startPointRef.current = null;
          setUiMsg("Box selected. Ready to start survey.");
        }
      };
      map.on("mousemove", onMove);
      map.on("click", onClick);
      return () => {
        map.off("mousemove", onMove);
        map.off("click", onClick);
      };
    }

    if (drawMode === "polygon") {
      setUiMsg('Click to add points. Click "Finish Polygon" when done.');
      const points = [];
      const onClick = (e) => {
        points.push(e.latlng);
        if (!polyLineRef.current) {
          polyLineRef.current = Leaflet.polyline(points, {
            color: "#2f4a2f",
            weight: 2,
          });
          polyLineRef.current.addTo(dl);
        } else {
          polyLineRef.current.setLatLngs(points);
        }
      };
      map.on("click", onClick);
      return () => {
        map.off("click", onClick);
      };
    }
  }, [drawMode]);

  const finishPolygon = () => {
    const dl = drawLayerRef.current;
    if (!dl) return;
    if (!polyLineRef.current) {
      alert("Add at least 3 points.");
      return;
    }
    const pts = polyLineRef.current.getLatLngs();
    if (!Array.isArray(pts) || pts.length < 3) {
      alert("Add at least 3 points.");
      return;
    }
    if (polygonRef.current) {
      dl.removeLayer(polygonRef.current);
      polygonRef.current = null;
    }
    polygonRef.current = Leaflet.polygon(pts, {
      color: "#2f4a2f",
      weight: 2,
      fillOpacity: 0.1,
    });
    polygonRef.current.addTo(dl);
    dl.removeLayer(polyLineRef.current);
    polyLineRef.current = null;
    const coords = pts.map((p) => lngLat(p));
    coords.push(coords[0]);
    setSelectedPolygon({ type: "Polygon", coordinates: [coords] });
    setDrawMode("idle");
    setUiMsg("Polygon selected. Ready to start survey.");
  };

  const clearSelection = () => {
    const dl = drawLayerRef.current;
    if (!dl) return;
    if (rectRef.current) {
      dl.removeLayer(rectRef.current);
      rectRef.current = null;
    }
    if (polyLineRef.current) {
      dl.removeLayer(polyLineRef.current);
      polyLineRef.current = null;
    }
    if (polygonRef.current) {
      dl.removeLayer(polygonRef.current);
      polygonRef.current = null;
    }
    setSelectedPolygon(null);
    startPointRef.current = null;
    setUiMsg("");
  };

  const startSurveyFlow = () => {
    clearSelection();
    setDrawMode("idle");
    setDrawStep(1);
  };

  const chooseMode = (mode) => {
    clearSelection();
    setDrawMode(mode);
    setDrawStep(2);
  };

  const cancelSurveyFlow = () => {
    clearSelection();
    setDrawMode("idle");
    setDrawStep(0);
  };

  const startSurvey = async () => {
    if (!selectedPolygon) {
      alert("Please draw a bounding box first.");
      return;
    }
    try {
      setSurveySubmitting(true);
      // Compute bounding box from selected polygon (array of [lng, lat])
      const coords = Array.isArray(selectedPolygon?.coordinates)
        ? selectedPolygon.coordinates[0] || []
        : [];
      if (!coords.length) throw new Error("Invalid selection coordinates.");
      const lats = coords.map((c) => c[1]);
      const lngs = coords.map((c) => c[0]);
      const lat_min = Math.min(...lats);
      const lat_max = Math.max(...lats);
      const lon_min = Math.min(...lngs);
      const lon_max = Math.max(...lngs);

      const res = await fetch("http://localhost:5001/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat_min, lon_min, lat_max, lon_max }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (data && data.ok === true) {
        setSurveyRunning(true);
        setUiMsg("Survey processing started in the background.");
      } else {
        setUiMsg("Survey call completed but did not indicate success.");
      }
    } catch (err) {
      setUiMsg(`Failed to start survey: ${err.message}`);
    } finally {
      setSurveySubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-12 gap-0">
      <div className="col-span-3 border-r p-3 space-y-3">
        <div>
          <div className="font-semibold mb-2">Report Map</div>
          <div className="space-y-2 text-sm">
            <div>
              <label className="block mb-1">Type</label>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-auto">
                {typeStats.length === 0 ? (
                  <div className="text-xs text-gray-500">No types available.</div>
                ) : (
                  typeStats.map(({ value, count }) => (
                    <button
                      key={value}
                      type="button"
                      className={`px-2 py-1 rounded text-sm border transition ${
                        isSelected("types", value)
                          ? "bg-[#2f4a2f] text-white border-[#2f4a2f]"
                          : "bg-[#f4f1e6] text-[#2f4a2f] border-[#c9c1ad] hover:bg-[#e8e3d2]"
                      }`}
                      onClick={() => toggleFilterValue("types", value)}
                    >
                      <span>{value}</span>
                      <span className="ml-2 text-xs opacity-80">{count}</span>
                    </button>
                  ))
                )}
                <button
                  type="button"
                  className="px-2 py-1 rounded text-sm bg-gray-200 text-gray-700 hover:bg-gray-300"
                  onClick={() => clearFilterValues("types")}
                >
                  Clear
                </button>
              </div>
            </div>
            <div>
              <label className="block">Min Severity</label>
              <input
                type="range"
                min="0"
                max="5"
                defaultValue={0}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    minSeverity: Number(e.target.value),
                  }))
                }
              />
            </div>
            <div>
              <label className="block mb-1">Source</label>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-auto">
                {sourceStats.length === 0 ? (
                  <div className="text-xs text-gray-500">No sources available.</div>
                ) : (
                  sourceStats.map(({ value, count }) => (
                    <button
                      key={value}
                      type="button"
                      className={`px-2 py-1 rounded text-sm border transition ${
                        isSelected("source", value)
                          ? "bg-[#2f4a2f] text-white border-[#2f4a2f]"
                          : "bg-[#f4f1e6] text-[#2f4a2f] border-[#c9c1ad] hover:bg-[#e8e3d2]"
                      }`}
                      onClick={() => toggleFilterValue("source", value)}
                    >
                      <span>{value}</span>
                      <span className="ml-2 text-xs opacity-80">{count}</span>
                    </button>
                  ))
                )}
                <button
                  type="button"
                  className="px-2 py-1 rounded text-sm bg-gray-200 text-gray-700 hover:bg-gray-300"
                  onClick={() => clearFilterValues("source")}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
        <hr className="border-t border-[#c9c1ad]" />
        <div className="font-semibold mb-2">Virtual Survey</div>
        {drawStep === 0 && (
          <div>
            <button
              className="px-3 py-2 rounded bg-[#2f4a2f] text-white cursor-pointer"
              onClick={startSurveyFlow}
            >
              Start Virtual Survey
            </button>
          </div>
        )}
        {drawStep === 1 && (
          <div className="space-y-2">
            <div className="font-semibold">Select Area</div>
            <div className="flex gap-2 flex-wrap">
              <button
                className="px-3 py-2 rounded bg-[#2f4a2f] text-white cursor-pointer"
                onClick={() => chooseMode("box")}
              >
                Bounding Box
              </button>
              <button
                className="px-3 py-2 rounded bg-gray-500 text-white cursor-pointer"
                onClick={cancelSurveyFlow}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {drawStep === 2 && (
          <div className="space-y-2">
            <div className="font-semibold">Draw Selected Area</div>
            {uiMsg && <div className="text-sm text-gray-700 mt-1">{uiMsg}</div>}
            {surveyRunning && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-[#2f4a2f] rounded-full animate-spin" />
                <span>Survey in progress… analyzing in background</span>
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              <button
                className="px-3 py-2 rounded bg-gray-500 text-white"
                onClick={clearSelection}
              >
                Clear Selection
              </button>
              <button
                className="px-3 py-2 rounded bg-[#2f4a2f] text-white disabled:opacity-60"
                onClick={startSurvey}
                disabled={!selectedPolygon || surveySubmitting}
              >
                {surveySubmitting ? "Submitting…" : "Submit for Analysis"}
              </button>
              <button
                className="px-3 py-2 rounded bg-gray-500 text-white"
                onClick={cancelSurveyFlow}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="col-span-9 relative">
        {/* Help button */}
        <button
          type="button"
          aria-label="Open help"
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-[#2f4a2f] text-white shadow flex items-center justify-center hover:bg-[#3b5d3b] z-1000 cursor-help"
          onClick={() => setHelpOpen(true)}
        >
          ?
        </button>

        {/* Help overlay */}
        {helpOpen && (
          <div className="fixed inset-0 flex items-center justify-center z-1000">
            <div className="absolute inset-0 bg-black/30" onClick={() => setHelpOpen(false)} />
            <div className="relative bg-white rounded-md shadow-lg w-[90%] max-w-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-lg">Help</div>
                <button
                  aria-label="Close help"
                  className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 cursor-pointer"
                  onClick={() => setHelpOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="space-y-3 text-sm text-gray-800">
                <div>
                  <div className="font-semibold">Report Map</div>
                  <div>
                    - Use the <span className="font-medium">Type</span>, <span className="font-medium">Min Severity</span>, and <span className="font-medium">Source</span> filters.
                    Changes auto-apply as you toggle options or move the slider.
                  </div>
                </div>
                <div>
                  <div className="font-semibold">Hazard Markers</div>
                  <div>
                    - Click markers to view details: type, severity, status, confidence, and image preview.
                  </div>
                </div>
                <div>
                  <div className="font-semibold">Virtual Survey</div>
                  <div>
                    - Click <span className="font-medium">Start Virtual Survey</span>, then choose <span className="font-medium">Bounding Box</span>.
                  </div>
                  <div>
                    - Draw your selection on the map by clicking to start and clicking again to finish the box.
                  </div>
                  <div>
                    - Use <span className="font-medium">Clear Selection</span> to reset, or <span className="font-medium">Submit for Analysis</span> to trigger a survey.
                  </div>
                </div>
                <div>
                  <div className="font-semibold">Tips</div>
                  <div>
                    - Pan/zoom the map while drawing. The selected area remains visible.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      <div id="gov-map" className="h-[calc(100vh-56px)]" />
      {/* Full Analysis Modal */}
      {analysisOpen && analysisHazard && (
        <div className="fixed inset-0 flex items-center justify-center z-[1000]">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setAnalysisOpen(false); setAnalysisHazard(null); }} />
          <div className="relative bg-white rounded-md shadow-lg w-[92%] max-w-4xl p-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-lg">
                Hazard Analysis
              </div>
              <button
                aria-label="Close analysis"
                className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 cursor-pointer"
                onClick={() => { setAnalysisOpen(false); setAnalysisHazard(null); }}
              >
                Close
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 text-sm text-gray-800">
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <div className="font-semibold">Overview</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs">
                      Severity {typeof analysisHazard.severity === "number" ? analysisHazard.severity : "—"}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-xs">
                      Status: {analysisHazard.status || "—"}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-xs">
                      Source: {analysisHazard.source || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">Type:</span> {analysisHazard.hazard_type || "—"}
                  </div>
                  <div>
                    <span className="font-medium">Address:</span> {analysisHazard.location || "—"}
                    {typeof analysisHazard.lat === "number" && typeof analysisHazard.lng === "number" && (
                      <a
                        href={`https://www.google.com/maps?q=${analysisHazard.lat},${analysisHazard.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-blue-600 hover:underline"
                      >
                        View on Google Maps
                      </a>
                    )}
                  </div>
                  <div>
                    <span className="font-medium">Created:</span> {analysisHazard.created_at ? new Date(analysisHazard.created_at).toLocaleString() : "—"}
                  </div>
                </div>

                <div className="grid gap-1">
                  <div className="font-semibold">Breakdown</div>
                  <div>
                    <span className="font-medium">Description:</span> {analysisHazard.description || "—"}
                  </div>
                  <div>
                    <span className="font-medium">Location Context:</span> {analysisHazard.location_context || "—"}
                  </div>
                  <div>
                    <span className="font-medium">Projected Repair Cost:</span> {typeof analysisHazard.projected_repair_cost === "number"
                      ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(analysisHazard.projected_repair_cost)
                      : analysisHazard.projected_repair_cost || "—"}
                  </div>
                  <div>
                    <span className="font-medium">Projected Worsening:</span> {analysisHazard.projected_worsening || "—"}
                  </div>
                  <div>
                    <span className="font-medium">Future Worsening Description:</span> {analysisHazard.future_worsening_description || "—"}
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <div className="font-semibold">Image</div>
                {Array.isArray(analysisHazard.images) && analysisHazard.images.length ? (
                  <img
                    src={analysisHazard.images[0]}
                    alt="hazard"
                    className="w-full max-h-[60vh] object-contain rounded border border-[#e2d9c9]"
                  />
                ) : (
                  <div className="text-xs text-gray-600">No image available.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
