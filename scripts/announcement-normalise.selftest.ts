/**
 * The announcement normaliser accepts only what is safe to render.
 *
 * Run: npx tsx scripts/announcement-normalise.selftest.ts
 */
import { normalizeAnnouncement } from '../lib/server/homepage-config';
const cases: Array<[string, unknown, (r: ReturnType<typeof normalizeAnnouncement>) => boolean]> = [
  ['null in, null out', null, r => r === null],
  ['no text is not a banner', { text: '  ', active: true }, r => r === null],
  ['legacy style becomes a tone', { text: 'x', style: 'promo', active: true }, r => r?.tone === 'promo'],
  ['unknown style falls to neutral', { text: 'x', style: 'chartreuse', active: true }, r => r?.tone === 'neutral'],
  ['unknown kind falls to announcement', { text: 'x', kind: 'shout', active: true }, r => r?.kind === 'announcement'],
  ['javascript: href is dropped', { text: 'x', ctaHref: 'javascript:alert(1)', active: true }, r => r?.ctaHref === ''],
  ['http href is dropped', { text: 'x', ctaHref: 'http://evil.test', active: true }, r => r?.ctaHref === ''],
  ['protocol-relative href is dropped', { text: 'x', ctaHref: '//evil.test', active: true }, r => r?.ctaHref === ''],
  ['a site path is kept', { text: 'x', ctaHref: '/jobs', active: true }, r => r?.ctaHref === '/jobs'],
  ['https is kept', { text: 'x', ctaHref: 'https://docrud.com/x', active: true }, r => r?.ctaHref === 'https://docrud.com/x'],
  ['dismissible defaults to true', { text: 'x', active: true }, r => r?.dismissible === true],
  ['dismissible false is honoured', { text: 'x', dismissible: false, active: true }, r => r?.dismissible === false],
  ['active must be explicit', { text: 'x' }, r => r?.active === false],
  ['id is sanitised', { text: 'x', id: 'ab 1<script>', active: true }, r => r?.id === 'ab1script'],
  ['text is capped', { text: 'y'.repeat(900), active: true }, r => (r?.text.length ?? 0) === 400],
];
let bad = 0;
for (const [name, input, ok] of cases) {
  const r = normalizeAnnouncement(input);
  const pass = ok(r);
  if (!pass) bad++;
  console.log(`  ${pass ? '✓' : '✗'} ${name}`);
}
console.log(bad ? `\n${bad} FAILED` : `\n${cases.length} checks passed, 0 failed.`);
if (bad) process.exit(1);
console.log('ALL CHECKS PASSED');
