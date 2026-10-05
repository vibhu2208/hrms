'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Department = {
  id: string;
  name: string;
  code: string | null;
  _count?: { employees: number; positions: number };
};

type Designation = {
  id: string;
  name: string;
  _count?: { employees: number; positions: number };
};

function usage(count?: { employees: number; positions: number }) {
  const employees = count?.employees ?? 0;
  const jobs = count?.positions ?? 0;
  return `${employees} employee${employees === 1 ? '' : 's'} · ${jobs} job${jobs === 1 ? '' : 's'}`;
}

export default function ConfigurationPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [deptForm, setDeptForm] = useState({ name: '', code: '' });
  const [desigName, setDesigName] = useState('');
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [deptDraft, setDeptDraft] = useState({ name: '', code: '' });
  const [editingDesig, setEditingDesig] = useState<string | null>(null);
  const [desigDraft, setDesigDraft] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [deps, desigs] = await Promise.all([api<Department[]>('/departments'), api<Designation[]>('/designations')]);
    setDepartments(Array.isArray(deps) ? deps : []);
    setDesignations(Array.isArray(desigs) ? desigs : []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message || 'Could not load configuration'));
  }, []);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      await load();
      setMessage(success);
    } catch (err: any) {
      const text = err?.message;
      setError(Array.isArray(text) ? text.join(', ') : text || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  function addDepartment(event: FormEvent) {
    event.preventDefault();
    run(async () => {
      await api('/departments', {
        method: 'POST',
        body: JSON.stringify({ name: deptForm.name, code: deptForm.code || undefined }),
      });
      setDeptForm({ name: '', code: '' });
    }, 'Department added. It is now available in onboarding, employees, and job posts.');
  }

  function addDesignation(event: FormEvent) {
    event.preventDefault();
    run(async () => {
      await api('/designations', {
        method: 'POST',
        body: JSON.stringify({ name: desigName }),
      });
      setDesigName('');
    }, 'Designation added. It is now available in onboarding, employees, and job posts.');
  }

  return (
    <div>
      <h1 style={{ marginTop: 0, marginBottom: 4 }}>Configuration</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Departments and designations defined here are the only options when onboarding someone, adding an employee, or posting a job.
      </p>
      {message && (
        <div className="card" style={{ marginBottom: 12, background: 'var(--brand-soft)' }}>
          {message}
        </div>
      )}
      {error && (
        <div className="card" style={{ marginBottom: 12, color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <div className="grid grid-2" style={{ gap: 16, alignItems: 'start' }}>
        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Departments</h2>
          <form onSubmit={addDepartment} className="grid" style={{ gap: 10, marginBottom: 16 }}>
            <div className="field">
              <label className="label" htmlFor="dept-name">Name</label>
              <input
                id="dept-name"
                className="input"
                required
                value={deptForm.name}
                onChange={(event) => setDeptForm({ ...deptForm, name: event.target.value })}
                placeholder="Engineering"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="dept-code">Code</label>
              <input
                id="dept-code"
                className="input"
                value={deptForm.code}
                onChange={(event) => setDeptForm({ ...deptForm, code: event.target.value })}
                placeholder="ENG"
              />
            </div>
            <div>
              <button className="btn" disabled={busy}>Add department</button>
            </div>
          </form>
          {departments.length === 0 && <p className="empty">No departments yet</p>}
          <div style={{ display: 'grid', gap: 10 }}>
            {departments.map((department) => (
              <div key={department.id} style={{ borderTop: '1px solid var(--line, #e6e6e6)', paddingTop: 10 }}>
                {editingDept === department.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      run(async () => {
                        await api(`/departments/${department.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify(deptDraft),
                        });
                        setEditingDept(null);
                      }, 'Department updated');
                    }}
                    className="grid"
                    style={{ gap: 8 }}
                  >
                    <input
                      className="input"
                      required
                      value={deptDraft.name}
                      onChange={(event) => setDeptDraft({ ...deptDraft, name: event.target.value })}
                    />
                    <input
                      className="input"
                      value={deptDraft.code}
                      placeholder="Code"
                      onChange={(event) => setDeptDraft({ ...deptDraft, code: event.target.value })}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn" disabled={busy}>Save</button>
                      <button className="btn secondary" type="button" onClick={() => setEditingDept(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <div>
                      <strong>{department.name}</strong>
                      {department.code ? <span className="muted"> · {department.code}</span> : null}
                      <div className="muted" style={{ fontSize: 13 }}>{usage(department._count)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={() => {
                          setEditingDept(department.id);
                          setDeptDraft({ name: department.name, code: department.code || '' });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn danger"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(`Delete ${department.name}?`)) return;
                          run(
                            () => api(`/departments/${department.id}`, { method: 'DELETE' }),
                            'Department deleted',
                          );
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Designations</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            A designation is the job title, such as Software Engineer or HR Manager.
          </p>
          <form onSubmit={addDesignation} className="grid" style={{ gap: 10, marginBottom: 16 }}>
            <div className="field">
              <label className="label" htmlFor="desig-name">Name</label>
              <input
                id="desig-name"
                className="input"
                required
                value={desigName}
                onChange={(event) => setDesigName(event.target.value)}
                placeholder="Software Engineer"
              />
            </div>
            <div>
              <button className="btn" disabled={busy}>Add designation</button>
            </div>
          </form>
          {designations.length === 0 && <p className="empty">No designations yet</p>}
          <div style={{ display: 'grid', gap: 10 }}>
            {designations.map((designation) => (
              <div key={designation.id} style={{ borderTop: '1px solid var(--line, #e6e6e6)', paddingTop: 10 }}>
                {editingDesig === designation.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      run(async () => {
                        await api(`/designations/${designation.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ name: desigDraft }),
                        });
                        setEditingDesig(null);
                      }, 'Designation updated');
                    }}
                    style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
                  >
                    <input
                      className="input"
                      required
                      value={desigDraft}
                      onChange={(event) => setDesigDraft(event.target.value)}
                      style={{ flex: 1, minWidth: 160 }}
                    />
                    <button className="btn" disabled={busy}>Save</button>
                    <button className="btn secondary" type="button" onClick={() => setEditingDesig(null)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <div>
                      <strong>{designation.name}</strong>
                      <div className="muted" style={{ fontSize: 13 }}>{usage(designation._count)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={() => {
                          setEditingDesig(designation.id);
                          setDesigDraft(designation.name);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn danger"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(`Delete ${designation.name}?`)) return;
                          run(
                            () => api(`/designations/${designation.id}`, { method: 'DELETE' }),
                            'Designation deleted',
                          );
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
