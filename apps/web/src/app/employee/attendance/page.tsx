'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';

type Verification = {
  locationVerified: boolean;
  networkVerified: boolean;
  distanceMeters: number | null;
  accuracy: number | null;
  publicIp: string;
  locationMessage: string;
  networkMessage: string;
  canAutoMark: boolean;
  canRequestApproval: boolean;
  blockedReason: string | null;
  allowedRadiusMeters: number;
  today: any;
};

function readPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This browser does not support location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 5000,
      maximumAge: 120_000,
    });
  });
}

function clock(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function dayParts(value: string) {
  const date = new Date(value);
  return {
    weekday: date.toLocaleDateString('en-GB', { weekday: 'short' }),
    date: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  };
}

function approvalLabel(status?: string) {
  if (status === 'NOT_REQUIRED') return 'Automatic';
  if (status === 'PENDING') return 'Pending';
  if (status === 'APPROVED') return 'Approved';
  if (status === 'REJECTED') return 'Rejected';
  return status || '—';
}

function dayMark(status?: string, overtime?: number | null) {
  const extra = (overtime || 0) > 0;
  if (status === 'EARLY' && extra) return 'Early · Overtime';
  if (status === 'EARLY') return 'Early';
  if (status === 'LATE' && extra) return 'Late · Overtime';
  if (status === 'LATE') return 'Late';
  if (status === 'PRESENT' && extra) return 'Overtime';
  if (status === 'PRESENT') return 'On time';
  return statusLabel(status);
}

function statusLabel(status?: string) {
  if (status === 'EARLY') return 'Early';
  if (status === 'PRESENT') return 'On time';
  if (status === 'OVERTIME') return 'Overtime';
  if (status === 'LATE') return 'Late';
  if (status === 'HALF_DAY') return 'Half day';
  if (status === 'WFH') return 'Remote';
  if (status === 'ABSENT') return 'Absent';
  if (status === 'LEAVE') return 'Leave';
  if (status === 'HOLIDAY') return 'Holiday';
  if (status === 'WEEKEND') return 'Week off';
  if (status === 'REJECTED') return 'Rejected';
  if (status === 'PENDING_APPROVAL') return 'Pending';
  return status ? status.replaceAll('_', ' ') : '—';
}

const MISSED_MS = 24 * 60 * 60 * 1000;

function localInput(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isMissedClockOut(row: { checkIn?: string | null; checkOut?: string | null; status?: string; approvalStatus?: string }) {
  if (!row?.checkIn || row.checkOut || row.status === 'REJECTED' || row.approvalStatus === 'REJECTED') return false;
  return Date.now() - new Date(row.checkIn).getTime() >= MISSED_MS;
}

function geoMessage(error: unknown) {
  const code = (error as { code?: number })?.code;
  if (code === 1) return 'Location permission denied. Allow location access, then refresh verification.';
  if (code === 2) return 'Location is unavailable on this device.';
  if (code === 3) return 'Location request timed out. Try again.';
  return error instanceof Error ? error.message : 'Location could not be read.';
}

export default function MyAttendance() {
  const [verification, setVerification] = useState<Verification | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [weekOffs, setWeekOffs] = useState<number[]>([0, 6]);
  const [filters, setFilters] = useState({ from: '', to: '', status: '' });
  const [geoError, setGeoError] = useState('');
  const [reason, setReason] = useState('');
  const [missedForms, setMissedForms] = useState<Record<string, { reason: string; checkOut: string }>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const lastFix = useRef<Record<string, unknown> | null>(null);

  const loadHistory = useCallback(async () => {
    setHistory(await api('/attendance/mine'));
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    setMsg('');
    const historyPromise = loadHistory().catch(() => undefined);
    const fix: Record<string, unknown> = {};
    try {
      const pos = await readPosition();
      fix.latitude = pos.coords.latitude;
      fix.longitude = pos.coords.longitude;
      fix.accuracy = pos.coords.accuracy;
      fix.capturedAt = new Date(pos.timestamp).toISOString();
      lastFix.current = fix;
      setGeoError('');
    } catch (error) {
      setGeoError(geoMessage(error));
    }
    try {
      const result = await api<Verification>('/attendance/verify', {
        method: 'POST',
        body: JSON.stringify(fix),
      });
      setVerification(result);
    } catch (error: any) {
      setMsg(error.message);
    } finally {
      await historyPromise;
      setBusy(false);
    }
  }, [loadHistory]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    api<{ days: number[] }>('/leave/week-off')
      .then((row) => {
        if (Array.isArray(row.days)) setWeekOffs(row.days);
      })
      .catch(() => undefined);
  }, []);

  function applyToday(saved: any, message: string) {
    setVerification((current) =>
      current
        ? {
            ...current,
            canAutoMark: false,
            canRequestApproval: false,
            blockedReason: saved.checkOut ? 'Already checked out.' : 'Already checked in today.',
            today: saved,
          }
        : current,
    );
    setMsg(message);
    loadHistory().catch(() => undefined);
  }

  async function checkIn() {
    if (!verification) return;
    setBusy(true);
    setMsg('');
    try {
      const saved = await api('/attendance/check-in', {
        method: 'POST',
        body: JSON.stringify(lastFix.current || {}),
      });
      applyToday(saved, 'Attendance marked present.');
    } catch (error: any) {
      setMsg(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function requestApproval() {
    setBusy(true);
    setMsg('');
    const fix: Record<string, unknown> = { ...(lastFix.current || {}), reason: reason.trim() };
    try {
      const saved = await api('/attendance/exception', { method: 'POST', body: JSON.stringify(fix) });
      setReason('');
      applyToday(saved, 'Attendance request sent to HR.');
    } catch (error: any) {
      setMsg(error.message);
    } finally {
      setBusy(false);
    }
  }

  function missedForm(row: any) {
    return missedForms[row.id] || {
      reason: row.missedClockOutReason || '',
      checkOut: row.proposedCheckOut ? localInput(row.proposedCheckOut) : '',
    };
  }

  function setMissed(id: string, patch: Partial<{ reason: string; checkOut: string }>, row: any) {
    setMissedForms((current) => ({ ...current, [id]: { ...missedForm(row), ...current[id], ...patch } }));
  }

  async function sendMissed(row: any) {
    const form = missedForm(row);
    if (form.reason.trim().length < 3 || !form.checkOut) {
      setMsg('Add the time you left and a short reason.');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      await api('/attendance/missed-clock-out', {
        method: 'POST',
        body: JSON.stringify({
          attendanceId: row.id,
          reason: form.reason.trim(),
          checkOut: new Date(form.checkOut).toISOString(),
        }),
      });
      setMsg('Missed clock-out sent to HR.');
      loadHistory().catch(() => undefined);
    } catch (error: any) {
      setMsg(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function checkOut() {
    setBusy(true);
    setMsg('');
    try {
      const saved = await api('/attendance/check-out', { method: 'POST' });
      applyToday(saved, 'Checked out.');
    } catch (error: any) {
      setMsg(error.message);
    } finally {
      setBusy(false);
    }
  }

  const records = useMemo(() => {
    const covered = new Set(history.map((row) => new Date(row.date).toISOString().slice(0, 10)));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const earliest = history.reduce((min: number, row) => Math.min(min, new Date(row.date).getTime()), today.getTime());
    const first = new Date(earliest);
    const start = filters.from
      ? new Date(`${filters.from}T00:00:00`)
      : new Date(first.getFullYear(), first.getMonth(), 1);
    const end = filters.to ? new Date(`${filters.to}T00:00:00`) : today;
    const extras: any[] = [];
    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      if (!weekOffs.includes(cursor.getDay())) continue;
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      if (covered.has(key)) continue;
      extras.push({
        id: `weekoff-${key}`,
        date: new Date(Date.UTC(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())).toISOString(),
        status: 'WEEKEND',
        approvalStatus: 'NOT_REQUIRED',
      });
    }
    return [...history, ...extras].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  }, [filters.from, filters.to, history, weekOffs]);

  const filteredHistory = records.filter((row) => {
    const key = new Date(row.date).toISOString().slice(0, 10);
    if (filters.from && key < filters.from) return false;
    if (filters.to && key > filters.to) return false;
    if (filters.status === 'OVERTIME') {
      if (!((row.overtimeMinutes || 0) > 0)) return false;
    } else if (filters.status === 'PRESENT') {
      if (row.status !== 'PRESENT' || (row.overtimeMinutes || 0) > 0) return false;
    } else if (filters.status && row.status !== filters.status) return false;
    return true;
  });
  const filtering = Boolean(filters.from || filters.to || filters.status);
  const missed = history.filter(isMissedClockOut);

  const today = verification?.today;
  const checkedIn =
    today?.checkIn && today.approvalStatus !== 'REJECTED' && today.status !== 'REJECTED';

  const todayOff = weekOffs.includes(new Date().getDay());
  const todayLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const stateLabel = !verification
    ? 'Checking'
    : today?.approvalStatus === 'PENDING'
      ? 'Pending'
      : today?.approvalStatus === 'REJECTED'
        ? 'Rejected'
        : today?.checkOut
          ? 'Checked out'
          : checkedIn
            ? 'In'
            : verification.canAutoMark
              ? 'Ready'
              : 'Not marked';

  return (
    <div className="att-page">
      <header className="att-head">
        <div>
          <p className="att-kicker">{todayLabel}</p>
          <h1>Attendance</h1>
        </div>
        <button className="btn secondary" type="button" onClick={refresh} disabled={busy}>
          {busy ? 'Checking…' : 'Refresh'}
        </button>
      </header>

      {msg && <p className="att-banner">{msg}</p>}

      <section className="att-panel">
        <div className="att-panel-head">
          <h2>Today</h2>
          <span className={`att-pill${checkedIn && !today?.checkOut ? ' is-solid' : ''}`}>{stateLabel}</span>
        </div>

        <div className="att-split">
          <article className={`att-check${verification?.locationVerified ? ' is-ok' : ''}`}>
            <div className="att-check-top">
              <strong>Location</strong>
              <span>{verification?.locationVerified ? 'Verified' : 'Not verified'}</span>
            </div>
            <p>
              {geoError ||
                (verification?.locationVerified
                  ? 'You are inside the office area.'
                  : verification?.locationMessage || 'Waiting for a location reading.')}
            </p>
          </article>
          <article className={`att-check${verification?.networkVerified ? ' is-ok' : ''}`}>
            <div className="att-check-top">
              <strong>Office network</strong>
              <span>{verification?.networkVerified ? 'Verified' : 'Not verified'}</span>
            </div>
            <p>
              {verification?.networkVerified
                ? 'This connection is on the office network.'
                : verification?.networkMessage || 'Waiting for a network check.'}
            </p>
          </article>
        </div>

        <div className="att-facts">
          {verification?.distanceMeters != null && (
            <span>Distance <b>{Math.round(verification.distanceMeters)} m</b></span>
          )}
          {verification?.accuracy != null && (
            <span>Accuracy <b>{Math.round(verification.accuracy)} m</b></span>
          )}
          {verification?.publicIp && <span>Network <b>{verification.publicIp}</b></span>}
          {today?.checkIn && <span>In <b>{clock(today.checkIn)}</b></span>}
          {today?.checkOut && <span>Out <b>{clock(today.checkOut)}</b></span>}
        </div>

        {todayOff && !checkedIn && <p className="att-sub">Today is a weekly off.</p>}
        {verification?.blockedReason && <p className="att-sub">{verification.blockedReason}</p>}
        {today?.approvalStatus === 'PENDING' && (
          <p className="att-sub">Waiting for HR. Requested at {clock(today.checkIn)}.</p>
        )}
        {today?.approvalStatus === 'REJECTED' && (
          <p className="att-sub">
            HR declined this request{today.rejectionReason ? `: ${today.rejectionReason}` : '.'}
          </p>
        )}
        {checkedIn && (today?.status === 'PRESENT' || today?.status === 'EARLY') && today.approvalStatus === 'APPROVED' && (
          <p className="att-sub">Approved by HR.</p>
        )}

        <div className="att-actions">
          {verification?.canAutoMark && (
            <button className="btn" type="button" onClick={checkIn} disabled={busy}>
              Mark attendance
            </button>
          )}
          {checkedIn && today?.approvalStatus !== 'PENDING' && (
            <button className="btn secondary" type="button" onClick={checkOut} disabled={busy || !!today?.checkOut}>
              {today?.checkOut ? 'Checked out' : 'Check out'}
            </button>
          )}
        </div>

        {verification?.canRequestApproval && (
          <div className="att-actions">
            <div className="att-reason">
              <p className="att-sub" style={{ marginBottom: 10 }}>
                Office checks did not pass, so this day needs HR approval.
              </p>
              <label className="label" htmlFor="exception-reason">Reason for HR</label>
              <textarea
                id="exception-reason"
                className="textarea"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why should this day be approved?"
              />
            </div>
            <button className="btn" type="button" onClick={requestApproval} disabled={busy || reason.trim().length < 3}>
              Request approval
            </button>
          </div>
        )}
      </section>

      {missed.length > 0 && (
        <section className="att-panel">
          <div className="att-panel-head">
            <h2>Missed clock-out</h2>
            <span className="att-count">{missed.length} open</span>
          </div>
          {missed.map((row) => {
            const form = missedForm(row);
            const day = dayParts(row.date);
            return (
              <article className="att-request" key={row.id}>
                <div className="att-request-top">
                  <div className="att-when">
                    <b>{day.weekday}</b>
                    <span>{day.date} · in {clock(row.checkIn)}</span>
                  </div>
                  <span className="att-pill">24 hours open</span>
                </div>
                <p className="att-sub">
                  This day was left open for more than 24 hours. Send the time you left and a reason so HR can review it.
                </p>
                <div className="att-form-grid" style={{ marginTop: 12 }}>
                  <div className="field">
                    <label className="label" htmlFor={`out-${row.id}`}>Clock-out</label>
                    <input
                      id={`out-${row.id}`}
                      className="input"
                      type="datetime-local"
                      value={form.checkOut}
                      onChange={(event) => setMissed(row.id, { checkOut: event.target.value }, row)}
                    />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor={`why-${row.id}`}>Reason</label>
                    <textarea
                      id={`why-${row.id}`}
                      className="textarea"
                      value={form.reason}
                      onChange={(event) => setMissed(row.id, { reason: event.target.value }, row)}
                      placeholder="Why was clock-out missed?"
                    />
                  </div>
                </div>
                <div className="att-actions">
                  <button className="btn" type="button" disabled={busy || form.reason.trim().length < 3 || !form.checkOut} onClick={() => sendMissed(row)}>
                    {row.missedClockOutReason ? 'Update for HR' : 'Send to HR'}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <section className="att-panel">
        <div className="att-panel-head">
          <h2>Record</h2>
          <span className="att-count">
            {filtering && (
              <button className="att-clear" type="button" onClick={() => setFilters({ from: '', to: '', status: '' })}>
                Clear
              </button>
            )}{' '}
            {history.length || records.length ? `${filteredHistory.length} of ${records.length}` : 'No days yet'}
          </span>
        </div>
        {records.length > 0 && (
          <div className="att-filters">
            <label>
              From
              <input className="input" type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
            </label>
            <label>
              To
              <input className="input" type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
            </label>
            <label>
              Status
              <select className="select" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
                <option value="">All</option>
                <option value="EARLY">Early</option>
                <option value="PRESENT">On time</option>
                <option value="LATE">Late</option>
                <option value="OVERTIME">Overtime</option>
                <option value="HALF_DAY">Half day</option>
                <option value="WFH">Remote</option>
                <option value="ABSENT">Absent</option>
                <option value="LEAVE">Leave</option>
                <option value="WEEKEND">Week off</option>
                <option value="PENDING_APPROVAL">Pending</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </label>
          </div>
        )}
        {filteredHistory.length > 0 && (
          <div className="att-table-wrap">
            <table className="att-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Approval</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Location</th>
                  <th>Distance</th>
                  <th>Network</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((row) => {
                  const day = dayParts(row.date);
                  const map = row.latitude != null && row.longitude != null
                    ? `https://www.google.com/maps?q=${row.latitude},${row.longitude}`
                    : '';
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="att-when">
                          <b>{day.weekday}</b>
                          <span>{day.date}</span>
                        </div>
                      </td>
                      <td>{isMissedClockOut(row) ? 'Missed clock-out' : dayMark(row.status, row.overtimeMinutes)}</td>
                      <td>{approvalLabel(row.approvalStatus)}</td>
                      <td>{clock(row.checkIn)}</td>
                      <td>{clock(row.checkOut)}</td>
                      <td>
                        {map ? (
                          <a className="att-map" href={map} target="_blank" rel="noreferrer">
                            {Number(row.latitude).toFixed(5)}, {Number(row.longitude).toFixed(5)}
                          </a>
                        ) : '—'}
                      </td>
                      <td>{row.officeDistance != null ? `${Math.round(row.officeDistance)} m` : '—'}</td>
                      <td>{row.networkVerified ? 'Verified' : 'Not verified'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {records.length > 0 && !filteredHistory.length && <p className="att-empty">No records match these filters.</p>}
        {!records.length && <p className="att-empty">No attendance records yet.</p>}
      </section>
    </div>
  );
}
