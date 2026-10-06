import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MICROSOFT_DELEGATED_SCOPES, scopeIncludes } from './microsoft.constants';

export type MeetingAttendee = { name: string; email: string };

export type OnlineMeeting = {
  id: string;
  subject: string;
  start: string;
  end: string;
  organizer: string | null;
  attendees: MeetingAttendee[];
  joinUrl: string | null;
  onlineMeetingProvider: string;
  description: string | null;
};

export type UpcomingCalendarResult = {
  status: 'ok' | 'needsConsent' | 'expired' | 'forbidden' | 'error';
  timeZone: string;
  message?: string;
  days: string[];
  meetings: OnlineMeeting[];
};

type GraphEvent = {
  id?: string;
  subject?: string | null;
  bodyPreview?: string | null;
  isCancelled?: boolean;
  isAllDay?: boolean;
  isOnlineMeeting?: boolean;
  onlineMeetingUrl?: string | null;
  onlineMeetingProvider?: string | null;
  onlineMeeting?: { joinUrl?: string | null } | null;
  location?: { displayName?: string | null; locationUri?: string | null; uniqueId?: string | null };
  body?: { content?: string | null };
  webLink?: string | null;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  organizer?: { emailAddress?: { name?: string | null; address?: string | null } };
  attendees?: Array<{
    emailAddress?: { name?: string | null; address?: string | null };
  }>;
};

const DEFAULT_DAYS = 4;

