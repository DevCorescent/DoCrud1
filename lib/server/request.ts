import type { NextRequest } from 'next/server';

export function getOriginForRequest(request: NextRequest) {
  // Prefer explicit forwarded origin (useful behind proxies), fall back to request URL.
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const originHeader = request.headers.get('origin');
  if (originHeader) return originHeader;

  try {
    return new URL(request.url).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

