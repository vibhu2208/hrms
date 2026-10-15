import { BadRequestException } from '@nestjs/common';

export function normalizeMailAddress(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestException('Enter a valid sending email.');
  }
  return email;
}
