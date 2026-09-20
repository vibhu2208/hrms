'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';

export default function RevenuePage() {
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api(`/dashboard/revenue?period=${period}`).then(setData);
  }, [period]);

  if (!data) return <p className="muted">Loading…</p>;

  return (
    <div>
      <div className="topbar">
        <div>
          <h1 style={{ margin: 0 }}>Revenue & profit</h1>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            Sources: {(data.meta?.sources || []).join(', ') || 'none'} · Last sync:{' '}
            {data.meta?.lastSync ? new Date(data.meta.lastSync).toLocaleString() : '—'}
          </p>
        </div>
        <select className="select" style={{ width: 160 }} value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="today">Today</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
          <option value="quarter">This quarter</option>
          <option value="year">This year</option>
        </select>
      </div>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card"><div className="stat-label">Revenue</div><div className="stat-value">₹{(data.revenue / 1000).toFixed(0)}k</div></div>
        <div className="card"><div className="stat-label">Net profit</div><div className="stat-value">₹{(data.netProfit / 1000).toFixed(0)}k</div></div>
        <div className="card"><div className="stat-label">Expenses</div><div className="stat-value">₹{(data.expenses / 1000).toFixed(0)}k</div></div>
        <div className="card"><div className="stat-label">Margin</div><div className="stat-value">{data.margin}%</div></div>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Trend</h2>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={data.trend || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5dfd3" />
              <XAxis dataKey="periodStart" tickFormatter={(v) => new Date(v).toLocaleDateString()} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#0f6e56" strokeWidth={2} />
              <Line type="monotone" dataKey="netProfit" stroke="#c45c26" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
