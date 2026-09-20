'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [roles, setRoles] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  async function load() {
    const [s, r] = await Promise.all([api('/settings'), api('/roles')]);
    setSettings(s);
    setRoles(r);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleColleague() {
    const next = settings.colleague_performance_visible === 'true' ? 'false' : 'true';
    await api('/settings', {
      method: 'POST',
      body: JSON.stringify({ key: 'colleague_performance_visible', value: next }),
    });
    setMessage(`Colleague performance visibility: ${next}`);
    await load();
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Settings</h1>
      {message && <div className="card" style={{ marginBottom: 12, background: 'var(--brand-soft)' }}>{message}</div>}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Colleague performance</h2>
        <p className="muted">Off by default. Owner can enable for employees.</p>
        <p>Currently: <strong>{settings.colleague_performance_visible === 'true' ? 'ON' : 'OFF'}</strong></p>
        <button className="btn" onClick={toggleColleague}>Toggle</button>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Roles</h2>
        <table className="table">
          <thead><tr><th>Code</th><th>Name</th><th>Permissions</th></tr></thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id}>
                <td>{r.code}</td>
                <td>{r.name}</td>
                <td>{r.permissions?.filter((p: any) => p.allowed).length || 0} allowed</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
