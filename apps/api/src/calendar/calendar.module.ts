import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { MicrosoftModule } from '../microsoft/microsoft.module';

@Module({
  imports: [MicrosoftModule],
  providers: [CalendarService],
  controllers: [CalendarController],
})
export class CalendarModule {}
