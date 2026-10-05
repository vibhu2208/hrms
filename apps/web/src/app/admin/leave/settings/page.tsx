'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, getStoredUser, hasAnyRole } from '@/lib/api';
import { LeaveNav } from '../nav';

type LeaveType = {
  id: string;
  name: string;
  code: string;
  days: number;
  annualAllocation: number;
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

type Allocation = {
  id: string;
  days: number;
  leaveType: { id: string; name: string };
  department?: { id: string; name: string } | null;
  employee?: { id: string; firstName: string; lastName: string; employeeCode: string } | null;
};

type Department = { id: string; name: string };
type Employee = { id: string; firstName: string; lastName: string; employeeCode: string };

const emptyType = {
  name: '',
  code: '',
  days: 12,
  frequency: 'YEARLY' as LeaveType['frequency'],
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

function frequencyLabel(frequency: string) {
  if (frequency === 'MONTHLY') return 'Monthly';
  if (frequency === 'QUARTERLY') return 'Quarterly';
  return 'Yearly';
}

export default function LeaveSettingsPage() {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [typeForm, setTypeForm] = useState(emptyType);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [allocationForm, setAllocationForm] = useState({
    leaveTypeId: '',
    scope: 'department' as 'department' | 'employee',
    departmentId: '',
    employeeId: '',
    days: 12,
  });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [typeRows, allocationRows, departmentRows, employeeRows] = await Promise.all([
      api<LeaveType[]>('/leave/types'),
      api<Allocation[]>('/leave/allocations'),
      api<Department[]>('/departments'),
      api<Employee[]>('/employees'),
    ]);
    setTypes(typeRows);
    setAllocations(allocationRows);
    setDepartments(departmentRows);
    setEmployees(employeeRows);
    setAllocationForm((current) => ({
      ...current,
      leaveTypeId: current.leaveTypeId || typeRows[0]?.id || '',
    }));
  }

  useEffect(() => {
    const canEdit = hasAnyRole(getStoredUser()?.role?.code, ['OWNER', 'HR']);
    setAllowed(canEdit);
    setReady(true);
    if (!canEdit) return;
    load().catch((error: Error) => setMsg(error.message));
  }, []);

  function editType(type: LeaveType) {
    setEditingId(type.id);
    setTypeForm({
      name: type.name,
      code: type.code,
      days: type.days,
      frequency: type.frequency,
      paid: type.paid,
      carryForward: type.carryForward,
      maxCarryDays: type.maxCarryDays,
      maxConsecutiveDays: type.maxConsecutiveDays == null ? '' : String(type.maxConsecutiveDays),
      minNoticeDays: type.minNoticeDays,
      requiresDocument: type.requiresDocument,
      active: type.active,
      description: type.description || '',
    });
  }

  function typePayload() {
    return {
      name: typeForm.name,
      code: typeForm.code,
      days: Number(typeForm.days),
      frequency: typeForm.frequency,
      paid: typeForm.paid,
      carryForward: typeForm.carryForward,
      maxCarryDays: Number(typeForm.maxCarryDays),
      maxConsecutiveDays: typeForm.maxConsecutiveDays === '' ? null : Number(typeForm.maxConsecutiveDays),
      minNoticeDays: Number(typeForm.minNoticeDays),
      requiresDocument: typeForm.requiresDocument,
      active: typeForm.active,
      description: typeForm.description,
    };
  }

  async function saveType(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      if (editingId) {
        await api(`/leave/types/${editingId}`, { method: 'PATCH', body: JSON.stringify(typePayload()) });
        setMsg('Leave type updated. Employee balances now follow this setup.');
      } else {
        await api('/leave/types', { method: 'POST', body: JSON.stringify(typePayload()) });
        setMsg('Leave type added. Employees can see it in their balances.');
      }
      setEditingId(null);
      setTypeForm(emptyType);
      await load();
    } catch (error: any) {
      setMsg(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveAllocation(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await api('/leave/allocations', {
        method: 'POST',
        body: JSON.stringify({
          leaveTypeId: allocationForm.leaveTypeId,
          days: Number(allocationForm.days),
          departmentId: allocationForm.scope === 'department' ? allocationForm.departmentId : null,
          employeeId: allocationForm.scope === 'employee' ? allocationForm.employeeId : null,
        }),
      });
      setMsg('Allocation saved. Matching employees now use this number.');
      setAllocationForm((current) => ({ ...current, departmentId: '', employeeId: '', days: 12 }));
      await load();
    } catch (error: any) {
      setMsg(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateAllocationDays(row: Allocation, days: number) {
    setBusy(true);
    setMsg('');
    try {
      await api(`/leave/allocations/${row.id}`, { method: 'PATCH', body: JSON.stringify({ days }) });
      setMsg('Allocation updated.');
      await load();
    } catch (error: any) {
      setMsg(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeAllocation(id: string) {
    setBusy(true);
    setMsg('');
    try {
      await api(`/leave/allocations/${id}`, { method: 'DELETE' });
      setMsg('Allocation removed. Those employees fall back to the next matching rule.');
      await load();
    } catch (error: any) {
      setMsg(error.message);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className="att-page">
        <header className="att-head">
          <div>
            <p className="att-kicker">People</p>
            <h1>Leave</h1>
          </div>
          <LeaveNav />
        </header>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="att-page">
        <header className="att-head">
          <div>
            <p className="att-kicker">People</p>
            <h1>Leave</h1>
          </div>
          <LeaveNav />
        </header>
        <p className="empty">Only HR can change leave configuration.</p>
      </div>
    );
  }

  return (
    <div className="att-page">
      <header className="att-head">
        <div>
          <p className="att-kicker">People</p>
          <h1>Leave</h1>
          <p className="att-sub">
            Set each leave type, how often it is granted, and who receives a different number of days.
          </p>
        </div>
        <LeaveNav />
      </header>
      {msg && <p className="att-banner">{msg}</p>}

      <section className="att-panel">
        <div className="att-panel-head">
          <h2>Leave types</h2>
        </div>
        <p className="att-sub" style={{ marginBottom: 14 }}>
          A personal allocation wins over a department allocation, which wins over this default.
          Yearly grants the days once. Monthly multiplies them by 12. Quarterly multiplies them by 4.
        </p>
        <div className="card" style={{ marginBottom: 16, padding: 0, overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Leave</th>
                <th>Frequency</th>
                <th>Days</th>
                <th>Year total</th>
                <th>Rules</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {types.map((type) => (
                <tr key={type.id}>
                  <td>
                    <strong>{type.name}</strong>
                    <div className="muted">{type.code}{type.active ? '' : ' · inactive'}</div>
                  </td>
                  <td>{frequencyLabel(type.frequency)}</td>
                  <td>{type.days}</td>
                  <td>{type.annualAllocation}</td>
                  <td className="muted">
                    {type.paid ? 'Paid' : 'Unpaid'}
                    {type.carryForward ? ` · carry ${type.maxCarryDays || 'all unused'}` : ''}
                    {type.maxConsecutiveDays ? ` · max ${type.maxConsecutiveDays} in a row` : ''}
                    {type.minNoticeDays ? ` · ${type.minNoticeDays} day notice` : ''}
                    {type.requiresDocument ? ' · document' : ''}
                  </td>
                  <td>
                    <button className="btn secondary" type="button" onClick={() => editType(type)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form onSubmit={saveType}>
          <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit leave type' : 'Add leave type'}</h3>
          <div className="att-form-grid">
            <div className="field">
              <label className="label" htmlFor="leave-name">Name</label>
              <input id="leave-name" className="input" required value={typeForm.name} onChange={(event) => setTypeForm({ ...typeForm, name: event.target.value })} />
            </div>
            <div className="field">
              <label className="label" htmlFor="leave-code">Code</label>
              <input id="leave-code" className="input" required value={typeForm.code} onChange={(event) => setTypeForm({ ...typeForm, code: event.target.value })} />
            </div>
            <div className="field">
              <label className="label" htmlFor="leave-frequency">Frequency</label>
              <select id="leave-frequency" className="select" value={typeForm.frequency} onChange={(event) => setTypeForm({ ...typeForm, frequency: event.target.value as LeaveType['frequency'] })}>
                <option value="YEARLY">Yearly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="leave-days">Days per period</label>
              <input id="leave-days" className="input" type="number" min={0} max={366} required value={typeForm.days} onChange={(event) => setTypeForm({ ...typeForm, days: Number(event.target.value) })} />
              <div className="muted">{yearlyTotal(Number(typeForm.days) || 0, typeForm.frequency)} days in a year</div>
            </div>
            <div className="field">
              <label className="label" htmlFor="leave-notice">Minimum notice (days)</label>
              <input id="leave-notice" className="input" type="number" min={0} max={366} value={typeForm.minNoticeDays} onChange={(event) => setTypeForm({ ...typeForm, minNoticeDays: Number(event.target.value) })} />
            </div>
            <div className="field">
              <label className="label" htmlFor="leave-consecutive">Max consecutive days</label>
              <input id="leave-consecutive" className="input" type="number" min={1} max={366} placeholder="No limit" value={typeForm.maxConsecutiveDays} onChange={(event) => setTypeForm({ ...typeForm, maxConsecutiveDays: event.target.value })} />
            </div>
            <div className="field">
              <label className="label" htmlFor="leave-carry">Max days to carry</label>
              <input id="leave-carry" className="input" type="number" min={0} max={366} value={typeForm.maxCarryDays} onChange={(event) => setTypeForm({ ...typeForm, maxCarryDays: Number(event.target.value) })} />
              <div className="muted">0 keeps all unused days when carry forward is on.</div>
            </div>
            <div className="field">
              <label className="label" htmlFor="leave-description">Description</label>
              <input id="leave-description" className="input" value={typeForm.description} onChange={(event) => setTypeForm({ ...typeForm, description: event.target.value })} />
            </div>
          </div>
          <div className="att-form" style={{ gap: 12, maxWidth: 'none', marginTop: 8 }}>
            <label className="att-toggle">
              <input type="checkbox" checked={typeForm.paid} onChange={(event) => setTypeForm({ ...typeForm, paid: event.target.checked })} />
              Paid leave
            </label>
            <label className="att-toggle">
              <input type="checkbox" checked={typeForm.carryForward} onChange={(event) => setTypeForm({ ...typeForm, carryForward: event.target.checked })} />
              Carry unused days into the next year
            </label>
            <label className="att-toggle">
              <input type="checkbox" checked={typeForm.requiresDocument} onChange={(event) => setTypeForm({ ...typeForm, requiresDocument: event.target.checked })} />
              Require a document
            </label>
            <label className="att-toggle">
              <input type="checkbox" checked={typeForm.active} onChange={(event) => setTypeForm({ ...typeForm, active: event.target.checked })} />
              Active for employees
            </label>
          </div>
          <div className="att-actions">
            <button className="btn" disabled={busy} type="submit">{editingId ? 'Save leave type' : 'Add leave type'}</button>
            {editingId && (
              <button className="btn secondary" type="button" onClick={() => { setEditingId(null); setTypeForm(emptyType); }}>
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="att-panel">
        <div className="att-panel-head">
          <h2>Allocations</h2>
        </div>
        <p className="att-sub" style={{ marginBottom: 14 }}>
          Use this when a department or one employee should get a different number of days per period than the leave type default.
        </p>
        <form onSubmit={saveAllocation} className="att-form-grid" style={{ marginBottom: 16 }}>
          <div className="field">
            <label className="label" htmlFor="alloc-type">Leave type</label>
            <select id="alloc-type" className="select" required value={allocationForm.leaveTypeId} onChange={(event) => setAllocationForm({ ...allocationForm, leaveTypeId: event.target.value })}>
              <option value="">Select</option>
              {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="alloc-scope">Applies to</label>
            <select id="alloc-scope" className="select" value={allocationForm.scope} onChange={(event) => setAllocationForm({ ...allocationForm, scope: event.target.value as 'department' | 'employee' })}>
              <option value="department">Department</option>
              <option value="employee">Employee</option>
            </select>
          </div>
          {allocationForm.scope === 'department' ? (
            <div className="field">
              <label className="label" htmlFor="alloc-dept">Department</label>
              <select id="alloc-dept" className="select" required value={allocationForm.departmentId} onChange={(event) => setAllocationForm({ ...allocationForm, departmentId: event.target.value })}>
                <option value="">Select</option>
                {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="field">
              <label className="label" htmlFor="alloc-emp">Employee</label>
              <select id="alloc-emp" className="select" required value={allocationForm.employeeId} onChange={(event) => setAllocationForm({ ...allocationForm, employeeId: event.target.value })}>
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
            <input id="alloc-days" className="input" type="number" min={0} max={366} required value={allocationForm.days} onChange={(event) => setAllocationForm({ ...allocationForm, days: Number(event.target.value) })} />
          </div>
          <div className="field" style={{ alignSelf: 'end' }}>
            <button className="btn" disabled={busy} type="submit">Save allocation</button>
          </div>
        </form>
        {!allocations.length && <p className="empty">No department or employee overrides yet. Everyone uses the leave type default.</p>}
        {!!allocations.length && (
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr><th>Leave</th><th>Target</th><th>Days per period</th><th></th></tr>
              </thead>
              <tbody>
                {allocations.map((row) => (
                  <AllocationRow key={row.id} row={row} busy={busy} onSave={updateAllocationDays} onRemove={removeAllocation} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function AllocationRow({
  row,
  busy,
  onSave,
  onRemove,
}: {
  row: Allocation;
  busy: boolean;
  onSave: (row: Allocation, days: number) => void;
  onRemove: (id: string) => void;
}) {
  const [days, setDays] = useState(row.days);
  useEffect(() => setDays(row.days), [row.days]);
  const target = row.employee
    ? `${row.employee.firstName} ${row.employee.lastName} (${row.employee.employeeCode})`
    : row.department?.name || 'Unknown';

  return (
    <tr>
      <td>{row.leaveType?.name}</td>
      <td>{row.employee ? 'Employee' : 'Department'} · {target}</td>
      <td>
        <input className="input" type="number" min={0} max={366} value={days} onChange={(event) => setDays(Number(event.target.value))} />
      </td>
      <td style={{ display: 'flex', gap: 8 }}>
        <button className="btn secondary" type="button" disabled={busy || days === row.days} onClick={() => onSave(row, days)}>Save</button>
        <button className="btn danger" type="button" disabled={busy} onClick={() => onRemove(row.id)}>Remove</button>
      </td>
    </tr>
  );
}
