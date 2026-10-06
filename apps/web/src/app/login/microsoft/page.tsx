'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, isAdminRole, setSession } from '@/lib/api';

export default function MicrosoftCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = hash.get('token');
    const returnTo = hash.get('returnTo');
    if (!token) {
      router.replace('/login?error=' + encodeURIComponent('Microsoft sign-in did not return a session.'));
      return;
    }
    window.history.replaceState(null, '', '/login/microsoft');
    localStorage.setItem('gs_token', token);
    api('/auth/me')
      .then((user) => {
        setSession(token, user);
        const tasksReturn = returnTo === '/admin/tasks' || returnTo === '/employee/tasks' ? returnTo : '';
        router.replace(tasksReturn || (isAdminRole(user.role?.code) ? '/admin' : '/employee'));
      })
      .catch((err: any) => {
        setError(err.message || 'Microsoft sign-in failed');
      });
  }, [router]);

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Go Staff</h1>
        {error ? (
          <>
            <div className="error">{error}</div>
            <a className="btn" href="/login" style={{ display: 'inline-block' }}>
              Back to sign in
            </a>
          </>
        ) : (
          <p className="muted">Signing you in with Microsoft…</p>
        )}
      </div>
    </div>
  );
}
