import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function AuthGuard({ children }) {
  const [state, setState] = useState({ loading: true, ok: false });

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { setState({ loading: false, ok: false }); return; }
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
      if (error) { setState({ loading: false, ok: false }); return; }
      setState({ loading: false, ok: data?.role === 'official' });
    };
    check();
  }, []);

  if (state.loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-[#f7f4ea]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-4 border-[#c9c1ad] border-t-[#2f4a2f] animate-spin" />
          <div className="text-sm text-[#5a5a50]">Checking access…</div>
        </div>
      </div>
    );
  }
  if (!state.ok) return <Navigate to="/login" replace />;
  return children;
}