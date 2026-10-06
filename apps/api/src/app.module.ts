import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrgModule } from './org/org.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LeaveModule } from './leave/leave.module';
import { TasksModule } from './tasks/tasks.module';
import { PerformanceModule } from './performance/performance.module';
import { CommunicationModule } from './communication/communication.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RecruitmentModule } from './recruitment/recruitment.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';
import { CalendarModule } from './calendar/calendar.module';
import { PlannerModule } from './planner/planner.module';
import { AlertsModule } from './alerts/alerts.module';
import { AuditModule } from './audit/audit.module';
import { EmailModule } from './email/email.module';
import { LifecycleModule } from './lifecycle/lifecycle.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    StorageModule,
    EmailModule,
    AuditModule,
    AuthModule,
    UsersModule,
    OrgModule,
    AttendanceModule,
    LeaveModule,
    TasksModule,
    PerformanceModule,
    CommunicationModule,
    NotificationsModule,
    RecruitmentModule,
    IntegrationsModule,
    DashboardModule,
    ReportsModule,
    CalendarModule,
    PlannerModule,
    AlertsModule,
    LifecycleModule,
  ],
})
export class AppModule {}
