'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { AuthUser, clearSession, getStoredUser, isAdminRole } from '@/lib/api';

const adminLinks = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/employees', label: 'Employees' },
  { href: '/admin/attendance', label: 'Attendance' },
  { href: '/admin/leave', label: 'Leave' },
  { href: '/admin/tasks', label: 'Tasks' },
  { href: '/admin/performance', label: 'Performance' },
  { href: '/admin/recruitment', label: 'Recruitment' },
  { href: '/admin/sales', label: 'Sales' },
  { href: '/admin/accounts', label: 'Accounts' },
  { href: '/admin/revenue', label: 'Revenue & Profit' },
  { href: '/admin/operations', label: 'Operations' },
  { href: '/admin/integrations', label: 'Integration Hub' },
  { href: '/admin/communication', label: 'Communication' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/settings', label: 'Settings' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (!u || !isAdminRole(u.role?.code)) {
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
          <span>Admin command center</span>
        </div>
        <nav className="nav">
          <div className="section">Overview</div>
          {adminLinks.slice(0, 1).map((l) => (
            <Link key={l.href} href={l.href} className={pathname === l.href ? 'active' : ''}>
              {l.label}
            </Link>
          ))}
          <div className="section">HRMS</div>
          {adminLinks.slice(1, 7).map((l) => (
            <Link key={l.href} href={l.href} className={pathname === l.href ? 'active' : ''}>
              {l.label}
            </Link>
          ))}
          <div className="section">Business data</div>
          {adminLinks.slice(7, 12).map((l) => (
            <Link key={l.href} href={l.href} className={pathname === l.href ? 'active' : ''}>
              {l.label}
            </Link>
          ))}
          <div className="section">System</div>
          {adminLinks.slice(12).map((l) => (
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
            <div className="muted" style={{ fontSize: 13 }}>Signed in as</div>
            <strong>
              {user.employee
                ? `${user.employee.firstName} ${user.employee.lastName}`
                : user.email}
            </strong>
          </div>
          <span className="badge green">{user.role?.name || user.role?.code}</span>
        </div>
        {children}
      </main>
    </div>
  );
}
