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
  const chips = buildFeedMetaChips(body, byline, category).slice(0, max);
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
