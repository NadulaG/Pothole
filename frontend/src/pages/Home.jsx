import { Link } from "react-router-dom";
import Logo from "/logo.png";
import Footer from "../components/Footer.jsx";

export default function Home() {
  return (
    <div>
      <div className="min-h-[calc(100vh-64px)] flex items-center">
        <div className="max-w-4xl mx-auto px-6 w-full text-center">
          <div className="flex justify-center mb-6">
            <img src={Logo} alt="Pothole logo" className="h-14 filter invert" />
          </div>
          <h1 className="text-3xl font-semibold mb-3">
            Safer roads, fewer surprises
          </h1>
          <p className="text-[#5a5a50] mb-8">
            Pothole helps the public quickly report hazards and gives officials
            a clean dashboard to prioritize repairs.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/report"
              className="no-underline inline-block px-5 py-3 rounded-full bg-[#2f4a2f] text-white hover:bg-[#3b5d3b]"
            >
              Report a Hazard
            </Link>
            <Link
              to="/dashboard"
              className="no-underline inline-block px-5 py-3 rounded-full border border-[#c9c1ad] text-[#2f3e2f] hover:bg-[#e9e4d8]"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
