'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function EmployeesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api(`/employees${search ? `?search=${encodeURIComponent(search)}` : ''}`).then(setRows);
  }, [search]);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Employees</h1>
      <input
        className="input"
        style={{ maxWidth: 320, marginBottom: 16 }}
        placeholder="Search name or code"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Department</th>
              <th>Designation</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td>{e.employeeCode}</td>
                <td>{e.firstName} {e.lastName}</td>
                <td>{e.department?.name}</td>
                <td>{e.designation?.name}</td>
                <td>{e.user?.email}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
