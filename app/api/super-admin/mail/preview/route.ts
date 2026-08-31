/**
 * POST /api/super-admin/mail/preview — the canonical render of an email.
 *
 * The preview is built on the SERVER for one reason: what an admin approves
 * must be the same bytes a recipient receives. A client-side preview is a
 * second rendering path, free to diverge from the sanitizer and the variable
 * resolver — and the first time it diverged, someone would approve one email
 * and send another. Two components previously did exactly that, each with its
 * own inline `{{variable}}` substitution.
 *
 * It contacts NO provider. Previewing an email is not a reason to open an SMTP
 * connection, and an admin should never wait on a handshake to see their own
 * words.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { renderEmail } from '@/lib/email/render-email';
import { getEmailRenderContext, isEmailSource } from '@/lib/server/email-render-context';
import { getMailCampaignById } from '@/lib/server/mail-campaigns';
import { resolveRecipients, describeSegment } from '@/lib/server/mail-recipients';
import { getPublicAppBaseUrl } from '@/lib/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Generous enough for any real email, small enough that a huge paste cannot
   tie up the sanitizer. */
const MAX_HTML = 2_000_000;

export async function POST(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 }); }

  const rawHtml = String(body.html ?? '');
  if (rawHtml.length > MAX_HTML) {
    return NextResponse.json({ error: 'The email body is too large to preview.' }, { status: 413 });
  }

  /* An unrecognised source is refused rather than defaulted. Defaulting would
     let an arbitrary string pick the most permissive contract available. */
  const source = body.source ?? 'compose';
  if (!isEmailSource(source)) {
    return NextResponse.json({ error: 'Unknown email source.' }, { status: 400 });
  }
  const context = getEmailRenderContext(source, body.type as string | undefined);
  if (!context) {
    return NextResponse.json({ error: 'Unknown system email.' }, { status: 404 });
  }

  /* §6: sample data, always. A preview never reads a real user record, and
     nothing here can produce a working OTP or token. */
  const rendered = renderEmail({
    subject: String(body.subject ?? ''),
    html: rawHtml,
    supported: context.supported,
    values: context.sampleValues,
    preheader: body.preheader ? String(body.preheader) : undefined,
    origin: getPublicAppBaseUrl(),
    /* The branded frame `sendTrackedMail` applies. Without it the admin would
       be approving a bare fragment that looks nothing like what arrives. */
    wrapInChrome: true,
  });

  /* ── Campaign context (§12) ────────────────────────────────────────────
     The count comes from server-side resolution, never from the browser, and
     the individual addresses are NOT returned — a preview does not need to
     enumerate a production audience to state its size. */
  let campaign: {
    title: string; recipientCount: number | null; audienceDescription: string | null;
    status: string;
  } | null = null;

  if (source === 'campaign' && body.campaignId) {
    const found = await getMailCampaignById(String(body.campaignId)).catch(() => null);
    if (found) {
      let recipientCount: number | null = found.audiencePreviewCount ?? null;
      let audienceDescription: string | null = found.audienceDescription ?? null;
      if (found.audience.mode === 'segment') {
        const resolution = await resolveRecipients(found.audience.segment).catch(() => null);
        if (resolution) recipientCount = resolution.final;
        audienceDescription = describeSegment(found.audience.segment);
      }
      campaign = {
        title: found.title,
        recipientCount,
        audienceDescription,
        status: found.status,
      };
    }
  }

  return NextResponse.json({
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    /* Lets the UI tell the admin when sanitization removed something. */
    modified: rendered.sanitizerChanged,
    variables: {
      supported: rendered.supported,
      used: rendered.used,
      unsupported: rendered.unsupported,
      missing: rendered.missing,
    },
    sampleData: context.sampleValues,
    usesSampleData: rendered.used.length > 0,
    securitySensitive: context.securitySensitive,
    contract: context.label,
    campaign,
  });
}
