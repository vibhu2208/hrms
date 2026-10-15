'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function toIso(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseIso(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function formatDay(value: string) {
  if (!value) return '';
  return parseIso(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function monthCells(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(1 - lead);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, outside: date.getMonth() !== cursor.getMonth() };
  });
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function MonthGrid({
  cursor,
  onCursor,
  weekOffs = [],
  start,
  end,
  onPick,
}: {
  cursor: Date;
  onCursor: (next: Date) => void;
  weekOffs?: number[];
  start?: string;
  end?: string;
  onPick: (iso: string) => void;
}) {
  const today = new Date();
  const startDate = start ? parseIso(start) : null;
  const endDate = end ? parseIso(end) : null;
  const offs = new Set(weekOffs);

  return (
    <div className="day-cal">
      <div className="day-cal-head">
        <button type="button" aria-label="Previous month" onClick={() => onCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6 8.5 12l6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <strong>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
        <button type="button" aria-label="Next month" onClick={() => onCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      <div className="day-cal-grid">
        {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
        {monthCells(cursor).map((cell) => {
          const iso = toIso(cell.date);
          const isStart = startDate ? sameDay(cell.date, startDate) : false;
          const isEnd = endDate ? sameDay(cell.date, endDate) : false;
          const inRange = startDate && endDate && cell.date > startDate && cell.date < endDate;
          const classes = [
            cell.outside ? 'is-out' : '',
            offs.has(cell.date.getDay()) ? 'is-off' : '',
            sameDay(cell.date, today) ? 'is-today' : '',
            inRange ? 'is-range' : '',
            isStart ? 'is-start' : '',
            isEnd ? 'is-end' : '',
          ].filter(Boolean).join(' ');
          return (
            <button key={iso} type="button" className={classes} onClick={() => onPick(iso)}>
              {cell.date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateField({
  label,
  value,
  placeholder = 'Choose a date',
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const selected = value ? parseIso(value) : null;
  const [cursor, setCursor] = useState(() => {
    const base = selected || new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) return;
    const base = value ? parseIso(value) : new Date();
    setCursor(new Date(base.getFullYear(), base.getMonth(), 1));
    function onDoc(event: MouseEvent) {
      const node = event.target as Node;
      if (root.current?.contains(node) || pop.current?.contains(node)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, value]);

  const panel = open ? (
    <div className="day-pop-back" onMouseDown={() => setOpen(false)}>
      <div
        ref={pop}
        className="day-pop"
        role="dialog"
        aria-label={`${label} calendar`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <MonthGrid
          cursor={cursor}
          onCursor={setCursor}
          start={value}
          end={value}
          onPick={(iso) => {
            onChange(iso);
            setOpen(false);
          }}
        />
        <button
          className="day-cal-clear"
          type="button"
          onClick={() => {
            onChange('');
            setOpen(false);
          }}
        >
          Clear
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="day-field" ref={root}>
      <span className="label">{label}</span>
      <button
        className={`day-field-btn${value ? '' : ' is-empty'}`}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value ? formatDay(value) : placeholder}</span>
        <CalendarIcon />
      </button>
      {panel && typeof document !== 'undefined' ? createPortal(panel, document.body) : null}
    </div>
  );
}

export function RangeCalendar({
  start,
  end,
  weekOffs,
  focus,
  onFocus,
  onChange,
}: {
  start: string;
  end: string;
  weekOffs: number[];
  focus: 'start' | 'end';
  onFocus: (next: 'start' | 'end') => void;
  onChange: (start: string, end: string) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const base = start ? parseIso(start) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  function pick(iso: string) {
    if (focus === 'start' || !start || iso < start) {
      onChange(iso, iso < end ? end : '');
      onFocus('end');
      return;
    }
    onChange(start, iso);
    onFocus('start');
  }

  return (
    <div className="day-range">
      <div className="day-range-picks">
        <button type="button" className={focus === 'start' ? 'is-on' : ''} onClick={() => onFocus('start')}>
          <small>Start</small>
          <strong>{start ? formatDay(start) : 'Select'}</strong>
        </button>
        <button type="button" className={focus === 'end' ? 'is-on' : ''} onClick={() => onFocus('end')}>
          <small>End</small>
          <strong>{end ? formatDay(end) : 'Select'}</strong>
        </button>
      </div>
      <MonthGrid cursor={cursor} onCursor={setCursor} weekOffs={weekOffs} start={start} end={end || start} onPick={pick} />
      <p className="day-cal-note">
        {start && end
          ? 'Weekly offs stay in the range but are not counted.'
          : focus === 'start'
            ? 'Tap the first day.'
            : 'Tap the last day.'}
      </p>
    </div>
  );
}
