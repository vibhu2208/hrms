'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function OperationsPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    api('/dashboard/operations').then(setData);
  }, []);
  if (!data) return <p className="muted">Loading…</p>;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Operations</h1>
      <p className="muted">Order and delivery metrics from external ops / ERP systems.</p>
      <div className="grid grid-3" style={{ margin: '1rem 0' }}>
        <div className="card"><div className="stat-label">Total orders</div><div className="stat-value">{data.total}</div></div>
        <div className="card"><div className="stat-label">On-time delivery</div><div className="stat-value">{data.onTimePct}%</div></div>
        <div className="card"><div className="stat-label">Delayed</div><div className="stat-value">{data.delayed}</div></div>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>By status</h2>
        <table className="table">
          <thead><tr><th>Status</th><th>Count</th></tr></thead>
          <tbody>
            {Object.entries(data.counts || {}).map(([k, v]) => (
              <tr key={k}><td>{k}</td><td>{v as number}</td></tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: 12 }}><strong>Summary:</strong> {data.summary}</p>
      </div>
    </div>
  );
}
