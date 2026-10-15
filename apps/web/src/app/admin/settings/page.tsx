'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [roles, setRoles] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [mailFrom, setMailFrom] = useState('');
  const [savingMail, setSavingMail] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  async function load() {
    const [s, r] = await Promise.all([api('/settings'), api('/roles')]);
    setSettings(s);
    setRoles(r);
    setMailFrom(s.mail_from || '');
  }

  useEffect(() => {
    setIsOwner(getStoredUser()?.role?.code === 'OWNER');
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

  async function saveMail(event: FormEvent) {
    event.preventDefault();
    setSavingMail(true);
    setMessage('');
    try {
      await api('/settings', {
        method: 'POST',
        body: JSON.stringify({ key: 'mail_from', value: mailFrom }),
      });
      setMessage('Sending email updated.');
      await load();
    } catch (err: any) {
      setMessage(err?.message || 'Could not update the sending email');
    } finally {
      setSavingMail(false);
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Settings</h1>
      {message && <div className="card" style={{ marginBottom: 12, background: 'var(--brand-soft)' }}>{message}</div>}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Outlook sending email</h2>
        <p className="muted">Offers, credentials, and other company mail are sent from this address.</p>
        {isOwner ? (
          <form onSubmit={saveMail} className="platform-form">
            <label>
              Sending email
              <input className="input" type="email" required value={mailFrom} onChange={(event) => setMailFrom(event.target.value)} />
            </label>
            <button className="btn" disabled={savingMail}>{savingMail ? 'Saving…' : 'Save sending email'}</button>
          </form>
        ) : (
          <p>Currently: <strong>{settings.mail_from || 'Not set'}</strong></p>
        )}
      </div>
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
