'use client';

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

const DOC_KINDS = [
  'ID_PROOF',
  'ADDRESS',
  'BANK',
  'EDUCATION',
  'PREVIOUS_PAYSLIP',
  'OFFER_LETTER',
  'PHOTO',
  'OTHER',
];

const STAGES = [
  'PENDING_OWNER',
  'OFFER_LETTER',
  'DOCUMENTS',
  'CREATE_ACCOUNT',
  'IT_HR_CHECKLIST',
  'COMPLETED',
];

function badgeClass(status: string) {
  if (status === 'COMPLETED') return 'green';
  if (status === 'REJECTED' || status === 'CANCELLED') return 'red';
  if (status === 'PENDING_OWNER') return 'amber';
  return 'gray';
}

function OnboardingPageInner() {
  const searchParams = useSearchParams();
  const user = getStoredUser();
  const isOwner = user?.role?.code === 'OWNER';

  const [pending, setPending] = useState<any[]>([]);
  const [all, setAll] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [designations, setDesignations] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    employeeCode: '',
    roleCode: 'EMPLOYEE',
    joiningDate: '',
    departmentId: '',
    designationId: '',
    applicationId: '',
  });

  const [offerForm, setOfferForm] = useState({ subject: '', message: '' });
  const [docForm, setDocForm] = useState({ kind: 'ID_PROOF', title: '', url: '' });
  const [accountForm, setAccountForm] = useState({ password: 'password123', employeeCode: '' });

  const load = useCallback(async () => {
    const [p, a, deps, desigs] = await Promise.all([
      api('/onboarding/pending'),
      api('/onboarding'),
      api('/departments'),
      api('/designations'),
    ]);
    setPending(p);
    setAll(a);
    setDepartments(deps);
    setDesignations(desigs);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  useEffect(() => {
    const first = searchParams.get('firstName') || '';
    const last = searchParams.get('lastName') || '';
    const email = searchParams.get('email') || '';
    const phone = searchParams.get('phone') || '';
    const applicationId = searchParams.get('applicationId') || '';
    if (first || last || email || applicationId) {
      setForm((f) => ({
        ...f,
        firstName: first || f.firstName,
        lastName: last || f.lastName,
        email: email || f.email,
        phone: phone || f.phone,
        applicationId: applicationId || f.applicationId,
        joiningDate: f.joiningDate || new Date().toISOString().slice(0, 10),
      }));
    }
  }, [searchParams]);

  async function selectCase(id: string) {
    setSelectedId(id);
    setError('');
    setMsg('');
    try {
      const d = await api(`/onboarding/${id}`);
      setDetail(d);
      setOfferForm({
        subject: d.offerSubject || `Offer of employment — ${d.firstName} ${d.lastName}`,
        message:
          d.offerBody ||
          `Hi ${d.firstName},\n\nWe are pleased to offer you a position at Go Staff, with a proposed joining date of ${new Date(d.joiningDate).toLocaleDateString()}.\n\nOur HR team will follow up with documentation and next steps.\n\nCongratulations!\n\nBest regards,\nHR Team — Go Staff`,
      });
      setAccountForm({
        password: 'password123',
        employeeCode: d.employeeCode || '',
      });
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function refreshSelected() {
    if (!selectedId) return;
    const d = await api(`/onboarding/${selectedId}`);
    setDetail(d);
    await load();
  }

  async function createCase(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const created = await api('/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          departmentId: form.departmentId || undefined,
          designationId: form.designationId || undefined,
          employeeCode: form.employeeCode || undefined,
          phone: form.phone || undefined,
          applicationId: form.applicationId || undefined,
        }),
      });
      setMsg('Onboarding case submitted for owner approval');
      setForm({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        employeeCode: '',
        roleCode: 'EMPLOYEE',
        joiningDate: '',
        departmentId: '',
        designationId: '',
        applicationId: '',
      });
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
      await api(`/onboarding/${id}/review`, {
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
      await api(`/onboarding/${selectedId}${path}`, {
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
      <h1 style={{ marginTop: 0 }}>Onboarding</h1>
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
                  {r.firstName} {r.lastName}
                </strong>
                <div className="muted">
                  {r.email} · Joining {new Date(r.joiningDate).toLocaleDateString()}
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
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Start onboarding</h2>
        <form onSubmit={createCase} style={{ display: 'grid', gap: 10 }}>
          <div className="grid grid-2" style={{ gap: 10 }}>
            <div className="field">
              <label className="label">First name</label>
              <input
                className="input"
                required
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="label">Last name</label>
              <input
                className="input"
                required
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-2" style={{ gap: 10 }}>
            <div className="field">
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="label">Phone</label>
              <input
                className="input"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-2" style={{ gap: 10 }}>
            <div className="field">
              <label className="label">Joining date</label>
              <input
                className="input"
                type="date"
                required
                value={form.joiningDate}
                onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="label">Employee code (optional)</label>
              <input
                className="input"
                value={form.employeeCode}
                onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-2" style={{ gap: 10 }}>
            <div className="field">
              <label className="label">Department</label>
              <select
                className="input"
                value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
              >
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Designation</label>
              <select
                className="input"
                value={form.designationId}
                onChange={(e) => setForm({ ...form, designationId: e.target.value })}
              >
                <option value="">—</option>
                {designations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {form.applicationId && (
            <p className="muted" style={{ margin: 0 }}>
              Linked application: {form.applicationId}
            </p>
          )}
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
                <th>Candidate</th>
                <th>Joining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {all.map((r) => (
                <tr
                  key={r.id}
                  style={{
                    cursor: 'pointer',
                    background: selectedId === r.id ? 'var(--bg-soft, #f5f5f5)' : undefined,
                  }}
                  onClick={() => selectCase(r.id)}
                >
                  <td>
                    {r.firstName} {r.lastName}
                    <div className="muted">{r.email}</div>
                  </td>
                  <td>{new Date(r.joiningDate).toLocaleDateString()}</td>
                  <td>
                    <span className={`badge ${badgeClass(r.status)}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!all.length && <p className="empty">No onboarding cases yet</p>}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Case detail</h2>
          {!detail && <p className="empty">Select a case</p>}
          {detail && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <strong>
                  {detail.firstName} {detail.lastName}
                </strong>
                <div className="muted">{detail.email}</div>
                <span className={`badge ${badgeClass(detail.status)}`} style={{ marginTop: 6 }}>
                  {detail.status}
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {STAGES.filter((s) => s !== 'COMPLETED' || detail.status === 'COMPLETED').map(
                  (s, i) => (
                    <span
                      key={s}
                      className={`badge ${stageIndex >= i ? 'green' : 'gray'}`}
                      style={{ fontSize: 11 }}
                    >
                      {s.replace(/_/g, ' ')}
                    </span>
                  ),
                )}
              </div>

              {detail.status === 'OFFER_LETTER' && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>Offer letter</h3>
                  <div className="field">
                    <label className="label">Subject</label>
                    <input
                      className="input"
                      value={offerForm.subject}
                      onChange={(e) => setOfferForm({ ...offerForm, subject: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label className="label">Message</label>
                    <textarea
                      className="textarea"
                      rows={6}
                      value={offerForm.message}
                      onChange={(e) => setOfferForm({ ...offerForm, message: e.target.value })}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() => run('/send-offer', 'POST', offerForm)}
                    >
                      Send offer email
                    </button>
                    <button
                      className="btn secondary"
                      disabled={busy || !detail.offerSentAt}
                      onClick={() => run('/offer-accepted', 'PATCH')}
                    >
                      Mark offer accepted
                    </button>
                  </div>
                  {detail.offerSentAt && (
                    <p className="muted" style={{ margin: 0 }}>
                      Sent {new Date(detail.offerSentAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {(detail.status === 'DOCUMENTS' ||
                detail.status === 'CREATE_ACCOUNT' ||
                detail.status === 'IT_HR_CHECKLIST' ||
                detail.status === 'OFFER_LETTER') && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>Documents</h3>
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
                      setDocForm({ kind: 'ID_PROOF', title: '', url: '' });
                    }}
                  >
                    Add document
                  </button>
                  {detail.status === 'DOCUMENTS' && (
                    <button className="btn" disabled={busy} onClick={() => run('/advance', 'PATCH')}>
                      Advance to create account
                    </button>
                  )}
                </div>
              )}

              {detail.status === 'CREATE_ACCOUNT' && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>Create employee account</h3>
                  <div className="field">
                    <label className="label">Employee code</label>
                    <input
                      className="input"
                      value={accountForm.employeeCode}
                      onChange={(e) =>
                        setAccountForm({ ...accountForm, employeeCode: e.target.value })
                      }
                      placeholder="Auto if blank"
                    />
                  </div>
                  <div className="field">
                    <label className="label">Temp password</label>
                    <input
                      className="input"
                      value={accountForm.password}
                      onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
                    />
                  </div>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => run('/create-account', 'POST', accountForm)}
                  >
                    Create account
                  </button>
                </div>
              )}

              {detail.status === 'IT_HR_CHECKLIST' && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>IT / HR checklist</h3>
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
                    Mark onboarding complete
                  </button>
                </div>
              )}

              {detail.status === 'COMPLETED' && (
                <p className="muted">Onboarding completed. Employee account is active.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminOnboardingPage() {
  return (
    <Suspense fallback={<div className="main">Loading…</div>}>
      <OnboardingPageInner />
    </Suspense>
  );
}
