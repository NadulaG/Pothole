import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Status() {
  const [id, setId] = useState('');
  const [hazard, setHazard] = useState(null);
  const [msg, setMsg] = useState('');

  const fetchStatus = async () => {
    setMsg('Looking up…');
    const { data, error } = await supabase
      .from('hazards')
      .select('*')
      .eq('id', id)
      .single();
    if (error) { setMsg(`Not found: ${error.message}`); setHazard(null); return; }
    setHazard(data); setMsg('');
  };

  return (
    <div className="p-6 max-w-xl mx-auto grid gap-4">
      <h1 className="text-xl font-semibold">Check Report Status</h1>
      <input className="border rounded px-3 py-2" placeholder="Tracking ID (UUID)" value={id} onChange={e=>setId(e.target.value)} />
      <button onClick={fetchStatus} className="px-3 py-2 rounded bg-gray-800 text-white">Lookup</button>
      {msg && <div className="text-sm text-gray-600">{msg}</div>}
      {hazard && (
        <div className="border rounded p-4">
          <div className="font-semibold">{hazard.type} · severity {hazard.severity} · {hazard.status}</div>
          <div className="text-sm">lat {hazard.lat}, lng {hazard.lng}</div>
          {Array.isArray(hazard.images) && hazard.images.length > 0 && (
            <img src={hazard.images[0]} alt="hazard" className="mt-2 max-h-64" />
          )}
        </div>
      )}
    </div>
  );
}