'use client';

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { DocumentPreview } from '@/components/document-preview';
import { CatalogHint } from '@/components/catalog-hint';

const DOC_KINDS = [
  ['ID_PROOF', 'ID proof'],
  ['ADDRESS', 'Address proof'],
  ['BANK', 'Bank proof'],
  ['EDUCATION', 'Education'],
  ['PREVIOUS_PAYSLIP', 'Previous payslip'],
  ['OFFER_LETTER', 'Offer letter'],
  ['PHOTO', 'Photo'],
  ['OTHER', 'Other'],
] as const;

const GENDERS = [
  ['MALE', 'Male'],
  ['FEMALE', 'Female'],
  ['OTHER', 'Other'],
] as const;

const BLOOD_GROUPS = [
  ['A_POS', 'A+'],
  ['A_NEG', 'A−'],
  ['B_POS', 'B+'],
  ['B_NEG', 'B−'],
  ['AB_POS', 'AB+'],
  ['AB_NEG', 'AB−'],
  ['O_POS', 'O+'],
  ['O_NEG', 'O−'],
] as const;

const MARITAL = [
  ['SINGLE', 'Single'],
  ['MARRIED', 'Married'],
  ['DIVORCED', 'Divorced'],
  ['WIDOWED', 'Widowed'],
] as const;

const EMPLOYMENT = [
  ['FULL_TIME', 'Full time'],
  ['PART_TIME', 'Part time'],
  ['CONTRACT', 'Contract'],
  ['INTERN', 'Intern'],
] as const;

const STAGES = [
  ['PENDING_OWNER', 'Approval'],
  ['OFFER_LETTER', 'Offer'],
  ['DOCUMENTS', 'Documents'],
  ['CREATE_ACCOUNT', 'Account'],
  ['IT_HR_CHECKLIST', 'Checklist'],
  ['COMPLETED', 'Done'],
] as const;

