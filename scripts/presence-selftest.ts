/**
 * Presence logic self-test — `npm run test:presence`.
 *
 * The project has no test runner, so this is a dependency-free assertion script
 * over the pure functions in lib/presence.ts: the 60 s online threshold, the
 * last-seen wording progression, and the logout stop marker.
 */

import {
  PRESENCE_ONLINE_THRESHOLD_MS,
  describePresence,
  formatLastSeen,
  isPresenceEnded,
  isUserOnline,
} from '../lib/presence';

const NOW = Date.parse('2026-08-10T12:00:00.000Z');
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const ago = (ms: number) => new Date(NOW - ms).toISOString();

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  → ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`);
}

console.log(`\n── online threshold (${PRESENCE_ONLINE_THRESHOLD_MS} ms) ──`);
check('30 s  → online', isUserOnline(ago(30 * SEC), NOW), true);
check('59 s  → online', isUserOnline(ago(59 * SEC), NOW), true);
check('60 s  → online', isUserOnline(ago(60 * SEC), NOW), true);
check('61 s  → offline', isUserOnline(ago(61 * SEC), NOW), false);
check('3 min → offline', isUserOnline(ago(3 * MIN), NOW), false);
check('never seen → offline', isUserOnline(null, NOW), false);
check('garbage timestamp → offline', isUserOnline('not-a-date', NOW), false);
check('future (clock skew) → online', isUserOnline(new Date(NOW + 5 * SEC).toISOString(), NOW), true);

console.log('\n── last-seen wording ──');
check('30 s', formatLastSeen(ago(30 * SEC), NOW), 'Just now');
check('59 s', formatLastSeen(ago(59 * SEC), NOW), 'Just now');
check('60 s', formatLastSeen(ago(60 * SEC), NOW), '1 min ago');
check('90 s', formatLastSeen(ago(90 * SEC), NOW), '1 min ago');
check('2 min', formatLastSeen(ago(2 * MIN), NOW), '2 mins ago');
check('59 min', formatLastSeen(ago(59 * MIN), NOW), '59 mins ago');
check('60 min', formatLastSeen(ago(60 * MIN), NOW), '1 hr ago');
check('2 hr', formatLastSeen(ago(2 * HOUR), NOW), '2 hrs ago');
check('23 h 59 m', formatLastSeen(ago(23 * HOUR + 59 * MIN), NOW), '23 hrs ago');
check('24 h', formatLastSeen(ago(DAY), NOW), '1 day ago');
check('2 d', formatLastSeen(ago(2 * DAY), NOW), '2 days ago');
check('29 d', formatLastSeen(ago(29 * DAY), NOW), '29 days ago');
check('30 d', formatLastSeen(ago(30 * DAY), NOW), '1 month ago');
check('60 d', formatLastSeen(ago(60 * DAY), NOW), '2 months ago');
check('240 d', formatLastSeen(ago(240 * DAY), NOW), '8 months ago');
check('359 d', formatLastSeen(ago(359 * DAY), NOW), '11 months ago');
check('360 d', formatLastSeen(ago(360 * DAY), NOW), '1 year ago');
check('364 d', formatLastSeen(ago(364 * DAY), NOW), '1 year ago');
check('3 y', formatLastSeen(ago(3 * 365 * DAY), NOW), '3 years ago');
check('never seen → null', formatLastSeen(null, NOW), null);

console.log('\n── forbidden strings never produced ──');
const FORBIDDEN = ['0 mins ago', '0 min ago', '24 hrs ago', '30 days ago', '0 years ago', '0 year ago', '12 months ago', '60 mins ago'];
const produced = new Set<string>();
for (let seconds = 0; seconds <= 4 * 365 * 24 * 60 * 60; seconds += 37) {
  const label = formatLastSeen(ago(seconds * SEC), NOW);
  if (label) produced.add(label);
}
for (const bad of FORBIDDEN) check(`never produces "${bad}"`, produced.has(bad), false);

console.log('\n── logout stop marker ──');
check(
  'logged out just now → presence ended',
  isPresenceEnded(ago(5 * SEC), ago(4 * SEC)),
  true,
);
check(
  'heartbeat after logout → presence not ended',
  isPresenceEnded(ago(2 * SEC), ago(30 * SEC)),
  false,
);
check('never logged out → not ended', isPresenceEnded(ago(5 * SEC), null), false);

console.log('\n── describePresence (what the UI renders) ──');
check('online + authoritative → online', describePresence(ago(10 * SEC), NOW, true).online, true);
check('online timestamp but server says offline → offline', describePresence(ago(10 * SEC), NOW, false).online, false);
check('stale timestamp but server said online → offline', describePresence(ago(5 * MIN), NOW, true).online, false);
check('offline label', describePresence(ago(5 * MIN), NOW, true).label, 'Last seen 5 mins ago');
check('logged-out user label', describePresence(ago(10 * SEC), NOW, false).label, 'Last seen Just now');
check('never seen → no label at all', describePresence(null, NOW, true).label, null);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
