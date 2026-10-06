import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class CreatePlannerPlanDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;
}

export class CreatePlannerBucketDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  planId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;
}

export class RenamePlannerBucketDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;
}

export class CreatePlannerTaskDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  planId: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  bucketId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsBoolean()
  assignToMe?: boolean;
}

export class PlannerChecklistItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @IsBoolean()
  completed: boolean;
}

export class PlannerAttachmentDto {
  @IsString()
  @MinLength(8)
  @MaxLength(2000)
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  alias?: string;
}

export class UpdatePlannerTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  bucketId?: string;

  @IsOptional()
  @IsIn(['not_started', 'in_progress', 'completed'])
  status?: 'not_started' | 'in_progress' | 'completed';

  @IsOptional()
  @IsIn(['urgent', 'important', 'medium', 'low'])
  priority?: 'urgent' | 'important' | 'medium' | 'low';

  @IsOptional()
  @IsIn(['none', 'daily', 'weekly', 'monthly', 'yearly'])
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  startDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  showChecklist?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  assigneeIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  labels?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlannerChecklistItemDto)
  checklist?: PlannerChecklistItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlannerAttachmentDto)
  attachments?: PlannerAttachmentDto[];
}
