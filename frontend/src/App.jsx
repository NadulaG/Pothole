import { BrowserRouter, Routes, Route } from 'react-router-dom';
import TopBar from './components/TopBar.jsx';
import Home from './pages/Home.jsx';
import Report from './pages/Report.jsx';
import Status from './pages/Status.jsx';
import Gov from './pages/Gov.jsx';
import Login from './pages/Login.jsx';
import ThankYou from './pages/ThankYou.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-screen bg-[#f7f4ea] text-[#2f3e2f] font-sans">
        <TopBar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/report" element={<Report />} />
            <Route path="/thank-you" element={<ThankYou />} />
            <Route path="/status" element={<Status />} />
            <Route path="/dashboard" element={<Gov />} />
            <Route path="/login" element={<Login />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}