'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';
import { DocumentPreview } from '@/components/document-preview';

const DOC_KINDS = [
  ['RELIEVING_LETTER', 'Relieving letter'],
  ['EXPERIENCE_LETTER', 'Experience letter'],
  ['FINAL_PAYSLIP', 'Final payslip'],
  ['OTHER', 'Other'],
] as const;

const STAGES = [
  ['PENDING_OWNER', 'Approval'],
  ['EXIT_CLEARANCE', 'Clearance'],
  ['FINAL_DOCUMENTS', 'Documents'],
  ['REVOKE_ACCESS', 'Access'],
  ['COMPLETED', 'Done'],
] as const;

const STATUS_LABEL: Record<string, string> = {
  PENDING_OWNER: 'Pending approval',
  EXIT_CLEARANCE: 'Exit clearance',
  FINAL_DOCUMENTS: 'Final documents',
  REVOKE_ACCESS: 'Revoke access',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

const CLOSED = new Set(['COMPLETED', 'REJECTED', 'CANCELLED']);

const emptyForm = {
  employeeId: '',
  lastWorkingDay: '',
  reason: '',
};

function statusTone(status: string) {
  if (status === 'COMPLETED') return 'ok';
  if (status === 'REJECTED' || status === 'CANCELLED') return 'bad';
  if (status === 'PENDING_OWNER') return 'wait';
  return 'go';
}

function inputDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function empEmail(person: any) {
  return person?.user?.email || person?.email || '';
}

function empPhone(person: any) {
  return person?.phone || '';
}

function empDept(person: any) {
  return person?.department?.name || person?.departmentName || '';
}

function empRole(person: any) {
  return person?.designation?.name || person?.designationName || '';
}

function empCode(person: any) {
  return person?.employeeCode || '';
}

function empActive(person: any) {
  if (person?.user && typeof person.user.isActive === 'boolean') return person.user.isActive;
  if (typeof person?.isActive === 'boolean') return person.isActive;
  return true;
}

function Req() {
  return <span className="req">*</span>;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function MailMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M4 8l8 6 8-6" />
    </svg>
  );
}

function PhoneMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4h3l1.5 4-2 1.5a12 12 0 0 0 4 4L16 12l4 1.5V17a2 2 0 0 1-2 2A14 14 0 0 1 5 6a2 2 0 0 1 2-2z" />
    </svg>
  );
}

function DeptMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function RoleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7" />
    </svg>
  );
}

function emailDraft(row: any) {
  const first = row?.employee?.firstName || 'there';
  const last = row?.employee?.lastName || '';
  const day = row?.lastWorkingDay ? new Date(row.lastWorkingDay).toLocaleDateString() : '—';
  return {
    subject: `Exit documentation — ${first} ${last}`.trim(),
    message: `Hi ${first},\n\nPlease find your exit documentation (relieving letter, experience letter, and final settlement details) as part of your offboarding process.\n\nLast working day: ${day}\n\nBest regards,\nHR Team — Go Staff`,
  };
}

function previewDocs(documents: any[] = []) {
  const images: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return documents.map((doc) => {
    const fileName = String(doc.url || '').split('?')[0].split('/').pop() || doc.title;
    const ext = fileName.toLowerCase().split('.').pop() || '';
    return {
      id: doc.id,
      title: doc.title,
      kind: doc.kind,
      fileName,
      previewUrl: doc.url,
      mimeType: ext === 'pdf' ? 'application/pdf' : images[ext],
    };
  });
}

