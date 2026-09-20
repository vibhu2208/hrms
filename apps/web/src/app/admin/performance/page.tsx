'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function AdminPerformancePage() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    api('/performance/recompute', { method: 'POST' })
      .catch(() => null)
      .then(() => api('/performance'))
      .then(setRows)
      .catch(() => api('/performance').then(setRows));
  }, []);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Performance</h1>
      <p className="muted">Green ≥75 · Amber 60–74 · Red &lt;60. Weights: Task 40% · Attendance 25% · Timeliness 20% · Productivity 15%.</p>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Dept</th>
              <th>Overall</th>
              <th>Task</th>
              <th>Attendance</th>
              <th>Timeliness</th>
              <th>Productivity</th>
              <th>Band</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.employee?.firstName} {r.employee?.lastName}</td>
                <td>{r.employee?.department?.name}</td>
                <td><strong>{r.overall}</strong></td>
                <td>{r.taskCompletion}</td>
                <td>{r.attendance}</td>
                <td>{r.timeliness}</td>
                <td>{r.productivity}</td>
                <td>
                  <span className={`badge ${r.band === 'GREEN' ? 'green' : r.band === 'AMBER' ? 'amber' : 'red'}`}>
                    {r.band}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="empty">No scores yet</p>}
      </div>
    </div>
  );
}
