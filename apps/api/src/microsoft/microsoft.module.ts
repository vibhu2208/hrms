import { Module } from '@nestjs/common';
import { MicrosoftGraphService } from './microsoft-graph.service';

@Module({
  providers: [MicrosoftGraphService],
  exports: [MicrosoftGraphService],
})
export class MicrosoftModule {}
