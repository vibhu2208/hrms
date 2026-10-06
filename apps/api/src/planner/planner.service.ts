import { randomBytes } from 'crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MicrosoftGraphService } from '../microsoft/microsoft-graph.service';

export type PlannerTaskStatus = 'not_started' | 'in_progress' | 'completed';

export type PlannerTaskView = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: PlannerTaskStatus;
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
  startDate?: string | null;
  bucketId?: string | null;
  planId?: string | null;
  createdAt?: string | null;
  createdByMe?: boolean;
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  showChecklist?: boolean;
  assignees?: { id: string; name: string }[];
  members?: { id: string; name: string }[];
  labels?: { id: string; name: string; color: string; selected: boolean }[];
  attachments?: { url: string; alias: string }[];
};

export type PlannerStatus =
  | 'ok'
  | 'needsConsent'
  | 'needsPlannerConsent'
  | 'expired'
  | 'forbidden'
  | 'error';

type PlannerFailure = {
  status: Exclude<PlannerStatus, 'ok'>;
  message: string;
};

type GraphPlan = { id?: string; title?: string };

type GraphBucket = { id?: string; name?: string; orderHint?: string };

type GraphPlannerTask = {
  id?: string;
  title?: string;
  planId?: string;
  bucketId?: string;
  percentComplete?: number;
  priority?: number;
  dueDateTime?: string | null;
  startDateTime?: string | null;
  createdDateTime?: string | null;
  createdBy?: { user?: { id?: string; displayName?: string } };
  hasDescription?: boolean;
  previewType?: string;
  appliedCategories?: Record<string, boolean>;
  assignments?: Record<string, unknown>;
  webUrl?: string;
  orderHint?: string;
  checklistItemCount?: number;
  recurrence?: { schedule?: { pattern?: { type?: string } } | null } | null;
};

type GraphTaskDetails = {
  description?: string;
  previewType?: string;
  checklist?: Record<string, { title?: string; isChecked?: boolean; orderHint?: string }>;
  references?: Record<string, { alias?: string; previewPriority?: string } | null>;
};

const LABEL_META: Record<string, { name: string; color: string }> = {
  category1: { name: 'Pink', color: '#c43e7a' },
  category2: { name: 'Red', color: '#d13438' },
  category3: { name: 'Yellow', color: '#c19c00' },
  category4: { name: 'Green', color: '#0f6e56' },
  category5: { name: 'Blue', color: '#2b6cb0' },
  category6: { name: 'Purple', color: '#6b46c1' },
};

const PRIORITY_VALUE = { urgent: 1, important: 3, medium: 5, low: 9 } as const;

type GraphList<T> = { value?: T[]; '@odata.nextLink'?: string };

const CACHE_MS = 60_000;
const TASK_ID = /^[A-Za-z0-9\-_=!.+]{8,800}$/;

type GraphTodoTask = {
  id?: string;
  title?: string;
  status?: string;
  importance?: string;
  body?: { content?: string };
  dueDateTime?: { dateTime?: string; timeZone?: string };
};

