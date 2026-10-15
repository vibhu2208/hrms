import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class PlatformLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @Matches(/^[a-z][a-z0-9-]{1,30}$/)
  slug!: string;

  @IsEmail()
  ownerEmail!: string;

  @IsEmail()
  mailFrom!: string;

  @IsString()
  @MinLength(1)
  ownerFirstName!: string;

  @IsString()
  @MinLength(1)
  ownerLastName!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  ownerPassword?: string;

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsString()
  databaseUrl?: string;
}

export class UpdateMailFromDto {
  @IsEmail()
  mailFrom!: string;
}
