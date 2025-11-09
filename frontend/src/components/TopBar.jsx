import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Logo from '/logo.png';
import { Link } from 'react-router-dom';

export default function TopBar() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('public');

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      if (session?.user) {
        const { data } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();
        if (data?.role) setRole(data.role);
      }
    };
    init();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setUser(sess?.user ?? null);
    });
    return () => { sub.subscription?.unsubscribe?.(); };
  }, []);

  const logout = async () => { await supabase.auth.signOut(); setUser(null); setRole('public'); window.location.href = '/'; };

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-[#f7f4ea] border-b border-[#e2d9c9] z-1200">
      <Link to="/" className="flex items-center no-underline">
        <img src={Logo} alt="Pothole logo" className="h-9 filter invert" />
      </Link>
      <div className="flex items-center gap-3">
        <span className="text-sm px-2 py-1 rounded-full bg-[#e9e4d8] text-[#5a5a50]">
          {user ? role : 'public'}
        </span>
        {user ? (
          <button
            onClick={logout}
            className="text-sm px-3 py-1 rounded-full border border-[#c9c1ad] text-[#2f3e2f] hover:bg-[#e9e4d8]"
          >
            log out
          </button>
        ) : (
          <Link
            to="/login"
            className="no-underline text-sm px-3 py-1 rounded-full border border-[#c9c1ad] text-[#2f3e2f] hover:bg-[#e9e4d8]"
          >
            log in
          </Link>
        )}
      </div>
    </header>
  );
}