'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api, getStoredUser } from '@/lib/api';
import { DocumentPreview } from '@/components/document-preview';
import { CatalogHint } from '@/components/catalog-hint';
import { EmployeeAttendanceProfile } from './attendance-profile';

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

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 16V6M8 9.5 12 5.5 16 9.5" />
      <path d="M5 16.5V19h14v-2.5" />
    </svg>
  );
}

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

function inputDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function codeNumber(code?: string) {
  const match = /(\d+)$/.exec(code || '');
  return match ? Number(match[1]) : 0;
}

function employeeActive(employee: { isActive?: boolean; lastWorkingDay?: string | null }) {
  return employee.isActive !== false && !employee.lastWorkingDay;
}

function SortMark({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return <span className={`emp-sort${active ? ' on' : ''}`}>{!active ? '↕' : dir === 'asc' ? '↑' : '↓'}</span>;
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

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20l4.2-1 9.5-9.5-3.2-3.2L5 15.8 4 20z" />
      <path d="M13.2 6.6l3.2 3.2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" />
    </svg>
  );
}

function Req({ show = true }: { show?: boolean }) {
  if (!show) return null;
  return <span className="req">*</span>;
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

function documentCount(employee: any) {
  if (typeof employee.documentCount === 'number') return employee.documentCount;
  const ids = new Set<string>([
    ...(employee.documents || []).map((doc: { id: string }) => doc.id),
    ...(employee.onboardingRequests || []).flatMap((request: any) =>
      (request.documents || []).map((doc: { id: string }) => doc.id),
    ),
  ]);
  return ids.size;
}

let cachedEmployees: any[] | null = null;

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
};

