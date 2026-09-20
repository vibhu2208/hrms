'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function MyAttendance() {
  const [today, setToday] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [msg, setMsg] = useState('');

  async function load() {
    const [t, h] = await Promise.all([api('/attendance/today'), api('/attendance/mine')]);
    setToday(t);
    setHistory(h);
  }

  useEffect(() => {
    load();
  }, []);

  async function checkIn() {
    try {
      await api('/attendance/check-in', { method: 'POST' });
      setMsg('Checked in');
      await load();
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  async function checkOut() {
    try {
      await api('/attendance/check-out', { method: 'POST' });
      setMsg('Checked out');
      await load();
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>My attendance</h1>
      {msg && <div className="card" style={{ marginBottom: 12, background: 'var(--brand-soft)' }}>{msg}</div>}
      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <button className="btn" onClick={checkIn} disabled={!!today?.checkIn}>Check in</button>
        <button className="btn secondary" onClick={checkOut} disabled={!today?.checkIn || !!today?.checkOut}>Check out</button>
        {today && <span className="badge gray">{today.status}</span>}
      </div>
      <div className="card">
        <table className="table">
          <thead><tr><th>Date</th><th>Status</th><th>In</th><th>Out</th><th>Minutes</th></tr></thead>
          <tbody>
            {history.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.date).toLocaleDateString()}</td>
                <td>{r.status}</td>
                <td>{r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '—'}</td>
                <td>{r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '—'}</td>
                <td>{r.workingMinutes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
