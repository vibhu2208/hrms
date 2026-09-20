'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function SalesPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/dashboard/sales')
      .then(setData)
      .catch((e) => setError(e.message || 'Failed to load sales'));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Sales</h1>
      <p className="muted">Data ingested from CRM / external sales apps via Integration Hub.</p>
      <div className="grid grid-4" style={{ margin: '1rem 0' }}>
        <div className="card"><div className="stat-label">Total leads</div><div className="stat-value">{data.totalLeads}</div></div>
        <div className="card"><div className="stat-label">Conversion</div><div className="stat-value">{data.conversionRate}%</div></div>
        <div className="card"><div className="stat-label">Revenue</div><div className="stat-value">₹{(data.revenue / 1000).toFixed(0)}k</div></div>
        <div className="card"><div className="stat-label">Converted</div><div className="stat-value">{data.counts?.CONVERTED || 0}</div></div>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Salesperson performance</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Assigned</th>
              <th>Contacted</th>
              <th>Converted</th>
              <th>Conv %</th>
              <th>Revenue</th>
              <th>Target %</th>
            </tr>
          </thead>
          <tbody>
            {data.salesperson?.map((s: any, i: number) => (
              <tr key={i}>
                <td>{s.name}</td>
                <td>{s.leadsAssigned}</td>
                <td>{s.leadsContacted}</td>
                <td>{s.leadsConverted}</td>
                <td>{s.conversionPct}%</td>
                <td>₹{s.revenueGenerated.toLocaleString()}</td>
                <td>{s.achievementPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
