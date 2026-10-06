'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import {
  BoardTask,
  PlannerBoardResponse,
  PlannerTask,
  assigneeLabel,
  dueLabel,
  fromPlanner,
  matchesDue,
  matchesSearch,
  matchesStatus,
} from '@/lib/tasks';

type Column = { id: string; name: string; tasks: BoardTask[] };
type RepeatValue = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
type PriorityValue = 'urgent' | 'important' | 'medium' | 'low';
type TaskEditor = {
  title: string;
  description: string;
  dueDate: string;
  startDate: string;
  status: string;
  bucketId: string;
  priority: PriorityValue;
  repeat: RepeatValue;
  showChecklist: boolean;
  assigneeIds: string[];
  labelIds: string[];
  checklist: { id: string; title: string; completed: boolean }[];
  attachments: { url: string; alias: string }[];
};
type PersonOption = { id: string; name: string };
type LabelOption = { id: string; name: string; color: string; selected?: boolean };
type TaskDetail = PlannerTask & {
  startDate?: string | null;
  bucketId?: string | null;
  createdAt?: string | null;
  createdByMe?: boolean;
  repeat?: RepeatValue;
  showChecklist?: boolean;
  assignees?: PersonOption[];
  members?: PersonOption[];
  labels?: LabelOption[];
  attachments?: { url: string; alias: string }[];
};

