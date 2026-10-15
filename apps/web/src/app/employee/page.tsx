'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';
import { BoardTask, PlannerListResponse, dueLabel, fromGoStaff, fromPlanner, sourceLine, upcomingTasks } from '@/lib/tasks';

function initials(first?: string, last?: string) {
  return `${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase() || '?';
}

function clock(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function attendanceWord(today: any, weekOff: boolean) {
  if (!today) return weekOff ? 'Week off' : 'Not marked';
  if (today.approvalStatus === 'PENDING') return 'Pending';
  if (today.approvalStatus === 'REJECTED' || today.status === 'REJECTED') return 'Rejected';
  if (today.status === 'PRESENT') return 'On time';
  if (today.status === 'EARLY') return 'Early';
  if (today.status === 'LATE') return 'Late';
  if (today.status === 'LEAVE') return 'Leave';
  if (today.status === 'WFH') return 'Remote';
  if (today.status === 'HALF_DAY') return 'Half day';
  if (today.status === 'ABSENT') return 'Absent';
  return String(today.status || 'Marked').replaceAll('_', ' ');
}

export default function EmployeeHome() {
  const [announcements, setAnnouncements] = useState<any[] | null>(null);
  const [birthdays, setBirthdays] = useState<any[] | null>(null);
  const [today, setToday] = useState<any>(null);
  const [weekOff, setWeekOff] = useState(false);
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [planner, setPlanner] = useState<PlannerListResponse | null>(null);
  const [plannerFailed, setPlannerFailed] = useState(false);
  const [leave, setLeave] = useState<any[] | null>(null);
  const [leaveLeft, setLeaveLeft] = useState<number | null>(null);
  const [welcomeName, setWelcomeName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [bulletinOpen, setBulletinOpen] = useState(false);
  const [centerPane, setCenterPane] = useState<'tasks' | 'actions'>('tasks');
  const bulletinRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = getStoredUser();
    if (stored?.employee) {
      setWelcomeName(`${stored.employee.firstName} ${stored.employee.lastName}`.trim());
      setFirstName(stored.employee.firstName);
    } else if (stored?.email) {
      setWelcomeName(stored.email);
    }
  }, []);

  useEffect(() => {
    api('/announcements').then(setAnnouncements).catch(() => setAnnouncements([]));
    api('/birthdays').then(setBirthdays).catch(() => setBirthdays([]));
    api('/attendance/today').then(setToday).catch(() => setToday(null));
    api<{ days: number[] }>('/leave/week-off')
      .then((off) => setWeekOff(Array.isArray(off?.days) && off.days.includes(new Date().getDay())))
      .catch(() => undefined);
    api<any[]>('/tasks?mine=true').then((rows) => setTasks(rows || [])).catch(() => setTasks([]));
    api<any[]>('/leave/mine').then((rows) => setLeave(rows || [])).catch(() => setLeave([]));
    api<any[]>('/leave/balances')
      .then((rows) => setLeaveLeft((rows || []).reduce((sum, row) => sum + Number(row.available || 0), 0)))
      .catch(() => setLeaveLeft(null));
    api<PlannerListResponse>('/planner/tasks')
      .then((res) => {
        setPlanner(res);
        setPlannerFailed(res.status === 'expired' || res.status === 'forbidden' || res.status === 'error');
      })
      .catch(() => {
        setPlanner({ status: 'error', tasks: [] });
        setPlannerFailed(true);
      });
  }, []);

  useEffect(() => {
    if (!bulletinOpen) return;
    function onDoc(event: MouseEvent) {
      if (bulletinRef.current && !bulletinRef.current.contains(event.target as Node)) setBulletinOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setBulletinOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [bulletinOpen]);

  const openTasks = useMemo(() => {
    const mine = (tasks || [])
      .filter((task) => task.status === 'PENDING' || task.status === 'OVERDUE')
      .map(fromGoStaff);
    const planned = planner?.status === 'ok' ? (planner.tasks || []).map(fromPlanner) : [];
    return upcomingTasks(mine, planned);
  }, [tasks, planner]);
  const shown = openTasks.slice(0, 4);
  const pendingLeave = (leave || []).filter((row) => row.status === 'PENDING' || row.status === 'CLARIFICATION');
  const overdue = openTasks.filter((task) => task.status === 'overdue');
  const loadingTasks = tasks === null || (shown.length === 0 && planner === null);
  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const statusLabel = attendanceWord(today, weekOff);

  const reminders = [
    overdue.length
      ? { title: 'Overdue tasks', detail: `${overdue.length} waiting`, level: 'High', href: '/employee/tasks' }
      : null,
    !today && !weekOff
      ? { title: 'Mark attendance', detail: 'Not checked in yet', level: 'Medium', href: '/employee/attendance' }
      : null,
    pendingLeave.length
      ? { title: 'Leave requests', detail: `${pendingLeave.length} pending`, level: 'Medium', href: '/employee/leave' }
      : null,
    birthdays?.[0]
      ? {
          title: 'Upcoming birthday',
          detail: `${birthdays[0].firstName} ${birthdays[0].lastName}`,
          level: 'Low',
          href: '/employee/company',
        }
      : null,
  ].filter(Boolean) as { title: string; detail: string; level: string; href: string }[];

  const actions = [
    { label: 'My attendance', count: today ? 1 : 0, href: '/employee/attendance' },
    { label: 'Leave requests', count: leave ? pendingLeave.length : null, href: '/employee/leave' },
    { label: 'Open tasks', count: tasks === null && planner === null ? null : openTasks.length, href: '/employee/tasks' },
  ];

  return (
    <div className="dash-page">
      <header className="dash-head">
        <div>
          <h1>Dashboard</h1>
          <p>Your attendance, tasks, and company updates in one place.</p>
        </div>
        <div className="dash-head-actions" ref={bulletinRef}>
          <button
            type="button"
            className="btn secondary dash-head-btn"
            aria-expanded={bulletinOpen}
            onClick={() => setBulletinOpen((open) => !open)}
          >
            Bulletin
          </button>
          <Link href="/employee/attendance" className="btn dash-head-btn">
            Attendance
          </Link>
          {bulletinOpen && (
            <div className="dash-activity-pop" role="dialog" aria-label="Bulletin">
              <div className="dash-card-head">
                <div>
                  <h2>Bulletin</h2>
                  <p>Company announcements</p>
                </div>
                <button type="button" className="dash-pop-close" onClick={() => setBulletinOpen(false)} aria-label="Close">
                  ×
                </button>
              </div>
              {announcements === null && <div className="dash-empty">Loading…</div>}
              {announcements !== null && announcements.length === 0 && <div className="dash-empty">No announcements</div>}
              <div className="dash-activity">
                {(announcements || []).map((item) => (
                  <div key={item.id} className="dash-row">
                    <span className="dash-avatar sm">{initials(item.title, '')}</span>
                    <div>
                      <strong>{item.title}</strong>
                      {item.body && <small>{item.body}</small>}
                    </div>
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
            <h2>Hi, {firstName || welcomeName || 'there'}</h2>
            <a href="#today-tasks" onClick={() => setCenterPane('tasks')}>
              {openTasks.length} {openTasks.length === 1 ? 'task' : 'tasks'} on progress
            </a>
          </article>
          <article className="dash-card">
            <div className="dash-card-head">
              <div>
                <h2>Track Status</h2>
                <p>Work assigned to you</p>
              </div>
              <Link className="dash-linkish" href="/employee/tasks">View All</Link>
            </div>
            {loadingTasks && <div className="dash-empty">Loading…</div>}
            {!loadingTasks && shown.length === 0 && <div className="dash-empty">No assigned work</div>}
            <div className="dash-track">
              {shown.map((task) => {
                const done = task.status === 'completed' || task.percent >= 100;
                return (
                  <div key={task.key} className="dash-track-row">
                    <span className={`dash-tick${done ? ' is-done' : ''}`} role="img" aria-label={done ? 'Done' : 'Not done'}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
                        <path d="M5 12.5 9.2 16.7 19 7" />
                      </svg>
                    </span>
                    <div>
                      <strong>{task.title}</strong>
                      <small>{dueLabel(task.dueDate)}</small>
                    </div>
                    <span className={`badge ${task.badge}`}>{task.statusLabel}</span>
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
              <p>{centerPane === 'tasks' ? `Assigned to ${welcomeName || 'you'}` : 'Items waiting on you'}</p>
            </div>
            {centerPane === 'tasks' && openTasks.length > 0 && (
              <Link className="dash-linkish" href="/employee/tasks">View All</Link>
            )}
          </div>
          {centerPane === 'tasks' && (
            <>
              {loadingTasks && <div className="dash-empty">Loading…</div>}
              {!loadingTasks && shown.length === 0 && <div className="dash-empty">No tasks assigned to you</div>}
              <div className="dash-task-grid">
                {shown.map((task: BoardTask) => {
                  const parts = (task.assignedTo || welcomeName).split(' ').filter(Boolean);
                  return (
                    <div key={task.key} className="dash-task">
                      <div className="dash-task-top">
                        <h3>{task.title}</h3>
                        <details className="dash-menu">
                          <summary aria-label="Task actions">···</summary>
                          <Link href="/employee/tasks">Open tasks</Link>
                        </details>
                      </div>
                      <small className="dash-task-source">{sourceLine(task)}</small>
                      <div className="dash-person">
                        <span className="dash-avatar sm">{initials(parts[0], parts[1])}</span>
                        <span>{task.assignedTo || welcomeName || 'You'}</span>
                      </div>
                      <div className="dash-task-meta">
                        <span>{dueLabel(task.dueDate)}</span>
                        <b>{task.percent}%</b>
                        <span className={`badge ${task.badge}`}>{task.statusLabel}</span>
                      </div>
                      <div className="dash-bar" aria-hidden="true">
                        <span style={{ width: `${task.percent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {plannerFailed && <p className="muted">Couldn&apos;t load Microsoft Planner tasks. GoStaff tasks are still shown.</p>}
            </>
          )}
          {centerPane === 'actions' && (
            <div className="dash-actions">
              {actions.map((action) => (
                <Link key={action.href} href={action.href} className="dash-row dash-action">
                  <span className={`dash-pip${action.count ? '' : ' muted'}`} />
                  <div>
                    <strong>{action.label}</strong>
                    <small>{action.count == null ? 'Unavailable' : `${action.count} open`}</small>
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
                <p>Your day so far</p>
              </div>
              <Link className="dash-linkish" href="/employee/attendance">Open</Link>
            </div>
            <div className="dash-attend">
              <span className="dash-clock" aria-hidden="true">
                <img src="https://api.iconify.design/lucide/alarm-clock.svg?color=%230a4f3d" width={18} height={18} alt="" />
              </span>
              <div className="dash-metrics">
                <div className="dash-metric"><span>In</span><b>{clock(today?.checkIn)}</b></div>
                <div className="dash-metric"><span>Out</span><b>{clock(today?.checkOut)}</b></div>
                <div className="dash-metric"><span>Status</span><b>{statusLabel}</b></div>
                <div className="dash-metric"><span>Leave left</span><b>{leaveLeft ?? '—'}</b></div>
              </div>
              <p className="dash-rate">Today: <b>{statusLabel}</b></p>
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
                <Link key={item.href + item.title} href={item.href} className="dash-track-row">
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
        <article className="dash-card">
          <div className="dash-card-head">
            <div>
              <h2>Bulletin board</h2>
              <p>Company announcements</p>
            </div>
          </div>
          {announcements === null && <div className="dash-empty">Loading…</div>}
          {announcements !== null && announcements.length === 0 && <div className="dash-empty">No announcements</div>}
          <div className="dash-team">
            {(announcements || []).slice(0, 5).map((item) => (
              <div key={item.id} className="dash-row">
                <span className="dash-avatar sm">{initials(item.title, '')}</span>
                <div>
                  <strong>{item.title}</strong>
                  {item.body && <small>{item.body}</small>}
                </div>
              </div>
            ))}
          </div>
        </article>
        <article className="dash-card">
          <div className="dash-card-head">
            <div>
              <h2>Upcoming birthdays</h2>
              <p>{todayLabel}</p>
            </div>
            <Link className="dash-linkish" href="/employee/company">View All</Link>
          </div>
          {birthdays === null && <div className="dash-empty">Loading…</div>}
          {birthdays !== null && birthdays.length === 0 && <div className="dash-empty">None in the next 30 days</div>}
          <div className="dash-team">
            {(birthdays || []).slice(0, 5).map((person) => (
              <div key={person.id} className="dash-row">
                <span className="dash-avatar sm">{initials(person.firstName, person.lastName)}</span>
                <div>
                  <strong>{person.firstName} {person.lastName}</strong>
                  <small>{new Date(person.nextBirthday).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
