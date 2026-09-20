'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function AdminAttendancePage() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    api('/attendance').then(setRows);
  }, []);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Attendance</h1>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Employee</th>
              <th>Status</th>
              <th>Check-in</th>
              <th>Check-out</th>
              <th>Minutes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.date).toLocaleDateString()}</td>
                <td>{r.employee?.firstName} {r.employee?.lastName}</td>
                <td><span className="badge gray">{r.status}</span></td>
                <td>{r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '—'}</td>
                <td>{r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '—'}</td>
                <td>{r.workingMinutes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="empty">No attendance records yet</p>}
      </div>
    </div>
  );
}