export function PlannerBoard({
  search,
  status,
  due,
  connectHref,
  onChanged,
}: {
  search: string;
  status: string;
  due: string;
  connectHref: string;
  onChanged?: () => void;
}) {
  const [board, setBoard] = useState<PlannerBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [planId, setPlanId] = useState('');
  const [notice, setNotice] = useState('');
  const [planTitle, setPlanTitle] = useState('');
  const [showPlan, setShowPlan] = useState(false);
  const [bucketName, setBucketName] = useState('');
  const [showBucket, setShowBucket] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [selected, setSelected] = useState<BoardTask | null>(null);
  const [doneOpen, setDoneOpen] = useState<Record<string, boolean>>({});
  const [editor, setEditor] = useState<TaskEditor>(emptyEditor());
  const [meta, setMeta] = useState<{ createdAt: string | null; createdByMe: boolean; members: PersonOption[]; labels: LabelOption[] }>({
    createdAt: null,
    createdByMe: false,
    members: [],
    labels: [],
  });
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [titleEditing, setTitleEditing] = useState(false);
  const [itemDraft, setItemDraft] = useState('');
  const [linkDraft, setLinkDraft] = useState({ url: '', alias: '' });
  const [detailReady, setDetailReady] = useState(false);
  const [extrasReady, setExtrasReady] = useState(false);
  const [saveHint, setSaveHint] = useState('');
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<TaskEditor>(emptyEditor());
  const readyRef = useRef(false);
  const loadedRef = useRef(false);
  const touchedRef = useRef(new Set<keyof TaskEditor>());
  const skipItemBlur = useRef('');
  const titleBeforeEdit = useRef('');
  const skipTitleBlur = useRef(false);
  const selectedIdRef = useRef('');
  const metaRef = useRef(meta);
  editorRef.current = editor;
  metaRef.current = meta;

  async function load(nextPlanId = planId) {
    setLoading(true);
    setNotice('');
    try {
      const query = nextPlanId ? `?planId=${encodeURIComponent(nextPlanId)}` : '';
      const res = await api<PlannerBoardResponse>(`/planner/board${query}${query ? '&' : '?'}fresh=${Date.now()}`, { cache: 'no-store' });
      setBoard(res);
      if (res.planId) setPlanId(res.planId);
    } catch {
      setBoard({ status: 'error', message: "Couldn't load Microsoft Planner tasks" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const columns = useMemo<Column[]>(() => {
    return (board?.buckets || []).map((bucket) => ({
      id: bucket.id,
      name: bucket.name,
      tasks: bucket.tasks
        .map(fromPlanner)
        .filter((task) => matchesStatus(task, status) && matchesDue(task, due) && matchesSearch(task, search)),
    }));
  }, [board, status, due, search]);

  async function run(action: () => Promise<string | void>) {
    setNotice('');
    setSaving(true);
    try {
      const nextPlan = await action();
      const id = nextPlan || planId;
      if (nextPlan) setPlanId(nextPlan);
      await load(id);
      onChanged?.();
    } catch (err: any) {
      setNotice(err?.message || "Couldn't save that Planner change.");
    } finally {
      setSaving(false);
    }
  }

  function ensureWrite(result: { status?: string; message?: string }) {
    if (result.status === 'ok') return;
    throw new Error(result.message || "Couldn't save that Planner change.");
  }

  async function createPlan(event: FormEvent) {
    event.preventDefault();
    const title = planTitle.trim();
    if (!title) return;
    await run(async () => {
      const res = await api<{ status: string; message?: string; plan?: { id: string } }>('/planner/plans', {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      ensureWrite(res);
      setPlanTitle('');
      setShowPlan(false);
      return res.plan?.id;
    });
  }

  async function createBucket(event: FormEvent) {
    event.preventDefault();
    const name = bucketName.trim();
    if (!name || !planId) return;
    await run(async () => {
      const res = await api<{ status: string; message?: string }>('/planner/buckets', {
        method: 'POST',
        body: JSON.stringify({ planId, name }),
      });
      ensureWrite(res);
      setBucketName('');
      setShowBucket(false);
    });
  }

  async function createTask(bucketId: string) {
    const title = (drafts[bucketId] || '').trim();
    if (!title || !planId) return;
    await run(async () => {
      const res = await api<{ status: string; message?: string }>('/planner/tasks', {
        method: 'POST',
        body: JSON.stringify({ planId, bucketId, title, assignToMe: true }),
      });
      ensureWrite(res);
      setDrafts((current) => ({ ...current, [bucketId]: '' }));
      setAdding(null);
    });
  }

  async function moveTask(taskId: string, bucketId: string) {
    setNotice('');
    try {
      const res = await api<{ status: string; message?: string }>(`/planner/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ bucketId }),
      });
      ensureWrite(res);
      setBoard((current) => moveBoardTask(current, taskId, bucketId));
    } catch (err: any) {
      setNotice(err?.message || "Couldn't save that Planner change.");
    }
  }

  async function renameBucket(bucketId: string, name: string, current: string) {
    const next = name.trim();
    if (!next || next === current) return;
    await run(async () => {
      const res = await api<{ status: string; message?: string }>(`/planner/buckets/${encodeURIComponent(bucketId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: next }),
      });
      ensureWrite(res);
    });
  }

  async function setProgress(task: BoardTask, next: BoardTask['status']) {
    const status = next === 'completed' ? 'not_started' : 'completed';
    setNotice('');
    try {
      const res = await api<{ status: string; message?: string }>(`/planner/tasks/${encodeURIComponent(task.sourceId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      ensureWrite(res);
      setBoard((current) => updateBoardTask(current, task.sourceId, { status, percentComplete: status === 'completed' ? 100 : 0 }));
    } catch (err: any) {
      setNotice(err?.message || "Couldn't save that Planner change.");
    }
  }

  async function openTask(task: BoardTask, bucketId: string) {
    const initial = editorFromTask(task, bucketId);
    selectedIdRef.current = task.sourceId;
    readyRef.current = true;
    loadedRef.current = false;
    touchedRef.current = new Set();
    setSelected(task);
    setLabelsOpen(false);
    setAssignOpen(false);
    setTitleEditing(false);
    setItemDraft('');
    setLinkDraft({ url: '', alias: '' });
    setSaveHint('');
    setDetailReady(true);
    setExtrasReady(false);
    setEditor(initial);
    editorRef.current = initial;
    setMeta({ createdAt: null, createdByMe: false, members: [], labels: [] });
    try {
      const res = await api<{ status: string; message?: string; task?: TaskDetail }>(`/planner/tasks/${encodeURIComponent(task.sourceId)}`);
      if (selectedIdRef.current !== task.sourceId) return;
      if (res.status === 'ok' && res.task) {
        const loaded = editorFromDetail(res.task, bucketId);
        const next = { ...loaded };
        for (const key of touchedRef.current) Object.assign(next, { [key]: editorRef.current[key] });
        setEditor(next);
        editorRef.current = next;
        loadedRef.current = true;
        setExtrasReady(true);
        setMeta({
          createdAt: res.task.createdAt || null,
          createdByMe: Boolean(res.task.createdByMe),
          members: res.task.members || [],
          labels: res.task.labels || [],
        });
      } else {
        setSaveHint(res.message || "Couldn't load that task.");
      }
    } catch {
      if (selectedIdRef.current === task.sourceId) setSaveHint("Couldn't load that task.");
    }
  }

  async function persist(patch?: Partial<TaskEditor>) {
    const taskId = selectedIdRef.current;
    if (!taskId || !readyRef.current) return;
    if (patch) {
      for (const key of Object.keys(patch) as (keyof TaskEditor)[]) touchedRef.current.add(key);
    }
    const next = { ...editorRef.current, ...patch };
    editorRef.current = next;
    setEditor(next);
    const title = next.title.trim();
    if (!title) {
      setSaveHint('A title is required.');
      return;
    }
    const body = changedFields(patch || next);
    if (!Object.keys(body).length) return;
    setSaveHint('Saving…');
    try {
      const res = await api<{ status: string; message?: string }>(`/planner/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      if (res.status !== 'ok') throw new Error(res.message || "Couldn't save that task.");
      if (selectedIdRef.current === taskId) setSaveHint('Saved');
      setBoard((current) => paintBoardTask(current, taskId, next, metaRef.current.members));
    } catch (err: any) {
      if (selectedIdRef.current === taskId) setSaveHint(err?.message || "Couldn't save that task.");
    }
  }

  function addChecklistItem(raw: string) {
    const title = raw.trim();
    if (!title || skipItemBlur.current === title) return;
    skipItemBlur.current = title;
    setItemDraft('');
    void persist({ checklist: [...editorRef.current.checklist, { id: newItemId(), title, completed: false }] });
  }

  function saveTask(event: FormEvent) {
    event.preventDefault();
    if (!loadedRef.current) return;
    void persist();
  }

  async function removeTask() {
    if (!selected || !window.confirm('Delete this Planner task?')) return;
    await run(async () => {
      const res = await api<{ status: string; message?: string }>(`/planner/tasks/${encodeURIComponent(selected.sourceId)}`, {
        method: 'DELETE',
      });
      ensureWrite(res);
      setSelected(null);
    });
  }

  if (loading && !board) {
    return (
      <div className="planner-columns" aria-hidden="true">
        <div className="planner-column planner-column-loading" />
        <div className="planner-column planner-column-loading" />
        <div className="planner-column planner-column-loading" />
      </div>
    );
  }

  if (board && board.status !== 'ok') {
    const reconnect = board.status === 'needsConsent' || board.status === 'needsPlannerConsent' || board.status === 'expired';
    return (
      <div className="task-note">
        <strong>{reconnect ? "Microsoft Planner isn't connected" : "Couldn't load Microsoft Planner"}</strong>
        <p>{board.message || 'Connect Microsoft to use Planner inside GoStaff.'}</p>
        {reconnect ? <a className="btn" href={connectHref}>Connect Microsoft</a> : <button className="btn secondary" type="button" onClick={() => load(planId)}>Retry</button>}
      </div>
    );
  }

  const canWrite = Boolean(board?.canWrite);

  return (
    <div className="planner-shell">
      <div className="planner-toolbar">
        <label>
          <span>Plan</span>
          <select
            className="select"
            value={planId}
            onChange={(event) => {
              setPlanId(event.target.value);
              load(event.target.value);
            }}
          >
            {(board?.plans || []).map((plan) => (
              <option key={plan.id} value={plan.id}>{plan.title}</option>
            ))}
            {(board?.plans || []).length === 0 && <option value="">No plans yet</option>}
          </select>
        </label>
        {canWrite && (
          <button className="btn" type="button" onClick={() => setShowPlan((open) => !open)}>New plan</button>
        )}
      </div>
      {showPlan && (
        <form className="planner-inline" onSubmit={createPlan}>
          <input className="input" value={planTitle} placeholder="Plan name" aria-label="Plan name" onChange={(event) => setPlanTitle(event.target.value)} />
          <button className="btn" type="submit" disabled={saving}>Create plan</button>
        </form>
      )}
      {!canWrite && (
        <div className="task-note">
          <strong>Planner is view only</strong>
          <p>Reconnect Microsoft so GoStaff can create and edit plans, buckets, and tasks.</p>
          <a className="btn" href={connectHref}>Reconnect Microsoft</a>
        </div>
      )}
      {notice && <p className="task-note task-note-error">{notice}</p>}
      {(board?.plans || []).length === 0 && (
        <p className="empty">Create a plan to start a board.</p>
      )}
      <div className="planner-columns">
        {columns.map((column) => {
          const openTasks = column.tasks.filter((task) => task.status !== 'completed');
          const doneTasks = column.tasks.filter((task) => task.status === 'completed');
          const showDone = doneOpen[column.id] !== false;
          return (
          <section
            key={column.id}
            className="planner-column"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const [taskId, from] = event.dataTransfer.getData('text/plain').split('\n');
              if (taskId && from && from !== column.id) moveTask(taskId, column.id);
            }}
          >
            <h2>
              <EditableTitle
                value={column.name}
                canWrite={canWrite}
                label={`Rename ${column.name}`}
                className="planner-bucket-input"
                onSave={(name) => renameBucket(column.id, name, column.name)}
              />
            </h2>
            {canWrite && adding === column.id ? (
              <form
                className="planner-add-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  createTask(column.id);
                }}
              >
                <input
                  className="input"
                  autoFocus
                  placeholder="Task name"
                  aria-label={`Add a task in ${column.name}`}
                  value={drafts[column.id] || ''}
                  onChange={(event) => setDrafts((current) => ({ ...current, [column.id]: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setAdding(null);
                  }}
                />
                <button className="btn" type="submit" disabled={saving}>Add</button>
              </form>
            ) : canWrite ? (
              <button className="planner-add" type="button" onClick={() => setAdding(column.id)}>+ Add task</button>
            ) : null}
            {openTasks.map((task) => (
              <PlannerCard
                key={task.key}
                task={task}
                canWrite={canWrite}
                saving={saving}
                bucketId={column.id}
                onOpen={() => openTask(task, column.id)}
                onToggle={() => setProgress(task, task.status)}
              />
            ))}
            {doneTasks.length > 0 && (
              <div className="planner-done">
                <button
                  type="button"
                  className="planner-done-toggle"
                  aria-expanded={showDone}
                  onClick={() => setDoneOpen((current) => ({ ...current, [column.id]: !showDone }))}
                >
                  <span className={showDone ? 'is-open' : ''}>▸</span>
                  Completed tasks
                  <span className="planner-done-count">{doneTasks.length}</span>
                </button>
                {showDone && doneTasks.map((task) => (
                  <PlannerCard
                    key={task.key}
                    task={task}
                    canWrite={canWrite}
                    saving={saving}
                    bucketId={column.id}
                    onOpen={() => openTask(task, column.id)}
                    onToggle={() => setProgress(task, task.status)}
                  />
                ))}
              </div>
            )}
          </section>
          );
        })}
        {canWrite && planId && (
          <section className="planner-column planner-column-new">
            {showBucket ? (
              <form className="planner-add-form" onSubmit={createBucket}>
                <input
                  className="input"
                  autoFocus
                  placeholder="Bucket name"
                  aria-label="Bucket name"
                  value={bucketName}
                  onChange={(event) => setBucketName(event.target.value)}
                />
                <button className="btn" type="submit" disabled={saving}>Add bucket</button>
              </form>
            ) : (
              <button className="planner-add" type="button" onClick={() => setShowBucket(true)}>+ Add bucket</button>
            )}
          </section>
        )}
      </div>

      {selected && (
        <div className="hr-modal task-modal" role="presentation" onClick={() => setSelected(null)}>
          <form
            className="hr-modal-card planner-task-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="planner-edit-title"
            onClick={(event) => {
              event.stopPropagation();
              const target = event.target as HTMLElement;
              if (!target.closest('.planner-menu')) {
                setLabelsOpen(false);
                setAssignOpen(false);
              }
            }}
            onSubmit={saveTask}
          >
            <div className="planner-dialog-bar">
              <span className="planner-dialog-plan">{board?.plans?.find((plan) => plan.id === planId)?.title || selected.context || 'Planner'}</span>
              <button className="planner-dialog-close" type="button" aria-label="Close" onClick={() => setSelected(null)}>
                <CloseIcon />
              </button>
            </div>
            <div className="planner-dialog-title-row">
              <button
                type="button"
                className={`planner-circle${editor.status === 'completed' ? ' is-on' : ''}`}
                aria-label={editor.status === 'completed' ? 'Mark not started' : 'Mark complete'}
                disabled={!canWrite || !detailReady}
                onClick={() => void persist({ status: editor.status === 'completed' ? 'not_started' : 'completed' })}
              />
              {titleEditing ? (
                <input
                  id="planner-edit-title"
                  className="planner-dialog-title"
                  aria-label="Task title"
                  autoFocus
                  value={editor.title}
                  onChange={(event) => setEditor({ ...editor, title: event.target.value })}
                  onBlur={(event) => {
                    if (skipTitleBlur.current) {
                      skipTitleBlur.current = false;
                      setTitleEditing(false);
                      return;
                    }
                    const title = event.target.value.trim();
                    setTitleEditing(false);
                    if (!title || title === titleBeforeEdit.current.trim()) {
                      setEditor({ ...editorRef.current, title: title || titleBeforeEdit.current });
                      return;
                    }
                    void persist({ title });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      skipTitleBlur.current = true;
                      setEditor({ ...editorRef.current, title: titleBeforeEdit.current });
                      setTitleEditing(false);
                    }
                  }}
                />
              ) : (
                <button
                  id="planner-edit-title"
                  className="planner-dialog-title-text"
                  type="button"
                  disabled={!canWrite || !detailReady}
                  onClick={() => {
                    titleBeforeEdit.current = editor.title;
                    setTitleEditing(true);
                  }}
                >
                  {editor.title}
                </button>
              )}
            </div>
            {createdLine(meta.createdAt, meta.createdByMe) && <p className="planner-meta">{createdLine(meta.createdAt, meta.createdByMe)}</p>}
            <div className="planner-menu">
              <button
                className="planner-quiet"
                type="button"
                disabled={!canWrite || !detailReady}
                aria-expanded={labelsOpen}
                onClick={() => {
                  setAssignOpen(false);
                  setLabelsOpen((open) => !open);
                }}
              >
                <TagIcon />
                Add label
              </button>
              {editor.labelIds.map((id) => {
                const label = meta.labels.find((item) => item.id === id);
                return (
                  <button key={id} type="button" className="planner-chip" disabled={!canWrite} onClick={() => void persist({ labelIds: editor.labelIds.filter((item) => item !== id) })}>
                    <span className="planner-label-dot" style={{ background: label?.color || 'var(--brand)' }} />
                    {label?.name || 'Label'}
                  </button>
                );
              })}
              {labelsOpen && (
                <div className="planner-dropdown" role="listbox" aria-label="Labels">
                  {meta.labels.length === 0 && <p className="planner-dropdown-empty">{extrasReady ? 'No labels on this plan' : 'Loading labels…'}</p>}
                  {meta.labels.map((label) => (
                    <button
                      key={label.id}
                      type="button"
                      role="option"
                      aria-selected={editor.labelIds.includes(label.id)}
                      className={editor.labelIds.includes(label.id) ? 'is-on' : ''}
                      onClick={() => void persist({ labelIds: editor.labelIds.includes(label.id) ? editor.labelIds.filter((id) => id !== label.id) : [...editor.labelIds, label.id] })}
                    >
                      <span className="planner-label-dot" style={{ background: label.color }} />
                      {label.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="planner-menu">
              <button
                className="planner-quiet"
                type="button"
                disabled={!canWrite || !detailReady}
                aria-expanded={assignOpen}
                onClick={() => {
                  setLabelsOpen(false);
                  setAssignOpen((open) => !open);
                }}
              >
                <PersonIcon />
                Assign to
              </button>
              {editor.assigneeIds.map((id) => {
                const person = meta.members.find((item) => item.id === id);
                return (
                  <button key={id} type="button" className="planner-chip" disabled={!canWrite || !detailReady} onClick={() => void persist({ assigneeIds: editor.assigneeIds.filter((item) => item !== id) })}>
                    {person?.name || 'Assigned'}
                  </button>
                );
              })}
              {assignOpen && (
                <div className="planner-dropdown" role="listbox" aria-label="Assign to">
                  {meta.members.length === 0 && <p className="planner-dropdown-empty">{extrasReady ? 'No people in this plan' : 'Loading people…'}</p>}
                  {meta.members.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      role="option"
                      aria-selected={editor.assigneeIds.includes(person.id)}
                      className={editor.assigneeIds.includes(person.id) ? 'is-on' : ''}
                      onClick={() => void persist({
                        assigneeIds: editor.assigneeIds.includes(person.id)
                          ? editor.assigneeIds.filter((id) => id !== person.id)
                          : [...editor.assigneeIds, person.id],
                      })}
                    >
                      <PersonIcon />
                      {person.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="planner-detail-grid">
              <label className="field">
                <span className="label">Status</span>
                <select className="select" value={editor.status} disabled={!canWrite || !detailReady} onChange={(event) => void persist({ status: event.target.value })}>
                  <option value="not_started">Not started</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              <label className="field">
                <span className="label">Priority</span>
                <select className="select" value={editor.priority} disabled={!canWrite || !detailReady} onChange={(event) => void persist({ priority: event.target.value as PriorityValue })}>
                  <option value="urgent">Urgent</option>
                  <option value="important">Important</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <DateField
                label="Start date"
                value={editor.startDate}
                placeholder="Set start date"
                disabled={!canWrite || !detailReady}
                onPick={(startDate) => void persist({ startDate })}
              />
              <DateField
                label="Due date"
                value={editor.dueDate}
                placeholder="Set due date"
                disabled={!canWrite || !detailReady}
                onPick={(dueDate) => void persist({ dueDate })}
              />
              <label className="field">
                <span className="label">Repeat</span>
                <select className="select" value={editor.repeat} disabled={!canWrite || !detailReady} onChange={(event) => void persist({ repeat: event.target.value as RepeatValue })}>
                  <option value="none">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>
              <label className="field">
                <span className="label">Bucket</span>
                <select className="select" value={editor.bucketId} disabled={!canWrite || !detailReady} onChange={(event) => void persist({ bucketId: event.target.value })}>
                  {columns.map((column) => (
                    <option key={column.id} value={column.id}>{column.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="planner-dialog-body">
              <div className="planner-dialog-main">
                <label className="field">
                  <span className="label">Notes</span>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Type a description or add notes here"
                    value={editor.description}
                    disabled={!canWrite || !detailReady}
                    onChange={(event) => {
                      const description = event.target.value;
                      const next = { ...editorRef.current, description };
                      editorRef.current = next;
                      setEditor(next);
                    }}
                    onBlur={(event) => void persist({ description: event.target.value })}
                  />
                </label>
                <div className="planner-attachments">
                  <strong>Attachments</strong>
                  {editor.attachments.length === 0 && <p className="muted">No attachments yet.</p>}
                  <ul>
                    {editor.attachments.map((item) => (
                      <li key={item.url}>
                        <a href={item.url} target="_blank" rel="noreferrer">{item.alias || item.url}</a>
                        {canWrite && (
                          <button type="button" className="planner-text-btn" disabled={!detailReady} onClick={() => void persist({ attachments: editor.attachments.filter((row) => row.url !== item.url) })}>Remove</button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {canWrite && (
                    <div className="planner-attachment-add">
                      <input className="input" placeholder="https:// link" aria-label="Attachment link" value={linkDraft.url} disabled={!detailReady} onChange={(event) => setLinkDraft({ ...linkDraft, url: event.target.value })} />
                      <input className="input" placeholder="Name" aria-label="Attachment name" value={linkDraft.alias} disabled={!detailReady} onChange={(event) => setLinkDraft({ ...linkDraft, alias: event.target.value })} />
                      <button
                        className="btn secondary"
                        type="button"
                        disabled={!detailReady || !/^https:\/\//i.test(linkDraft.url.trim())}
                        onClick={() => {
                          const url = linkDraft.url.trim();
                          if (!/^https:\/\//i.test(url)) return;
                          setLinkDraft({ url: '', alias: '' });
                          void persist({ attachments: [...editor.attachments.filter((item) => item.url !== url), { url, alias: linkDraft.alias.trim() || url }] });
                        }}
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="planner-dialog-side">
                <div className="planner-section-head">
                  <strong>Checklist ({editor.checklist.filter((item) => item.completed).length} of {editor.checklist.length} items done)</strong>
                  <label>
                    <input
                      type="checkbox"
                      checked={editor.showChecklist}
                      disabled={!canWrite || !detailReady}
                      onChange={(event) => void persist({ showChecklist: event.target.checked })}
                    />
                    Show in board view
                  </label>
                </div>
                <ul className="planner-dialog-checks">
                  {editor.checklist.map((item) => (
                    <li key={item.id} className={item.completed ? 'is-done' : ''}>
                      <button
                        type="button"
                        className={`planner-circle${item.completed ? ' is-on' : ''}`}
                        aria-label={`${item.completed ? 'Uncheck' : 'Check'} ${item.title}`}
                        disabled={!canWrite || !detailReady}
                        onClick={() => void persist({ checklist: editor.checklist.map((row) => row.id === item.id ? { ...row, completed: !row.completed } : row) })}
                      />
                      <span>{item.title}</span>
                      {canWrite && (
                        <button type="button" className="planner-text-btn" disabled={!detailReady} onClick={() => void persist({ checklist: editor.checklist.filter((row) => row.id !== item.id) })}>Remove</button>
                      )}
                    </li>
                  ))}
                </ul>
                {canWrite && (
                  <input
                    className="input"
                    placeholder="Add an item"
                    aria-label="Add a checklist item"
                    value={itemDraft}
                    disabled={!detailReady}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value.trim() !== skipItemBlur.current) skipItemBlur.current = '';
                      setItemDraft(value);
                    }}
                    onBlur={(event) => addChecklistItem(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      addChecklistItem(event.currentTarget.value);
                    }}
                  />
                )}
              </div>
            </div>
            <div className="task-detail-actions">
              <span className="planner-save-hint">{detailReady ? saveHint : 'Loading task…'}</span>
              {canWrite && <button className="btn" type="submit" disabled={!extrasReady || saveHint === 'Saving…'}>Save</button>}
              {canWrite && <button className="btn secondary" type="button" disabled={saving || !detailReady} onClick={removeTask}>Delete</button>}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function EditableTitle({
  value,
  canWrite,
  label,
  className,
  onSave,
  onEditing,
}: {
  value: string;
  canWrite: boolean;
  label: string;
  className: string;
  onSave: (value: string) => void;
  onEditing?: (editing: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const committed = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function begin() {
    if (!canWrite) return;
    committed.current = false;
    setDraft(value);
    setEditing(true);
    onEditing?.(true);
  }

  function commit(raw: string) {
    if (committed.current) return;
    committed.current = true;
    setEditing(false);
    onEditing?.(false);
    const next = raw.trim();
    if (next && next !== value) onSave(next);
  }

  if (editing) {
    return (
      <input
        className={className}
        value={draft}
        aria-label={label}
        autoFocus
        onMouseDown={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(event.currentTarget.value);
          }
          if (event.key === 'Escape') {
            committed.current = true;
            setDraft(value);
            setEditing(false);
            onEditing?.(false);
          }
        }}
      />
    );
  }

  return (
    <button type="button" className="planner-title-button" aria-label={label} onClick={begin}>
      {value}
    </button>
  );
}

function initials(name: string | null) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
}

function PlannerCard({
  task,
  canWrite,
  saving,
  bucketId,
  onOpen,
  onToggle,
}: {
  task: BoardTask;
  canWrite: boolean;
  saving: boolean;
  bucketId: string;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const done = task.checklist.filter((item) => item.completed).length;
  const person = assigneeLabel(task);
  const mark = person !== 'Unassigned' ? initials(task.assignedTo) : '';
  const late = Boolean(task.status !== 'completed' && task.dueDate && new Date(task.dueDate).getTime() < Date.now());
  return (
    <article
      className={`planner-card${task.status === 'completed' ? ' is-done' : ''}`}
      draggable={canWrite}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', `${task.sourceId}\n${bucketId}`);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('.planner-circle')) return;
        onOpen();
      }}
    >
      <div className="planner-card-title">
        <button
          type="button"
          className={`planner-circle${task.status === 'completed' ? ' is-on' : ''}`}
          aria-label={`Mark ${task.title} ${task.status === 'completed' ? 'not started' : 'complete'}`}
          disabled={!canWrite || saving}
          onClick={onToggle}
        />
        <button
          type="button"
          className="planner-title-button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          {task.title}
        </button>
      </div>
      {task.checklist.length > 0 && (
        <ul className="planner-subtasks">
          {task.checklist.map((item) => (
            <li key={item.id} className={item.completed ? 'is-done' : ''}>
              <span className={`planner-circle${item.completed ? ' is-on' : ''}`} />
              <span>{item.title}</span>
            </li>
          ))}
        </ul>
      )}
      {(task.dueDate || task.checklist.length > 0 || mark) && (
        <div className="planner-card-foot">
          {task.dueDate && <span className={late ? 'is-late' : ''}>{dueLabel(task.dueDate)}</span>}
          {task.checklist.length > 0 && <span>{done}/{task.checklist.length}</span>}
          {mark && <span className="planner-avatar" title={person}>{mark}</span>}
        </div>
      )}
    </article>
  );
}

function emptyEditor(): TaskEditor {
  return {
    title: '',
    description: '',
    dueDate: '',
    startDate: '',
    status: 'not_started',
    bucketId: '',
    priority: 'medium',
    repeat: 'none',
    showChecklist: false,
    assigneeIds: [],
    labelIds: [],
    checklist: [],
    attachments: [],
  };
}

function editorFromTask(task: BoardTask, bucketId: string): TaskEditor {
  return {
    ...emptyEditor(),
    title: task.title,
    description: task.description || '',
    dueDate: dateInput(task.dueDate),
    status: task.status === 'completed' || task.status === 'in_progress' ? task.status : 'not_started',
    bucketId,
    priority: task.priorityLabel === 'Urgent' ? 'urgent' : task.priorityLabel === 'Important' ? 'important' : task.priorityLabel === 'Low' ? 'low' : 'medium',
    showChecklist: task.checklist.length > 0,
    checklist: task.checklist.map((item) => ({ ...item })),
  };
}

function editorFromDetail(task: TaskDetail, bucketId: string): TaskEditor {
  return {
    title: task.title,
    description: task.description || '',
    dueDate: dateInput(task.dueDate),
    startDate: task.startDate || '',
    status: task.status === 'completed' || task.status === 'in_progress' ? task.status : 'not_started',
    bucketId: task.bucketId || bucketId,
    priority: task.priority == null ? 'medium' : task.priority <= 1 ? 'urgent' : task.priority <= 4 ? 'important' : task.priority <= 7 ? 'medium' : 'low',
    repeat: task.repeat || 'none',
    showChecklist: Boolean(task.showChecklist),
    assigneeIds: (task.assignees || []).map((person) => person.id),
    labelIds: (task.labels || []).filter((label) => label.selected).map((label) => label.id),
    checklist: (task.checklist || []).map((item) => ({ id: item.id, title: item.title, completed: item.completed })),
    attachments: (task.attachments || []).map((item) => ({ url: item.url, alias: item.alias })),
  };
}

function dateInput(value?: string | null) {
  return value ? value.slice(0, 10) : '';
}

function parseIso(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function toIso(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function monthCells(cursor: Date) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: { date: Date; outside: boolean }[] = [];
  for (let index = 0; index < startOffset; index += 1) {
    cells.push({ date: new Date(year, month, 1 - (startOffset - index)), outside: true });
  }
  for (let day = 1; day <= days; day += 1) cells.push({ date: new Date(year, month, day), outside: false });
  while (cells.length % 7 !== 0) {
    cells.push({ date: new Date(year, month + 1, cells.length - startOffset - days + 1), outside: true });
  }
  return cells;
}

function DateField({
  label,
  value,
  placeholder,
  disabled,
  onPick,
}: {
  label: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  onPick: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ top: 0, left: 0, lift: false });
  const root = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const selected = value ? parseIso(value) : null;
  const [cursor, setCursor] = useState(() => {
    const base = selected || new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) return;
    const base = value ? parseIso(value) : new Date();
    setCursor(new Date(base.getFullYear(), base.getMonth(), 1));
    function onDoc(event: MouseEvent) {
      const node = event.target as Node;
      if (root.current?.contains(node) || pop.current?.contains(node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, value]);

  function toggleCalendar() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = root.current?.getBoundingClientRect();
    if (!rect) return;
    const lift = window.innerHeight - rect.bottom < 340;
    setPlace({ top: lift ? rect.top - 8 : rect.bottom + 6, left: rect.left, lift });
    setOpen(true);
  }

  const today = new Date();
  const calendar = open ? (
    <div
      ref={pop}
      className={`planner-cal${place.lift ? ' is-up' : ''}`}
      role="dialog"
      aria-label={`${label} calendar`}
      style={{ top: place.top, left: place.left }}
    >
          <div className="planner-cal-head">
            <button type="button" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>‹</button>
            <strong>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
            <button type="button" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>›</button>
          </div>
          <div className="planner-cal-grid">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => <span key={day}>{day}</span>)}
            {monthCells(cursor).map((cell) => {
              const picked = selected ? sameDay(cell.date, selected) : false;
              const isToday = sameDay(cell.date, today);
              return (
                <button
                  key={toIso(cell.date)}
                  type="button"
                  className={`${cell.outside ? 'is-out' : ''} ${picked ? 'is-on' : ''} ${isToday ? 'is-today' : ''}`}
                  onClick={() => {
                    onPick(toIso(cell.date));
                    setOpen(false);
                  }}
                >
                  {cell.date.getDate()}
                </button>
              );
            })}
          </div>
          <button
            className="planner-cal-clear"
            type="button"
            onClick={() => {
              onPick('');
              setOpen(false);
            }}
          >
            Clear date
          </button>
        </div>
  ) : null;
  return (
    <div className="field planner-date" ref={root}>
      <span className="label">{label}</span>
      <button
        className={`planner-date-btn${value ? '' : ' is-empty'}`}
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        onClick={toggleCalendar}
      >
        <span>{value ? parseIso(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : placeholder}</span>
        <CalendarIcon />
      </button>
      {calendar && typeof document !== 'undefined' ? createPortal(calendar, document.body) : null}
    </div>
  );
}

function TagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 12.2V6.2A2.2 2.2 0 0 1 5.7 4h6l8.1 8.1a2.2 2.2 0 0 1 0 3.1l-4.6 4.6a2.2 2.2 0 0 1-3.1 0L3.5 12.2Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="8.2" cy="8.2" r="1.2" fill="currentColor" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5.2 19.2c1.3-3 3.7-4.5 6.8-4.5s5.5 1.5 6.8 4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function createdLine(iso: string | null, byMe: boolean) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  let when = new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (mins < 60) when = `${Math.max(mins, 1)}m ago`;
  else if (mins < 60 * 24) when = `${Math.round(mins / 60)}h ago`;
  return `Created ${when}${byMe ? ' by you' : ''}`;
}

function newItemId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 28);
}

function changedFields(patch: Partial<TaskEditor>) {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.title = patch.title.trim();
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.dueDate !== undefined) body.dueDate = patch.dueDate;
  if (patch.startDate !== undefined) body.startDate = patch.startDate;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.bucketId !== undefined) body.bucketId = patch.bucketId;
  if (patch.priority !== undefined) body.priority = patch.priority;
  if (patch.repeat !== undefined) body.repeat = patch.repeat;
  if (patch.showChecklist !== undefined) body.showChecklist = patch.showChecklist;
  if (patch.assigneeIds !== undefined) body.assigneeIds = patch.assigneeIds;
  if (patch.labelIds !== undefined) body.labels = patch.labelIds;
  if (patch.checklist !== undefined) body.checklist = patch.checklist;
  if (patch.attachments !== undefined) body.attachments = patch.attachments;
  return body;
}

function updateBoardTask(current: PlannerBoardResponse | null, taskId: string, patch: Partial<PlannerTask>) {
  if (!current?.buckets) return current;
  return {
    ...current,
    buckets: current.buckets.map((bucket) => ({
      ...bucket,
      tasks: bucket.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
    })),
  };
}

function moveBoardTask(current: PlannerBoardResponse | null, taskId: string, bucketId: string) {
  if (!current?.buckets) return current;
  const task = current.buckets.flatMap((bucket) => bucket.tasks).find((row) => row.id === taskId);
  if (!task) return current;
  const bucketName = current.buckets.find((bucket) => bucket.id === bucketId)?.name || task.bucketName;
  const moved = { ...task, bucketName };
  return {
    ...current,
    buckets: current.buckets.map((bucket) => ({
      ...bucket,
      tasks: bucket.id === bucketId
        ? [...bucket.tasks.filter((row) => row.id !== taskId), moved]
        : bucket.tasks.filter((row) => row.id !== taskId),
    })),
  };
}

function paintBoardTask(current: PlannerBoardResponse | null, taskId: string, next: TaskEditor, members: PersonOption[]) {
  if (!current?.buckets) return current;
  const task = current.buckets.flatMap((bucket) => bucket.tasks).find((row) => row.id === taskId);
  if (!task) return current;
  const person = members.find((member) => member.id === next.assigneeIds[0]);
  const status: PlannerTask['status'] = next.status === 'completed' || next.status === 'in_progress' ? next.status : 'not_started';
  const bucketName = current.buckets.find((bucket) => bucket.id === next.bucketId)?.name || task.bucketName;
  const updated: PlannerTask = {
    ...task,
    title: next.title.trim() || task.title,
    description: next.description || null,
    dueDate: next.dueDate ? `${next.dueDate}T12:00:00.000Z` : null,
    status,
    percentComplete: status === 'completed' ? 100 : status === 'in_progress' ? 50 : 0,
    priority: next.priority === 'urgent' ? 1 : next.priority === 'important' ? 3 : next.priority === 'low' ? 9 : 5,
    checklist: next.checklist,
    bucketName,
    assignedTo: person?.name || (next.assigneeIds.length ? task.assignedTo : null),
    extraAssignees: Math.max(0, next.assigneeIds.length - 1),
  };
  return {
    ...current,
    buckets: current.buckets.map((bucket) => ({
      ...bucket,
      tasks: bucket.id === next.bucketId
        ? [...bucket.tasks.filter((row) => row.id !== taskId), updated]
        : bucket.tasks.filter((row) => row.id !== taskId),
    })),
  };
}
