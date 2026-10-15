import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { assertSchemaName, stripSchema } from './database-url';

const execFileAsync = promisify(execFile);

export function apiCwd() {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'prisma', 'schema.prisma'))) return cwd;
  const nested = path.join(cwd, 'apps', 'api');
  if (fs.existsSync(path.join(nested, 'prisma', 'schema.prisma'))) return nested;
  return cwd;
}

export function prismaCli(cwd = apiCwd()) {
  const candidates = [
    path.join(cwd, 'node_modules', 'prisma', 'build', 'index.js'),
    path.join(cwd, '..', '..', 'node_modules', 'prisma', 'build', 'index.js'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error('Prisma CLI was not found. Run npm install from the repo root.');
  return found;
}

export async function ensureSchema(baseUrl: string, schemaName: string) {
  assertSchemaName(schemaName);
  const client = new PrismaClient({
    datasources: { db: { url: stripSchema(baseUrl) } },
  });
  try {
    await client.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  } finally {
    await client.$disconnect();
  }
}

export async function prismaPush(databaseUrl: string, schemaFile?: string) {
  const cwd = apiCwd();
  const args = [prismaCli(cwd), 'db', 'push', '--skip-generate'];
  if (schemaFile) args.push('--schema', schemaFile);
  await execFileAsync(process.execPath, args, {
    cwd,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    timeout: 180000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

export async function generateClients() {
  const cwd = apiCwd();
  const cli = prismaCli(cwd);
  await execFileAsync(process.execPath, [cli, 'generate'], {
    cwd,
    env: process.env,
    timeout: 180000,
    maxBuffer: 10 * 1024 * 1024,
  });
  await execFileAsync(process.execPath, [cli, 'generate', '--schema', 'prisma/platform/schema.prisma'], {
    cwd,
    env: process.env,
    timeout: 180000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

export async function seedTenantDatabase(databaseUrl: string, env: Record<string, string>) {
  const cwd = apiCwd();
  const tsNode = require.resolve('ts-node/dist/bin.js', { paths: [cwd, path.join(cwd, '..', '..')] });
  await execFileAsync(process.execPath, [tsNode, '--transpile-only', 'prisma/seed.ts'], {
    cwd,
    env: { ...process.env, ...env, DATABASE_URL: databaseUrl },
    timeout: 180000,
    maxBuffer: 10 * 1024 * 1024,
  });
}
