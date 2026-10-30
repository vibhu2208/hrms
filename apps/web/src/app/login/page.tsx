'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { API_URL, api, isAdminRole, safeTaskReturnPath, setSession } from '@/lib/api';

const AITH_DEMOS = [
  { label: 'Owner', email: 'owner@demo.com' },
  { label: 'HR', email: 'hr@demo.com' },
  { label: 'Employee', email: 'employee@owner.com' },
];

const TECH_DEMOS = [{ label: 'Owner', email: 'owner@techthrive.local' }];

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState('Go Staff');
  const [companySlug, setCompanySlug] = useState('');
  const [msHref, setMsHref] = useState(`${API_URL}/auth/microsoft`);

  useEffect(() => {
    const message = params.get('error');
    if (message) setError(message);
  }, [params]);

  useEffect(() => {
    const host = window.location.host;
    const safeReturn = safeTaskReturnPath(params.get('returnTo'));
    const query = new URLSearchParams({ host });
    if (safeReturn) query.set('returnTo', safeReturn);
    setMsHref(`${API_URL}/auth/microsoft?${query.toString()}`);
    api<{ name: string; slug: string }>('/tenant/current')
      .then((tenant) => {
        if (tenant.name) setCompanyName(tenant.name);
        setCompanySlug(tenant.slug || '');
      })
      .catch(() => {});
  }, [params]);

  const demos = companySlug === 'techthrive' ? TECH_DEMOS : companySlug === 'aithworld' ? AITH_DEMOS : [];

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
      const home = isAdminRole(role) ? '/admin' : '/employee';
      const next = safeTaskReturnPath(params.get('returnTo'));
      const allowed =
        next &&
        ((isAdminRole(role) && next.startsWith('/admin/')) ||
          (!isAdminRole(role) && next.startsWith('/employee/')));
      router.push(allowed ? next : home);
    } catch (err: any) {
      const message = err?.message === 'Unauthorized' ? 'The email or password is not correct.' : err?.message;
      setError(message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-stage">
        <img
          className="login-skyline"
          src="/login-skyline.png"
          alt=""
          aria-hidden="true"
        />
        <main className="login-main">
          <div className="login-brand">
            <strong>Go Staff</strong>
            <span>{companyName}</span>
          </div>
          <div className="login-card">
          <p className="login-kicker">Welcome back</p>
          <h1>Sign in</h1>
          <p className="login-lead">
            Use your company Microsoft 365 account, or the email and password issued by HR.
          </p>
          {error && <div className="error">{error}</div>}
          <a className="login-ms" href={msHref}>
            <MicrosoftMark />
            Sign in with Microsoft
          </a>
          <div className="login-or">
            <span>or continue with password</span>
          </div>
          <form onSubmit={onSubmit}>
            <div className="field">
              <label className="label" htmlFor="login-email">
                Work email
              </label>
              <input
                id="login-email"
                className="input"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="login-password">
                Password
              </label>
              <div className="login-pass">
                <input
                  id="login-password"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="login-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <button className="btn login-submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          {demos.length > 0 && (
          <div className="login-demos">
            <span>Try a demo</span>
            <div>
              {demos.map((demo) => (
                <button
                  key={demo.email}
                  type="button"
                  className={email === demo.email ? 'is-on' : ''}
                  onClick={() => {
                    setEmail(demo.email);
                    setPassword('password123');
                    setError('');
                  }}
                >
                  {demo.label}
                </button>
              ))}
            </div>
          </div>
          )}
          </div>
        </main>
        <aside className="login-aside">
          <blockquote className="login-quote">
            <span className="login-quote-mark" aria-hidden="true">“</span>
            <p>
              Attendance, leave, and the work of the day finally sit together. The morning feels quieter when the company is this easy to see.
            </p>
            <span className="login-quote-mark login-quote-mark-end" aria-hidden="true">”</span>
            <footer>
              <strong>Go Staff</strong>
              <span>For the people who keep the day moving</span>
            </footer>
          </blockquote>
        </aside>
      </div>
    </div>
  );
}

function MicrosoftMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="login-page">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
