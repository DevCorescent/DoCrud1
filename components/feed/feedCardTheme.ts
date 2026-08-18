/** Shared feed-card theme tokens for Task 9, category identity for Task 11. */

import type { ComponentType } from 'react';
import {
  Award,
  BarChart2,
  BookMarked,
  BookOpen,
  Briefcase,
  CalendarDays,
  ClipboardList,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Layers,
  ListChecks,
  Megaphone,
  MessageSquare,
  Newspaper,
  Package,
  Sparkles,
  Terminal,
  User,
  Video,
  Zap,
} from 'lucide-react';

export type FeedCategoryIcon = ComponentType<{ className?: string }>;

export type FeedCategoryTreatment = {
  /** Canonical key — the category id Docrud already stores. */
  key: string;
  /** Badge label. Keeps the wording Docrud already displays. */
  label: string;
  /** Icon reused from the existing Docrud category convention. */
  icon: FeedCategoryIcon;
  /** Pastel name from the specification table. */
  pastel: string;
  /** Badge treatment: tinted background + pastel text + hairline border.
   *  The icon inherits this pastel text colour. */
  badgeCls: string;
};

/**
 * Task 11 — one shared source of truth for category → label → icon → pastel.
 * Pastel names follow the specification table exactly; each is expressed as a
 * light Tailwind tint at low alpha so the badge stays subtle on the dark card.
 */
export const FEED_CATEGORY_TREATMENTS: Record<string, FeedCategoryTreatment> = {
  featured:     { key: 'featured',     label: 'Featured',     icon: Sparkles,       pastel: 'Soft Gold',       badgeCls: 'bg-amber-200/[0.10] text-amber-200/90 border-amber-200/[0.18]' },
  news:         { key: 'news',         label: 'News',         icon: Newspaper,      pastel: 'Soft Blue',       badgeCls: 'bg-blue-200/[0.10] text-blue-200/90 border-blue-200/[0.18]' },
  article:      { key: 'article',      label: 'Article',      icon: BookOpen,       pastel: 'Lavender',        badgeCls: 'bg-violet-200/[0.10] text-violet-200/90 border-violet-200/[0.18]' },
  document:     { key: 'document',     label: 'Document',     icon: FileText,       pastel: 'Cool Grey/Blue',  badgeCls: 'bg-slate-300/[0.10] text-slate-300/90 border-slate-300/[0.18]' },
  portfolio:    { key: 'portfolio',    label: 'Portfolio',    icon: Layers,         pastel: 'Soft Purple',     badgeCls: 'bg-purple-200/[0.10] text-purple-200/90 border-purple-200/[0.18]' },
  announcement: { key: 'announcement', label: 'Announcement', icon: Megaphone,      pastel: 'Soft Yellow',     badgeCls: 'bg-yellow-200/[0.10] text-yellow-200/90 border-yellow-200/[0.18]' },
  job:          { key: 'job',          label: 'Job',          icon: Briefcase,      pastel: 'Mint Green',      badgeCls: 'bg-emerald-200/[0.10] text-emerald-200/90 border-emerald-200/[0.18]' },
  resume:       { key: 'resume',       label: 'Resume',       icon: User,           pastel: 'Soft Teal',       badgeCls: 'bg-teal-200/[0.10] text-teal-200/90 border-teal-200/[0.18]' },
  product:      { key: 'product',      label: 'Product',      icon: Package,        pastel: 'Peach',           badgeCls: 'bg-orange-200/[0.10] text-orange-200/90 border-orange-200/[0.18]' },
  event:        { key: 'event',        label: 'Event',        icon: CalendarDays,   pastel: 'Soft Pink',       badgeCls: 'bg-pink-200/[0.10] text-pink-200/90 border-pink-200/[0.18]' },
  hackathon:    { key: 'hackathon',    label: 'Hackathon',    icon: Terminal,       pastel: 'Light Indigo',    badgeCls: 'bg-indigo-200/[0.10] text-indigo-200/90 border-indigo-200/[0.18]' },
  post:         { key: 'post',         label: 'Post',         icon: ImageIcon,      pastel: 'Neutral Sky',     badgeCls: 'bg-sky-200/[0.10] text-sky-200/90 border-sky-200/[0.18]' },
  poll:         { key: 'poll',         label: 'Poll',         icon: ListChecks,     pastel: 'Soft Violet',     badgeCls: 'bg-violet-300/[0.10] text-violet-300/90 border-violet-300/[0.18]' },
  survey:       { key: 'survey',       label: 'Survey',       icon: ClipboardList,  pastel: 'Pale Aqua',       badgeCls: 'bg-cyan-200/[0.10] text-cyan-200/90 border-cyan-200/[0.18]' },
  chart:        { key: 'chart',        label: 'Chart',        icon: BarChart2,      pastel: 'Light Cyan',      badgeCls: 'bg-cyan-300/[0.10] text-cyan-300/90 border-cyan-300/[0.18]' },
  thread:       { key: 'thread',       label: 'Thread',       icon: MessageSquare,  pastel: 'Soft Lilac',      badgeCls: 'bg-purple-300/[0.10] text-purple-300/90 border-purple-300/[0.18]' },
  video:        { key: 'video',        label: 'Video',        icon: Video,          pastel: 'Pale Rose',       badgeCls: 'bg-rose-200/[0.10] text-rose-200/90 border-rose-200/[0.18]' },
  milestone:    { key: 'milestone',    label: 'Milestone',    icon: Award,          pastel: 'Soft Amber',      badgeCls: 'bg-amber-300/[0.10] text-amber-300/90 border-amber-300/[0.18]' },
  tutorial:     { key: 'tutorial',     label: 'Tutorial',     icon: BookMarked,     pastel: 'Light Green',     badgeCls: 'bg-lime-200/[0.10] text-lime-200/90 border-lime-200/[0.18]' },
  gig:          { key: 'gig',          label: 'Gig',          icon: Zap,            pastel: 'Soft Coral',      badgeCls: 'bg-red-200/[0.10] text-red-200/90 border-red-200/[0.18]' },

  /* Categories named in the task list that the table does not colour and that
     Docrud does not publish today. Each reuses the closest table family so a
     future value renders correctly instead of falling back to neutral. */
  casestudy:    { key: 'casestudy',    label: 'Case Study',   icon: Layers,         pastel: 'Soft Purple',     badgeCls: 'bg-purple-200/[0.10] text-purple-200/90 border-purple-200/[0.18]' },
  research:     { key: 'research',     label: 'Research',     icon: FileText,       pastel: 'Cool Grey/Blue',  badgeCls: 'bg-slate-300/[0.10] text-slate-300/90 border-slate-300/[0.18]' },
  course:       { key: 'course',       label: 'Course',       icon: GraduationCap,  pastel: 'Light Green',     badgeCls: 'bg-lime-200/[0.10] text-lime-200/90 border-lime-200/[0.18]' },
  internship:   { key: 'internship',   label: 'Internship',   icon: Briefcase,      pastel: 'Mint Green',      badgeCls: 'bg-emerald-200/[0.10] text-emerald-200/90 border-emerald-200/[0.18]' },
  achievement:  { key: 'achievement',  label: 'Achievement',  icon: Award,          pastel: 'Soft Amber',      badgeCls: 'bg-amber-300/[0.10] text-amber-300/90 border-amber-300/[0.18]' },
};