@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);
  private readonly cache = new Map<string, { at: number; tasks: PlannerTaskView[] }>();
  private readonly planCache = new Map<string, { at: number; plans: { id: string; title: string }[] }>();
  private readonly planFlights = new Map<string, Promise<{ ok: true; plans: { id: string; title: string }[] } | { ok: false; status: PlannerFailure['status'] }>>();
  private readonly boardFlights = new Map<string, Promise<Awaited<ReturnType<PlannerService['fetchBoard']>>>>();
  private readonly bucketNames = new Map<string, Map<string, string>>();

  constructor(private graph: MicrosoftGraphService) {}

  async tasks(userId: string, refresh = false): Promise<{ status: 'ok'; tasks: PlannerTaskView[] } | PlannerFailure> {
    const consent = await this.graph.plannerConsent(userId);
    if (!consent.ok) return { status: consent.status, message: consent.message };

    const cached = this.cache.get(userId);
    if (!refresh && cached && Date.now() - cached.at < CACHE_MS) {
      return { status: 'ok', tasks: cached.tasks };
    }

    const loaded = await this.loadTasks(userId);
    if (loaded.status !== 'ok') return loaded;
    this.cache.set(userId, { at: Date.now(), tasks: loaded.tasks });
    return loaded;
  }

  async task(userId: string, taskId: string): Promise<{ status: 'ok'; task: PlannerTaskView } | PlannerFailure> {
    if (!TASK_ID.test(taskId)) throw new BadRequestException('Invalid Planner task id.');
    const consent = await this.graph.plannerConsent(userId);
    if (!consent.ok) return { status: consent.status, message: consent.message };

    const [me, row] = await Promise.all([
      this.graph.graphRequest<{ id?: string; displayName?: string }>(userId, '/me?$select=id,displayName'),
      this.graph.graphRequest<GraphPlannerTask>(userId, `/planner/tasks/${pathId(taskId)}`),
    ]);
    if (!me.ok) return this.failure(me.status);
    const meId = (me.data.id || '').trim();
    if (!meId) return { status: 'error', message: "Couldn't load Microsoft Planner tasks" };

    if (!row.ok) {
      if (row.httpStatus === 404) {
        const todoTask = await this.findTodoTask(userId, taskId, me.data.displayName || null);
        if (todoTask) return { status: 'ok', task: todoTask };
        throw new NotFoundException('Planner task not found.');
      }
      return this.failure(row.status);
    }
    if (!assignedTo(row.data, meId)) {
      const plans = await this.userPlans(userId);
      const member = plans.ok && plans.plans.some((plan) => plan.id === row.data.planId);
      if (!member) throw new NotFoundException('Planner task not found.');
    }

    const planId = row.data.planId || '';
    const knownPlans = await this.userPlans(userId);
    const planName = knownPlans.ok ? knownPlans.plans.find((plan) => plan.id === planId)?.title || null : null;
    const [bucketName, details, beta, planDetails, members] = await Promise.all([
      Promise.resolve(this.bucketNames.get(userId)?.get(row.data.bucketId || '') || null).then((name) => name || this.lookupName(userId, row.data.bucketId, 'bucket')),
      this.graph.graphRequest<GraphTaskDetails>(userId, `/planner/tasks/${pathId(taskId)}/details`),
      this.graph.graphRequest<GraphPlannerTask>(userId, `https://graph.microsoft.com/beta/planner/tasks/${pathId(taskId)}`),
      planId
        ? this.graph.graphRequest<{ categoryDescriptions?: Record<string, string> }>(userId, `/planner/plans/${pathId(planId)}/details`)
        : Promise.resolve(null),
      planId ? this.planPeople(userId, planId, meId, me.data.displayName || null) : Promise.resolve([]),
    ]);
    const detail = details.ok ? details.data : {};
    const checklist = checklistEntries(detail.checklist);
    const names = await this.userNames(userId, [
      ...Object.keys(row.data.assignments || {}),
      ...members.map((person) => person.id),
    ]);
    const people = new Map(members.map((person) => [person.id, person.name]));
    for (const [id, name] of names) people.set(id, name);
    if (meId && !people.has(meId)) people.set(meId, me.data.displayName || 'You');
    const assignees = Object.keys(row.data.assignments || {}).map((id) => ({
      id,
      name: people.get(id) || 'Assigned',
    }));
    const descriptions = planDetails && 'ok' in planDetails && planDetails.ok ? planDetails.data.categoryDescriptions || {} : {};
    const applied = row.data.appliedCategories || {};
    return {
      status: 'ok',
      task: {
        ...normalizeTask(row.data, {
          displayName: me.data.displayName || null,
          meId,
          planName,
          bucketName,
          description: plainText(detail.description),
        }),
        checklist,
        startDate: dateOnly(row.data.startDateTime),
        bucketId: row.data.bucketId || null,
        planId: planId || null,
        createdAt: isoOrNull(row.data.createdDateTime),
        createdByMe: Boolean(row.data.createdBy?.user?.id && row.data.createdBy.user.id.toLowerCase() === meId.toLowerCase()),
        repeat: repeatFrom(beta.ok ? beta.data : row.data),
        showChecklist: (row.data.previewType || detail.previewType) === 'checklist',
        assignees,
        members: [...people].map(([id, name]) => ({ id, name })),
        labels: Object.entries(LABEL_META).map(([id, meta]) => ({
          id,
          name: (descriptions[id] || meta.name).trim() || meta.name,
          color: meta.color,
          selected: Boolean(applied[id]),
        })),
        attachments: attachmentEntries(detail.references),
      },
    };
  }

  async plans(userId: string): Promise<{ status: 'ok'; plans: { id: string; title: string }[] } | PlannerFailure> {
    const consent = await this.graph.plannerConsent(userId);
    if (!consent.ok) return { status: consent.status, message: consent.message };

    const listed = await this.userPlans(userId);
    if (!listed.ok) return this.failure(listed.status);
    return { status: 'ok', plans: listed.plans };
  }

  private async loadTasks(userId: string): Promise<{ status: 'ok'; tasks: PlannerTaskView[] } | PlannerFailure> {
    const me = await this.graph.graphRequest<{ id?: string; displayName?: string; mail?: string; userPrincipalName?: string }>(
      userId,
      '/me?$select=id,displayName,mail,userPrincipalName',
    );
    if (!me.ok) return this.failure(me.status);
    const meId = (me.data.id || '').trim();
    if (!meId) return { status: 'error', message: "Couldn't load Microsoft Planner tasks" };

    const plans = await this.userPlans(userId);
    if (!plans.ok) return this.failure(plans.status);

    const assigned = await this.collect<GraphPlannerTask>(userId, '/me/planner/tasks');
    if (!assigned.ok) return this.failure(assigned.status);

    const byId = new Map<string, GraphPlannerTask>();
    for (const row of assigned.value) {
      if (row.id) byId.set(row.id, row);
    }

    const planNames = new Map(plans.plans.map((plan) => [plan.id, plan.title]));
    const bucketNames = new Map<string, string>();
    await Promise.all(
      plans.plans.slice(0, 20).map(async (plan) => {
        const [taskList, bucketList] = await Promise.all([
          this.collect<GraphPlannerTask>(userId, `/planner/plans/${pathId(plan.id)}/tasks`),
          this.collect<GraphBucket>(userId, `/planner/plans/${pathId(plan.id)}/buckets`),
        ]);
        if (taskList.ok) {
          for (const row of taskList.value) {
            if (row.id) byId.set(row.id, { ...row, planId: row.planId || plan.id });
          }
        }
        if (bucketList.ok) {
          for (const bucket of bucketList.value) {
            const name = (bucket.name || '').trim();
            if (bucket.id && name) bucketNames.set(bucket.id, name);
          }
        }
      }),
    );

    const rows = [...byId.values()].slice(0, 200);
    const todoTasks = await this.loadTodoTasks(userId, me.data.displayName || null);
    const missingPlans = unique(rows.map((row) => row.planId).filter((id) => id && !planNames.has(id)));
    const missingBuckets = unique(rows.map((row) => row.bucketId).filter((id) => id && !bucketNames.has(id)));
    const [extraPlans, extraBuckets] = await Promise.all([
      this.lookupNames(userId, missingPlans, 'plan'),
      this.lookupNames(userId, missingBuckets, 'bucket'),
    ]);
    for (const [id, name] of extraPlans) planNames.set(id, name);
    for (const [id, name] of extraBuckets) bucketNames.set(id, name);
    const descriptions = await this.descriptions(userId, rows);

    const tasks = rows.map((row) =>
      normalizeTask(row, {
        displayName: me.data.displayName || null,
        meId,
        planName: row.planId ? planNames.get(row.planId) || null : null,
        bucketName: row.bucketId ? bucketNames.get(row.bucketId) || null : null,
        description: row.id ? descriptions.get(row.id) || null : null,
      }),
    );
    const identity = me.data.mail || me.data.userPrincipalName || me.data.displayName || 'unknown';
    this.logger.log(
      `Planner ${identity} plans=${plans.plans.map((plan) => plan.title).join(', ') || 'none'} tasks=${tasks.length}`,
    );
    return { status: 'ok', tasks: [...tasks, ...todoTasks] };
  }

  private userPlans(userId: string): Promise<{ ok: true; plans: { id: string; title: string }[] } | { ok: false; status: PlannerFailure['status'] }> {
    const hit = this.planCache.get(userId);
    if (hit && Date.now() - hit.at < CACHE_MS) return Promise.resolve({ ok: true, plans: hit.plans });
    const flight = this.planFlights.get(userId);
    if (flight) return flight;
    const pending = this.loadUserPlans(userId).then((result) => {
      if (result.ok) this.planCache.set(userId, { at: Date.now(), plans: result.plans });
      return result;
    }).finally(() => this.planFlights.delete(userId));
    this.planFlights.set(userId, pending);
    return pending;
  }

  private async loadUserPlans(userId: string): Promise<{ ok: true; plans: { id: string; title: string }[] } | { ok: false; status: PlannerFailure['status'] }> {
    const listed = await this.collect<GraphPlan>(userId, '/me/planner/plans');
    if (!listed.ok) return listed;
    const extra = await Promise.all([
      this.collect<GraphPlan>(userId, 'https://graph.microsoft.com/beta/me/planner/plans'),
      this.collect<GraphPlan>(userId, 'https://graph.microsoft.com/beta/me/planner/rosterPlans'),
    ]);
    const seen = new Set<string>();
    const plans = [listed.value, ...extra.filter((result) => result.ok).map((result) => result.value)]
      .flat()
      .map((plan) => ({ id: plan.id || '', title: (plan.title || '').trim() }))
      .filter((plan) => {
        if (!plan.id || !plan.title || seen.has(plan.id)) return false;
        seen.add(plan.id);
        return true;
      });
    return { ok: true, plans };
  }

  private async loadTodoTasks(userId: string, displayName: string | null) {
    const lists = await this.graph.graphRequest<{
      value?: Array<{ id?: string; displayName?: string; wellknownListName?: string }>;
    }>(userId, '/me/todo/lists');
    if (!lists.ok) return [];
    const usable = (lists.data.value || []).filter(
      (list) => list.id && list.wellknownListName !== 'flaggedEmails' && list.displayName !== 'Flagged Emails',
    );
    const groups = await Promise.all(
      usable.map(async (list) => {
        const listed = await this.collect<GraphTodoTask>(
          userId,
          `/me/todo/lists/${pathId(list.id as string)}/tasks`,
        );
        if (!listed.ok) return [];
        return listed.value.map((task) => normalizeTodoTask(task, list.displayName || null, displayName));
      }),
    );
    return groups.flat().filter((task) => task.id);
  }

  private async findTodoTask(userId: string, taskId: string, displayName: string | null) {
    const tasks = await this.loadTodoTasks(userId, displayName);
    return tasks.find((task) => task.id === taskId) || null;
  }

  private async collect<T>(userId: string, path: string): Promise<{ ok: true; value: T[] } | { ok: false; status: PlannerFailure['status'] }> {
    const value: T[] = [];
    let next: string | null = path;
    let pages = 0;
    while (next && pages < 8 && value.length < 200) {
      const res = await this.graph.graphRequest<GraphList<T>>(userId, next);
      if (!res.ok) return { ok: false, status: res.status };
      value.push(...(res.data.value || []));
      const link = res.data['@odata.nextLink'];
      next = link && link.startsWith('https://graph.microsoft.com/') ? link : null;
      pages += 1;
    }
    return { ok: true, value };
  }

  private async lookupNames(userId: string, ids: string[], kind: 'plan' | 'bucket') {
    const names = new Map<string, string>();
    for (let index = 0; index < ids.length; index += 8) {
      const chunk = ids.slice(index, index + 8);
      const found = await Promise.all(chunk.map(async (id) => [id, await this.lookupName(userId, id, kind)] as const));
      for (const [id, name] of found) {
        if (name) names.set(id, name);
      }
    }
    return names;
  }

  private async lookupName(userId: string, id: string | undefined, kind: 'plan' | 'bucket') {
    if (!id || !TASK_ID.test(id)) return null;
    const path = kind === 'plan' ? `/planner/plans/${pathId(id)}` : `/planner/buckets/${pathId(id)}`;
    const res = await this.graph.graphRequest<{ title?: string; name?: string }>(userId, path);
    if (!res.ok) return null;
    const name = (kind === 'plan' ? res.data.title : res.data.name) || '';
    return name.trim() || null;
  }

  private async descriptions(userId: string, rows: GraphPlannerTask[]) {
    const found = new Map<string, string>();
    const ids = rows.filter((row) => row.hasDescription && row.id).map((row) => row.id as string).slice(0, 80);
    for (let index = 0; index < ids.length; index += 20) {
      const chunk = ids.slice(index, index + 20);
      const res = await this.graph.graphRequest<{
        responses?: Array<{ id?: string; status?: number; body?: { description?: string } }>;
      }>(userId, '/$batch', {
        method: 'POST',
        body: {
          requests: chunk.map((id, offset) => ({
            id: String(offset),
            method: 'GET',
            url: `/planner/tasks/${encodeURIComponent(id)}/details`,
          })),
        },
      });
      if (!res.ok) continue;
      for (const item of res.data.responses || []) {
        const source = chunk[Number(item.id)];
        if (!source || item.status !== 200) continue;
        const text = plainText(item.body?.description);
        if (text) found.set(source, text);
      }
    }
    return found;
  }

  private async checklists(userId: string, ids: string[]) {
    const found = new Map<string, { id: string; title: string; completed: boolean }[]>();
    for (let index = 0; index < ids.length; index += 20) {
      const chunk = ids.slice(index, index + 20);
      const res = await this.graph.graphRequest<{
        responses?: Array<{ id?: string; status?: number; body?: { checklist?: Record<string, { title?: string; isChecked?: boolean; orderHint?: string }> } }>;
      }>(userId, '/$batch', {
        method: 'POST',
        body: {
          requests: chunk.map((id, offset) => ({
            id: String(offset),
            method: 'GET',
            url: `/planner/tasks/${encodeURIComponent(id)}/details`,
          })),
        },
      });
      if (!res.ok) continue;
      for (const item of res.data.responses || []) {
        const source = chunk[Number(item.id)];
        if (!source || item.status !== 200) continue;
        const checklist = Object.entries(item.body?.checklist || {})
          .map(([id, entry]) => ({
            id,
            title: (entry.title || '').trim(),
            completed: Boolean(entry.isChecked),
            order: entry.orderHint || '',
          }))
          .filter((entry) => entry.title)
          .sort((left, right) => left.order.localeCompare(right.order))
          .map(({ id, title, completed }) => ({ id, title, completed }));
        if (checklist.length) found.set(source, checklist);
      }
    }
    return found;
  }

  private async taskDescription(userId: string, taskId: string) {
    const res = await this.graph.graphRequest<{ description?: string }>(
      userId,
      `/planner/tasks/${encodeURIComponent(taskId)}/details`,
    );
    if (!res.ok) return null;
    return plainText(res.data.description);
  }

  board(userId: string, planId?: string) {
    const key = `${userId}:${planId || ''}`;
    const flight = this.boardFlights.get(key);
    if (flight) return flight;
    const pending = this.fetchBoard(userId, planId).finally(() => this.boardFlights.delete(key));
    this.boardFlights.set(key, pending);
    return pending;
  }

  private async fetchBoard(userId: string, planId?: string) {
    const access = await this.graph.plannerConsent(userId);
    if (!access.ok) return { status: access.status, message: access.message };
    const plans = await this.userPlans(userId);
    if (!plans.ok) return this.failure(plans.status);
    const selected = plans.plans.find((plan) => plan.id === planId) || plans.plans[0] || null;
    if (!selected) {
      return { status: 'ok' as const, canWrite: access.canWrite, plans: [], planId: null, buckets: [] };
    }

    const [taskList, bucketList, me] = await Promise.all([
      this.collect<GraphPlannerTask>(userId, `/planner/plans/${pathId(selected.id)}/tasks`),
      this.collect<GraphBucket>(userId, `/planner/plans/${pathId(selected.id)}/buckets`),
      this.graph.graphRequest<{ id?: string; displayName?: string }>(userId, '/me?$select=id,displayName'),
    ]);
    if (!taskList.ok) return this.failure(taskList.status);
    if (!bucketList.ok) return this.failure(bucketList.status);
    if (!me.ok) return this.failure(me.status);

    const columns = [...bucketList.value]
      .filter((bucket) => bucket.id)
      .sort((left, right) => (left.orderHint || '').localeCompare(right.orderHint || ''));
    const names = new Map(columns.map((bucket) => [bucket.id as string, (bucket.name || 'Untitled').trim() || 'Untitled']));
    const knownBuckets = this.bucketNames.get(userId) || new Map<string, string>();
    for (const [id, name] of names) knownBuckets.set(id, name);
    this.bucketNames.set(userId, knownBuckets);
    const tasksByBucket = new Map<string, PlannerTaskView[]>();
    for (const row of taskList.value) {
      if (!row.id || !row.bucketId || !names.has(row.bucketId)) continue;
      const list = tasksByBucket.get(row.bucketId) || [];
      list.push(normalizeTask(row, {
        displayName: me.data.displayName || null,
        meId: me.data.id || '',
        planName: selected.title,
        bucketName: names.get(row.bucketId) || null,
        description: null,
      }));
      tasksByBucket.set(row.bucketId, list);
    }
    for (const list of tasksByBucket.values()) list.sort((left, right) => left.title.localeCompare(right.title));
    const detailIds = [...tasksByBucket.values()]
      .flat()
      .map((task) => task.id)
      .filter((id) => {
        const source = taskList.value.find((row) => row.id === id);
        return !source || source.checklistItemCount == null || source.checklistItemCount > 0;
      })
      .slice(0, 80);
    const lists = await this.checklists(userId, detailIds);
    for (const list of tasksByBucket.values()) {
      for (const task of list) task.checklist = lists.get(task.id) || [];
    }

    return {
      status: 'ok' as const,
      canWrite: access.canWrite,
      plans: plans.plans,
      planId: selected.id,
      buckets: columns.map((bucket) => ({
        id: bucket.id as string,
        name: names.get(bucket.id as string) || 'Untitled',
        tasks: tasksByBucket.get(bucket.id as string) || [],
      })),
    };
  }

  async createPlan(userId: string, title: string) {
    const access = await this.requireWrite(userId);
    if (!access.ok) return access;
    const name = title.trim();
    if (!name) throw new BadRequestException('Plan name is required.');
    const roster = await this.graph.graphRequest<{ id?: string }>(userId, 'https://graph.microsoft.com/beta/planner/rosters', {
      method: 'POST',
      body: { '@odata.type': '#microsoft.graph.plannerRoster' },
    });
    if (!roster.ok || !roster.data.id) return { status: 'error' as const, message: "Couldn't create that plan." };
    const plan = await this.graph.graphRequest<{ id?: string; title?: string }>(userId, 'https://graph.microsoft.com/beta/planner/plans', {
      method: 'POST',
      body: {
        title: name,
        container: {
          url: `https://graph.microsoft.com/beta/planner/rosters/${roster.data.id}`,
          containerId: roster.data.id,
          type: 'roster',
        },
      },
    });
    if (!plan.ok || !plan.data.id) return { status: 'error' as const, message: "Couldn't create that plan." };
    await this.graph.graphRequest(userId, '/planner/buckets', {
      method: 'POST',
      body: { name: 'To do', planId: plan.data.id, orderHint: ' !' },
    });
    this.cache.delete(userId);
    this.planCache.delete(userId);
    return { status: 'ok' as const, plan: { id: plan.data.id, title: (plan.data.title || name).trim() } };
  }

  async createBucket(userId: string, planId: string, name: string) {
    const access = await this.requireWrite(userId);
    if (!access.ok) return access;
    this.assertId(planId);
    const label = name.trim();
    if (!label) throw new BadRequestException('Bucket name is required.');
    await this.assertPlanMember(userId, planId);
    const created = await this.graph.graphRequest<{ id?: string; name?: string }>(userId, '/planner/buckets', {
      method: 'POST',
      body: { name: label, planId, orderHint: ' !' },
    });
    if (!created.ok || !created.data.id) return { status: 'error' as const, message: "Couldn't add that bucket." };
    this.cache.delete(userId);
    return { status: 'ok' as const, bucket: { id: created.data.id, name: (created.data.name || label).trim() } };
  }

  async renameBucket(userId: string, bucketId: string, name: string) {
    const access = await this.requireWrite(userId);
    if (!access.ok) return access;
    this.assertId(bucketId);
    const label = name.trim();
    if (!label) throw new BadRequestException('Bucket name is required.');
    const current = await this.graph.graphRequest<{ planId?: string }>(userId, `/planner/buckets/${pathId(bucketId)}`);
    if (!current.ok) {
      if (current.httpStatus === 404) throw new NotFoundException('Bucket not found.');
      return this.failure(current.status);
    }
    if (!current.etag || !current.data.planId) return { status: 'error' as const, message: "Couldn't rename that bucket." };
    await this.assertPlanMember(userId, current.data.planId);
    const saved = await this.graph.graphRequest(userId, `/planner/buckets/${pathId(bucketId)}`, {
      method: 'PATCH',
      headers: { 'If-Match': current.etag, Prefer: 'return=representation' },
      body: { name: label },
    });
    if (!saved.ok) return { status: 'error' as const, message: "Couldn't rename that bucket." };
    this.cache.delete(userId);
    this.bucketNames.get(userId)?.set(bucketId, label);
    return { status: 'ok' as const };
  }

  async createTask(userId: string, input: { planId: string; bucketId: string; title: string; assignToMe?: boolean }) {
    const access = await this.requireWrite(userId);
    if (!access.ok) return access;
    this.assertId(input.planId);
    this.assertId(input.bucketId);
    const title = input.title.trim();
    if (!title) throw new BadRequestException('Task title is required.');
    await this.assertPlanMember(userId, input.planId);
    const body: Record<string, unknown> = { planId: input.planId, bucketId: input.bucketId, title };
    if (input.assignToMe) {
      const me = await this.graph.graphRequest<{ id?: string }>(userId, '/me?$select=id');
      if (me.ok && me.data.id) {
        body.assignments = {
          [me.data.id]: { '@odata.type': '#microsoft.graph.plannerAssignment', orderHint: ' !' },
        };
      }
    }
    const created = await this.graph.graphRequest<{ id?: string }>(userId, '/planner/tasks', { method: 'POST', body });
    if (!created.ok || !created.data.id) return { status: 'error' as const, message: "Couldn't add that task." };
    this.cache.delete(userId);
    return { status: 'ok' as const, id: created.data.id };
  }

  async updateTask(userId: string, taskId: string, input: {
    title?: string;
    bucketId?: string;
    status?: PlannerTaskStatus;
    priority?: keyof typeof PRIORITY_VALUE;
    repeat?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
    startDate?: string | null;
    dueDate?: string | null;
    description?: string;
    showChecklist?: boolean;
    assigneeIds?: string[];
    labels?: string[];
    checklist?: { id?: string; title: string; completed: boolean }[];
    attachments?: { url: string; alias?: string }[];
  }) {
    const access = await this.requireWrite(userId);
    if (!access.ok) return access;
    this.assertId(taskId);
    if (input.bucketId) this.assertId(input.bucketId);
    const current = await this.ownedTask(userId, taskId);
    if (!current.ok) return current;
    const body: Record<string, unknown> = {};
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new BadRequestException('Task title is required.');
      body.title = title;
    }
    if (input.bucketId) body.bucketId = input.bucketId;
    if (input.status) body.percentComplete = input.status === 'completed' ? 100 : input.status === 'in_progress' ? 50 : 0;
    if (input.priority) body.priority = PRIORITY_VALUE[input.priority];
    if (input.startDate !== undefined) body.startDateTime = dueDateTime(input.startDate);
    if (input.dueDate !== undefined) body.dueDateTime = dueDateTime(input.dueDate);
    if (input.labels) {
      const applied: Record<string, boolean> = {};
      for (const key of Object.keys(LABEL_META)) applied[key] = input.labels.includes(key);
      body.appliedCategories = applied;
    }
    if (input.assigneeIds) {
      const next = new Set(input.assigneeIds.filter((id) => /^[0-9a-fA-F-]{8,80}$/.test(id)));
      const assignments: Record<string, unknown> = {};
      for (const id of next) {
        if (!current.assignments[id]) {
          assignments[id] = { '@odata.type': '#microsoft.graph.plannerAssignment', orderHint: ' !' };
        }
      }
      for (const id of Object.keys(current.assignments)) {
        if (!next.has(id)) assignments[id] = null;
      }
      if (Object.keys(assignments).length) body.assignments = assignments;
    }
    if (Object.keys(body).length) {
      const saved = await this.patchTask(userId, taskId, body);
      if (!saved.ok) return { status: 'error' as const, message: "Couldn't save that task." };
    }
    if (input.description !== undefined || input.checklist || input.attachments || input.showChecklist !== undefined) {
      const described = await this.patchDetails(userId, taskId, {
        description: input.description,
        checklist: input.checklist?.slice(0, 40),
        attachments: input.attachments?.slice(0, 10),
        previewType: input.showChecklist === undefined ? undefined : input.showChecklist ? 'checklist' : 'automatic',
      });
      if (!described.ok) return { status: 'error' as const, message: "Couldn't save the task details." };
    }
    if (input.repeat) {
      const anchor = input.dueDate || input.startDate || null;
      const repeated = await this.patchRepeat(userId, taskId, input.repeat, anchor);
      if (!repeated.ok) return { status: 'error' as const, message: "Couldn't save the repeat schedule." };
    }
    this.cache.delete(userId);
    return { status: 'ok' as const };
  }

  async deleteTask(userId: string, taskId: string) {
    const access = await this.requireWrite(userId);
    if (!access.ok) return access;
    this.assertId(taskId);
    const current = await this.ownedTask(userId, taskId);
    if (!current.ok) return current;
    const removed = await this.graph.graphRequest(userId, `/planner/tasks/${pathId(taskId)}`, {
      method: 'DELETE',
      headers: { 'If-Match': current.etag },
    });
    if (!removed.ok && removed.httpStatus === 412) {
      const again = await this.ownedTask(userId, taskId);
      if (!again.ok) return again;
      const retry = await this.graph.graphRequest(userId, `/planner/tasks/${pathId(taskId)}`, {
        method: 'DELETE',
        headers: { 'If-Match': again.etag },
      });
      if (!retry.ok) return { status: 'error' as const, message: "Couldn't delete that task." };
    } else if (!removed.ok) {
      return { status: 'error' as const, message: "Couldn't delete that task." };
    }
    this.cache.delete(userId);
    return { status: 'ok' as const };
  }

  private async requireWrite(userId: string): Promise<{ ok: true } | (PlannerFailure & { ok: false })> {
    const access = await this.graph.plannerConsent(userId);
    if (!access.ok) return { ok: false, status: access.status, message: access.message };
    if (!access.canWrite) {
      return { ok: false, status: 'needsPlannerConsent', message: 'Reconnect Microsoft to create and edit Planner tasks.' };
    }
    return { ok: true };
  }

  private assertId(id: string) {
    if (!TASK_ID.test(id)) throw new BadRequestException('Invalid Planner id.');
  }

  private async assertPlanMember(userId: string, planId: string) {
    const plans = await this.userPlans(userId);
    if (!plans.ok) throw new NotFoundException('Planner plan not found.');
    if (!plans.plans.some((plan) => plan.id === planId)) throw new NotFoundException('Planner plan not found.');
  }

  private async ownedTask(userId: string, taskId: string): Promise<{ ok: true; etag: string; planId: string; assignments: Record<string, unknown> } | (PlannerFailure & { ok: false })> {
    const row = await this.graph.graphRequest<GraphPlannerTask>(userId, `/planner/tasks/${pathId(taskId)}`);
    if (!row.ok) {
      if (row.httpStatus === 404) throw new NotFoundException('Planner task not found.');
      return { ok: false, ...this.failure(row.status) };
    }
    const planId = row.data.planId || '';
    if (!planId) throw new NotFoundException('Planner task not found.');
    await this.assertPlanMember(userId, planId);
    const etag = row.etag || '';
    if (!etag) return { ok: false, status: 'error', message: "Couldn't save that task." };
    return { ok: true, etag, planId, assignments: row.data.assignments || {} };
  }

  private async patchTask(userId: string, taskId: string, body: Record<string, unknown>) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = await this.ownedTask(userId, taskId);
      if (!current.ok) return current;
      const saved = await this.graph.graphRequest(userId, `/planner/tasks/${pathId(taskId)}`, {
        method: 'PATCH',
        headers: { 'If-Match': current.etag, Prefer: 'return=representation' },
        body,
      });
      if (saved.ok || saved.httpStatus !== 412) return saved;
    }
    return { ok: false as const, status: 'error' as const, message: "Couldn't save that task." };
  }

  private async patchDetails(userId: string, taskId: string, patch: {
    description?: string;
    checklist?: { id?: string; title: string; completed: boolean }[];
    attachments?: { url: string; alias?: string }[];
    previewType?: string;
  }) {
    const path = `/planner/tasks/${pathId(taskId)}/details`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const details = await this.graph.graphRequest<GraphTaskDetails>(userId, path);
      if (!details.ok || !details.etag) return { ok: false as const };
      const body: Record<string, unknown> = {};
      if (patch.description !== undefined) body.description = patch.description;
      if (patch.previewType) body.previewType = patch.previewType;
      if (patch.checklist) body.checklist = checklistPatch(details.data.checklist, patch.checklist);
      if (patch.attachments) body.references = referencesPatch(details.data.references, patch.attachments);
      if (!Object.keys(body).length) return { ok: true as const };
      const saved = await this.graph.graphRequest(userId, path, {
        method: 'PATCH',
        headers: { 'If-Match': details.etag, Prefer: 'return=representation' },
        body,
      });
      if (saved.ok || saved.httpStatus !== 412) return saved.ok ? { ok: true as const } : { ok: false as const };
    }
    return { ok: false as const };
  }

  private async patchRepeat(userId: string, taskId: string, repeat: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly', anchor: string | null) {
    const path = `https://graph.microsoft.com/beta/planner/tasks/${pathId(taskId)}`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = await this.graph.graphRequest<GraphPlannerTask>(userId, path);
      if (!current.ok || !current.etag) return repeat === 'none' ? { ok: true as const } : { ok: false as const };
      if (repeat === 'none' && !current.data.recurrence?.schedule) return { ok: true as const };
      const saved = await this.graph.graphRequest(userId, path, {
        method: 'PATCH',
        headers: { 'If-Match': current.etag, Prefer: 'return=representation' },
        body: recurrenceBody(repeat, anchor),
      });
      if (saved.ok || saved.httpStatus !== 412) return saved.ok ? { ok: true as const } : { ok: false as const };
    }
    return { ok: false as const };
  }

  private async planPeople(userId: string, planId: string, meId: string, meName: string | null) {
    const people = new Map<string, string>();
    if (meId) people.set(meId, meName || 'You');
    const plan = await this.graph.graphRequest<{ container?: { containerId?: string; type?: string } }>(
      userId,
      `/planner/plans/${pathId(planId)}`,
    );
    if (!plan.ok || !plan.data.container?.containerId) return [...people].map(([id, name]) => ({ id, name }));
    const containerId = plan.data.container.containerId;
    const type = (plan.data.container.type || '').toLowerCase();
    if (type === 'roster') {
      const members = await this.graph.graphRequest<{ value?: Array<{ userId?: string }> }>(
        userId,
        `https://graph.microsoft.com/beta/planner/rosters/${pathId(containerId)}/members`,
      );
      if (members.ok) {
        for (const row of members.data.value || []) {
          if (row.userId && !people.has(row.userId)) people.set(row.userId, 'Teammate');
        }
      }
    } else if (type === 'group') {
      const members = await this.graph.graphRequest<{ value?: Array<{ id?: string; displayName?: string }> }>(
        userId,
        `/groups/${pathId(containerId)}/members?$select=id,displayName&$top=50`,
      );
      if (members.ok) {
        for (const row of members.data.value || []) {
          if (row.id) people.set(row.id, (row.displayName || '').trim() || 'Teammate');
        }
      }
    }
    return [...people].map(([id, name]) => ({ id, name }));
  }

  private async userNames(userId: string, ids: string[]) {
    const names = new Map<string, string>();
    const uniqueIds = [...new Set(ids)].filter((id) => /^[0-9a-fA-F-]{8,80}$/.test(id)).slice(0, 20);
    if (!uniqueIds.length) return names;
    const res = await this.graph.graphRequest<{
      responses?: Array<{ id?: string; status?: number; body?: { displayName?: string } }>;
    }>(userId, '/$batch', {
      method: 'POST',
      body: {
        requests: uniqueIds.map((id, offset) => ({
          id: String(offset),
          method: 'GET',
          url: `/users/${id}?$select=displayName`,
        })),
      },
    });
    if (!res.ok) return names;
    for (const item of res.data.responses || []) {
      const source = uniqueIds[Number(item.id)];
      const name = (item.body?.displayName || '').trim();
      if (source && item.status === 200 && name) names.set(source, name);
    }
    return names;
  }

  private failure(status: PlannerFailure['status']): PlannerFailure {
    if (status === 'needsConsent' || status === 'needsPlannerConsent') {
      return {
        status,
        message: status === 'needsPlannerConsent'
          ? 'Connect Microsoft Planner to see those tasks.'
          : 'Sign in with Microsoft to see your Planner tasks.',
      };
    }
    if (status === 'expired') {
      return { status, message: 'Your Microsoft session expired. Sign in again to load Planner tasks.' };
    }
    return { status, message: "Couldn't load Microsoft Planner tasks" };
  }
}

