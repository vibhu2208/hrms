'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AttendanceNav } from '../nav';

function actorName(row: any) {
  const employee = row.actor?.employee;
  if (employee) return `${employee.firstName} ${employee.lastName}`;
  return row.actor?.email || 'System';
}

function checkLabel(value: boolean | null | undefined) {
  if (value == null) return '—';
  return value ? 'Verified' : 'Not verified';
}

export default function AttendanceAuditPage() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    api('/attendance/audit').then(setRows);
  }, []);

  return (
    <div className="att-page">
      <header className="att-head">
        <div>
          <p className="att-kicker">People</p>
          <h1>Attendance</h1>
          <p className="att-sub">Who changed a record, and what the office checks showed.</p>
        </div>
        <AttendanceNav />
      </header>
      <section className="att-panel">
        <div className="att-panel-head">
          <h2>Audit</h2>
          <span className="att-count">{rows.length ? `${rows.length} events` : 'None yet'}</span>
        </div>
        {rows.length > 0 && (
          <div className="att-table-wrap">
            <table className="att-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Employee</th>
                  <th>Action</th>
                  <th>IP</th>
                  <th>Location</th>
                  <th>Distance</th>
                  <th>Location check</th>
                  <th>Network check</th>
                  <th>Previous</th>
                  <th>New</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const meta = row.metadata || {};
                  const when = new Date(row.createdAt);
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="att-when">
                          <b>{when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</b>
                          <span>{when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </td>
                      <td>{actorName(row)}</td>
                      <td>{String(row.action || '').replaceAll('_', ' ')}</td>
                      <td>{meta.publicIp || '—'}</td>
                      <td>
                    {meta.latitude != null && meta.longitude != null ? (
                      <a className="att-map" href={`https://www.google.com/maps?q=${meta.latitude},${meta.longitude}`} target="_blank" rel="noreferrer">
                        {Number(meta.latitude).toFixed(5)}, {Number(meta.longitude).toFixed(5)}
                      </a>
                    ) : '—'}
                  </td>
                      <td>{meta.distanceMeters != null ? `${Math.round(meta.distanceMeters)} m` : '—'}</td>
                      <td>{checkLabel(meta.locationVerified)}</td>
                      <td>{checkLabel(meta.networkVerified)}</td>
                      <td>{meta.previousStatus || '—'}</td>
                      <td>{meta.newStatus || '—'}</td>
                      <td>{meta.reason || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!rows.length && <p className="att-empty">No attendance audit events yet.</p>}
      </section>
    </div>
  );
}
