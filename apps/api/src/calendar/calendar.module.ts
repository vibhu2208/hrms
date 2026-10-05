import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { MicrosoftGraphService } from '../microsoft/microsoft-graph.service';

@Module({
  providers: [CalendarService, MicrosoftGraphService],
  controllers: [CalendarController],
})
export class CalendarModule {}
