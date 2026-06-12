import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getPublicResumeById, requestResumeContact } from '@/lib/server/resume-directory';
import { consumeResumeConnectCredit, hasResumeConnectAccess, RESUME_CONNECT_PRICING } from '@/lib/server/resume-connect';
import { upsertResumeLeadOnUnlock } from '@/lib/server/resume-leads';

export async function POST(request: Request, context: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Login required to contact talent.' }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as any;
    const message = body?.message ? String(body.message).trim().slice(0, 600) : undefined;
    const jdText = body?.jdText ? String(body.jdText).trim().slice(0, 10_000) : undefined;

    const resumeId = context.params.id;
    const access = await hasResumeConnectAccess({ buyerUserId: session.user.id, resumeId });
    if (!access.ok) {
      return NextResponse.json(
        {
          error: 'Resume Connect required.',
          paywall: true,
          options: {
            oneTime: { amountInPaise: RESUME_CONNECT_PRICING.oneTimeAmountInPaise, label: 'One-time connect', validDays: RESUME_CONNECT_PRICING.oneTimeValidDays },
            monthlyPass: { amountInPaise: RESUME_CONNECT_PRICING.monthlyPassAmountInPaise, label: 'Monthly pass', credits: RESUME_CONNECT_PRICING.monthlyPassCredits, validDays: RESUME_CONNECT_PRICING.monthlyValidDays },
          },
        },
        { status: 402 },
      );
    }

    const result = await requestResumeContact({
      id: resumeId,
      actorUserId: session?.user?.id,
      actorEmail: session?.user?.email || undefined,
      actorName: session?.user?.name || undefined,
      message,
    });

    const consumed = await consumeResumeConnectCredit({ buyerUserId: session.user.id, purchaseId: access.purchaseId });
    if (!consumed) {
      return NextResponse.json(
        { error: 'Resume Connect credit could not be consumed. Please retry or renew.' },
        { status: 402 },
      );
    }

    // Save a lead record for the buyer dashboard (notes + progress + score snapshot).
    const entry = await getPublicResumeById(resumeId);
    if (entry) {
      const unlockedContact = (result?.contact && typeof result.contact === 'object') ? result.contact : {};
      try {
        await upsertResumeLeadOnUnlock({
          buyerUserId: session.user.id,
          entry,
          unlockedContact,
          jdText,
        });
      } catch {
        // Do not block contact unlock if lead persistence fails.
      }
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to request contact.';
    const status = /not found/i.test(message) ? 404 : /login required|unauthorized/i.test(message) ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
