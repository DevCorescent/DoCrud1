/**
 * Bounce and complaint self-test (Phase 14).
 *
 * The claim: a provider event reaches the EXISTING suppression store and the
 * next campaign excludes that recipient. That last step is exercised against
 * the real send loop with the transport intercepted, because a suppression
 * that does not actually stop a send is worse than none - it looks handled.
 *
 * The restraint being tested matters as much: a SOFT bounce must not suppress.
 * Permanently stopping mail to a reachable address on a temporary signal is a
 * far worse error than one extra retry.
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import {
  classifyBounce, eventKey, parseProviderEvent, applyProviderEvent,
  checkProviderEventAuth, type ProviderEvent,
} from '@/lib/server/mail-provider-events';
import {
  getSuppression, isSuppressed, getSuppressionRecords, addSuppression,
  removeSuppression, isProtectedReason,
} from '@/lib/server/mail-suppression';
import { sendMailCampaign, upsertMailCampaign, getMailCampaignById } from '@/lib/server/mail-campaigns';
import { appendEmailOutboxEvent, getEmailOutbox } from '@/lib/server/email-outbox';

let checks = 0; let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}
const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const LIB = read('lib/server/mail-provider-events.ts');
const API = read('app/api/mail/provider-events/route.ts');
const SUP = read('lib/server/mail-suppression.ts');
const MAILER = read('lib/server/mailer.ts');
const CAMPAIGNS_UI = read('components/superadmin/mail/MailCampaigns.tsx');
const OUTBOX_UI = read('components/superadmin/mail/MailOutbox.tsx');

const D = (f: string) => path.join(process.cwd(), 'data', f);
const FILES = ['mail-suppression.json', 'mail-provider-events.json', 'mail-campaigns.json',
  'email-outbox.json'];
const backups = new Map<string, string | null>();

function recordingSender() {
  const sentTo: string[] = [];
  const sender = async (input: { to: string }) => {
    sentTo.push(input.to);
    return { skipped: false, messageId: 'm', outboxId: 'o' };
  };
  return { sentTo, sender: sender as never };
}

const ev = (o: Partial<ProviderEvent>): ProviderEvent =>
  ({ type: 'bounce', email: 'x@example.com', ...o } as ProviderEvent);

async function main() {
  delete process.env.MONGODB_URI;
  for (const f of FILES) backups.set(f, existsSync(D(f)) ? readFileSync(D(f), 'utf8') : null);
  writeFileSync(D('mail-suppression.json'), JSON.stringify({ records: [] }));
  writeFileSync(D('mail-provider-events.json'), JSON.stringify({ keys: [] }));

  console.log('\n── 1. Classification ──');

  check('an explicit hard bounce is hard', classifyBounce(ev({ bounceType: 'hard' })) === 'hard');
  check('an explicit soft bounce is soft', classifyBounce(ev({ bounceType: 'soft' })) === 'soft');
  check('a 5xx code is permanent', classifyBounce(ev({ providerCode: 550 })) === 'hard');
  check('a 4xx code is temporary', classifyBounce(ev({ providerCode: 452 })) === 'soft');
  /* Guessing "permanent" would silently stop mail to a reachable address. */
  check('an unclassifiable bounce is treated as SOFT',
    classifyBounce(ev({})) === 'soft' && classifyBounce(ev({ providerCode: 999 })) === 'soft');
  check('the provider statement outranks the code',
    classifyBounce(ev({ bounceType: 'soft', providerCode: 550 })) === 'soft');
  check('no second retry classifier was written',
    !LIB.includes('nextRetryAt(') && !LIB.includes('MAX_DELIVERY_ATTEMPTS'));

  console.log('\n── 2. Payload validation ──');

  check('an unknown event type is refused',
    parseProviderEvent({ type: 'delivered', email: 'a@b.com' }) === null);
  check('a malformed address is refused',
    parseProviderEvent({ type: 'bounce', email: 'nope' }) === null);
  check('a non-object payload is refused',
    parseProviderEvent('bounce') === null && parseProviderEvent(null) === null);
  check('a valid event parses and normalizes',
    parseProviderEvent({ type: 'bounce', email: ' A@B.COM ' })?.email === 'a@b.com');
  check('the route rejects a partially invalid batch',
    API.includes("'Unknown event type or malformed event.'"));
  check('batch size is bounded', API.includes('MAX_EVENTS'));

  console.log('\n── 3. Authentication ──');

  delete process.env.MAIL_PROVIDER_WEBHOOK_SECRET;
  check('with no secret configured the endpoint is CLOSED',
    checkProviderEventAuth('anything').authorized === false);
  process.env.MAIL_PROVIDER_WEBHOOK_SECRET = 'sekret';
  check('a wrong secret is refused', !checkProviderEventAuth('nope').authorized);
  check('a missing secret is refused', !checkProviderEventAuth(null).authorized);
  check('the right secret is accepted', checkProviderEventAuth('sekret').authorized);
  check('the comparison is constant-time', LIB.includes('crypto.timingSafeEqual'));
  check('the secret is read from a header, never a query string',
    API.includes("req.headers.get('x-provider-secret')") && !API.includes('searchParams'));
  check('no secret is ever returned or logged',
    !LIB.includes('console.log') && !API.includes('secret:'));

  console.log('\n── 4. Hard bounce suppresses ──');

  const hard = await applyProviderEvent(ev({
    id: 'evt-hard-1', type: 'bounce', email: 'Hard@Example.com',
    bounceType: 'hard', providerCode: 550, provider: 'test',
  }));
  check('a hard bounce is applied', hard.permanence === 'hard' && !hard.duplicate);
  check('it suppresses the recipient', hard.suppressed && await isSuppressed('hard@example.com'));
  check('the reason is hard_bounce',
    (await getSuppression('hard@example.com'))?.reason === 'hard_bounce');
  check('the address is normalized',
    (await getSuppression('HARD@EXAMPLE.COM'))?.email === 'hard@example.com');
  check('it uses the existing suppression store, not a new one',
    LIB.includes("from '@/lib/server/mail-suppression'") && LIB.includes('addSuppression('));

  console.log('\n── 5. Soft bounce does NOT suppress ──');

  const soft = await applyProviderEvent(ev({
    id: 'evt-soft-1', type: 'bounce', email: 'soft@example.com',
    bounceType: 'soft', providerCode: 452,
  }));
  check('a soft bounce is recorded', !soft.duplicate && soft.permanence === 'soft');
  check('a soft bounce does not suppress',
    !soft.suppressed && !(await isSuppressed('soft@example.com')));
  check('it touches no delivery record', soft.deliveriesUpdated === 0);
  /* Asserted as behaviour: a soft bounce must not reach the delivery records
     or the suppression store at all. */
  check('existing retry rules stay authoritative',
    soft.deliveriesUpdated === 0 && !soft.suppressed
    && LIB.includes("if (permanence === 'hard' || event.type === 'complaint')"));

  console.log('\n── 6. Complaint ──');

  const complaint = await applyProviderEvent(ev({
    id: 'evt-c-1', type: 'complaint', email: 'angry@example.com', provider: 'test',
  }));
  check('a complaint suppresses', complaint.suppressed);
  check('the reason is complaint',
    (await getSuppression('angry@example.com'))?.reason === 'complaint');
  check('a complaint is not a bounce', complaint.permanence === null);
  /* Re-mailing someone who reported spam is both a breach of their signal and
     a fast way to lose sending reputation. */
  check('a complaint cannot be lifted by an admin',
    !(await removeSuppression('angry@example.com', 'admin')).ok
    && isProtectedReason('complaint'));
  check('a hard bounce CAN be lifted, being a fact about an address',
    !isProtectedReason('hard_bounce'));

  console.log('\n── 7. Idempotency ──');

  const before = (await getSuppressionRecords()).length;
  const again = await applyProviderEvent(ev({
    id: 'evt-hard-1', type: 'bounce', email: 'Hard@Example.com',
    bounceType: 'hard', providerCode: 550,
  }));
  check('a repeated event is recognised', again.duplicate);
  check('it does not suppress again', !again.suppressed);
  check('no duplicate suppression record',
    (await getSuppressionRecords()).length === before);
  check('it touches no outbox row or delivery',
    !again.outboxUpdated && again.deliveriesUpdated === 0);
  check('a duplicate is not audited again', API.includes('if (!applied.duplicate'));
  /* Without a provider id, the key must still be stable for a redelivery. */
  const noId = { type: 'bounce' as const, email: 'k@example.com', providerCode: 550,
    occurredAt: '2026-01-01T00:00:00.000Z' };
  check('an event with no id gets a deterministic key',
    eventKey(noId) === eventKey({ ...noId }));
  check('a different occurrence gets a different key',
    eventKey(noId) !== eventKey({ ...noId, occurredAt: '2026-01-02T00:00:00.000Z' }));

  console.log('\n── 8. Outbox and delivery records ──');

  writeFileSync(D('email-outbox.json'), JSON.stringify({ events: [] }));
  await appendEmailOutboxEvent({
    id: 'ob-bounce', createdAt: new Date().toISOString(), status: 'sent', type: 'system',
    to: 'bouncer@example.com', subject: 'S', tracking: { opens: 0, clicks: 0 },
  } as never);
  const withRow = await applyProviderEvent(ev({
    id: 'evt-ob-1', type: 'bounce', email: 'bouncer@example.com',
    bounceType: 'hard', providerCode: 550, message: 'User unknown',
  }));
  check('the outbox row is updated', withRow.outboxUpdated);
  const row = (await getEmailOutbox(50)).find((r) => r.id === 'ob-bounce');
  check('the provider event is recorded on the existing row',
    row?.providerEvent === 'hard_bounce');
  check('the provider code and message are preserved',
    row?.providerEventCode === 550 && row?.providerEventMessage === 'User unknown');
  /* The provider DID accept it; rewriting that erases what happened at send. */
  check('the send status is not rewritten', row?.status === 'sent');
  check('no second event log was created',
    !LIB.includes('appendEmailOutboxEvent') && !LIB.includes('createOutboundEmailId'));
  check('the outbox UI shows the event without claiming delivery',
    OUTBOX_UI.includes('HARD BOUNCE') && OUTBOX_UI.includes('COMPLAINT')
    && !/\b(was delivered|delivery confirmed)\b/i.test(OUTBOX_UI));

  console.log('\n── 9. Future campaigns exclude the recipient ──');

  writeFileSync(D('mail-campaigns.json'), JSON.stringify({ campaigns: [] }));
  await upsertMailCampaign({
    id: 'bnc-1', title: 'T', subject: 'S', text: 'body', html: '<p>b</p>',
    audience: { mode: 'emails',
      emails: ['hard@example.com', 'angry@example.com', 'soft@example.com', 'ok@example.com'] },
    status: 'scheduled', createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as never);
  const run = recordingSender();
  await sendMailCampaign('bnc-1', 'https://example.test', 'admin', run.sender);
  check('a hard-bounced recipient is not mailed again',
    !run.sentTo.includes('hard@example.com'), run.sentTo.join(','));
  check('a complainant is not mailed again',
    !run.sentTo.includes('angry@example.com'));
  /* The restraint: a soft bounce must NOT have stopped this send. */
  check('a soft-bounced recipient is still mailed',
    run.sentTo.includes('soft@example.com'));
  check('unaffected recipients are still mailed', run.sentTo.includes('ok@example.com'));
  check('exactly the eligible recipients were mailed', run.sentTo.length === 2);
  const after = await getMailCampaignById('bnc-1');
  check('suppressed recipients are counted apart from failures',
    (after?.progress?.suppressed ?? 0) === 2 && (after?.progress?.failed ?? 0) === 0);

  console.log('\n── 10. Nothing else regressed ──');

  await addSuppression({
    email: 'opted@example.com', reason: 'unsubscribe', actor: 'recipient',
    source: 'unsubscribe_link',
  });
  check('unsubscribe still works', await isSuppressed('opted@example.com'));
  check('unsubscribe is still protected',
    !(await removeSuppression('opted@example.com', 'admin')).ok);
  /* A provider event must not overwrite a person's own stated choice. */
  await applyProviderEvent(ev({
    id: 'evt-x', type: 'bounce', email: 'opted@example.com', bounceType: 'hard',
  }));
  check('a bounce does not downgrade an unsubscribe',
    (await getSuppression('opted@example.com'))?.reason === 'unsubscribe');
  check('an admin suppression can still be lifted',
    await (async () => {
      await addSuppression({ email: 'adm@example.com', reason: 'admin_suppressed',
        actor: 'admin', source: 'admin' });
      return (await removeSuppression('adm@example.com', 'admin')).ok;
    })());
  check('transactional mail is still unaffected',
    !MAILER.includes('mail-suppression') && !MAILER.includes('mail-provider-events'));
  /* The gap this covers: the store allowed lifting a hard bounce while the UI
     hardcoded `admin_suppressed`, so it offered no button the store would have
     accepted. Removability is now decided once, on the server. */
  check('removability is decided by the server, not guessed in the UI',
    read('app/api/super-admin/mail/suppression/route.ts')
      .includes('removable: r.active && !isProtectedReason(r.reason)')
    && read('components/superadmin/mail/MailSuppression.tsx').includes('{row.removable ? ('));
  check('the new reasons are filterable and labelled',
    read('app/api/super-admin/mail/suppression/route.ts').includes("'hard_bounce', 'complaint'")
    && read('components/superadmin/mail/MailSuppression.tsx').includes("'Hard bounce'"));
  check('the campaign detail separates events from failures',
    CAMPAIGNS_UI.includes('Provider events and suppression')
    && CAMPAIGNS_UI.includes('These are separate from failures'));

  backups.forEach((v, f) => {
    if (v !== null) writeFileSync(D(f), v);
    else if (existsSync(D(f))) unlinkSync(D(f));
  });
  console.log(failures === 0
    ? `\n✅ ${checks}/${checks} checks passed`
    : `\n❌ ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  backups.forEach((v, f) => { if (v !== null) writeFileSync(D(f), v); });
  console.error(err); process.exit(1);
});
