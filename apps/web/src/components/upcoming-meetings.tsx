'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { API_URL, api } from '@/lib/api';

type Attendee = { name: string; email: string };

type Meeting = {
  id: string;
  subject: string;
  start: string;
  end: string;
  organizer: string | null;
  attendees: Attendee[];
  joinUrl: string | null;
  onlineMeetingProvider: string;
  description: string | null;
};

type UpcomingResponse = {
  status: 'ok' | 'needsConsent' | 'expired' | 'forbidden' | 'error';
  timeZone: string;
  message?: string;
  days: string[];
  meetings: Meeting[];
};

const HOUR_PX = 76;
const MIN_CARD_PX = 78;
const MIN_CARD_MINUTES = (MIN_CARD_PX / HOUR_PX) * 60;

function ymdInZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function minutesInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return (hour === 24 ? 0 : hour) * 60 + minute;
}

function formatClock(iso: string, timeZone: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatHour(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function dayFromYmd(ymd: string) {
  return new Date(`${ymd}T12:00:00`);
}

type Span = { meeting: Meeting; startMin: number; endMin: number };

function spansForDay(meetings: Meeting[], day: string, timeZone: string): Span[] {
  const spans: Span[] = [];
  for (const meeting of meetings) {
    const start = new Date(meeting.start);
    if (ymdInZone(start, timeZone) !== day) continue;
    const startMin = minutesInZone(start, timeZone);
    const end = new Date(meeting.end);
    let endMin = minutesInZone(end, timeZone);
    if (ymdInZone(end, timeZone) !== day || endMin <= startMin) endMin = 24 * 60;
    spans.push({ meeting, startMin, endMin });
  }
  return spans.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
}

function visibleWindow(spans: Span[], nowMin: number) {
  let start = Math.min(...spans.map((span) => span.startMin));
  let end = Math.max(...spans.map((span) => span.endMin));
  if (nowMin >= start - 180 && nowMin <= end + 180) {
    start = Math.min(start, nowMin);
    end = Math.max(end, nowMin + 30);
  }
  let rangeStart = Math.max(0, Math.floor(start / 60) * 60 - 60);
  let rangeEnd = Math.min(24 * 60, Math.ceil(end / 60) * 60 + 60);
  if (rangeEnd - rangeStart < 3 * 60) rangeEnd = Math.min(24 * 60, rangeStart + 3 * 60);
  if (rangeEnd <= rangeStart) rangeEnd = Math.min(24 * 60, rangeStart + 3 * 60);
  return { rangeStart, rangeEnd };
}

type Placed = Span & { col: number; cols: number; top: number; height: number };

function placeDay(spans: Span[], rangeStart: number, rangeEnd: number): Placed[] {
  const visible = spans.filter((span) => span.endMin > rangeStart && span.startMin < rangeEnd);
  const placed: Placed[] = [];
  let cluster: Array<Span & { col: number; occupyEnd: number }> = [];
  let clusterEnd = -1;

  const flush = () => {
    const cols = cluster.reduce((max, item) => Math.max(max, item.col), 0) + 1;
    for (const item of cluster) {
      const topMin = Math.max(item.startMin, rangeStart);
      const bottomMin = Math.min(item.endMin, rangeEnd);
      placed.push({
        ...item,
        cols,
        top: ((topMin - rangeStart) / 60) * HOUR_PX,
        height: Math.max(MIN_CARD_PX, ((bottomMin - topMin) / 60) * HOUR_PX),
      });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const span of visible) {
    const occupyEnd = span.startMin + Math.max(span.endMin - span.startMin, MIN_CARD_MINUTES);
    if (cluster.length && span.startMin >= clusterEnd) flush();
    const used = new Set(cluster.filter((item) => item.occupyEnd > span.startMin).map((item) => item.col));
    let col = 0;
    while (used.has(col)) col += 1;
    cluster.push({ ...span, col, occupyEnd });
    clusterEnd = Math.max(clusterEnd, occupyEnd);
  }
  if (cluster.length) flush();
  return placed;
}

const TEAMS_CALENDAR = 'https://teams.microsoft.com/l/calendar';

function teamsLink(meeting: Meeting) {
  if (meeting.joinUrl && /teams\.(microsoft|live)\.com/i.test(meeting.joinUrl)) {
    return { href: meeting.joinUrl, label: 'Join meeting' };
  }
  return { href: TEAMS_CALENDAR, label: 'Open in Teams' };
}

function VideoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="12" height="10" rx="2" />
      <path d="M15 10.5 20 8v8l-5-2.5" />
    </svg>
  );
}

function todayInputValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

const emptySchedule = {
  subject: '',
  date: '',
  startTime: '09:00',
  endTime: '09:30',
  attendees: '',
  description: '',
};

export function UpcomingMeetings() {
  const [data, setData] = useState<UpcomingResponse | null>(null);
  const [failed, setFailed] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [selected, setSelected] = useState<Meeting | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleForm, setScheduleForm] = useState(emptySchedule);
  const [scheduleError, setScheduleError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancel = false;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    api<UpcomingResponse>(`/calendar/upcoming?timeZone=${encodeURIComponent(timeZone)}&days=4`)
      .then((result) => {
        if (!cancel) setData(result);
      })
      .catch((error: Error) => {
        if (!cancel) setFailed(error.message || 'Microsoft Calendar could not be loaded.');
      });
    return () => {
      cancel = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selected && !scheduling) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setSelected(null);
      setScheduling(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, scheduling]);

  function openSchedule() {
    setSelected(null);
    setScheduleError('');
    setScheduleForm({ ...emptySchedule, date: todayInputValue() });
    setScheduling(true);
  }

  async function submitSchedule(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setScheduleError('');
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const result = await api<{ status: string; message?: string }>('/calendar/meetings', {
        method: 'POST',
        body: JSON.stringify({ ...scheduleForm, timeZone }),
      });
      if (result.status !== 'ok') {
        setScheduleError(result.message || 'The meeting could not be scheduled.');
        return;
      }
      setScheduling(false);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : 'The meeting could not be scheduled.');
    } finally {
      setSaving(false);
    }
  }

  const timeZone = data?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const today = ymdInZone(now, timeZone);
  const meetings = data?.status === 'ok' ? data.meetings : [];
  const days = data?.status === 'ok' ? data.days : [];

  const layout = useMemo(() => {
    if (!days.length || !meetings.length) return null;
    const allSpans = days.flatMap((day) => spansForDay(meetings, day, timeZone));
    if (!allSpans.length) return null;
    const windowRange = visibleWindow(allSpans, minutesInZone(now, timeZone));
    const height = ((windowRange.rangeEnd - windowRange.rangeStart) / 60) * HOUR_PX;
    const hours: number[] = [];
    for (let minute = windowRange.rangeStart; minute <= windowRange.rangeEnd; minute += 60) hours.push(minute);
    const columns = days.map((day) => ({
      day,
      cards: placeDay(spansForDay(meetings, day, timeZone), windowRange.rangeStart, windowRange.rangeEnd),
    }));
    const contentHeight = Math.max(
      height,
      ...columns.flatMap((column) => column.cards.map((card) => card.top + card.height + 8)),
    );
    return { ...windowRange, height: contentHeight, hours, columns };
  }, [days, meetings, now, timeZone]);

  const nowTop = layout
    ? ((minutesInZone(now, timeZone) - layout.rangeStart) / 60) * HOUR_PX
    : -1;
  const showNow = Boolean(layout && nowTop >= 0 && nowTop <= layout.height);

  return (
    <section className="dash-card meet-board" aria-label="Upcoming Meetings">
      <div className="dash-card-head">
        <div>
          <h2>Upcoming Meetings</h2>
        </div>
        <div className="meet-head-actions">
          <button type="button" className="meet-schedule" onClick={openSchedule}>
            Schedule
          </button>
          <a className="meet-calendar" href={TEAMS_CALENDAR} target="_blank" rel="noopener noreferrer">
            Teams calendar
          </a>
        </div>
      </div>

      {data === null && !failed && <div className="dash-empty">Loading…</div>}
      {failed && <div className="dash-empty">{failed}</div>}
      {data && data.status === 'needsConsent' && (
        <div className="meet-note">
          <strong>Sign in with Microsoft to see your meetings.</strong>
          <a href={`${API_URL}/auth/microsoft`}>Continue with Microsoft</a>
        </div>
      )}
      {data && data.status === 'expired' && (
        <div className="meet-note">
          <strong>{data.message || 'Your Microsoft session expired.'}</strong>
          <a href={`${API_URL}/auth/microsoft`}>Sign in again</a>
        </div>
      )}
      {data && (data.status === 'forbidden' || data.status === 'error') && (
        <div className="dash-empty">{data.message || 'Microsoft Calendar could not be loaded.'}</div>
      )}
      {data?.status === 'ok' && meetings.length === 0 && (
        <div className="meet-empty">
          <strong>No upcoming meetings</strong>
          <span>You&apos;re all clear for now.</span>
        </div>
      )}

      {layout && (
        <div className="meet-scroll">
          <div
            className="meet-grid"
            style={{ gridTemplateColumns: `64px repeat(${layout.columns.length}, minmax(0, 1fr))` }}
          >
            <div className="meet-corner" />
            {layout.columns.map((column) => {
              const date = dayFromYmd(column.day);
              const isToday = column.day === today;
              return (
                <div key={column.day} className={`meet-dayhead${isToday ? ' is-today' : ''}`}>
                  <strong>
                    {date.toLocaleDateString('en-GB', { weekday: 'short', timeZone })}{' '}
                    {date.toLocaleDateString('en-GB', { day: 'numeric', timeZone })}
                  </strong>
                  <span>{date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone })}</span>
                </div>
              );
            })}
            <div className="meet-times" style={{ height: layout.height }}>
              {layout.hours.map((minute) => (
                <span
                  key={minute}
                  className="meet-tick"
                  style={{ top: ((minute - layout.rangeStart) / 60) * HOUR_PX }}
                >
                  {formatHour(minute)}
                </span>
              ))}
            </div>
            {layout.columns.map((column) => {
              const isToday = column.day === today;
              return (
                <div key={column.day} className={`meet-col${isToday ? ' is-today' : ''}`} style={{ height: layout.height }}>
                  {showNow && (
                    <div className={`meet-now${isToday ? ' is-today' : ''}`} style={{ top: nowTop }}>
                      {isToday && <span>{formatClock(now.toISOString(), timeZone)}</span>}
                    </div>
                  )}
                  {column.cards.map((card) => (
                    <div
                      key={card.meeting.id}
                      role="button"
                      tabIndex={0}
                      className="meet-item"
                      style={{
                        top: card.top,
                        height: card.height,
                        left: `calc(6px + ${card.col} * (100% - 12px) / ${card.cols})`,
                        width: `calc((100% - 12px) / ${card.cols} - 6px)`,
                      }}
                      onClick={() => setSelected(card.meeting)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelected(card.meeting);
                        }
                      }}
                    >
                      <strong>{card.meeting.subject}</strong>
                      <time>
                        {formatClock(card.meeting.start, timeZone)} – {formatClock(card.meeting.end, timeZone)}
                      </time>
                      <em>
                        <VideoIcon />
                        {teamsLink(card.meeting).label === 'Join meeting' ? 'Microsoft Teams' : card.meeting.onlineMeetingProvider}
                      </em>
                      <a
                        href={teamsLink(card.meeting).href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {teamsLink(card.meeting).label}
                      </a>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {scheduling && (
        <div className="meet-pop-backdrop" onClick={() => setScheduling(false)}>
          <form
            className="meet-pop meet-form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meet-schedule-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={submitSchedule}
          >
            <div className="meet-pop-head">
              <h3 id="meet-schedule-title">Schedule a meeting</h3>
              <button type="button" onClick={() => setScheduling(false)} aria-label="Close">
                ×
              </button>
            </div>
            <label>
              Title
              <input
                required
                value={scheduleForm.subject}
                onChange={(event) => setScheduleForm({ ...scheduleForm, subject: event.target.value })}
              />
            </label>
            <label>
              Date
              <input
                required
                type="date"
                value={scheduleForm.date}
                onChange={(event) => setScheduleForm({ ...scheduleForm, date: event.target.value })}
              />
            </label>
            <div className="meet-form-row">
              <label>
                Start
                <input
                  required
                  type="time"
                  value={scheduleForm.startTime}
                  onChange={(event) => setScheduleForm({ ...scheduleForm, startTime: event.target.value })}
                />
              </label>
              <label>
                End
                <input
                  required
                  type="time"
                  value={scheduleForm.endTime}
                  onChange={(event) => setScheduleForm({ ...scheduleForm, endTime: event.target.value })}
                />
              </label>
            </div>
            <label>
              Attendees
              <input
                value={scheduleForm.attendees}
                placeholder="name@company.com, ..."
                onChange={(event) => setScheduleForm({ ...scheduleForm, attendees: event.target.value })}
              />
            </label>
            <label>
              Description
              <textarea
                rows={3}
                value={scheduleForm.description}
                onChange={(event) => setScheduleForm({ ...scheduleForm, description: event.target.value })}
              />
            </label>
            {scheduleError && <p className="meet-form-error">{scheduleError}</p>}
            <button className="meet-join meet-submit" type="submit" disabled={saving}>
              {saving ? 'Scheduling…' : 'Schedule meeting'}
            </button>
          </form>
        </div>
      )}

      {selected && (
        <div className="meet-pop-backdrop" onClick={() => setSelected(null)}>
          <div
            className="meet-pop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meet-pop-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="meet-pop-head">
              <h3 id="meet-pop-title">{selected.subject}</h3>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close">
                ×
              </button>
            </div>
            <p>
              {new Date(selected.start).toLocaleDateString('en-GB', {
                timeZone,
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </p>
            <p>
              {formatClock(selected.start, timeZone)} – {formatClock(selected.end, timeZone)}
            </p>
            <p><span>Organizer</span> {selected.organizer || 'Not listed'}</p>
            <p>
              <span>Attendees</span>{' '}
              {selected.attendees.length
                ? selected.attendees.map((person) => person.name || person.email).join(', ')
                : 'Not listed'}
            </p>
            {selected.description && <p className="meet-pop-body">{selected.description}</p>}
            <a className="meet-join" href={teamsLink(selected).href} target="_blank" rel="noopener noreferrer">
              {teamsLink(selected).label}
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
