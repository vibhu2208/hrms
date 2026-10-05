'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { API_URL, api, isAdminRole, setSession } from '@/lib/api';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('connect@aithworld.com');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const message = params.get('error');
    if (message) setError(message);
  }, [params]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api<{ accessToken: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setSession(res.accessToken, res.user);
      const role = res.user.role?.code;
      router.push(isAdminRole(role) ? '/admin' : '/employee');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="muted" style={{ marginBottom: 4 }}>
          Business command center
        </div>
        <h1>Go Staff</h1>
        <p className="muted" style={{ marginTop: 0, marginBottom: '1.5rem' }}>
          Sign in with your company Microsoft 365 account, or with the email and password issued by HR.
        </p>
        {error && <div className="error">{error}</div>}
        <a
          className="btn"
          href={`${API_URL}/auth/microsoft`}
          style={{ display: 'block', textAlign: 'center', marginBottom: '1rem' }}
        >
          Sign in with Microsoft
        </a>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Use the company email already saved on your employee record.
        </p>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label className="label">Email</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn secondary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in with password'}
          </button>
        </form>
        <p className="muted" style={{ fontSize: 13, marginTop: '1.25rem' }}>
          Demo password login: connect@aithworld.com / hr@gostaff.local / employee@gostaff.local — password123
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="login-page">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
