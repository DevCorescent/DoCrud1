import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getAuthSettings, saveAuthSettings } from '@/lib/server/settings';
import type { AuthSettings } from '@/types/document';

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'admin';
}

export async function GET() {
  try {
    const session = await getAuthSession();
    const settings = await getAuthSettings();
    if (!isAdmin(session)) {
      return NextResponse.json({
        googleEnabled: settings.googleEnabled && Boolean(settings.googleClientId) && Boolean(settings.googleClientSecret),
        googleConfigured: Boolean(settings.googleClientId) && Boolean(settings.googleClientSecret),
        aadhaarVerificationEnabled: settings.aadhaarVerificationEnabled,
        aadhaarConfigured: Boolean(settings.aadhaarApiBaseUrl && settings.aadhaarOtpRequestPath && settings.aadhaarOtpVerifyPath),
        aadhaarProviderLabel: settings.aadhaarProviderLabel,
        aadhaarEnvironment: settings.aadhaarEnvironment,
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load auth settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json() as Partial<AuthSettings>;
    const next: AuthSettings = {
      googleEnabled: Boolean(payload.googleEnabled),
      googleClientId: payload.googleClientId?.trim() || '',
      googleClientSecret: payload.googleClientSecret?.trim() || '',
      aadhaarVerificationEnabled: Boolean(payload.aadhaarVerificationEnabled),
      aadhaarProviderLabel: payload.aadhaarProviderLabel?.trim() || 'UIDAI OTP via registered AUA gateway',
      aadhaarApiBaseUrl: payload.aadhaarApiBaseUrl?.trim() || '',
      aadhaarOtpRequestPath: payload.aadhaarOtpRequestPath?.trim() || '/otp/request',
      aadhaarOtpVerifyPath: payload.aadhaarOtpVerifyPath?.trim() || '/otp/verify',
      aadhaarClientId: payload.aadhaarClientId?.trim() || '',
      aadhaarClientSecret: payload.aadhaarClientSecret?.trim() || '',
      aadhaarApiKey: payload.aadhaarApiKey?.trim() || '',
      aadhaarAuaCode: payload.aadhaarAuaCode?.trim() || '',
      aadhaarSubAuaCode: payload.aadhaarSubAuaCode?.trim() || '',
      aadhaarLicenseKey: payload.aadhaarLicenseKey?.trim() || '',
      aadhaarEnvironment: payload.aadhaarEnvironment === 'production' ? 'production' : 'sandbox',
    };

    await saveAuthSettings(next);
    return NextResponse.json(next);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save auth settings' }, { status: 500 });
  }
}