/** Neutral fallback — unknown categories stay legible and never break styles. */
export const NEUTRAL_CATEGORY_TREATMENT: FeedCategoryTreatment = {
  key: 'other',
  label: 'Post',
  icon: Newspaper,
  pastel: 'Neutral',
  badgeCls: 'bg-white/[0.07] text-white/50 border-white/[0.10]',
};

/** Stored-value variants (case, spacing, plurals) that map to a canonical key. */
const FEED_CATEGORY_ALIASES: Record<string, string> = {
  jobs: 'job', jobpost: 'job', jobposts: 'job', hiring: 'job',
  events: 'event',
  products: 'product',
  gigs: 'gig',
  tutorials: 'tutorial',
  hackathons: 'hackathon',
  polls: 'poll',
  surveys: 'survey',
  videos: 'video',
  documents: 'document', docs: 'document', doc: 'document',
  announcements: 'announcement', announce: 'announcement',
  resumes: 'resume',
  portfolios: 'portfolio',
  articles: 'article', blog: 'article', blogs: 'article',
  posts: 'post',
  threads: 'thread',
  charts: 'chart',
  milestones: 'milestone',
  casestudies: 'casestudy', casestudys: 'casestudy',
  internships: 'internship',
  courses: 'course',
  achievements: 'achievement',
};

/** Canonical key for a stored category value. Does not change stored data. */
export function normalizeFeedCategory(category?: string): string {
  const flat = (category || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!flat) return 'post';
  const aliased = FEED_CATEGORY_ALIASES[flat] ?? flat;
  return FEED_CATEGORY_TREATMENTS[aliased] ? aliased : flat;
}

/** Shared label + icon + pastel treatment for any category value. */
export function feedCategoryTreatment(category?: string): FeedCategoryTreatment {
  return FEED_CATEGORY_TREATMENTS[normalizeFeedCategory(category)] ?? NEUTRAL_CATEGORY_TREATMENT;
}

export const FEED_AVATAR_CLS = 'bg-white/[0.08] text-white/55 ring-1 ring-white/[0.07]';

const JUNK_TITLE_RE = /\.\w{2,5}$/;
const GENERIC_TITLES = new Set([
  'post', 'poll', 'document', 'file', 'image', 'photo', 'video', 'survey', 'article', 'upload',
]);

export function isJunkFeedTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  return JUNK_TITLE_RE.test(t) || GENERIC_TITLES.has(t);
}

export function shouldShowFeedTitle(category: string, title: string): boolean {
  return category !== 'post' && !isJunkFeedTitle(title);
}

export function feedCategoryLabel(category: string): string {
  if (!category) return 'Post';
  const treatment = FEED_CATEGORY_TREATMENTS[normalizeFeedCategory(category)];
  if (treatment) return treatment.label;
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function feedDetailHref(item: { id: string; shareId?: string }): string {
  return `/published/${item.shareId || item.id}`;
}
