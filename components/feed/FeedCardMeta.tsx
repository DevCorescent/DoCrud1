'use client';

import React from 'react';
import {
  Briefcase,
  CalendarDays,
  Clock,
  FileText,
  Globe,
  MapPin,
  Megaphone,
  Sparkles,
  Star,
  Tag,
  Target,
  Trophy,
  User,
  Users,
  Zap,
} from 'lucide-react';

export type FeedMetaChip = { icon: React.ReactNode; label: string; value: string };

const ic = (I: React.ComponentType<{ className?: string }>) => <I className="h-3 w-3" />;

const META_URL_LINE_RE = /^(Registration URL|Shop URL|WhatsApp|Application URL|Website|Contact|Email|Phone)\s*:/i;

function cleanBody(raw: string) {
  return raw
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(Apply\s*(URL|Link|Here)?|Problem\s*Statements?|Eligibility|About\s*Us|Description)\s*:[^:]*?(?=\s+\w[\w\s/]*:|$)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const KV_FIELDS: { re: RegExp; label: string; icon: React.ReactNode }[] = [
  { re: /(?:Job|Job\s*Title|Position|Role)\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i, label: 'ROLE', icon: ic(Briefcase) },
  { re: /Company\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i, label: 'COMPANY', icon: ic(Briefcase) },
  { re: /Hackathon\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i, label: 'HACKATHON', icon: ic(Zap) },
  { re: /Organisers?\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i, label: 'ORGANISER', icon: ic(User) },
  { re: /(?:Themes?(?:\s*[/]\s*Tracks?)?)\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i, label: 'TRACKS', icon: ic(Target) },
  { re: /Prize\s*Pool\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i, label: 'PRIZE POOL', icon: ic(Trophy) },
  { re: /(?:Salary|CTC|Stipend|Compensation|Package)\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i, label: 'SALARY', icon: ic(Tag) },
  { re: /Team\s*Size\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i, label: 'TEAM SIZE', icon: ic(Users) },
  { re: /(?:Location|City|Venue|Place)\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i, label: 'LOCATION', icon: ic(MapPin) },
  { re: /(?:Work\s*)?(?:Mode|Type)\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i, label: 'MODE', icon: ic(MapPin) },
  { re: /Event\s*Dates?\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i, label: 'DATE', icon: ic(CalendarDays) },
  { re: /(?:Registration\s*)?Deadline\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i, label: 'DEADLINE', icon: ic(CalendarDays) },
  { re: /Experience\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i, label: 'EXPERIENCE', icon: ic(Star) },
  { re: /Skills?\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i, label: 'SKILLS', icon: ic(Sparkles) },
  { re: /Industry\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i, label: 'INDUSTRY', icon: ic(Globe) },
];

function bylineChips(byline: string, category: string): FeedMetaChip[] {
  const parts = byline.split(/\s*·\s*/).map((s) => s.trim()).filter(Boolean);
  const chips: FeedMetaChip[] = [];
  const cat = category.toLowerCase();

  if (cat === 'news' || cat === 'article') {
    const read = parts.find((p) => /min read/i.test(p));
    if (read) chips.push({ icon: ic(Clock), label: 'READ TIME', value: read });
    return chips;
  }
  if (cat === 'document') {
    parts.forEach((p) => {
      if (/\d+\s*pages?/i.test(p)) chips.push({ icon: ic(FileText), label: 'PAGES', value: p });
      else if (/\d+.*\b(mb|kb|gb)\b/i.test(p)) chips.push({ icon: ic(Star), label: 'SIZE', value: p });
      else if (/^(pdf|docx|xlsx|pptx|zip)$/i.test(p)) chips.push({ icon: ic(FileText), label: 'FORMAT', value: p.toUpperCase() });
    });
    return chips;
  }
  if (cat === 'job') {
    if (parts[0]) chips.push({ icon: ic(Briefcase), label: 'COMPANY', value: parts[0] });
    if (parts[1]) chips.push({ icon: ic(Target), label: 'TEAM', value: parts[1] });
    if (parts[2]) chips.push({ icon: ic(MapPin), label: 'LOCATION', value: parts[2] });
    return chips;
  }
  if (cat === 'resume') {
    if (parts[0]) chips.push({ icon: ic(Briefcase), label: 'ROLE', value: parts[0] });
    const exp = parts.find((p) => /yr|year|exp/i.test(p));
    if (exp) chips.push({ icon: ic(Star), label: 'EXPERIENCE', value: exp });
    const loc = parts.find((p) => /,\s*[A-Z]{2}$/.test(p) || /\b(remote|bengaluru|mumbai|delhi|hyderabad|pune|chennai)\b/i.test(p));
    if (loc) chips.push({ icon: ic(MapPin), label: 'LOCATION', value: loc });
    return chips;
  }
  if (cat === 'event' || cat === 'hackathon') {
    if (parts[0]) chips.push({ icon: ic(User), label: 'ORGANISER', value: parts[0] });
    if (parts[1]) chips.push({ icon: ic(MapPin), label: 'VENUE', value: parts[1] });
    if (parts[2]) chips.push({ icon: ic(CalendarDays), label: 'DATE', value: parts[2] });
    return chips;
  }
  if (cat === 'announcement') {
    if (parts[0]) chips.push({ icon: ic(Megaphone), label: 'FROM', value: parts[0] });
    const reach = parts.find((p) => /sent to/i.test(p));
    if (reach) chips.push({ icon: ic(Users), label: 'REACHED', value: reach.replace(/sent to\s*/i, '') });
    return chips;
  }
  if (cat === 'product') {
    const price = parts.find((p) => /[₹$€£]/.test(p) || /month|annual|lpa/i.test(p));
    if (price) chips.push({ icon: ic(Tag), label: 'PRICING', value: price });
    const billing = parts.find((p) => /billing|annual|monthly/i.test(p));
    if (billing && billing !== price) chips.push({ icon: ic(Star), label: 'BILLING', value: billing });
    return chips;
  }
  if (cat === 'portfolio') {
    const clientPart = parts.find((p) => /^client\s*:/i.test(p));
    if (clientPart) chips.push({ icon: ic(Briefcase), label: 'CLIENT', value: clientPart.replace(/^client\s*:\s*/i, '') });
    const work = parts.find((p) => /(design|dev|engineering|ux|ui|research)/i.test(p));
    if (work) chips.push({ icon: ic(Sparkles), label: 'WORK TYPE', value: work });
    const year = parts.find((p) => /^\d{4}$/.test(p.trim()));
    if (year) chips.push({ icon: ic(CalendarDays), label: 'YEAR', value: year });
    return chips;
  }
  if (cat === 'tutorial') {
    const diff = parts.find((p) => /beginner|intermediate|advanced/i.test(p));
    if (diff) chips.push({ icon: ic(Star), label: 'LEVEL', value: diff });
    const time = parts.find((p) => /min read|steps/i.test(p));
    if (time) chips.push({ icon: ic(Clock), label: 'TIME', value: time });
    return chips;
  }
  if (cat === 'video') {
    const dur = parts.find((p) => /\d+\s*(h|m|min|hr)/i.test(p) || /^\d+h/i.test(p));
    if (dur) chips.push({ icon: ic(Clock), label: 'DURATION', value: dur });
    return chips;
  }
  return chips;
}

/** Build category-aware metadata chips. Returns [] when nothing useful exists. */
export function buildFeedMetaChips(body: string, byline: string, category: string): FeedMetaChip[] {
  const cleaned = cleanBody(body || '');
  const kvChips: FeedMetaChip[] = [];
  for (const { re, label, icon } of KV_FIELDS) {
    const m = cleaned.match(re);
    if (m) {
      const val = m[1].trim();
      if (val && val.length < 60) kvChips.push({ icon, label, value: val });
    }
  }
  if (kvChips.length >= 2) return kvChips.slice(0, 5);
  return bylineChips(byline || '', category).slice(0, 5);
}

/**
 * The publication body as written, for the card that shows all of it.
 *
 * getFeedBodySnippet() below joins every line with a space, which is right for
 * a one-line chip but destroys the author's paragraphs once "Read more" opens
 * the full text. This keeps the line structure: blank lines stay blank, runs
 * of three or more collapse to one, and only the structured metadata lines
 * (Website:, Contact:, …) are dropped, the same ones the snippet drops.
 *
 * URLs are deliberately kept — a link the author posted is part of what they
 * published, and stripping it leaves the sentence pointing at nothing.
 */
export function getFeedBodyFull(raw: string): string {
  if (!raw?.trim()) return '';
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => !META_URL_LINE_RE.test(l.trim()))
    /* Runs of spaces inside a line collapse; newlines are left alone. */
    .map((l) => l.replace(/[ \t]{2,}/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function getFeedBodySnippet(raw: string, maxLen = 180): string {
  if (!raw?.trim()) return '';
  const cleaned = raw.replace(/https?:\/\/\S+/gi, '').replace(/\s{2,}/g, ' ').trim();
  const prose = cleaned
    .split(/\n+/)
    .filter((l) => l.trim() && !META_URL_LINE_RE.test(l.trim()))
    .join(' ')
    .trim();
  // Drop pure KV metadata lines from prose when structured
  const withoutKeys = prose
    .replace(/[A-Z][A-Za-z][\w\s/()]{1,22}:\s+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const text = withoutKeys || prose;
  return text.length > maxLen ? `${text.slice(0, maxLen).trimEnd()}…` : text;
}

/** Shared chip row — single source of truth for metadata chip styling. */
export function FeedMetaChipRow({ chips }: { chips: FeedMetaChip[] }) {
  if (!chips.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span
          key={`${c.label}-${c.value}`}
          className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 backdrop-blur-sm"
        >
          <span className="shrink-0 text-white/40">{c.icon}</span>
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/30">{c.label}</span>
          <span className="max-w-[120px] truncate text-[12px] font-semibold text-white/80">{c.value}</span>
        </span>
      ))}
    </div>
  );
}

export function FeedCardMetaChips({
  body,
  byline,
  category,
  max = 5,
}: {
  body: string;
  byline: string;
  category: string;
  max?: number;
}) {
  return <FeedMetaChipRow chips={buildFeedMetaChips(body, byline, category).slice(0, max)} />;
}

/* ─── Task 10: category-specific metadata ────────────────────────────
 * Reads ONLY fields the publishing flow already writes (PublishAnythingDialog
 * `buildTextBody` labels), plus legacy byline/stats for pre-existing items.
 * Nothing is synthesised — a category shows a chip only when its field exists.
 */

export type FeedCardMetaSource = {
  category: string;
  title?: string;
  body?: string;
  byline?: string;
  chips?: string[];
  stats?: { v: string; l: string }[];
};

const DOC_EXT_RE = /\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip|rtf|odt)$/i;