export default function AdminOffboardingPage() {
  const user = getStoredUser();
  const isOwner = user?.role?.code === 'OWNER';

  const [all, setAll] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [caseOpen, setCaseOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [filterOpen, setFilterOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [docForm, setDocForm] = useState({ kind: 'FINAL_PAYSLIP', title: '', url: '' });
  const [emailForm, setEmailForm] = useState({ subject: '', message: '' });
  const details = useRef<Record<string, any>>({});

  const load = useCallback(async () => {
    const [cases, people] = await Promise.all([api('/offboarding'), api('/employees')]);
    setAll(cases);
    setEmployees(people.filter((person: any) => empActive(person)));
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  useEffect(() => {
    const message = msg || error;
    if (!message) return;
    const timer = window.setTimeout(() => {
      setMsg('');
      setError('');
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [msg, error]);

  const pending = useMemo(() => all.filter((row) => row.status === 'PENDING_OWNER'), [all]);
  const openEmployeeIds = useMemo(
    () => new Set(all.filter((row) => !CLOSED.has(row.status)).map((row) => row.employeeId || row.employee?.id)),
    [all],
  );
  const selectable = useMemo(
    () => employees.filter((person) => !openEmployeeIds.has(person.id)),
    [employees, openEmployeeIds],
  );
  const chosen = employees.find((person) => person.id === form.employeeId);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
      if (!q) return true;
      const person = row.employee || {};
      return `${person.firstName || ''} ${person.lastName || ''} ${empEmail(person)} ${empPhone(person)} ${empDept(person)} ${empRole(person)} ${empCode(person)} ${row.reason || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [all, search, statusFilter]);

  function patchList(updated: any) {
    if (!updated?.id) return;
    setAll((rows) => {
      const index = rows.findIndex((item) => item.id === updated.id);
      if (index === -1) return [updated, ...rows];
      const next = rows.slice();
      next[index] = {
        ...rows[index],
        ...updated,
        employee: updated.employee ?? rows[index].employee,
      };
      return next;
    });
  }

  function applyCase(updated: any) {
    if (!updated?.id) return;
    patchList(updated);
    setDetail((current) => {
      const base = current?.id === updated.id ? current : details.current[updated.id];
      if (!base) return current;
      const next = {
        ...base,
        ...updated,
        documents: updated.documents ?? base.documents,
        checklistItems: updated.checklistItems ?? base.checklistItems,
        employee: updated.employee ?? base.employee,
      };
      details.current[updated.id] = next;
      return current?.id === updated.id ? next : current;
    });
  }

  async function selectCase(id: string) {
    setSelectedId(id);
    setCaseOpen(true);
    setError('');
    setMsg('');
    const cached = details.current[id];
    const row = all.find((item) => item.id === id);
    if (cached) {
      setDetail(cached);
      setEmailForm(emailDraft(cached));
    } else if (row) {
      setDetail(row);
      setEmailForm(emailDraft(row));
    }
    try {
      const loaded = await api(`/offboarding/${id}`);
      details.current[id] = loaded;
      setDetail(loaded);
      setEmailForm(emailDraft(loaded));
    } catch (e: any) {
      setError(e.message);
    }
  }

  function openAdd() {
    setForm(emptyForm);
    setShowForm(true);
    setError('');
    setMsg('');
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
      details.current[created.id] = created;
      patchList(created);
      setSelectedId(created.id);
      setDetail(created);
      setEmailForm(emailDraft(created));
      setForm(emptyForm);
      setShowForm(false);
      setCaseOpen(true);
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
      const updated = await api(`/offboarding/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      applyCase(updated);
      setMsg(action === 'APPROVE' ? 'Offboarding approved' : 'Offboarding rejected');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addDocument() {
    if (!selectedId || !docForm.title.trim() || !docForm.url.trim()) {
      setError('Add a document title and link');
      return;
    }
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const updated = await api(`/offboarding/${selectedId}/documents`, {
        method: 'POST',
        body: JSON.stringify(docForm),
      });
      setDocForm({ kind: 'FINAL_PAYSLIP', title: '', url: '' });
      setMsg('Document added');
      applyCase(updated);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleChecklist(itemId: string, completed: boolean) {
    if (!selectedId) return;
    setError('');
    setDetail((current) =>
      current
        ? {
            ...current,
            checklistItems: current.checklistItems?.map((item: any) =>
              item.id === itemId ? { ...item, completed } : item,
            ),
          }
        : current,
    );
    try {
      const updated = await api(`/offboarding/${selectedId}/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed }),
      });
      applyCase(updated);
    } catch (err: any) {
      setDetail((current) =>
        current
          ? {
              ...current,
              checklistItems: current.checklistItems?.map((item: any) =>
                item.id === itemId ? { ...item, completed: !completed } : item,
              ),
            }
          : current,
      );
      setError(err.message);
    }
  }

  async function run(path: string, method: string, body?: any, success?: string) {
    if (!selectedId) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const updated = await api(`/offboarding/${selectedId}${path}`, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      const mailed = updated?.emailResult?.delivered;
      setMsg(
        success ||
          (mailed ? `Exit documents emailed to ${empEmail(updated.employee)}.` : 'Updated'),
      );
      applyCase(updated);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const stageIndex = useMemo(() => {
    if (!detail) return -1;
    if (detail.status === 'REJECTED' || detail.status === 'CANCELLED') return -1;
    return STAGES.findIndex(([status]) => status === detail.status);
  }, [detail]);

  const filtersOn = statusFilter !== 'ALL';
  const person = detail?.employee;
  const canUpload = detail && (detail.status === 'EXIT_CLEARANCE' || detail.status === 'FINAL_DOCUMENTS');
  const displayName = chosen ? `${chosen.firstName} ${chosen.lastName}` : '';

  return (
    <div className="emp-page">
      <section className="emp-board ob-board">
        <div className="emp-toolbar">
          <div>
            <h1>Offboarding</h1>
            <p className="ob-sub">
              {all.length} case{all.length === 1 ? '' : 's'}
              {isOwner && pending.length ? ` · ${pending.length} waiting for approval` : ''}
            </p>
          </div>
          <div className="emp-tools">
            <label className="emp-search">
              <SearchIcon />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search people"
                aria-label="Search offboarding cases"
              />
            </label>
            <button
              className={`emp-filter${filtersOn ? ' on' : ''}`}
              type="button"
              onClick={() => setFilterOpen((open) => !open)}
            >
              <FilterIcon />
              Filter
            </button>
            <button className="emp-add" type="button" onClick={openAdd}>
              <span aria-hidden>+</span> Start offboarding
            </button>
          </div>
        </div>

        {isOwner && pending.length > 0 && statusFilter !== 'PENDING_OWNER' && (
          <button className="ob-alert" type="button" onClick={() => { setStatusFilter('PENDING_OWNER'); setFilterOpen(true); }}>
            {pending.length} {pending.length === 1 ? 'person is' : 'people are'} waiting for your approval
          </button>
        )}

        {filterOpen && (
          <div className="emp-filters">
            <label>
              Status
              <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="ALL">All</option>
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            {filtersOn && (
              <button className="btn secondary" type="button" onClick={() => setStatusFilter('ALL')}>
                Clear
              </button>
            )}
          </div>
        )}

        <div className="emp-table-wrap">
          <table className="emp-table">
            <colgroup>
              <col className="sl" />
              <col className="name" />
              <col className="email" />
              <col className="phone" />
              <col className="role" />
              <col className="joined" />
              <col className="status" />
              <col className="action" />
            </colgroup>
            <thead>
              <tr>
                <th>SL</th>
                <th>Name</th>
                <th>Email</th>
                <th>Mobile</th>
                <th>Designation</th>
                <th>Last day</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td className="emp-empty" colSpan={8}>No offboarding cases match this view.</td>
                </tr>
              )}
              {visible.map((row, index) => {
                const member = row.employee || {};
                const name = `${member.firstName || ''} ${member.lastName || ''}`.trim();
                return (
                  <tr key={row.id} className={selectedId === row.id && caseOpen ? 'selected' : undefined}>
                    <td>{String(index + 1).padStart(2, '0')}</td>
                    <td title={name}>{name || '—'}</td>
                    <td title={empEmail(member)}>{empEmail(member) || '—'}</td>
                    <td title={empPhone(member)}>{empPhone(member) || '—'}</td>
                    <td title={empRole(member)}>{empRole(member) || '—'}</td>
                    <td>{inputDate(row.lastWorkingDay) || '—'}</td>
                    <td>
                      <span className={`ob-status ${statusTone(row.status)}`}>{STATUS_LABEL[row.status] || row.status}</span>
                    </td>
                    <td>
                      <div className="emp-actions">
                        <button type="button" title="Open" aria-label="Open offboarding case" onClick={() => selectCase(row.id)}>
                          <EyeIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {showForm && (
        <div className="hr-modal" role="dialog" aria-modal="true" aria-label="Start offboarding" onMouseDown={() => setShowForm(false)}>
          <div className="hr-modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="hr-edit-top">
              <div className="hr-edit-head">
                <div>
                  <h2>Start offboarding</h2>
                  <p>Submitted for owner approval before exit clearance begins.</p>
                </div>
                <div className="hr-edit-actions">
                  <button className="btn" type="submit" form="offboarding-editor" disabled={busy || !selectable.length}>
                    {busy ? 'Saving…' : 'Submit for approval'}
                  </button>
                  <button className="btn secondary" type="button" onClick={() => setShowForm(false)}>Close</button>
                </div>
              </div>
            </div>
            <form id="offboarding-editor" onSubmit={createCase} className="hr-edit-shell">
              <aside className="hr-profile">
                <div className="hr-profile-photo">
                  <span>{`${(chosen?.firstName || '').charAt(0)}${(chosen?.lastName || '').charAt(0)}`.trim() || 'E'}</span>
                </div>
                <strong>{displayName || 'Select an employee'}</strong>
                {chosen && empCode(chosen) && <span className="hr-profile-code">{empCode(chosen)}</span>}
                <span className="hr-badge">Offboarding</span>
                <ul className="hr-profile-meta">
                  <li><MailMark /><div><small>Work email</small><b>{empEmail(chosen) || '—'}</b></div></li>
                  <li><PhoneMark /><div><small>Phone</small><b>{empPhone(chosen) || '—'}</b></div></li>
                  <li><DeptMark /><div><small>Department</small><b>{empDept(chosen) || '—'}</b></div></li>
                  <li><RoleMark /><div><small>Designation</small><b>{empRole(chosen) || '—'}</b></div></li>
                </ul>
                <p className="muted" style={{ margin: '14px 0 0', fontSize: '0.75rem' }}>
                  The login stays active until access is revoked at the end of this process.
                </p>
              </aside>
              <div className="hr-edit-main">
                <h3 className="hr-section">Exit details</h3>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label className="label">Employee <Req /></label>
                  <select
                    className="select"
                    required
                    value={form.employeeId}
                    onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  >
                    <option value="">Select employee</option>
                    {selectable.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.firstName} {person.lastName}{empCode(person) ? ` (${empCode(person)})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Last working day <Req /></label>
                  <input
                    className="input"
                    type="date"
                    required
                    value={form.lastWorkingDay}
                    onChange={(e) => setForm({ ...form, lastWorkingDay: e.target.value })}
                  />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label className="label">Reason <Req /></label>
                  <textarea
                    className="textarea"
                    required
                    rows={4}
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  />
                </div>
                {!selectable.length && (
                  <p className="muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
                    Every active employee already has an open offboarding case.
                  </p>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {caseOpen && detail && (
        <div className="hr-modal" role="dialog" aria-modal="true" aria-label="Offboarding case" onMouseDown={() => setCaseOpen(false)}>
          <div className="hr-modal-card ob-case" onMouseDown={(event) => event.stopPropagation()}>
            <div className="hr-edit-top">
              <div className="hr-edit-head">
                <div>
                  <h2>{person?.firstName} {person?.lastName}</h2>
                  <p>
                    {[empEmail(person), empRole(person), empDept(person)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="hr-edit-actions">
                  {isOwner && detail.status === 'PENDING_OWNER' && (
                    <>
                      <button className="btn" type="button" disabled={busy} onClick={() => review(detail.id, 'APPROVE')}>Approve</button>
                      <button className="btn danger" type="button" disabled={busy} onClick={() => review(detail.id, 'REJECT')}>Reject</button>
                    </>
                  )}
                  <button className="btn secondary" type="button" onClick={() => setCaseOpen(false)}>Close</button>
                </div>
              </div>
            </div>

            <div className="ob-case-body">
              <div className="ob-person">
                <span className={`ob-status ${statusTone(detail.status)}`}>{STATUS_LABEL[detail.status] || detail.status}</span>
                <span>{empPhone(person) || 'No phone'}</span>
                <span>Last day {inputDate(detail.lastWorkingDay) || '—'}</span>
                {empCode(person) && <span>{empCode(person)}</span>}
              </div>

              {stageIndex >= 0 && (
                <ol className="ob-steps">
                  {STAGES.map(([status, label], index) => (
                    <li key={status} className={index < stageIndex ? 'done' : index === stageIndex ? 'now' : ''}>
                      <span>{index + 1}</span>
                      {label}
                    </li>
                  ))}
                </ol>
              )}

              <dl className="ob-summary">
                {[
                  ['Department', empDept(person)],
                  ['Designation', empRole(person)],
                  ['Reason', detail.reason],
                  ['Requested', detail.requestedBy?.email],
                ].filter(([, value]) => value).map(([label, value]) => (
                  <div key={String(label)}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>

              {detail.status === 'PENDING_OWNER' && (
                <p className="muted">Waiting for owner approval before exit clearance can start.</p>
              )}

              {detail.status === 'EXIT_CLEARANCE' && (
                <section className="ob-panel">
                  <h3>Exit clearance</h3>
                  <div className="ob-checks">
                    {detail.checklistItems?.map((item: any) => (
                      <label key={item.id}>
                        <input type="checkbox" checked={item.completed} onChange={(e) => toggleChecklist(item.id, e.target.checked)} />
                        {item.title}
                      </label>
                    ))}
                  </div>
                  <p className="muted">Complete every item before moving on to final documents.</p>
                  <button className="btn" disabled={busy} onClick={() => run('/advance', 'PATCH', undefined, 'Moved to final documents')}>
                    Advance to final documents
                  </button>
                </section>
              )}

              {(canUpload || detail.documents?.length > 0) && (
                <section className="ob-panel">
                  <h3>Final documents</h3>
                  <p className="muted">Relieving letter, experience letter, and final settlement stay with this case.</p>
                  <DocumentPreview documents={previewDocs(detail.documents || [])} />
                  {canUpload && (
                    <div className="ob-upload">
                      <div className="hr-doc-fields">
                        <label>
                          Document type
                          <select className="input" value={docForm.kind} onChange={(e) => setDocForm({ ...docForm, kind: e.target.value })}>
                            {DOC_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </label>
                        <label>
                          Document title
                          <input className="input" placeholder="Relieving letter" value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} />
                        </label>
                      </div>
                      <label>
                        Document link
                        <input className="input" placeholder="https://" value={docForm.url} onChange={(e) => setDocForm({ ...docForm, url: e.target.value })} />
                      </label>
                      <button className="btn secondary" disabled={busy || !docForm.title.trim() || !docForm.url.trim()} onClick={addDocument}>
                        {busy ? 'Saving…' : 'Add document'}
                      </button>
                    </div>
                  )}
                  {detail.status === 'FINAL_DOCUMENTS' && (
                    <>
                      <div className="field">
                        <label className="label">Subject</label>
                        <input className="input" value={emailForm.subject} onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="label">Message</label>
                        <textarea className="textarea" rows={6} value={emailForm.message} onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })} />
                      </div>
                      <div className="ob-actions">
                        <button className="btn" disabled={busy} onClick={() => run('/send-final-email', 'POST', emailForm)}>Email employee</button>
                        <button className="btn secondary" disabled={busy} onClick={() => run('/advance', 'PATCH', undefined, 'Moved to revoke access')}>Advance to revoke access</button>
                      </div>
                    </>
                  )}
                </section>
              )}

              {detail.status === 'REVOKE_ACCESS' && (
                <section className="ob-panel">
                  <h3>Revoke access</h3>
                  <p className="muted">This deactivates the employee login and records the last working day.</p>
                  <button className="btn danger" disabled={busy} onClick={() => run('/revoke-access', 'POST', undefined, 'Access revoked and offboarding completed')}>
                    Revoke access and complete
                  </button>
                </section>
              )}

              {detail.status === 'COMPLETED' && (
                <p className="muted">
                  Offboarding completed
                  {detail.accessRevokedAt ? ` · access revoked ${new Date(detail.accessRevokedAt).toLocaleString()}` : ''}.
                </p>
              )}

              {(detail.status === 'REJECTED' || detail.status === 'CANCELLED') && (
                <p className="muted">This case is closed.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {(msg || error) && (
        <div className="emp-toasts" role="status" aria-live="polite">
          <div className={error ? 'emp-toast bad' : 'emp-toast ok'}>{error || msg}</div>
        </div>
      )}
    </div>
  );
}
