import { useLocation, Link } from "react-router-dom";

export default function ThankYou() {
  const { state } = useLocation();
  const imageUrl = state?.imageUrl;
  const lat = state?.lat;
  const lng = state?.lng;

  return (
    <div className="p-6 max-w-2xl mx-auto grid gap-4">
      <h1 className="text-2xl font-semibold">Thank you for your report!</h1>
      <p className="text-[#5a5a50]">
        Your submission has been received and forwarded to local officials for review.
      </p>

      <div className="border border-[#e2d9c9] rounded p-4 bg-white grid gap-3">
        <div>
          <div className="font-semibold mb-1 text-[#2f3e2f]">Submitted Photo</div>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="submitted"
              className="max-h-64 rounded border border-[#e2d9c9]"
            />
          ) : (
            <div className="text-sm text-[#5a5a50]">No image provided.</div>
          )}
        </div>
        <div>
          <div className="font-semibold mb-1 text-[#2f3e2f]">Location</div>
          {typeof lat === "number" && typeof lng === "number" ? (
            <div className="text-sm text-[#5a5a50]">
              Lat {lat.toFixed(6)}, Lng {lng.toFixed(6)}
              {" "}
              <a
                href={`https://www.google.com/maps?q=${lat},${lng}`}
                target="_blank"
                rel="noreferrer"
                className="underline ml-2 hover:text-[#2f3e2f]"
              >
                View on Google Maps
              </a>
            </div>
          ) : (
            <div className="text-sm text-[#5a5a50]">Location not available.</div>
          )}
        </div>
      </div>

      <div className="mt-2">
        <Link
          to="/report"
          className="px-4 py-2 rounded bg-[#2f4a2f] text-white hover:bg-[#3b5d3b]"
        >
          Report another hazard
        </Link>
      </div>

      <div className="mt-4">
        <Link
          to="/"
          className="no-underline inline-block px-4 py-2 rounded border border-[#c9c1ad] text-[#2f3e2f] hover:bg-[#e9e4d8]"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}