'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { RangeCalendar } from '@/components/day-calendar';
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

const emptyForm = { leaveTypeId: '', startDate: '', endDate: '', reason: '', attachmentUrl: '' };

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

function statusLabel(status?: string) {
  if (status === 'APPROVED') return 'Approved';
  if (status === 'REJECTED') return 'Rejected';
  if (status === 'CANCELLED') return 'Cancelled';
  if (status === 'CLARIFICATION') return 'Needs detail';
  if (status === 'PENDING') return 'Pending';
  return status || '—';
}

function statusClass(status?: string) {
  if (status === 'APPROVED') return 'green';
  if (status === 'REJECTED' || status === 'CANCELLED') return 'red';
  if (status === 'PENDING' || status === 'CLARIFICATION') return 'amber';
  return 'gray';
}

function formatRange(start: string, end: string) {
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  return `${new Date(start).toLocaleDateString(undefined, options)} – ${new Date(end).toLocaleDateString(undefined, options)}`;
}

export default function MyLeave() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [weekOffs, setWeekOffs] = useState<number[]>([0, 6]);
  const [popup, setPopup] = useState<'remaining' | 'apply' | null>(null);
  const [dateFocus, setDateFocus] = useState<'start' | 'end'>('start');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
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

  useEffect(() => {
    if (!popup) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setPopup(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [popup]);

  const selected = useMemo(
    () => balances.find((balance) => balance.leaveTypeId === form.leaveTypeId),
    [balances, form.leaveTypeId],
  );
  const requestedDays = chargeableDays(form.startDate, form.endDate, weekOffs);
  const totals = useMemo(() => balances.reduce((sum, balance) => ({
    allocated: sum.allocated + balance.allocated,
    used: sum.used + balance.used,
    pending: sum.pending + balance.pending,
    available: sum.available + balance.available,
  }), { allocated: 0, used: 0, pending: 0, available: 0 }), [balances]);

  function openApply() {
    setFormError('');
    setDateFocus('start');
    setPopup('apply');
  }

  async function apply(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    if (!selected) {
      setFormError('Choose a leave type');
      return;
    }
    if (selected.available <= 0) {
      setFormError(`You have no ${selected.leaveType.name} left`);
      return;
    }
    if (!form.startDate || !form.endDate || form.endDate < form.startDate) {
      setFormError('Choose a start and end date');
      return;
    }
    if (!requestedDays) {
      setFormError('This range falls only on weekly offs');
      return;
    }
    if (requestedDays > selected.available) {
      setFormError(`You have ${selected.available} day(s) of ${selected.leaveType.name} left, and this request is ${requestedDays} day(s)`);
      return;
    }
    if (selected.leaveType.maxConsecutiveDays && requestedDays > selected.leaveType.maxConsecutiveDays) {
      setFormError(`${selected.leaveType.name} can be taken for at most ${selected.leaveType.maxConsecutiveDays} consecutive day(s)`);
      return;
    }
    if (selected.leaveType.requiresDocument && !form.attachmentUrl.trim()) {
      setFormError(`${selected.leaveType.name} requires a document link`);
      return;
    }
    setBusy(true);
    try {
      await api('/leave/apply', { method: 'POST', body: JSON.stringify(form) });
      setForm(emptyForm);
      setPopup(null);
      await load();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="att-page emp-leave">
      <header className="att-head">
        <div>
          <p className="att-kicker">Time off</p>
          <h1>Leave</h1>
        </div>
        <div className="att-head-actions">
          <button className="btn secondary" type="button" onClick={() => setPopup('remaining')}>
            Remaining leave
          </button>
          <button className="btn" type="button" onClick={openApply} disabled={!balances.length}>
            Apply leave
          </button>
        </div>
      </header>

      {error && <p className="att-banner">{error}</p>}

      <section className="att-panel">
        <div className="att-panel-head">
          <h2>Request history</h2>
          <span className="att-count">{requests.length || 'None yet'}</span>
        </div>
        {!requests.length && <p className="att-empty">No leave requests yet.</p>}
        {!!requests.length && (
          <>
            <div className="att-table-wrap lv-history-table">
              <table className="att-table">
                <thead>
                  <tr>
                    <th>Leave type</th>
                    <th>Dates</th>
                    <th>Days</th>
                    <th>Reason</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => {
                    const days = chargeableDays(String(request.startDate).slice(0, 10), String(request.endDate).slice(0, 10), weekOffs);
                    return (
                      <tr key={request.id}>
                        <td>{request.leaveType?.name || 'Leave'}</td>
                        <td>{formatRange(request.startDate, request.endDate)}</td>
                        <td>{days}</td>
                        <td>{request.reason || '—'}</td>
                        <td><span className={`badge ${statusClass(request.status)}`}>{statusLabel(request.status)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="lv-history-cards">
              {requests.map((request) => {
                const days = chargeableDays(String(request.startDate).slice(0, 10), String(request.endDate).slice(0, 10), weekOffs);
                return (
                  <li key={request.id}>
                    <div>
                      <strong>{request.leaveType?.name || 'Leave'}</strong>
                      <span>{formatRange(request.startDate, request.endDate)} · {days} day{days === 1 ? '' : 's'}</span>
                      {request.reason && <span>{request.reason}</span>}
                    </div>
                    <span className={`badge ${statusClass(request.status)}`}>{statusLabel(request.status)}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {popup === 'remaining' && typeof document !== 'undefined' && createPortal(
        <div className="lv-pop" role="presentation" onMouseDown={() => setPopup(null)}>
          <div className="lv-card lv-ledger-card" role="dialog" aria-labelledby="remaining-leave-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="lv-card-head">
              <div>
                <p className="att-kicker">{new Date().getFullYear()}</p>
                <h2 id="remaining-leave-title">Remaining leave</h2>
              </div>
              <button className="lv-close" type="button" onClick={() => setPopup(null)}>Close</button>
            </div>
            {!balances.length && <p className="att-empty">No leave is allocated to you yet.</p>}
            {!!balances.length && (
              <div className="att-table-wrap lv-ledger-table">
                <table className="att-table lv-ledger">
                  <thead>
                    <tr>
                      <th>Leave type</th>
                      <th>Allocated</th>
                      <th>Used</th>
                      <th>Pending</th>
                      <th>Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map((balance) => (
                      <tr key={balance.id}>
                        <td>{balance.leaveType.name}</td>
                        <td>{balance.allocated}</td>
                        <td>{balance.used}</td>
                        <td>{balance.pending}</td>
                        <td>{balance.available}</td>
                      </tr>
                    ))}
                    <tr className="lv-ledger-total">
                      <td>Total</td>
                      <td>{totals.allocated}</td>
                      <td>{totals.used}</td>
                      <td>{totals.pending}</td>
                      <td>{totals.available}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {!!balances.length && (
              <ul className="lv-ledger-list">
                {balances.map((balance) => (
                  <li key={balance.id}>
                    <div>
                      <strong>{balance.leaveType.name}</strong>
                      <span>Allocated {balance.allocated} · Used {balance.used} · Pending {balance.pending}</span>
                    </div>
                    <b>{balance.available}</b>
                  </li>
                ))}
                <li className="lv-ledger-total">
                  <div>
                    <strong>Total</strong>
                    <span>Allocated {totals.allocated} · Used {totals.used} · Pending {totals.pending}</span>
                  </div>
                  <b>{totals.available}</b>
                </li>
              </ul>
            )}
          </div>
        </div>,
        document.body,
      )}

      {popup === 'apply' && typeof document !== 'undefined' && createPortal(
        <div className="lv-pop" role="presentation" onMouseDown={() => setPopup(null)}>
          <form className="lv-card" role="dialog" aria-labelledby="apply-leave-title" onSubmit={apply} onMouseDown={(event) => event.stopPropagation()}>
            <div className="lv-card-head">
              <div>
                <p className="att-kicker">New request</p>
                <h2 id="apply-leave-title">Apply leave</h2>
              </div>
              <button className="lv-close" type="button" onClick={() => setPopup(null)}>Close</button>
            </div>

            <fieldset className="lv-types">
              <legend>Type</legend>
              {balances.map((balance) => (
                <label key={balance.leaveTypeId} className={form.leaveTypeId === balance.leaveTypeId ? 'is-on' : ''}>
                  <input
                    type="radio"
                    name="leaveType"
                    value={balance.leaveTypeId}
                    checked={form.leaveTypeId === balance.leaveTypeId}
                    disabled={balance.available <= 0}
                    onChange={() => setForm({ ...form, leaveTypeId: balance.leaveTypeId })}
                  />
                  <span>{balance.leaveType.name}</span>
                  <b>{balance.available} left</b>
                </label>
              ))}
            </fieldset>

            {selected && (
              <p className="lv-left">
                <strong>{selected.available}</strong>
                <span>{selected.available === 1 ? 'day remaining' : 'days remaining'} for {selected.leaveType.name}</span>
              </p>
            )}

            <RangeCalendar
              start={form.startDate}
              end={form.endDate}
              weekOffs={weekOffs}
              focus={dateFocus}
              onFocus={setDateFocus}
              onChange={(startDate, endDate) => setForm({ ...form, startDate, endDate })}
            />
            {requestedDays > 0 && (
              <p className="lv-days">{requestedDays} working day{requestedDays === 1 ? '' : 's'}</p>
            )}

            <label className="field">
              <span className="label">Reason</span>
              <input className="input" required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
            </label>
            <label className="field">
              <span className="label">Document link{selected?.leaveType.requiresDocument ? '' : ' (optional)'}</span>
              <input
                className="input"
                required={!!selected?.leaveType.requiresDocument}
                value={form.attachmentUrl}
                onChange={(event) => setForm({ ...form, attachmentUrl: event.target.value })}
                placeholder="https://"
              />
            </label>
            {selected && (
              <p className="att-sub">
                {selected.leaveType.paid ? 'Paid' : 'Unpaid'}
                {selected.leaveType.minNoticeDays ? ` · apply ${selected.leaveType.minNoticeDays} day(s) ahead` : ''}
                {selected.leaveType.maxConsecutiveDays ? ` · up to ${selected.leaveType.maxConsecutiveDays} day(s) in a row` : ''}
              </p>
            )}
            {formError && <p className="att-banner">{formError}</p>}
            <button className="btn lv-submit" type="submit" disabled={busy || !balances.length || selected?.available === 0}>
              {busy ? 'Sending…' : 'Submit request'}
            </button>
          </form>
        </div>,
        document.body,
      )}
    </div>
  );
}
