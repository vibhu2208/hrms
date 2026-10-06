'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getStoredUser, hasAnyRole } from '@/lib/api';
import { AddAllocationDialog, AddLeaveDialog, LeaveTypeDraft } from './dialogs';

const links = [
  { href: '/admin/leave', label: 'Requests' },
  { href: '/admin/leave/settings', label: 'Configuration', roles: ['OWNER', 'HR'] },
];

export function LeaveNav() {
  const pathname = usePathname();
  const [role, setRole] = useState<string | undefined>();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveTypeDraft | null>(null);
  const [allocationOpen, setAllocationOpen] = useState(false);

  useEffect(() => {
    setRole(getStoredUser()?.role?.code);
  }, []);

  useEffect(() => {
    function openEditor(event: Event) {
      setAllocationOpen(false);
      setEditing((event as CustomEvent<LeaveTypeDraft>).detail || null);
      setLeaveOpen(true);
    }
    window.addEventListener('gs-open-leave-type', openEditor);
    return () => window.removeEventListener('gs-open-leave-type', openEditor);
  }, []);

  const visible = links.filter((link) => !link.roles || hasAnyRole(role, link.roles));
  const canConfigure = hasAnyRole(role, ['OWNER', 'HR']);

  function openAddLeave() {
    setAllocationOpen(false);
    setEditing(null);
    setLeaveOpen(true);
  }

  function openAddAllocation() {
    setLeaveOpen(false);
    setEditing(null);
    setAllocationOpen(true);
  }

  return (
    <div className="att-head-actions">
      {canConfigure && (
        <>
          <button className="btn" type="button" onClick={openAddLeave}>Add leave</button>
          <button className="btn secondary" type="button" onClick={openAddAllocation}>Add allocation</button>
        </>
      )}
      <nav className="att-nav" aria-label="Leave">
        {visible.map((link) => (
          <Link key={link.href} href={link.href} className={pathname === link.href ? 'is-on' : ''}>
            {link.label}
          </Link>
        ))}
      </nav>
      {leaveOpen && (
        <AddLeaveDialog
          initial={editing}
          onClose={() => {
            setLeaveOpen(false);
            setEditing(null);
          }}
        />
      )}
      {allocationOpen && <AddAllocationDialog onClose={() => setAllocationOpen(false)} />}
    </div>
  );
}