/** "Key: value" metadata line. */
const KV_LINE_RE = /^[A-Za-z][A-Za-z0-9 /()]{0,28}:\s*\S/;
/** "Requirements:" style section heading with no value on the line. */
const SECTION_LINE_RE = /^[A-Za-z][A-Za-z0-9 /()]{0,28}:\s*$/;

/**
 * Description/summary for the card body once metadata is shown separately.
 * Drops the labelled metadata lines outright instead of only their labels, so
 * the body reads as prose. Returns '' when the item carries no description.
 */
export function getFeedDescription(raw: string, maxLen = 200): string {
  if (!raw?.trim()) return '';
  const prose = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !KV_LINE_RE.test(l) && !SECTION_LINE_RE.test(l) && !/^https?:\/\//i.test(l))
    .join(' ')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return prose.length > maxLen ? `${prose.slice(0, maxLen).trimEnd()}…` : prose;
}

/**
 * True when the item carries a real description. Hosts use this so the Task 10
 * layout is only adopted when there is prose to show — otherwise the card keeps
 * its existing body rendering untouched and loses nothing.
 */
export function hasFeedDescription(body?: string): boolean {
  return getFeedDescription(body || '').length > 0;
}

/**
 * Drop metadata chips whose value the card already shows in its body text, so
 * adding the metadata section never duplicates existing content.
 */
