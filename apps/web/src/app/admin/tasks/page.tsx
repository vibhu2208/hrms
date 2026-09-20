'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function AdminTasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [form, setForm] = useState({ title: '', description: '', assigneeId: '', dueDate: '' });

  async function load() {
    const [t, s, e] = await Promise.all([
      api('/tasks'),
      api('/tasks/stats'),
      api('/employees'),
    ]);
    setTasks(t);
    setStats(s);
    setEmployees(e);
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    await api('/tasks', { method: 'POST', body: JSON.stringify(form) });
    setForm({ title: '', description: '', assigneeId: '', dueDate: '' });
    await load();
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Tasks & delegation</h1>
      {stats && (
        <div className="grid grid-4" style={{ marginBottom: 16 }}>
          <div className="card"><div className="stat-label">Total</div><div className="stat-value">{stats.total}</div></div>
          <div className="card"><div className="stat-label">Completed</div><div className="stat-value">{stats.completed}</div></div>
          <div className="card"><div className="stat-label">Overdue</div><div className="stat-value">{stats.overdue}</div></div>
          <div className="card"><div className="stat-label">Completion</div><div className="stat-value">{stats.completionPct}%</div></div>
        </div>
      )}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Assign task</h2>
        <form onSubmit={create} className="grid grid-2">
          <div className="field">
            <label className="label">Title</label>
            <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Assignee</label>
            <select className="select" required value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">Select</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Due date</label>
            <input className="input" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Description</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <button className="btn" type="submit">Create</button>
        </form>
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Title</th><th>Assignee</th><th>Assignor</th><th>Due</th><th>Status</th></tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td>{t.title}</td>
                <td>{t.assignee?.firstName} {t.assignee?.lastName}</td>
                <td>{t.assignor?.firstName} {t.assignor?.lastName}</td>
                <td>{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}</td>
                <td><span className={`badge ${t.status === 'OVERDUE' ? 'red' : 'gray'}`}>{t.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
