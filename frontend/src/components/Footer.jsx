import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="px-4 py-6 bg-[#f7f4ea] border-t border-[#e2d9c9]">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-[#5a5a50]">
        <div className="text-center sm:text-left">
          © {new Date().getFullYear()} Pothole · Safer roads, fewer surprises
        </div>
        <div className="text-center sm:text-left">
          Made with 💚 by <a href="https://www.linkedin.com/in/nadulag/" target="_blank" className="underline hover:text-[#2f3e2f] hover:no-underline">Nadula</a> and <a href="https://www.linkedin.com/in/edison-zhu-930068237" target="_blank" className="underline hover:text-[#2f3e2f] hover:no-underline">Edison</a> for HackPrinceton
        </div>
        <nav className="flex flex-wrap items-center gap-4">
          <Link to="/" className="no-underline hover:underline text-[#2f3e2f]">Home</Link>
          <Link to="/report" className="no-underline hover:underline text-[#2f3e2f]">Report</Link>
          <Link to="/status" className="no-underline hover:underline text-[#2f3e2f]">Status</Link>
          <Link to="/dashboard" className="no-underline hover:underline text-[#2f3e2f]">Dashboard</Link>
        </nav>
      </div>
    </footer>
  );
}