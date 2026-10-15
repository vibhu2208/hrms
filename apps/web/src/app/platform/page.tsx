'use client';

import { FormEvent, useEffect, useState } from 'react';
import { clearPlatformSession, getPlatformToken, platformApi, setPlatformSession } from '@/lib/api';

type Tenant = {
  id: string;
  name: string;
  slug: string;
  hosts: string[];
  ownerEmail: string;
  mailFrom: string | null;
  hasOwnDatabase: boolean;
  schemaName: string;
};

export default function PlatformPage() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [email, setEmail] = useState('superadmin@gostaff.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingSlug, setSavingSlug] = useState('');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [created, setCreated] = useState('');
  const [form, setForm] = useState({
    name: '',
    slug: '',
    ownerEmail: '',
    ownerFirstName: '',
    ownerLastName: '',
    ownerPassword: '',
    mailFrom: '',
    databaseUrl: '',
  });
  const [mailDrafts, setMailDrafts] = useState<Record<string, string>>({});

  async function loadTenants() {
    const rows = await platformApi<Tenant[]>('/platform/tenants');
    setTenants(rows);
    setMailDrafts(Object.fromEntries(rows.map((row) => [row.slug, row.mailFrom || ''])));
  }

  useEffect(() => {
    if (!getPlatformToken()) {
      setReady(true);
      return;
    }
    loadTenants()
      .then(() => setAuthed(true))
      .catch(() => {
        clearPlatformSession();
        setAuthed(false);
      })
      .finally(() => setReady(true));
  }, []);

  async function onLogin(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await platformApi<{ accessToken: string }>('/platform/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setPlatformSession(res.accessToken);
      await loadTenants();
      setAuthed(true);
    } catch (err: any) {
      setError(err?.message === 'Unauthorized' ? 'The email or password is not correct.' : err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError('');
    setCreated('');
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        ownerEmail: form.ownerEmail,
        ownerFirstName: form.ownerFirstName,
        ownerLastName: form.ownerLastName,
        mailFrom: form.mailFrom,
        ...(form.ownerPassword ? { ownerPassword: form.ownerPassword } : {}),
        ...(form.databaseUrl ? { databaseUrl: form.databaseUrl } : {}),
      };
      const createdTenant = await platformApi<Tenant & { ownerPassword?: string }>('/platform/tenants', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setCreated(
        `${createdTenant.name} is ready at ${createdTenant.hosts[0] || createdTenant.slug}. Owner ${createdTenant.ownerEmail} / ${createdTenant.ownerPassword}`,
      );
      setForm({ name: '', slug: '', ownerEmail: '', ownerFirstName: '', ownerLastName: '', ownerPassword: '', mailFrom: '', databaseUrl: '' });
      await loadTenants();
    } catch (err: any) {
      setError(err?.message || 'Could not add the company');
    } finally {
      setCreating(false);
    }
  }

  async function saveMail(slug: string) {
    setSavingSlug(slug);
    setError('');
    setCreated('');
    try {
      await platformApi(`/platform/tenants/${slug}/mail`, {
        method: 'PATCH',
        body: JSON.stringify({ mailFrom: mailDrafts[slug] || '' }),
      });
      setCreated('Sending email updated.');
      await loadTenants();
    } catch (err: any) {
      setError(err?.message || 'Could not update the sending email');
    } finally {
      setSavingSlug('');
    }
  }

  function signOut() {
    clearPlatformSession();
    setAuthed(false);
    setTenants([]);
  }

  if (!ready) {
    return <div className="login-page">Loading…</div>;
  }

  if (!authed) {
    return (
      <div className="login-page">
        <main className="login-main" style={{ margin: '0 auto' }}>
          <div className="login-brand">
            <strong>Go Staff</strong>
            <span>Platform admin</span>
          </div>
          <div className="login-card">
            <p className="login-kicker">Superadmin</p>
            <h1>Sign in</h1>
            <p className="login-lead">Manage companies. Each company keeps its own database.</p>
            {error && <div className="error">{error}</div>}
            <form onSubmit={onLogin}>
              <div className="field">
                <label className="label" htmlFor="platform-email">Email</label>
                <input id="platform-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="field">
                <label className="label" htmlFor="platform-password">Password</label>
                <input id="platform-password" className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <button className="btn login-submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="platform-page">
      <header className="platform-bar">
        <div>
          <strong>Go Staff</strong>
          <span>Platform admin</span>
        </div>
        <button className="btn secondary" type="button" onClick={signOut}>Sign out</button>
      </header>
      <main className="platform-main">
        <section className="card">
          <h1>Companies</h1>
          <table className="table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Address</th>
                <th>Owner</th>
                <th>Sending email</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id}>
                  <td>{tenant.name}</td>
                  <td>{tenant.hosts[0] || tenant.slug}</td>
                  <td>{tenant.ownerEmail}</td>
                  <td>
                    <div className="platform-mail">
                      <input
                        className="input"
                        type="email"
                        value={mailDrafts[tenant.slug] || ''}
                        onChange={(event) =>
                          setMailDrafts((current) => ({ ...current, [tenant.slug]: event.target.value }))
                        }
                      />
                      <button className="btn secondary" type="button" disabled={savingSlug === tenant.slug} onClick={() => saveMail(tenant.slug)}>
                        {savingSlug === tenant.slug ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </td>
                  <td>{tenant.hasOwnDatabase ? 'Separate database' : `Schema ${tenant.schemaName}`}</td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={5}>No companies yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h2>Add a company</h2>
          <p className="login-lead">Leave the database URL empty to create a new schema on this server. Paste a Postgres URL when the company should have its own database.</p>
          {error && <div className="error">{error}</div>}
          {created && <div className="platform-note">{created}</div>}
          <form onSubmit={onCreate} className="platform-form">
            <label>Company name<input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>Subdomain<input className="input" required placeholder="acme" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} /></label>
            <label>Owner email<input className="input" type="email" required value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} /></label>
            <label>Owner first name<input className="input" required value={form.ownerFirstName} onChange={(e) => setForm({ ...form, ownerFirstName: e.target.value })} /></label>
            <label>Owner last name<input className="input" required value={form.ownerLastName} onChange={(e) => setForm({ ...form, ownerLastName: e.target.value })} /></label>
            <label>Sending email<input className="input" type="email" required placeholder="hr@company.com" value={form.mailFrom} onChange={(e) => setForm({ ...form, mailFrom: e.target.value })} /></label>
            <label>Owner password<input className="input" type="password" placeholder="Defaults to password123" value={form.ownerPassword} onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })} /></label>
            <label>Own database URL<input className="input" placeholder="postgresql://..." value={form.databaseUrl} onChange={(e) => setForm({ ...form, databaseUrl: e.target.value })} /></label>
            <button className="btn" disabled={creating}>{creating ? 'Creating…' : 'Add company'}</button>
          </form>
        </section>
      </main>
    </div>
  );
}
