import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const loginPassword = async () => {
    if (!email || !password) { setMessage('Please enter email and password.'); return; }
    setLoading(true);
    setMessage('Signing in…');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setMessage(`Error: ${error.message}`); return; }
    setMessage('Signed in.');
    nav('/dashboard');
  };

  return (
    <div className="px-6 py-8 max-w-md mx-auto">
      <div className="border border-[#e2d9c9] rounded-lg p-6 bg-white">
        <h1 className="text-xl font-semibold mb-2 text-[#2f3e2f]">Government Login</h1>
        <p className="text-sm mb-6 text-[#5a5a50]">Sign in with your issued credentials.</p>
        <label className="block text-sm mb-1 text-[#5a5a50]" htmlFor="email">Email</label>
        <input id="email" className="w-full border border-[#c9c1ad] rounded px-3 py-2 mb-4" placeholder="you@agency.gov" value={email} onChange={e=>setEmail(e.target.value)} />
        <label className="block text-sm mb-1 text-[#5a5a50]" htmlFor="password">Password</label>
        <input id="password" className="w-full border border-[#c9c1ad] rounded px-3 py-2 mb-4" placeholder="••••••••" type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&loginPassword()} />
        <button disabled={loading} onClick={loginPassword} className="w-full px-4 py-2 rounded bg-[#2f4a2f] text-white hover:bg-[#3b5d3b] disabled:opacity-60 cursor-pointer">
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
        {message && <div className="mt-3 text-sm text-[#5a5a50]">{message}</div>}
        <p className="mt-4 text-xs text-[#5a5a50]">Access is restricted to government personnel.</p>
      </div>
    </div>
  );
}