const STATUS_LABEL: Record<string, string> = {
  PENDING_OWNER: 'Pending approval',
  OFFER_LETTER: 'Offer letter',
  DOCUMENTS: 'Documents',
  CREATE_ACCOUNT: 'Create account',
  IT_HR_CHECKLIST: 'Checklist',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

const emptyForm = {
  firstName: '',
  lastName: '',
  gender: '',
  dateOfBirth: '',
  bloodGroup: '',
  maritalStatus: '',
  fatherOrSpouseName: '',
  email: '',
  personalEmail: '',
  phone: '',
  alternatePhone: '',
  currentAddress: '',
  city: '',
  state: '',
  pincode: '',
  permanentAddress: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelation: '',
  joiningDate: '',
  employmentType: 'FULL_TIME',
  workLocation: '',
  departmentId: '',
  designationId: '',
  roleCode: 'EMPLOYEE',
  aadhaarNumber: '',
  panNumber: '',
  bankName: '',
  bankAccountNumber: '',
  bankIfsc: '',
  applicationId: '',
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

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 16V6M8 9.5 12 5.5 16 9.5" />
      <path d="M5 16.5V19h14v-2.5" />
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

function offerDraft(row: { firstName: string; lastName: string; joiningDate: string; offerSubject?: string; offerBody?: string }) {
  return {
    subject: row.offerSubject || `Offer of employment — ${row.firstName} ${row.lastName}`,
    message:
      row.offerBody ||
      `Hi ${row.firstName},\n\nWe are pleased to offer you a position at Go Staff, with a proposed joining date of ${new Date(row.joiningDate).toLocaleDateString()}.\n\nOur HR team will follow up with documentation and next steps.\n\nCongratulations!\n\nBest regards,\nHR Team — Go Staff`,
  };
}

function OnboardingPageInner() {
  const searchParams = useSearchParams();
  const user = getStoredUser();
  const isOwner = user?.role?.code === 'OWNER';

  const [all, setAll] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [caseOpen, setCaseOpen] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);
  const [designations, setDesignations] = useState<any[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [filterOpen, setFilterOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formTab, setFormTab] = useState<'personal' | 'employee' | 'bank'>('personal');
  const [form, setForm] = useState(emptyForm);
  const [sameAddress, setSameAddress] = useState(true);
  const [nextCode, setNextCode] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [verifyFiles, setVerifyFiles] = useState<[File | null, File | null]>([null, null]);
  const [verifyKinds, setVerifyKinds] = useState<[string, string]>(['ID_PROOF', 'ADDRESS']);
  const [verifyTitles, setVerifyTitles] = useState<[string, string]>(['', '']);
  const [verifyKey, setVerifyKey] = useState(0);
  const [offerForm, setOfferForm] = useState({ subject: '', message: '' });
  const [docForm, setDocForm] = useState({ kind: 'ID_PROOF', title: '' });
  const [docFile, setDocFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const details = useRef<Record<string, any>>({});
  const prefilled = useRef(false);

  const load = useCallback(async () => {
    const [cases, deps, desigs] = await Promise.all([
      api('/onboarding'),
      api('/departments'),
      api('/designations'),
    ]);
    setAll(cases);
    setDepartments(deps);
    setDesignations(desigs);
    setCatalogReady(true);
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

  useEffect(() => {
    if (!showForm) return;
    let active = true;
    api<{ employeeCode: string }>('/employees/next-code')
      .then((row) => {
        if (active && row?.employeeCode) setNextCode(row.employeeCode);
      })
      .catch(() => {
        if (active) setNextCode('');
      });
    return () => {
      active = false;
    };
  }, [showForm]);

  useEffect(() => {
    if (prefilled.current) return;
    const first = searchParams.get('firstName') || '';
    const last = searchParams.get('lastName') || '';
    const email = searchParams.get('email') || '';
    const phone = searchParams.get('phone') || '';
    const applicationId = searchParams.get('applicationId') || '';
    if (!(first || last || email || applicationId)) return;
    prefilled.current = true;
    setForm((current) => ({
      ...current,
      firstName: first || current.firstName,
      lastName: last || current.lastName,
      email: email || current.email,
      phone: phone || current.phone,
      applicationId: applicationId || current.applicationId,
      joiningDate: current.joiningDate || new Date().toISOString().slice(0, 10),
    }));
    setFormTab('personal');
    setShowForm(true);
  }, [searchParams]);

  const pending = useMemo(() => all.filter((row) => row.status === 'PENDING_OWNER'), [all]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
      if (!q) return true;
      const dept = departments.find((item) => item.id === row.departmentId)?.name || '';
      const role = designations.find((item) => item.id === row.designationId)?.name || '';
      return `${row.firstName} ${row.lastName} ${row.email} ${row.phone || ''} ${dept} ${role}`
        .toLowerCase()
        .includes(q);
    });
  }, [all, search, statusFilter, departments, designations]);

  function deptName(id?: string | null, embedded?: { name?: string } | null) {
    return embedded?.name || departments.find((item) => item.id === id)?.name || '';
  }

  function desigName(id?: string | null, embedded?: { name?: string } | null) {
    return embedded?.name || designations.find((item) => item.id === id)?.name || '';
  }

  function patchList(updated: any) {
    if (!updated?.id) return;
    setAll((rows) => {
      const row = {
        id: updated.id,
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        phone: updated.phone,
        joiningDate: updated.joiningDate,
        status: updated.status,
        employeeCode: updated.employeeCode ?? undefined,
        roleCode: updated.roleCode,
        departmentId: updated.departmentId,
        designationId: updated.designationId,
        createdAt: updated.createdAt,
      };
      const index = rows.findIndex((item) => item.id === updated.id);
      if (index === -1) return [row, ...rows];
      const next = rows.slice();
      next[index] = { ...rows[index], ...row };
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
        profile: updated.profile ?? base.profile,
      };
      details.current[updated.id] = next;
      return current?.id === updated.id ? next : current;
    });
    if (selectedId === updated.id && (updated.offerSubject || updated.offerBody)) {
      setOfferForm({ subject: updated.offerSubject, message: updated.offerBody });
    }
  }

  async function selectCase(id: string) {
    setSelectedId(id);
    setCaseOpen(true);
    setError('');
    setMsg('');
    const cached = details.current[id];
    if (cached) {
      setDetail(cached);
      setOfferForm(offerDraft(cached));
      return;
    }
    const row = all.find((item) => item.id === id);
    if (row) setDetail(row);
    try {
      const loaded = await api(`/onboarding/${id}`);
      details.current[id] = loaded;
      setDetail(loaded);
      setOfferForm(offerDraft(loaded));
    } catch (e: any) {
      setError(e.message);
    }
  }

  function openAdd() {
    setForm(emptyForm);
    setFormTab('personal');
    setSameAddress(true);
    setPhotoFile(null);
    setPhotoPreview('');
    setVerifyFiles([null, null]);
    setVerifyKinds(['ID_PROOF', 'ADDRESS']);
    setVerifyTitles(['', '']);
    setVerifyKey((n) => n + 1);
    setShowForm(true);
    setError('');
    setMsg('');
  }

  function closeForm() {
    setShowForm(false);
    if (photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
    setPhotoPreview('');
    setPhotoFile(null);
  }

  function missingSection(): 'personal' | 'employee' | 'bank' | null {
    const personalMissing =
      !form.firstName.trim() ||
      !form.lastName.trim() ||
      !form.email.trim() ||
      !form.phone.trim() ||
      !form.gender ||
      !form.dateOfBirth ||
      !form.currentAddress.trim() ||
      !form.city.trim() ||
      !form.state.trim() ||
      !form.pincode.trim() ||
      !form.emergencyContactName.trim() ||
      !form.emergencyContactPhone.trim();
    if (personalMissing) return 'personal';
    if (!form.joiningDate || !form.departmentId || !form.designationId) return 'employee';
    if (!form.aadhaarNumber.trim() || !form.panNumber.trim()) return 'bank';
    return null;
  }

  async function createCase(e: FormEvent) {
    e.preventDefault();
    const missing = missingSection();
    if (missing) {
      setFormTab(missing);
      setError(`Complete the required fields in ${missing === 'bank' ? 'Bank details' : missing === 'employee' ? 'Employee' : 'Personal'}.`);
      return;
    }
    if (!verifyFiles[0] || !verifyFiles[1]) {
      setFormTab('employee');
      setError('Upload two verification documents');
      return;
    }
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const body = new FormData();
      const payload: Record<string, string> = {
        ...form,
        permanentAddress: sameAddress ? form.currentAddress : form.permanentAddress,
      };
      Object.entries(payload).forEach(([key, value]) => {
        if (value) body.append(key, value);
      });
      body.append('document1', verifyFiles[0]);
      body.append('document1Kind', verifyKinds[0]);
      body.append('document1Title', verifyTitles[0] || verifyFiles[0].name);
      body.append('document2', verifyFiles[1]);
      body.append('document2Kind', verifyKinds[1]);
      body.append('document2Title', verifyTitles[1] || verifyFiles[1].name);
      if (photoFile) body.append('photo', photoFile);
      const created = await api('/onboarding', { method: 'POST', formData: body });
      setMsg('Onboarding case submitted for owner approval');
      const opened = { ...created, documents: created.documents || [], checklistItems: created.checklistItems || [] };
      details.current[opened.id] = opened;
      patchList(opened);
      setSelectedId(opened.id);
      setDetail(opened);
      setOfferForm(offerDraft(opened));
      setForm(emptyForm);
      setSameAddress(true);
      setVerifyFiles([null, null]);
      setVerifyTitles(['', '']);
      setVerifyKey((n) => n + 1);
      setShowForm(false);
      setCaseOpen(true);
      if (photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
      setPhotoPreview('');
      setPhotoFile(null);
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
      const updated = await api(`/onboarding/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      applyCase(updated);
      setMsg(action === 'APPROVE' ? 'Onboarding approved' : 'Onboarding rejected');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadDocument() {
    if (!selectedId || !docFile) {
      setError('Choose a file to upload');
      return;
    }
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const body = new FormData();
      body.append('file', docFile);
      body.append('kind', docForm.kind);
      body.append('title', docForm.title || docFile.name);
      const doc = await api(`/onboarding/${selectedId}/documents/file`, { method: 'POST', formData: body });
      setDocFile(null);
      setFileKey((n) => n + 1);
      setDocForm({ kind: 'ID_PROOF', title: '' });
      setMsg('Document stored');
      setDetail((current) => {
        if (!current) return current;
        const next = { ...current, documents: [doc, ...(current.documents || [])] };
        details.current[current.id] = next;
        return next;
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function completeOnboarding() {
    if (!selectedId) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const updated = await api<any>(`/onboarding/${selectedId}/advance`, { method: 'PATCH' });
      const mailed = updated?.emailResult?.delivered;
      setMsg(mailed ? `Onboarding complete. Login details emailed to ${updated.email}.` : 'Onboarding complete.');
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
      await api(`/onboarding/${selectedId}/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed }),
      });
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

  async function run(path: string, method: string, body?: any) {
    if (!selectedId) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const updated = await api(`/onboarding/${selectedId}${path}`, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      setMsg('Updated');
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
  const displayName = `${form.firstName} ${form.lastName}`.trim();
  const canUpload =
    detail &&
    detail.status !== 'REJECTED' &&
    detail.status !== 'CANCELLED' &&
    detail.status !== 'PENDING_OWNER';

  return (
    <div className="emp-page">
      <section className="emp-board ob-board">
        <div className="emp-toolbar">
          <div>
            <h1>Onboarding</h1>
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
                aria-label="Search onboarding cases"
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
              <span aria-hidden>+</span> Start onboarding
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
                <th>Joining</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td className="emp-empty" colSpan={8}>No onboarding cases match this view.</td>
                </tr>
              )}
              {visible.map((row, index) => (
                <tr key={row.id} className={selectedId === row.id && caseOpen ? 'selected' : undefined}>
                  <td>{String(index + 1).padStart(2, '0')}</td>
                  <td title={`${row.firstName} ${row.lastName}`}>{row.firstName} {row.lastName}</td>
                  <td title={row.email}>{row.email}</td>
                  <td title={row.phone || ''}>{row.phone || '—'}</td>
                  <td title={desigName(row.designationId)}>{desigName(row.designationId) || '—'}</td>
                  <td>{inputDate(row.joiningDate) || '—'}</td>
                  <td>
                    <span className={`ob-status ${statusTone(row.status)}`}>{STATUS_LABEL[row.status] || row.status}</span>
                  </td>
                  <td>
                    <div className="emp-actions">
                      <button type="button" title="Open" aria-label="Open onboarding case" onClick={() => selectCase(row.id)}>
                        <EyeIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showForm && (
        <div className="hr-modal" role="dialog" aria-modal="true" aria-label="Start onboarding" onMouseDown={closeForm}>
          <div className="hr-modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="hr-edit-top">
              <div className="hr-edit-head">
                <div>
                  <h2>Start onboarding</h2>
                  {nextCode && <p>{nextCode} · assigned when the account is created</p>}
                </div>
                <div className="hr-edit-actions">
                  <button className="btn" type="submit" form="onboarding-editor" disabled={busy}>
                    {busy ? 'Saving…' : 'Submit for approval'}
                  </button>
                  <button className="btn secondary" type="button" onClick={closeForm}>Close</button>
                </div>
              </div>
              <div className="hr-edit-tabs" role="tablist">
                {([
                  ['personal', 'Personal'],
                  ['employee', 'Employee'],
                  ['bank', 'Bank details'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={formTab === id}
                    className={formTab === id ? 'on' : ''}
                    onClick={() => setFormTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <CatalogHint departments={departments} designations={designations} ready={catalogReady} />
            <form id="onboarding-editor" onSubmit={createCase} className="hr-edit-shell">
              <aside className="hr-profile">
                <div className="hr-profile-photo">
                  {photoPreview ? <img src={photoPreview} alt="" /> : <span>{`${form.firstName.charAt(0)}${form.lastName.charAt(0)}`.trim() || 'P'}</span>}
                </div>
                <strong>{displayName || 'New hire'}</strong>
                {nextCode && <span className="hr-profile-code">{nextCode}</span>}
                <span className="hr-badge">Onboarding</span>
                <label className="hr-change-photo">
                  Change photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setPhotoFile(file);
                      if (!file) return;
                      setPhotoPreview((current) => {
                        if (current.startsWith('blob:')) URL.revokeObjectURL(current);
                        return URL.createObjectURL(file);
                      });
                    }}
                  />
                </label>
                <ul className="hr-profile-meta">
                  <li><MailMark /><div><small>Work email</small><b>{form.email || '—'}</b></div></li>
                  <li><PhoneMark /><div><small>Phone</small><b>{form.phone || '—'}</b></div></li>
                  <li><MailMark /><div><small>Personal email</small><b>{form.personalEmail || '—'}</b></div></li>
                  <li><PhoneMark /><div><small>Alternate phone</small><b>{form.alternatePhone || '—'}</b></div></li>
                </ul>
                <p className="muted" style={{ margin: '14px 0 0', fontSize: '0.75rem' }}>
                  This uses the same profile as Add employee. The portal login is emailed after the checklist is complete.
                </p>
              </aside>
              <div className="hr-edit-main">
                {formTab === 'personal' && (
                  <>
                    <h3 className="hr-section">Personal information</h3>
                    <div className="field">
                      <label className="label">First name <Req /></label>
                      <input className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">Last name <Req /></label>
                      <input className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">Gender <Req /></label>
                      <select className="select" required value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                        <option value="">Select gender</option>
                        {GENDERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label">Date of birth <Req /></label>
                      <input className="input" type="date" required value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">Blood group</label>
                      <select className="select" value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}>
                        <option value="">Optional</option>
                        {BLOOD_GROUPS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label">Marital status</label>
                      <select className="select" value={form.maritalStatus} onChange={(e) => setForm({ ...form, maritalStatus: e.target.value })}>
                        <option value="">Optional</option>
                        {MARITAL.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label">Father / spouse name</label>
                      <input className="input" value={form.fatherOrSpouseName} onChange={(e) => setForm({ ...form, fatherOrSpouseName: e.target.value })} />
                    </div>
                    <h3 className="hr-section">Contact information</h3>
                    <div className="field">
                      <label className="label">Work email <Req /></label>
                      <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">Personal email</label>
                      <input className="input" type="email" value={form.personalEmail} onChange={(e) => setForm({ ...form, personalEmail: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">Phone <Req /></label>
                      <input className="input" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">Alternate phone</label>
                      <input className="input" value={form.alternatePhone} onChange={(e) => setForm({ ...form, alternatePhone: e.target.value })} />
                    </div>
                    <h3 className="hr-section">Address</h3>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <label className="label">Current address <Req /></label>
                      <input className="input" required value={form.currentAddress} onChange={(e) => setForm({ ...form, currentAddress: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">City <Req /></label>
                      <input className="input" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">State <Req /></label>
                      <input className="input" required value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">PIN code <Req /></label>
                      <input className="input" required inputMode="numeric" pattern="[0-9]{6}" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="checkbox" checked={sameAddress} onChange={(e) => setSameAddress(e.target.checked)} />
                        Permanent address is the same as the current address
                      </label>
                    </div>
                    {!sameAddress && (
                      <div className="field" style={{ gridColumn: '1 / -1' }}>
                        <label className="label">Permanent address</label>
                        <input className="input" required value={form.permanentAddress} onChange={(e) => setForm({ ...form, permanentAddress: e.target.value })} />
                      </div>
                    )}
                    <h3 className="hr-section">Emergency contact</h3>
                    <div className="field">
                      <label className="label">Emergency contact name <Req /></label>
                      <input className="input" required value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">Emergency contact phone <Req /></label>
                      <input className="input" required value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">Relation</label>
                      <input className="input" placeholder="Spouse, parent, sibling" value={form.emergencyContactRelation} onChange={(e) => setForm({ ...form, emergencyContactRelation: e.target.value })} />
                    </div>
                  </>
                )}

                {formTab === 'employee' && (
                  <>
                    <h3 className="hr-section">Employment</h3>
                    <div className="field">
                      <label className="label">Employee code</label>
                      <input className="input" value={nextCode || 'Assigned when the account is created'} readOnly />
                    </div>
                    <div className="field">
                      <label className="label">Joining date <Req /></label>
                      <input className="input" type="date" required value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">Employment type <Req /></label>
                      <select className="select" required value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })}>
                        {EMPLOYMENT.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label">Work location</label>
                      <input className="input" value={form.workLocation} onChange={(e) => setForm({ ...form, workLocation: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">Access role</label>
                      <select className="select" value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value })}>
                        <option value="EMPLOYEE">Employee</option>
                        <option value="TEAM_LEADER">Team leader</option>
                        <option value="DEPT_MANAGER">Department manager</option>
                        <option value="HR">HR</option>
                        <option value="MANAGEMENT">Management</option>
                      </select>
                    </div>
                    <div className="field">
                      <label className="label">Department <Req /></label>
                      <select className="select" required value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                        <option value="">Select department</option>
                        {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label">Designation <Req /></label>
                      <select className="select" required value={form.designationId} onChange={(e) => setForm({ ...form, designationId: e.target.value })}>
                        <option value="">Select designation</option>
                        {designations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </div>
                    <h3 className="hr-section">Verification documents</h3>
                    <p className="muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
                      Upload two documents, such as an ID proof and an address proof. PDF, image, or Word, up to 15 MB each.
                    </p>
                    {[0, 1].map((index) => (
                      <div key={`${verifyKey}-${index}`} className="field" style={{ display: 'grid', gap: 8 }}>
                        <label className="label">Document {index + 1}</label>
                        <select
                          className="select"
                          required
                          value={verifyKinds[index]}
                          onChange={(e) => {
                            const next = [...verifyKinds] as [string, string];
                            next[index] = e.target.value;
                            setVerifyKinds(next);
                          }}
                        >
                          {DOC_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <input
                          className="input"
                          placeholder="Title (optional)"
                          value={verifyTitles[index]}
                          onChange={(e) => {
                            const next = [...verifyTitles] as [string, string];
                            next[index] = e.target.value;
                            setVerifyTitles(next);
                          }}
                        />
                        <input
                          className="input"
                          type="file"
                          required
                          accept="application/pdf,image/*,.doc,.docx"
                          onChange={(e) => {
                            const next = [...verifyFiles] as [File | null, File | null];
                            next[index] = e.target.files?.[0] || null;
                            setVerifyFiles(next);
                          }}
                        />
                      </div>
                    ))}
                  </>
                )}

                {formTab === 'bank' && (
                  <>
                    <h3 className="hr-section">Identity and bank</h3>
                    <div className="field">
                      <label className="label">Aadhaar number <Req /></label>
                      <input className="input" required inputMode="numeric" value={form.aadhaarNumber} onChange={(e) => setForm({ ...form, aadhaarNumber: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">PAN <Req /></label>
                      <input className="input" required value={form.panNumber} onChange={(e) => setForm({ ...form, panNumber: e.target.value.toUpperCase() })} />
                    </div>
                    <div className="field">
                      <label className="label">Bank name</label>
                      <input className="input" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">Account number</label>
                      <input className="input" value={form.bankAccountNumber} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">IFSC</label>
                      <input className="input" value={form.bankIfsc} onChange={(e) => setForm({ ...form, bankIfsc: e.target.value.toUpperCase() })} />
                    </div>
                    {form.applicationId && (
                      <p className="muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
                        Linked application: {form.applicationId}
                      </p>
                    )}
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {caseOpen && detail && (
        <div className="hr-modal" role="dialog" aria-modal="true" aria-label="Onboarding case" onMouseDown={() => setCaseOpen(false)}>
          <div className="hr-modal-card ob-case" onMouseDown={(event) => event.stopPropagation()}>
            <div className="hr-edit-top">
              <div className="hr-edit-head">
                <div>
                  <h2>{detail.firstName} {detail.lastName}</h2>
                  <p>
                    {[detail.email, desigName(detail.designationId, detail.designation), deptName(detail.departmentId, detail.department)]
                      .filter(Boolean)
                      .join(' · ')}
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
                <span>{detail.phone || 'No phone'}</span>
                <span>Joining {inputDate(detail.joiningDate) || '—'}</span>
                {(detail.employee?.employeeCode || detail.employeeCode) && (
                  <span>{detail.employee?.employeeCode || detail.employeeCode}</span>
                )}
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

              {detail.profile && typeof detail.profile === 'object' && (
                <dl className="ob-summary">
                  {[
                    ['Employment', EMPLOYMENT.find(([value]) => value === detail.profile.employmentType)?.[1]],
                    ['Work location', detail.profile.workLocation],
                    ['City', [detail.profile.city, detail.profile.state].filter(Boolean).join(', ')],
                    ['Emergency', detail.profile.emergencyContactName],
                  ].filter(([, value]) => value).map(([label, value]) => (
                    <div key={String(label)}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {detail.status === 'OFFER_LETTER' && (
                <section className="ob-panel">
                  <h3>Offer letter</h3>
                  <div className="field">
                    <label className="label">Subject</label>
                    <input className="input" value={offerForm.subject} onChange={(e) => setOfferForm({ ...offerForm, subject: e.target.value })} />
                  </div>
                  <div className="field">
                    <label className="label">Message</label>
                    <textarea className="textarea" rows={6} value={offerForm.message} onChange={(e) => setOfferForm({ ...offerForm, message: e.target.value })} />
                  </div>
                  <div className="ob-actions">
                    <button className="btn" disabled={busy} onClick={() => run('/send-offer', 'POST', offerForm)}>Send offer email</button>
                    <button className="btn secondary" disabled={busy || !detail.offerSentAt} onClick={() => run('/offer-accepted', 'PATCH')}>Mark offer accepted</button>
                  </div>
                  {detail.offerSentAt && <p className="muted">Sent {new Date(detail.offerSentAt).toLocaleString()}</p>}
                </section>
              )}

              {(canUpload || detail.documents?.length > 0) && (
              <section className="ob-panel">
                <h3>Documents</h3>
                <p className="muted">Files stay with this person after they become an employee.</p>
                <DocumentPreview documents={detail.documents || []} />
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
                        <input className="input" placeholder="Optional" value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} />
                      </label>
                    </div>
                    <label className="hr-doc-upload">
                      <input key={fileKey} className="hr-doc-file" type="file" accept="application/pdf,image/*,.doc,.docx" onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
                      <UploadIcon />
                      <span>
                        <strong>{docFile ? docFile.name : 'Upload document'}</strong>
                        <small>PDF, images, DOC, DOCX up to 15 MB</small>
                      </span>
                    </label>
                    <button className="btn secondary" disabled={busy || !docFile} onClick={uploadDocument}>
                      {busy ? 'Uploading…' : 'Upload document'}
                    </button>
                  </div>
                )}
                {detail.status === 'DOCUMENTS' && (
                  <button className="btn" disabled={busy} onClick={() => run('/advance', 'PATCH')}>Advance to create account</button>
                )}
              </section>
              )}

              {detail.status === 'CREATE_ACCOUNT' && (
                <section className="ob-panel">
                  <h3>Create employee account</h3>
                  <p className="muted">
                    This adds them to Employees with the profile collected here. The next employee code is assigned automatically. Login details are emailed when onboarding is marked complete.
                  </p>
                  <button className="btn" disabled={busy} onClick={() => run('/create-account', 'POST')}>Create portal account</button>
                </section>
              )}

              {detail.status === 'IT_HR_CHECKLIST' && (
                <section className="ob-panel">
                  <h3>IT / HR checklist</h3>
                  <div className="ob-checks">
                    {detail.checklistItems?.map((item: any) => (
                      <label key={item.id}>
                        <input type="checkbox" checked={item.completed} onChange={(e) => toggleChecklist(item.id, e.target.checked)} />
                        {item.title}
                      </label>
                    ))}
                  </div>
                  <p className="muted">Completing onboarding emails the employee their ID, login email, and a temporary password.</p>
                  <button className="btn" disabled={busy} onClick={() => completeOnboarding()}>Complete and email login</button>
                </section>
              )}

              {detail.status === 'COMPLETED' && (
                <p className="muted">
                  Onboarding completed
                  {detail.employee?.employeeCode || detail.employeeCode ? ` (${detail.employee?.employeeCode || detail.employeeCode})` : ''}.
                  This person is in Employees, with their documents kept on their profile.
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

export default function AdminOnboardingPage() {
  return (
    <Suspense fallback={<div className="main">Loading…</div>}>
      <OnboardingPageInner />
    </Suspense>
  );
}
