'use client';

import Link from 'next/link';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';

type AttendanceRow = {
  id: string;
  date: string;
  status: string;
  checkIn?: string | null;
  checkOut?: string | null;
  workingMinutes?: number | null;
  overtimeMinutes?: number | null;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  approvalStatus?: string;
  exceptionReason?: string | null;
  approvedBy?: { email?: string | null } | null;
  approvedAt?: string | null;
};

type LeaveRow = {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  status: string;
  attachmentUrl?: string | null;
  leaveType?: { name?: string; code?: string };
  approver?: { firstName?: string; lastName?: string } | null;
  updatedAt?: string;
};

type HolidayRow = { id: string; name: string; date: string };

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const LEGEND = [
  ['present', 'Present'],
  ['late', 'Late'],
  ['half', 'Half Day'],
  ['off', 'Day Off'],
  ['holiday', 'Holiday'],
  ['weekend', 'Weekend'],
] as const;

function dayKey(value: string | Date) {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function minutesWorked(row: AttendanceRow) {
  if (row.workingMinutes != null) return row.workingMinutes;
  if (!row.checkIn || !row.checkOut) return 0;
  return Math.max(0, Math.round((new Date(row.checkOut).getTime() - new Date(row.checkIn).getTime()) / 60000));
}

function clock(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function hoursLabel(minutes: number) {
  return `${(minutes / 60).toFixed(2)} hours`;
}

function countedDays(start: Date, end: Date, weekOffs: number[]) {
  const off = new Set(weekOffs);
  let count = 0;
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (!off.has(cursor.getDay())) count += 1;
  }
  return count;
}

function overtimeLabel(minutes: number) {
  const safe = Math.max(0, minutes);
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function averageClock(values: string[]) {
  if (!values.length) return '—';
  const total = values.reduce((sum, value) => {
    const date = new Date(value);
    return sum + date.getHours() * 60 + date.getMinutes();
  }, 0);
  const avg = Math.round(total / values.length);
  const date = new Date();
  date.setHours(Math.floor(avg / 60), avg % 60, 0, 0);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function employmentLabel(value?: string | null) {
  if (value === 'PART_TIME') return 'Part time';
  if (value === 'CONTRACT') return 'Contract';
  if (value === 'INTERN') return 'Intern';
  return 'Full time';
}

function statusCopy(status: string, overtimeMinutes?: number | null) {
  const overtime = (overtimeMinutes || 0) > 0;
  if (status === 'WFH') return { label: 'Work From Home', tone: 'wfh' };
  if (status === 'EARLY') return { label: overtime ? 'Early · Overtime' : 'Early', tone: 'ontime' };
  if (status === 'LATE') return { label: overtime ? 'Late · Overtime' : 'Late', tone: 'late' };
  if (status === 'HALF_DAY') return { label: 'Half Day', tone: 'half' };
  if (status === 'ABSENT' || status === 'REJECTED') return { label: 'Absent', tone: 'absent' };
  if (status === 'HOLIDAY') return { label: 'Holiday', tone: 'holiday' };
  if (status === 'LEAVE') return { label: 'Day Off', tone: 'off' };
  if (status === 'PENDING_APPROVAL') return { label: 'Pending', tone: 'pending' };
  if (status === 'PRESENT' && overtime) return { label: 'Overtime', tone: 'ontime' };
  return { label: 'On Time', tone: 'ontime' };
}

function markFor(status?: string) {
  if (!status) return 'blank';
  if (status === 'LATE') return 'late';
  if (status === 'HALF_DAY') return 'half';
  if (status === 'LEAVE') return 'off';
  if (status === 'HOLIDAY') return 'holiday';
  if (status === 'ABSENT' || status === 'REJECTED') return 'absent';
  if (status === 'PRESENT' || status === 'EARLY' || status === 'WFH') return 'present';
  return 'blank';
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Icon({ d, children }: { d?: string; children?: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {d ? <path d={d} /> : children}
    </svg>
  );
}

function CalendarIcon() {
  return (
    <Icon>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </Icon>
  );
}

function ChevronIcon() {
  return <Icon d="M6 9l6 6 6-6" />;
}

function SearchIcon() {
  return (
    <Icon>
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    </Icon>
  );
}

function DownloadIcon() {
  return <Icon d="M12 4v10M8 10l4 4 4-4M5 19h14" />;
}

function DocIcon() {
  return <Icon d="M7 3.5h7l4 4V20.5H7zM14 3.5V8h4.5" />;
}

function CheckIcon() {
  return <Icon d="M6 12.5l4 4L18 8" />;
}

function StarIcon() {
  return <Icon d="M12 3.5l2.2 4.6 5 .7-3.6 3.5.9 5.1L12 15.2 7.5 17.4l.9-5.1L4.8 8.8l5-.7z" />;
}

function RefreshIcon() {
  return (
    <Icon>
      <path d="M20 12a8 8 0 1 1-2.2-5.5" />
      <path d="M20 4v5h-5" />
    </Icon>
  );
}

function PencilIcon() {
  return (
    <Icon>
      <path d="M4 20l4.2-1 9.5-9.5-3.2-3.2L5 15.8 4 20z" />
      <path d="M13.2 6.6l3.2 3.2" />
    </Icon>
  );
}

function DayMark({ mark }: { mark: string }) {
  const icon =
    mark === 'present' ? <CheckIcon /> : mark === 'holiday' ? <StarIcon /> : mark === 'absent' ? <Icon d="M7 12h10" /> : null;
  return <span className={`hr-dot ${mark}`}>{icon}</span>;
}

function MonthMenu({
  year,
  month,
  onChange,
}: {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(year);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="hr-picker" ref={ref}>
      <button
        className="hr-month"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setViewYear(year);
          setOpen((current) => !current);
        }}
      >
        <CalendarIcon />
        <span>{MONTHS[month]} {year}</span>
        <ChevronIcon />
      </button>
      {open && (
        <div className="hr-picker-panel" role="dialog" aria-label="Choose month">
          <div className="hr-picker-nav">
            <button type="button" aria-label="Previous year" onClick={() => setViewYear((value) => value - 1)}>
              <Icon d="M14 6l-6 6 6 6" />
            </button>
            <strong>{viewYear}</strong>
            <button type="button" aria-label="Next year" onClick={() => setViewYear((value) => value + 1)}>
              <Icon d="M10 6l6 6-6 6" />
            </button>
          </div>
          <div className="hr-picker-grid">
            {MONTHS.map((label, index) => (
              <button
                key={label}
                type="button"
                className={viewYear === year && index === month ? 'on' : ''}
                onClick={() => {
                  onChange(viewYear, index);
                  setOpen(false);
                }}
              >
                {label.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function EmployeeAttendanceProfile({
  employee,
  canEdit,
  onBack,
  onEdit,
  onAddDocument,
  addOpen = false,
  onCloseAdd,
  children,
}: {
  employee: any;
  canEdit: boolean;
  onBack: () => void;
  onEdit: () => void;
  onAddDocument?: () => void;
  addOpen?: boolean;
  onCloseAdd?: () => void;
  children?: ReactNode;
}) {
  const currentYear = new Date().getFullYear();
  const [cursor, setCursor] = useState({ year: currentYear, month: new Date().getMonth() });
  const [statYear, setStatYear] = useState(currentYear);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [weekOffs, setWeekOffs] = useState<number[]>([0, 6]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'timecard' | 'timeline'>('timecard');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortKey, setSortKey] = useState<'date' | 'hours'>('date');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [docsOpen, setDocsOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(''), 4500);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!docsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (addOpen) onCloseAdd?.();
      else setDocsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [docsOpen, addOpen, onCloseAdd]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [records, holidayRows, leaveRows, weekOff] = await Promise.all([
      api<AttendanceRow[]>(`/attendance/employee/${employee.id}`).catch((err: any) => {
        setError(err.message || 'Could not load attendance');
        return [] as AttendanceRow[];
      }),
      api<HolidayRow[]>('/org/holidays').catch(() => [] as HolidayRow[]),
      api<LeaveRow[]>('/leave').catch(() => [] as LeaveRow[]),
      api<{ days: number[] }>('/leave/week-off').catch(() => ({ days: [0, 6] })),
    ]);
    setAttendance(records);
    setHolidays(holidayRows);
    setLeaves(leaveRows.filter((row) => row.employeeId === employee.id));
    if (Array.isArray(weekOff.days)) setWeekOffs(weekOff.days);
    setLoading(false);
  }, [employee.id]);

  useEffect(() => {
    load();
  }, [load]);

  const name = `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'Employee';
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase() || '')
    .join('');

  const stats = useMemo(() => {
    const rows = attendance.filter((row) => new Date(row.date).getFullYear() === statYear);
    const counted = rows.filter((row) =>
      ['PRESENT', 'EARLY', 'LATE', 'WFH', 'HALF_DAY'].includes(row.status) && row.approvalStatus !== 'REJECTED',
    );
    const overtime = counted.reduce((sum, row) => sum + Math.max(0, minutesWorked(row) - 8 * 60), 0);
    return {
      total: counted.length,
      overtime,
      clockIn: averageClock(counted.map((row) => row.checkIn).filter(Boolean) as string[]),
      clockOut: averageClock(counted.map((row) => row.checkOut).filter(Boolean) as string[]),
    };
  }, [attendance, statYear]);

  const monthDays = useMemo(() => {
    const count = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const byDate = new Map(attendance.map((row) => [dayKey(row.date), row]));
    const holidaySet = new Set(holidays.map((row) => dayKey(row.date)));
    const leaveDays = new Set<string>();
    leaves
      .filter((row) => row.status === 'APPROVED' || row.status === 'PENDING')
      .forEach((row) => {
        const start = parseKey(dayKey(row.startDate));
        const end = parseKey(dayKey(row.endDate));
        for (let cursorDate = new Date(start); cursorDate <= end; cursorDate.setDate(cursorDate.getDate() + 1)) {
          leaveDays.add(dayKey(cursorDate));
        }
      });
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(cursor.year, cursor.month, index + 1);
      const key = dayKey(date);
      const weekend = weekOffs.includes(date.getDay());
      const record = byDate.get(key);
      let mark = 'blank';
      if (record) mark = markFor(record.status);
      else if (holidaySet.has(key)) mark = 'holiday';
      else if (weekend) mark = 'weekend';
      else if (leaveDays.has(key)) mark = 'off';
      return { day: index + 1, mark };
    });
  }, [attendance, cursor, holidays, leaves, weekOffs]);

  const history = useMemo(() => {
    const monthStart = new Date(cursor.year, cursor.month, 1);
    const monthEnd = new Date(cursor.year, cursor.month + 1, 0, 23, 59, 59);
    const items: Array<
      | { id: string; date: string; kind: 'attendance'; row: AttendanceRow }
      | { id: string; date: string; kind: 'leave'; leave: LeaveRow }
      | { id: string; date: string; kind: 'weekoff' }
      | { id: string; date: string; kind: 'holiday'; name: string }
    > = [];
    const marked = new Set<string>();
    attendance.forEach((row) => {
      const date = new Date(row.date);
      if (date >= monthStart && date <= monthEnd) {
        marked.add(dayKey(row.date));
        items.push({ id: row.id, date: row.date, kind: 'attendance', row });
      }
    });
    leaves.forEach((leave) => {
      if (leave.status === 'REJECTED' || leave.status === 'CANCELLED') return;
      const start = new Date(leave.startDate);
      const end = new Date(leave.endDate);
      if (end < monthStart || start > monthEnd) return;
      items.push({ id: leave.id, date: leave.startDate, kind: 'leave', leave });
    });
    const holidayByDay = new Map(holidays.map((row) => [dayKey(row.date), row.name]));
    const daysInMonth = monthEnd.getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(cursor.year, cursor.month, day);
      const key = dayKey(date);
      if (marked.has(key)) continue;
      const iso = new Date(Date.UTC(cursor.year, cursor.month, day)).toISOString();
      if (weekOffs.includes(date.getDay())) {
        items.push({ id: `weekoff-${key}`, date: iso, kind: 'weekoff' });
      } else if (holidayByDay.has(key)) {
        items.push({ id: `holiday-${key}`, date: iso, kind: 'holiday', name: holidayByDay.get(key) || 'Holiday' });
      }
    }
    const q = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (item.kind === 'weekoff') {
        if (statusFilter !== 'ALL' && statusFilter !== 'WEEKEND') return false;
        return !q || 'week off weekend'.includes(q) || dayKey(item.date).includes(q);
      }
      if (item.kind === 'holiday') {
        if (statusFilter !== 'ALL' && statusFilter !== 'HOLIDAY') return false;
        return !q || item.name.toLowerCase().includes(q) || 'holiday'.includes(q) || dayKey(item.date).includes(q);
      }
      if (item.kind === 'leave') {
        if (statusFilter !== 'ALL' && statusFilter !== 'LEAVE') return false;
        const label = `${item.leave.leaveType?.name || ''} ${item.leave.reason || ''} time off`;
        return !q || label.toLowerCase().includes(q) || dayKey(item.date).includes(q);
      }
      if (statusFilter !== 'ALL' && item.row.status !== statusFilter) return false;
      const copy = statusCopy(item.row.status, item.row.overtimeMinutes).label;
      return !q || `${copy} ${item.row.notes || ''} ${item.row.status}`.toLowerCase().includes(q) || dayKey(item.date).includes(q);
    });
    filtered.sort((a, b) => {
      if (sortKey === 'hours') {
        const left = a.kind === 'attendance' ? minutesWorked(a.row) : 0;
        const right = b.kind === 'attendance' ? minutesWorked(b.row) : 0;
        return (left - right) * (sortDir === 'asc' ? 1 : -1);
      }
      return (new Date(a.date).getTime() - new Date(b.date).getTime()) * (sortDir === 'asc' ? 1 : -1);
    });
    return filtered;
  }, [attendance, cursor, holidays, leaves, query, sortDir, sortKey, statusFilter, weekOffs]);

  const years = useMemo(() => {
    const found = new Set<number>([currentYear, statYear]);
    attendance.forEach((row) => found.add(new Date(row.date).getFullYear()));
    return Array.from(found).sort((a, b) => b - a);
  }, [attendance, currentYear, statYear]);

  function toggleSort(key: 'date' | 'hours') {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'date' ? 'desc' : 'desc');
  }

  function downloadInfo() {
    downloadCsv(`${employee.employeeCode || 'employee'}-profile.csv`, [
      ['Field', 'Value'],
      ['Employee code', employee.employeeCode || ''],
      ['Name', name],
      ['Role', employee.designation?.name || ''],
      ['Department', employee.department?.name || ''],
      ['Email', employee.user?.email || ''],
      ['Phone', employee.phone || ''],
      ['Employment', employmentLabel(employee.employmentType)],
      ['Year', String(statYear)],
      ['Total attendance', String(stats.total)],
      ['Overtime minutes', String(stats.overtime)],
      ['Average clock-in', stats.clockIn],
      ['Average clock-out', stats.clockOut],
    ]);
  }

  function downloadReport() {
    downloadCsv(`${employee.employeeCode || 'employee'}-${MONTHS[cursor.month]}-${cursor.year}-attendance.csv`, [
      ['Date', 'Status', 'Clock-in', 'Clock-out', 'Overtime', 'Working hours', 'Notes'],
      ...history.map((item) => {
        if (item.kind === 'weekoff') return [dayKey(item.date), 'Week off', '', '', '', '', ''];
        if (item.kind === 'holiday') return [dayKey(item.date), 'Holiday', '', '', '', '', item.name];
        if (item.kind === 'leave') {
          return [
            dayKey(item.date),
            'Time off',
            '',
            '',
            '',
            '',
            item.leave.leaveType?.name || item.leave.reason || '',
          ];
        }
        const minutes = minutesWorked(item.row);
        return [
          dayKey(item.date),
          statusCopy(item.row.status, item.row.overtimeMinutes).label,
          clock(item.row.checkIn),
          clock(item.row.checkOut),
          overtimeLabel(item.row.overtimeMinutes ?? Math.max(0, minutes - 8 * 60)),
          minutes ? hoursLabel(minutes) : '',
          item.row.notes || '',
        ];
      }),
    ]);
  }

  return (
    <div className="hr-page">
      <header className="hr-head">
        <div>
          <button className="hr-back" type="button" onClick={onBack}>
            ← Employee list
          </button>
          <h1>Human Resource</h1>
          <p>Track employee attendance accurately and manage time effortlessly.</p>
        </div>
        <div className="hr-head-actions">
          <button className="hr-icon" type="button" aria-label="Refresh attendance" onClick={load} disabled={loading}>
            <RefreshIcon />
          </button>
          <MonthMenu
            year={cursor.year}
            month={cursor.month}
            onChange={(year, month) => setCursor({ year, month })}
          />
          <Link className="hr-primary" href="/admin/leave">
            <Icon d="M12 5v14M5 12h14" />
            Add Time Off
          </Link>
        </div>
      </header>

      {error && (
        <div className="emp-toasts" role="status" aria-live="polite">
          <div className="emp-toast bad">{error}</div>
        </div>
      )}

      <section className="hr-hero">
        <article className="hr-card hr-identity">
          <div className="hr-card-top">
            <h2><span className="hr-pip" /> Employee Details</h2>
            <div className="hr-card-actions">
              {canEdit && (
                <button className="hr-icon" type="button" aria-label="Edit employee" onClick={onEdit}>
                  <PencilIcon />
                </button>
              )}
              <label className="hr-year">
                <CalendarIcon />
                <select aria-label="Stats year" value={statYear} onChange={(event) => setStatYear(Number(event.target.value))}>
                  {years.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
                <ChevronIcon />
              </label>
              <button className="hr-docs-btn" type="button" onClick={() => setDocsOpen(true)}>
                <DocIcon />
                Documents
              </button>
              <button className="hr-primary" type="button" onClick={downloadInfo}>
                <DownloadIcon />
                Download Info
              </button>
            </div>
          </div>
          <div className="hr-person">
            <div className="hr-avatar" aria-hidden>
              {employee.photoPreviewUrl ? (
                <img src={employee.photoPreviewUrl} alt="" />
              ) : (
                <span>{initials || 'E'}</span>
              )}
              <em>{employmentLabel(employee.employmentType)}</em>
            </div>
            <div className="hr-person-body">
              <div className="hr-person-name">
                <strong>{name}</strong>
                <span>{employee.employeeCode}</span>
              </div>
              <div className="hr-person-meta">
                <div>
                  <small>Role</small>
                  <b>{employee.designation?.name || '—'}</b>
                </div>
                <div>
                  <small>Email Address</small>
                  <b>{employee.user?.email || '—'}</b>
                </div>
                <div>
                  <small>Phone Number</small>
                  <b>{employee.phone || '—'}</b>
                </div>
              </div>
            </div>
          </div>
        </article>
        <div className="hr-metrics">
          <article>
            <span>Total Attendance</span>
            <strong>{stats.total}</strong>
            <em>attendance</em>
          </article>
          <article>
            <span>Overtime</span>
            <strong>{stats.overtime}</strong>
            <em>mins</em>
          </article>
          <article>
            <span>Avg Clock-in</span>
            <strong>{stats.clockIn}</strong>
          </article>
          <article>
            <span>Avg Clock-out</span>
            <strong>{stats.clockOut}</strong>
          </article>
        </div>
      </section>

      <section className="hr-card">
        <div className="hr-card-top">
          <h2>Attendance</h2>
          <div className="hr-legend">
            {LEGEND.map(([tone, label]) => (
              <span key={tone}><DayMark mark={tone} /> {label}</span>
            ))}
          </div>
        </div>
        <div className="hr-strip-wrap">
          <button
            className="hr-scroll"
            type="button"
            aria-label="Previous days"
            onClick={() => stripRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}
          >
            <Icon d="M14 6l-6 6 6 6" />
          </button>
          <div className="hr-strip" ref={stripRef}>
            {monthDays.map((day) => (
              <div key={day.day} className={`hr-day${day.mark === 'weekend' ? ' is-off' : ''}`}>
                <span>{String(day.day).padStart(2, '0')}</span>
                <DayMark mark={day.mark} />
                <em>{day.mark === 'weekend' ? 'Off' : ''}</em>
              </div>
            ))}
          </div>
          <button
            className="hr-scroll"
            type="button"
            aria-label="Next days"
            onClick={() => stripRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}
          >
            <Icon d="M10 6l6 6-6 6" />
          </button>
        </div>
      </section>

      <section className="hr-card">
        <div className="hr-card-top">
          <h2>Attendance History</h2>
          <div className="hr-card-actions">
            <button className="hr-icon" type="button" aria-label="Refresh history" onClick={load} disabled={loading}>
              <RefreshIcon />
            </button>
            <button className="hr-primary" type="button" onClick={downloadReport}>
              <DownloadIcon />
              Download Report
            </button>
          </div>
        </div>
        <div className="hr-history-tools">
          <div className="hr-tabs" role="tablist">
            <button type="button" className={tab === 'timecard' ? 'on' : ''} onClick={() => setTab('timecard')}>
              Timecard
            </button>
            <button type="button" className={tab === 'timeline' ? 'on' : ''} onClick={() => setTab('timeline')}>
              Timeline
            </button>
          </div>
          <label className="hr-search">
            <SearchIcon />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." aria-label="Search attendance" />
          </label>
          <button className={`hr-ghost${filterOpen || statusFilter !== 'ALL' ? ' on' : ''}`} type="button" onClick={() => setFilterOpen((open) => !open)}>
            <Icon d="M4 6h16M7 12h10M10 18h4" />
            Filter
          </button>
          <button className={`hr-ghost${sortKey === 'date' ? ' on' : ''}`} type="button" onClick={() => toggleSort('date')}>
            <Icon d="M8 7h8M6 12h12M9 17h6" />
            Sort date
          </button>
          <button className={`hr-ghost${sortKey === 'hours' ? ' on' : ''}`} type="button" onClick={() => toggleSort('hours')}>
            <Icon d="M8 7h8M6 12h12M9 17h6" />
            Sort hours
          </button>
        </div>
        {filterOpen && (
          <div className="hr-filter">
            <label>
              Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="ALL">All</option>
                <option value="EARLY">Early</option>
                <option value="PRESENT">On time</option>
                <option value="LATE">Late</option>
                <option value="WFH">Work from home</option>
                <option value="HALF_DAY">Half day</option>
                <option value="ABSENT">Absent</option>
                <option value="LEAVE">Time off</option>
                <option value="WEEKEND">Week off</option>
                <option value="HOLIDAY">Holiday</option>
              </select>
            </label>
          </div>
        )}

        {loading && <p className="hr-empty">Loading attendance…</p>}
        {!loading && history.length === 0 && <p className="hr-empty">No attendance for {MONTHS[cursor.month]} {cursor.year}.</p>}

        {!loading && tab === 'timecard' && history.length > 0 && (
          <div className="hr-table-wrap">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Working Hours</th>
                  <th>Status</th>
                  <th>Time Break</th>
                  <th>Clock-in</th>
                  <th>Clock-out</th>
                  <th>Over Time</th>
                  <th>Working Hours</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => {
                  if (item.kind === 'weekoff' || item.kind === 'holiday') {
                    const date = new Date(item.date);
                    const label = item.kind === 'weekoff' ? 'Week off' : item.name;
                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="hr-date">
                            <b>{date.toLocaleDateString(undefined, { weekday: 'short' })}</b>
                            <span>{date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          </div>
                        </td>
                        <td>—</td>
                        <td><span className={`hr-status ${item.kind === 'weekoff' ? 'off' : 'holiday'}`}>{label}</span></td>
                        <td className="muted-cell">—</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                      </tr>
                    );
                  }
                  if (item.kind === 'leave') {
                    const start = parseKey(dayKey(item.leave.startDate));
                    const end = parseKey(dayKey(item.leave.endDate));
                    const days = countedDays(start, end, weekOffs);
                    const approver = [item.leave.approver?.firstName, item.leave.approver?.lastName].filter(Boolean).join(' ');
                    return (
                      <tr key={item.id} className="hr-leave-row">
                        <td>
                          <div className="hr-date">
                            <b>{start.toLocaleDateString(undefined, { weekday: 'short' })}</b>
                            <span>{start.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          </div>
                        </td>
                        <td colSpan={8}>
                          <div className="hr-leave">
                            <span className="hr-leave-mark">M</span>
                            <div>
                              <strong>Time Off</strong>
                              <small>{approver ? `Approved by ${approver}` : item.leave.status === 'PENDING' ? 'Waiting for approval' : 'Recorded leave'}</small>
                            </div>
                            <div>
                              <small>Approved On</small>
                              <b>{item.leave.updatedAt ? new Date(item.leave.updatedAt).toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</b>
                            </div>
                            <div>
                              <small>Duration</small>
                              <b>{days} day{days === 1 ? '' : 's'}</b>
                            </div>
                            <div>
                              <small>Type</small>
                              <b>{item.leave.leaveType?.name || 'Leave'}</b>
                            </div>
                            <div>
                              <small>Note</small>
                              <b>{item.leave.reason || '—'}</b>
                            </div>
                            {item.leave.attachmentUrl && (
                              <a href={item.leave.attachmentUrl} target="_blank" rel="noreferrer">
                                {item.leave.leaveType?.name || 'Leave'} file
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  const minutes = minutesWorked(item.row);
                  const overtime = item.row.overtimeMinutes ?? Math.max(0, minutes - 8 * 60);
                  const copy = statusCopy(item.row.status, item.row.overtimeMinutes);
                  const date = new Date(item.row.date);
                  const map = item.row.latitude != null && item.row.longitude != null
                    ? `https://www.google.com/maps?q=${item.row.latitude},${item.row.longitude}`
                    : '';
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="hr-date">
                          <b>{date.toLocaleDateString(undefined, { weekday: 'short' })}</b>
                          <span>{date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        </div>
                      </td>
                      <td>
                        <div className="hr-hours">
                          <b>{minutes ? hoursLabel(minutes) : '—'}</b>
                          {item.row.checkIn && item.row.checkOut && (
                            <small>{clock(item.row.checkIn)} – {clock(item.row.checkOut)}</small>
                          )}
                        </div>
                      </td>
                      <td><span className={`hr-status ${copy.tone}`}>{copy.label}</span></td>
                      <td className="muted-cell">—</td>
                      <td>{clock(item.row.checkIn)}</td>
                      <td>{clock(item.row.checkOut)}</td>
                      <td>{item.row.checkOut ? overtimeLabel(overtime) : '—'}</td>
                      <td>{minutes ? hoursLabel(minutes) : '—'}</td>
                      <td>
                        {map ? (
                          <a className="hr-map" href={map} target="_blank" rel="noreferrer">
                            {Number(item.row.latitude).toFixed(5)}, {Number(item.row.longitude).toFixed(5)}
                          </a>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && tab === 'timeline' && history.length > 0 && (
          <ol className="hr-timeline">
            {history.map((item) => {
              if (item.kind === 'weekoff' || item.kind === 'holiday') {
                return (
                  <li key={item.id}>
                    <time>{new Date(item.date).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}</time>
                    <div>
                      <strong>{item.kind === 'weekoff' ? 'Week off' : item.name}</strong>
                      <span>{item.kind === 'weekoff' ? 'Weekly off' : 'Public holiday'}</span>
                    </div>
                  </li>
                );
              }
              if (item.kind === 'leave') {
                return (
                  <li key={item.id}>
                    <time>{new Date(item.date).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}</time>
                    <div>
                      <strong>Time off · {item.leave.leaveType?.name || 'Leave'}</strong>
                      <span>{item.leave.reason || item.leave.status}</span>
                    </div>
                  </li>
                );
              }
              const copy = statusCopy(item.row.status, item.row.overtimeMinutes);
              const minutes = minutesWorked(item.row);
              return (
                <li key={item.id}>
                  <time>{new Date(item.row.date).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}</time>
                  <div>
                    <strong>{copy.label}</strong>
                    <span>
                      {clock(item.row.checkIn)} – {clock(item.row.checkOut)}
                      {minutes ? ` · ${hoursLabel(minutes)}` : ''}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {docsOpen && (
        <div className="hr-modal" role="dialog" aria-modal="true" aria-label="Documents" onMouseDown={() => setDocsOpen(false)}>
          <div className="hr-docs-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="hr-docs-head">
              <div>
                <h2>Documents</h2>
                <p>{name}{employee.employeeCode ? ` · ${employee.employeeCode}` : ''}</p>
              </div>
              <div className="hr-docs-actions">
                {onAddDocument && (
                  <button className="btn" type="button" onClick={onAddDocument}>Add document</button>
                )}
                <button className="btn secondary" type="button" onClick={() => { setDocsOpen(false); onCloseAdd?.(); }}>Close</button>
              </div>
            </div>
            {children || <p className="muted">No documents yet</p>}
          </div>
        </div>
      )}
    </div>
  );
}
