import { NextRequest, NextResponse } from 'next/server';
import { getHistoryEntryById } from '@/lib/server/history';
import { getMailSettings } from '@/lib/server/settings';
import { buildEmailChrome } from '@/lib/server/email-chrome';
import { isValidEmail, normalizeEmail } from '@/lib/server/security';
import { createDocumentSigningOtpSession, verifyDocumentSigningOtp } from '@/lib/server/otp-sessions';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const payload = await request.json() as {
      action?: 'request_otp' | 'verify_otp';
      password?: string;
      token?: string;
      signerKey?: string;
      email?: string;
      otpSessionId?: string;
      otp?: string;
    };

    const action = payload.action === 'verify_otp' ? 'verify_otp' : 'request_otp';
    const entry = await getHistoryEntryById(params.id);
    if (!entry) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    const normalizePassword = (value?: string | null) => String(value || '').trim().toUpperCase();
    const signingToken = String(payload.token || '').trim();
    let tokenSignerKey: string | null = null;
    let tokenValid = false;
    let tokenInvite: any | null = null;
    if (signingToken && entry.recipientSignerInvitesByKey && typeof entry.recipientSignerInvitesByKey === 'object') {
      for (const [signerKey, invite] of Object.entries(entry.recipientSignerInvitesByKey)) {
        if (!invite || typeof invite !== 'object') continue;
        if (String((invite as any).token || '') !== signingToken) continue;
        const expiresAt = String((invite as any).expiresAt || '');
        if (expiresAt && new Date(expiresAt).getTime() < Date.now()) break;
        tokenSignerKey = String(signerKey).slice(0, 64);
        tokenInvite = invite as any;
        tokenValid = true;
        break;
      }
    }
    if (!tokenValid) {
      if (!normalizePassword(entry.sharePassword)) return NextResponse.json({ error: 'Signing password is not configured for this document' }, { status: 409 });
      if (!payload.password?.trim()) return NextResponse.json({ error: 'Signing password is required' }, { status: 400 });
      if (normalizePassword(entry.sharePassword) !== normalizePassword(payload.password)) return NextResponse.json({ error: 'Invalid signing password' }, { status: 403 });
    }

    const signerKey = tokenSignerKey || (String(payload.signerKey || 'recipient').trim().slice(0, 64) || 'recipient');
    const cfg = entry.recipientSignerConfigsByKey?.[signerKey];
    if (cfg?.emailOtpEnabled !== true) {
      return NextResponse.json({ error: 'Email OTP verification is not enabled for this signer.' }, { status: 403 });
    }

    const directoryEmail = entry.recipientSignerDirectory?.[signerKey]?.signerEmail
      ? String(entry.recipientSignerDirectory[signerKey]!.signerEmail || '').trim().toLowerCase()
      : '';
    const inviteEmail = tokenValid && tokenInvite?.signerEmail
      ? String(tokenInvite.signerEmail || '').trim().toLowerCase()
      : '';
    const expectedEmail = inviteEmail || directoryEmail;
    const email = normalizeEmail(expectedEmail);
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Signer email is not configured for this signing slot.' }, { status: 409 });
    }

    const smtp = await getMailSettings();
    if (!smtp.host || !smtp.fromEmail) return NextResponse.json({ error: 'Email is not configured for this workspace.' }, { status: 409 });

    if (action === 'request_otp') {
      const { sessionId, otp, expiresAt } = await createDocumentSigningOtpSession({ email, historyId: entry.id, signerKey });
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: Number(smtp.port),
        secure: smtp.secure,
        auth: smtp.requireAuth ? { user: smtp.username, pass: smtp.password } : undefined,
      });
      const subject = 'Your DocRud signing verification code';
      const preheader = `Your verification code is ${otp}`;
      const bodyHtml = `
        <div style="padding:14px 14px 0;">
          <div style="border:1px solid rgba(15,23,42,.10); border-radius:18px; padding:16px; background:#ffffff;">
            <div style="font-size:12px; letter-spacing:.14em; text-transform:uppercase; font-weight:900; color: rgba(15,23,42,.55);">Email verification</div>
            <div style="margin-top:8px; font-size:14px; color:#0f172a;">Use this code to verify your email before signing:</div>
            <div style="margin-top:12px; font-size:28px; font-weight:900; letter-spacing:.22em; color:#0f172a;">${otp}</div>
            <div style="margin-top:10px; font-size:12px; color: rgba(15,23,42,.60);">Expires at ${new Date(expiresAt).toLocaleString()}.</div>
          </div>
        </div>
      `.trim();
      const html = buildEmailChrome({ origin: request.nextUrl.origin, subject, preheader, bodyHtml });
      await transporter.sendMail({
        from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
        to: email,
        replyTo: smtp.replyTo || undefined,
        subject,
        text: `Your DocRud verification code is: ${otp}\nExpires: ${expiresAt}`,
        html,
      });
      return NextResponse.json({ ok: true, otpSessionId: sessionId, expiresAt });
    }

    const verified = await verifyDocumentSigningOtp(String(payload.otpSessionId || ''), email, String(payload.otp || ''), { historyId: entry.id, signerKey });
    return NextResponse.json({ ok: true, verifiedAt: verified.verifiedAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to process OTP request' }, { status: 500 });
  }
}
