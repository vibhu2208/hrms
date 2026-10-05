'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';
import { UpcomingMeetings } from '@/components/upcoming-meetings';

type Overview = {
  employees: number;
  taskStats?: { completionPct?: number; pending?: number; overdue?: number; total?: number };
  recruitment?: { open?: number; delayed?: number };
  invoices?: number;
  leads?: number;
  orders?: number;
  overdueInvoices?: number;
};

function todayUtcIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString();
}

function initials(first?: string, last?: string) {
  return `${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase() || '?';
}

function relativeTime(value?: string) {
  if (!value) return '';
  const then = new Date(value);
  const diff = Date.now() - then.getTime();
  if (Number.isNaN(diff)) return '';
  if (diff < 0) return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const min = Math.round(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function dueLabel(value?: string) {
  if (!value) return 'No due date';
  const due = new Date(value);
  if (due.toDateString() === new Date().toDateString()) return 'Due today';
  return `Due ${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function taskProgress(task: any) {
  const items = task.checklistItems || [];
  if (items.length) {
    const done = items.filter((item: any) => item.completed).length;
    return Math.round((done / items.length) * 100);
  }
  if (task.status === 'OVERDUE') return 20;
  if (String(task.status || '').startsWith('COMPLETED')) return 100;
  return 40;
}

function taskStatus(task: any, progress: number) {
  if (String(task.status || '').startsWith('COMPLETED')) return { label: 'Done', badge: 'green' };
  if (task.status === 'OVERDUE') return { label: 'Overdue', badge: 'red' };
  if (progress > 0 && progress < 100 && task.checklistItems?.length) return { label: 'In Progress', badge: 'green' };
  return { label: 'Pending', badge: 'amber' };
}

function teamStatus(status?: string) {
  switch (status) {
    case 'EARLY':
      return { label: 'Early', pill: '' };
    case 'PRESENT':
    case 'HALF_DAY':
      return { label: 'Work From Office', pill: '' };
    case 'WFH':
      return { label: 'Work From Home', pill: '' };
    case 'LATE':
      return { label: 'Late', pill: 'amber' };
    case 'LEAVE':
    case 'HOLIDAY':
      return { label: 'On Leave', pill: 'amber' };
    case 'ABSENT':
    case 'REJECTED':
      return { label: 'Absent', pill: 'red' };
    case 'PENDING_APPROVAL':
      return { label: 'Pending', pill: 'amber' };
    default:
      return { label: 'Not marked', pill: 'gray' };
  }
}

function tally(rows: any[]) {
  const counts = { present: 0, absent: 0, late: 0, leave: 0 };
  for (const row of rows) {
    const status = row.status;
    if (status === 'PRESENT' || status === 'EARLY' || status === 'HALF_DAY' || status === 'WFH') counts.present += 1;
    else if (status === 'ABSENT' || status === 'REJECTED') counts.absent += 1;
    else if (status === 'LATE') counts.late += 1;
    else if (status === 'LEAVE' || status === 'HOLIDAY') counts.leave += 1;
  }
  const marked = rows.length;
  const working = counts.present + counts.late;
  const rate = marked ? Math.round((working / marked) * 100) : 0;
  return { ...counts, marked, rate };
}

async function optional<T>(path: string): Promise<T | null> {
  try {
    return await api<T>(path);
  } catch {
    return null;
  }
}

function downloadCsv(rows: string[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'go-staff-dashboard.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminDashboard() {
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [attendance, setAttendance] = useState<any[] | null>(null);
  const [leave, setLeave] = useState<any[] | null>(null);
  const [onboarding, setOnboarding] = useState<any[] | null>(null);
  const [employees, setEmployees] = useState<any[] | null>(null);
  const [notifications, setNotifications] = useState<any[] | null>(null);
  const [approvals, setApprovals] = useState<any[] | null>(null);
  const [welcomeName, setWelcomeName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [activityOpen, setActivityOpen] = useState(false);
  const [centerPane, setCenterPane] = useState<'tasks' | 'actions'>('tasks');
  const activityRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = getStoredUser();
    if (stored?.employee) {
      setWelcomeName(`${stored.employee.firstName} ${stored.employee.lastName}`);
      setEmployeeId(stored.employee.id);
    } else if (stored?.email) setWelcomeName(stored.email);
  }, []);

  useEffect(() => {
    let cancel = false;
    const date = todayUtcIso();
    const load = <T,>(path: string, apply: (value: T | null) => void) => {
      optional<T>(path).then((value) => {
        if (!cancel) apply(value);
      });
    };
    load<any[]>('/tasks?open=true', (rows) => setTasks(rows ?? []));
    load<any[]>(`/attendance?date=${encodeURIComponent(date)}`, (rows) => setAttendance(rows ?? []));
    load<any[]>('/leave/pending', (rows) => setLeave(rows ?? []));
    load<any[]>('/onboarding/pending', (rows) => setOnboarding(rows ?? []));
    load<any[]>('/employees', (rows) => setEmployees(rows ?? []));
    load<any[]>('/notifications', (rows) => setNotifications(rows ?? []));
    load<any[]>('/attendance/approvals', (rows) => setApprovals(rows ?? []));
    return () => {
      cancel = true;
    };
  }, []);

  const attendanceStats = useMemo(() => tally(attendance || []), [attendance]);
  const openTaskList = useMemo(
    () => (tasks || []).filter((task) => task.status === 'PENDING' || task.status === 'OVERDUE'),
    [tasks],
  );
  const openTasks = openTaskList.slice(0, 4);
  const myTaskList = useMemo(
    () =>
      (tasks || []).filter((task) => {
        const mine = task.assigneeId === employeeId || task.assignee?.id === employeeId;
        return mine && (task.status === 'PENDING' || task.status === 'OVERDUE');
      }),
    [tasks, employeeId],
  );
  const myTasks = myTaskList.slice(0, 4);
  const activity = useMemo(() => {
    const items: { id: string; title: string; name: string; time: string }[] = [];
    for (const note of notifications || []) {
      items.push({ id: note.id, title: note.title, name: note.body || '', time: note.createdAt });
    }
    const cutoff = Date.now() - 45 * 24 * 60 * 60 * 1000;
    for (const person of employees || []) {
      if (new Date(person.joiningDate).getTime() < cutoff) continue;
      items.push({
        id: `join-${person.id}`,
        title: 'Employee joined',
        name: `${person.firstName} ${person.lastName}`,
        time: person.joiningDate,
      });
    }
    for (const row of attendance || []) {
      if (!row.checkIn) continue;
      const person = row.employee || {};
      items.push({
        id: `att-${row.id}`,
        title: 'Attendance updated',
        name: `${person.firstName || ''} ${person.lastName || ''}`.trim(),
        time: row.checkIn,
      });
    }
    return items
      .filter((item) => item.time)
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 6);
  }, [notifications, employees, attendance]);

  const attendanceByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of attendance || []) {
      const code = row.employee?.employeeCode;
      if (code) map.set(code, row.status);
    }
    return map;
  }, [attendance]);

  const team = (employees || []).slice(0, 5);
  const pendingApprovals = (approvals || []).filter((row) => row.approvalStatus === 'PENDING').length;
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  useEffect(() => {
    if (!activityOpen) return;
    function onDoc(event: MouseEvent) {
      if (activityRef.current && !activityRef.current.contains(event.target as Node)) {
        setActivityOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setActivityOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [activityOpen]);

  function exportDashboard() {
    api<Overview>('/dashboard/overview')
      .then((data) => {
        downloadCsv([
          ['Metric', 'Value'],
          ['Employees', String(data.employees ?? 0)],
          ['Attendance today', `${attendanceStats.rate}%`],
          ['Pending leave', String(leave?.length ?? 0)],
          ['Open positions', String(data.recruitment?.open ?? 0)],
          ['Pending tasks', String(data.taskStats?.pending ?? 0)],
          ['Pending onboarding', String(onboarding?.length ?? 0)],
          ['Leads ingested', String(data.leads ?? 0)],
          ['Invoices ingested', String(data.invoices ?? 0)],
          ['Orders ingested', String(data.orders ?? 0)],
          ['Hiring delayed', String(data.recruitment?.delayed ?? 0)],
        ]);
      })
      .catch(() => undefined);
  }


  const reminders = [
    leave?.length
      ? { title: 'Review leave requests', detail: `${leave.length} pending`, level: 'Medium', href: '/admin/leave' }
      : null,
    onboarding?.length
      ? { title: 'Onboarding documents', detail: `${onboarding.length} pending`, level: 'Low', href: '/admin/onboarding' }
      : null,
    tasks && tasks.some((task) => task.status === 'OVERDUE')
      ? {
          title: 'Overdue assigned work',
          detail: `${tasks.filter((task) => task.status === 'OVERDUE').length} overdue`,
          level: 'High',
          href: '/admin/tasks',
        }
      : null,
    pendingApprovals
      ? { title: 'Attendance corrections', detail: `${pendingApprovals} pending`, level: 'Medium', href: '/admin/attendance/approvals' }
      : null,
  ].filter(Boolean) as { title: string; detail: string; level: string; href: string }[];

  const actions = [
    { label: 'Leave requests', count: leave ? leave.length : null, href: '/admin/leave' },
    { label: 'Onboarding documents', count: onboarding ? onboarding.length : null, href: '/admin/onboarding' },
    {
      label: 'Attendance corrections',
      count: approvals ? pendingApprovals : null,
      href: '/admin/attendance/approvals',
    },
  ];

  return (
    <div className="dash-page">
      <header className="dash-head">
        <div>
          <h1>Dashboard</h1>
          <p>Manage people, attendance, tasks, and HR operations from one place.</p>
        </div>
        <div className="dash-head-actions" ref={activityRef}>
          <button
            type="button"
            className="btn secondary dash-head-btn"
            aria-expanded={activityOpen}
            onClick={() => setActivityOpen((open) => !open)}
          >
            HR Activity
          </button>
          <button type="button" className="btn dash-head-btn" onClick={exportDashboard}>
            Export
          </button>
          {activityOpen && (
            <div className="dash-activity-pop" role="dialog" aria-label="HR Activity">
              <div className="dash-card-head">
                <div>
                  <h2>HR Activity</h2>
                  <p>Recent people and attendance updates</p>
                </div>
                <button type="button" className="dash-pop-close" onClick={() => setActivityOpen(false)} aria-label="Close">
                  ×
                </button>
              </div>
              {notifications === null && employees === null && <div className="dash-empty">Loading…</div>}
              {!(notifications === null && employees === null) && activity.length === 0 && (
                <div className="dash-empty">No recent activity</div>
              )}
              <div className="dash-activity">
                {activity.map((item) => (
                  <div key={item.id} className="dash-row">
                    <span className="dash-avatar sm">{initials(item.name.split(' ')[0], item.name.split(' ')[1])}</span>
                    <div>
                      <strong>{item.title}</strong>
                      {item.name && <small>{item.name}</small>}
                    </div>
                    <time>{relativeTime(item.time)}</time>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      <section className="dash-top">
        <div className="dash-rail">
        <article className="dash-welcome">
          <p>
            {new Date().toLocaleDateString('en-GB', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
          <h2>Hi, {welcomeName || 'there'}</h2>
          <a
            href="#today-tasks"
            onClick={() => setCenterPane('tasks')}
          >
            {myTaskList.length} {myTaskList.length === 1 ? 'task' : 'tasks'} on progress
          </a>
        </article>
        <article className="dash-card">
          <div className="dash-card-head">
            <div>
              <h2>Track Status</h2>
              <p>Assigned work across the team</p>
            </div>
            <Link className="dash-linkish" href="/admin/tasks">View All</Link>
          </div>
          {tasks === null && <div className="dash-empty">Loading…</div>}
          {tasks !== null && openTasks.length === 0 && <div className="dash-empty">No assigned work</div>}
          <div className="dash-track">
            {openTasks.map((task) => {
              const progress = taskProgress(task);
              const status = taskStatus(task, progress);
              const person = task.assignee || {};
              const done = status.label === 'Done' || progress >= 100;
              return (
                <div key={task.id} className="dash-track-row">
                  <span className={`dash-tick${done ? ' is-done' : ''}`} role="img" aria-label={done ? 'Done' : 'Not done'}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
                      <path d="M5 12.5 9.2 16.7 19 7" />
                    </svg>
                  </span>
                  <div>
                    <strong>{task.title}</strong>
                    <small>{person.firstName ? `${person.firstName} ${person.lastName}` : 'Unassigned'}</small>
                  </div>
                  <span className={`badge ${status.badge}`}>{status.label}</span>
                </div>
              );
            })}
          </div>
        </article>
        </div>

        <article className="dash-card" id="today-tasks">
          <div className="dash-card-head">
            <div>
              <div className="dash-switch" role="tablist" aria-label="Today's work">
                <button
                  type="button"
                  role="tab"
                  aria-selected={centerPane === 'tasks'}
                  className={centerPane === 'tasks' ? 'is-on' : ''}
                  onClick={() => setCenterPane('tasks')}
                >
                  Today&apos;s Tasks
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={centerPane === 'actions'}
                  className={centerPane === 'actions' ? 'is-on' : ''}
                  onClick={() => setCenterPane('actions')}
                >
                  Pending Actions
                </button>
              </div>
              <p>
                {centerPane === 'tasks'
                  ? welcomeName
                    ? `Assigned to ${welcomeName}`
                    : 'Assigned to you'
                  : 'Items waiting on HR'}
              </p>
            </div>
            {centerPane === 'tasks' && myTaskList.length > 4 && (
              <Link className="dash-linkish" href="/admin/tasks">View All</Link>
            )}
          </div>
          {centerPane === 'tasks' && (
            <>
              {tasks === null && <div className="dash-empty">Loading…</div>}
              {tasks !== null && myTasks.length === 0 && <div className="dash-empty">No tasks assigned to you</div>}
              <div className="dash-task-grid">
                {myTasks.map((task) => {
                  const progress = taskProgress(task);
                  const status = taskStatus(task, progress);
                  const person = task.assignee || {};
                  return (
                    <div key={task.id} className="dash-task">
                      <div className="dash-task-top">
                        <h3>{task.title}</h3>
                        <details className="dash-menu">
                          <summary aria-label="Task actions">···</summary>
                          <Link href="/admin/tasks">Open tasks</Link>
                        </details>
                      </div>
                      <div className="dash-person">
                        <span className="dash-avatar sm">{initials(person.firstName, person.lastName)}</span>
                        <span>{person.firstName ? `${person.firstName} ${person.lastName}` : 'Unassigned'}</span>
                      </div>
                      <div className="dash-task-meta">
                        <span>{dueLabel(task.dueDate)}</span>
                        <b>{progress}%</b>
                        <span className={`badge ${status.badge}`}>{status.label}</span>
                      </div>
                      <div className="dash-bar" aria-hidden="true">
                        <span style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {centerPane === 'actions' && (
            <div className="dash-actions">
              {actions.map((action) => (
                <Link key={action.href} href={action.href} className="dash-row dash-action">
                  <span className={`dash-pip${action.count ? '' : ' muted'}`} />
                  <div>
                    <strong>{action.label}</strong>
                    <small>{action.count == null ? 'Unavailable' : `${action.count} pending`}</small>
                  </div>
                  <span className="dash-count">{action.count ?? '—'}</span>
                  <span className="dash-chevron" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </article>

        <div className="dash-rail">
        <article className="dash-card dash-attend-card">
          <div className="dash-card-head">
            <div>
              <h2>Today&apos;s Attendance</h2>
              <p>Daily attendance tracking</p>
            </div>
          </div>
          <div className="dash-attend">
            <span className="dash-clock" aria-hidden="true">
              <img
                src="https://api.iconify.design/lucide/alarm-clock.svg?color=%230a4f3d"
                width={18}
                height={18}
                alt=""
              />
            </span>
            <div className="dash-metrics">
              <div className="dash-metric"><span>Present</span><b>{attendanceStats.present}</b></div>
              <div className="dash-metric"><span>Absent</span><b>{attendanceStats.absent}</b></div>
              <div className="dash-metric"><span>Late</span><b>{attendanceStats.late}</b></div>
              <div className="dash-metric"><span>On Leave</span><b>{attendanceStats.leave}</b></div>
            </div>
            <p className="dash-rate">Attendance Rate: <b>{attendanceStats.rate}%</b></p>
          </div>
        </article>
        <article className="dash-card">
          <div className="dash-card-head">
            <div>
              <h2>Reminders</h2>
              <p>Follow-ups waiting on you</p>
            </div>
          </div>
          {reminders.length === 0 && <div className="dash-empty">No reminders</div>}
          <div className="dash-track">
            {reminders.map((item) => (
              <Link key={item.href} href={item.href} className="dash-track-row">
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </div>
                <span className={`dash-pill ${item.level === 'High' ? 'red' : item.level === 'Medium' ? 'amber' : ''}`}>{item.level}</span>
              </Link>
            ))}
          </div>
        </article>
        </div>
      </section>

      <section className="dash-lower">
        <UpcomingMeetings />
        <article className="dash-card">
          <div className="dash-card-head">
            <div>
              <h2>Available Team Today</h2>
              <p>{todayLabel}</p>
            </div>
            <Link className="dash-linkish" href="/admin/employees">View All</Link>
          </div>
          {employees === null && <div className="dash-empty">Loading…</div>}
          {employees !== null && team.length === 0 && <div className="dash-empty">No employees to show</div>}
          <div className="dash-team">
            {team.map((person) => {
              const status = teamStatus(attendanceByCode.get(person.employeeCode));
              return (
                <div key={person.id} className="dash-row">
                  <span className="dash-avatar sm">{initials(person.firstName, person.lastName)}</span>
                  <div>
                    <strong>{person.firstName} {person.lastName}</strong>
                    <small>{person.designation?.name || person.department?.name || person.employeeCode}</small>
                  </div>
                  <span className={`dash-pill ${status.pill}`}>{status.label}</span>
                </div>
              );
            })}
          </div>
        </article>
      </section>
    </div>
  );
}
