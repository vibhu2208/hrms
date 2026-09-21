'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';

const DOC_KINDS = [
  'RELIEVING_LETTER',
  'EXPERIENCE_LETTER',
  'FINAL_PAYSLIP',
  'OTHER',
];

const STAGES = [
  'PENDING_OWNER',
  'EXIT_CLEARANCE',
  'FINAL_DOCUMENTS',
  'REVOKE_ACCESS',
  'COMPLETED',
];

function badgeClass(status: string) {
  if (status === 'COMPLETED') return 'green';
  if (status === 'REJECTED' || status === 'CANCELLED') return 'red';
  if (status === 'PENDING_OWNER') return 'amber';
  return 'gray';
}

export default function AdminOffboardingPage() {
  const user = getStoredUser();
  const isOwner = user?.role?.code === 'OWNER';

  const [pending, setPending] = useState<any[]>([]);
  const [all, setAll] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const [form, setForm] = useState({
    employeeId: '',
    lastWorkingDay: '',
    reason: '',
  });
  const [docForm, setDocForm] = useState({ kind: 'FINAL_PAYSLIP', title: '', url: '' });
  const [emailForm, setEmailForm] = useState({ subject: '', message: '' });

  const load = useCallback(async () => {
    const [p, a, emps] = await Promise.all([
      api('/offboarding/pending'),
      api('/offboarding'),
      api('/employees'),
    ]);
    setPending(p);
    setAll(a);
    setEmployees(emps.filter((e: any) => e.user?.isActive !== false));
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function selectCase(id: string) {
    setSelectedId(id);
    setError('');
    setMsg('');
    try {
      const d = await api(`/offboarding/${id}`);
      setDetail(d);
      setEmailForm({
        subject: `Exit documentation — ${d.employee?.firstName} ${d.employee?.lastName}`,
        message: `Hi ${d.employee?.firstName},\n\nPlease find your exit documentation (relieving letter, experience letter, and final settlement details) as part of your offboarding process.\n\nLast working day: ${new Date(d.lastWorkingDay).toLocaleDateString()}\n\nBest regards,\nHR Team — Go Staff`,
      });
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function refreshSelected() {
    if (!selectedId) return;
    const d = await api(`/offboarding/${selectedId}`);
    setDetail(d);
    await load();
  }

  async function createCase(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const created = await api('/offboarding', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setMsg('Offboarding case submitted for owner approval');
      setForm({ employeeId: '', lastWorkingDay: '', reason: '' });
      await load();
      await selectCase(created.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function review(id: string, action: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/offboarding/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      await load();
      if (selectedId === id) await refreshSelected();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function run(path: string, method: string, body?: any) {
    if (!selectedId) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await api(`/offboarding/${selectedId}${path}`, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      setMsg('Updated');
      await refreshSelected();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const stageIndex = useMemo(() => {
    if (!detail) return -1;
    if (detail.status === 'REJECTED' || detail.status === 'CANCELLED') return -1;
    return STAGES.indexOf(detail.status);
  }, [detail]);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Offboarding</h1>
      {error && <p className="error">{error}</p>}
      {msg && <p className="muted">{msg}</p>}

      {isOwner && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Pending owner approval</h2>
          {!pending.length && <p className="empty">No pending requests</p>}
          {pending.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                padding: '0.75rem 0',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <div>
                <strong>
                  {r.employee?.firstName} {r.employee?.lastName}
                </strong>
                <div className="muted">
                  Last day {new Date(r.lastWorkingDay).toLocaleDateString()} · {r.reason}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn secondary" onClick={() => selectCase(r.id)} disabled={busy}>
                  Open
                </button>
                <button className="btn" onClick={() => review(r.id, 'APPROVE')} disabled={busy}>
                  Approve
                </button>
                <button className="btn danger" onClick={() => review(r.id, 'REJECT')} disabled={busy}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Start offboarding</h2>
        <form onSubmit={createCase} style={{ display: 'grid', gap: 10 }}>
          <div className="field">
            <label className="label">Employee</label>
            <select
              className="input"
              required
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
            >
              <option value="">Select employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} ({e.employeeCode})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Last working day</label>
            <input
              className="input"
              type="date"
              required
              value={form.lastWorkingDay}
              onChange={(e) => setForm({ ...form, lastWorkingDay: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="label">Reason</label>
            <textarea
              className="textarea"
              required
              rows={3}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </div>
          <button className="btn" type="submit" disabled={busy}>
            Submit for owner approval
          </button>
        </form>
      </div>

      <div className="grid grid-2" style={{ gap: 16, alignItems: 'start' }}>
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>All cases</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Last day</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {all.map((r) => (
                <tr
                  key={r.id}
                  style={{ cursor: 'pointer', background: selectedId === r.id ? 'var(--bg-soft, #f5f5f5)' : undefined }}
                  onClick={() => selectCase(r.id)}
                >
                  <td>
                    {r.employee?.firstName} {r.employee?.lastName}
                  </td>
                  <td>{new Date(r.lastWorkingDay).toLocaleDateString()}</td>
                  <td>
                    <span className={`badge ${badgeClass(r.status)}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!all.length && <p className="empty">No offboarding cases yet</p>}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Case detail</h2>
          {!detail && <p className="empty">Select a case</p>}
          {detail && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <strong>
                  {detail.employee?.firstName} {detail.employee?.lastName}
                </strong>
                <div className="muted">{detail.employee?.user?.email}</div>
                <div className="muted">{detail.reason}</div>
                <span className={`badge ${badgeClass(detail.status)}`} style={{ marginTop: 6 }}>
                  {detail.status}
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {STAGES.filter((s) => s !== 'COMPLETED' || detail.status === 'COMPLETED').map((s, i) => (
                  <span
                    key={s}
                    className={`badge ${stageIndex >= i ? 'green' : 'gray'}`}
                    style={{ fontSize: 11 }}
                  >
                    {s.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>

              {detail.status === 'EXIT_CLEARANCE' && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>Exit clearance</h3>
                  {detail.checklistItems?.map((item: any) => (
                    <label key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={item.completed}
                        disabled={busy}
                        onChange={(e) =>
                          run(`/items/${item.id}`, 'PATCH', { completed: e.target.checked })
                        }
                      />
                      {item.title}
                    </label>
                  ))}
                  <button className="btn" disabled={busy} onClick={() => run('/advance', 'PATCH')}>
                    Advance to final documents
                  </button>
                </div>
              )}

              {(detail.status === 'FINAL_DOCUMENTS' ||
                detail.status === 'REVOKE_ACCESS' ||
                detail.status === 'EXIT_CLEARANCE') && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>Final documents</h3>
                  {detail.documents?.length ? (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Kind</th>
                          <th>Title</th>
                          <th>Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.documents.map((d: any) => (
                          <tr key={d.id}>
                            <td>{d.kind}</td>
                            <td>{d.title}</td>
                            <td>
                              <a href={d.url} target="_blank" rel="noreferrer">
                                Open
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="muted">No documents yet</p>
                  )}
                  {(detail.status === 'FINAL_DOCUMENTS' || detail.status === 'EXIT_CLEARANCE') && (
                    <>
                      <div className="grid grid-2" style={{ gap: 8 }}>
                        <select
                          className="input"
                          value={docForm.kind}
                          onChange={(e) => setDocForm({ ...docForm, kind: e.target.value })}
                        >
                          {DOC_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                        <input
                          className="input"
                          placeholder="Title"
                          value={docForm.title}
                          onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                        />
                      </div>
                      <input
                        className="input"
                        placeholder="Document URL"
                        value={docForm.url}
                        onChange={(e) => setDocForm({ ...docForm, url: e.target.value })}
                      />
                      <button
                        className="btn secondary"
                        disabled={busy}
                        onClick={async () => {
                          await run('/documents', 'POST', docForm);
                          setDocForm({ kind: 'FINAL_PAYSLIP', title: '', url: '' });
                        }}
                      >
                        Add document
                      </button>
                    </>
                  )}
                  {detail.status === 'FINAL_DOCUMENTS' && (
                    <>
                      <div className="field">
                        <label className="label">Email subject</label>
                        <input
                          className="input"
                          value={emailForm.subject}
                          onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label className="label">Email message</label>
                        <textarea
                          className="textarea"
                          rows={5}
                          value={emailForm.message}
                          onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className="btn secondary"
                          disabled={busy}
                          onClick={() => run('/send-final-email', 'POST', emailForm)}
                        >
                          Email employee
                        </button>
                        <button className="btn" disabled={busy} onClick={() => run('/advance', 'PATCH')}>
                          Advance to revoke access
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {detail.status === 'REVOKE_ACCESS' && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>Revoke access</h3>
                  <p className="muted" style={{ margin: 0 }}>
                    This deactivates the employee login and records the last working day.
                  </p>
                  <button
                    className="btn danger"
                    disabled={busy}
                    onClick={() => run('/revoke-access', 'POST')}
                  >
                    Revoke access &amp; complete
                  </button>
                </div>
              )}

              {detail.status === 'COMPLETED' && (
                <p className="muted">
                  Offboarding completed
                  {detail.accessRevokedAt
                    ? ` · access revoked ${new Date(detail.accessRevokedAt).toLocaleString()}`
                    : ''}
                  .
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
