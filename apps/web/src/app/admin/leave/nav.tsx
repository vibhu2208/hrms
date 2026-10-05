'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getStoredUser, hasAnyRole } from '@/lib/api';

const links = [
  { href: '/admin/leave', label: 'Requests' },
  { href: '/admin/leave/settings', label: 'Configuration', roles: ['OWNER', 'HR'] },
];

export function LeaveNav() {
  const pathname = usePathname();
  const [role, setRole] = useState<string | undefined>();

  useEffect(() => {
    setRole(getStoredUser()?.role?.code);
  }, []);

  const visible = links.filter((link) => !link.roles || hasAnyRole(role, link.roles));

  return (
    <nav className="att-nav" aria-label="Leave">
      {visible.map((link) => (
        <Link key={link.href} href={link.href} className={pathname === link.href ? 'is-on' : ''}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
