'use client';

import { useEffect, useState } from 'react';
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

const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

function sameDays(left: number[], right: number[]) {
  return left.length === right.length && [...left].sort().every((day, index) => day === [...right].sort()[index]);
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
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [weekOffs, setWeekOffs] = useState<number[]>([0, 6]);
  const [savedWeekOffs, setSavedWeekOffs] = useState<number[]>([0, 6]);

  async function load() {
    const [typeRows, allocationRows, weekOff] = await Promise.all([
      api<LeaveType[]>('/leave/types'),
      api<Allocation[]>('/leave/allocations'),
      api<{ days: number[] }>('/leave/week-off'),
    ]);
    setTypes(typeRows);
    setAllocations(allocationRows);
    const days = Array.isArray(weekOff.days) ? weekOff.days : [0, 6];
    setWeekOffs(days);
    setSavedWeekOffs(days);
  }

  useEffect(() => {
    const canEdit = hasAnyRole(getStoredUser()?.role?.code, ['OWNER', 'HR']);
    setAllowed(canEdit);
    setReady(true);
    if (!canEdit) return;
    load().catch((error: Error) => setMsg(error.message));

    function onChanged(event: Event) {
      const detail = (event as CustomEvent<string>).detail;
      if (detail) setMsg(detail);
      load().catch((error: Error) => setMsg(error.message));
    }
    window.addEventListener('gs-leave-changed', onChanged);
    return () => window.removeEventListener('gs-leave-changed', onChanged);
  }, []);

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

  function toggleWeekOff(day: number) {
    setWeekOffs((current) => {
      const next = current.includes(day) ? current.filter((value) => value !== day) : [...current, day];
      return next.sort((left, right) => left - right);
    });
  }

  async function saveWeekOff() {
    if (weekOffs.length > 6) {
      setMsg('At least one weekday must be a working day.');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const saved = await api<{ days: number[] }>('/leave/week-off', {
        method: 'PUT',
        body: JSON.stringify({ days: weekOffs }),
      });
      setWeekOffs(saved.days);
      setSavedWeekOffs(saved.days);
      setMsg('Week off updated. Leave days no longer include these days.');
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
          <h2>Week off</h2>
        </div>
        <p className="att-sub" style={{ marginBottom: 14 }}>
          Choose the days that are off every week. Leave requests count only the other days.
        </p>
        <div className="week-off-days" role="group" aria-label="Weekly off days">
          {WEEKDAYS.map((day) => {
            const on = weekOffs.includes(day.value);
            return (
              <button
                key={day.value}
                className={on ? 'btn' : 'btn secondary'}
                type="button"
                aria-pressed={on}
                onClick={() => toggleWeekOff(day.value)}
              >
                {day.label}
              </button>
            );
          })}
        </div>
        <div className="att-actions">
          <button
            className="btn"
            type="button"
            disabled={busy || sameDays(weekOffs, savedWeekOffs)}
            onClick={saveWeekOff}
          >
            Save week off
          </button>
        </div>
      </section>

      <section className="att-panel">
        <div className="att-panel-head">
          <h2>Leave types</h2>
        </div>
        <p className="att-sub" style={{ marginBottom: 14 }}>
          A personal allocation wins over a department allocation, which wins over this default.
          Yearly grants the days once. Monthly multiplies them by 12. Quarterly multiplies them by 4.
        </p>
        {!types.length && <p className="empty">No leave types yet. Use Add leave to create one.</p>}
        {!!types.length && (
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
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
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={() => window.dispatchEvent(new CustomEvent('gs-open-leave-type', { detail: type }))}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="att-panel">
        <div className="att-panel-head">
          <h2>Allocations</h2>
        </div>
        <p className="att-sub" style={{ marginBottom: 14 }}>
          Use Add allocation when a department or one employee should get a different number of days than the leave type default.
        </p>
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
