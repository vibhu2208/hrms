'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function CompanyPage() {
  const [directory, setDirectory] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [social, setSocial] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      api('/directory'),
      api('/policies'),
      api('/holidays'),
      api('/social-links'),
      api('/contacts'),
    ]).then(([d, p, h, s, c]) => {
      setDirectory(d);
      setPolicies(p);
      setHolidays(h);
      setSocial(s);
      setContacts(c);
    });
  }, []);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Company</h1>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Social</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {social.map((s) => (
            <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="btn secondary">{s.platform}</a>
          ))}
        </div>
      </div>
      <div className="grid grid-2">
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Directory</h2>
          {directory.map((e) => (
            <div key={e.id} style={{ marginBottom: 8 }}>
              <strong>{e.firstName} {e.lastName}</strong>
              <div className="muted">{e.designation?.name} · {e.department?.name} · {e.user?.email}</div>
            </div>
          ))}
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Policies</h2>
          {policies.map((p) => (
            <div key={p.id} style={{ marginBottom: 10 }}>
              <strong>{p.title}</strong>
              <div className="muted">v{p.version} · {p.category}</div>
              <p style={{ margin: '0.25rem 0 0' }}>{p.description}</p>
            </div>
          ))}
          <h2 style={{ fontSize: '1.1rem' }}>Holidays</h2>
          {holidays.map((h) => (
            <div key={h.id}>{new Date(h.date).toLocaleDateString()} — {h.name} ({h.type})</div>
          ))}
          <h2 style={{ fontSize: '1.1rem' }}>Contacts</h2>
          {contacts.map((c) => (
            <div key={c.id}>{c.name} · {c.phone || c.email}{c.isEmergency ? ' · Emergency' : ''}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
