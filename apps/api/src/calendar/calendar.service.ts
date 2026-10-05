import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MicrosoftGraphService } from '../microsoft/microsoft-graph.service';

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private microsoftGraph: MicrosoftGraphService,
  ) {}

  createMeeting(
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
    return this.microsoftGraph.createMeeting(userId, input);
  }

  async upcoming(userId: string, timeZone: string, days?: number) {
    try {
      return await this.microsoftGraph.upcomingMeetings(userId, timeZone, days);
    } catch (error) {
      this.logger.warn(`Upcoming meetings failed: ${error instanceof Error ? error.message : 'unknown'}`);
      return {
        status: 'error' as const,
        timeZone: timeZone || 'UTC',
        message: 'Microsoft Calendar could not be loaded.',
        days: [] as string[],
        meetings: [],
      };
    }
  }

  getAuthUrl(userId: string) {
    const clientId = this.config.get('GOOGLE_CLIENT_ID');
    if (!clientId) {
      return {
        configured: false,
        message: 'Google Calendar OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
        demoEvents: this.demoEvents(),
      };
    }
    const redirect = this.config.get('GOOGLE_REDIRECT_URI');
    const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar.readonly');
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect!)}&response_type=code&scope=${scope}&access_type=offline&state=${userId}&prompt=consent`;
    return { configured: true, url };
  }

  async saveTokens(userId: string, accessToken: string, refreshToken?: string, expiryDate?: Date) {
    return this.prisma.calendarToken.upsert({
      where: { userId },
      create: { userId, accessToken, refreshToken, expiryDate },
      update: { accessToken, refreshToken, expiryDate },
    });
  }

  async schedule(userId: string, view: 'today' | 'week' = 'today') {
    const token = await this.prisma.calendarToken.findUnique({ where: { userId } });
    if (!token) {
      return { connected: false, events: this.demoEvents(view) };
    }
    // Live Google fetch when configured; fallback to stored demo shape
    try {
      const timeMin = new Date();
      const timeMax = new Date();
      if (view === 'week') timeMax.setDate(timeMax.getDate() + 7);
      else timeMax.setHours(23, 59, 59, 999);

      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}&singleEvents=true&orderBy=startTime`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      if (!res.ok) {
        return { connected: true, events: this.demoEvents(view), warning: 'Google API error; showing demo events' };
      }
      const data = await res.json();
      const events = (data.items || []).map((e: any) => ({
        id: e.id,
        title: e.summary,
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        location: e.location,
      }));
      return { connected: true, events };
    } catch {
      return { connected: true, events: this.demoEvents(view), warning: 'Failed to fetch Google Calendar' };
    }
  }

  private demoEvents(view: 'today' | 'week' = 'today') {
    const startAt = (h: number, m = 0) => {
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d.toISOString();
    };
    const events = [
      { id: 'demo-1', title: 'Leadership sync', start: startAt(10), end: startAt(10, 45) },
      { id: 'demo-2', title: 'Hiring review', start: startAt(14), end: startAt(15) },
    ];
    if (view === 'week') {
      const d = new Date();
      d.setDate(d.getDate() + 2);
      d.setHours(11, 0, 0, 0);
      const end = new Date(d);
      end.setHours(12, 0, 0, 0);
      events.push({
        id: 'demo-3',
        title: 'Board update',
        start: d.toISOString(),
        end: end.toISOString(),
      });
    }
    return events;
  }
}
