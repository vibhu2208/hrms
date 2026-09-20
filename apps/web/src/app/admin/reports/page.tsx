'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

const TYPES = [
  'hr-attendance', 'hr-leave', 'hr-performance', 'hr-recruitment',
  'sales', 'accounts', 'operations', 'revenue',
];

export default function ReportsPage() {
  const [type, setType] = useState('hr-performance');
  const [data, setData] = useState<any>(null);

  async function run(format?: string) {
    if (format === 'csv') {
      const token = localStorage.getItem('gs_token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/reports/${type}?format=csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}.csv`;
      a.click();
      return;
    }
    const result = await api(`/reports/${type}`);
    setData(result);
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Reports</h1>
      <div className="card" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="field" style={{ margin: 0, minWidth: 220 }}>
          <label className="label">Report type</label>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <button className="btn" onClick={() => run()}>View</button>
        <button className="btn secondary" onClick={() => run('csv')}>Export CSV</button>
      </div>
      {data && (
        <pre className="card" style={{ marginTop: 16, overflow: 'auto', maxHeight: 480, fontSize: 12 }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
