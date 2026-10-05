'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { LeaveNav } from './nav';

type Availability = {
  allocated: number;
  used: number;
  remaining: number;
  pending: number;
  available: number;
};

type LeaveRow = {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  leaveType?: { name: string; code: string };
  employee?: {
    firstName: string;
    lastName: string;
    department?: { name: string } | null;
    designation?: { name: string } | null;
  };
  availability?: Availability;
};

type Overview = {
  pending: LeaveRow[];
  requests: LeaveRow[];
  onLeaveToday: LeaveRow[];
};

type Holiday = {
  id: string;
  name: string;
  date: string;
  type: string;
};

function formatRange(start: string, end: string) {
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${new Date(start).toLocaleDateString(undefined, options)} – ${new Date(end).toLocaleDateString(undefined, options)}`;
}

function formatDay(value: string) {
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function personName(row: LeaveRow) {
  return `${row.employee?.firstName || ''} ${row.employee?.lastName || ''}`.trim() || 'Employee';
}

function initials(row: LeaveRow) {
  const first = row.employee?.firstName?.[0] || '';
  const last = row.employee?.lastName?.[0] || '';
  return `${first}${last}`.toUpperCase() || '?';
}

function canReview(status: string) {
  return status === 'PENDING' || status === 'CLARIFICATION';
}

function statusClass(status: string) {
  if (status === 'APPROVED') return 'badge green';
  if (status === 'REJECTED' || status === 'CANCELLED') return 'badge red';
  if (status === 'PENDING' || status === 'CLARIFICATION') return 'badge amber';
  return 'badge gray';
}

export default function AdminLeavePage() {
  const [overview, setOverview] = useState<Overview>({ pending: [], requests: [], onLeaveToday: [] });
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const [data, holidayRows] = await Promise.all([
      api<Overview>('/leave/overview'),
      api<Holiday[]>('/holidays'),
    ]);
    setOverview({
      pending: data.pending || [],
      requests: data.requests || [],
      onLeaveToday: data.onLeaveToday || [],
    });
    setHolidays(
      (holidayRows || [])
        .filter((holiday) => holiday.type === 'PUBLIC' || holiday.type === 'FESTIVAL')
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    );
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  async function review(id: string, action: string) {
    setBusyId(id);
    setError('');
    try {
      await api(`/leave/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="att-page">
      <header className="att-head">
        <div>
          <p className="att-kicker">People</p>
          <h1>Leave</h1>
        </div>
        <LeaveNav />
      </header>

      {error && <p className="att-banner">{error}</p>}

      <div className="leave-board">
        <section className="att-panel">
          <div className="att-panel-head">
            <h2>All requests</h2>
            <span className="att-count">{overview.requests.length}</span>
          </div>
          <div className="leave-scroll">
            {!overview.requests.length && <p className="empty">No requests yet</p>}
            {!!overview.requests.length && (
              <table className="table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Department</th>
                    <th>Type</th>
                    <th>Dates</th>
                    <th>Available</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {overview.requests.map((row) => (
                    <tr key={row.id}>
                      <td>{personName(row)}</td>
                      <td>{row.employee?.department?.name || '—'}</td>
                      <td>{row.leaveType?.name}</td>
                      <td>{formatRange(row.startDate, row.endDate)}</td>
                      <td>
                        {row.availability ? (
                          <>
                            <strong>{row.availability.available}</strong>
                            <div className="muted">of {row.availability.allocated}{row.availability.pending ? ` · ${row.availability.pending} pending` : ''}</div>
                          </>
                        ) : '—'}
                      </td>
                      <td><span className={statusClass(row.status)}>{row.status}</span></td>
                      <td>
                        {canReview(row.status) && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn" disabled={busyId === row.id} onClick={() => review(row.id, 'APPROVE')}>Approve</button>
                            <button className="btn danger" disabled={busyId === row.id} onClick={() => review(row.id, 'REJECT')}>Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <div className="leave-rail">
          <section className="att-panel">
            <div className="att-panel-head">
              <h2>On leave today</h2>
              <span className="att-count">{overview.onLeaveToday.length}</span>
            </div>
            {!overview.onLeaveToday.length && <p className="empty">Nobody is on approved leave today.</p>}
            {!!overview.onLeaveToday.length && (
              <div className="dash-team">
                {overview.onLeaveToday.map((row) => (
                  <div className="dash-row" key={row.id}>
                    <span className="dash-avatar">{initials(row)}</span>
                    <div>
                      <strong>{personName(row)}</strong>
                      <small>{row.employee?.designation?.name || row.employee?.department?.name || 'Employee'}</small>
                    </div>
                    <span className="dash-pill">{row.leaveType?.name || 'On leave'}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <details className="att-panel leave-fold" open>
            <summary>
              <h2>Public holidays</h2>
              <span className="att-count">{holidays.length}</span>
            </summary>
            {!holidays.length && <p className="empty">No public holidays yet.</p>}
            {!!holidays.length && (
              <div className="dash-team">
                {holidays.map((holiday) => (
                  <div className="dash-row" key={holiday.id}>
                    <div>
                      <strong>{holiday.name}</strong>
                      <small>{holiday.type === 'FESTIVAL' ? 'Festival' : 'Public'}</small>
                    </div>
                    <time>{formatDay(holiday.date)}</time>
                  </div>
                ))}
              </div>
            )}
          </details>
        </div>
      </div>
    </div>
  );
}
