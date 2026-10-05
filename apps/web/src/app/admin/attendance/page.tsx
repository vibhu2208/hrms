'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { AttendanceNav } from './nav';

function meters(value: number | null | undefined) {
  return value == null ? '—' : `${Math.round(value)} m`;
}

function clock(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function dayParts(value: string) {
  const date = new Date(value);
  return {
    weekday: date.toLocaleDateString('en-GB', { weekday: 'short' }),
    date: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  };
}

function isMissedClockOut(row: { checkIn?: string | null; checkOut?: string | null; status?: string; approvalStatus?: string }) {
  if (!row?.checkIn || row.checkOut || row.status === 'REJECTED' || row.approvalStatus === 'REJECTED' || row.approvalStatus === 'PENDING') return false;
  return Date.now() - new Date(row.checkIn).getTime() >= 24 * 60 * 60 * 1000;
}

function dayMark(status?: string, overtime?: number | null) {
  const extra = (overtime || 0) > 0;
  if (status === 'EARLY' && extra) return 'Early · Overtime';
  if (status === 'EARLY') return 'Early';
  if (status === 'LATE' && extra) return 'Late · Overtime';
  if (status === 'LATE') return 'Late';
  if (status === 'PRESENT' && extra) return 'Overtime';
  if (status === 'PRESENT') return 'On time';
  return statusLabel(status);
}

function statusLabel(status?: string) {
  if (status === 'EARLY') return 'Early';
  if (status === 'PRESENT') return 'On time';
  if (status === 'OVERTIME') return 'Overtime';
  if (status === 'MISSED') return 'Missed clock-out';
  if (status === 'LATE') return 'Late';
  if (status === 'HALF_DAY') return 'Half day';
  if (status === 'WFH') return 'Remote';
  if (status === 'ABSENT') return 'Absent';
  if (status === 'LEAVE') return 'Leave';
  if (status === 'PENDING_APPROVAL') return 'Pending';
  if (status === 'REJECTED') return 'Rejected';
  return status ? status.replaceAll('_', ' ') : '—';
}

function approvalLabel(status?: string) {
  if (status === 'NOT_REQUIRED') return 'Automatic';
  if (status === 'PENDING') return 'Pending';
  if (status === 'APPROVED') return 'Approved';
  if (status === 'REJECTED') return 'Rejected';
  return status || '—';
}

function dateKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function mapHref(latitude?: number | null, longitude?: number | null) {
  if (latitude == null || longitude == null || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
    return null;
  }
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

function MapLink({ latitude, longitude }: { latitude?: number | null; longitude?: number | null }) {
  const href = mapHref(latitude, longitude);
  if (!href || latitude == null || longitude == null) return '—';
  return (
    <a className="att-map" href={href} target="_blank" rel="noreferrer">
      {Number(latitude).toFixed(5)}, {Number(longitude).toFixed(5)}
    </a>
  );
}

const STATUSES = ['EARLY', 'PRESENT', 'LATE', 'OVERTIME', 'MISSED', 'HALF_DAY', 'WFH', 'ABSENT', 'LEAVE', 'PENDING_APPROVAL', 'REJECTED'];
const APPROVALS = ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'];

let cachedRows: any[] | null = null;

const emptyFilters = { from: '', to: '', employee: '', department: '', status: '', approval: '' };

export default function AdminAttendancePage() {
  const [rows, setRows] = useState<any[]>(() => cachedRows || []);
  const [filters, setFilters] = useState(emptyFilters);
  const load = useCallback(() => {
    api('/attendance')
      .then((next) => {
        cachedRows = next;
        setRows(next);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    window.addEventListener('gs-attendance-changed', load);
    return () => window.removeEventListener('gs-attendance-changed', load);
  }, [load]);

  const summary = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayRows = rows.filter((row) => dateKey(row.date) === today);
    return {
      today: todayRows.length,
      present: todayRows.filter((row) => row.status === 'PRESENT' || row.status === 'EARLY' || row.status === 'LATE' || row.status === 'WFH').length,
      pending: rows.filter((row) => row.approvalStatus === 'PENDING').length,
    };
  }, [rows]);

  const departments = useMemo(() => {
    const names = rows.map((row) => row.employee?.department).filter(Boolean) as string[];
    return [...new Set(names)].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const employee = filters.employee.trim().toLowerCase();
    return rows.filter((row) => {
      const key = dateKey(row.date);
      if (filters.from && key < filters.from) return false;
      if (filters.to && key > filters.to) return false;
      if (filters.department && row.employee?.department !== filters.department) return false;
      if (filters.status === 'MISSED') {
        if (!isMissedClockOut(row)) return false;
      } else if (filters.status === 'OVERTIME') {
        if (!((row.overtimeMinutes || 0) > 0)) return false;
      } else if (filters.status === 'PRESENT') {
        if (row.status !== 'PRESENT' || (row.overtimeMinutes || 0) > 0) return false;
      } else if (filters.status && row.status !== filters.status) return false;
      if (filters.approval && row.approvalStatus !== filters.approval) return false;
      if (employee) {
        const haystack = `${row.employee?.firstName || ''} ${row.employee?.lastName || ''} ${row.employee?.employeeCode || ''}`.toLowerCase();
        if (!haystack.includes(employee)) return false;
      }
      return true;
    });
  }, [rows, filters]);

  const filtering = Object.values(filters).some(Boolean);

  function setFilter(key: keyof typeof emptyFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="att-page">
      <header className="att-head">
        <div>
          <p className="att-kicker">People</p>
          <h1>Attendance</h1>
          <p className="att-sub">Daily records, office checks, and approvals.</p>
        </div>
        <AttendanceNav />
      </header>

      <div className="att-metrics">
        <article className="att-metric">
          <span>Marked today</span>
          <strong>{summary.today}</strong>
        </article>
        <article className="att-metric">
          <span>In today</span>
          <strong>{summary.present}</strong>
        </article>
        <article className="att-metric">
          <span>Waiting on HR</span>
          <strong>{summary.pending}</strong>
        </article>
      </div>

      <section className="att-panel">
        <div className="att-panel-head">
          <h2>Records</h2>
          <span className="att-count">
            {filtering && (
              <button className="att-clear" type="button" onClick={() => setFilters(emptyFilters)}>
                Clear
              </button>
            )}{' '}
            {rows.length ? `${filtered.length} of ${rows.length}` : 'None yet'}
          </span>
        </div>
        {rows.length > 0 && (
          <div className="att-filters">
            <label>
              From
              <input className="input" type="date" value={filters.from} onChange={(event) => setFilter('from', event.target.value)} />
            </label>
            <label>
              To
              <input className="input" type="date" value={filters.to} onChange={(event) => setFilter('to', event.target.value)} />
            </label>
            <label>
              Employee
              <input className="input" value={filters.employee} placeholder="Name or code" onChange={(event) => setFilter('employee', event.target.value)} />
            </label>
            <label>
              Department
              <select className="select" value={filters.department} onChange={(event) => setFilter('department', event.target.value)}>
                <option value="">All</option>
                {departments.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select className="select" value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>
                <option value="">All</option>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>{statusLabel(status)}</option>
                ))}
              </select>
            </label>
            <label>
              Approval
              <select className="select" value={filters.approval} onChange={(event) => setFilter('approval', event.target.value)}>
                <option value="">All</option>
                {APPROVALS.map((status) => (
                  <option key={status} value={status}>{approvalLabel(status)}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        {filtered.length > 0 && (
          <div className="att-table-wrap">
            <table className="att-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>Status</th>
                  <th>Approval</th>
                  <th>Location</th>
                  <th>Distance</th>
                  <th>Network</th>
                  <th>In</th>
                  <th>Out</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const day = dayParts(row.date);
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="att-when">
                          <b>{day.weekday}</b>
                          <span>{day.date}</span>
                        </div>
                      </td>
                      <td>
                        <div className="att-person">
                          <b>{row.employee?.firstName} {row.employee?.lastName}</b>
                          <span>{row.employee?.employeeCode}{row.employee?.department ? ` · ${row.employee.department}` : ''}</span>
                        </div>
                      </td>
                      <td>{isMissedClockOut(row) ? 'Missed clock-out' : dayMark(row.status, row.overtimeMinutes)}</td>
                      <td>{approvalLabel(row.approvalStatus)}</td>
                      <td><MapLink latitude={row.latitude} longitude={row.longitude} /></td>
                      <td>{meters(row.officeDistance)}</td>
                      <td>{row.networkVerified ? 'Verified' : 'Not verified'}</td>
                      <td>{clock(row.checkIn)}</td>
                      <td>{clock(row.checkOut)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && !filtered.length && <p className="att-empty">No records match these filters.</p>}
        {!rows.length && <p className="att-empty">No attendance records yet.</p>}
      </section>
    </div>
  );
}
