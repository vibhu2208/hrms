export type PlannerConnection =
  | 'ok'
  | 'needsConsent'
  | 'needsPlannerConsent'
  | 'expired'
  | 'forbidden'
  | 'error';

export type PlannerTask = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: 'not_started' | 'in_progress' | 'completed';
  percentComplete: number | null;
  priority: number | null;
  assignedTo: string | null;
  extraAssignees: number;
  source: 'planner';
  sourceId: string;
  planName: string | null;
  bucketName: string | null;
  externalUrl: string | null;
  checklist?: { id: string; title: string; completed: boolean }[];
};

export type PlannerListResponse = {
  status: PlannerConnection;
  message?: string;
  tasks?: PlannerTask[];
};

export type PlannerBoardBucket = {
  id: string;
  name: string;
  tasks: PlannerTask[];
};

export type PlannerBoardResponse = {
  status: PlannerConnection;
  message?: string;
  canWrite?: boolean;
  plans?: { id: string; title: string }[];
  planId?: string | null;
  buckets?: PlannerBoardBucket[];
};

export type WorkStatus = 'not_started' | 'in_progress' | 'completed' | 'overdue';

export type BoardTask = {
  key: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: WorkStatus;
  statusLabel: string;
  badge: 'green' | 'red' | 'amber' | 'gray';
  assignedTo: string | null;
  extraAssignees: number;
  source: 'gostaff' | 'planner';
  sourceId: string;
  context: string | null;
  bucketName: string | null;
  externalUrl: string | null;
  priorityLabel: string | null;
  assigneeId: string | null;
  assigneeUserId: string | null;
  percent: number;
  checklist: { id: string; title: string; completed: boolean }[];
  assignor: string | null;
};

export function fromPlanner(task: PlannerTask): BoardTask {
  const status = task.status;
  return {
    key: `planner:${task.id}`,
    title: task.title,
    description: task.description,
    dueDate: task.dueDate,
    status,
    statusLabel: status === 'completed' ? 'Completed' : status === 'in_progress' ? 'In Progress' : 'Not Started',
    badge: status === 'completed' ? 'green' : status === 'in_progress' ? 'green' : 'gray',
    assignedTo: task.assignedTo,
    extraAssignees: task.extraAssignees || 0,
    source: 'planner',
    sourceId: task.sourceId || task.id,
    context: task.planName,
    bucketName: task.bucketName,
    externalUrl: task.externalUrl,
    priorityLabel: priorityLabel(task.priority),
    assigneeId: null,
    assigneeUserId: null,
    percent: task.percentComplete ?? (status === 'completed' ? 100 : 0),
    checklist: task.checklist || [],
    assignor: null,
  };
}

export function fromGoStaff(task: any): BoardTask {
  const items = Array.isArray(task.checklistItems) ? task.checklistItems : [];
  const done = items.filter((item: any) => item.completed).length;
  const completed = String(task.status || '').startsWith('COMPLETED');
  let status: WorkStatus = 'not_started';
  let statusLabel = 'Pending';
  let badge: BoardTask['badge'] = 'amber';
  if (completed) {
    status = 'completed';
    statusLabel = 'Completed';
    badge = 'green';
  } else if (task.status === 'OVERDUE') {
    status = 'overdue';
    statusLabel = 'Overdue';
    badge = 'red';
  } else if (items.length && done > 0 && done < items.length) {
    status = 'in_progress';
    statusLabel = 'In Progress';
    badge = 'green';
  }
  const person = task.assignee || {};
  const assignor = task.assignor || {};
  const name = `${person.firstName || ''} ${person.lastName || ''}`.trim();
  const from = `${assignor.firstName || ''} ${assignor.lastName || ''}`.trim();
  return {
    key: `gostaff:${task.id}`,
    title: task.title || 'Untitled task',
    description: task.description || null,
    dueDate: task.dueDate || null,
    status,
    statusLabel,
    badge,
    assignedTo: name || null,
    extraAssignees: 0,
    source: 'gostaff',
    sourceId: task.id,
    context: person.department?.name || null,
    bucketName: null,
    externalUrl: null,
    priorityLabel: null,
    assigneeId: task.assigneeId || person.id || null,
    assigneeUserId: person.userId || null,
    percent: items.length ? Math.round((done / items.length) * 100) : completed ? 100 : status === 'overdue' ? 20 : 40,
    checklist: items.map((item: any) => ({ id: item.id, title: item.title, completed: Boolean(item.completed) })),
    assignor: from || null,
  };
}

export function priorityLabel(priority?: number | null) {
  if (priority == null || Number.isNaN(priority)) return null;
  if (priority <= 1) return 'Urgent';
  if (priority <= 4) return 'Important';
  if (priority <= 7) return 'Medium';
  return 'Low';
}

export function assigneeLabel(task: BoardTask) {
  const extra = task.extraAssignees > 0 ? ` · +${task.extraAssignees}` : '';
  if (task.assignedTo) return `${task.assignedTo}${extra}`;
  if (task.extraAssignees > 0) return `${task.extraAssignees} assigned`;
  return 'Unassigned';
}

export function sourceLine(task: BoardTask) {
  if (task.source === 'planner') {
    return task.context ? `Microsoft Planner · ${task.context}` : 'Microsoft Planner';
  }
  return task.context ? `GoStaff · ${task.context}` : 'GoStaff';
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function dueLabel(value?: string | null) {
  if (!value) return 'No due date';
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return 'No due date';
  const day = startOfDay(due);
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (day === today) return 'Due today';
  if (day === tomorrow.getTime()) return 'Due tomorrow';
  return `Due ${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export type DueGroup = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none';

export function dueGroup(task: BoardTask): DueGroup {
  if (!task.dueDate) return 'none';
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return 'none';
  const day = startOfDay(due);
  const today = startOfDay(new Date());
  if (task.status !== 'completed' && day < today) return 'overdue';
  if (day < today) return 'later';
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (day === today) return 'today';
  if (day === tomorrow.getTime()) return 'tomorrow';
  if (day <= endOfWeek(today)) return 'week';
  return 'later';
}

function endOfWeek(today: number) {
  const date = new Date(today);
  const daysUntilSunday = (7 - date.getDay()) % 7;
  date.setDate(date.getDate() + daysUntilSunday);
  return date.getTime();
}

export function matchesDue(task: BoardTask, filter: string) {
  if (filter === 'all') return true;
  const group = dueGroup(task);
  if (filter === 'today') return group === 'today';
  if (filter === 'tomorrow') return group === 'tomorrow';
  if (filter === 'week') return group === 'today' || group === 'tomorrow' || group === 'week';
  if (filter === 'overdue') return group === 'overdue';
  return true;
}

export function matchesStatus(task: BoardTask, filter: string) {
  if (filter === 'all') return true;
  if (filter === 'not_started') return task.status === 'not_started';
  if (filter === 'in_progress') return task.status === 'in_progress';
  if (filter === 'completed') return task.status === 'completed';
  return true;
}

export function matchesSearch(task: BoardTask, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [task.title, task.description, task.context, task.bucketName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

export function upcomingTasks(gostaff: BoardTask[], planner: BoardTask[]) {
  return [...gostaff, ...planner]
    .filter((task) => task.status !== 'completed')
    .sort((a, b) => {
      const left = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const right = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
      return left - right;
    });
}
