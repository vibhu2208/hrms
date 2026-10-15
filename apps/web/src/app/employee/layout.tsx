'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { AuthUser, api, clearSession, getStoredUser } from '@/lib/api';
import '../admin/admin.css';

const links = [
  { href: '/employee', label: 'Home' },
  { href: '/employee/attendance', label: 'My Attendance' },
  { href: '/employee/leave', label: 'My Leave' },
  { href: '/employee/tasks', label: 'My Tasks' },
  { href: '/employee/performance', label: 'My Performance' },
  { href: '/employee/company', label: 'Company' },
  { href: '/employee/support', label: 'Support' },
];

const workHrefs = ['/employee/attendance', '/employee/leave', '/employee/tasks', '/employee/performance'];

function isActive(href: string, pathname: string) {
  if (href === '/employee') return pathname === '/employee';
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
  '/employee': 'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z',
  '/employee/attendance': 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  '/employee/leave': 'M8 3v3M16 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  '/employee/tasks': 'M9 11l2 2 4-4M8 4h8a2 2 0 0 1 2 2v14l-6-3-6 3V6a2 2 0 0 1 2-2z',
  '/employee/performance': 'M4 19V5M4 19h16M8 15l3-4 3 2 4-6',
  '/employee/company': 'M3 21h18M6 21V5h12v16M9 9h2M13 9h2M9 13h2M13 13h2M10 21v-4h4v4',
  '/employee/support': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-1.2.9-1.2 1.6V14M12 17h.01',
  logout: 'M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2M4 12h10M11 9l3 3-3 3',
};

function NavIcon({ href }: { href: string }) {
  return <Icon d={iconPath[href] || iconPath['/employee']} />;
}

export default function EmployeeLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [companyName, setCompanyName] = useState('Employee portal');
  const searchRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCollapsed(localStorage.getItem('gs_employee_sidebar') === 'collapsed');
    api<{ name: string }>('/tenant/current')
      .then((tenant) => {
        if (tenant.name) setCompanyName(tenant.name);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) {
      router.replace('/login');
      return;
    }
    setUser(stored);
  }, [router]);

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
    function onDoc(event: MouseEvent) {
      const target = event.target as Node;
      if (searchRef.current && !searchRef.current.contains(target)) setSearchOpen(false);
      if (bellRef.current && !bellRef.current.contains(target)) setBellOpen(false);
    }
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    return links.filter((link) => link.label.toLowerCase().includes(q));
  }, [query]);

  if (!user) return <div className="admin-main">Loading…</div>;

  const displayName = user.employee
    ? `${user.employee.firstName} ${user.employee.lastName}`
    : user.email;
  const roleLabel = user.role?.name || user.role?.code || 'Employee';
  const overview = links.filter((link) => link.href === '/employee');
  const work = links.filter((link) => workHrefs.includes(link.href));
  const company = links.filter((link) => link.href === '/employee/company' || link.href === '/employee/support');

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      localStorage.setItem('gs_employee_sidebar', next ? 'collapsed' : 'open');
      return next;
    });
  }

  function renderLinks(items: typeof links) {
    return items.map((link) => (
      <Link key={link.href} href={link.href} title={link.label} className={isActive(link.href, pathname) ? 'active' : ''}>
        <NavIcon href={link.href} />
        <span>{link.label}</span>
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
    if (typeof note.link === 'string' && note.link.startsWith('/employee')) {
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
          <span className="admin-brand-sub">{companyName}</span>
        </div>
        <nav className="admin-nav">
          <div className="admin-nav-label">Overview</div>
          {renderLinks(overview)}
          <div className="admin-nav-label">My work</div>
          {renderLinks(work)}
          <div className="admin-nav-label">Company</div>
          {renderLinks(company)}
        </nav>
        <div className="admin-foot">
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
              aria-label="Search pages"
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => query.trim().length > 0 && setSearchOpen(true)}
            />
            {searchOpen && query.trim().length > 0 && (
              <div className="admin-search-pop">
                {results.length === 0 && <div className="dash-empty">No matching pages</div>}
                {results.map((row) => (
                  <Link key={row.href} href={row.href} onClick={() => { setSearchOpen(false); setQuery(''); }}>
                    {row.label}
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
