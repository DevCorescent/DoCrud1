/** Shared feed-card theme tokens for Task 9. */

export const FEED_TAG_CLS: Record<string, string> = {
  featured:     'bg-amber-500/10 text-amber-400 border-amber-500/20',
  news:         'bg-red-500/10 text-red-400 border-red-500/20',
  article:      'bg-violet-500/10 text-violet-400 border-violet-500/20',
  document:     'bg-slate-500/10 text-slate-300 border-slate-500/20',
  portfolio:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  announcement: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  job:          'bg-blue-500/10 text-blue-400 border-blue-500/20',
  resume:       'bg-sky-500/10 text-sky-400 border-sky-500/20',
  product:      'bg-purple-500/10 text-purple-400 border-purple-500/20',
  event:        'bg-pink-500/10 text-pink-400 border-pink-500/20',
  hackathon:    'bg-orange-500/10 text-orange-400 border-orange-500/20',
  gig:          'bg-white/[0.08] text-white/70 border-white/[0.10]',
  all:          'bg-white/10 text-white/70 border-white/10',
  post:         'bg-rose-500/10 text-rose-400 border-rose-500/20',
  poll:         'bg-violet-500/10 text-violet-400 border-violet-500/20',
  survey:       'bg-amber-500/10 text-amber-400 border-amber-500/20',
  chart:        'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  thread:       'bg-sky-500/10 text-sky-400 border-sky-500/20',
  video:        'bg-red-500/10 text-red-400 border-red-500/20',
  milestone:    'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  tutorial:     'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
};

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
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function feedDetailHref(item: { id: string; shareId?: string }): string {
  return `/published/${item.shareId || item.id}`;
}
