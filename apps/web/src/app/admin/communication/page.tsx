'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function CommunicationPage() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [form, setForm] = useState({ title: '', body: '' });

  async function load() {
    const [a, t, s] = await Promise.all([
      api('/announcements'),
      api('/tickets'),
      api('/suggestions'),
    ]);
    setAnnouncements(a);
    setTickets(t);
    setSuggestions(s);
  }

  useEffect(() => {
    load();
  }, []);

  async function postAnnouncement(e: FormEvent) {
    e.preventDefault();
    await api('/announcements', { method: 'POST', body: JSON.stringify({ ...form, pinned: true }) });
    setForm({ title: '', body: '' });
    await load();
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Communication</h1>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>New announcement</h2>
        <form onSubmit={postAnnouncement}>
          <div className="field">
            <input className="input" placeholder="Title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="field">
            <textarea className="textarea" placeholder="Body" required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </div>
          <button className="btn" type="submit">Publish</button>
        </form>
      </div>
      <div className="grid grid-2">
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Bulletin</h2>
          {announcements.map((a) => (
            <div key={a.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
              <strong>{a.title}</strong>
              {a.pinned && <span className="badge green" style={{ marginLeft: 8 }}>Pinned</span>}
              <p className="muted" style={{ margin: '0.35rem 0 0' }}>{a.body}</p>
            </div>
          ))}
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Tickets</h2>
          {tickets.map((t) => (
            <div key={t.id} style={{ marginBottom: 10 }}>
              <strong>{t.subject}</strong>
              <div className="muted">{t.category} · {t.status} · {t.requester?.firstName}</div>
            </div>
          ))}
          <h2 style={{ fontSize: '1.1rem' }}>Suggestions</h2>
          {suggestions.map((s) => (
            <div key={s.id} style={{ marginBottom: 10 }}>
              <strong>{s.subject}</strong>
              <div className="muted">{s.status}{s.isAnonymous ? ' · Anonymous' : ''}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
