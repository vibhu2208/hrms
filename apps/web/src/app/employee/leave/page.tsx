'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function MyLeave() {
  const [types, setTypes] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [form, setForm] = useState({ leaveTypeId: '', startDate: '', endDate: '', reason: '' });

  async function load() {
    const [t, b, r] = await Promise.all([
      api('/leave/types'),
      api('/leave/balances'),
      api('/leave/mine'),
    ]);
    setTypes(t);
    setBalances(b);
    setRequests(r);
  }

  useEffect(() => {
    load();
  }, []);

  async function apply(e: FormEvent) {
    e.preventDefault();
    await api('/leave/apply', { method: 'POST', body: JSON.stringify(form) });
    setForm({ leaveTypeId: '', startDate: '', endDate: '', reason: '' });
    await load();
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>My leave</h1>
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        {balances.map((b) => (
          <div className="card" key={b.id}>
            <div className="stat-label">{b.leaveType?.name}</div>
            <div className="stat-value">{b.remaining}</div>
            <div className="muted">of {b.allocated} · used {b.used}</div>
          </div>
        ))}
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Apply</h2>
        <form onSubmit={apply} className="grid grid-2">
          <div className="field">
            <label className="label">Type</label>
            <select className="select" required value={form.leaveTypeId} onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })}>
              <option value="">Select</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label">Reason</label>
            <input className="input" required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Start</label>
            <input className="input" type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">End</label>
            <input className="input" type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <button className="btn" type="submit">Submit</button>
        </form>
      </div>
      <div className="card">
        <table className="table">
          <thead><tr><th>Type</th><th>Dates</th><th>Status</th></tr></thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
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
