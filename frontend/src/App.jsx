import { useEffect, useMemo, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import * as Leaflet from 'leaflet'
const L = Leaflet
if (typeof window !== 'undefined') {
  // Ensure Leaflet is available globally for plugins like leaflet.heat
  // eslint-disable-next-line no-undef
  window.L = Leaflet
}
import Legend from './components/Legend.jsx'

const DEFAULT_CENTER = [40.3439, -74.6562] // Princeton area
const DEFAULT_ZOOM = 13

function App() {
  const [points, setPoints] = useState([])
  // Fixed heatmap parameters per request
  const HEAT_RADIUS = 50 // max radius
  const HEAT_BLUR = 5 // minimum blur
  const HEAT_MIN_OPACITY = 0.55 // slightly above 50%
  const HEAT_MAX = 3 // maximum cap
  const gradient = { 0.0: '#3b0b0b', 0.33: '#7a1212', 0.66: '#cf3a3a', 1.0: '#ff6b6b' }
  const heatOptions = useMemo(() => ({
    radius: HEAT_RADIUS,
    blur: HEAT_BLUR,
    minOpacity: HEAT_MIN_OPACITY,
    max: HEAT_MAX,
    gradient,
  }), [])
  const mapRef = useRef(null)
  const heatRef = useRef(null)
  const [search, setSearch] = useState('Princeton, NJ')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (mapRef.current) return
    const map = L.map('map').setView(DEFAULT_CENTER, DEFAULT_ZOOM)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map)
    mapRef.current = map
    // Auto-load sample once the map is initialized
    loadSample()
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // Remove existing heat layer
    if (heatRef.current) {
      map.removeLayer(heatRef.current)
      heatRef.current = null
    }
    if (points && points.length) {
      const ensureHeat = async () => {
        if (!L.heatLayer) {
          await import('leaflet.heat')
        }
        // Wait until the map has a valid canvas size
        let tries = 0
        while (true) {
          const size = map.getSize()
          if (size.x > 0 && size.y > 0) break
          map.invalidateSize()
          await new Promise((resolve) => setTimeout(resolve, 50))
          tries += 1
          if (tries > 40) break // safety break after ~2s
        }
        const layer = L.heatLayer(points, heatOptions)
        layer.addTo(map)
        heatRef.current = layer
      }
      ensureHeat()
    }
  }, [points, heatOptions])

  const loadSample = async () => {
    try {
      setLoading(true)
      const res = await fetch('/sample-heatmap.json')
      const data = await res.json()
      setPoints(normalize(data))
    } catch (e) {
      console.error('Failed to load sample dataset', e)
    }
    setLoading(false)
  }

  // Removed: auto-load effect; now called after map initialization above

  const normalize = (data) => {
    if (!Array.isArray(data)) return []
    return data.map((d) => {
      if (Array.isArray(d)) {
        const [lat, lon, intensity] = d
        return [Number(lat), Number(lon), Number(intensity ?? 0.5)]
      }
      const lat = Number(d.lat ?? d.latitude)
      const lon = Number(d.lon ?? d.lng ?? d.longitude)
      const intensity = Number(d.intensity ?? d.weight ?? 0.5)
      return [lat, lon, intensity]
    }).filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon))
  }

  const doSearch = async () => {
    const q = search?.trim()
    if (!q) return
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`)
      const arr = await resp.json()
      if (Array.isArray(arr) && arr.length > 0) {
        const { lat, lon } = arr[0]
        const map = mapRef.current
        if (map) map.setView([Number(lat), Number(lon)], 13)
      } else {
        alert('Location not found')
      }
    } catch (e) {
      console.error('Search failed', e)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-stone-900 text-stone-100">
      <header className="flex items-center justify-between px-4 py-2 border-b border-stone-700 bg-stone-900/70 backdrop-blur">
        <div className="flex items-center gap-2">
          <h1 className="text-lg -tracking-tight">Pothole</h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search city or address"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-64 rounded border border-stone-700 bg-stone-800 px-3 py-2 text-sm focus:outline-none focus:ring focus:ring-amber-700"
          />
          <button className="rounded bg-amber-600 px-3 py-2 text-sm hover:bg-amber-700" onClick={doSearch}>Go</button>
        </div>
      </header>
      <div className="grid grid-cols-[320px_1fr] h-[calc(100vh-56px)] min-h-0">
        <aside className="overflow-auto border-r border-stone-700 bg-stone-900 p-3">
          <div className="mb-4">
            <h2 className="mb-2 text-base">Data</h2>
            <p className="text-sm text-stone-400">Using preloaded sample dataset.</p>
            <div className="mt-2 flex gap-3 text-sm text-stone-400">
              <span>{points.length} points</span>
              {loading && <span>Loading…</span>}
            </div>
          </div>
          <div className="mb-4">
            <h2 className="mb-2 text-base">Heatmap</h2>
            <p className="text-sm text-stone-400">Fixed settings: large radius, minimal blur, opacity ~55%, red palette.</p>
          </div>
          <div>
            <h2 className="mb-2 text-base">About</h2>
            <p className="text-sm text-stone-400">
              Every year, over 25% of U.S. roads are rated "poor" or "mediocre", and potholes alone cost drivers over $26 billion annually in vehicle repairs. But in most countries, there's no scalable way to monitor road damage—until now.
              Pothole automatically maps road quality across the world by pulling Google Street View imagery and running it through a machine learning model trained to detect potholes and cracks.
              We then aggregate this data into a real-time heatmap that helps cities prioritize repairs and drivers avoid hazards.
            </p>
          </div>
        </aside>
        <main className="relative min-h-0">
          <div id="map" className="h-full" />
          <Legend gradient={gradient} />
        </main>
      </div>
    </div>
  )
}

export default App