export function omitChipsPresentIn(chips: FeedMetaChip[], renderedText: string): FeedMetaChip[] {
  const hay = (renderedText || '').toLowerCase().replace(/\s+/g, ' ');
  if (!hay) return chips;
  return chips.filter((c) => !hay.includes(c.value.toLowerCase().replace(/\s+/g, ' ')));
}

/** Start of the following `Some Key:` pair — case-sensitive, so ordinary
 *  sentence words and times like "5:00 PM" are not mistaken for a new key. */
const NEXT_KEY_RE = /\s+[A-Z][A-Za-z0-9 /()]{0,22}:\s/;

/** Read a `Key: Value` line (or inline pair) written by the publish flow. */
function labelledValue(body: string, keys: string[]): string {
  for (const key of keys) {
    const match = body.match(new RegExp(`(?:^|\\n|\\s)${key}\\s*:[^\\S\\n]*`, 'i'));
    if (!match || match.index === undefined) continue;
    let rest = body.slice(match.index + match[0].length).split('\n')[0];
    const next = rest.match(NEXT_KEY_RE);
    if (next && next.index !== undefined) rest = rest.slice(0, next.index);
    const value = rest.trim().replace(/\s{2,}/g, ' ');
    if (!value || value.length > 70) continue;
    if (/^https?:\/\//i.test(value)) continue;
    return value;
  }
  return '';
}

/**
 * Task 14 — shared reader so discovery filters match on exactly the labelled
 * fields the cards display, instead of re-implementing the parsing.
 */
export function readFeedLabelledValue(body: string, keys: string[]): string {
  return labelledValue(body || '', keys);
}

/**
 * Task 12 — the one category-defining fact the spec prints directly under the
 * title (a job's company). Returns '' when the category has no such line or the
 * field is absent, so the card renders exactly as before.
 */
export function buildCategoryHighlight(src: FeedCardMetaSource): string {
  const body = src.body || '';
  switch ((src.category || '').toLowerCase()) {
    case 'job':
      return labelledValue(body, ['Company', 'Organisation', 'Organization', 'Employer']);
    default:
      return '';
  }
}

/** Renders the Task 12 category line. Nothing when there is no line to show. */
export function FeedCardCategoryLine({ text }: { text: string }) {
  if (!text) return null;
  return <p className="mt-0.5 truncate text-[12.5px] font-medium text-white/60">{text}</p>;
}

/** Build metadata for exactly the categories the spec defines. `[]` = render nothing. */
export function buildCategoryMetaChips(src: FeedCardMetaSource): FeedMetaChip[] {
  const cat = (src.category || '').toLowerCase();
  const body = src.body || '';
  const parts = (src.byline || '').split(/\s*·\s*/).map((s) => s.trim()).filter(Boolean);
  const stat = (label: RegExp) => src.stats?.find((s) => label.test(s.l))?.v ?? '';
  const chips: FeedMetaChip[] = [];
  const push = (icon: React.ReactNode, label: string, value: string) => {
    if (value) chips.push({ icon, label, value });
  };

  switch (cat) {
    case 'job': {
      push(ic(MapPin), 'LOCATION', labelledValue(body, ['Job Location', 'Location']) || (parts[2] ?? ''));
      push(ic(Briefcase), 'TYPE', labelledValue(body, ['Employment Type', 'Job Type', 'Type', 'Work Mode', 'Mode']));
      push(ic(Star), 'EXPERIENCE', labelledValue(body, ['Experience Required', 'Experience']) || (parts.find((p) => /\byrs?\b|\byears?\b/i.test(p)) ?? ''));
      break;
    }
    case 'event': {
      push(ic(CalendarDays), 'DATE', labelledValue(body, ['Event Dates?', 'Date']));
      push(ic(Clock), 'TIME', labelledValue(body, ['Time']));
      push(ic(MapPin), 'LOCATION', labelledValue(body, ['Venue', 'Location']) || labelledValue(body, ['Mode']));
      /* Task 12 — the spec's event card names the organiser next to the action. */
      push(ic(User), 'ORGANISER', labelledValue(body, ['Organisers?', 'Organizers?', 'Host']));
      break;
    }
    case 'hackathon': {
      push(ic(CalendarDays), 'DATES', labelledValue(body, ['Event Dates?', 'Date']));
      push(ic(Trophy), 'PRIZE', labelledValue(body, ['Prize Pool', 'Prize']));
      push(ic(CalendarDays), 'DEADLINE', labelledValue(body, ['Registration Deadline', 'Deadline']));
      break;
    }
    case 'product': {
      push(ic(Tag), 'PRICE', labelledValue(body, ['Price', 'Pricing']) || (parts.find((p) => /[₹$€£]/.test(p)) ?? ''));
      push(ic(Target), 'CATEGORY', labelledValue(body, ['Product Category', 'Category']));
      break;
    }
    case 'gig': {
      push(ic(Tag), 'PRICE', labelledValue(body, ['Budget', 'Price', 'Rate']));
      push(ic(Clock), 'DELIVERY', labelledValue(body, ['Delivery Time', 'Timeline', 'Delivery']));
      /* Task 12 — the spec's gig card shows where the work happens. */
      push(ic(MapPin), 'LOCATION', labelledValue(body, ['Location', 'Work Location']));
      break;
    }
    case 'tutorial': {
      push(ic(Star), 'LEVEL', labelledValue(body, ['Difficulty', 'Level']) || (parts.find((p) => /beginner|intermediate|advanced/i.test(p)) ?? ''));
      push(ic(Clock), 'TIME', labelledValue(body, ['Estimated Time', 'Duration', 'Time']) || (parts.find((p) => /min read/i.test(p)) ?? ''));
      break;
    }
    case 'video': {
      /* Same sources VideoCard already derives duration from. */
      push(
        ic(Clock),
        'DURATION',
        labelledValue(body, ['Duration'])
          || stat(/duration/i)
          || (src.chips?.find((c) => /^\d+\s*(h|hr|m|min)\b/i.test(c)) ?? '')
          || (parts.find((p) => /^\d+\s*(h|hr|m|min)\b/i.test(p)) ?? ''),
      );
      break;
    }
    case 'poll': {
      push(ic(Users), 'VOTES', stat(/votes/i) || labelledValue(body, ['Votes']));
      const pollDuration = labelledValue(body, ['Duration']);
      if (pollDuration) push(ic(Clock), 'DURATION', pollDuration);
      else push(ic(Clock), 'DAYS LEFT', stat(/days left/i));
      break;
    }
    case 'news': {
      push(ic(Globe), 'SOURCE', labelledValue(body, ['Publisher', 'Source']));
      push(ic(CalendarDays), 'DATE', labelledValue(body, ['News Date', 'Date']));
      break;
    }
    case 'document': {
      const fromBody = labelledValue(body, ['Document Type', 'Format', 'File Type']);
      const fromName = src.title?.match(DOC_EXT_RE)?.[1] ?? '';
      const fromByline = parts.find((p) => /^(pdf|docx?|xlsx?|pptx?|zip|csv|txt)$/i.test(p)) ?? '';
      push(ic(FileText), 'TYPE', fromBody || (fromName || fromByline).toUpperCase());
      break;
    }
    default:
      break;
  }

  return chips.slice(0, 4);
}
