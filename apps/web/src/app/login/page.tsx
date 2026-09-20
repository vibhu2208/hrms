'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, isAdminRole, setSession } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('owner@gostaff.local');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      <form className="login-card" onSubmit={onSubmit}>
        <div className="muted" style={{ marginBottom: 4 }}>Business command center</div>
        <h1>Go Staff</h1>
        <p className="muted" style={{ marginTop: 0, marginBottom: '1.5rem' }}>
          Sign in to manage people, tasks, and ingested business data in one place.
        </p>
        {error && <div className="error">{error}</div>}
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
        <button className="btn" style={{ width: '100%' }} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="muted" style={{ fontSize: 13, marginTop: '1.25rem' }}>
          Demo: owner@gostaff.local / hr@gostaff.local / employee@gostaff.local — password123
        </p>
      </form>
    </div>
  );
}
