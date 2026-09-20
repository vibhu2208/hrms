'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function MyPerformance() {
  const [score, setScore] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/performance/mine')
      .then(setScore)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>My performance</h1>
      {error && <div className="error">{error}</div>}
      {!score && !error && <p className="muted">No score computed yet. Ask HR to recompute.</p>}
      {score && (
        <div className="grid grid-2">
          <div className="card">
            <div className="stat-label">Overall</div>
            <div className="stat-value">{score.overall}</div>
            <span className={`badge ${score.band === 'GREEN' ? 'green' : score.band === 'AMBER' ? 'amber' : 'red'}`}>
              {score.band}
            </span>
          </div>
          <div className="card">
            <table className="table">
              <tbody>
                <tr><td>Task completion</td><td>{score.taskCompletion}</td></tr>
                <tr><td>Attendance</td><td>{score.attendance}</td></tr>
                <tr><td>Timeliness</td><td>{score.timeliness}</td></tr>
                <tr><td>Productivity</td><td>{score.productivity}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
