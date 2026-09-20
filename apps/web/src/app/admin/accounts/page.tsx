'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function AccountsPage() {
  const [data, setData] = useState<any>(null);
  const [bucket, setBucket] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/dashboard/accounts')
      .then(setData)
      .catch((e) => setError(e.message || 'Failed to load accounts'));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Accounts</h1>
      <p className="muted">Invoice and receivables data from external accounting systems.</p>
      <div className="grid grid-4" style={{ margin: '1rem 0' }}>
        <div className="card"><div className="stat-label">Total sales</div><div className="stat-value">₹{(data.totalSales / 1000).toFixed(0)}k</div></div>
        <div className="card"><div className="stat-label">Outstanding</div><div className="stat-value">₹{(data.outstanding / 1000).toFixed(0)}k</div></div>
        <div className="card"><div className="stat-label">Collected</div><div className="stat-value">₹{(data.collection / 1000).toFixed(0)}k</div></div>
        <div className="card"><div className="stat-label">Collection efficiency</div><div className="stat-value">{data.collectionEfficiency}%</div></div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Invoice aging</h2>
        <div className="grid grid-4">
          {Object.entries(data.aging?.buckets || {}).map(([k, v]) => (
            <button
              key={k}
              className="card"
              style={{ cursor: 'pointer', textAlign: 'left', border: bucket === k ? '2px solid var(--brand)' : undefined }}
              onClick={() => setBucket(k)}
            >
              <div className="stat-label">{k} days</div>
              <div className="stat-value">{v as number}</div>
            </button>
          ))}
        </div>
      </div>
      {bucket && (
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Invoices · {bucket}</h2>
          <table className="table">
            <thead>
              <tr><th>Number</th><th>Customer</th><th>Amount</th><th>Due</th><th>Days</th><th>Source</th></tr>
            </thead>
            <tbody>
              {(data.aging?.items?.[bucket] || []).map((inv: any) => (
                <tr key={inv.id}>
                  <td>{inv.invoiceNumber}</td>
                  <td>{inv.customerName}</td>
                  <td>₹{inv.amount.toLocaleString()}</td>
                  <td>{new Date(inv.dueDate).toLocaleDateString()}</td>
                  <td>{inv.daysOutstanding}</td>
                  <td>{inv.source?.name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
