'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';

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

function geoMessage(error: unknown) {
  const code = (error as { code?: number })?.code;
  if (code === 1) return 'Location permission denied. Allow location access, then refresh.';
  if (code === 2) return 'Location is unavailable on this device.';
  if (code === 3) return 'Location request timed out. Try again.';
  return error instanceof Error ? error.message : 'Location could not be read.';
}

export function SelfAttendance({ onChanged, titleId }: { onChanged?: () => void; titleId?: string }) {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [verification, setVerification] = useState<Verification | null>(null);
  const [geoError, setGeoError] = useState('');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const lastFix = useRef<Record<string, unknown> | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setMsg('');
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
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const user = getStoredUser();
    const employee = user?.employee;
    setLinked(Boolean(employee?.id));
    setName(employee ? `${employee.firstName} ${employee.lastName}` : '');
    if (employee?.id) refresh();
  }, [refresh]);

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
    onChanged?.();
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
      applyToday(saved, 'Your attendance is marked.');
    } catch (error: any) {
      setMsg(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function requestApproval() {
    setBusy(true);
    setMsg('');
    try {
      const saved = await api('/attendance/exception', {
        method: 'POST',
        body: JSON.stringify({ ...(lastFix.current || {}), reason: reason.trim() }),
      });
      setReason('');
      applyToday(saved, 'Attendance request sent for review.');
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

  if (linked === null) return null;
  if (!linked) {
    return (
      <section className="att-panel">
        <div className="att-panel-head">
          <h2 id={titleId}>My attendance</h2>
        </div>
        <p className="att-empty">This account is not linked to an employee profile, so attendance cannot be marked.</p>
      </section>
    );
  }

  const today = verification?.today;
  const checkedIn = today?.checkIn && today.approvalStatus !== 'REJECTED' && today.status !== 'REJECTED';
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
    <section className="att-panel">
      <div className="att-panel-head">
        <h2 id={titleId}>My attendance</h2>
        <span className={`att-pill${checkedIn && !today?.checkOut ? ' is-solid' : ''}`}>{stateLabel}</span>
      </div>
      <p className="att-sub" style={{ marginTop: 0, marginBottom: 14 }}>
        {name}. Same office checks as the rest of the team.
      </p>
      {msg && <p className="att-banner" style={{ marginBottom: 14 }}>{msg}</p>}

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
        {verification?.distanceMeters != null && <span>Distance <b>{Math.round(verification.distanceMeters)} m</b></span>}
        {verification?.accuracy != null && <span>Accuracy <b>{Math.round(verification.accuracy)} m</b></span>}
        {verification?.publicIp && <span>Network <b>{verification.publicIp}</b></span>}
        {today?.checkIn && <span>In <b>{clock(today.checkIn)}</b></span>}
        {today?.checkOut && <span>Out <b>{clock(today.checkOut)}</b></span>}
      </div>

      {verification?.blockedReason && !today?.checkOut && <p className="att-sub">{verification.blockedReason}</p>}
      {today?.approvalStatus === 'PENDING' && (
        <p className="att-sub">Waiting for review. Requested at {clock(today.checkIn)}.</p>
      )}
      {today?.approvalStatus === 'REJECTED' && (
        <p className="att-sub">
          This request was declined{today.rejectionReason ? `: ${today.rejectionReason}` : '.'}
        </p>
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
        <button className="btn secondary" type="button" onClick={refresh} disabled={busy}>
          {busy ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      {verification?.canRequestApproval && (
        <div className="att-actions">
          <div className="att-reason">
            <p className="att-sub" style={{ marginBottom: 10 }}>
              Office checks did not pass. Send a reason if this day should still be marked.
            </p>
            <label className="label" htmlFor="hr-self-reason">Reason</label>
            <textarea
              id="hr-self-reason"
              className="textarea"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why should this day be marked?"
            />
          </div>
          <button className="btn" type="button" onClick={requestApproval} disabled={busy || reason.trim().length < 3}>
            Request approval
          </button>
        </div>
      )}
    </section>
  );
}
