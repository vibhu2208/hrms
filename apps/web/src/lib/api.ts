export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export type AuthMethod = 'password' | 'microsoft';

export type AuthUser = {
  id: string;
  email: string;
  authMethod?: AuthMethod;
  role: { code: string; name: string; permissions?: any[] };
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
    department?: { name: string };
    designation?: { name: string };
  };
};

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('gs_token');
}

export function setSession(token: string, user: AuthUser) {
  localStorage.setItem('gs_token', token);
  localStorage.setItem('gs_user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('gs_token');
  localStorage.removeItem('gs_user');
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('gs_user');
  return raw ? JSON.parse(raw) : null;
}

function authMethodFromToken(token?: string | null): AuthMethod | null {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded)) as { authMethod?: string };
    return payload.authMethod === 'microsoft' ? 'microsoft' : 'password';
  } catch {
    return null;
  }
}

export function isMicrosoftSession(_user?: AuthUser | null) {
  return authMethodFromToken(getToken()) === 'microsoft';
}

export function safeTaskReturnPath(value?: string | null) {
  const path = (value || '').trim().split('?')[0].replace(/\/+$/, '');
  if (path === '/admin/tasks' || path === '/employee/tasks') return path;
  return '';
}

function tenantHeaders(headers: Record<string, string>) {
  if (typeof window !== 'undefined') {
    headers['X-Tenant-Host'] = window.location.host;
  }
  return headers;
}

export async function api<T = any>(
  path: string,
  options: RequestInit & { formData?: FormData } = {},
): Promise<T> {
  const headers = tenantHeaders({
    ...(options.headers as Record<string, string>),
  });
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!options.formData && options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    body: options.formData || options.body,
  });

  if (res.status === 401) {
    clearSession();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.message || data?.error || res.statusText);
  }
  return data as T;
}

/** Unauthenticated API helper for public careers pages */
export async function publicApi<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = tenantHeaders({
    ...(options.headers as Record<string, string>),
  });
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(
      Array.isArray(data?.message)
        ? data.message.join(', ')
        : data?.message || data?.error || res.statusText,
    );
  }
  return data as T;
}

export function isAdminRole(code?: string) {
  return ['OWNER', 'MANAGEMENT', 'HR', 'DEPT_MANAGER'].includes(code || '');
}

/** Owner/Management-only business dashboards & integration hub */
export function canAccessBusinessData(code?: string) {
  return ['OWNER', 'MANAGEMENT'].includes(code || '');
}

export function hasAnyRole(code: string | undefined, roles: string[]) {
  return !!code && roles.includes(code);
}

const PLATFORM_TOKEN = 'gs_platform_token';

export function getPlatformToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(PLATFORM_TOKEN);
}

export function setPlatformSession(token: string) {
  localStorage.setItem(PLATFORM_TOKEN, token);
}

export function clearPlatformSession() {
  localStorage.removeItem(PLATFORM_TOKEN);
}

export async function platformApi<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = tenantHeaders({
    ...(options.headers as Record<string, string>),
  });
  const token = getPlatformToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (res.status === 401) {
    clearPlatformSession();
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message || data?.error || res.statusText;
    throw new Error(message);
  }
  return data as T;
}
