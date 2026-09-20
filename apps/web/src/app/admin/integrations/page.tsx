'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';

const DOMAINS = ['invoices', 'leads', 'financial', 'orders', 'salesperson-metrics'];

export default function IntegrationsPage() {
  const [sources, setSources] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [domain, setDomain] = useState('invoices');
  const [newSource, setNewSource] = useState({ name: '', type: 'ACCOUNTS' });
  const [createdKey, setCreatedKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const [s, j] = await Promise.all([
        api('/integrations/sources'),
        api('/integrations/jobs'),
      ]);
      setSources(s);
      setJobs(j);
    } catch (e: any) {
      setError(e.message || 'Failed to load integrations');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createSource(e: FormEvent) {
    e.preventDefault();
    const res = await api('/integrations/sources', {
      method: 'POST',
      body: JSON.stringify(newSource),
    });
    setCreatedKey(res.apiKey);
    setNewSource({ name: '', type: 'ACCOUNTS' });
    await load();
  }

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get('file') as File;
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    const res = await api(`/integrations/upload/${domain}`, {
      method: 'POST',
      formData: form,
    });
    setMessage(`Upload ${res.status}: ${res.successRows}/${res.totalRows} rows`);
    await load();
  }

  async function runAlerts() {
    const res = await api('/alerts/run', { method: 'POST' });
    setMessage(`Alerts fired: ${(res.fired || []).join(', ') || 'none'}`);
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Integration Hub</h1>
      <p className="muted">
        Push Sales, Profit, Accounts, and Operations data from any app via CSV upload or REST API.
        Admin sees everything here — without replacing your CRM/ERP.
      </p>
      {message && <div className="card" style={{ marginBottom: 12, background: 'var(--brand-soft)' }}>{message}</div>}
      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
      {createdKey && (
        <div className="card" style={{ marginBottom: 12 }}>
          <strong>Save this API key now</strong> (shown once):
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{createdKey}</pre>
          <code>POST /api/v1/ingest/&#123;domain&#125; with header X-API-Key</code>
        </div>
      )}

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Register source</h2>
          <form onSubmit={createSource}>
            <div className="field">
              <label className="label">Name</label>
              <input className="input" required value={newSource.name} onChange={(e) => setNewSource({ ...newSource, name: e.target.value })} placeholder="e.g. Zoho CRM" />
            </div>
            <div className="field">
              <label className="label">Type</label>
              <select className="select" value={newSource.type} onChange={(e) => setNewSource({ ...newSource, type: e.target.value })}>
                <option value="SALES">SALES</option>
                <option value="ACCOUNTS">ACCOUNTS</option>
                <option value="REVENUE">REVENUE</option>
                <option value="OPERATIONS">OPERATIONS</option>
              </select>
            </div>
            <button className="btn" type="submit">Create + API key</button>
          </form>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>CSV upload</h2>
          <form onSubmit={upload}>
            <div className="field">
              <label className="label">Domain</label>
              <select className="select" value={domain} onChange={(e) => setDomain(e.target.value)}>
                {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">CSV file</label>
              <input className="input" type="file" name="file" accept=".csv" required />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" type="submit">Upload</button>
              <a className="btn secondary" href={`${process.env.NEXT_PUBLIC_API_URL}/integrations/templates/${domain}`} onClick={async (e) => {
                e.preventDefault();
                const token = localStorage.getItem('gs_token');
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/integrations/templates/${domain}`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                const text = await res.text();
                const blob = new Blob([text], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `go-staff-${domain}-template.csv`;
                a.click();
              }}>Download template</a>
            </div>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Sources</h2>
          <button className="btn secondary" onClick={runAlerts}>Run Phase-4 alerts</button>
        </div>
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Type</th><th>Key prefix</th><th>Last sync</th><th>Active</th></tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.type}</td>
                <td><code>{s.apiKeyPrefix}…</code></td>
                <td>{s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString() : '—'}</td>
                <td>{s.isActive ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Recent ingest jobs</h2>
        <table className="table">
          <thead>
            <tr><th>When</th><th>Domain</th><th>Method</th><th>Status</th><th>Success</th><th>Failed</th></tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td>{new Date(j.createdAt).toLocaleString()}</td>
                <td>{j.domain}</td>
                <td>{j.method}</td>
                <td><span className="badge gray">{j.status}</span></td>
                <td>{j.successRows}/{j.totalRows}</td>
                <td>{j.failedRows}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!jobs.length && <p className="empty">No jobs yet</p>}
      </div>
    </div>
  );
}