export default function EmployeesPage() {
  const [rows, setRows] = useState<any[]>(() => cachedEmployees || []);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [departments, setDepartments] = useState<any[]>([]);
  const [designations, setDesignations] = useState<any[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [docKind, setDocKind] = useState('ID_PROOF');
  const [docTitle, setDocTitle] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [addDocOpen, setAddDocOpen] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const [nextCode, setNextCode] = useState('');
  const [sameAddress, setSameAddress] = useState(true);
  const [verifyFiles, setVerifyFiles] = useState<[File | null, File | null]>([null, null]);
  const [verifyKinds, setVerifyKinds] = useState<[string, string]>(['ID_PROOF', 'ADDRESS']);
  const [verifyTitles, setVerifyTitles] = useState<[string, string]>(['', '']);
  const [verifyKey, setVerifyKey] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTab, setFormTab] = useState<'personal' | 'employee' | 'bank'>('personal');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [editingCode, setEditingCode] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [designationFilter, setDesignationFilter] = useState('');
  const [sortKey, setSortKey] = useState<'code' | 'joining' | 'status'>('code');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const profiles = useRef<Record<string, any>>({});
  const openRequest = useRef<string | null>(null);

  const role = getStoredUser()?.role?.code;
  const canAdd = role === 'OWNER' || role === 'HR' || role === 'MANAGEMENT';

  useEffect(() => {
    const message = notice || error;
    if (!message) return;
    const timer = window.setTimeout(() => {
      setNotice('');
      setError('');
    }, message.includes('Temporary password') ? 8000 : 4500);
    return () => window.clearTimeout(timer);
  }, [notice, error]);

  useEffect(() => {
    api('/employees')
      .then((next) => {
        cachedEmployees = next;
        setRows(next);
      })
      .catch((e) => setError(e.message));
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((employee) => {
      if (statusFilter === 'ACTIVE' && !employeeActive(employee)) return false;
      if (statusFilter === 'INACTIVE' && employeeActive(employee)) return false;
      if (departmentFilter && employee.department?.id !== departmentFilter) return false;
      if (designationFilter && employee.designation?.id !== designationFilter) return false;
      if (!q) return true;
      return `${employee.firstName} ${employee.lastName} ${employee.employeeCode} ${employee.user?.email || ''} ${employee.phone || ''} ${employee.designation?.name || ''} ${employee.department?.name || ''}`
        .toLowerCase()
        .includes(q);
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => {
      if (sortKey === 'joining') {
        return (new Date(a.joiningDate || 0).getTime() - new Date(b.joiningDate || 0).getTime()) * dir;
      }
      if (sortKey === 'status') {
        return (Number(employeeActive(a)) - Number(employeeActive(b))) * dir;
      }
      return (codeNumber(a.employeeCode) - codeNumber(b.employeeCode)) * dir;
    });
  }, [rows, search, statusFilter, departmentFilter, designationFilter, sortKey, sortDir]);

  useEffect(() => {
    Promise.all([api('/departments'), api('/designations')])
      .then(([d, des]) => {
        setDepartments(d);
        setDesignations(des);
      })
      .catch(() => {})
      .finally(() => setCatalogReady(true));
  }, []);

  useEffect(() => {
    if (!showForm || !canAdd) return;
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
  }, [showForm, canAdd]);

  async function openEmployee(id: string) {
    setSelectedId(id);
    setError('');
    openRequest.current = id;
    const cached = profiles.current[id];
    if (cached) {
      setSelected(cached);
      return;
    }
    const row = rows.find((employee) => employee.id === id);
    if (row) setSelected({ ...row, documents: row.documents || [] });
    try {
      const full = await api(`/employees/${id}`);
      profiles.current[id] = full;
      if (openRequest.current === id) setSelected(full);
    } catch (err: any) {
      if (openRequest.current === id) setError(err.message || 'Could not load employee');
    }
  }

  async function uploadEmployeeDocument() {
    if (!selectedId || !docFile) {
      setError('Choose a file to upload');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', docFile);
      body.append('kind', docKind);
      body.append('title', docTitle || docFile.name);
      const doc = await api(`/employees/${selectedId}/documents`, {
        method: 'POST',
        formData: body,
      });
      setSelected((current: any) => {
        if (!current) return current;
        const next = { ...current, documents: [doc, ...(current.documents || [])] };
        profiles.current[selectedId] = next;
        return next;
      });
      setRows((current) => {
        const next = current.map((employee) =>
          employee.id === selectedId
            ? { ...employee, documentCount: documentCount(employee) + 1 }
            : employee,
        );
        cachedEmployees = next;
        return next;
      });
      setDocFile(null);
      setDocTitle('');
      setFileKey((n) => n + 1);
      setAddDocOpen(false);
      setNotice('Document stored on this employee.');
    } catch (err: any) {
      setError(err.message || 'Could not upload document');
    } finally {
      setBusy(false);
    }
  }

  function toggleSort(key: 'code' | 'joining' | 'status') {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'code' ? 'desc' : 'asc');
  }

  function fillForm(full: any) {
    setForm({
      ...emptyForm,
      firstName: full.firstName || '',
      lastName: full.lastName || '',
      gender: full.gender || '',
      dateOfBirth: inputDate(full.dateOfBirth),
      bloodGroup: full.bloodGroup || '',
      maritalStatus: full.maritalStatus || '',
      fatherOrSpouseName: full.fatherOrSpouseName || '',
      email: full.user?.email || '',
      personalEmail: full.personalEmail || '',
      phone: full.phone || '',
      alternatePhone: full.alternatePhone || '',
      currentAddress: full.currentAddress || '',
      city: full.city || '',
      state: full.state || '',
      pincode: full.pincode || '',
      permanentAddress: full.permanentAddress || '',
      emergencyContactName: full.emergencyContactName || '',
      emergencyContactPhone: full.emergencyContactPhone || '',
      emergencyContactRelation: full.emergencyContactRelation || '',
      joiningDate: inputDate(full.joiningDate),
      employmentType: full.employmentType || 'FULL_TIME',
      workLocation: full.workLocation || '',
      departmentId: full.department?.id || '',
      designationId: full.designation?.id || '',
      roleCode: full.user?.role?.code || 'EMPLOYEE',
      aadhaarNumber: full.aadhaarNumber || '',
      panNumber: full.panNumber || '',
      bankName: full.bankName || '',
      bankAccountNumber: full.bankAccountNumber || '',
      bankIfsc: full.bankIfsc || '',
    });
    setSameAddress(!full.permanentAddress || full.permanentAddress === full.currentAddress);
    setPhotoFile(null);
    setPhotoPreview(full.photoPreviewUrl || '');
  }

  function rememberRow(full: any) {
    setRows((current) => {
      const next = current.map((employee) =>
        employee.id === full.id
          ? {
              ...employee,
              employeeCode: full.employeeCode,
              firstName: full.firstName,
              lastName: full.lastName,
              phone: full.phone,
              dateOfBirth: full.dateOfBirth,
              joiningDate: full.joiningDate,
              lastWorkingDay: full.lastWorkingDay,
              isActive: full.isActive,
              department: full.department,
              designation: full.designation,
              user: full.user,
              documentCount: documentCount(full),
            }
          : employee,
      );
      cachedEmployees = next;
      return next;
    });
    profiles.current[full.id] = full;
    if (selectedId === full.id) setSelected(full);
  }

  async function viewEmployee(id: string) {
    setShowForm(false);
    await openEmployee(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function startEdit(id: string) {
    setError('');
    setNotice('');
    setEditingId(id);
    setFormTab('personal');
    setShowForm(true);
    const cached = profiles.current[id];
    if (cached?.user?.email && cached.department) {
      setEditingCode(cached.employeeCode || '');
      fillForm(cached);
    }
    try {
      const full = await api(`/employees/${id}`);
      profiles.current[id] = full;
      setEditingCode(full.employeeCode || '');
      fillForm(full);
    } catch (err: any) {
      setError(err.message || 'Could not load employee');
    }
  }

  function openAdd() {
    setEditingId(null);
    setEditingCode('');
    setFormTab('personal');
    setForm(emptyForm);
    setPhotoFile(null);
    setPhotoPreview('');
    setSameAddress(true);
    setShowForm(true);
    setError('');
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function saveEdit() {
    if (!editingId) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        ...form,
        permanentAddress: sameAddress ? form.currentAddress : form.permanentAddress,
        bloodGroup: form.bloodGroup || null,
        maritalStatus: form.maritalStatus || null,
        fatherOrSpouseName: form.fatherOrSpouseName || null,
        personalEmail: form.personalEmail || null,
        alternatePhone: form.alternatePhone || null,
        workLocation: form.workLocation || null,
        bankName: form.bankName || null,
        bankAccountNumber: form.bankAccountNumber || null,
        bankIfsc: form.bankIfsc || null,
        emergencyContactRelation: form.emergencyContactRelation || null,
      };
      const updated = photoFile
        ? await api(`/employees/${editingId}`, {
            method: 'PATCH',
            formData: (() => {
              const body = new FormData();
              Object.entries(payload).forEach(([key, value]) => {
                if (value) body.append(key, value);
              });
              body.append('photo', photoFile);
              return body;
            })(),
          })
        : await api(`/employees/${editingId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
      rememberRow(updated);
      setNotice(`${updated.employeeCode} updated.`);
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      setPhotoFile(null);
      setPhotoPreview('');
    } catch (err: any) {
      setError(err.message || 'Could not update employee');
    } finally {
      setBusy(false);
    }
  }

  async function deactivateEmployee(employee: any) {
    const name = `${employee.firstName} ${employee.lastName}`.trim();
    if (!window.confirm(`Deactivate ${name}? They will no longer be able to sign in.`)) return;
    setBusy(true);
    setError('');
    try {
      const updated = await api(`/employees/${employee.id}/deactivate`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      rememberRow({ ...updated, isActive: false, lastWorkingDay: updated.lastWorkingDay || new Date().toISOString() });
      setNotice(`${name} is now inactive.`);
    } catch (err: any) {
      setError(err.message || 'Could not deactivate employee');
    } finally {
      setBusy(false);
    }
  }

  function missingSection(): 'personal' | 'employee' | 'bank' | null {
    const personalMissing =
      !form.firstName.trim() ||
      !form.lastName.trim() ||
      !form.email.trim() ||
      !form.phone.trim() ||
      (!editingId &&
        (!form.gender ||
          !form.dateOfBirth ||
          !form.currentAddress.trim() ||
          !form.city.trim() ||
          !form.state.trim() ||
          !form.pincode.trim() ||
          !form.emergencyContactName.trim() ||
          !form.emergencyContactPhone.trim()));
    if (personalMissing) return 'personal';
    if (!form.joiningDate || !form.departmentId || !form.designationId) return 'employee';
    if (!editingId && (!form.aadhaarNumber.trim() || !form.panNumber.trim())) return 'bank';
    return null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const missing = missingSection();
    if (missing) {
      setFormTab(missing);
      setError(`Complete the required fields in ${missing === 'bank' ? 'Bank details' : missing === 'employee' ? 'Employee' : 'Personal'}.`);
      return;
    }
    if (editingId) {
      await saveEdit();
      return;
    }
    if (!verifyFiles[0] || !verifyFiles[1]) {
      setFormTab('employee');
      setError('Upload two verification documents');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
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
      const created = await api('/employees', {
        method: 'POST',
        formData: body,
      });
      const code = created.employee?.employeeCode;
      const mailed = created.loginEmail?.delivered;
      setNotice(
        mailed
          ? `${code} created. Login details were emailed to ${created.email}.`
          : `${code} created, but the login email was not delivered${
              created.temporaryPassword ? `. Temporary password: ${created.temporaryPassword}` : ''
            }.`,
      );
      const department = departments.find((item) => item.id === form.departmentId);
      const designation = designations.find((item) => item.id === form.designationId);
      if (created.employee?.id) {
        setRows((current) => {
          const next = [
            {
              id: created.employee.id,
              employeeCode: created.employee.employeeCode,
              firstName: created.employee.firstName,
              lastName: created.employee.lastName,
              phone: created.employee.phone,
              dateOfBirth: created.employee.dateOfBirth,
              joiningDate: created.employee.joiningDate,
              isActive: true,
              department: department ? { id: department.id, name: department.name } : null,
              designation: designation ? { id: designation.id, name: designation.name } : null,
              user: { email: created.email, role: { code: form.roleCode } },
              documentCount: 2,
            },
            ...current,
          ];
          cachedEmployees = next;
          return next;
        });
      }
      setForm(emptyForm);
      setPhotoFile(null);
      setPhotoPreview('');
      setEditingId(null);
      setEditingCode('');
      setSameAddress(true);
      setVerifyFiles([null, null]);
      setVerifyKinds(['ID_PROOF', 'ADDRESS']);
      setVerifyTitles(['', '']);
      setVerifyKey((n) => n + 1);
      setShowForm(false);
      setSearch('');
    } catch (err: any) {
      setError(err.message || 'Could not add employee');
    } finally {
      setBusy(false);
    }
  }

  const filtersOn = statusFilter !== 'ALL' || !!departmentFilter || !!designationFilter;
  const editingRow = editingId
    ? (selected?.id === editingId ? selected : rows.find((row) => row.id === editingId))
    : null;
  const editingActive = editingRow ? employeeActive(editingRow) : true;
  const editingName = `${form.firstName} ${form.lastName}`.trim();

  return (
    <div className="emp-page">
      {selected ? (
        <>
          <EmployeeAttendanceProfile
            employee={selected}
            canEdit={canAdd}
            onBack={() => {
              setSelected(null);
              setSelectedId(null);
              setShowForm(false);
              setEditingId(null);
            }}
            onEdit={() => startEdit(selected.id)}
            onAddDocument={canAdd ? () => setAddDocOpen(true) : undefined}
            addOpen={addDocOpen}
            onCloseAdd={() => setAddDocOpen(false)}
          >
            <DocumentPreview documents={selected.documents || []} />
          </EmployeeAttendanceProfile>
          {canAdd && addDocOpen && (
            <div
              className="hr-modal hr-doc-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Add document"
              onMouseDown={() => setAddDocOpen(false)}
            >
              <div className="hr-doc-add-card" onMouseDown={(event) => event.stopPropagation()}>
                <div className="hr-docs-head">
                  <div>
                    <h2>Add document</h2>
                    <p>{`${selected.firstName || ''} ${selected.lastName || ''}`.trim()}{selected.employeeCode ? ` · ${selected.employeeCode}` : ''}</p>
                  </div>
                  <button className="btn secondary" type="button" onClick={() => setAddDocOpen(false)}>Close</button>
                </div>
                <section className="hr-doc-add">
                  <div className="hr-doc-fields">
                    <label>
                      Document type
                      <select className="input" value={docKind} onChange={(e) => setDocKind(e.target.value)}>
                        {DOC_KINDS.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Document title
                      <input className="input" placeholder="Optional" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
                    </label>
                  </div>
                  <label className="hr-doc-upload">
                    <input
                      key={fileKey}
                      className="hr-doc-file"
                      type="file"
                      accept="application/pdf,image/*,.doc,.docx"
                      onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                    />
                    <UploadIcon />
                    <span>
                      <strong>{docFile ? docFile.name : 'Upload document'}</strong>
                      <small>PDF, images, DOC, DOCX up to 15 MB</small>
                    </span>
                  </label>
                  <button className="btn" type="button" disabled={busy || !docFile} onClick={uploadEmployeeDocument}>
                    {busy ? 'Uploading…' : 'Add document'}
                  </button>
                </section>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
      <div className="emp-tabs" role="tablist">
        <Link className="emp-tab" href="/admin/configuration">Employee Position</Link>
        <span className="emp-tab active" aria-current="page">Employee List</span>
        <Link className="emp-tab" href="/admin/performance">Employee Performance</Link>
      </div>
        </>
      )}

      {showForm && (
        <div
          className="hr-modal"
          role="dialog"
          aria-modal="true"
          aria-label={editingId ? 'Edit employee' : 'Add employee'}
          onMouseDown={closeForm}
        >
        <div
          className="hr-modal-card"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="hr-edit-top">
            <div className="hr-edit-head">
              <div>
                <h2>{editingId ? 'Edit employee' : 'Add employee'}</h2>
                {(editingId ? editingCode : nextCode) && (
                  <p>{editingId ? editingCode : nextCode}</p>
                )}
              </div>
              <div className="hr-edit-actions">
                <button className="btn" type="submit" form="employee-editor" disabled={busy}>
                  {busy ? 'Saving…' : editingId ? 'Save changes' : 'Create employee'}
                </button>
                <button className="btn secondary" type="button" onClick={closeForm}>
                  Close
                </button>
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
          <form id="employee-editor" onSubmit={submit} className="hr-edit-shell">
            <aside className="hr-profile">
                <div className="hr-profile-photo">
                  {photoPreview ? (
                    <img src={photoPreview} alt="" />
                  ) : (
                    <span>{`${form.firstName.charAt(0)}${form.lastName.charAt(0)}`.trim() || 'P'}</span>
                  )}
                </div>
                <strong>{editingName || (editingId ? 'Employee' : 'New employee')}</strong>
                {(editingId ? editingCode : nextCode) && (
                  <span className="hr-profile-code">{editingId ? editingCode : nextCode}</span>
                )}
                {editingId ? (
                  <span className={editingActive ? 'hr-badge' : 'hr-badge off'}>{editingActive ? 'Active' : 'Inactive'}</span>
                ) : (
                  <span className="hr-badge">New</span>
                )}
                <label className="hr-change-photo">
                  Change photo
                  <input
                    id="employee-photo"
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
                  <li>
                    <MailMark />
                    <div>
                      <small>Work email</small>
                      <b>{form.email || '—'}</b>
                    </div>
                  </li>
                  <li>
                    <PhoneMark />
                    <div>
                      <small>Phone</small>
                      <b>{form.phone || '—'}</b>
                    </div>
                  </li>
                  <li>
                    <MailMark />
                    <div>
                      <small>Personal email</small>
                      <b>{form.personalEmail || '—'}</b>
                    </div>
                  </li>
                  <li>
                    <PhoneMark />
                    <div>
                      <small>Alternate phone</small>
                      <b>{form.alternatePhone || '—'}</b>
                    </div>
                  </li>
                </ul>
                {!editingId && (
                  <p className="muted" style={{ margin: '14px 0 0', fontSize: '0.75rem' }}>
                    Login email and a temporary password are sent after the profile and two verification documents are saved.
                  </p>
                )}
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
              <label className="label">Gender <Req show={!editingId} /></label>
              <select className="select" required={!editingId} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="">Select gender</option>
                {GENDERS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Date of birth <Req show={!editingId} /></label>
              <input className="input" type="date" required={!editingId} value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">Blood group</label>
              <select className="select" value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}>
                <option value="">Optional</option>
                {BLOOD_GROUPS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Marital status</label>
              <select className="select" value={form.maritalStatus} onChange={(e) => setForm({ ...form, maritalStatus: e.target.value })}>
                <option value="">Optional</option>
                {MARITAL.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
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
              <label className="label">Current address <Req show={!editingId} /></label>
              <input className="input" required={!editingId} value={form.currentAddress} onChange={(e) => setForm({ ...form, currentAddress: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">City <Req show={!editingId} /></label>
              <input className="input" required={!editingId} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">State <Req show={!editingId} /></label>
              <input className="input" required={!editingId} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">PIN code <Req show={!editingId} /></label>
              <input className="input" required={!editingId} inputMode="numeric" pattern={editingId ? undefined : '[0-9]{6}'} value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
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
              <label className="label">Emergency contact name <Req show={!editingId} /></label>
              <input className="input" required={!editingId} value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">Emergency contact phone <Req show={!editingId} /></label>
              <input className="input" required={!editingId} value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} />
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
              <input className="input" value={editingId ? editingCode : nextCode || 'Assigned when you save'} readOnly />
            </div>
            <div className="field">
              <label className="label">Joining date <Req /></label>
              <input className="input" type="date" required value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">Employment type <Req /></label>
              <select className="select" required value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })}>
                {EMPLOYMENT.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
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
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Designation <Req /></label>
              <select className="select" required value={form.designationId} onChange={(e) => setForm({ ...form, designationId: e.target.value })}>
                <option value="">Select designation</option>
                {designations.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            </>
            )}

            {formTab === 'bank' && (
            <>
            <h3 className="hr-section">Identity and bank</h3>
            <div className="field">
              <label className="label">Aadhaar number <Req show={!editingId} /></label>
              <input className="input" required={!editingId} inputMode="numeric" value={form.aadhaarNumber} onChange={(e) => setForm({ ...form, aadhaarNumber: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">PAN <Req show={!editingId} /></label>
              <input className="input" required={!editingId} value={form.panNumber} onChange={(e) => setForm({ ...form, panNumber: e.target.value.toUpperCase() })} />
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
            </>
            )}

            {formTab === 'employee' && !editingId && (
            <h3 className="hr-section">Verification documents</h3>
            )}
            {formTab === 'employee' && !editingId && (
            <p className="muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
              Upload two documents, such as an ID proof and an address proof. PDF, image, or Word, up to 15 MB each.
            </p>
            )}
            {formTab === 'employee' && !editingId && [0, 1].map((index) => (
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
                  {DOC_KINDS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
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
            </div>
          </form>
        </div>
        </div>
      )}

      {!selected && <section className="emp-board">
        <div className="emp-toolbar">
          <h1>Employee list</h1>
          <div className="emp-tools">
            <label className="emp-search">
              <SearchIcon />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Employee position"
                aria-label="Search employees"
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
            {canAdd && (
              <button className="emp-add" type="button" onClick={openAdd}>
                <span aria-hidden>+</span> Add Employee
              </button>
            )}
          </div>
        </div>

        {filterOpen && (
          <div className="emp-filters">
            <label>
              Status
              <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="ALL">All</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            <label>
              Department
              <select className="select" value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
                <option value="">All departments</option>
                {departments.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label>
              Designation
              <select className="select" value={designationFilter} onChange={(e) => setDesignationFilter(e.target.value)}>
                <option value="">All designations</option>
                {designations.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            {filtersOn && (
              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  setStatusFilter('ALL');
                  setDepartmentFilter('');
                  setDesignationFilter('');
                }}
              >
                Clear
              </button>
            )}
          </div>
        )}

        <div className="emp-table-wrap">
          <table className="emp-table">
            <colgroup>
              <col className="sl" />
              <col className="id" />
              <col className="name" />
              <col className="email" />
              <col className="phone" />
              <col className="dob" />
              <col className="role" />
              <col className="joined" />
              <col className="status" />
              <col className="action" />
            </colgroup>
            <thead>
              <tr>
                <th>SL</th>
                <th>
                  <button type="button" onClick={() => toggleSort('code')}>
                    ID <SortMark active={sortKey === 'code'} dir={sortDir} />
                  </button>
                </th>
                <th>Name</th>
                <th>Email</th>
                <th>Mobile</th>
                <th>DOB</th>
                <th>Designation</th>
                <th>
                  <button type="button" onClick={() => toggleSort('joining')}>
                    Joined <SortMark active={sortKey === 'joining'} dir={sortDir} />
                  </button>
                </th>
                <th>
                  <button type="button" onClick={() => toggleSort('status')}>
                    Status <SortMark active={sortKey === 'status'} dir={sortDir} />
                  </button>
                </th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td className="emp-empty" colSpan={10}>No employees match this search.</td>
                </tr>
              )}
              {visible.map((employee, index) => {
                const active = employeeActive(employee);
                return (
                  <tr key={employee.id} className={selectedId === employee.id ? 'selected' : undefined}>
                    <td>{String(index + 1).padStart(2, '0')}</td>
                    <td title={employee.employeeCode}>{employee.employeeCode}</td>
                    <td title={`${employee.firstName} ${employee.lastName}`.trim()}>
                      {employee.firstName} {employee.lastName}
                    </td>
                    <td title={employee.user?.email || ''}>{employee.user?.email || '—'}</td>
                    <td title={employee.phone || ''}>{employee.phone || '—'}</td>
                    <td title={inputDate(employee.dateOfBirth)}>{inputDate(employee.dateOfBirth) || '—'}</td>
                    <td title={employee.designation?.name || ''}>{employee.designation?.name || '—'}</td>
                    <td title={inputDate(employee.joiningDate)}>{inputDate(employee.joiningDate) || '—'}</td>
                    <td>
                      <span className={active ? 'emp-status' : 'emp-status off'}>{active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td>
                      <div className="emp-actions">
                        <button type="button" title="View" aria-label="View employee" onClick={() => viewEmployee(employee.id)}>
                          <EyeIcon />
                        </button>
                        {canAdd && (
                          <button type="button" title="Edit" aria-label="Edit employee" onClick={() => startEdit(employee.id)}>
                            <PencilIcon />
                          </button>
                        )}
                        {canAdd && (
                          <button
                            type="button"
                            className="danger"
                            title="Deactivate"
                            aria-label="Deactivate employee"
                            disabled={busy || !active}
                            onClick={() => deactivateEmployee(employee)}
                          >
                            <TrashIcon />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>}
      {(notice || error) && (
        <div className="emp-toasts" role="status" aria-live="polite">
          <div className={error ? 'emp-toast bad' : 'emp-toast ok'}>{error || notice}</div>
        </div>
      )}
    </div>
  );
}
