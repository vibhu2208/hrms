'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function EmployeeHome() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [birthdays, setBirthdays] = useState<any[]>([]);
  const [today, setToday] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      api('/announcements'),
      api('/birthdays'),
      api('/attendance/today'),
    ]).then(([a, b, t]) => {
      setAnnouncements(a);
      setBirthdays(b);
      setToday(t);
    });
  }, []);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Home</h1>
      <div className="grid grid-2">
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Today&apos;s attendance</h2>
          {today ? (
            <p>
              <span className="badge green">{today.status}</span>
              {today.checkIn && <> · In {new Date(today.checkIn).toLocaleTimeString()}</>}
              {today.checkOut && <> · Out {new Date(today.checkOut).toLocaleTimeString()}</>}
            </p>
          ) : (
            <p className="muted">Not checked in yet. Go to My Attendance.</p>
          )}
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Upcoming birthdays</h2>
          {!birthdays.length && <p className="empty">None in the next 30 days</p>}
          {birthdays.map((b) => (
            <div key={b.id}>{b.firstName} {b.lastName} · {new Date(b.nextBirthday).toLocaleDateString()}</div>
          ))}
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Bulletin board</h2>
        {announcements.map((a) => (
          <div key={a.id} style={{ marginBottom: 12 }}>
            <strong>{a.title}</strong>
            <p className="muted">{a.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
