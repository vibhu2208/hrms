export function normalizeDatabaseUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);
  if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require');
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '3');
  return url.toString();
}

export function stripSchema(databaseUrl: string) {
  const url = new URL(databaseUrl);
  url.searchParams.delete('schema');
  return url.toString();
}

export function withSchema(databaseUrl: string, schema: string) {
  assertSchemaName(schema);
  const url = new URL(stripSchema(databaseUrl));
  url.searchParams.set('schema', schema);
  if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require');
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '3');
  return url.toString();
}

export function databaseUrlForTenant(
  tenant: { schemaName: string; databaseUrl?: string | null },
  baseUrl: string,
) {
  if (tenant.databaseUrl) return normalizeDatabaseUrl(tenant.databaseUrl);
  return withSchema(baseUrl, tenant.schemaName);
}

export function assertSchemaName(name: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) {
    throw new Error(`Invalid schema name "${name}"`);
  }
  return name;
}

export function schemaNameFromSlug(slug: string) {
  return assertSchemaName(slug.replace(/-/g, '_'));
}
