'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  AuthUser,
  api,
  canAccessBusinessData,
  clearSession,
  getStoredUser,
  hasAnyRole,
  isAdminRole,
} from '@/lib/api';
import './admin.css';

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
  { href: '/admin/onboarding', label: 'Onboarding', roles: ['OWNER', 'HR'] },
  { href: '/admin/offboarding', label: 'Offboarding', roles: ['OWNER', 'HR'] },
  { href: '/admin/tasks', label: 'Tasks', roles: ['OWNER', 'MANAGEMENT', 'HR', 'DEPT_MANAGER'] },
  { href: '/admin/performance', label: 'Performance', roles: ['OWNER', 'MANAGEMENT', 'HR', 'DEPT_MANAGER'] },
  { href: '/admin/recruitment', label: 'Recruitment', roles: ['OWNER', 'HR', 'MANAGEMENT'] },
  { href: '/admin/configuration', label: 'Configuration', roles: ['OWNER', 'HR'] },
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

function isActive(href: string, pathname: string) {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const iconPath: Record<string, string> = {
  '/admin': 'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z',
  '/admin/employees': 'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6M23 11h-6',
  '/admin/attendance': 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  '/admin/leave': 'M8 3v3M16 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  '/admin/onboarding': 'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6',
  '/admin/offboarding': 'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 11h-6',
  '/admin/tasks': 'M9 11l2 2 4-4M8 4h8a2 2 0 0 1 2 2v14l-6-3-6 3V6a2 2 0 0 1 2-2z',
  '/admin/performance': 'M4 19V5M4 19h16M8 15l3-4 3 2 4-6',
  '/admin/recruitment': 'M8 7V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1M4 7h16v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
  '/admin/configuration': 'M4 7h16M4 12h16M4 17h10',
  '/admin/sales': 'M4 7h16l-1.2 11.2A2 2 0 0 1 16.8 20H7.2a2 2 0 0 1-2-1.8zM8 7V6a4 4 0 0 1 8 0v1',
  '/admin/accounts': 'M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v6h6',
  '/admin/revenue': 'M12 3v18M16 7.5c0-1.5-1.8-2.5-4-2.5s-4 1-4 2.5 1.8 2.5 4 2.5 4 1 4 2.5-1.8 2.5-4 2.5-4-1-4-2.5',
  '/admin/operations': 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12 4 7.5',
  '/admin/integrations': 'M9 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM15 23a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 8l8 8',
  '/admin/communication': 'M5 6h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
  '/admin/reports': 'M5 20V10M12 20V4M19 20v-7',
  '/admin/settings': 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a7.8 7.8 0 0 0 .1-2l2-1.2-2-3.4-2.2.6a8 8 0 0 0-1.7-1L15.2 5h-4.4L10.4 8a8 8 0 0 0-1.7 1L6.5 8.4l-2 3.4L6.5 13a7.8 7.8 0 0 0 .1 2l-2 1.2 2 3.4 2.2-.6a8 8 0 0 0 1.7 1l.4 3h4.4l.4-3a8 8 0 0 0 1.7-1l2.2.6 2-3.4z',
  '/admin/help': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-1.2.9-1.2 1.6V14M12 17h.01',
  logout: 'M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2M4 12h10M11 9l3 3-3 3',
};

function NavIcon({ href }: { href: string }) {
  return <Icon d={iconPath[href] || iconPath['/admin']} />;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCollapsed(localStorage.getItem('gs_sidebar') === 'collapsed');
  }, []);

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

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
    setBellOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!user) return;
    api<{ count: number }>('/notifications/unread-count')
      .then((row) => setUnread(row?.count || 0))
      .catch(() => setUnread(0));
    api<any[]>('/notifications')
      .then((rows) => setNotes(rows || []))
      .catch(() => setNotes([]));
  }, [user]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      api<any[]>(`/employees?search=${encodeURIComponent(q)}`)
        .then((rows) => {
          setResults((rows || []).slice(0, 6));
          setSearchOpen(true);
        })
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      const target = event.target as Node;
      if (searchRef.current && !searchRef.current.contains(target)) setSearchOpen(false);
      if (bellRef.current && !bellRef.current.contains(target)) setBellOpen(false);
    }
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  if (!user) return <div className="main">Loading…</div>;

  const displayName = user.employee
    ? `${user.employee.firstName} ${user.employee.lastName}`
    : user.email;
  const roleLabel = user.role?.name || user.role?.code || 'Admin';

  const overview = visibleLinks.filter((l) => l.href === '/admin');
  const hrms = visibleLinks.filter((l) =>
    [
      '/admin/employees',
      '/admin/attendance',
      '/admin/leave',
      '/admin/onboarding',
      '/admin/offboarding',
      '/admin/tasks',
      '/admin/performance',
      '/admin/recruitment',
      '/admin/configuration',
    ].includes(l.href),
  );
  const business = visibleLinks.filter((l) =>
    ['/admin/sales', '/admin/accounts', '/admin/revenue', '/admin/operations', '/admin/integrations'].includes(l.href),
  );
  const system = visibleLinks.filter((l) =>
    ['/admin/communication', '/admin/reports'].includes(l.href),
  );
  const settings = visibleLinks.find((l) => l.href === '/admin/settings');

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      localStorage.setItem('gs_sidebar', next ? 'collapsed' : 'open');
      return next;
    });
  }

  function renderLinks(links: AdminLink[]) {
    return links.map((l) => (
      <Link key={l.href} href={l.href} title={l.label} className={isActive(l.href, pathname) ? 'active' : ''}>
        <NavIcon href={l.href} />
        <span>{l.label}</span>
      </Link>
    ));
  }

  async function openNote(note: any) {
    setBellOpen(false);
    try {
      await api(`/notifications/${note.id}/read`, { method: 'PATCH' });
      setNotes((rows) => rows.map((row) => (row.id === note.id ? { ...row, isRead: true } : row)));
      setUnread((count) => Math.max(0, count - (note.isRead ? 0 : 1)));
    } catch {
      /* keep the list usable if marking read fails */
    }
    if (typeof note.link === 'string' && note.link.startsWith('/admin')) {
      router.push(note.link);
    }
  }

  return (
    <div className={`admin-shell${collapsed ? ' is-collapsed' : ''}`}>
      {menuOpen && (
        <button className="admin-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
      )}
      <aside className={`admin-sidebar${menuOpen ? ' is-open' : ''}`}>
        <div className="admin-brand">
          <div className="admin-brand-row">
            <strong>Go Staff</strong>
            <span className="admin-mark">GS</span>
            <button
              type="button"
              className="admin-collapse"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              onClick={toggleCollapsed}
            >
              <Icon d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} />
            </button>
          </div>
          <span className="admin-brand-sub">Admin command center</span>
        </div>
        <nav className="admin-nav">
          {overview.length > 0 && (
            <>
              <div className="admin-nav-label">Overview</div>
              {renderLinks(overview)}
            </>
          )}
          {hrms.length > 0 && (
            <>
              <div className="admin-nav-label">HR</div>
              {renderLinks(hrms)}
            </>
          )}
          {business.length > 0 && (
            <>
              <div className="admin-nav-label">Business</div>
              {renderLinks(business)}
            </>
          )}
          {system.length > 0 && (
            <>
              <div className="admin-nav-label">System</div>
              {renderLinks(system)}
            </>
          )}
          {!canAccessBusinessData(roleCode) && (
            <p className="admin-side-note">Sales, accounts, and integrations are Owner / Management only.</p>
          )}
        </nav>
        <div className="admin-foot">
          {settings && (
            <Link href={settings.href} title="Settings" className={isActive(settings.href, pathname) ? 'active' : ''}>
              <NavIcon href={settings.href} />
              <span>Settings</span>
            </Link>
          )}
          <Link href="/admin/help" title="Help Center" className={isActive('/admin/help', pathname) ? 'active' : ''}>
            <NavIcon href="/admin/help" />
            <span>Help Center</span>
          </Link>
          <button
            type="button"
            title="Logout"
            onClick={() => {
              clearSession();
              router.push('/login');
            }}
          >
            <Icon d={iconPath.logout} />
            <span>Logout</span>
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-header">
          <button
            type="button"
            className="admin-menu-btn"
            aria-label="Open menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon d="M4 7h16M4 12h16M4 17h16" />
          </button>
          <div className="admin-search" ref={searchRef}>
            <Icon d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3" />
            <input
              value={query}
              placeholder="Search..."
              aria-label="Search employees"
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => results.length > 0 && setSearchOpen(true)}
            />
            {searchOpen && (
              <div className="admin-search-pop">
                {results.length === 0 && <div className="dash-empty">No matching employees</div>}
                {results.map((row) => (
                  <Link key={row.id} href="/admin/employees" onClick={() => setSearchOpen(false)}>
                    {row.firstName} {row.lastName}
                    <small>{row.designation?.name || row.employeeCode}</small>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="admin-tools">
            <div className="admin-bell" ref={bellRef}>
              <button
                type="button"
                className="admin-icon-btn"
                aria-label="Notifications"
                onClick={() => setBellOpen((open) => !open)}
              >
                <Icon d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 0 1-6 0" />
                {unread > 0 && <span className="admin-dot">{unread > 9 ? '9+' : unread}</span>}
              </button>
              {bellOpen && (
                <div className="admin-bell-pop">
                  {notes.length === 0 && <div className="dash-empty">No notifications</div>}
                  {notes.slice(0, 8).map((note) => (
                    <button key={note.id} type="button" onClick={() => openNote(note)}>
                      {note.title}
                      <small>{note.body}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="admin-user">
              <span className="admin-avatar">{initials(displayName)}</span>
              <div className="admin-user-meta">
                <span className="badge green">{roleLabel}</span>
              </div>
            </div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
