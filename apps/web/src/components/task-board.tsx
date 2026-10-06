'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_URL, api, getStoredUser } from '@/lib/api';
import { PlannerBoard } from '@/components/planner-board';
import {
  BoardTask,
  DueGroup,
  assigneeLabel,
  dueGroup,
  dueLabel,
  fromGoStaff,
  matchesDue,
  matchesSearch,
  matchesStatus,
  sourceLine,
} from '@/lib/tasks';

const SOURCE_TABS = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'My Tasks' },
  { id: 'gostaff', label: 'GoStaff' },
  { id: 'planner', label: 'Microsoft Planner' },
] as const;

const GROUPS: { id: DueGroup; label: string }[] = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'week', label: 'This week' },
  { id: 'later', label: 'Later' },
  { id: 'none', label: 'No due date' },
];

type SourceTab = (typeof SOURCE_TABS)[number]['id'];

export function TaskBoard({
  tasksQuery,
  returnTo,
  enableActions = false,
}: {
  tasksQuery: string;
  returnTo: '/admin/tasks' | '/employee/tasks';
  enableActions?: boolean;
}) {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [gostaff, setGoStaff] = useState<BoardTask[]>([]);
  const [gostaffLoading, setGoStaffLoading] = useState(false);
  const [gostaffError, setGoStaffError] = useState('');
  const [source, setSource] = useState<SourceTab>('planner');
  const [status, setStatus] = useState('all');
  const [due, setDue] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<BoardTask | null>(null);

  useEffect(() => {
    setEmployeeId(getStoredUser()?.employee?.id || null);
  }, []);

  async function loadGoStaff() {
    setGoStaffLoading(true);
    setGoStaffError('');
    try {
      const rows = await api<any[]>(tasksQuery);
      const mapped = (rows || []).map(fromGoStaff);
      setGoStaff(mapped);
      setSelected((current) => {
        if (!current || current.source !== 'gostaff') return current;
        return mapped.find((task) => task.key === current.key) || null;
      });
    } catch (err: any) {
      setGoStaffError(err?.message || 'Could not load GoStaff tasks.');
    } finally {
      setGoStaffLoading(false);
    }
  }

  useEffect(() => {
    if (source === 'planner') return;
    void loadGoStaff();
  }, [source, tasksQuery]);

  useEffect(() => {
    if (!selected) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelected(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const connectHref = `${API_URL}/auth/microsoft?prompt=consent&returnTo=${encodeURIComponent(returnTo)}`;

  const visible = useMemo(() => {
    const rows = gostaff.filter((task) => {
      if (source === 'mine' && task.source === 'gostaff') {
        const userId = getStoredUser()?.id;
        const mine = (employeeId && task.assigneeId === employeeId) || (userId && task.assigneeUserId === userId);
        if (!mine) return false;
      }
      return matchesStatus(task, status) && matchesDue(task, due) && matchesSearch(task, search);
    });
    return GROUPS.map((group) => ({
      ...group,
      tasks: rows.filter((task) => dueGroup(task) === group.id),
    })).filter((group) => group.tasks.length);
  }, [gostaff, source, employeeId, status, due, search]);

  const openTask = selected;

  async function complete(task: BoardTask) {
    await api(`/tasks/${task.sourceId}/complete`, { method: 'PATCH' });
    await loadGoStaff();
    setSelected(null);
  }

  async function toggleItem(task: BoardTask, itemId: string, completed: boolean) {
    await api(`/tasks/${task.sourceId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed: !completed }),
    });
    await loadGoStaff();
  }

  return (
    <section className="task-board">
      <div className="task-tabs" role="tablist" aria-label="Task source">
        {SOURCE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={source === tab.id}
            className={source === tab.id ? 'is-on' : ''}
            onClick={() => setSource(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="task-filters">
        <input
          className="input"
          value={search}
          placeholder="Search tasks..."
          aria-label="Search tasks"
          onChange={(event) => setSearch(event.target.value)}
        />
        <label>
          <span>Status</span>
          <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All</option>
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </label>
        <label>
          <span>Due</span>
          <select className="select" value={due} onChange={(event) => setDue(event.target.value)}>
            <option value="all">All</option>
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="week">This Week</option>
            <option value="overdue">Overdue</option>
          </select>
        </label>
      </div>

      {source === 'planner' ? (
        <PlannerBoard
          search={search}
          status={status}
          due={due}
          connectHref={connectHref}
        />
      ) : (
        <>
          {gostaffError && (
            <div className="task-note task-note-error">
              <strong>Couldn&apos;t load GoStaff tasks</strong>
              <p>{gostaffError}</p>
              <button className="btn secondary" type="button" onClick={() => loadGoStaff()}>Retry</button>
            </div>
          )}
          {gostaffLoading && <p className="muted">Loading tasks...</p>}
          {gostaffLoading && (
            <div className="task-skeletons" aria-hidden="true">
              <div className="card task-skeleton" />
              <div className="card task-skeleton" />
              <div className="card task-skeleton" />
            </div>
          )}
          {!gostaffLoading && !gostaffError && visible.length === 0 && (
            <p className="empty">{search || status !== 'all' || due !== 'all' ? 'No tasks match these filters.' : 'No tasks assigned'}</p>
          )}
          {visible.map((group) => (
            <div key={group.id} className="task-group">
              <h2>{group.label}</h2>
              {group.tasks.map((task) => (
                <TaskCard
                  key={task.key}
                  task={gostaff.find((row) => row.key === task.key) || task}
                  enableActions={enableActions}
                  onOpen={() => setSelected(gostaff.find((row) => row.key === task.key) || task)}
                  onComplete={() => complete(task)}
                  onToggle={(itemId, completed) => toggleItem(task, itemId, completed)}
                />
              ))}
            </div>
          ))}
        </>
      )}

      {openTask && (
        <div className="hr-modal task-modal" role="presentation" onClick={() => setSelected(null)}>
          <div
            className="hr-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="task-detail-head">
              <h2 id="task-detail-title">{openTask.title}</h2>
              <button className="btn secondary" type="button" onClick={() => setSelected(null)}>Close</button>
            </div>
            <p className="task-source">
              {openTask.source === 'planner' && <PlannerMark />}
              {sourceLine(openTask)}
            </p>
            {openTask.source === 'planner' && openTask.bucketName && <p className="muted">Bucket: {openTask.bucketName}</p>}
            <dl className="task-detail-list">
              <div><dt>Assigned to</dt><dd>{assigneeLabel(openTask)}</dd></div>
              {openTask.assignor && <div><dt>From</dt><dd>{openTask.assignor}</dd></div>}
              <div><dt>Due</dt><dd>{dueLabel(openTask.dueDate)}</dd></div>
              <div><dt>Status</dt><dd><span className={`badge ${openTask.badge}`}>{openTask.statusLabel}</span></dd></div>
              {openTask.priorityLabel && <div><dt>Priority</dt><dd>{openTask.priorityLabel}</dd></div>}
            </dl>
            <h3>Description</h3>
            <p>{openTask.description || 'No description'}</p>
            {openTask.checklist.length > 0 && (
              <ul className="task-check">
                {openTask.checklist.map((item) => (
                  <li key={item.id}>
                    {enableActions ? (
                      <label>
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={() => toggleItem(openTask, item.id, item.completed)}
                        />{' '}
                        {item.title}
                      </label>
                    ) : (
                      <span>{item.completed ? 'Done' : 'Open'} · {item.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="task-detail-actions">
              {enableActions && openTask.source === 'gostaff' && openTask.status !== 'completed' && (
                <button className="btn" type="button" onClick={() => complete(openTask)}>Complete</button>
              )}
              {openTask.source === 'planner' && openTask.externalUrl && (
                <a className="btn secondary" href={openTask.externalUrl} target="_blank" rel="noreferrer">
                  Open in Microsoft Planner
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function TaskCard({
  task,
  enableActions,
  onOpen,
  onComplete,
  onToggle,
}: {
  task: BoardTask;
  enableActions: boolean;
  onOpen: () => void;
  onComplete: () => void;
  onToggle: (itemId: string, completed: boolean) => void;
}) {
  return (
    <article className="card task-card">
      <button className="task-card-main" type="button" onClick={onOpen}>
        <span className="task-card-copy">
          <strong>{task.title}</strong>
          {task.description && <span className="muted task-card-desc">{task.description}</span>}
          <span className="task-source">
            {task.source === 'planner' && <PlannerMark />}
            {sourceLine(task)}
          </span>
          {task.bucketName && <span className="muted">Bucket: {task.bucketName}</span>}
          {task.assignor && <span className="muted">From {task.assignor}</span>}
        </span>
        <span className="task-card-meta">
          <span>{dueLabel(task.dueDate)}</span>
          <span className={`badge ${task.badge}`}>{task.statusLabel}</span>
          <span className="muted">{assigneeLabel(task)}</span>
        </span>
      </button>
      {enableActions && task.source === 'gostaff' && task.status !== 'completed' && (
        <div className="task-card-actions">
          <button className="btn" type="button" onClick={onComplete}>Complete</button>
        </div>
      )}
      {enableActions && task.checklist.length > 0 && (
        <ul className="task-check">
          {task.checklist.map((item) => (
            <li key={item.id}>
              <label>
                <input type="checkbox" checked={item.completed} onChange={() => onToggle(item.id, item.completed)} />{' '}
                {item.title}
              </label>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function PlannerMark() {
  return (
    <svg className="task-planner-mark" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1" y="1" width="6" height="6" rx="1.2" fill="currentColor" />
      <rect x="9" y="1" width="6" height="6" rx="1.2" fill="currentColor" opacity="0.55" />
      <rect x="1" y="9" width="6" height="6" rx="1.2" fill="currentColor" opacity="0.55" />
      <rect x="9" y="9" width="6" height="6" rx="1.2" fill="currentColor" opacity="0.35" />
    </svg>
  );
}
