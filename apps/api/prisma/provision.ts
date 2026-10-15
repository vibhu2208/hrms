import * as path from 'path';
import * as bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { normalizeDatabaseUrl } from '../src/tenant/database-url';
import { ensureSchema, generateClients, prismaPush, seedTenantDatabase } from '../src/tenant/provision';

config({ path: path.join(process.cwd(), '.env') });

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing from apps/api/.env`);
  return normalizeDatabaseUrl(value);
}

const COMPANIES = [
  {
    name: 'Aith World',
    slug: 'aithworld',
    ownerEmail: 'connect@aithworld.com',
    profile: 'aithworld',
    ownerFirst: 'Aarav',
    ownerLast: 'Mehta',
    employeeCode: 'GS-001',
    databaseUrl: '',
    hosts: ['aith.gostaff.in', 'aithworld.localhost'],
  },
  {
    name: 'TechThrive System',
    slug: 'techthrive',
    ownerEmail: 'owner@techthrive.local',
    profile: 'minimal',
    ownerFirst: 'TechThrive',
    ownerLast: 'Owner',
    employeeCode: 'TT-001',
    databaseUrl: '',
    hosts: ['tts.gostaff.in', 'techthrive.localhost'],
  },
];

async function main() {
  const baseUrl = requiredEnv('DATABASE_URL');
  process.env.DATABASE_URL = baseUrl;
  COMPANIES[0].databaseUrl = requiredEnv('AITH_DATABASE_URL');
  COMPANIES[1].databaseUrl = requiredEnv('TECHTHRIVE_DATABASE_URL');

  console.log('Generating Prisma clients...');
  await generateClients();

  console.log('Creating platform schema...');
  await ensureSchema(baseUrl, 'platform');

  console.log('Pushing platform tables...');
  await prismaPush(baseUrl, 'prisma/platform/schema.prisma');

  for (const company of COMPANIES) {
    console.log(`Pushing ${company.name} tables into its own database...`);
    await prismaPush(company.databaseUrl);
    console.log(`Seeding ${company.name}...`);
    await seedTenantDatabase(company.databaseUrl, {
      SEED_PROFILE: company.profile,
      SEED_COMPANY_NAME: company.name,
      SEED_OWNER_EMAIL: company.ownerEmail,
      SEED_OWNER_FIRST: company.ownerFirst || 'Owner',
      SEED_OWNER_LAST: company.ownerLast || 'User',
      SEED_OWNER_PASSWORD: 'password123',
      SEED_EMPLOYEE_CODE: company.employeeCode || 'GS-001',
    });
  }

  const { PrismaClient } = await import('@prisma/platform-client');
  const platform = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  try {
    const email = (process.env.SUPERADMIN_EMAIL || 'superadmin@gostaff.local').trim().toLowerCase();
    const password = process.env.SUPERADMIN_PASSWORD || 'password123';
    const passwordHash = await bcrypt.hash(password, 10);
    await platform.superAdmin.upsert({
      where: { email },
      create: { email, passwordHash },
      update: { passwordHash },
    });

    for (const company of COMPANIES) {
      await platform.tenant.upsert({
        where: { slug: company.slug },
        create: {
          name: company.name,
          slug: company.slug,
          schemaName: company.slug,
          hosts: company.hosts,
          ownerEmail: company.ownerEmail,
          databaseUrl: company.databaseUrl,
        },
        update: {
          name: company.name,
          schemaName: company.slug,
          hosts: company.hosts,
          ownerEmail: company.ownerEmail,
          databaseUrl: company.databaseUrl,
        },
      });
    }
    console.log(`Platform admin: ${email}`);
    console.log('Companies: aith.gostaff.in, tts.gostaff.in, platform.localhost');
  } finally {
    await platform.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
