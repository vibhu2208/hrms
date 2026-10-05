import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { OrgModule } from '../org/org.module';
import { LeaveModule } from '../leave/leave.module';

@Module({
  imports: [OrgModule, LeaveModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
