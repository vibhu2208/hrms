'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AttendanceNav } from '../nav';

type Config = {
  officeLatitude: number | null;
  officeLongitude: number | null;
  allowedRadiusMeters: number;
  authorizedIps: string[];
  requireLocation: boolean;
  requireNetwork: boolean;
  hrApprovalForExceptions: boolean;
  shiftStart: string | null;
  shiftEnd: string | null;
  observedIp?: string;
};

const empty: Config = {
  officeLatitude: null,
  officeLongitude: null,
  allowedRadiusMeters: 100,
  authorizedIps: [],
  requireLocation: true,
  requireNetwork: true,
  hrApprovalForExceptions: true,
  shiftStart: null,
  shiftEnd: null,
};

export default function AttendanceSettingsPage() {
  const [form, setForm] = useState<Config>(empty);
  const [ips, setIps] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Config>('/attendance/config').then((config) => {
      setForm(config);
      setIps((config.authorizedIps || []).join('\n'));
    });
  }, []);

  function set<K extends keyof Config>(key: K, value: Config[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const saved = await api<Config>('/attendance/config', {
        method: 'PUT',
        body: JSON.stringify({
          officeLatitude: form.officeLatitude === null || form.officeLatitude === ('' as any) ? null : Number(form.officeLatitude),
          officeLongitude: form.officeLongitude === null || form.officeLongitude === ('' as any) ? null : Number(form.officeLongitude),
          allowedRadiusMeters: Number(form.allowedRadiusMeters),
          authorizedIps: ips.split(/[\n,]/).map((ip) => ip.trim()).filter(Boolean),
          requireLocation: form.requireLocation,
          requireNetwork: form.requireNetwork,
          hrApprovalForExceptions: form.hrApprovalForExceptions,
          shiftStart: form.shiftStart || null,
          shiftEnd: form.shiftEnd || null,
        }),
      });
      setForm(saved);
      setIps((saved.authorizedIps || []).join('\n'));
      setMsg('Attendance configuration saved.');
    } catch (error: any) {
      setMsg(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="att-page">
      <header className="att-head">
        <div>
          <p className="att-kicker">People</p>
          <h1>Attendance</h1>
          <p className="att-sub">Office hours, location, network, and how exceptions are handled.</p>
        </div>
        <AttendanceNav />
      </header>
      {msg && <p className="att-banner">{msg}</p>}
      <form className="att-form" onSubmit={save}>
        <section className="att-panel">
          <div className="att-panel-head">
            <h2>Working hours</h2>
          </div>
          <p className="att-sub" style={{ marginBottom: 14 }}>
            A check-in before the in time is early. A check-in at the in time is on time. A check-in after the in time is late. A check-out after the out time is overtime.
          </p>
          <div className="att-form-grid">
            <div className="field">
              <label className="label" htmlFor="in-time">In time</label>
              <input
                id="in-time"
                className="input"
                type="time"
                value={form.shiftStart || ''}
                onChange={(event) => set('shiftStart', event.target.value || null)}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="out-time">Out time</label>
              <input
                id="out-time"
                className="input"
                type="time"
                value={form.shiftEnd || ''}
                onChange={(event) => set('shiftEnd', event.target.value || null)}
              />
            </div>
          </div>
        </section>

        <section className="att-panel">
          <div className="att-panel-head">
            <h2>Office location</h2>
          </div>
          <div className="att-form-grid">
            <div className="field">
              <label className="label" htmlFor="lat">Latitude</label>
              <input
                id="lat"
                className="input"
                inputMode="decimal"
                value={form.officeLatitude ?? ''}
                onChange={(event) => set('officeLatitude', event.target.value === '' ? null : Number(event.target.value))}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="lng">Longitude</label>
              <input
                id="lng"
                className="input"
                inputMode="decimal"
                value={form.officeLongitude ?? ''}
                onChange={(event) => set('officeLongitude', event.target.value === '' ? null : Number(event.target.value))}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="radius">Allowed radius (meters)</label>
              <input
                id="radius"
                className="input"
                type="number"
                min={10}
                max={5000}
                value={form.allowedRadiusMeters}
                onChange={(event) => set('allowedRadiusMeters', Number(event.target.value))}
              />
            </div>
          </div>
        </section>

        <section className="att-panel">
          <div className="att-panel-head">
            <h2>Office network</h2>
          </div>
          <p className="att-sub" style={{ marginBottom: 14 }}>
            The server checks the public IP of the connection. It does not trust an address sent by the browser.
            On this computer, localhost is replaced with this network&apos;s public IP.
            {form.observedIp ? ` This request was seen as ${form.observedIp}.` : ''}
            {' '}That address must be in the list below. CIDR such as 203.0.113.0/24 is allowed.
          </p>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="ips">Authorized public IP addresses</label>
            <textarea id="ips" className="textarea" value={ips} onChange={(event) => setIps(event.target.value)} placeholder="203.0.113.10" />
          </div>
        </section>

        <section className="att-panel">
          <div className="att-panel-head">
            <h2>Rules</h2>
          </div>
          <div className="att-form" style={{ gap: 12, maxWidth: 'none' }}>
            <label className="att-toggle">
              <input type="checkbox" checked={form.requireLocation} onChange={(event) => set('requireLocation', event.target.checked)} />
              Require location verification
            </label>
            <label className="att-toggle">
              <input type="checkbox" checked={form.requireNetwork} onChange={(event) => set('requireNetwork', event.target.checked)} />
              Require office network verification
            </label>
            <label className="att-toggle">
              <input
                type="checkbox"
                checked={form.hrApprovalForExceptions}
                onChange={(event) => set('hrApprovalForExceptions', event.target.checked)}
              />
              Send exceptions to HR
            </label>
          </div>
          <div className="att-actions">
            <button className="btn" disabled={busy} type="submit">Save configuration</button>
          </div>
        </section>
      </form>
    </div>
  );
}
