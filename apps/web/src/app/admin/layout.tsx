'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import {
  AuthUser,
  canAccessBusinessData,
  clearSession,
  getStoredUser,
  hasAnyRole,
  isAdminRole,
} from '@/lib/api';

type AdminLink = {
  href: string;
  label: string;
  roles?: string[];
};

const adminLinks: AdminLink[] = [
  { href: '/admin', label: 'Dashboard', roles: ['OWNER', 'MANAGEMENT', 'HR'] },
  { href: '/admin/employees', label: 'Employees' },
  { href: '/admin/attendance', label: 'Attendance', roles: ['OWNER', 'HR', 'MANAGEMENT', 'DEPT_MANAGER'] },
  { href: '/admin/leave', label: 'Leave', roles: ['OWNER', 'HR', 'MANAGEMENT', 'DEPT_MANAGER'] },
  { href: '/admin/tasks', label: 'Tasks', roles: ['OWNER', 'MANAGEMENT', 'HR', 'DEPT_MANAGER'] },
  { href: '/admin/performance', label: 'Performance', roles: ['OWNER', 'MANAGEMENT', 'HR', 'DEPT_MANAGER'] },
  { href: '/admin/recruitment', label: 'Recruitment', roles: ['OWNER', 'HR', 'MANAGEMENT'] },
  { href: '/admin/sales', label: 'Sales', roles: ['OWNER', 'MANAGEMENT'] },
  { href: '/admin/accounts', label: 'Accounts', roles: ['OWNER', 'MANAGEMENT'] },
  { href: '/admin/revenue', label: 'Revenue & Profit', roles: ['OWNER', 'MANAGEMENT'] },
  { href: '/admin/operations', label: 'Operations', roles: ['OWNER', 'MANAGEMENT'] },
  { href: '/admin/integrations', label: 'Integration Hub', roles: ['OWNER', 'MANAGEMENT'] },
  { href: '/admin/communication', label: 'Communication', roles: ['OWNER', 'HR', 'MANAGEMENT'] },
  { href: '/admin/reports', label: 'Reports', roles: ['OWNER', 'MANAGEMENT', 'HR'] },
  { href: '/admin/settings', label: 'Settings', roles: ['OWNER', 'MANAGEMENT', 'HR'] },
];

function linkAllowed(link: AdminLink, roleCode?: string) {
  if (!link.roles?.length) return true;
  return hasAnyRole(roleCode, link.roles);
}

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

  const roleCode = user?.role?.code;
  const visibleLinks = useMemo(
    () => adminLinks.filter((l) => linkAllowed(l, roleCode)),
    [roleCode],
  );

  useEffect(() => {
    if (!user) return;
    const match = adminLinks.find(
      (l) => l.href === pathname || (l.href !== '/admin' && pathname.startsWith(l.href)),
    );
    if (match && !linkAllowed(match, user.role?.code)) {
      router.replace('/admin');
    }
  }, [user, pathname, router]);

  if (!user) return <div className="main">Loading…</div>;

  const overview = visibleLinks.filter((l) => l.href === '/admin');
  const hrms = visibleLinks.filter((l) =>
    ['/admin/employees', '/admin/attendance', '/admin/leave', '/admin/tasks', '/admin/performance', '/admin/recruitment'].includes(l.href),
  );
  const business = visibleLinks.filter((l) =>
    ['/admin/sales', '/admin/accounts', '/admin/revenue', '/admin/operations', '/admin/integrations'].includes(l.href),
  );
  const system = visibleLinks.filter((l) =>
    ['/admin/communication', '/admin/reports', '/admin/settings'].includes(l.href),
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Go Staff</strong>
          <span>Admin command center</span>
        </div>
        <nav className="nav">
          {overview.length > 0 && (
            <>
              <div className="section">Overview</div>
              {overview.map((l) => (
                <Link key={l.href} href={l.href} className={pathname === l.href ? 'active' : ''}>
                  {l.label}
                </Link>
              ))}
            </>
          )}
          {hrms.length > 0 && (
            <>
              <div className="section">HRMS</div>
              {hrms.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={pathname === l.href || pathname.startsWith(`${l.href}/`) ? 'active' : ''}
                >
                  {l.label}
                </Link>
              ))}
            </>
          )}
          {business.length > 0 && (
            <>
              <div className="section">Business data</div>
              {business.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={pathname === l.href || pathname.startsWith(`${l.href}/`) ? 'active' : ''}
                >
                  {l.label}
                </Link>
              ))}
            </>
          )}
          {system.length > 0 && (
            <>
              <div className="section">System</div>
              {system.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={pathname === l.href || pathname.startsWith(`${l.href}/`) ? 'active' : ''}
                >
                  {l.label}
                </Link>
              ))}
            </>
          )}
        </nav>
        {!canAccessBusinessData(roleCode) && (
          <p className="muted" style={{ fontSize: 12, marginTop: 12, opacity: 0.85 }}>
            Sales, accounts, and integrations are Owner / Management only.
          </p>
        )}
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
