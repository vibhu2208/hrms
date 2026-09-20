'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function AdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [calendar, setCalendar] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api('/dashboard/overview'),
      api('/calendar/schedule?view=today').catch(() => null),
    ])
      .then(([overview, cal]) => {
        setData(overview);
        setCalendar(cal);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <p className="muted">Loading dashboard…</p>;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Command center</h1>
      <p className="muted">People, delivery, and external business data in one view.</p>
      <div className="grid grid-4" style={{ marginTop: '1.25rem' }}>
        <div className="card">
          <div className="stat-label">Employees</div>
          <div className="stat-value">{data.employees}</div>
        </div>
        <div className="card">
          <div className="stat-label">Task completion</div>
          <div className="stat-value">{data.taskStats?.completionPct ?? 0}%</div>
        </div>
        <div className="card">
          <div className="stat-label">Open positions</div>
          <div className="stat-value">{data.recruitment?.open ?? 0}</div>
        </div>
        <div className="card">
          <div className="stat-label">Invoices 60+ days</div>
          <div className="stat-value">{data.overdueInvoices ?? 0}</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: '1rem' }}>
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.2rem' }}>External data pulse</h2>
          <table className="table">
            <tbody>
              <tr><td>Leads ingested</td><td><strong>{data.leads}</strong></td></tr>
              <tr><td>Invoices ingested</td><td><strong>{data.invoices}</strong></td></tr>
              <tr><td>Orders ingested</td><td><strong>{data.orders}</strong></td></tr>
              <tr><td>Hiring delayed</td><td><strong>{data.recruitment?.delayed ?? 0}</strong></td></tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.2rem' }}>Today&apos;s schedule</h2>
          {!calendar?.events?.length && <p className="empty">No events</p>}
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {calendar?.events?.map((e: any) => (
              <li key={e.id} style={{ marginBottom: 8 }}>
                <strong>{e.title}</strong>
                <div className="muted" style={{ fontSize: 13 }}>
                  {new Date(e.start).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
          {calendar && !calendar.connected && (
            <p className="muted" style={{ fontSize: 13 }}>
              Google Calendar not connected — showing demo events. Configure OAuth in Settings.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
