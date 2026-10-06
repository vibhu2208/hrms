'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

type Balance = {
  id: string;
  leaveTypeId: string;
  allocated: number;
  used: number;
  remaining: number;
  pending: number;
  available: number;
  source: 'employee' | 'department' | 'company';
  daysPerPeriod: number;
  carried: number;
  frequency: 'YEARLY' | 'MONTHLY' | 'QUARTERLY';
  leaveType: {
    name: string;
    code: string;
    maxConsecutiveDays: number | null;
    minNoticeDays: number;
    requiresDocument: boolean;
    description: string | null;
    paid: boolean;
  };
};

function chargeableDays(start: string, end: string, weekOffs: number[]) {
  if (!start || !end) return 0;
  const from = Date.parse(`${start}T00:00:00.000Z`);
  const to = Date.parse(`${end}T00:00:00.000Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
  const off = new Set(weekOffs);
  let count = 0;
  for (let cursor = from; cursor <= to; cursor += 86_400_000) {
    if (!off.has(new Date(cursor).getUTCDay())) count += 1;
  }
  return count;
}

function frequencyLabel(frequency: string, days: number) {
  if (frequency === 'MONTHLY') return `${days} day(s) each month`;
  if (frequency === 'QUARTERLY') return `${days} day(s) each quarter`;
  return `${days} day(s) each year`;
}

function sourceLabel(source: string) {
  if (source === 'employee') return 'Personal allocation';
  if (source === 'department') return 'Department allocation';
  return 'Company default';
}

export default function MyLeave() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [form, setForm] = useState({ leaveTypeId: '', startDate: '', endDate: '', reason: '', attachmentUrl: '' });
  const [weekOffs, setWeekOffs] = useState<number[]>([0, 6]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [b, r, weekOff] = await Promise.all([
      api<Balance[]>('/leave/balances'),
      api('/leave/mine'),
      api<{ days: number[] }>('/leave/week-off'),
    ]);
    setBalances(b);
    setRequests(r);
    if (Array.isArray(weekOff.days)) setWeekOffs(weekOff.days);
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  const selected = useMemo(
    () => balances.find((balance) => balance.leaveTypeId === form.leaveTypeId),
    [balances, form.leaveTypeId],
  );
  const requestedDays = chargeableDays(form.startDate, form.endDate, weekOffs);

  async function apply(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!selected) {
      setError('Choose a leave type');
      return;
    }
    if (selected.available <= 0) {
      setError(`You have no ${selected.leaveType.name} left`);
      return;
    }
    if (!form.startDate || !form.endDate || form.endDate < form.startDate) {
      setError('Choose a valid date range');
      return;
    }
    if (!requestedDays) {
      setError('This range falls only on weekly offs');
      return;
    }
    if (requestedDays > selected.available) {
      setError(`You have ${selected.available} day(s) of ${selected.leaveType.name} left, and this request is ${requestedDays} day(s)`);
      return;
    }
    if (selected.leaveType.maxConsecutiveDays && requestedDays > selected.leaveType.maxConsecutiveDays) {
      setError(`${selected.leaveType.name} can be taken for at most ${selected.leaveType.maxConsecutiveDays} consecutive day(s)`);
      return;
    }
    if (selected.leaveType.requiresDocument && !form.attachmentUrl.trim()) {
      setError(`${selected.leaveType.name} requires a document link`);
      return;
    }
    setBusy(true);
    try {
      await api('/leave/apply', { method: 'POST', body: JSON.stringify(form) });
      setForm({ leaveTypeId: '', startDate: '', endDate: '', reason: '', attachmentUrl: '' });
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>My leave</h1>
      {error && <p className="att-banner" style={{ marginBottom: 16 }}>{error}</p>}
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        {balances.map((balance) => (
          <div className="card" key={balance.id}>
            <div className="stat-label">{balance.leaveType?.name}</div>
            <div className="stat-value">{balance.available}</div>
            <div className="muted">
              available of {balance.allocated}
              {balance.used ? ` · used ${balance.used}` : ''}
              {balance.pending ? ` · pending ${balance.pending}` : ''}
            </div>
            <div className="muted">
              {frequencyLabel(balance.frequency, balance.daysPerPeriod)} · {sourceLabel(balance.source)}
              {balance.carried ? ` · ${balance.carried} carried` : ''}
            </div>
            {balance.available <= 0 && <div className="muted">No days left. You cannot apply for this leave.</div>}
          </div>
        ))}
      </div>
      {!balances.length && <p className="empty">No leave is allocated to you yet.</p>}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Apply</h2>
        <form onSubmit={apply} className="grid grid-2">
          <div className="field">
            <label className="label">Type</label>
            <select
              className="select"
              required
              value={form.leaveTypeId}
              onChange={(event) => setForm({ ...form, leaveTypeId: event.target.value })}
            >
              <option value="">Select</option>
              {balances.map((balance) => (
                <option key={balance.leaveTypeId} value={balance.leaveTypeId} disabled={balance.available <= 0}>
                  {balance.leaveType.name} ({balance.available} left)
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Reason</label>
            <input className="input" required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
          </div>
          <div className="field">
            <label className="label">Start</label>
            <input className="input" type="date" required value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} />
          </div>
          <div className="field">
            <label className="label">End</label>
            <input className="input" type="date" required value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} />
          </div>
          <div className="field">
            <label className="label">Document link{selected?.leaveType.requiresDocument ? '' : ' (optional)'}</label>
            <input
              className="input"
              required={!!selected?.leaveType.requiresDocument}
              value={form.attachmentUrl}
              onChange={(event) => setForm({ ...form, attachmentUrl: event.target.value })}
              placeholder="https://"
            />
          </div>
          <div className="field" style={{ alignSelf: 'end' }}>
            <button className="btn" type="submit" disabled={busy || !balances.length || selected?.available === 0}>
              Submit{requestedDays ? ` · ${requestedDays} day(s)` : ''}
            </button>
          </div>
        </form>
        {selected && (
          <p className="muted" style={{ marginBottom: 0 }}>
            {selected.leaveType.paid ? 'Paid' : 'Unpaid'}
            {selected.leaveType.minNoticeDays ? ` · apply ${selected.leaveType.minNoticeDays} day(s) ahead` : ''}
            {selected.leaveType.maxConsecutiveDays ? ` · up to ${selected.leaveType.maxConsecutiveDays} day(s) in a row` : ''}
            {selected.leaveType.description ? ` · ${selected.leaveType.description}` : ''}
          </p>
        )}
      </div>
      <div className="card">
        <table className="table">
          <thead><tr><th>Type</th><th>Dates</th><th>Status</th></tr></thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td>{request.leaveType?.name}</td>
                <td>{new Date(request.startDate).toLocaleDateString()} – {new Date(request.endDate).toLocaleDateString()}</td>
                <td><span className="badge gray">{request.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
