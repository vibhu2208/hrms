'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function SupportPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [ticketForm, setTicketForm] = useState({
    subject: '',
    description: '',
    category: 'IT',
    priority: 'MEDIUM',
  });
  const [suggestionForm, setSuggestionForm] = useState({
    subject: '',
    category: 'General',
    description: '',
    isAnonymous: false,
  });

  async function load() {
    setTickets(await api('/tickets/mine'));
  }

  useEffect(() => {
    load();
  }, []);

  async function createTicket(e: FormEvent) {
    e.preventDefault();
    await api('/tickets', { method: 'POST', body: JSON.stringify(ticketForm) });
    setTicketForm({ subject: '', description: '', category: 'IT', priority: 'MEDIUM' });
    await load();
  }

  async function createSuggestion(e: FormEvent) {
    e.preventDefault();
    await api('/suggestions', { method: 'POST', body: JSON.stringify(suggestionForm) });
    setSuggestionForm({ subject: '', category: 'General', description: '', isAnonymous: false });
    alert('Suggestion submitted');
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Support</h1>
      <div className="grid grid-2">
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Raise ticket</h2>
          <form onSubmit={createTicket}>
            <div className="field">
              <input className="input" placeholder="Subject" required value={ticketForm.subject} onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })} />
            </div>
            <div className="field">
              <select className="select" value={ticketForm.category} onChange={(e) => setTicketForm({ ...ticketForm, category: e.target.value })}>
                {['IT', 'HR', 'ACCOUNTS', 'PAYROLL', 'ADMIN', 'FACILITY', 'OTHER'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <textarea className="textarea" placeholder="Description" required value={ticketForm.description} onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })} />
            </div>
            <button className="btn" type="submit">Submit ticket</button>
          </form>
          <h3 style={{ marginTop: 24 }}>My tickets</h3>
          {tickets.map((t) => (
            <div key={t.id} style={{ marginBottom: 8 }}>
              <strong>{t.subject}</strong>
              <div className="muted">{t.status} · {t.category}</div>
            </div>
          ))}
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Suggestion box</h2>
          <form onSubmit={createSuggestion}>
            <div className="field">
              <input className="input" placeholder="Subject" required value={suggestionForm.subject} onChange={(e) => setSuggestionForm({ ...suggestionForm, subject: e.target.value })} />
            </div>
            <div className="field">
              <textarea className="textarea" placeholder="Description" required value={suggestionForm.description} onChange={(e) => setSuggestionForm({ ...suggestionForm, description: e.target.value })} />
            </div>
            <label style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input type="checkbox" checked={suggestionForm.isAnonymous} onChange={(e) => setSuggestionForm({ ...suggestionForm, isAnonymous: e.target.checked })} />
              Submit anonymously
            </label>
            <button className="btn" type="submit">Send suggestion</button>
          </form>
        </div>
      </div>
    </div>
  );
}
