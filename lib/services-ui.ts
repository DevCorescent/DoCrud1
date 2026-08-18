/**
 * Shared presentation tokens for services.
 *
 * Extracted from the provider catalogue so the catalogue and the service
 * detail page speak one visual language — one category palette, one price
 * format — instead of drifting apart as copies.
 */

export const SERVICE_CATEGORIES: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  design: { label: 'Design', color: 'text-pink-400', bg: 'bg-pink-500/10 border-pink-500/20', icon: '🎨' },
  development: { label: 'Development', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', icon: '💻' },
  writing: { label: 'Writing', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: '✍️' },
  marketing: { label: 'Marketing', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', icon: '📣' },
  consulting: { label: 'Consulting', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20', icon: '🧠' },
  photography: { label: 'Photography', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', icon: '📸' },
  video: { label: 'Video', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', icon: '🎬' },
  music: { label: 'Music', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20', icon: '🎵' },
  business: { label: 'Business', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', icon: '📊' },
  legal: { label: 'Legal', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20', icon: '⚖️' },
  finance: { label: 'Finance', color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/20', icon: '💰' },
  coaching: { label: 'Coaching', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20', icon: '🏆' },
  education: { label: 'Education', color: 'text-lime-400', bg: 'bg-lime-500/10 border-lime-500/20', icon: '🎓' },
  health: { label: 'Health', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20', icon: '❤️' },
  other: { label: 'Other', color: 'text-white/50', bg: 'bg-white/[0.06] border-white/[0.10]', icon: '⭐' },
};

export function serviceCategory(key: string) {
  return SERVICE_CATEGORIES[key] ?? SERVICE_CATEGORIES.other;
}

export function currencySymbol(currency: string): string {
  return currency === 'INR' ? '₹' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
}

/**
 * The catalogue's price wording, unchanged. "contact" pricing has no number
 * to show, so it never renders a misleading zero.
 */
export function formatServicePrice(svc: {
  pricingModel: string;
  basePrice: number;
  currency: string;
}): string {
  if (svc.pricingModel === 'contact') return 'Contact for price';
  const sym = currencySymbol(svc.currency);
  const prefix = svc.pricingModel === 'starting_from' ? 'From ' : '';
  const suffix = svc.pricingModel === 'hourly' ? '/hr' : '';
  return `${prefix}${sym}${svc.basePrice.toLocaleString()}${suffix}`;
}

/** "4 days" / "2 weeks". Returns null when the provider left it unset. */
export function formatDelivery(time?: number | null, unit?: string | null): string | null {
  if (!time) return null;
  return `${time} ${unit ?? 'days'}`;
}

/** Canonical service-detail URL. */
export function serviceDetailHref(serviceId: string): string {
  return `/services/s/${serviceId}`;
}
