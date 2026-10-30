'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, clearSession, isAdminRole, safeTaskReturnPath, setSession } from '@/lib/api';

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
        const next = safeTaskReturnPath(returnTo);
        const admin = isAdminRole(user.role?.code);
        const allowed =
          next && ((admin && next.startsWith('/admin/')) || (!admin && next.startsWith('/employee/')));
        router.replace(allowed ? next : admin ? '/admin' : '/employee');
      })
      .catch((err: any) => {
        clearSession();
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
