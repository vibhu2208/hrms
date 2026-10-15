const RESERVED = new Set(['www', 'platform', 'api', 'localhost', 'app']);

export function hostnameOf(host: string) {
  return host.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
}

export function originFromHost(host?: string | null) {
  if (!host) return null;
  const value = host.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  if (!/^[a-z0-9.-]+(?::\d{2,5})?$/.test(value)) return null;
  const name = value.split(':')[0];
  const local = name === 'localhost' || name.endsWith('.localhost') || name === '127.0.0.1';
  return `${local ? 'http' : 'https'}://${value}`;
}

export function publicOrigin(hosts: string[], fallback?: string | null) {
  const names = hosts.map((host) => hostnameOf(host)).filter(Boolean);
  const preferred = names.find((name) => name.endsWith('.gostaff.in')) || names[0];
  return (
    originFromHost(preferred) ||
    (fallback || '').split(',')[0].trim().replace(/\/$/, '') ||
    'http://localhost:3000'
  );
}

export function slugFromHost(host: string) {
  const name = hostnameOf(host);
  if (!name || name === 'localhost' || name === '127.0.0.1') return null;
  const sub = name.split('.')[0];
  if (!sub || RESERVED.has(sub)) return null;
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(sub)) return null;
  return sub;
}

export function readJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}
