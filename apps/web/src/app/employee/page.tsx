'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { PlannerListResponse, dueLabel, fromGoStaff, fromPlanner, sourceLine, upcomingTasks } from '@/lib/tasks';

export default function EmployeeHome() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [birthdays, setBirthdays] = useState<any[]>([]);
  const [today, setToday] = useState<any>(null);
  const [weekOff, setWeekOff] = useState(false);
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [planner, setPlanner] = useState<PlannerListResponse | null>(null);
  const [plannerFailed, setPlannerFailed] = useState(false);

  useEffect(() => {
    Promise.all([
      api('/announcements'),
      api('/birthdays'),
      api('/attendance/today'),
      api<{ days: number[] }>('/leave/week-off').catch(() => ({ days: [0, 6] })),
    ]).then(([a, b, t, off]) => {
      setAnnouncements(a);
      setBirthdays(b);
      setToday(t);
      setWeekOff(Array.isArray(off?.days) && off.days.includes(new Date().getDay()));
    });
    api<any[]>('/tasks?mine=true')
      .then((rows) => setTasks(rows || []))
      .catch(() => setTasks([]));
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

  const shown = useMemo(() => {
    const mine = (tasks || [])
      .filter((task) => task.status === 'PENDING' || task.status === 'OVERDUE')
      .map(fromGoStaff);
    const planned = planner?.status === 'ok' ? (planner.tasks || []).map(fromPlanner) : [];
    return upcomingTasks(mine, planned).slice(0, 4);
  }, [tasks, planner]);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Home</h1>
      <div className="grid grid-2">
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Today&apos;s attendance</h2>
          {today ? (
            <p>
              <span className={`badge ${today.status === 'PRESENT' ? 'green' : today.status === 'REJECTED' ? 'red' : 'amber'}`}>
                {today.status}
              </span>
              {today.approvalStatus === 'PENDING' && ' · Waiting for HR'}
              {today.checkIn && <> · In {new Date(today.checkIn).toLocaleTimeString()}</>}
              {today.checkOut && <> · Out {new Date(today.checkOut).toLocaleTimeString()}</>}
            </p>
          ) : weekOff ? (
            <p className="muted">Today is a weekly off.</p>
          ) : (
            <p className="muted">Not checked in yet. Go to My Attendance.</p>
          )}
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Upcoming birthdays</h2>
          {!birthdays.length && <p className="empty">None in the next 30 days</p>}
          {birthdays.map((b) => (
            <div key={b.id}>{b.firstName} {b.lastName} · {new Date(b.nextBirthday).toLocaleDateString()}</div>
          ))}
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="task-page-head">
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Today&apos;s Tasks</h2>
          <Link href="/employee/tasks">View All Tasks</Link>
        </div>
        {tasks === null || (shown.length === 0 && planner === null) ? <p className="muted">Loading tasks...</p> : null}
        {tasks !== null && shown.length === 0 && planner !== null && <p className="empty">No tasks assigned to you</p>}
        {shown.map((task) => (
          <div className="home-task-row" key={task.key}>
            <div>
              <strong>{task.title}</strong>
              <span className="muted">{sourceLine(task)}</span>
            </div>
            <span className="muted">{dueLabel(task.dueDate)}</span>
          </div>
        ))}
        {plannerFailed && <p className="muted">Couldn&apos;t load Microsoft Planner tasks. GoStaff tasks are still shown.</p>}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Bulletin board</h2>
        {announcements.map((a) => (
          <div key={a.id} style={{ marginBottom: 12 }}>
            <strong>{a.title}</strong>
            <p className="muted">{a.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
