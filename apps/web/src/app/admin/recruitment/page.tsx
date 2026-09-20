'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type Tab = 'positions' | 'applicants';

const APP_STATUSES = [
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'OFFER',
  'HIRED',
  'REJECTED',
  'WITHDRAWN',
] as const;

const emptyJob = {
  title: '',
  departmentId: '',
  location: '',
  employmentType: 'FULL_TIME',
  salaryRange: '',
  description: '',
  requirements: '',
  openingDate: new Date().toISOString().slice(0, 10),
  targetHireDate: '',
  isPublic: true,
};

export default function RecruitmentPage() {
  const [tab, setTab] = useState<Tab>('positions');
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [form, setForm] = useState(emptyJob);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [emailForm, setEmailForm] = useState({
    type: 'INTERVIEW' as 'INTERVIEW' | 'REJECTION' | 'OFFER' | 'CUSTOM',
    subject: '',
    message: '',
    interviewAt: '',
    interviewLocation: 'Office / Video call',
  });
  const [statusFilter, setStatusFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [initialTabSet, setInitialTabSet] = useState(false);

  async function load() {
    setError('');
    try {
      const [r, s, d, apps] = await Promise.all([
        api('/recruitment'),
        api('/recruitment/summary'),
        api('/departments'),
        api(`/recruitment/applications${statusFilter ? `?status=${statusFilter}` : ''}`),
      ]);
      setRows(Array.isArray(r) ? r : []);
      setSummary(s);
      setDepartments(Array.isArray(d) ? d : []);
      const list = Array.isArray(apps) ? apps : [];
      setApplications(list);
      if (!initialTabSet) {
        setInitialTabSet(true);
        if (list.length > 0 || (s?.pendingApplications ?? 0) > 0) {
          setTab('applicants');
          setSelectedApp(list[0] || null);
        }
      } else if (selectedApp) {
        const refreshed = list.find((a) => a.id === selectedApp.id);
        if (refreshed) setSelectedApp(refreshed);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load recruitment data');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const publicBase =
    typeof window !== 'undefined' ? `${window.location.origin}/careers` : '/careers';

  const pendingCount = useMemo(
    () => applications.filter((a) => a.status === 'APPLIED' || a.status === 'SCREENING').length,
    [applications],
  );

  async function createJob(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api('/recruitment', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          departmentId: form.departmentId || undefined,
          targetHireDate:
            form.targetHireDate ||
            new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        }),
      });
      setForm(emptyJob);
      await load();
      setTab('positions');
    } catch (err: any) {
      setError(err.message || 'Failed to create job');
    } finally {
      setSaving(false);
    }
  }

  async function togglePublic(id: string, isPublic: boolean) {
    await api(`/recruitment/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isPublic }),
    });
    await load();
  }

  async function updateStatus(id: string, status: string) {
    setBusy(true);
    try {
      await api(`/recruitment/applications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
      if (selectedApp?.id === id) {
        const refreshed = await api(`/recruitment/applications/${id}`);
        setSelectedApp(refreshed);
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendEmail(e: FormEvent) {
    e.preventDefault();
    if (!selectedApp) return;
    setBusy(true);
    setError('');
    try {
      const res = await api(`/recruitment/applications/${selectedApp.id}/email`, {
        method: 'POST',
        body: JSON.stringify({
          type: emailForm.type,
          subject: emailForm.subject || undefined,
          message: emailForm.message || undefined,
          interviewAt: emailForm.interviewAt || undefined,
          interviewLocation: emailForm.interviewLocation || undefined,
        }),
      });
      setSelectedApp(res.application);
      setEmailForm({
        type: 'INTERVIEW',
        subject: '',
        message: '',
        interviewAt: '',
        interviewLocation: 'Office / Video call',
      });
      await load();
      alert(
        res.email?.delivered
          ? `Email sent via ${res.email.mode}`
          : 'Email logged on server (configure Microsoft Graph to deliver)',
      );
    } catch (err: any) {
      setError(err.message || 'Failed to send email');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginTop: 0, marginBottom: 4 }}>Recruitment</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Post public jobs, review applicants, and email interview invites.
            Public board:{' '}
            <Link href="/careers" style={{ color: 'var(--brand)' }}>
              /careers
            </Link>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn secondary" type="button" onClick={() => load()}>
            Refresh
          </button>
          <button
            className={`btn ${tab === 'positions' ? '' : 'secondary'}`}
            onClick={() => setTab('positions')}
          >
            Positions
          </button>
          <button
            className={`btn ${tab === 'applicants' ? '' : 'secondary'}`}
            onClick={() => setTab('applicants')}
          >
            Applicants{applications.length ? ` (${applications.length})` : ''}
          </button>
        </div>
      </div>

      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      {summary && (
        <div className="grid grid-4" style={{ marginBottom: 16 }}>
          <div className="card"><div className="stat-label">Open</div><div className="stat-value">{summary.open}</div></div>
          <div className="card"><div className="stat-label">Filled</div><div className="stat-value">{summary.filled}</div></div>
          <div className="card"><div className="stat-label">Delayed</div><div className="stat-value">{summary.delayed}</div></div>
          <button
            type="button"
            className="card"
            onClick={() => setTab('applicants')}
            style={{ cursor: 'pointer', textAlign: 'left', border: pendingCount ? '1px solid var(--brand)' : undefined }}
          >
            <div className="stat-label">Applicants to review</div>
            <div className="stat-value">{summary.pendingApplications ?? pendingCount}</div>
          </button>
        </div>
      )}

      {pendingCount > 0 && tab === 'positions' && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--brand)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <strong>{pendingCount} new application{pendingCount === 1 ? '' : 's'}</strong>
              <div className="muted" style={{ fontSize: 13 }}>
                Latest: {applications[0]?.fullName} for {applications[0]?.position?.title}
              </div>
            </div>
            <button className="btn" type="button" onClick={() => { setSelectedApp(applications[0]); setTab('applicants'); }}>
              Review applicants
            </button>
          </div>
        </div>
      )}

      {tab === 'positions' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Post a job</h2>
            <form onSubmit={createJob} className="grid" style={{ gap: 12 }}>
              <div className="grid grid-2" style={{ gap: 12 }}>
                <div className="field">
                  <label className="label">Title</label>
                  <input
                    className="input"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label className="label">Department</label>
                  <select
                    className="input"
                    value={form.departmentId}
                    onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                  >
                    <option value="">—</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Location</label>
                  <input
                    className="input"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="Bengaluru / Remote"
                  />
                </div>
                <div className="field">
                  <label className="label">Employment type</label>
                  <select
                    className="input"
                    value={form.employmentType}
                    onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
                  >
                    <option value="FULL_TIME">Full time</option>
                    <option value="PART_TIME">Part time</option>
                    <option value="CONTRACT">Contract</option>
                    <option value="INTERN">Intern</option>
                  </select>
                </div>
                <div className="field">
                  <label className="label">Salary range</label>
                  <input
                    className="input"
                    value={form.salaryRange}
                    onChange={(e) => setForm({ ...form, salaryRange: e.target.value })}
                    placeholder="₹10–15 LPA"
                  />
                </div>
                <div className="field">
                  <label className="label">Target hire date</label>
                  <input
                    className="input"
                    type="date"
                    value={form.targetHireDate}
                    onChange={(e) => setForm({ ...form, targetHireDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="field">
                <label className="label">Description</label>
                <textarea
                  className="input"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="label">Requirements</label>
                <textarea
                  className="input"
                  rows={3}
                  value={form.requirements}
                  onChange={(e) => setForm({ ...form, requirements: e.target.value })}
                  placeholder="One per line"
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={form.isPublic}
                  onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
                />
                Publish on public careers page
              </label>
              <div>
                <button className="btn" disabled={saving}>
                  {saving ? 'Posting…' : 'Post job'}
                </button>
              </div>
            </form>
          </div>

          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Dept</th>
                  <th>Public</th>
                  <th>Apps</th>
                  <th>Status</th>
                  <th>Timeliness</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.title}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {p.location || '—'} · {p.employmentType?.replace('_', ' ')}
                      </div>
                    </td>
                    <td>{p.department?.name || '—'}</td>
                    <td>
                      {p.isPublic ? (
                        <a
                          href={`${publicBase}/${p.slug || p.id}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--brand)', fontSize: 13 }}
                        >
                          View link
                        </a>
                      ) : (
                        <span className="muted">Hidden</span>
                      )}
                    </td>
                    <td>{p._count?.applications ?? p.applicantsCount}</td>
                    <td>{p.status}</td>
                    <td>
                      <span className={`badge ${p.timeliness === 'DELAYED' ? 'red' : p.timeliness === 'FILLED' ? 'green' : 'amber'}`}>
                        {p.timeliness}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn secondary"
                        style={{ fontSize: 12, padding: '0.35rem 0.65rem' }}
                        onClick={() => togglePublic(p.id, !p.isPublic)}
                      >
                        {p.isPublic ? 'Unpublish' : 'Publish'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'applicants' && (
        <div className="grid grid-2" style={{ gap: 16, alignItems: 'start' }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Applications</h2>
              <select
                className="input"
                style={{ width: 'auto' }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                {APP_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            {!applications.length && <p className="empty">No applications yet</p>}
            {applications.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedApp(a)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: selectedApp?.id === a.id ? 'var(--brand-soft)' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--line)',
                  padding: '0.85rem 0.5rem',
                  cursor: 'pointer',
                  color: 'inherit',
                }}
              >
                <strong>{a.fullName}</strong>
                <div className="muted" style={{ fontSize: 13 }}>
                  {a.position?.title} · {a.email}
                </div>
                <span className={`badge ${a.status === 'APPLIED' ? 'amber' : a.status === 'REJECTED' ? 'red' : 'green'}`}>
                  {a.status}
                </span>
              </button>
            ))}
          </div>

          <div className="card">
            {!selectedApp && <p className="empty">Select an applicant to review</p>}
            {selectedApp && (
              <>
                <h2 style={{ marginTop: 0, fontSize: '1.2rem' }}>{selectedApp.fullName}</h2>
                <p className="muted" style={{ marginTop: 0 }}>
                  Applied for <strong>{selectedApp.position?.title}</strong> on{' '}
                  {new Date(selectedApp.createdAt).toLocaleString()}
                </p>
                <div style={{ display: 'grid', gap: 6, marginBottom: 16, fontSize: 14 }}>
                  <div><strong>Email:</strong> {selectedApp.email}</div>
                  <div><strong>Phone:</strong> {selectedApp.phone || '—'}</div>
                  <div><strong>Experience:</strong> {selectedApp.experienceYears ?? '—'} yrs</div>
                  <div><strong>Company:</strong> {selectedApp.currentCompany || '—'}</div>
                  <div>
                    <strong>Resume:</strong>{' '}
                    {selectedApp.resumeUrl ? (
                      <a href={selectedApp.resumeUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)' }}>
                        Open link
                      </a>
                    ) : (
                      '—'
                    )}
                  </div>
                  <div>
                    <strong>LinkedIn:</strong>{' '}
                    {selectedApp.linkedInUrl ? (
                      <a href={selectedApp.linkedInUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)' }}>
                        Profile
                      </a>
                    ) : (
                      '—'
                    )}
                  </div>
                  {selectedApp.coverLetter && (
                    <div>
                      <strong>Cover letter</strong>
                      <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{selectedApp.coverLetter}</p>
                    </div>
                  )}
                  {selectedApp.lastEmailAt && (
                    <div className="muted">
                      Last email: {selectedApp.lastEmailSubject} (
                      {new Date(selectedApp.lastEmailAt).toLocaleString()})
                    </div>
                  )}
                </div>

                <div className="field" style={{ marginBottom: 16 }}>
                  <label className="label">Pipeline status</label>
                  <select
                    className="input"
                    value={selectedApp.status}
                    disabled={busy}
                    onChange={(e) => updateStatus(selectedApp.id, e.target.value)}
                  >
                    {APP_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>Email candidate</h3>
                <form onSubmit={sendEmail} style={{ display: 'grid', gap: 10 }}>
                  <div className="field">
                    <label className="label">Template</label>
                    <select
                      className="input"
                      value={emailForm.type}
                      onChange={(e) =>
                        setEmailForm({
                          ...emailForm,
                          type: e.target.value as typeof emailForm.type,
                        })
                      }
                    >
                      <option value="INTERVIEW">Interview invite</option>
                      <option value="OFFER">Offer</option>
                      <option value="REJECTION">Rejection</option>
                      <option value="CUSTOM">Custom</option>
                    </select>
                  </div>
                  {emailForm.type === 'INTERVIEW' && (
                    <div className="grid grid-2" style={{ gap: 10 }}>
                      <div className="field">
                        <label className="label">Interview date/time</label>
                        <input
                          className="input"
                          type="datetime-local"
                          required
                          value={emailForm.interviewAt}
                          onChange={(e) =>
                            setEmailForm({ ...emailForm, interviewAt: e.target.value })
                          }
                        />
                      </div>
                      <div className="field">
                        <label className="label">Location / link</label>
                        <input
                          className="input"
                          value={emailForm.interviewLocation}
                          onChange={(e) =>
                            setEmailForm({ ...emailForm, interviewLocation: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  )}
                  {emailForm.type !== 'CUSTOM' && (
                    <>
                      <div className="field">
                        <label className="label">Subject (optional override)</label>
                        <input
                          className="input"
                          value={emailForm.subject}
                          onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label className="label">Message (optional override)</label>
                        <textarea
                          className="input"
                          rows={4}
                          value={emailForm.message}
                          onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                  {emailForm.type === 'CUSTOM' && (
                    <>
                      <div className="field">
                        <label className="label">Subject</label>
                        <input
                          className="input"
                          required
                          value={emailForm.subject}
                          onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label className="label">Message</label>
                        <textarea
                          className="input"
                          rows={4}
                          required
                          value={emailForm.message}
                          onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                  <button className="btn" disabled={busy}>
                    {busy ? 'Sending…' : 'Send email'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
