'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function AdminLeavePage() {
  const [pending, setPending] = useState<any[]>([]);
  const [all, setAll] = useState<any[]>([]);

  async function load() {
    const [p, a] = await Promise.all([api('/leave/pending'), api('/leave')]);
    setPending(p);
    setAll(a);
  }

  useEffect(() => {
    load();
  }, []);

  async function review(id: string, action: string) {
    await api(`/leave/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    });
    await load();
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Leave</h1>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Pending approvals</h2>
        {!pending.length && <p className="empty">No pending requests</p>}
        {pending.map((r) => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '0.75rem 0', borderBottom: '1px solid var(--line)' }}>
            <div>
              <strong>{r.employee?.firstName} {r.employee?.lastName}</strong>
              <div className="muted">{r.leaveType?.name} · {new Date(r.startDate).toLocaleDateString()} – {new Date(r.endDate).toLocaleDateString()}</div>
              <div>{r.reason}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => review(r.id, 'APPROVE')}>Approve</button>
              <button className="btn danger" onClick={() => review(r.id, 'REJECT')}>Reject</button>
            </div>
          </div>
        ))}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>All requests</h2>
        <table className="table">
          <thead>
            <tr><th>Employee</th><th>Type</th><th>Dates</th><th>Status</th></tr>
          </thead>
          <tbody>
            {all.map((r) => (
              <tr key={r.id}>
                <td>{r.employee?.firstName} {r.employee?.lastName}</td>
                <td>{r.leaveType?.name}</td>
                <td>{new Date(r.startDate).toLocaleDateString()} – {new Date(r.endDate).toLocaleDateString()}</td>
                <td><span className="badge gray">{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
