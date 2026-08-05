import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { otpSessionsPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import { updateProfileData } from '@/lib/server/user-profiles';
import { sendTrackedMail } from '@/lib/server/mailer';

export const dynamic = 'force-dynamic';

type EmailVerificationOtpSession = {
  id: string;
  purpose: 'email_verification';
  email: string;
  userId: string;
  otpHash: string;
  otpSalt: string;
  createdAt: string;
  expiresAt: string;
  attempts: number;
  verifiedAt?: string;
};

type OtpStore = {
  sessions: Array<Record<string, unknown>>;
};

function sha256Hex(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeEq(a: string, b: string) {
  const ab = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

async function getActor(emailFallback?: string) {
  // Primary: session-based lookup
  const session = await getAuthSession();
  if (session?.user?.email) {
    const users = await getStoredUsers();
    const found = users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase());
    if (found) return found;
  }
  // Fallback: email in request body — used immediately after signup when the
  // NextAuth client session hasn't propagated yet. The OTP code itself is the
  // security mechanism, so no session is required for this step.
  if (emailFallback) {
    const users = await getStoredUsers();
    return users.find((u) => u.email.toLowerCase() === emailFallback.toLowerCase()) ?? null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { otp?: string; email?: string };
    const emailFallback = String(body.email || '').toLowerCase().trim();

    const actor = await getActor(emailFallback || undefined);
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const code = String(body.otp || '').trim();
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Enter the 6-digit OTP.' }, { status: 400 });
    }

    const store = await readJsonFile<OtpStore>(otpSessionsPath, { sessions: [] });
    const sessions = Array.isArray(store.sessions) ? store.sessions : [];

    const now = Date.now();
    const idx = sessions.findIndex((s) => {
      const rec = s as Record<string, unknown>;
      if (rec['purpose'] !== 'email_verification') return false;
      if (rec['userId'] !== actor.id) return false;
      const expiresAt = new Date(String(rec['expiresAt'] || '')).getTime();
      return Number.isFinite(expiresAt) && expiresAt > now;
    });

    if (idx < 0) {
      return NextResponse.json({ error: 'OTP session expired or not found. Please request a new code.' }, { status: 400 });
    }

    const raw = sessions[idx] as unknown as EmailVerificationOtpSession;

    if (raw.attempts >= 5) {
      return NextResponse.json({ error: 'Too many attempts. Please request a new OTP.' }, { status: 400 });
    }

    const attemptHash = sha256Hex(`${raw.otpSalt}:${code}`);
    raw.attempts += 1;

    if (!safeEq(attemptHash, raw.otpHash)) {
      sessions[idx] = raw as unknown as Record<string, unknown>;
      await writeJsonFile(otpSessionsPath, { sessions });
      return NextResponse.json({ error: 'Incorrect OTP. Please try again.' }, { status: 400 });
    }

    // Mark verified and delete session
    raw.verifiedAt = new Date().toISOString();
    sessions.splice(idx, 1);
    await writeJsonFile(otpSessionsPath, { sessions });

    // Update user profile
    await updateProfileData(actor.id, {
      emailVerified: true,
      emailVerifiedAt: raw.verifiedAt,
    });

    // Send welcome email (fire-and-forget — don't let email failure block the response)
    const firstName = (actor.name ?? actor.email).split(' ')[0];
    void sendTrackedMail({
      policyKey: 'individual_welcome',
      typeLabel: 'system',
      to: actor.email,
      subject: `you're in, ${firstName} 🎉`,
      preheader: "Your email's verified and we're already excited you're here.",
      origin: 'onboarding/verify-otp',
      text: `Hey ${firstName}!\n\nYou're officially in — your Docrud profile is live and your email is verified.\n\nHonestly? We're kind of hyped about it.\n\nEvery single person who joins Docrud makes this whole thing more real. You're not just a user number to us. You're the reason we're up at 2am squashing that one bug nobody else noticed yet.\n\nDocrud was built for people who work seriously — on docs, on gigs, on building careers that actually matter. Welcome to that group. 🙌\n\n— The Docrud Team\nP.S. We really do read replies. Just saying.`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:24px 0;background:#06060a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#0d0d12;border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,0.06);">

    <!-- header -->
    <div style="padding:40px 36px 32px;background:linear-gradient(160deg,#111118 0%,#0d0d12 100%);border-bottom:1px solid rgba(255,255,255,0.05);">
      <p style="margin:0 0 20px;font-size:10px;font-weight:700;letter-spacing:0.25em;text-transform:uppercase;color:rgba(255,255,255,0.22);">Docrud Platform</p>
      <h1 style="margin:0;font-size:28px;font-weight:800;letter-spacing:-0.04em;line-height:1.12;color:#fff;">
        you're in, ${firstName}! 🎉
      </h1>
      <p style="margin:12px 0 0;font-size:14.5px;color:rgba(255,255,255,0.45);line-height:1.65;">
        Your email's verified. Your profile's live. And honestly? We're kind of hyped about it.
      </p>
    </div>

    <!-- body -->
    <div style="padding:32px 36px;">

      <p style="margin:0 0 18px;font-size:14.5px;color:rgba(255,255,255,0.65);line-height:1.75;">
        This isn't just another copy-paste "welcome aboard" email sitting in a queue somewhere. We actually mean it —
        every single person who joins Docrud makes this whole thing feel a little more real.
      </p>

      <p style="margin:0 0 28px;font-size:14.5px;color:rgba(255,255,255,0.65);line-height:1.75;">
        You're not a user number to us. You're the reason we're up fixing that one annoying bug at 2am that
        nobody else noticed yet — and probably the reason we'll be doing it again next week. Worth it. 🛠️
      </p>

      <!-- note box -->
      <div style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);border-radius:18px;padding:24px 26px;margin-bottom:32px;">
        <p style="margin:0 0 12px;font-size:9.5px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.22);">A note from us</p>
        <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.5);line-height:1.72;font-style:italic;">
          "Every login on Docrud means something to us. You trusted us with a part of your professional life —
          and we don't take that lightly, not even a little bit. We promise to keep earning that trust,
          one commit at a time."
        </p>
        <p style="margin:16px 0 0;font-size:13px;font-weight:600;color:rgba(255,255,255,0.28);">— The Docrud Team 💜</p>
      </div>

      <!-- what's next pills -->
      <p style="margin:0 0 14px;font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.22);">What's waiting for you</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:32px;">
        <tr>
          <td style="padding:4px 6px 4px 0;width:50%;vertical-align:top;">
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.055);border-radius:12px;padding:14px 16px;">
              <p style="margin:0 0 4px;font-size:18px;">📄</p>
              <p style="margin:0;font-size:13px;font-weight:600;color:rgba(255,255,255,0.6);">Smart Docs</p>
              <p style="margin:4px 0 0;font-size:11.5px;color:rgba(255,255,255,0.3);line-height:1.5;">Create, sign &amp; send documents in minutes</p>
            </div>
          </td>
          <td style="padding:4px 0 4px 6px;vertical-align:top;">
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.055);border-radius:12px;padding:14px 16px;">
              <p style="margin:0 0 4px;font-size:18px;">⚡</p>
              <p style="margin:0;font-size:13px;font-weight:600;color:rgba(255,255,255,0.6);">Gigs</p>
              <p style="margin:4px 0 0;font-size:11.5px;color:rgba(255,255,255,0.3);line-height:1.5;">Post work or land your next freelance role</p>
            </div>
          </td>
        </tr>
      </table>

      <!-- CTA -->
      <div style="text-align:center;margin:0 0 28px;">
        <a href="${process.env.NEXTAUTH_URL ?? 'https://docrud.com'}/"
          style="display:inline-block;background:#ffffff;color:#0a0a0c;text-decoration:none;font-weight:700;font-size:13.5px;padding:14px 34px;border-radius:100px;letter-spacing:-0.01em;">
          Go to my workspace →
        </a>
      </div>

      <p style="margin:0;font-size:11.5px;color:rgba(255,255,255,0.18);text-align:center;line-height:1.65;">
        You're getting this because you just verified your email on Docrud.<br/>
        Reply any time — we actually read these. 📬
      </p>

    </div>
  </div>
</body>
</html>`,
    }).catch(() => { /* welcome email failure is non-fatal */ });

    return NextResponse.json({ verified: true });
  } catch (error) {
    console.error('[onboarding/verify-otp] POST error', error);
    return NextResponse.json({ error: 'Failed to verify OTP.' }, { status: 500 });
  }
}
