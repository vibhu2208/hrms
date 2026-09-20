'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function MyTasks() {
  const [tasks, setTasks] = useState<any[]>([]);

  async function load() {
    setTasks(await api('/tasks?mine=true'));
  }

  useEffect(() => {
    load();
  }, []);

  async function complete(id: string) {
    await api(`/tasks/${id}/complete`, { method: 'PATCH' });
    await load();
  }

  async function toggleItem(taskId: string, itemId: string, completed: boolean) {
    await api(`/tasks/${taskId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed: !completed }),
    });
    await load();
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>My tasks</h1>
      {tasks.map((t) => (
        <div className="card" key={t.id} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <strong>{t.title}</strong>
              <div className="muted">{t.description}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                From {t.assignor?.firstName} · Due {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}
              </div>
            </div>
            <div>
              <span className="badge gray">{t.status}</span>
              {t.status === 'PENDING' || t.status === 'OVERDUE' ? (
                <button className="btn" style={{ marginLeft: 8 }} onClick={() => complete(t.id)}>Complete</button>
              ) : null}
            </div>
          </div>
          {t.checklistItems?.length > 0 && (
            <ul>
              {t.checklistItems.map((item: any) => (
                <li key={item.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => toggleItem(t.id, item.id, item.completed)}
                    />{' '}
                    {item.title}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {!tasks.length && <p className="empty">No tasks assigned</p>}
    </div>
  );
}