@Injectable()
export class MicrosoftGraphService {
  private readonly logger = new Logger(MicrosoftGraphService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async upcomingMeetings(userId: string, timeZone: string, days = DEFAULT_DAYS): Promise<UpcomingCalendarResult> {
    const zone = safeTimeZone(timeZone);
    const span = clampDays(days);
    const today = formatYmd(new Date(), zone);
    const dayList = Array.from({ length: span }, (_, index) => addDaysYmd(today, index));
    const rangeStart = zonedWallToUtc(`${dayList[0]}T00:00:00`, zone);
    const rangeEnd = zonedWallToUtc(`${addDaysYmd(today, span)}T00:00:00`, zone);

    const access = await this.accessToken(userId);
    if (!('token' in access)) {
      return { status: access.status, timeZone: zone, message: access.message, days: dayList, meetings: [] };
    }

    const params = new URLSearchParams({
      startDateTime: rangeStart.toISOString(),
      endDateTime: rangeEnd.toISOString(),
      $select:
        'subject,bodyPreview,body,start,end,location,organizer,attendees,isAllDay,isOnlineMeeting,onlineMeeting,onlineMeetingUrl,onlineMeetingProvider,isCancelled,webLink',
      $orderby: 'start/dateTime',
      $top: '50',
    });
    let url: string | null = `https://graph.microsoft.com/v1.0/me/calendarView?${params}`;
    const events: GraphEvent[] = [];
    let token = access.token || '';
    let refreshed = false;

    while (url && events.length < 200) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Prefer: `outlook.timezone="${zone}"`,
        },
      });
      if (res.status === 401 && !refreshed) {
        await res.body?.cancel();
        const again = await this.accessToken(userId, true);
        if (!('token' in again)) {
          return { status: again.status, timeZone: zone, message: again.message, days: dayList, meetings: [] };
        }
        token = again.token || '';
        refreshed = true;
        continue;
      }
      const body = (await res.json().catch(() => ({}))) as {
        value?: GraphEvent[];
        '@odata.nextLink'?: string;
        error?: { code?: string; message?: string };
      };
      if (res.status === 401) {
        return {
          status: 'expired',
          timeZone: zone,
          message: 'Your Microsoft session expired. Sign in again to load meetings.',
          days: dayList,
          meetings: [],
        };
      }
      if (res.status === 403) {
        return {
          status: 'forbidden',
          timeZone: zone,
          message: 'Calendar permission is missing. An admin needs to allow Calendars.Read, then sign in with Microsoft again.',
          days: dayList,
          meetings: [],
        };
      }
      if (!res.ok) {
        this.logger.warn(`Graph calendarView failed: ${res.status} ${body.error?.code || ''}`);
        return {
          status: 'error',
          timeZone: zone,
          message: 'Microsoft Calendar could not be loaded.',
          days: dayList,
          meetings: [],
        };
      }
      events.push(...(body.value || []));
      url = body['@odata.nextLink'] || null;
    }

    await this.hydrateJoinLinks(events, token);

    const meetings = events
      .map((event) => this.toMeeting(event, zone))
      .filter((meeting): meeting is OnlineMeeting => Boolean(meeting))
      .filter((meeting) => {
        const start = new Date(meeting.start).getTime();
        return start >= rangeStart.getTime() && start < rangeEnd.getTime();
      })
      .sort((a, b) => a.start.localeCompare(b.start));

    return { status: 'ok', timeZone: zone, days: dayList, meetings };
  }

  async createMeeting(
    userId: string,
    input: {
      subject: string;
      date: string;
      startTime: string;
      endTime: string;
      timeZone?: string;
      description?: string;
      attendees?: string[];
    },
  ) {
    const zone = safeTimeZone(input.timeZone || 'UTC');
    const subject = input.subject.trim();
    const date = input.date.trim();
    const startTime = input.startTime.trim();
    const endTime = input.endTime.trim();
    if (!subject) return { status: 'error' as const, message: 'Add a meeting title.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      return { status: 'error' as const, message: 'Choose a date, start time, and end time.' };
    }
    if (`${date}T${endTime}` <= `${date}T${startTime}`) {
      return { status: 'error' as const, message: 'End time must be after the start time.' };
    }
    const attendees = (input.attendees || [])
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.includes('@'));

    const access = await this.accessToken(userId);
    if (!('token' in access)) return { status: access.status, message: access.message };
    const token = access.token || '';
    if (!token) return { status: 'needsConsent' as const, message: 'Sign in with Microsoft to schedule a meeting.' };

    const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: `outlook.timezone="${zone}"`,
      },
      body: JSON.stringify({
        subject,
        body: {
          contentType: 'Text',
          content: (input.description || '').trim(),
        },
        start: { dateTime: `${date}T${startTime}:00`, timeZone: zone },
        end: { dateTime: `${date}T${endTime}:00`, timeZone: zone },
        attendees: attendees.map((address) => ({
          emailAddress: { address },
          type: 'required',
        })),
        isOnlineMeeting: true,
        onlineMeetingProvider: 'teamsForBusiness',
      }),
    });
    if (res.status === 401) {
      return { status: 'expired' as const, message: 'Your Microsoft session expired. Sign in again to schedule a meeting.' };
    }
    if (res.status === 403) {
      return {
        status: 'forbidden' as const,
        message: 'Sign in with Microsoft again so GoStaff can add meetings to your calendar.',
      };
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      this.logger.warn(`Graph create event failed: ${res.status}`);
      return { status: 'error' as const, message: body.error?.message || 'The meeting could not be scheduled.' };
    }
    return { status: 'ok' as const };
  }

  private toMeeting(event: GraphEvent, zone: string): OnlineMeeting | null {
    if (event.isCancelled || event.isAllDay) return null;
    const joinUrl = extractJoinUrl(event);
    const isOnline = Boolean(event.isOnlineMeeting || (joinUrl && /teams\.(microsoft|live)\.com/i.test(joinUrl)));
    const start = graphDateToIso(event.start, zone);
    const end = graphDateToIso(event.end, zone);
    if (!start || !end || !event.id) return null;
    const attendees = (event.attendees || [])
      .map((attendee) => ({
        name: (attendee.emailAddress?.name || '').trim(),
        email: (attendee.emailAddress?.address || '').trim(),
      }))
      .filter((attendee) => attendee.name || attendee.email)
      .slice(0, 25);
    const description = (event.bodyPreview || '').replace(/\s+/g, ' ').trim();
    return {
      id: event.id,
      subject: (event.subject || '').trim() || 'Teams meeting',
      start,
      end,
      organizer: (event.organizer?.emailAddress?.name || '').trim() || null,
      attendees,
      joinUrl,
      onlineMeetingProvider: isOnline ? providerLabel(event.onlineMeetingProvider, joinUrl || '') : 'Outlook',
      description: description ? description.slice(0, 500) : null,
    };
  }

  private async hydrateJoinLinks(events: GraphEvent[], token: string) {
    const missing = events
      .filter((event) => event.id && !event.isCancelled && !event.isAllDay && !extractJoinUrl(event))
      .slice(0, 20);
    await Promise.all(
      missing.map(async (event) => {
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(event.id!)}?$select=isOnlineMeeting,onlineMeeting,onlineMeetingUrl,onlineMeetingProvider,body,webLink,location`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) return;
        const detail = (await res.json().catch(() => null)) as GraphEvent | null;
        if (!detail) return;
        event.isOnlineMeeting = event.isOnlineMeeting || detail.isOnlineMeeting;
        event.onlineMeeting = detail.onlineMeeting || event.onlineMeeting;
        event.onlineMeetingUrl = detail.onlineMeetingUrl || event.onlineMeetingUrl;
        event.onlineMeetingProvider = detail.onlineMeetingProvider || event.onlineMeetingProvider;
        event.body = detail.body?.content ? detail.body : event.body;
        event.webLink = detail.webLink || event.webLink;
        event.location = detail.location || event.location;
      }),
    );
  }

  private microsoftConfig() {
    const tenantId = this.config.get<string>('MS_TENANT_ID')?.trim();
    const clientId = this.config.get<string>('MS_CLIENT_ID')?.trim();
    const clientSecret = this.config.get<string>('MS_CLIENT_SECRET')?.trim();
    if (!tenantId || !clientId || !clientSecret) return null;
    return { tenantId, clientId, clientSecret };
  }

  private async accessToken(userId: string, forceRefresh = false) {
    const cfg = this.microsoftConfig();
    if (!cfg) {
      return { status: 'error' as const, message: 'Microsoft sign-in is not set up yet.' };
    }
    const account = await this.prisma.microsoftAccount.findUnique({ where: { userId } });
    if (!account) {
      return {
        status: 'needsConsent' as const,
        message: 'Sign in with Microsoft to see your meetings.',
      };
    }
    const stillValid = account.expiresAt.getTime() > Date.now() + 60_000;
    if (!forceRefresh && stillValid && account.accessToken) {
      return { token: account.accessToken };
    }
    if (!account.refreshToken) {
      return {
        status: 'needsConsent' as const,
        message: 'Sign in with Microsoft to see your meetings.',
      };
    }

    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: account.refreshToken,
          scope: account.scope?.trim() || MICROSOFT_DELEGATED_SCOPES,
        }),
      },
    );
    const tokenData = (await tokenRes.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokenRes.ok || !tokenData.access_token) {
      const consent =
        tokenData.error === 'invalid_grant' ||
        tokenData.error === 'interaction_required' ||
        tokenData.error === 'consent_required';
      return consent
        ? {
            status: 'expired' as const,
            message: 'Your Microsoft session expired. Sign in again to load meetings.',
          }
        : {
            status: 'error' as const,
            message: 'Microsoft Calendar could not be loaded.',
          };
    }

    const expiresIn = Number(tokenData.expires_in) || 3600;
    await this.prisma.microsoftAccount.update({
      where: { userId },
      data: {
        accessToken: tokenData.access_token,
        ...(tokenData.refresh_token ? { refreshToken: tokenData.refresh_token } : {}),
        ...(tokenData.scope ? { scope: tokenData.scope } : {}),
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      },
    });
    return { token: tokenData.access_token };
  }

  async plannerConsent(userId: string): Promise<
    | { ok: true; canWrite: boolean }
    | { ok: false; status: 'needsConsent' | 'needsPlannerConsent' | 'error'; message: string }
  > {
    if (!this.microsoftConfig()) {
      return { ok: false, status: 'error', message: 'Microsoft sign-in is not set up yet.' };
    }
    const account = await this.prisma.microsoftAccount.findUnique({
      where: { userId },
      select: { refreshToken: true, scope: true },
    });
    if (!account || !account.refreshToken) {
      return {
        ok: false,
        status: 'needsConsent',
        message: 'Sign in with Microsoft to see your Planner tasks.',
      };
    }
    if (!scopeIncludes(account.scope, 'Tasks.Read') && !scopeIncludes(account.scope, 'Tasks.ReadWrite')) {
      return {
        ok: false,
        status: 'needsPlannerConsent',
        message: 'Connect Microsoft Planner to see those tasks.',
      };
    }
    return { ok: true, canWrite: scopeIncludes(account.scope, 'Tasks.ReadWrite') };
  }

  async graphRequest<T>(
    userId: string,
    path: string,
    init?: { method?: string; body?: unknown; headers?: Record<string, string> },
  ): Promise<GraphCall<T>> {
    const access = await this.accessToken(userId);
    if (!('token' in access) || !access.token) {
      return {
        ok: false,
        status: 'token' in access ? 'error' : access.status,
        message: 'token' in access ? 'Microsoft could not be reached.' : access.message || 'Microsoft could not be reached.',
      };
    }
    return this.graphRequestWithToken(userId, path, access.token, init, false);
  }

  private async graphRequestWithToken<T>(
    userId: string,
    path: string,
    token: string,
    init: { method?: string; body?: unknown; headers?: Record<string, string> } | undefined,
    retried: boolean,
  ): Promise<GraphCall<T>> {
    let url: string;
    try {
      url = graphUrl(path);
    } catch {
      return { ok: false, status: 'error', message: 'Microsoft Graph could not be reached.' };
    }
    const res = await fetch(url, {
      method: init?.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (res.status === 401 && !retried) {
      await res.body?.cancel();
      const again = await this.accessToken(userId, true);
      if (!('token' in again) || !again.token) {
        return {
          ok: false,
          status: !('token' in again) && again.status === 'needsConsent' ? 'needsConsent' : 'expired',
          message: 'Your Microsoft session expired. Sign in again.',
        };
      }
      return this.graphRequestWithToken(userId, path, again.token, init, true);
    }
    const etag = res.headers.get('etag') || undefined;
    const data = (res.status === 204 ? {} : await res.json().catch(() => ({}))) as T;
    if (res.status === 401) {
      return { ok: false, status: 'expired', message: 'Your Microsoft session expired. Sign in again.' };
    }
    if (res.status === 403) {
      return { ok: false, status: 'forbidden', message: 'Microsoft denied this request.' };
    }
    if (!res.ok) {
      const route = path.split('?')[0].replace(/\/[^/]{12,}/g, '/{id}');
      const graphError = data && typeof data === 'object' && 'error' in data
        ? (data as { error?: { code?: string; message?: string } }).error
        : undefined;
      const detail = (graphError?.message || '').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi, '').slice(0, 180);
      this.logger.warn(`Graph ${init?.method || 'GET'} failed with ${res.status} ${route} ${graphError?.code || ''} ${detail}`.trim());
      return {
        ok: false,
        status: 'error',
        httpStatus: res.status,
        message: 'Microsoft Graph could not be reached.',
      };
    }
    const bodyEtag = data && typeof data === 'object' && '@odata.etag' in data
      ? String((data as { '@odata.etag'?: string })['@odata.etag'] || '')
      : '';
    return { ok: true, data, etag: etag || bodyEtag || undefined };
  }
}

type GraphCall<T> =
  | { ok: true; data: T; etag?: string }
  | {
      ok: false;
      status: 'needsConsent' | 'expired' | 'forbidden' | 'error';
      message: string;
      httpStatus?: number;
    };

function graphUrl(path: string) {
  if (path.startsWith('https://graph.microsoft.com/')) return path;
  if (path.startsWith('/') && !path.startsWith('//')) return `https://graph.microsoft.com/v1.0${path}`;
  throw new Error('Invalid Graph path');
}

function extractJoinUrl(event: GraphEvent) {
  const direct = (
    event.onlineMeeting?.joinUrl ||
    event.onlineMeetingUrl ||
    event.location?.locationUri ||
    ''
  ).trim();
  if (/teams\.(microsoft|live)\.com/i.test(direct)) return direct;
  const blob = `${event.body?.content || ''} ${event.bodyPreview || ''} ${event.location?.displayName || ''} ${event.location?.uniqueId || ''} ${direct}`;
  const match =
    blob.match(/https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"'<>]+/i) ||
    blob.match(/https:\/\/teams\.microsoft\.com\/meet\/[^\s"'<>]+/i) ||
    blob.match(/https:\/\/teams\.live\.com\/meet\/[^\s"'<>]+/i);
  if (!match) return null;
  return match[0].replace(/&amp;/g, '&').replace(/[).,]+$/, '');
}

function providerLabel(provider: string | null | undefined, joinUrl: string) {
  const value = (provider || '').toLowerCase();
  if (value.includes('teams') || /teams\.microsoft\.com|teams\.live\.com/i.test(joinUrl)) {
    return 'Microsoft Teams';
  }
  if (value.includes('skype')) return 'Skype';
  return 'Online meeting';
}

function clampDays(days: number) {
  if (!Number.isFinite(days)) return DEFAULT_DAYS;
  return Math.min(7, Math.max(1, Math.round(days)));
}

function safeTimeZone(timeZone: string) {
  const aliases: Record<string, string> = { 'Asia/Calcutta': 'Asia/Kolkata' };
  const value = aliases[(timeZone || '').trim()] || (timeZone || '').trim();
  if (!value) return 'UTC';
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return value;
  } catch {
    return 'UTC';
  }
}

function formatYmd(instant: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function addDaysYmd(ymd: string, days: number) {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function timeZoneOffsetMs(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  let hour = Number(map.hour);
  let day = Number(map.day);
  if (hour === 24) {
    hour = 0;
    day += 1;
  }
  const asUtc = Date.UTC(Number(map.year), Number(map.month) - 1, day, hour, Number(map.minute), Number(map.second));
  return asUtc - instant.getTime();
}

function zonedWallToUtc(wall: string, timeZone: string) {
  const match = wall.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return new Date(wall);
  const utcGuess = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] || 0),
  );
  const offset = timeZoneOffsetMs(new Date(utcGuess), timeZone);
  let utc = utcGuess - offset;
  const corrected = timeZoneOffsetMs(new Date(utc), timeZone);
  if (corrected !== offset) utc = utcGuess - corrected;
  return new Date(utc);
}

function graphDateToIso(value: { dateTime?: string; timeZone?: string } | undefined, fallbackZone: string) {
  const raw = value?.dateTime;
  if (!raw) return null;
  if (/[zZ]$/.test(raw) || /[+-]\d{2}:\d{2}$/.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const zone = !value?.timeZone || value.timeZone === 'UTC' ? (value?.timeZone === 'UTC' ? 'UTC' : fallbackZone) : value.timeZone;
  try {
    if (zone === 'UTC') {
      const parsed = new Date(`${raw.replace(/\.\d+$/, '')}Z`);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    return zonedWallToUtc(raw, zone).toISOString();
  } catch {
    const parsed = new Date(`${raw.replace(/\.\d+$/, '')}Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
}
