import { NextRequest, NextResponse } from 'next/server';
import { verifyBusinessSignupOtp } from '@/lib/server/otp-sessions';
import { enforceRateLimits, refundRateLimit, getClientIp, RATE_POLICIES } from '@/lib/server/security/rate-limit';

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

    // Throttle OTP-verify by session + IP so the code cannot be brute-forced.
    const sessKey = `otp:verify:bizsignup:session:${String(sessionId || '')}`;
    const limited = await enforceRateLimits([
      { key: sessKey, policy: RATE_POLICIES.otpVerifyAccount },
      { key: `otp:verify:bizsignup:ip:${getClientIp(request)}`, policy: RATE_POLICIES.otpVerifyIp },
    ]);
    if (limited) return limited;

    const result = await verifyBusinessSignupOtp(String(sessionId || ''), String(email || ''), String(otp || ''));
    await refundRateLimit(sessKey, RATE_POLICIES.otpVerifyAccount); // success → refund
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to verify OTP';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

