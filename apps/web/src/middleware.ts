import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function hostnameOf(host: string) {
  return host.split(':')[0].toLowerCase();
}

function isBareLocal(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const hostname = hostnameOf(host);
  const sub = hostname.split('.')[0];
  const { pathname } = request.nextUrl;

  if (isBareLocal(hostname)) {
    if (pathname !== '/') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (sub === 'platform') {
    if (pathname === '/' || pathname === '/login' || pathname.startsWith('/admin') || pathname.startsWith('/employee')) {
      const url = request.nextUrl.clone();
      url.pathname = '/platform';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/platform')) {
    const url = request.nextUrl.clone();
    const rest = hostname.split('.').slice(1).join('.') || 'localhost';
    url.hostname = `platform.${rest}`;
    url.pathname = '/platform';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
