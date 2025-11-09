import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import exifr from "exifr";

export default function Report() {
  const [file, setFile] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [maxStep, setMaxStep] = useState(1); // reveal up to step 2
  const [latLng, setLatLng] = useState(null);
  const [gpsNotice, setGpsNotice] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (maxStep < 2) return;
    if (mapRef.current) return;
    const defaultLat = 40.3439;
    const defaultLng = -74.6562;
    const initial = latLng ?? { lat: defaultLat, lng: defaultLng };
    const map = Leaflet.map("report-map").setView(
      [initial.lat, initial.lng],
      13
    );
    Leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    const marker = Leaflet.marker([initial.lat, initial.lng], {
      draggable: true,
    }).addTo(map);
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      setLatLng({ lat: pos.lat, lng: pos.lng });
    });
    mapRef.current = map;
    markerRef.current = marker;

    (async () => {
      if (latLng) return;
      try {
        const res = await fetch("https://ipwho.is/");
        const data = await res.json();
        if (
          data &&
          data.success &&
          typeof data.latitude === "number" &&
          typeof data.longitude === "number"
        ) {
          const lat = data.latitude;
          const lng = data.longitude;
          setLatLng({ lat, lng });
          map.setView([lat, lng], 13);
          marker.setLatLng([lat, lng]);
        }
      } catch (_e) {}
    })();
  }, [maxStep]);

  // Auto-advance: when image and location are known, reveal step 2
  useEffect(() => {
    if (imageUrl && maxStep < 2) setMaxStep(2);
  }, [imageUrl, latLng, maxStep]);

  const onUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const name = `${crypto.randomUUID()}-${f.name}`;
    const { error } = await supabase.storage
      .from("hazard-images")
      .upload(name, f, { upsert: true });
    if (error) {
      alert("Upload failed: " + error.message);
      return;
    }
    const { data } = await supabase.storage
      .from("hazard-images")
      .getPublicUrl(name);
    setImageUrl(data.publicUrl);

    try {
      const gps = await exifr.gps(f);
      if (
        gps &&
        typeof gps.latitude === "number" &&
        typeof gps.longitude === "number"
      ) {
        setLatLng({ lat: gps.latitude, lng: gps.longitude });
        setGpsNotice("GPS metadata found in photo. You can confirm or adjust.");
      } else {
        setGpsNotice("No GPS metadata found. Please set location on the map.");
      }
    } catch (_err) {
      setGpsNotice(
        "Could not read photo metadata. Please set location on the map."
      );
    }
    setMaxStep((s) => Math.max(s, 2));
  };

  // Removed AI preview step

  const submit = async () => {
    if (!imageUrl) {
      alert("Please upload a photo first.");
      return;
    }
    const pos = latLng ?? markerRef.current?.getLatLng();
    if (!pos) {
      alert("Location is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("http://localhost:5001/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: imageUrl, lat: pos.lat, lng: pos.lng }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const analysis = await res.json();
      setSubmitting(false);
      navigate("/thank-you", {
        state: { analysis, imageUrl, lat: pos.lat, lng: pos.lng },
      });
    } catch (err) {
      setSubmitting(false);
      alert("Submit failed: " + err.message);
    }
  };

  return (
    <div className="p-4 grid gap-4">
      <div className="border border-[#e2d9c9] rounded p-4 bg-white">
        <div className="text-sm text-[#5a5a50] mb-2">Step 1 of 2</div>
        <h2 className="font-semibold mb-2 text-[#2f3e2f]">Upload Photo</h2>
        <label className="block rounded border-2 border-dashed border-[#c9c1ad] bg-[#f7f4ea] p-6 text-center cursor-pointer hover:bg-[#e9e4d8]">
          <div className="text-[#5a5a50]">
            <div className="font-medium mb-1">Drag & drop a photo here</div>
            <div className="text-sm mb-3">or click to choose from device</div>
            <span className="inline-block px-4 py-2 rounded bg-[#2f4a2f] text-white hover:bg-[#3b5d3b]">
              Choose Photo
            </span>
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={onUpload}
            className="sr-only"
          />
        </label>
        {imageUrl && (
          <img
            src={imageUrl}
            alt="upload"
            className="mt-3 max-h-64 rounded border border-[#e2d9c9]"
          />
        )}
      </div>

      {maxStep >= 2 && (
        <div className="border border-[#e2d9c9] rounded p-4 bg-white">
          <div className="text-sm text-[#5a5a50] mb-2">Step 2 of 2</div>
          <h2 className="font-semibold mb-2 text-[#2f3e2f]">
            Confirm Location
          </h2>
          {gpsNotice && (
            <div className="text-sm mb-2 text-[#5a5a50]">{gpsNotice}</div>
          )}
          <div id="report-map" className="h-64 rounded overflow-hidden" />
          <div className="mt-3">
            <button
              disabled={submitting}
              onClick={submit}
              className="px-4 py-2 rounded bg-[#2f4a2f] text-white hover:bg-[#3b5d3b] disabled:opacity-60"
            >
              Submit Report
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
