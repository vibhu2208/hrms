'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { publicApi } from '@/lib/api';

export default function CareersPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    publicApi('/careers/jobs')
      .then(setJobs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="careers-page">
      <header className="careers-header">
        <div className="careers-brand">
          <Link href="/careers">Go Staff</Link>
          <span>Careers</span>
        </div>
        <Link href="/login" className="btn secondary" style={{ fontSize: 14 }}>
          Employee login
        </Link>
      </header>

      <section className="careers-hero">
        <h1>Open roles</h1>
        <p>Join the team building our HR and business command center. Apply directly — HR reviews every application.</p>
      </section>

      {loading && <p className="muted">Loading openings…</p>}
      {error && <div className="error">{error}</div>}
      {!loading && !error && !jobs.length && (
        <p className="empty">No public openings right now. Check back soon.</p>
      )}

      <div className="careers-list">
        {jobs.map((job) => (
          <Link
            key={job.id}
            href={`/careers/${job.slug || job.id}`}
            className="careers-job"
          >
            <div>
              <h2>{job.title}</h2>
              <div className="muted">
                {[job.department?.name, job.location, job.employmentType?.replace('_', ' ')]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              {job.salaryRange && <div className="muted" style={{ marginTop: 4 }}>{job.salaryRange}</div>}
            </div>
            <span className="btn" style={{ pointerEvents: 'none' }}>View & apply</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
