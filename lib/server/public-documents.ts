import { NextRequest } from 'next/server';

export function getRequestIp(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export function getRequestUserAgent(request: NextRequest) {
  return request.headers.get('user-agent') || 'unknown';
}

export function getDeviceLabel(userAgent: string) {
  const source = userAgent.toLowerCase();
  const device = /mobile|iphone|android/.test(source) ? 'Mobile' : /ipad|tablet/.test(source) ? 'Tablet' : 'Desktop';
  const browser = source.includes('edg/') ? 'Edge'
    : source.includes('chrome/') ? 'Chrome'
      : source.includes('safari/') && !source.includes('chrome/') ? 'Safari'
        : source.includes('firefox/') ? 'Firefox'
          : 'Browser';
  const os = source.includes('windows') ? 'Windows'
    : source.includes('mac os') || source.includes('macintosh') ? 'macOS'
      : source.includes('android') ? 'Android'
        : source.includes('iphone') || source.includes('ipad') || source.includes('ios') ? 'iOS'
          : source.includes('linux') ? 'Linux'
            : 'OS';

  return `${device} • ${browser} • ${os}`;
}
