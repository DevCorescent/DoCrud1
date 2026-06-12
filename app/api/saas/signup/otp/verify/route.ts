import { NextRequest, NextResponse } from 'next/server';
import { verifyBusinessSignupOtp } from '@/lib/server/otp-sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const {
      sessionId,
      email,
      otp,
    }: {
      sessionId?: string;
      email?: string;
      otp?: string;
    } = await request.json();

    const result = await verifyBusinessSignupOtp(String(sessionId || ''), String(email || ''), String(otp || ''));
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to verify OTP';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