function dueDateTime(value: string | null) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T12:00:00.000Z`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid due date.');
  return date.toISOString();
}

function dateOnly(value?: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function repeatFrom(task: GraphPlannerTask) {
  const type = task.recurrence?.schedule?.pattern?.type;
  if (type === 'daily') return 'daily' as const;
  if (type === 'weekly') return 'weekly' as const;
  if (type === 'absoluteMonthly' || type === 'relativeMonthly') return 'monthly' as const;
  if (type === 'absoluteYearly' || type === 'relativeYearly') return 'yearly' as const;
  return 'none' as const;
}

function recurrenceBody(repeat: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly', anchor: string | null) {
  if (repeat === 'none') return { recurrence: { schedule: null } };
  const start = dueDateTime(anchor) || dueDateTime(new Date().toISOString().slice(0, 10));
  const date = new Date(start || Date.now());
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const pattern = repeat === 'daily'
    ? { type: 'daily', interval: 1 }
    : repeat === 'weekly'
      ? { type: 'weekly', interval: 1, daysOfWeek: [weekdays[date.getUTCDay()]], firstDayOfWeek: 'sunday' }
      : repeat === 'monthly'
        ? { type: 'absoluteMonthly', interval: 1, dayOfMonth: date.getUTCDate() }
        : { type: 'absoluteYearly', interval: 1, dayOfMonth: date.getUTCDate(), month: date.getUTCMonth() + 1 };
  return { recurrence: { schedule: { pattern, patternStartDateTime: start } } };
}

function checklistEntries(checklist?: GraphTaskDetails['checklist']) {
  return Object.entries(checklist || {})
    .map(([id, entry]) => ({
      id,
      title: (entry?.title || '').trim(),
      completed: Boolean(entry?.isChecked),
      order: entry?.orderHint || '',
    }))
    .filter((entry) => entry.title)
    .sort((left, right) => left.order.localeCompare(right.order))
    .map(({ id, title, completed }) => ({ id, title, completed }));
}

function checklistPatch(existing: GraphTaskDetails['checklist'], next: { id?: string; title: string; completed: boolean }[]) {
  const body: Record<string, unknown> = {};
  const keep = new Set<string>();
  next.forEach((item) => {
    const title = item.title.trim();
    if (!title) return;
    const id = item.id && TASK_ID.test(item.id) ? item.id : randomBytes(16).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 28);
    keep.add(id);
    const entry: Record<string, unknown> = {
      '@odata.type': '#microsoft.graph.plannerChecklistItem',
      title,
      isChecked: Boolean(item.completed),
    };
    if (!existing?.[id]) entry.orderHint = ' !';
    body[id] = entry;
  });
  for (const id of Object.keys(existing || {})) {
    if (!keep.has(id)) body[id] = null;
  }
  return body;
}

function attachmentEntries(references?: GraphTaskDetails['references']) {
  return Object.entries(references || {}).flatMap(([key, entry]) => {
    if (!entry) return [];
    let url = key;
    try { url = decodeURIComponent(key); } catch { url = key; }
    if (!/^https:\/\//i.test(url)) return [];
    return [{ url, alias: (entry.alias || url).trim() || url }];
  });
}

function referencesPatch(existing: GraphTaskDetails['references'], next: { url: string; alias?: string }[]) {
  const body: Record<string, unknown> = {};
  const kept = new Set<string>();
  for (const item of next) {
    const url = item.url.trim();
    if (!/^https:\/\//i.test(url)) continue;
    const key = encodeURIComponent(url);
    kept.add(url);
    const currentKey = Object.keys(existing || {}).find((candidate) => {
      try { return decodeURIComponent(candidate) === url; } catch { return candidate === url; }
    });
    body[currentKey || key] = {
      '@odata.type': '#microsoft.graph.plannerExternalReference',
      alias: (item.alias || url).trim().slice(0, 255) || url,
      type: 'Other',
      previewPriority: (currentKey && existing?.[currentKey]?.previewPriority) || ' !',
    };
  }
  for (const key of Object.keys(existing || {})) {
    let url = key;
    try { url = decodeURIComponent(key); } catch { url = key; }
    if (!kept.has(url)) body[key] = null;
  }
  return body;
}

function pathId(id: string) {
  if (/[/?#]/.test(id)) return encodeURIComponent(id);
  return id;
}

function assignedTo(task: GraphPlannerTask, meId: string) {
  return Object.keys(task.assignments || {}).some((id) => id.toLowerCase() === meId.toLowerCase());
}

function normalizeTask(
  task: GraphPlannerTask,
  context: {
    displayName: string | null;
    meId: string;
    planName: string | null;
    bucketName: string | null;
    description: string | null;
  },
): PlannerTaskView {
  const percent = typeof task.percentComplete === 'number' && Number.isFinite(task.percentComplete)
    ? task.percentComplete
    : null;
  const ids = Object.keys(task.assignments || {});
  const self = ids.some((id) => id.toLowerCase() === context.meId.toLowerCase());
  return {
    id: task.id || '',
    title: (task.title || 'Untitled task').trim() || 'Untitled task',
    description: context.description,
    dueDate: isoOrNull(task.dueDateTime),
    status: statusFromPercent(percent),
    percentComplete: percent,
    priority: typeof task.priority === 'number' && Number.isFinite(task.priority) ? task.priority : null,
    assignedTo: self ? context.displayName : null,
    extraAssignees: Math.max(0, ids.length - (self ? 1 : 0)),
    source: 'planner',
    sourceId: task.id || '',
    planName: context.planName,
    bucketName: context.bucketName,
    externalUrl: httpsUrl(task.webUrl),
  };
}

function normalizeTodoTask(task: GraphTodoTask, listName: string | null, displayName: string | null): PlannerTaskView {
  const status = todoStatus(task.status);
  return {
    id: task.id || '',
    title: (task.title || 'Untitled task').trim() || 'Untitled task',
    description: plainText(task.body?.content),
    dueDate: isoOrNull(task.dueDateTime?.dateTime),
    status,
    percentComplete: status === 'completed' ? 100 : status === 'not_started' ? 0 : null,
    priority: todoPriority(task.importance),
    assignedTo: displayName,
    extraAssignees: 0,
    source: 'planner',
    sourceId: task.id || '',
    planName: listName,
    bucketName: null,
    externalUrl: null,
  };
}

function todoStatus(status?: string): PlannerTaskStatus {
  if (status === 'completed') return 'completed';
  if (status === 'inProgress' || status === 'waitingOnOthers') return 'in_progress';
  return 'not_started';
}

function todoPriority(importance?: string) {
  if (importance === 'high') return 1;
  if (importance === 'low') return 9;
  if (importance === 'normal') return 5;
  return null;
}

function statusFromPercent(percent: number | null): PlannerTaskStatus {
  if (percent != null && percent >= 100) return 'completed';
  if (percent != null && percent > 0) return 'in_progress';
  return 'not_started';
}

function isoOrNull(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function httpsUrl(value?: string) {
  if (!value || !/^https:\/\//i.test(value)) return null;
  return value;
}

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function plainText(value?: string) {
  if (!value) return null;
  const text = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}
