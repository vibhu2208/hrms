'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { AuthUser, clearSession, getStoredUser } from '@/lib/api';

const links = [
  { href: '/employee', label: 'Home' },
  { href: '/employee/attendance', label: 'My Attendance' },
  { href: '/employee/leave', label: 'My Leave' },
  { href: '/employee/tasks', label: 'My Tasks' },
  { href: '/employee/performance', label: 'My Performance' },
  { href: '/employee/company', label: 'Company' },
  { href: '/employee/support', label: 'Support' },
];

export default function EmployeeLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    setUser(u);
  }, [router]);

  if (!user) return <div className="main">Loading…</div>;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Go Staff</strong>
          <span>Employee portal</span>
        </div>
        <nav className="nav">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={pathname === l.href ? 'active' : ''}>
              {l.label}
            </Link>
          ))}
        </nav>
        <button
          className="btn secondary"
          style={{ marginTop: 'auto', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}
          onClick={() => {
            clearSession();
            router.push('/login');
          }}
        >
          Sign out
        </button>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <div className="muted" style={{ fontSize: 13 }}>Welcome</div>
            <strong>
              {user.employee
                ? `${user.employee.firstName} ${user.employee.lastName}`
                : user.email}
            </strong>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
