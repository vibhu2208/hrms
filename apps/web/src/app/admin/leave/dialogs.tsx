'use client';

import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';

export type LeaveTypeDraft = {
  id?: string;
  name: string;
  code: string;
  days: number;
  frequency: 'YEARLY' | 'MONTHLY' | 'QUARTERLY';
  paid: boolean;
  carryForward: boolean;
  maxCarryDays: number;
  maxConsecutiveDays: number | null;
  minNoticeDays: number;
  requiresDocument: boolean;
  active: boolean;
  description: string | null;
};

type Department = { id: string; name: string };
type Employee = { id: string; firstName: string; lastName: string; employeeCode: string };
type LeaveTypeOption = { id: string; name: string };

const emptyType = {
  name: '',
  code: '',
  days: 12,
  frequency: 'YEARLY' as LeaveTypeDraft['frequency'],
  paid: true,
  carryForward: false,
  maxCarryDays: 0,
  maxConsecutiveDays: '',
  minNoticeDays: 0,
  requiresDocument: false,
  active: true,
  description: '',
};

function yearlyTotal(days: number, frequency: string) {
  if (frequency === 'MONTHLY') return days * 12;
  if (frequency === 'QUARTERLY') return days * 4;
  return days;
}

function Popup({
  title,
  titleId,
  onClose,
  children,
}: {
  title: string;
  titleId: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="att-pop" onMouseDown={onClose}>
      <div
        className="att-pop-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
        style={{ width: 'min(760px, 100%)' }}
      >
        <button className="att-pop-close" type="button" onClick={onClose}>Close</button>
        <div className="att-panel-head">
          <h2 id={titleId}>{title}</h2>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function AddLeaveDialog({
  initial,
  onClose,
}: {
  initial?: LeaveTypeDraft | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState(emptyType);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!initial) {
      setForm(emptyType);
      return;
    }
    setForm({
      name: initial.name,
      code: initial.code,
      days: initial.days,
      frequency: initial.frequency,
      paid: initial.paid,
      carryForward: initial.carryForward,
      maxCarryDays: initial.maxCarryDays,
      maxConsecutiveDays: initial.maxConsecutiveDays == null ? '' : String(initial.maxConsecutiveDays),
      minNoticeDays: initial.minNoticeDays,
      requiresDocument: initial.requiresDocument,
      active: initial.active,
      description: initial.description || '',
    });
  }, [initial]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const payload = {
      name: form.name,
      code: form.code,
      days: Number(form.days),
      frequency: form.frequency,
      paid: form.paid,
      carryForward: form.carryForward,
      maxCarryDays: Number(form.maxCarryDays),
      maxConsecutiveDays: form.maxConsecutiveDays === '' ? null : Number(form.maxConsecutiveDays),
      minNoticeDays: Number(form.minNoticeDays),
      requiresDocument: form.requiresDocument,
      active: form.active,
      description: form.description,
    };
    try {
      if (initial?.id) {
        await api(`/leave/types/${initial.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        window.dispatchEvent(new CustomEvent('gs-leave-changed', { detail: 'Leave type updated.' }));
      } else {
        await api('/leave/types', { method: 'POST', body: JSON.stringify(payload) });
        window.dispatchEvent(new CustomEvent('gs-leave-changed', { detail: 'Leave type added. Employees can see it in their balances.' }));
      }
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popup title={initial?.id ? 'Edit leave' : 'Add leave'} titleId="leave-type-title" onClose={onClose}>
      {error && <p className="att-banner" style={{ marginBottom: 12 }}>{error}</p>}
      <form onSubmit={save}>
        <div className="att-form-grid">
          <div className="field">
            <label className="label" htmlFor="leave-name">Name</label>
            <input id="leave-name" className="input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="leave-code">Code</label>
            <input id="leave-code" className="input" required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="leave-frequency">Frequency</label>
            <select id="leave-frequency" className="select" value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value as LeaveTypeDraft['frequency'] })}>
              <option value="YEARLY">Yearly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="leave-days">Days per period</label>
            <input id="leave-days" className="input" type="number" min={0} max={366} required value={form.days} onChange={(event) => setForm({ ...form, days: Number(event.target.value) })} />
            <div className="muted">{yearlyTotal(Number(form.days) || 0, form.frequency)} days in a year</div>
          </div>
          <div className="field">
            <label className="label" htmlFor="leave-notice">Minimum notice (days)</label>
            <input id="leave-notice" className="input" type="number" min={0} max={366} value={form.minNoticeDays} onChange={(event) => setForm({ ...form, minNoticeDays: Number(event.target.value) })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="leave-consecutive">Max consecutive days</label>
            <input id="leave-consecutive" className="input" type="number" min={1} max={366} placeholder="No limit" value={form.maxConsecutiveDays} onChange={(event) => setForm({ ...form, maxConsecutiveDays: event.target.value })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="leave-carry">Max days to carry</label>
            <input id="leave-carry" className="input" type="number" min={0} max={366} value={form.maxCarryDays} onChange={(event) => setForm({ ...form, maxCarryDays: Number(event.target.value) })} />
            <div className="muted">0 keeps all unused days when carry forward is on.</div>
          </div>
          <div className="field">
            <label className="label" htmlFor="leave-description">Description</label>
            <input id="leave-description" className="input" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </div>
        </div>
        <div className="att-form" style={{ gap: 12, maxWidth: 'none', marginTop: 8 }}>
          <label className="att-toggle">
            <input type="checkbox" checked={form.paid} onChange={(event) => setForm({ ...form, paid: event.target.checked })} />
            Paid leave
          </label>
          <label className="att-toggle">
            <input type="checkbox" checked={form.carryForward} onChange={(event) => setForm({ ...form, carryForward: event.target.checked })} />
            Carry unused days into the next year
          </label>
          <label className="att-toggle">
            <input type="checkbox" checked={form.requiresDocument} onChange={(event) => setForm({ ...form, requiresDocument: event.target.checked })} />
            Require a document
          </label>
          <label className="att-toggle">
            <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
            Active for employees
          </label>
        </div>
        <div className="att-actions">
          <button className="btn" disabled={busy} type="submit">{initial?.id ? 'Save leave' : 'Add leave'}</button>
        </div>
      </form>
    </Popup>
  );
}

export function AddAllocationDialog({ onClose }: { onClose: () => void }) {
  const [types, setTypes] = useState<LeaveTypeOption[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState({
    leaveTypeId: '',
    scope: 'department' as 'department' | 'employee',
    departmentId: '',
    employeeId: '',
    days: 12,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api<LeaveTypeOption[]>('/leave/types'),
      api<Department[]>('/departments'),
      api<Employee[]>('/employees'),
    ]).then(([typeRows, departmentRows, employeeRows]) => {
      setTypes(typeRows);
      setDepartments(departmentRows);
      setEmployees(employeeRows);
      setForm((current) => ({ ...current, leaveTypeId: current.leaveTypeId || typeRows[0]?.id || '' }));
    }).catch((err: Error) => setError(err.message));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/leave/allocations', {
        method: 'POST',
        body: JSON.stringify({
          leaveTypeId: form.leaveTypeId,
          days: Number(form.days),
          departmentId: form.scope === 'department' ? form.departmentId : null,
          employeeId: form.scope === 'employee' ? form.employeeId : null,
        }),
      });
      window.dispatchEvent(new CustomEvent('gs-leave-changed', { detail: 'Allocation saved. Matching employees now use this number.' }));
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popup title="Add allocation" titleId="leave-alloc-title" onClose={onClose}>
      {error && <p className="att-banner" style={{ marginBottom: 12 }}>{error}</p>}
      <form onSubmit={save} className="att-form-grid">
        <div className="field">
          <label className="label" htmlFor="alloc-type">Leave type</label>
          <select id="alloc-type" className="select" required value={form.leaveTypeId} onChange={(event) => setForm({ ...form, leaveTypeId: event.target.value })}>
            <option value="">Select</option>
            {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="alloc-scope">Applies to</label>
          <select id="alloc-scope" className="select" value={form.scope} onChange={(event) => setForm({ ...form, scope: event.target.value as 'department' | 'employee' })}>
            <option value="department">Department</option>
            <option value="employee">Employee</option>
          </select>
        </div>
        {form.scope === 'department' ? (
          <div className="field">
            <label className="label" htmlFor="alloc-dept">Department</label>
            <select id="alloc-dept" className="select" required value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })}>
              <option value="">Select</option>
              {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="field">
            <label className="label" htmlFor="alloc-emp">Employee</label>
            <select id="alloc-emp" className="select" required value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}>
              <option value="">Select</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.firstName} {employee.lastName} ({employee.employeeCode})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label className="label" htmlFor="alloc-days">Days per period</label>
          <input id="alloc-days" className="input" type="number" min={0} max={366} required value={form.days} onChange={(event) => setForm({ ...form, days: Number(event.target.value) })} />
        </div>
        <div className="att-actions" style={{ gridColumn: '1 / -1' }}>
          <button className="btn" disabled={busy} type="submit">Save allocation</button>
        </div>
      </form>
    </Popup>
  );
}
