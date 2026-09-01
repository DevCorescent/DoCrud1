/**
 * Phase 9 — telling a candidate their application was rejected.
 *
 * Two side effects, in this order of importance:
 *   1. the application status is already saved by the caller;
 *   2. an in-app notification and an email follow.
 *
 * THE STATUS IS NEVER ROLLED BACK BECAUSE MAIL FAILED. A rejection that was
 * recorded is a fact; an SMTP outage does not un-reject anyone. So this returns
 * a report of what succeeded rather than throwing, and the caller persists the
 * status regardless.
 *
 * SENT ONCE, EVER. `rejectionEmailSentAt` on the application is the guard, and
 * the caller writes it only after a successful send — so a failure retries next
 * time, while a success can never mail the same person twice.
 *
 * It reuses the existing transactional mail path (`sendTrackedMail` + the
 * shared email chrome), so this mail is logged, rendered and tracked exactly
 * like every other system email. No second mail system.
 */
import type { HiringJobApplication } from '@/types/document';
import { sendTrackedMail } from '@/lib/server/mailer';
import { buildEmailChrome, escapeHtmlLite } from '@/lib/server/email-chrome';
import { getPublicAppBaseUrl } from '@/lib/url';

/** The shared branded wrapper, called with the shape it actually expects. */
function chromeHtml(subject: string, body: string): string {
  return buildEmailChrome({ subject, bodyHtml: body, origin: getPublicAppBaseUrl() });
}

export interface RejectionNoticeResult {
  emailSent: boolean;
  /** Safe message. Never a stack trace, never a credential. */
  emailError?: string;
  /** ISO timestamp to store on the application, only when the email went out. */
  sentAt?: string;
}

/**
 * The email body.
 *
 * Deliberately plain and short. It states the decision, names the role, and
 * says nothing about why — an automated message speculating about a hiring
 * decision would be both unkind and unfounded. Every interpolated value is
 * escaped: a job title is employer-supplied text.
 */
export function buildRejectionEmail(opts: {
  candidateName: string;
  jobTitle: string;
  organizationName: string;
}): { subject: string; html: string; text: string } {
  const name = escapeHtmlLite(opts.candidateName || 'there');
  const title = escapeHtmlLite(opts.jobTitle || 'the role');
  const org = escapeHtmlLite(opts.organizationName || 'the company');

  const subject = `Update on your application for ${opts.jobTitle || 'the role'}`;
  const body = `
    <p style="margin:0 0 14px">Hi ${name},</p>
    <p style="margin:0 0 14px">
      Thank you for applying for <strong>${title}</strong> at <strong>${org}</strong>,
      and for the time you put into your application.
    </p>
    <p style="margin:0 0 14px">
      After reviewing it, the team has decided not to move forward with your
      application for this role.
    </p>
    <p style="margin:0 0 14px">
      Your profile stays on Docrud, and you can keep applying to other roles at
      any time. We wish you the best with your search.
    </p>
  `;

  const text = [
    `Hi ${opts.candidateName || 'there'},`,
    '',
    `Thank you for applying for ${opts.jobTitle || 'the role'} at ${opts.organizationName || 'the company'}.`,
    '',
    'After reviewing it, the team has decided not to move forward with your application for this role.',
    '',
    'Your profile stays on Docrud, and you can keep applying to other roles at any time.',
  ].join('\n');

  return { subject, html: chromeHtml(subject, body), text };
}

/**
 * Send the rejection email. Never throws.
 *
 * A failure is REPORTED, not raised: the caller has already decided the
 * candidate is rejected, and an exception here would either lose that decision
 * or force the caller to write a rollback that must not exist.
 */
export async function sendRejectionEmail(
  application: Pick<HiringJobApplication,
    'candidateEmail' | 'candidateName' | 'jobTitle' | 'organizationName' | 'rejectionEmailSentAt'>,
  now = new Date().toISOString(),
): Promise<RejectionNoticeResult> {
  /* Already sent — the single most important guard in this file. */
  if (application.rejectionEmailSentAt) {
    return { emailSent: false, emailError: 'already_sent' };
  }
  const to = String(application.candidateEmail ?? '').trim();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return { emailSent: false, emailError: 'no_valid_recipient' };
  }

  try {
    const { subject, html, text } = buildRejectionEmail({
      candidateName: application.candidateName,
      jobTitle: application.jobTitle,
      organizationName: application.organizationName,
    });
    await sendTrackedMail({
      /* A dedicated policy key, so a candidate can turn hiring mail off
         without also silencing billing or security email. */
      policyKey: 'hiring_notifications',
      typeLabel: 'hiring_status',
      to,
      subject,
      text,
      html,
      preheader: 'An update on your Docrud application.',
      origin: getPublicAppBaseUrl(),
      sentBy: 'system',
    });
    return { emailSent: true, sentAt: now };
  } catch (error) {
    /* Safe message only. The status change stands regardless. */
    const message = error instanceof Error ? error.message : 'send failed';
    return { emailSent: false, emailError: message.replace(/\s+/g, ' ').slice(0, 200) };
  }
}
