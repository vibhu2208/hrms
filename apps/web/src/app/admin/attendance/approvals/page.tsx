'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AttendanceNav } from '../nav';

function reviewer(row: any) {
  const person = row.approvedBy?.employee;
  if (person) return `${person.firstName} ${person.lastName}`;
  return row.approvedBy?.email || '—';
}

function clock(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function localInput(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const OPEN_REASON = 'No clock-out was recorded within 24 hours of check-in.';

export default function AttendanceApprovalsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [missed, setMissed] = useState<any[]>([]);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [closeForm, setCloseForm] = useState<Record<string, { reason: string; checkOut: string }>>({});
  const [msg, setMsg] = useState('');
  const [busyId, setBusyId] = useState('');

  async function load() {
    const [approvals, open] = await Promise.all([
      api<any[]>('/attendance/approvals'),
      api<any[]>('/attendance/missed-clock-outs'),
    ]);
    setRows(approvals);
    setMissed(open);
    setCloseForm((current) => {
      const next = { ...current };
      for (const row of open) {
        if (!next[row.id]) {
          next[row.id] = {
            reason: row.missedClockOutReason || row.reason || OPEN_REASON,
            checkOut: row.proposedCheckOut ? localInput(row.proposedCheckOut) : '',
          };
        }
      }
      return next;
    });
  }

  useEffect(() => {
    load();
  }, []);

  async function approve(id: string) {
    setBusyId(id);
    setMsg('');
    try {
      await api(`/attendance/approvals/${id}/approve`, { method: 'POST' });
      setMsg('Attendance approved and marked present.');
      await load();
    } catch (error: any) {
      setMsg(error.message);
    } finally {
      setBusyId('');
    }
  }

  async function reject(id: string) {
    const rejectionReason = (reason[id] || '').trim();
    if (rejectionReason.length < 3) {
      setMsg('Enter a rejection reason.');
      return;
    }
    setBusyId(id);
    setMsg('');
    try {
      await api(`/attendance/approvals/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ rejectionReason }),
      });
      setMsg('Attendance request rejected.');
      await load();
    } catch (error: any) {
      setMsg(error.message);
    } finally {
      setBusyId('');
    }
  }

  async function closeMissed(id: string) {
    const form = closeForm[id];
    const reasonText = (form?.reason || '').trim();
    if (reasonText.length < 3 || !form?.checkOut) {
      setMsg('Enter the clock-out time and a reason.');
      return;
    }
    setBusyId(id);
    setMsg('');
    try {
      await api(`/attendance/missed-clock-outs/${id}/close`, {
        method: 'POST',
        body: JSON.stringify({
          reason: reasonText,
          checkOut: new Date(form.checkOut).toISOString(),
        }),
      });
      setMsg('Missed clock-out recorded.');
      await load();
    } catch (error: any) {
      setMsg(error.message);
    } finally {
      setBusyId('');
    }
  }

  const pending = rows.filter((row) => row.approvalStatus === 'PENDING');
  const decided = rows.filter((row) => row.approvalStatus !== 'PENDING');

  return (
    <div className="att-page">
      <header className="att-head">
        <div>
          <p className="att-kicker">People</p>
          <h1>Attendance</h1>
          <p className="att-sub">Office exceptions and clock-outs left open for 24 hours.</p>
        </div>
        <AttendanceNav />
      </header>
      {msg && <p className="att-banner">{msg}</p>}

      <section className="att-panel">
        <div className="att-panel-head">
          <h2>Missed clock-outs</h2>
          <span className="att-count">{missed.length ? `${missed.length} to review` : 'Clear'}</span>
        </div>
        {!missed.length && <p className="att-empty">No clock-outs have been open for 24 hours.</p>}
        {missed.map((row) => {
          const form = closeForm[row.id] || { reason: row.reason || OPEN_REASON, checkOut: '' };
          return (
            <article className="att-request" key={row.id}>
              <div className="att-request-top">
                <div className="att-person">
                  <b>{row.employee?.firstName} {row.employee?.lastName}</b>
                  <span>{row.employee?.employeeCode}</span>
                </div>
                <span className="att-pill">Missed clock-out</span>
              </div>
              <dl className="att-fields">
                <div>
                  <dt>Date</dt>
                  <dd>{new Date(row.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
                </div>
                <div>
                  <dt>Clock-in</dt>
                  <dd>{clock(row.checkIn)}</dd>
                </div>
                <div>
                  <dt>Stated clock-out</dt>
                  <dd>{row.proposedCheckOut ? clock(row.proposedCheckOut) : 'Not sent yet'}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>
                    {row.latitude != null && row.longitude != null ? (
                      <a className="att-map" href={`https://www.google.com/maps?q=${row.latitude},${row.longitude}`} target="_blank" rel="noreferrer">
                        {Number(row.latitude).toFixed(5)}, {Number(row.longitude).toFixed(5)}
                      </a>
                    ) : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Distance</dt>
                  <dd>{row.officeDistance != null ? `${Math.round(row.officeDistance)} m` : '—'}</dd>
                </div>
                <div>
                  <dt>Network</dt>
                  <dd>{row.networkVerified ? 'Verified' : row.publicIp || 'Not verified'}</dd>
                </div>
              </dl>
              <div className="att-form-grid" style={{ marginTop: 4 }}>
                <div className="field">
                  <label className="label" htmlFor={`close-out-${row.id}`}>Clock-out to record</label>
                  <input
                    id={`close-out-${row.id}`}
                    className="input"
                    type="datetime-local"
                    value={form.checkOut}
                    onChange={(event) => setCloseForm((current) => ({ ...current, [row.id]: { ...form, checkOut: event.target.value } }))}
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor={`close-why-${row.id}`}>Reason</label>
                  <textarea
                    id={`close-why-${row.id}`}
                    className="textarea"
                    value={form.reason}
                    onChange={(event) => setCloseForm((current) => ({ ...current, [row.id]: { ...form, reason: event.target.value } }))}
                  />
                </div>
              </div>
              <div className="att-actions">
                <button className="btn" type="button" disabled={busyId === row.id} onClick={() => closeMissed(row.id)}>
                  Record clock-out
                </button>
              </div>
            </article>
          );
        })}
      </section>

      <section className="att-panel">
        <div className="att-panel-head">
          <h2>Waiting</h2>
          <span className="att-count">{pending.length ? `${pending.length} open` : 'Clear'}</span>
        </div>
        {!pending.length && <p className="att-empty">No requests waiting for HR.</p>}
        {pending.map((row) => (
          <article className="att-request" key={row.id}>
            <div className="att-request-top">
              <div className="att-person">
                <b>{row.employee?.firstName} {row.employee?.lastName}</b>
                <span>{row.employee?.employeeCode}</span>
              </div>
              <span className="att-pill">Pending</span>
            </div>
            <dl className="att-fields">
              <div>
                <dt>Date</dt>
                <dd>{new Date(row.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
              </div>
              <div>
                <dt>Requested in</dt>
                <dd>{clock(row.checkIn)}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{row.locationVerified ? 'Verified' : 'Not verified'}</dd>
              </div>
              <div>
                <dt>Distance</dt>
                <dd>{row.officeDistance != null ? `${Math.round(row.officeDistance)} m` : '—'}</dd>
              </div>
              <div>
                <dt>Accuracy</dt>
                <dd>{row.locationAccuracy != null ? `${Math.round(row.locationAccuracy)} m` : '—'}</dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>{row.networkVerified ? 'Verified' : row.publicIp || 'Not verified'}</dd>
              </div>
              <div>
                <dt>Reason</dt>
                <dd>{row.exceptionReason || '—'}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>
                  {row.latitude != null && row.longitude != null ? (
                    <a className="att-map" href={`https://www.google.com/maps?q=${row.latitude},${row.longitude}`} target="_blank" rel="noreferrer">
                      {Number(row.latitude).toFixed(5)}, {Number(row.longitude).toFixed(5)}
                    </a>
                  ) : '—'}
                </dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{clock(row.createdAt)}</dd>
              </div>
            </dl>
            <div className="att-actions">
              <button className="btn" type="button" disabled={busyId === row.id} onClick={() => approve(row.id)}>
                Approve
              </button>
              <input
                className="input"
                style={{ maxWidth: 280 }}
                placeholder="Reason if declining"
                value={reason[row.id] || ''}
                onChange={(event) => setReason((current) => ({ ...current, [row.id]: event.target.value }))}
              />
              <button className="btn secondary" type="button" disabled={busyId === row.id} onClick={() => reject(row.id)}>
                Decline
              </button>
            </div>
          </article>
        ))}
      </section>

      {decided.length > 0 && (
        <section className="att-panel">
          <div className="att-panel-head">
            <h2>Earlier decisions</h2>
            <span className="att-count">{decided.length}</span>
          </div>
          <div className="att-table-wrap">
            <table className="att-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Decision</th>
                  <th>By</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {decided.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="att-person">
                        <b>{row.employee?.firstName} {row.employee?.lastName}</b>
                        <span>{row.employee?.employeeCode}</span>
                      </div>
                    </td>
                    <td>{new Date(row.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                    <td>{row.status === 'PRESENT' ? 'Present' : row.status}</td>
                    <td>{row.approvalStatus === 'APPROVED' ? 'Approved' : 'Rejected'}{row.rejectionReason ? ` · ${row.rejectionReason}` : ''}</td>
                    <td>{reviewer(row)}</td>
                    <td>{row.approvedAt ? clock(row.approvedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
