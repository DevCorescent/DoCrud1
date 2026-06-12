export function getPublicAppBaseUrl() {
  const envBase = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_BASE_URL || '';
  return envBase.trim().replace(/\/+$/, '') || 'https://www.docrud.com';
}

export function buildAbsoluteAppUrl(pathOrUrl?: string, runtimeOrigin?: string) {
  if (!pathOrUrl) {
    return '';
  }

  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const base = runtimeOrigin?.trim().replace(/\/+$/, '') || getPublicAppBaseUrl();
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

export function buildQrImageUrl(pathOrUrl?: string, runtimeOrigin?: string, size = 320) {
  const absolute = buildAbsoluteAppUrl(pathOrUrl, runtimeOrigin);
  if (!absolute) {
    return '';
  }

  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encodeURIComponent(absolute)}`;
}
