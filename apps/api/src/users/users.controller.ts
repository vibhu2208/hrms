import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, UseInterceptors, UploadedFile, UploadedFiles, BadRequestException } from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard, Roles } from '../auth/permissions.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('employees')
  findAll(
    @Query('departmentId') departmentId?: string,
    @Query('search') search?: string,
  ) {
    return this.users.findAll({ departmentId, search });
  }

  @Get('employees/next-code')
  @Roles('OWNER', 'HR', 'MANAGEMENT')
  nextCode() {
    return this.users.previewNextEmployeeCode();
  }

  @Get('employees/:id')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Post('employees/:id/documents')
  @Roles('OWNER', 'HR', 'MANAGEMENT')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { kind?: string; title?: string },
    @CurrentUser() user: any,
  ) {
    if (!file) throw new BadRequestException('Choose a file to upload');
    return this.users.uploadDocument(id, file, body, user.id);
  }

  @Post('employees')
  @Roles('OWNER', 'HR', 'MANAGEMENT')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'document1', maxCount: 1 },
        { name: 'document2', maxCount: 1 },
        { name: 'photo', maxCount: 1 },
      ],
      { limits: { fileSize: 15 * 1024 * 1024 } },
    ),
  )
  create(
    @UploadedFiles()
    files: { document1?: Express.Multer.File[]; document2?: Express.Multer.File[]; photo?: Express.Multer.File[] },
    @Body() body: any,
    @CurrentUser() user: any,
  ) {
    const document1 = files?.document1?.[0];
    const document2 = files?.document2?.[0];
    if (!document1 || !document2) {
      throw new BadRequestException('Upload two verification documents');
    }
    return this.users.create(body, user.id, {
      sendLoginEmail: true,
      photo: files?.photo?.[0],
      documents: [
        { file: document1, kind: body.document1Kind, title: body.document1Title },
        { file: document2, kind: body.document2Kind, title: body.document2Title },
      ],
    });
  }

  @Patch('employees/:id')
  @Roles('OWNER', 'HR', 'MANAGEMENT')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 5 * 1024 * 1024 } }))
  update(
    @Param('id') id: string,
    @UploadedFile() photo: Express.Multer.File | undefined,
    @Body() body: any,
    @CurrentUser() user: any,
  ) {
    return this.users.update(id, body, user.id, photo);
  }

  @Post('employees/:id/deactivate')
  @Roles('OWNER', 'HR', 'MANAGEMENT')
  deactivate(@Param('id') id: string, @Body() body: { lastWorkingDay?: string }, @CurrentUser() user: any) {
    return this.users.deactivate(id, body?.lastWorkingDay, user.id);
  }

  @Get('directory')
  directory() {
    return this.users.directory();
  }

  @Get('birthdays')
  birthdays(@Query('days') days?: string) {
    return this.users.upcomingBirthdays(days ? Number(days) : 30);
  }
}
