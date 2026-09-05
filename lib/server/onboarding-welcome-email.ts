/**
 * The "you're in" email, sent the moment an individual's address is proven.
 *
 * It lives here rather than inside a route because TWO paths now finish an
 * individual signup: the onboarding flow, which creates the account only after
 * the emailed code comes back, and the older verify-otp endpoint, which
 * verifies an account that already exists. Both mean the same thing to the
 * person receiving it, so both send the same message.
 *
 * Sending is best-effort by design. A welcome email that fails must never turn
 * a completed, verified signup into an error.
 */
import { sendTrackedMail } from '@/lib/server/mailer';

export type IndividualWelcomeEmailInput = {
  to: string;
  name?: string;
  /**
   * The deployment's own origin, used to build the open/click tracking URLs.
   * Callers that have a request pass `req.nextUrl.origin`; the fallback is the
   * configured public URL. It was previously a route label, which produced
   * tracking links that pointed nowhere.
   */
  origin?: string;
};

export async function sendIndividualWelcomeEmail(opts: IndividualWelcomeEmailInput): Promise<void> {
  const email = String(opts.to || '').trim();
  if (!email) return;
  const firstName = String(opts.name || email).split(' ')[0];
  const origin = opts.origin || process.env.NEXTAUTH_URL || 'https://docrud.com';

  await sendTrackedMail({
    policyKey: 'individual_welcome',
    typeLabel: 'system',
    to: email,
    subject: `you're in, ${firstName} 🎉`,
    preheader: "Your email's verified and we're already excited you're here.",
    origin,
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
  });
}

/** Fire-and-forget wrapper for callers that must answer the request first. */
export function queueIndividualWelcomeEmail(opts: IndividualWelcomeEmailInput): void {
  void sendIndividualWelcomeEmail(opts).catch((err) => {
    console.error('[welcome-email] send failed (non-fatal)', err);
  });
}
