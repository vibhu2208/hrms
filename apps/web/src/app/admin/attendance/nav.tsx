'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { SelfAttendance } from './self-mark';

const links = [
  { href: '/admin/attendance', label: 'Records' },
  { href: '/admin/attendance/approvals', label: 'Approvals' },
  { href: '/admin/attendance/settings', label: 'Configuration' },
  { href: '/admin/attendance/audit', label: 'Audit' },
];

export function AttendanceNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="att-head-actions">
      <nav className="att-nav" aria-label="Attendance">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className={pathname === link.href ? 'is-on' : ''}>
            {link.label}
          </Link>
        ))}
      </nav>
      <button
        className={`btn att-self${open ? ' is-on' : ''}`}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        My attendance
      </button>
      {open && createPortal(
        <div className="att-pop" onMouseDown={() => setOpen(false)}>
          <div
            className="att-pop-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="att-self-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="att-pop-close" type="button" onClick={() => setOpen(false)}>
              Close
            </button>
            <SelfAttendance
              titleId="att-self-title"
              onChanged={() => window.dispatchEvent(new Event('gs-attendance-changed'))}
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
