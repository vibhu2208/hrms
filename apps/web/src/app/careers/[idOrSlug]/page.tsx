'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { publicApi } from '@/lib/api';

function jobMeta(job: {
  title?: string;
  designation?: { name?: string } | null;
  department?: { name?: string } | null;
  location?: string | null;
  employmentType?: string | null;
}) {
  const parts = [
    job.designation?.name && job.designation.name !== job.title ? job.designation.name : null,
    job.department?.name,
    job.location,
    job.employmentType?.replace('_', ' '),
  ];
  return parts.filter(Boolean).join(' | ');
}

export default function CareerJobPage() {
  const params = useParams();
  const idOrSlug = String(params.idOrSlug || '');
  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    resumeUrl: '',
    linkedInUrl: '',
    experienceYears: '',
    currentCompany: '',
    coverLetter: '',
  });

  useEffect(() => {
    if (!idOrSlug) return;
    publicApi(`/careers/jobs/${idOrSlug}`)
      .then(setJob)
      .catch((e) => setError(e.message));
  }, [idOrSlug]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await publicApi(`/careers/jobs/${idOrSlug}/apply`, {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          experienceYears: form.experienceYears
            ? Number(form.experienceYears)
            : undefined,
        }),
      });
      setDone(true);
    } catch (err: any) {
      setError(err.message || 'Application failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="careers-page">
      <header className="careers-header">
        <div className="careers-brand">
          <Link href="/careers">Go Staff</Link>
          <span>Careers</span>
        </div>
        <Link href="/careers" className="muted">← All openings</Link>
      </header>

      {error && !job && <div className="error">{error}</div>}
      {!job && !error && <p className="muted">Loading…</p>}

      {job && (
        <div className="careers-detail">
          <div>
            <p className="muted" style={{ marginBottom: 4 }}>{jobMeta(job)}</p>
            <h1 style={{ marginTop: 0 }}>{job.title}</h1>
            {job.salaryRange && <p className="muted">{job.salaryRange}</p>}
            {job.description && (
              <section style={{ marginTop: 24 }}>
                <h2 style={{ fontSize: '1.1rem' }}>About the role</h2>
                <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{job.description}</p>
              </section>
            )}
            {job.requirements && (
              <section style={{ marginTop: 24 }}>
                <h2 style={{ fontSize: '1.1rem' }}>Requirements</h2>
                <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{job.requirements}</p>
              </section>
            )}
          </div>

          <div className="card careers-apply">
            <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Apply for this role</h2>
            {done ? (
              <div>
                <p style={{ color: 'var(--ok)' }}>
                  Application received. HR will review it and email you about next steps.
                </p>
                <Link href="/careers" className="btn secondary">Back to openings</Link>
              </div>
            ) : (
              <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10 }}>
                {error && <div className="error">{error}</div>}
                <div className="field">
                  <label className="label">Full name</label>
                  <input
                    className="input"
                    required
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label className="label">Email</label>
                  <input
                    className="input"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label className="label">Phone</label>
                  <input
                    className="input"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label className="label">Resume / portfolio URL</label>
                  <input
                    className="input"
                    type="url"
                    placeholder="https://"
                    value={form.resumeUrl}
                    onChange={(e) => setForm({ ...form, resumeUrl: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label className="label">LinkedIn</label>
                  <input
                    className="input"
                    type="url"
                    value={form.linkedInUrl}
                    onChange={(e) => setForm({ ...form, linkedInUrl: e.target.value })}
                  />
                </div>
                <div className="grid grid-2" style={{ gap: 10 }}>
                  <div className="field">
                    <label className="label">Years of experience</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step={0.5}
                      value={form.experienceYears}
                      onChange={(e) => setForm({ ...form, experienceYears: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label className="label">Current company</label>
                    <input
                      className="input"
                      value={form.currentCompany}
                      onChange={(e) => setForm({ ...form, currentCompany: e.target.value })}
                    />
                  </div>
                </div>
                <div className="field">
                  <label className="label">Cover letter</label>
                  <textarea
                    className="input"
                    rows={4}
                    value={form.coverLetter}
                    onChange={(e) => setForm({ ...form, coverLetter: e.target.value })}
                  />
                </div>
                <button className="btn" disabled={saving}>
                  {saving ? 'Submitting…' : 'Submit application'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
