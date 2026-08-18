'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Briefcase,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit2,
  Eye,
  EyeOff,
  ExternalLink,
  Filter,
  Globe,
  LayoutGrid,
  List,
  MapPin,
  MessageSquare,
  Palette,
  Pencil,
  Plus,
  Save,
  Search,
  Settings2,
  Share2,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import InfinityUpgradeModal from '@/components/InfinityUpgradeModal';
import ServiceEnquiryModal from '@/components/services/ServiceEnquiryModal';
import ServiceBookingWizard from '@/components/services/ServiceBookingWizard';
import SaveServiceButton from '@/components/services/SaveServiceButton';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface ServicePackage {
  name: string;
  description: string;
  price: number;
  deliveryTime: number;
  deliveryUnit: string;
  features: string[];
}

interface Service {
  id: string;
  title: string;
  tagline: string;
  description: string;
  category: string;
  tags: string[];
  pricingModel: string;
  basePrice: number;
  currency: string;
  packages?: ServicePackage[];
  deliveryTime?: number;
  deliveryUnit?: string;
  imageUrl?: string;
  faqs?: Array<{ question: string; answer: string }>;
  isActive: boolean;
  featured: boolean;
  bookingCount: number;
  rating: number;
  reviewCount: number;
  createdAt: string;
}

interface ServiceReview {
  id: string;
  serviceId: string;
  bookingId: string;
  reviewerId: string;
  reviewerName: string;
  reviewerAvatar?: string;
  rating: number;
  headline: string;
  body: string;
  testimonial?: string;
  createdAt: string;
}

interface CatalogueSettings {
  headline?: string;
  subheadline?: string;
  accentColor?: string;
  accentColorSecondary?: string;
  gridColumns?: 2 | 3 | 4;
  cardStyle?: 'default' | 'minimal' | 'detailed';
  showBio?: boolean;
  showWhyBook?: boolean;
  showStats?: boolean;
  ctaText?: string;
  heroLayout?: 'default' | 'centered' | 'minimal';
  bannerOverlayOpacity?: number;
  catalogueBannerUrl?: string;
  catalogueAvatarUrl?: string;
  chatEnabled?: boolean;
}

interface ProviderProfile {
  isOwnProfile?: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    accountType?: string;
    createdAt: string;
  };
  profile: {
    headline?: string;
    bio?: string;
    location?: string;
    website?: string;
    avatarUrl?: string;
    avatarPosition?: string;
    bannerUrl?: string;
    coverGradient?: string;
    skills?: string[];
    docrudGo?: boolean;
    socialLinks?: {
      twitter?: string;
      linkedin?: string;
      github?: string;
      instagram?: string;
      youtube?: string;
    };
  };
  stats: {
    followers: number;
    following: number;
    publishedCount: number;
    gigsCount: number;
  };
}

