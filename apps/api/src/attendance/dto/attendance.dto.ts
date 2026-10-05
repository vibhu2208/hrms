import { AttendanceStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class LocationFixDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  accuracy?: number;

  @IsOptional()
  @IsISO8601()
  capturedAt?: string;
}

export class ExceptionRequestDto extends LocationFixDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class RejectAttendanceDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  rejectionReason: string;
}

export class UpdateAttendancePolicyDto {
  @Transform(({ value }) => (value === null || value === '' ? null : Number(value)))
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber()
  @Min(-90)
  @Max(90)
  officeLatitude?: number | null;

  @Transform(({ value }) => (value === null || value === '' ? null : Number(value)))
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber()
  @Min(-180)
  @Max(180)
  officeLongitude?: number | null;

  @Type(() => Number)
  @IsNumber()
  @Min(10)
  @Max(5000)
  allowedRadiusMeters: number;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  authorizedIps: string[];

  @IsBoolean()
  requireLocation: boolean;

  @IsBoolean()
  requireNetwork: boolean;

  @IsBoolean()
  hrApprovalForExceptions: boolean;

  @Transform(({ value }) => (value === '' || value == null ? null : String(value)))
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'In time must be HH:mm' })
  shiftStart?: string | null;

  @Transform(({ value }) => (value === '' || value == null ? null : String(value)))
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Out time must be HH:mm' })
  shiftEnd?: string | null;
}

export class MissedClockOutDto {
  @IsString()
  @MinLength(1)
  attendanceId: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @IsISO8601()
  checkOut: string;
}

export class CloseMissedClockOutDto {
  @IsISO8601()
  checkOut: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class ManualAttendanceDto {
  @IsISO8601()
  date: string;

  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
