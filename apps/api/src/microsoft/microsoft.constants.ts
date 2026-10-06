export const MICROSOFT_DELEGATED_SCOPES =
  'openid profile email offline_access User.Read Calendars.ReadWrite Tasks.Read Tasks.ReadWrite';

export function scopeIncludes(scope: string | null | undefined, name: string) {
  return (scope || '')
    .split(/\s+/)
    .some((part) => part === name || part.endsWith(`/${name}`));
}