/* ─── Constants ─────────────────────────────────────────────────────── */
const SERVICE_CATEGORIES: Record<string, { label: string; color: string; bg: string; icon: string }> = {
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

const COVER_GRADIENTS = [
  'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
  'linear-gradient(135deg, #0d0d0d, #1a1a2e, #16213e)',
  'linear-gradient(135deg, #1a0533, #0d0d2b, #040d21)',
  'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
  'linear-gradient(135deg, #16001e, #2a0845, #160029)',
  'linear-gradient(135deg, #000000, #0a0a0a, #1c1c1c)',
  'linear-gradient(135deg, #0a0a0a, #1a0a00, #0f0500)',
  'linear-gradient(135deg, #020024, #090979, #00d4ff22)',
];

const ACCENT_PRESETS = [
  { label: 'Indigo', a: '#6366f1', b: '#8b5cf6' },
  { label: 'Violet', a: '#8b5cf6', b: '#a78bfa' },
  { label: 'Blue', a: '#3b82f6', b: '#60a5fa' },
  { label: 'Cyan', a: '#06b6d4', b: '#22d3ee' },
  { label: 'Emerald', a: '#10b981', b: '#34d399' },
  { label: 'Rose', a: '#f43f5e', b: '#fb7185' },
  { label: 'Amber', a: '#f59e0b', b: '#fbbf24' },
  { label: 'Pink', a: '#ec4899', b: '#f472b6' },
];

function getGradient(userId: string) {
  return COVER_GRADIENTS[userId.charCodeAt(0) % COVER_GRADIENTS.length];
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function accentGradient(settings: CatalogueSettings) {
  const a = settings.accentColor ?? '#6366f1';
  const b = settings.accentColorSecondary ?? '#8b5cf6';
  return `linear-gradient(135deg,${a},${b})`;
}

function formatPrice(svc: Service) {
  if (svc.pricingModel === 'contact') return 'Contact for price';
  const sym = svc.currency === 'INR' ? '₹' : svc.currency === 'EUR' ? '€' : svc.currency === 'GBP' ? '£' : '$';
  const prefix = svc.pricingModel === 'starting_from' ? 'From ' : '';
  const suffix = svc.pricingModel === 'hourly' ? '/hr' : '';
  return `${prefix}${sym}${svc.basePrice.toLocaleString()}${suffix}`;
}

/* ─── Star Row ──────────────────────────────────────────────────────── */
function StarRow({ rating, interactive = false, onChange }: { rating: number; interactive?: boolean; onChange?: (n: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(n => (
        <button key={n} type={interactive ? 'button' : undefined} disabled={!interactive}
          onClick={() => interactive && onChange?.(n)}
          className={interactive ? 'transition-transform hover:scale-110 active:scale-95' : 'cursor-default'}>
          <Star className={`h-4 w-4 ${n <= Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-white/15'}`} />
        </button>
      ))}
    </div>
  );
}

/* ─── Service Detail Modal ──────────────────────────────────────────── */
function ServiceDetailModal({ service, reviews, onClose, onBook }: { service: Service; reviews: ServiceReview[]; onClose: () => void; onBook: () => void }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const cat = SERVICE_CATEGORIES[service.category] ?? SERVICE_CATEGORIES.other;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl bg-[#0E0E10] border border-white/[0.09] rounded-[28px] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.95)] flex flex-col max-h-[90vh]">
        {/* Image / gradient hero */}
        <div className="relative h-52 shrink-0 overflow-hidden">
          {service.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={service.imageUrl} alt={service.title} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 55%, #24243e 100%)' }}>
              <span className="text-7xl opacity-50">{cat.icon}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0E0E10] via-[#0E0E10]/30 to-transparent" />
          <button onClick={onClose} className="absolute top-4 right-4 h-8 w-8 rounded-full border border-white/[0.15] bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors">
            <X className="h-4 w-4 text-white/80" />
          </button>
          {service.featured && (
            <div className="absolute top-4 left-4 flex items-center gap-1 rounded-full px-2.5 py-1 text-[9.5px] font-black uppercase tracking-wider" style={{ background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#ffffff' }}>
              <Star className="h-2.5 w-2.5" /> Featured
            </div>
          )}
          {/* Category badge overlapping image */}
          <div className="absolute bottom-4 left-5">
            <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[10.5px] font-bold backdrop-blur-sm ${cat.bg} ${cat.color}`}>
              {cat.icon} {cat.label}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto [scrollbar-width:none] px-6 py-5">
          {/* Title & tags */}
          <h2 className="font-black text-white text-[20px] leading-tight mb-2">{service.title}</h2>
          {service.tagline && <p className="text-[13px] text-white/50 mb-4">{service.tagline}</p>}

          {service.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {service.tags.map(t => (
                <span key={t} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-0.5 text-[11px] text-white/45">{t}</span>
              ))}
            </div>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-4 mb-5 p-3.5 rounded-[16px] border border-white/[0.06] bg-white/[0.02]">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-white/30" />
              <span className="text-[12px] text-white/50">{service.deliveryTime ? `${service.deliveryTime} ${service.deliveryUnit ?? 'days'}` : 'Flexible'}</span>
            </div>
            {service.bookingCount > 0 && (
              <div className="flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-white/30" />
                <span className="text-[12px] text-white/50">{service.bookingCount} booked</span>
              </div>
            )}
            {service.pricingModel !== 'contact' && (
              <div className="ml-auto">
                <p className="text-[16px] font-black text-white/90">{formatPrice(service)}</p>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="mb-6">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/35 mb-3">About this Service</h3>
            <p className="text-[13px] text-white/60 leading-relaxed whitespace-pre-line">{service.description}</p>
          </div>

          {/* Packages */}
          {service.packages && service.packages.length > 0 && (
            <div className="mb-6">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/35 mb-3">Packages</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {service.packages.map((pkg, i) => {
                  const pkgColors = ['border-slate-500/25 bg-slate-500/5', 'border-violet-500/30 bg-violet-500/8', 'border-amber-500/25 bg-amber-500/5'];
                  const headerColors = ['bg-slate-500/15 text-slate-300', 'bg-violet-500/20 text-violet-300', 'bg-amber-500/15 text-amber-300'];
                  return (
                    <div key={pkg.name} className={`rounded-[18px] border overflow-hidden ${pkgColors[i % 3]}`}>
                      <div className={`px-4 py-2.5 text-center font-bold text-[12px] ${headerColors[i % 3]}`}>{pkg.name}</div>
                      <div className="px-4 py-3.5">
                        <p className="text-[20px] font-black text-white/90 text-center mb-1">
                          {service.currency === 'INR' ? '₹' : service.currency === 'EUR' ? '€' : service.currency === 'GBP' ? '£' : '$'}{pkg.price.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-white/30 text-center mb-3">{pkg.deliveryTime} {pkg.deliveryUnit} delivery</p>
                        <p className="text-[11px] text-white/45 text-center mb-3 line-clamp-2">{pkg.description}</p>
                        {pkg.features.length > 0 && (
                          <div className="space-y-1.5">
                            {pkg.features.map(f => (
                              <div key={f} className="flex items-start gap-2">
                                <div className="h-3.5 w-3.5 shrink-0 mt-0.5 rounded-full flex items-center justify-center bg-emerald-500/20">
                                  <Check className="h-2 w-2 text-emerald-400" />
                                </div>
                                <span className="text-[10.5px] text-white/50">{f}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* FAQs */}
          {service.faqs && service.faqs.length > 0 && (
            <div className="mb-6">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/35 mb-3">Frequently Asked Questions</h3>
              <div className="space-y-2">
                {service.faqs.map((faq, i) => (
                  <div key={i} className="rounded-[14px] border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                    <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)}
                      className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-white/[0.03] transition-colors">
                      <span className="text-[13px] font-semibold text-white/80 pr-4">{faq.question}</span>
                      {openFaq === i ? <ChevronUp className="h-4 w-4 shrink-0 text-white/30" /> : <ChevronDown className="h-4 w-4 shrink-0 text-white/30" />}
                    </button>
                    {openFaq === i && (
                      <div className="px-4 pb-4">
                        <p className="text-[12px] text-white/50 leading-relaxed">{faq.answer}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Reviews & Testimonials */}
          {reviews.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">Reviews & Testimonials</h3>
                <div className="flex items-center gap-2">
                  <StarRow rating={service.rating} />
                  <span className="text-[11px] text-white/40">{service.rating} · {reviews.length} review{reviews.length !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* Testimonial carousel */}
              {reviews.filter(r => r.testimonial).length > 0 && (
                <div className="mb-4 rounded-[18px] border border-amber-500/15 bg-gradient-to-br from-amber-500/[0.07] to-transparent p-4 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-500/60 mb-2">✦ Featured Testimonials</p>
                  {reviews.filter(r => r.testimonial).map(r => (
                    <div key={r.id} className="flex items-start gap-3">
                      <div className="h-7 w-7 shrink-0 rounded-full overflow-hidden bg-white/[0.08] flex items-center justify-center ring-1 ring-amber-500/20">
                        {r.reviewerAvatar
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={r.reviewerAvatar} alt={r.reviewerName} className="h-full w-full object-cover" />
                          : <span className="text-[10px] font-bold text-amber-400/70">{r.reviewerName.charAt(0).toUpperCase()}</span>}
                      </div>
                      <div>
                        <p className="text-[12.5px] text-amber-100/75 italic leading-relaxed">"{r.testimonial}"</p>
                        <p className="text-[10px] text-white/30 mt-1">— {r.reviewerName}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Review list */}
              <div className="space-y-3">
                {reviews.map(rev => (
                  <div key={rev.id} className="rounded-[16px] border border-white/[0.06] bg-white/[0.02] p-4">
                    <div className="flex items-start gap-3 mb-2.5">
                      <div className="h-8 w-8 shrink-0 rounded-full overflow-hidden bg-white/[0.08] flex items-center justify-center ring-1 ring-white/[0.08]">
                        {rev.reviewerAvatar
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={rev.reviewerAvatar} alt={rev.reviewerName} className="h-full w-full object-cover" />
                          : <span className="text-[11px] font-bold text-white/50">{rev.reviewerName.charAt(0).toUpperCase()}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-bold text-white/80">{rev.reviewerName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <StarRow rating={rev.rating} />
                          <span className="text-[9.5px] text-white/30">{new Date(rev.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-[12.5px] font-semibold text-white/75 mb-1">{rev.headline}</p>
                    <p className="text-[12px] text-white/50 leading-relaxed">{rev.body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer CTA */}
        <div className="px-6 py-4 border-t border-white/[0.06] flex gap-3 shrink-0">
          <button onClick={onClose} className="h-11 px-5 rounded-[13px] border border-white/[0.09] text-white/55 text-[13px] font-semibold hover:bg-white/[0.05] transition-all">
            Close
          </button>
          {/* §26 Save Service */}
          <SaveServiceButton serviceId={service.id} variant="full" className="h-11 px-4 shrink-0" />
          <button onClick={() => { onClose(); onBook(); }}
            className="flex-1 h-11 rounded-[13px] font-black text-[13px] text-white transition-all active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.40)' }}>
            Book This Service
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Service Edit Modal ────────────────────────────────────────────── */
type ServiceDraft = {
  title: string; tagline: string; description: string; category: string;
  tags: string[]; pricingModel: string; basePrice: number; currency: string;
  deliveryTime: number; deliveryUnit: string; isActive: boolean; featured: boolean; imageUrl: string;
};
function ServiceEditModal({ service, onClose, onSaved, onDeleted }: {
  service: Service | null; // null = new
  onClose: () => void;
  onSaved: (svc: Service) => void;
  onDeleted?: (id: string) => void;
}) {
  const isNew = service === null;
  const [draft, setDraft] = useState<ServiceDraft>({
    title: service?.title ?? '',
    tagline: service?.tagline ?? '',
    description: service?.description ?? '',
    category: service?.category ?? 'design',
    tags: service?.tags ?? [],
    pricingModel: service?.pricingModel ?? 'fixed',
    basePrice: service?.basePrice ?? 0,
    currency: service?.currency ?? 'USD',
    deliveryTime: service?.deliveryTime ?? 3,
    deliveryUnit: service?.deliveryUnit ?? 'days',
    isActive: service?.isActive ?? true,
    featured: service?.featured ?? false,
    imageUrl: service?.imageUrl ?? '',
  });
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');
  const [showInfinityModal, setShowInfinityModal] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      const payload = { ...draft, tags: draft.tags, basePrice: Number(draft.basePrice) };
      const res = await fetch(isNew ? '/api/services' : `/api/services/${service!.id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json() as { service?: Service; error?: string; code?: string };
      if (res.status === 403 && d.code === 'INFINITY_REQUIRED') { setShowInfinityModal(true); return; }
      if (!res.ok || !d.service) { setErr(d.error ?? 'Failed to save'); return; }
      onSaved(d.service);
      onClose();
    } catch { setErr('Network error. Try again.'); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!service || !onDeleted) return;
    if (!confirm(`Delete "${service.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/services/${service.id}`, { method: 'DELETE' });
      onDeleted(service.id);
      onClose();
    } catch { setErr('Delete failed.'); }
    finally { setDeleting(false); }
  }

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !draft.tags.includes(t)) setDraft(d => ({ ...d, tags: [...d.tags, t] }));
    setTagInput('');
  };

  const inp = 'w-full rounded-[11px] border border-white/[0.09] bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-white placeholder-white/20 outline-none focus:border-violet-500/50 focus:bg-violet-500/[0.03] transition-all';
  const lbl = 'block text-[10.5px] font-semibold text-white/40 mb-1.5 uppercase tracking-wide';

  return (
    <>
    {showInfinityModal && <InfinityUpgradeModal feature="services_limit" onClose={() => setShowInfinityModal(false)} />}
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-10 overflow-y-auto">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl bg-[#111113] border border-white/[0.09] rounded-[24px] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.95)] mb-10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07]">
          <div>
            <h3 className="font-bold text-white text-[15px]">{isNew ? 'Add New Service' : 'Edit Service'}</h3>
            <p className="text-[11px] text-white/35 mt-0.5">{isNew ? 'Create a new service listing' : `Editing: ${service!.title}`}</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.10] transition">
            <X className="h-4 w-4 text-white/60" />
          </button>
        </div>
        <form onSubmit={handleSave} className="px-6 py-6 space-y-5">
          {/* Title + Tagline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Title *</label>
              <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} required placeholder="e.g. Brand Identity Design" className={inp} />
            </div>
            <div>
              <label className={lbl}>Tagline</label>
              <input value={draft.tagline} onChange={e => setDraft(d => ({ ...d, tagline: e.target.value }))} placeholder="Short hook line" className={inp} />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={lbl}>Description *</label>
            <textarea value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} required rows={4} placeholder="Describe what you offer, what's included, and why clients should choose you."
              className={`${inp} resize-none`} />
          </div>

          {/* Category + Pricing */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className={lbl}>Category</label>
              <select value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))} className={`${inp} bg-[#111113]`}>
                {Object.entries({ design: '🎨 Design', development: '💻 Development', writing: '✍️ Writing', marketing: '📣 Marketing', consulting: '🧠 Consulting', photography: '📸 Photography', video: '🎬 Video', music: '🎵 Music', business: '📊 Business', legal: '⚖️ Legal', finance: '💰 Finance', coaching: '🏆 Coaching', education: '🎓 Education', health: '❤️ Health', other: '⭐ Other' }).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>Pricing</label>
              <select value={draft.pricingModel} onChange={e => setDraft(d => ({ ...d, pricingModel: e.target.value }))} className={`${inp} bg-[#111113]`}>
                <option value="fixed">Fixed</option>
                <option value="hourly">Hourly</option>
                <option value="starting_from">Starting from</option>
                <option value="contact">Contact</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Currency</label>
              <select value={draft.currency} onChange={e => setDraft(d => ({ ...d, currency: e.target.value }))} className={`${inp} bg-[#111113]`}>
                <option value="USD">USD $</option>
                <option value="INR">INR ₹</option>
                <option value="EUR">EUR €</option>
                <option value="GBP">GBP £</option>
              </select>
            </div>
          </div>

          {/* Price + Delivery */}
          <div className="grid grid-cols-3 gap-3">
            {draft.pricingModel !== 'contact' && (
              <div>
                <label className={lbl}>Price</label>
                <input type="number" min={0} value={draft.basePrice} onChange={e => setDraft(d => ({ ...d, basePrice: Number(e.target.value) }))} className={inp} />
              </div>
            )}
            <div>
              <label className={lbl}>Delivery time</label>
              <input type="number" min={1} value={draft.deliveryTime} onChange={e => setDraft(d => ({ ...d, deliveryTime: Number(e.target.value) }))} className={inp} />
            </div>
            <div>
              <label className={lbl}>Unit</label>
              <select value={draft.deliveryUnit} onChange={e => setDraft(d => ({ ...d, deliveryUnit: e.target.value }))} className={`${inp} bg-[#111113]`}>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
                <option value="weeks">Weeks</option>
                <option value="months">Months</option>
              </select>
            </div>
          </div>

          {/* Image URL */}
          <div>
            <label className={lbl}>Cover image URL <span className="text-white/20 normal-case font-normal">(optional)</span></label>
            <input value={draft.imageUrl} onChange={e => setDraft(d => ({ ...d, imageUrl: e.target.value }))} placeholder="https://..." className={inp} />
          </div>

          {/* Tags */}
          <div>
            <label className={lbl}>Tags</label>
            <div className="flex gap-2">
              <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} placeholder="Add tag + Enter" className={`${inp} flex-1`} />
              <button type="button" onClick={addTag} className="rounded-[11px] border border-white/[0.09] bg-white/[0.05] px-3.5 text-[12px] font-semibold text-white/55 hover:text-white hover:bg-white/[0.09] transition">Add</button>
            </div>
            {draft.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {draft.tags.map(t => (
                  <span key={t} className="flex items-center gap-1 rounded-full border border-white/[0.09] bg-white/[0.05] pl-2.5 pr-1.5 py-0.5 text-[11px] text-white/55">
                    {t}
                    <button type="button" onClick={() => setDraft(d => ({ ...d, tags: d.tags.filter(x => x !== t) }))} className="text-white/30 hover:text-white/70"><X className="h-2.5 w-2.5" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-4 pt-2">
            {[
              { key: 'isActive' as const, label: 'Active (visible)', color: 'emerald' },
              { key: 'featured' as const, label: 'Featured', color: 'amber' },
            ].map(({ key, label, color }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                <div className={`relative h-5 w-9 rounded-full transition-colors ${draft[key] ? (color === 'emerald' ? 'bg-emerald-500/70' : 'bg-amber-500/70') : 'bg-white/[0.10]'}`}
                  onClick={() => setDraft(d => ({ ...d, [key]: !d[key] }))}>
                  <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${draft[key] ? 'left-[18px]' : 'left-0.5'}`} />
                </div>
                <span className="text-[12px] text-white/55">{label}</span>
              </label>
            ))}
          </div>

          {err && <p className="text-[12px] text-red-400">{err}</p>}

          {/* Footer buttons */}
          <div className="flex items-center gap-3 pt-2 border-t border-white/[0.06]">
            {!isNew && onDeleted && (
              <button type="button" onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-1.5 rounded-[11px] border border-red-500/25 bg-red-500/10 px-3.5 py-2 text-[12px] font-semibold text-red-400 hover:bg-red-500/20 transition disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" /> {deleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
            <div className="ml-auto flex gap-2.5">
              <button type="button" onClick={onClose} className="rounded-[11px] border border-white/[0.09] bg-white/[0.04] px-4 py-2 text-[12.5px] font-semibold text-white/55 hover:text-white transition">Cancel</button>
              <button type="submit" disabled={saving}
                className="flex items-center gap-1.5 rounded-[11px] px-5 py-2 text-[12.5px] font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                <Save className="h-3.5 w-3.5" /> {saving ? 'Saving…' : isNew ? 'Create Service' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
    </>
  );
}

/* ─── Service Card (Grid) ───────────────────────────────────────────── */
function ServiceCard({ service, reviews, shared, editMode, settings, onView, onBook, onEnquire, onShare, onEdit, onToggleActive, onToggleFeatured }: {
  service: Service; reviews: ServiceReview[]; shared: boolean; editMode: boolean; settings: CatalogueSettings;
  onView: () => void; onBook: () => void; onEnquire: () => void; onShare: () => void;
  onEdit?: () => void; onToggleActive?: () => void; onToggleFeatured?: () => void;
}) {
  const cat = SERVICE_CATEGORIES[service.category] ?? SERVICE_CATEGORIES.other;
  const topTestimonial = reviews.find(r => r.testimonial);

  return (
    <div className="group relative flex flex-col rounded-[24px] border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-transparent overflow-hidden hover:border-white/[0.15] hover:shadow-[0_12px_48px_rgba(0,0,0,0.6),0_0_0_1px_rgba(99,102,241,0.08)] transition-all duration-300 cursor-pointer">
      {service.featured && (
        <div className="absolute top-3.5 right-3.5 z-10 flex items-center gap-1 rounded-full px-2.5 py-1 text-[9.5px] font-black uppercase tracking-wider shadow-[0_2px_12px_rgba(99,102,241,0.4)]" style={{ background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#ffffff' }}>
          <Star className="h-2.5 w-2.5" /> Featured
        </div>
      )}

      {/* Image / Hero */}
      <div className="relative h-40 overflow-hidden shrink-0" onClick={onView}>
        {service.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={service.imageUrl} alt={service.title} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="h-full w-full flex items-center justify-center transition-transform duration-500 group-hover:scale-105" style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 55%, #24243e 100%)' }}>
            <span className="text-5xl opacity-50 group-hover:opacity-70 transition-opacity">{cat.icon}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D0F] via-[#0D0D0F]/10 to-transparent" />
        {/* Category */}
        <div className="absolute bottom-3 left-4">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold backdrop-blur-sm ${cat.bg} ${cat.color}`}>
            {cat.icon} {cat.label}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-5" onClick={onView}>
        <h3 className="font-bold text-white/90 text-[15px] leading-snug mb-1.5 group-hover:text-white transition-colors line-clamp-2">{service.title}</h3>
        {service.tagline && <p className="text-[11.5px] text-white/40 mb-2 line-clamp-2">{service.tagline}</p>}

        {/* Rating */}
        {service.reviewCount > 0 && (
          <div className="flex items-center gap-1.5 mb-2">
            <StarRow rating={service.rating} />
            <span className="text-[10.5px] text-amber-400/80 font-semibold">{service.rating}</span>
            <span className="text-[10px] text-white/30">({service.reviewCount} review{service.reviewCount !== 1 ? 's' : ''})</span>
          </div>
        )}

        {/* Featured testimonial snippet */}
        {topTestimonial && (
          <div className="mb-3 rounded-[10px] border border-amber-500/15 bg-amber-500/[0.05] px-2.5 py-2" onClick={onView}>
            <p className="text-[10.5px] text-amber-200/60 italic line-clamp-2">"{topTestimonial.testimonial}"</p>
            <p className="text-[9.5px] text-white/25 mt-0.5">— {topTestimonial.reviewerName}</p>
          </div>
        )}

        {/* Tags */}
        {service.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3 mt-auto">
            {service.tags.slice(0, 3).map(t => (
              <span key={t} className="rounded-full border border-white/[0.07] bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/35">{t}</span>
            ))}
            {service.tags.length > 3 && <span className="text-[10px] text-white/20">+{service.tags.length - 3}</span>}
          </div>
        )}
      </div>

      {/* Edit mode overlay controls */}
      {editMode && (
        <div className="absolute inset-0 z-20 pointer-events-none">
          <div className="absolute top-2 left-2 flex gap-1 pointer-events-auto">
            <button type="button" onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
              className="flex items-center gap-1 rounded-[8px] border border-violet-500/40 bg-[#0D0D0F]/85 backdrop-blur-sm px-2 py-1 text-[10px] font-bold text-violet-400 hover:bg-violet-500/20 transition">
              <Edit2 className="h-2.5 w-2.5" /> Edit
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onToggleFeatured?.(); }}
              className={`flex items-center gap-1 rounded-[8px] border bg-[#0D0D0F]/85 backdrop-blur-sm px-2 py-1 text-[10px] font-bold transition ${service.featured ? 'border-amber-500/40 text-amber-400 hover:bg-amber-500/20' : 'border-white/[0.15] text-white/40 hover:text-amber-400'}`}>
              <Star className="h-2.5 w-2.5" /> {service.featured ? 'Unfeature' : 'Feature'}
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onToggleActive?.(); }}
              className={`flex items-center gap-1 rounded-[8px] border bg-[#0D0D0F]/85 backdrop-blur-sm px-2 py-1 text-[10px] font-bold transition ${service.isActive ? 'border-emerald-500/30 text-emerald-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30' : 'border-red-500/30 text-red-400 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30'}`}>
              {service.isActive ? <><Eye className="h-2.5 w-2.5" /> Visible</> : <><EyeOff className="h-2.5 w-2.5" /> Hidden</>}
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className={`px-5 pb-4 ${!service.isActive && editMode ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between pt-3 border-t border-white/[0.06] mb-2.5">
          <div>
            <p className="text-[14px] font-black text-white/90">{formatPrice(service)}</p>
            {service.deliveryTime && (
              <p className="text-[10px] text-white/30 mt-0.5 flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" /> {service.deliveryTime} {service.deliveryUnit ?? 'days'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {service.bookingCount > 0 && <span className="text-[10px] text-white/25">{service.bookingCount} booked</span>}
            {!editMode && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onEnquire(); }}
                className="flex items-center gap-1.5 rounded-[10px] border border-white/[0.10] bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold text-white/55 hover:text-white hover:bg-white/[0.08] transition-all">
                <MessageSquare className="h-3 w-3" /> Ask
              </button>
            )}
            <button type="button" onClick={(e) => { e.stopPropagation(); if (!editMode) onBook(); }}
              className="flex items-center gap-1.5 rounded-[10px] px-3.5 py-1.5 text-[12px] font-bold transition-all active:scale-95"
              style={{ background: accentGradient(settings), color: '#fff', opacity: editMode ? 0.5 : 1 }}>
              {settings.ctaText ?? 'Book'}
            </button>
          </div>
        </div>
        {!editMode && (
          <div className="flex items-center gap-1.5">
            {/* §26 Save Service */}
            <SaveServiceButton serviceId={service.id} variant="full" className="shrink-0" />
            <button type="button" onClick={(e) => { e.stopPropagation(); onShare(); }}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-[10px] border border-white/[0.06] bg-white/[0.02] py-1.5 text-[10.5px] font-medium text-white/30 hover:text-white/55 hover:border-white/[0.10] transition-all">
              {shared ? <><Check className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Link copied!</span></> : <><Share2 className="h-3 w-3" /> Share this service</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Service List Card ─────────────────────────────────────────────── */
function ServiceListCard({ service, reviews, shared, editMode, settings, onView, onBook, onEnquire, onShare, onEdit, onToggleActive, onToggleFeatured }: {
  service: Service; reviews: ServiceReview[]; shared: boolean; editMode: boolean; settings: CatalogueSettings;
  onView: () => void; onBook: () => void; onEnquire: () => void; onShare: () => void;
  onEdit?: () => void; onToggleActive?: () => void; onToggleFeatured?: () => void;
}) {
  const cat = SERVICE_CATEGORIES[service.category] ?? SERVICE_CATEGORIES.other;
  return (
    <div className="group flex items-start gap-4 rounded-[18px] border border-white/[0.07] bg-white/[0.02] p-4 hover:border-white/[0.12] hover:bg-white/[0.03] transition-all">
      {/* Thumbnail */}
      <div className="relative h-20 w-24 rounded-[12px] overflow-hidden shrink-0 cursor-pointer" onClick={onView}>
        {service.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={service.imageUrl} alt={service.title} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-400" />
        ) : (
          <div className="h-full w-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0f0c29, #302b63)' }}>
            <span className="text-3xl opacity-50">{cat.icon}</span>
          </div>
        )}
        {service.featured && (
          <div className="absolute top-1 left-1 rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase" style={{ background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#ffffff' }}>★</div>
        )}
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onView}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-bold text-white/85 text-[14px] leading-snug line-clamp-1 group-hover:text-white transition-colors">{service.title}</h3>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9.5px] font-bold ${cat.bg} ${cat.color}`}>{cat.icon} {cat.label}</span>
        </div>
        {service.tagline && <p className="text-[11.5px] text-white/35 line-clamp-1 mb-1.5">{service.tagline}</p>}
        <div className="flex items-center gap-3 flex-wrap">
          {service.reviewCount > 0 && (
            <div className="flex items-center gap-1">
              <StarRow rating={service.rating} />
              <span className="text-[10px] text-amber-400/70 font-semibold">{service.rating}</span>
              <span className="text-[10px] text-white/25">({service.reviewCount})</span>
            </div>
          )}
          {service.deliveryTime && <span className="text-[10.5px] text-white/30 flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" /> {service.deliveryTime} {service.deliveryUnit}</span>}
          {service.bookingCount > 0 && <span className="text-[10px] text-white/25">{service.bookingCount} booked</span>}
          {service.tags.slice(0,2).map(t => <span key={t} className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[9.5px] text-white/30">{t}</span>)}
        </div>
      </div>
      {/* Actions */}
      <div className="shrink-0 flex flex-col items-end gap-2">
        <p className="text-[15px] font-black text-white/85">{formatPrice(service)}</p>
        {editMode ? (
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
              className="h-7 rounded-[8px] border border-violet-500/40 bg-violet-500/10 px-2.5 text-[10.5px] font-bold text-violet-400 hover:bg-violet-500/20 transition">
              <Edit2 className="h-3 w-3 inline mr-0.5" />Edit
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onToggleFeatured?.(); }}
              className={`h-7 w-7 rounded-[8px] border flex items-center justify-center transition ${service.featured ? 'border-amber-500/40 bg-amber-500/10 text-amber-400' : 'border-white/[0.10] bg-white/[0.04] text-white/30 hover:text-amber-400'}`}>
              <Star className="h-3 w-3" />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onToggleActive?.(); }}
              className={`h-7 w-7 rounded-[8px] border flex items-center justify-center transition ${service.isActive ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
              {service.isActive ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            {/* §26 Save Service */}
            <SaveServiceButton serviceId={service.id} variant="icon" />
            <button type="button" onClick={(e) => { e.stopPropagation(); onShare(); }}
              className="h-7 w-7 rounded-[8px] border border-white/[0.08] bg-white/[0.03] flex items-center justify-center text-white/30 hover:text-white/60 hover:border-white/[0.14] transition-all"
              title="Share">
              {shared ? <Check className="h-3 w-3 text-emerald-400" /> : <Share2 className="h-3 w-3" />}
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onEnquire(); }}
              className="h-7 rounded-[8px] border border-white/[0.10] bg-white/[0.05] px-2.5 text-[11px] font-semibold text-white/55 hover:text-white hover:bg-white/[0.08] transition-all">
              Ask
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onBook(); }}
              className="h-7 rounded-[8px] px-3 text-[11.5px] font-bold text-white transition-all active:scale-95"
              style={{ background: accentGradient(settings) }}>
              {settings.ctaText ?? 'Book'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────── */
export default function ServicesPage() {
  const params = useParams();
  const userId = params?.userId as string | undefined;

  const [provider, setProvider] = useState<ProviderProfile | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const isOwner = !!provider?.isOwnProfile;
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Edit mode + settings state
  const [editMode, setEditMode] = useState(false);
  const [settingsDrawer, setSettingsDrawer] = useState(false);
  const [catSettings, setCatSettings] = useState<CatalogueSettings>({});
  const [draftSettings, setDraftSettings] = useState<CatalogueSettings>({});
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [editingService, setEditingService] = useState<Service | null | 'new'>('new' as never);
  const [showServiceForm, setShowServiceForm] = useState(false);

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activePricing, setActivePricing] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'default' | 'price_asc' | 'price_desc' | 'newest' | 'top_rated' | 'most_reviewed'>('default');
  const [ratingFilter, setRatingFilter] = useState<'all' | '3+' | '4+'>('all');
  const [deliveryFilter, setDeliveryFilter] = useState<'all' | 'fast' | 'week' | 'month'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);

  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [bookingService, setBookingService] = useState<Service | null>(null);
  const [enquiryService, setEnquiryService] = useState<Service | null>(null);
  const [reviewsByService, setReviewsByService] = useState<Record<string, ServiceReview[]>>({});
  const [sharedServiceId, setSharedServiceId] = useState<string | null>(null);

  // Visitor ID for analytics (stable per browser session)
  const visitorId = useRef<string>('');
  useEffect(() => {
    try {
      let vid = sessionStorage.getItem('svc_vid');
      if (!vid) { vid = `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; sessionStorage.setItem('svc_vid', vid); }
      visitorId.current = vid;
    } catch { visitorId.current = `v_${Date.now()}`; }
  }, []);

  // Prevent white overscroll flash by forcing the dark background on html/body
  useEffect(() => {
    const prevBody = document.body.style.backgroundColor;
    const prevHtml = document.documentElement.style.backgroundColor;
    document.body.style.backgroundColor = '#0D0D0F';
    document.documentElement.style.backgroundColor = '#0D0D0F';
    return () => {
      document.body.style.backgroundColor = prevBody;
      document.documentElement.style.backgroundColor = prevHtml;
    };
  }, []);

  function track(serviceId: string, type: 'view' | 'detail_open' | 'book_click' | 'booking_submitted') {
    fetch('/api/services/analytics/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ serviceId, type, visitorId: visitorId.current, source: 'catalogue' }),
    }).catch(() => {});
  }

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!userId) return;
    // Also load catalogue settings
    fetch(`/api/services/catalogue?userId=${userId}`)
      .then(r => r.ok ? r.json() : { settings: {} })
      .then((d: { settings?: CatalogueSettings }) => {
        const s = d.settings ?? {};
        setCatSettings(s);
        setDraftSettings(s);
      }).catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    Promise.all([
      fetch(`/api/public/profile/${userId}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/services/public?userId=${userId}`).then(r => r.ok ? r.json() : { services: [] }),
    ]).then(([profileData, svcData]: [ProviderProfile | null, { services?: Service[] }]) => {
      if (!profileData) { setNotFound(true); }
      else {
        setProvider(profileData);
        const svcs = svcData?.services ?? [];
        setServices(svcs);
        // Fire view events + fetch reviews for all services
        svcs.forEach(svc => {
          fetch(`/api/services/reviews?serviceId=${svc.id}`)
            .then(r => r.ok ? r.json() : { reviews: [] })
            .then((rd: { reviews?: ServiceReview[] }) => {
              setReviewsByService(prev => ({ ...prev, [svc.id]: rd.reviews ?? [] }));
            }).catch(() => {});
          // Track a page-level view for each active service
          fetch('/api/services/analytics/track', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ serviceId: svc.id, type: 'view', visitorId: visitorId.current, source: 'catalogue' }),
          }).catch(() => {});
        });
      }
    }).catch(() => setNotFound(true))
    .finally(() => setLoading(false));
  }, [userId]);

  const filteredServices = useCallback(() => {
    // In edit mode, show all services (including inactive) so owner can manage them
    let list = editMode ? [...services] : services.filter(s => s.isActive);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.tagline?.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    if (activeCategory !== 'all') list = list.filter(s => s.category === activeCategory);
    if (activePricing !== 'all') list = list.filter(s => s.pricingModel === activePricing);
    if (ratingFilter === '4+') list = list.filter(s => s.rating >= 4);
    else if (ratingFilter === '3+') list = list.filter(s => s.rating >= 3);
    if (deliveryFilter === 'fast') list = list.filter(s => s.deliveryTime != null && (s.deliveryUnit === 'hours' || (s.deliveryUnit === 'days' && s.deliveryTime <= 3)));
    else if (deliveryFilter === 'week') list = list.filter(s => s.deliveryTime != null && (s.deliveryUnit === 'hours' || s.deliveryUnit === 'days' || (s.deliveryUnit === 'weeks' && s.deliveryTime <= 1)));
    else if (deliveryFilter === 'month') list = list.filter(s => s.deliveryTime != null && (s.deliveryUnit === 'hours' || s.deliveryUnit === 'days' || s.deliveryUnit === 'weeks' || (s.deliveryUnit === 'months' && s.deliveryTime <= 1)));

    if (sortBy === 'price_asc') list.sort((a, b) => a.basePrice - b.basePrice);
    else if (sortBy === 'price_desc') list.sort((a, b) => b.basePrice - a.basePrice);
    else if (sortBy === 'newest') list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    else if (sortBy === 'top_rated') list.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
    else if (sortBy === 'most_reviewed') list.sort((a, b) => b.reviewCount - a.reviewCount);
    else list.sort((a, b) => { if (a.featured && !b.featured) return -1; if (!a.featured && b.featured) return 1; return b.bookingCount - a.bookingCount; });

    return list;
  }, [services, search, activeCategory, activePricing, ratingFilter, deliveryFilter, sortBy, editMode]);

  function handleCopy() {
    navigator.clipboard.writeText(window.location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  }

  function shareService(svcId: string) {
    const url = `${window.location.origin}/services/${userId}?svc=${svcId}`;
    navigator.clipboard.writeText(url).then(() => { setSharedServiceId(svcId); setTimeout(() => setSharedServiceId(null), 2000); }).catch(() => {});
  }

  async function saveSettings() {
    setSettingsSaving(true);
    try {
      const res = await fetch('/api/services/catalogue', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draftSettings),
      });
      if (res.ok) { setCatSettings(draftSettings); }
    } catch {}
    finally { setSettingsSaving(false); }
  }

  function toggleServiceActive(svcId: string) {
    const svc = services.find(s => s.id === svcId);
    if (!svc) return;
    const newVal = !svc.isActive;
    fetch(`/api/services/${svcId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ isActive: newVal }) })
      .then(r => r.ok ? r.json() : null)
      .then((d: { service?: Service } | null) => { if (d?.service) setServices(prev => prev.map(s => s.id === svcId ? d.service! : s)); })
      .catch(() => {});
  }

  function toggleServiceFeatured(svcId: string) {
    const svc = services.find(s => s.id === svcId);
    if (!svc) return;
    const newVal = !svc.featured;
    fetch(`/api/services/${svcId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ featured: newVal }) })
      .then(r => r.ok ? r.json() : null)
      .then((d: { service?: Service } | null) => { if (d?.service) setServices(prev => prev.map(s => s.id === svcId ? d.service! : s)); })
      .catch(() => {});
  }

  const presentCategories = Array.from(new Set(services.map(s => s.category)));
  const filtered = filteredServices();
  const hasActiveFilters = search || activeCategory !== 'all' || activePricing !== 'all' || ratingFilter !== 'all' || deliveryFilter !== 'all';

  // Aggregate stats for the stats bar
  const ratedServices = services.filter(s => s.reviewCount > 0);
  const avgRating = ratedServices.length > 0 ? ratedServices.reduce((s, sv) => s + sv.rating, 0) / ratedServices.length : 0;
  const pricedServices = services.filter(s => s.pricingModel !== 'contact');
  const avgPrice = pricedServices.length > 0 ? pricedServices.reduce((s, sv) => s + sv.basePrice, 0) / pricedServices.length : 0;
  const totalBookings = services.reduce((s, sv) => s + sv.bookingCount, 0);
  const totalReviews = services.reduce((s, sv) => s + sv.reviewCount, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D0D0F] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin" />
          <p className="text-[13px] text-white/30">Loading services…</p>
        </div>
      </div>
    );
  }

  if (notFound || !provider) {
    return (
      <div className="min-h-screen bg-[#0D0D0F] text-white flex items-center justify-center px-4">
        <div className="text-center">
          <div className="h-16 w-16 rounded-[20px] border border-white/[0.08] bg-white/[0.04] flex items-center justify-center mx-auto mb-5">
            <Briefcase className="h-7 w-7 text-white/30" />
          </div>
          <h1 className="text-2xl font-black text-white/70 mb-2">Not found</h1>
          <p className="text-[13px] text-white/35 mb-6">This profile doesn't exist or has no services.</p>
          <Link href="/" className="inline-flex items-center gap-2 text-[13px] font-semibold text-violet-400 hover:text-violet-300 transition">
            <ArrowLeft className="h-4 w-4" /> Go home
          </Link>
        </div>
      </div>
    );
  }

  const { user, profile, stats } = provider;
  const coverGradient = profile.coverGradient ?? getGradient(user.id);
  // Catalogue-specific overrides take precedence; fall back to profile values
  const effectiveBannerUrl = catSettings.catalogueBannerUrl || profile.bannerUrl;
  const effectiveAvatarUrl = catSettings.catalogueAvatarUrl || profile.avatarUrl;
  const isBannerImage = profile.coverGradient?.startsWith('data:') || effectiveBannerUrl;

  return (
    <div className="min-h-screen bg-[#0D0D0F] text-white">
      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-30 h-14 bg-[#0D0D0F]/85 backdrop-blur-xl border-b border-white/[0.05] flex items-center px-4 md:px-8 gap-4">
        <Link href={`/u/${user.id}`} className="flex items-center justify-center h-8 w-8 rounded-[10px] border border-white/[0.09] bg-white/[0.05] hover:bg-white/[0.09] transition-colors">
          <ArrowLeft className="h-4 w-4 text-white/60" />
        </Link>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="h-7 w-7 rounded-full overflow-hidden ring-1 ring-white/[0.10] bg-white/[0.06] shrink-0 flex items-center justify-center">
            {effectiveAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={effectiveAvatarUrl} alt={user.name} className="h-full w-full object-cover" style={{ objectPosition: profile.avatarPosition ?? '50% 50%' }} />
            ) : (
              <span className="text-[10px] font-bold text-white/60">{getInitials(user.name)}</span>
            )}
          </div>
          <span className="text-[13px] font-semibold text-white/70 truncate">{user.name}'s Services</span>
        </div>
        <div className="flex items-center gap-2">
          {isOwner && (
            <button type="button" onClick={() => { setEditMode(e => !e); if (editMode) setSettingsDrawer(false); }}
              className={`flex items-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-[11.5px] font-semibold transition-all ${editMode ? 'border-violet-500/50 bg-violet-500/15 text-violet-300' : 'border-white/[0.09] bg-white/[0.05] text-white/50 hover:text-white hover:bg-white/[0.09]'}`}>
              {editMode ? <><Check className="h-3 w-3" /> Editing</> : <><Pencil className="h-3 w-3" /> Edit Page</>}
            </button>
          )}
          {isOwner && editMode && (
            <button type="button" onClick={() => { setDraftSettings(catSettings); setSettingsDrawer(s => !s); }}
              className={`flex items-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-[11.5px] font-semibold transition-all ${settingsDrawer ? 'border-violet-500/50 bg-violet-500/15 text-violet-300' : 'border-white/[0.09] bg-white/[0.05] text-white/50 hover:text-white'}`}>
              <Settings2 className="h-3 w-3" /> Customise
            </button>
          )}
          <Link href={`/u/${user.id}`} className="hidden sm:flex items-center gap-1.5 rounded-[10px] border border-white/[0.09] bg-white/[0.05] px-3 py-1.5 text-[11.5px] font-semibold text-white/50 hover:text-white hover:bg-white/[0.09] transition-all">
            View Profile <ExternalLink className="h-3 w-3" />
          </Link>
          <button type="button" onClick={handleCopy} className="flex items-center gap-1.5 rounded-[10px] border border-white/[0.09] bg-white/[0.05] px-3 py-1.5 text-[11.5px] font-semibold text-white/50 hover:text-white hover:bg-white/[0.09] transition-all">
            {copied ? <><Check className="h-3 w-3 text-emerald-400" /> Copied</> : <><Share2 className="h-3 w-3" /> Share</>}
          </button>
        </div>
      </header>

      {/* ── Hero / Provider Banner ── */}
      <div className="relative">
        {/* Cover */}
        <div className="h-48 md:h-64 w-full overflow-hidden">
          {isBannerImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={effectiveBannerUrl ?? profile.coverGradient!} alt="" className="h-full w-full object-cover" style={{ objectPosition: profile.coverGradient?.startsWith('data:') ? undefined : '50% 50%' }} />
          ) : (
            <div className="h-full w-full" style={{ background: coverGradient }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0D0D0F]/20 to-[#0D0D0F]" />
        </div>

        {/* Provider info card */}
        <div className="relative -mt-20 px-4 md:px-8 lg:px-16 xl:px-24 max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end gap-5 mb-8">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="h-24 w-24 md:h-28 md:w-28 rounded-[24px] ring-4 ring-[#0D0D0F] overflow-hidden bg-gradient-to-br from-white/[0.10] to-white/[0.04] flex items-center justify-center shadow-[0_12px_40px_rgba(0,0,0,0.8)]">
                {effectiveAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={effectiveAvatarUrl} alt={user.name} className="h-full w-full object-cover" style={{ objectPosition: profile.avatarPosition ?? '50% 50%' }} />
                ) : (
                  <span className="text-2xl md:text-3xl font-black text-white/50">{getInitials(user.name)}</span>
                )}
              </div>
              {profile.docrudGo && (
                <div className="absolute -bottom-1 -right-1 flex items-center justify-center" title="Docrud Infinity — Verified">
                  <div className="h-7 w-7 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#4f46e5,#818cf8)', boxShadow: '0 2px 8px rgba(99,102,241,0.5)' }}>
                    <span className="text-[13px] font-black text-white leading-none">∞</span>
                  </div>
                </div>
              )}
            </div>

            {/* Name & stats */}
            <div className="flex-1 pb-1">
              <div className="flex items-center gap-2.5 flex-wrap mb-1">
                <h1 className="text-[22px] md:text-[26px] font-black text-white tracking-tight">
                  {catSettings.headline ?? user.name}
                </h1>
                {profile.docrudGo && (
                  <span className="rounded-full px-2 py-0.5 text-[9.5px] font-black tracking-wide" style={{ background: 'linear-gradient(135deg,#0f0e2e,#1e1b4b)', border: '1px solid rgba(99,102,241,0.40)', color: '#a5b4fc' }}>∞ Infinity</span>
                )}
              </div>
              {(catSettings.subheadline ?? profile.headline) && <p className="text-[13px] text-white/50 mb-2">{catSettings.subheadline ?? profile.headline}</p>}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/30">
                {profile.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{profile.location}</span>}
                {profile.website && (
                  <a href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-white/60 transition">
                    <Globe className="h-3 w-3" />{profile.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
                <span>{stats.followers} followers</span>
                <span>{services.length} service{services.length !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* Action */}
            <div className="flex gap-2 sm:pb-1 flex-wrap">
              <Link href={`/u/${user.id}`} className="flex items-center gap-2 rounded-[13px] border border-white/[0.10] bg-white/[0.06] px-4 py-2.5 text-[12.5px] font-semibold text-white/60 hover:text-white hover:bg-white/[0.10] transition-all">
                <ExternalLink className="h-3.5 w-3.5" /> Profile
              </Link>
              {catSettings.chatEnabled && !isOwner && (
                <Link
                  href={`/messages?user=${user.id}&init=${encodeURIComponent(`Hi ${user.name}! I came across your services catalogue and I'd love to connect.`)}`}
                  className="flex items-center gap-2 rounded-[13px] border border-blue-500/30 bg-blue-500/[0.10] px-4 py-2.5 text-[12.5px] font-semibold text-blue-400 hover:bg-blue-500/[0.18] hover:border-blue-500/50 transition-all"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Message
                </Link>
              )}
              <button type="button" onClick={handleCopy} className="flex items-center gap-2 rounded-[13px] border border-white/[0.10] bg-white/[0.06] px-4 py-2.5 text-[12.5px] font-semibold text-white/60 hover:text-white hover:bg-white/[0.10] transition-all">
                {copied ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> Copied!</> : <><Share2 className="h-3.5 w-3.5" /> Share</>}
              </button>
            </div>
          </div>

          {/* ── Stats bar ── */}
          {services.length > 0 && catSettings.showStats !== false && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-6 px-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-white/35">{services.length} service{services.length !== 1 ? 's' : ''}</span>
                {filtered.length !== services.length && <span className="text-[10px] text-violet-400/70">· {filtered.length} shown</span>}
              </div>
              {avgRating > 0 && (
                <div className="flex items-center gap-1.5">
                  <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                  <span className="text-[11px] font-semibold text-white/35">{avgRating.toFixed(1)} avg rating</span>
                  <span className="text-[10px] text-white/20">({totalReviews} reviews)</span>
                </div>
              )}
              {totalBookings > 0 && <span className="text-[11px] text-white/25">{totalBookings} bookings completed</span>}
              {avgPrice > 0 && <span className="text-[11px] text-white/25">Avg. {services[0]?.currency === 'INR' ? '₹' : '$'}{Math.round(avgPrice).toLocaleString()}</span>}
            </div>
          )}

          {/* ── Search + Sort + View Toggle ── */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search services, tags…"
                className="w-full rounded-[13px] border border-white/[0.09] bg-white/[0.04] pl-9 pr-4 py-2.5 text-[13px] text-white placeholder-white/20 outline-none focus:border-violet-500/40 focus:bg-violet-500/[0.03] transition-all" />
              {search && <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"><X className="h-3.5 w-3.5" /></button>}
            </div>
            <div className="flex gap-2 shrink-0">
              <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-[13px] border border-white/[0.09] bg-[#0D0D0F] px-3 py-2.5 text-[12.5px] text-white/60 outline-none focus:border-violet-500/40 transition-all flex-1 sm:w-44">
                <option value="default">Featured first</option>
                <option value="top_rated">Top rated</option>
                <option value="most_reviewed">Most reviewed</option>
                <option value="price_asc">Price: low → high</option>
                <option value="price_desc">Price: high → low</option>
                <option value="newest">Newest</option>
              </select>
              {/* Filter toggle */}
              <button type="button" onClick={() => setShowFilters(f => !f)}
                className={`flex items-center gap-1.5 rounded-[13px] border px-3 py-2.5 text-[12.5px] font-semibold transition-all ${showFilters || hasActiveFilters ? 'border-violet-500/40 bg-violet-500/10 text-violet-300' : 'border-white/[0.09] bg-white/[0.04] text-white/50 hover:text-white/80'}`}>
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {hasActiveFilters ? <span className="h-1.5 w-1.5 rounded-full bg-violet-400" /> : null}
              </button>
              {/* View mode */}
              <div className="flex rounded-[13px] border border-white/[0.09] bg-white/[0.04] overflow-hidden">
                <button type="button" onClick={() => setViewMode('grid')} title="Grid view"
                  className={`flex items-center justify-center px-3 py-2.5 transition-all ${viewMode === 'grid' ? 'bg-white/[0.10] text-white' : 'text-white/35 hover:text-white/60'}`}>
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => setViewMode('list')} title="List view"
                  className={`flex items-center justify-center px-3 py-2.5 transition-all ${viewMode === 'list' ? 'bg-white/[0.10] text-white' : 'text-white/35 hover:text-white/60'}`}>
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* ── Expandable Filters ── */}
          {showFilters && (
            <div className="rounded-[16px] border border-white/[0.07] bg-white/[0.02] p-4 mb-4 space-y-4">
              {/* Category */}
              {presentCategories.length > 1 && (
                <div>
                  <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider mb-2">Category</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => setActiveCategory('all')}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold border transition-all ${activeCategory === 'all' ? 'border-violet-500/50 bg-violet-500/15 text-violet-300' : 'border-white/[0.08] bg-white/[0.03] text-white/40 hover:text-white/70'}`}>
                      All ({services.length})
                    </button>
                    {presentCategories.map(cat => {
                      const info = SERVICE_CATEGORIES[cat] ?? SERVICE_CATEGORIES.other;
                      const count = services.filter(s => s.category === cat).length;
                      return (
                        <button key={cat} type="button" onClick={() => setActiveCategory(cat === activeCategory ? 'all' : cat)}
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold border transition-all ${activeCategory === cat ? `border-current ${info.bg} ${info.color}` : 'border-white/[0.08] bg-white/[0.03] text-white/40 hover:text-white/70'}`}>
                          {info.icon} {info.label} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Pricing */}
              <div>
                <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider mb-2">Pricing type</p>
                <div className="flex flex-wrap gap-1.5">
                  {[{ id: 'all', label: 'All' }, { id: 'fixed', label: 'Fixed' }, { id: 'hourly', label: 'Hourly' }, { id: 'starting_from', label: 'Starting from' }, { id: 'contact', label: 'Contact' }]
                    .filter(o => o.id === 'all' || services.some(s => s.pricingModel === o.id))
                    .map(opt => (
                      <button key={opt.id} type="button" onClick={() => setActivePricing(opt.id)}
                        className={`rounded-full px-3 py-1 text-[11px] font-medium border transition-all ${activePricing === opt.id ? 'border-white/30 bg-white/[0.10] text-white/80' : 'border-white/[0.07] bg-white/[0.02] text-white/35 hover:text-white/60'}`}>
                        {opt.label}
                      </button>
                    ))}
                </div>
              </div>
              {/* Rating */}
              <div>
                <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider mb-2">Minimum rating</p>
                <div className="flex flex-wrap gap-1.5">
                  {[{ id: 'all' as const, label: 'Any' }, { id: '3+' as const, label: '3+ ★' }, { id: '4+' as const, label: '4+ ★' }].map(opt => (
                    <button key={opt.id} type="button" onClick={() => setRatingFilter(opt.id)}
                      className={`rounded-full px-3 py-1 text-[11px] font-medium border transition-all ${ratingFilter === opt.id ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-white/[0.07] bg-white/[0.02] text-white/35 hover:text-white/60'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Delivery */}
              <div>
                <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider mb-2">Delivery time</p>
                <div className="flex flex-wrap gap-1.5">
                  {[{ id: 'all' as const, label: 'Any' }, { id: 'fast' as const, label: '≤ 3 days' }, { id: 'week' as const, label: '≤ 1 week' }, { id: 'month' as const, label: '≤ 1 month' }].map(opt => (
                    <button key={opt.id} type="button" onClick={() => setDeliveryFilter(opt.id)}
                      className={`rounded-full px-3 py-1 text-[11px] font-medium border transition-all ${deliveryFilter === opt.id ? 'border-sky-500/40 bg-sky-500/10 text-sky-300' : 'border-white/[0.07] bg-white/[0.02] text-white/35 hover:text-white/60'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {hasActiveFilters && (
                <button type="button" onClick={() => { setSearch(''); setActiveCategory('all'); setActivePricing('all'); setRatingFilter('all'); setDeliveryFilter('all'); }}
                  className="text-[11.5px] font-semibold text-red-400/70 hover:text-red-400 transition">
                  × Clear all filters
                </button>
              )}
            </div>
          )}

          {/* Category chips (shown when filters panel is closed) */}
          {!showFilters && presentCategories.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mb-5">
              <button type="button" onClick={() => setActiveCategory('all')}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold border transition-all ${activeCategory === 'all' ? 'border-violet-500/50 bg-violet-500/15 text-violet-300' : 'border-white/[0.08] bg-white/[0.03] text-white/40 hover:text-white/70'}`}>
                All ({services.length})
              </button>
              {presentCategories.map(cat => {
                const info = SERVICE_CATEGORIES[cat] ?? SERVICE_CATEGORIES.other;
                const count = services.filter(s => s.category === cat).length;
                return (
                  <button key={cat} type="button" onClick={() => setActiveCategory(cat === activeCategory ? 'all' : cat)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold border transition-all ${activeCategory === cat ? `border-current ${info.bg} ${info.color}` : 'border-white/[0.08] bg-white/[0.03] text-white/40 hover:text-white/70'}`}>
                    {info.icon} {info.label} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Services grid/list ── */}
          {filtered.length === 0 ? (
            <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.02] p-16 text-center mb-16">
              <div className="h-14 w-14 rounded-[18px] border border-white/[0.08] bg-white/[0.04] flex items-center justify-center mx-auto mb-5">
                <Filter className="h-6 w-6 text-white/25" />
              </div>
              <p className="text-white/40 text-[15px] font-semibold mb-1">No services match</p>
              <p className="text-[12px] text-white/25">Try adjusting your search or filters.</p>
              {hasActiveFilters && (
                <button type="button" onClick={() => { setSearch(''); setActiveCategory('all'); setActivePricing('all'); setRatingFilter('all'); setDeliveryFilter('all'); }}
                  className="mt-4 text-[12px] font-semibold text-violet-400 hover:text-violet-300 transition">
                  Clear all filters
                </button>
              )}
            </div>
          ) : viewMode === 'list' ? (
            <div className="space-y-3 mb-16">
              {filtered.map(svc => (
                <ServiceListCard key={svc.id} service={svc} reviews={reviewsByService[svc.id] ?? []}
                  shared={sharedServiceId === svc.id} editMode={editMode} settings={catSettings}
                  onView={() => { if (!editMode) { setSelectedService(svc); track(svc.id, 'detail_open'); } }}
                  onBook={() => { if (!editMode) { setBookingService(svc); track(svc.id, 'book_click'); } }}
                  onEnquire={() => { if (!editMode) setEnquiryService(svc); }}
                  onShare={() => shareService(svc.id)}
                  onEdit={() => { setEditingService(svc); setShowServiceForm(true); }}
                  onToggleActive={() => toggleServiceActive(svc.id)}
                  onToggleFeatured={() => toggleServiceFeatured(svc.id)}
                />
              ))}
              {editMode && isOwner && (
                <button type="button" onClick={() => { setEditingService(null); setShowServiceForm(true); }}
                  className="w-full flex items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-white/[0.10] bg-white/[0.02] py-5 text-[13px] font-semibold text-white/30 hover:border-violet-500/30 hover:text-violet-400 hover:bg-violet-500/[0.03] transition-all">
                  <Plus className="h-4 w-4" /> Add New Service
                </button>
              )}
            </div>
          ) : (
            <div className={`grid grid-cols-1 gap-5 mb-16 ${(catSettings.gridColumns === 2) ? 'sm:grid-cols-2' : (catSettings.gridColumns === 4) ? 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
              {filtered.map(svc => (
                <ServiceCard key={svc.id} service={svc} reviews={reviewsByService[svc.id] ?? []}
                  shared={sharedServiceId === svc.id} editMode={editMode} settings={catSettings}
                  onView={() => { if (!editMode) { setSelectedService(svc); track(svc.id, 'detail_open'); } }}
                  onBook={() => { if (!editMode) { setBookingService(svc); track(svc.id, 'book_click'); } }}
                  onEnquire={() => { if (!editMode) setEnquiryService(svc); }}
                  onShare={() => shareService(svc.id)}
                  onEdit={() => { setEditingService(svc); setShowServiceForm(true); }}
                  onToggleActive={() => toggleServiceActive(svc.id)}
                  onToggleFeatured={() => toggleServiceFeatured(svc.id)}
                />
              ))}
              {editMode && isOwner && (
                <button type="button" onClick={() => { setEditingService(null); setShowServiceForm(true); }}
                  className="flex flex-col items-center justify-center gap-3 rounded-[24px] border-2 border-dashed border-white/[0.09] bg-white/[0.01] min-h-[200px] text-[13px] font-semibold text-white/25 hover:border-violet-500/30 hover:text-violet-400 hover:bg-violet-500/[0.03] transition-all">
                  <div className="h-12 w-12 rounded-[14px] border border-white/[0.10] bg-white/[0.04] flex items-center justify-center">
                    <Plus className="h-5 w-5" />
                  </div>
                  Add New Service
                </button>
              )}
            </div>
          )}

          {/* ── Provider bio card ── */}
          {profile.bio && catSettings.showBio !== false && (
            <div className="mb-16 rounded-[24px] border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-white/[0.02] overflow-hidden">
              <div className="px-6 py-5 border-b border-white/[0.06]">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-white/35">About {user.name}</h2>
              </div>
              <div className="px-6 py-5">
                <p className="text-[13px] text-white/55 leading-relaxed whitespace-pre-line">{profile.bio}</p>
                {profile.skills && profile.skills.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {profile.skills.map(s => (
                      <span key={s} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-0.5 text-[11px] text-white/45">{s}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Why book CTA strip ── */}
          {catSettings.showWhyBook !== false && <div className="mb-16 rounded-[24px] overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <div className="pointer-events-none absolute inset-0 rounded-[24px]" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(139,92,246,0.12) 0%, transparent 70%)' }} />
            <div className="relative px-6 py-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {[
                  { icon: <Zap className="h-5 w-5" />, title: 'Fast Response', desc: 'Get a reply within 24 hours after booking.' },
                  { icon: <MessageSquare className="h-5 w-5" />, title: 'Direct Communication', desc: 'Talk directly with the service provider.' },
                  { icon: <Check className="h-5 w-5" />, title: 'Transparent Pricing', desc: 'No hidden fees. What you see is what you pay.' },
                ].map(item => (
                  <div key={item.title} className="flex items-start gap-3.5">
                    <div className="h-9 w-9 shrink-0 rounded-[12px] flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.20)', border: '1px solid rgba(99,102,241,0.25)' }}>
                      <span className="text-violet-400">{item.icon}</span>
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-white/80">{item.title}</p>
                      <p className="text-[11.5px] text-white/40 mt-0.5 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>}
        </div>
      </div>

      {/* ── Settings Drawer (slide-in from right) ── */}
      {isOwner && settingsDrawer && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setSettingsDrawer(false)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-[#111113] border-l border-white/[0.08] shadow-[−32px_0_80px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] shrink-0">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-violet-400" />
                <h3 className="font-bold text-white text-[14.5px]">Customise Catalogue</h3>
              </div>
              <button onClick={() => setSettingsDrawer(false)} className="h-7 w-7 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.10] transition">
                <X className="h-3.5 w-3.5 text-white/60" />
              </button>
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6 [scrollbar-width:none]">
              {/* Page Identity */}
              <div>
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-3">Page Identity</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10.5px] text-white/40 mb-1.5">Page headline</label>
                    <input value={draftSettings.headline ?? ''} onChange={e => setDraftSettings(d => ({ ...d, headline: e.target.value || undefined }))} placeholder={`${user.name}'s Services`}
                      className="w-full rounded-[10px] border border-white/[0.09] bg-white/[0.04] px-3 py-2 text-[12.5px] text-white placeholder-white/20 outline-none focus:border-violet-500/40 transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10.5px] text-white/40 mb-1.5">Subheadline / tagline</label>
                    <input value={draftSettings.subheadline ?? ''} onChange={e => setDraftSettings(d => ({ ...d, subheadline: e.target.value || undefined }))} placeholder={profile.headline ?? 'Describe what you do'}
                      className="w-full rounded-[10px] border border-white/[0.09] bg-white/[0.04] px-3 py-2 text-[12.5px] text-white placeholder-white/20 outline-none focus:border-violet-500/40 transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10.5px] text-white/40 mb-1.5">Booking button text</label>
                    <input value={draftSettings.ctaText ?? ''} onChange={e => setDraftSettings(d => ({ ...d, ctaText: e.target.value || undefined }))} placeholder="Book"
                      className="w-full rounded-[10px] border border-white/[0.09] bg-white/[0.04] px-3 py-2 text-[12.5px] text-white placeholder-white/20 outline-none focus:border-violet-500/40 transition-all" />
                  </div>
                </div>
              </div>

              {/* Accent Color */}
              <div>
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-3">Accent Color</p>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {ACCENT_PRESETS.map(preset => (
                    <button key={preset.label} type="button" onClick={() => setDraftSettings(d => ({ ...d, accentColor: preset.a, accentColorSecondary: preset.b }))}
                      className={`h-9 rounded-[10px] transition-all relative overflow-hidden ${draftSettings.accentColor === preset.a ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-[#111113]' : 'hover:scale-105'}`}
                      style={{ background: `linear-gradient(135deg,${preset.a},${preset.b})` }}
                      title={preset.label}>
                      {draftSettings.accentColor === preset.a && <Check className="h-3 w-3 text-white absolute inset-0 m-auto drop-shadow-sm" />}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/30">Primary</span>
                    <input type="color" value={draftSettings.accentColor ?? '#6366f1'} onChange={e => setDraftSettings(d => ({ ...d, accentColor: e.target.value }))}
                      className="w-full h-8 rounded-[8px] border border-white/[0.09] bg-white/[0.04] px-1 cursor-pointer" />
                  </div>
                  <div className="relative flex-1">
                    <input type="color" value={draftSettings.accentColorSecondary ?? '#8b5cf6'} onChange={e => setDraftSettings(d => ({ ...d, accentColorSecondary: e.target.value }))}
                      className="w-full h-8 rounded-[8px] border border-white/[0.09] bg-white/[0.04] px-1 cursor-pointer" />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/30">Secondary</span>
                  </div>
                </div>
                {/* Color preview */}
                <div className="mt-2 h-8 rounded-[10px] flex items-center justify-center text-[11px] font-bold text-white"
                  style={{ background: accentGradient(draftSettings) }}>
                  {draftSettings.ctaText ?? 'Book Now'} ↗
                </div>
              </div>

              {/* Layout */}
              <div>
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-3">Layout</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10.5px] text-white/40 mb-2">Grid columns</label>
                    <div className="flex gap-2">
                      {([2, 3, 4] as const).map(n => (
                        <button key={n} type="button" onClick={() => setDraftSettings(d => ({ ...d, gridColumns: n }))}
                          className={`flex-1 py-2 rounded-[10px] border text-[12px] font-semibold transition-all ${(draftSettings.gridColumns ?? 3) === n ? 'border-violet-500/50 bg-violet-500/15 text-violet-300' : 'border-white/[0.09] bg-white/[0.04] text-white/40 hover:text-white/70'}`}>
                          {n} cols
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Visibility toggles */}
              <div>
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-3">Sections</p>
                <div className="space-y-2.5">
                  {[
                    { key: 'showStats' as const, label: 'Stats bar', desc: 'Reviews, bookings, avg price' },
                    { key: 'showBio' as const, label: 'About section', desc: 'Your bio and skills' },
                    { key: 'showWhyBook' as const, label: '"Why book me" strip', desc: 'Fast response, transparent pricing' },
                  ].map(({ key, label, desc }) => {
                    const val = draftSettings[key] !== false;
                    return (
                      <div key={key} className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[12px] font-medium text-white/65">{label}</p>
                          <p className="text-[10.5px] text-white/30">{desc}</p>
                        </div>
                        <button type="button" onClick={() => setDraftSettings(d => ({ ...d, [key]: !val }))}
                          className={`relative h-5 w-9 rounded-full shrink-0 transition-colors ${val ? 'bg-violet-500/70' : 'bg-white/[0.10]'}`}>
                          <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all shadow-sm ${val ? 'left-[18px]' : 'left-0.5'}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chat / Messaging */}
              <div>
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-3">Messaging</p>
                <div className="flex items-center justify-between gap-3 rounded-[12px] border border-white/[0.07] bg-white/[0.03] px-3.5 py-3">
                  <div>
                    <p className="text-[12px] font-medium text-white/65 flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5 text-blue-400" /> Allow visitors to message you
                    </p>
                    <p className="text-[10.5px] text-white/30 mt-0.5">Shows a "Message" button on your catalogue page</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDraftSettings(d => ({ ...d, chatEnabled: !d.chatEnabled }))}
                    className={`relative h-5 w-9 rounded-full shrink-0 transition-colors ${draftSettings.chatEnabled ? 'bg-blue-500/70' : 'bg-white/[0.10]'}`}
                  >
                    <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all shadow-sm ${draftSettings.chatEnabled ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Drawer footer */}
            <div className="px-5 py-4 border-t border-white/[0.07] flex gap-3 shrink-0">
              <button type="button" onClick={() => setDraftSettings(catSettings)}
                className="flex-1 rounded-[11px] border border-white/[0.09] bg-white/[0.04] py-2 text-[12.5px] font-semibold text-white/50 hover:text-white transition">
                Reset
              </button>
              <button type="button" onClick={saveSettings} disabled={settingsSaving}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-[11px] py-2 text-[12.5px] font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
                style={{ background: accentGradient(draftSettings) }}>
                <Save className="h-3.5 w-3.5" /> {settingsSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Modals ── */}
      {selectedService && (
        <ServiceDetailModal
          service={selectedService}
          reviews={reviewsByService[selectedService.id] ?? []}
          onClose={() => setSelectedService(null)}
          onBook={() => { track(selectedService.id, 'book_click'); setBookingService(selectedService); setSelectedService(null); }}
        />
      )}
      {bookingService && (
        <ServiceBookingWizard
          service={{
            id: bookingService.id,
            title: bookingService.title,
            currency: bookingService.currency,
            basePrice: bookingService.basePrice,
            pricingModel: bookingService.pricingModel,
            packages: bookingService.packages,
            providerName: provider?.user.name,
            userId: provider?.user.id,
          }}
          onClose={() => setBookingService(null)}
        />
      )}
      {enquiryService && (
        <ServiceEnquiryModal
          service={{
            id: enquiryService.id,
            title: enquiryService.title,
            userId: provider?.user.id,
            providerName: provider?.user.name,
            currency: enquiryService.currency,
          }}
          onClose={() => setEnquiryService(null)}
        />
      )}
      {showServiceForm && (
        <ServiceEditModal
          service={editingService === 'new' ? null : editingService}
          onClose={() => { setShowServiceForm(false); setEditingService('new' as never); }}
          onSaved={(svc) => {
            setServices(prev => {
              const exists = prev.find(s => s.id === svc.id);
              return exists ? prev.map(s => s.id === svc.id ? svc : s) : [...prev, svc];
            });
          }}
          onDeleted={(id) => setServices(prev => prev.filter(s => s.id !== id))}
        />
      )}
      {/* Edit mode banner */}
      {editMode && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full border border-violet-500/30 bg-[#111113]/95 backdrop-blur-xl px-5 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.8)]">
          <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"/><span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"/></span>
          <span className="text-[12px] font-semibold text-violet-300">Edit Mode</span>
          <span className="text-[11px] text-white/30">Click cards to edit · Toggle visibility · Add services</span>
          <button type="button" onClick={() => { setEditMode(false); setSettingsDrawer(false); }} className="ml-2 text-[11px] font-bold text-white/40 hover:text-white/80 transition">Exit ×</button>
        </div>
      )}
    </div>
  );
}
