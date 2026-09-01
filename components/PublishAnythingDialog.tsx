'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { sanitizeCtaLabel, sanitizeCtaUrl, CTA_LABEL_MAX, type PostCta } from '@/lib/cta';
import {
  PUBLICATION_BODY_MAX,
  getPublicationMax,
  setConfiguredPublicationMax,
  PUBLICATION_BODY_ERROR,
  clampPublicationBody,
  publicationBodyLength,
  isPublicationBodyOverLimit,
} from '@/lib/publication-body';
import Link from 'next/link';
import {
  ArrowLeft,
  Eye,
  Heart,
  Share2,
  ArrowRight,
  Award,
  ChevronDown,
  BarChart2,
  BookMarked,
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  Image as ImageIcon,
  Layers,
  Link2,
  ListChecks,
  Lock,
  MapPin,
  Megaphone,
  MessageSquare,
  Newspaper,
  Package,
  PenLine,
  Phone,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Tag,
  Terminal,
  Trophy,
  Upload,
  User,
  Video,
  X,
  Zap,
} from 'lucide-react';

/* ─── helpers ──────────────────────────────────────────────── */
type Visibility = 'public' | 'private';

const MAX_PUBLIC_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PUBLIC_FILE_BYTES  = 15 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${units[i]}`;
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Failed to read file.'));
    r.onload  = () => resolve(String(r.result || ''));
    r.readAsDataURL(file);
  });
}

async function compressImage(file: File, maxPx = 1280, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  return new Promise<File>((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/* ─── categories ────────────────────────────────────────────── */
const CATEGORIES = [
  { id: 'post',         label: 'Post',        icon: ImageIcon,     desc: 'Photo & caption',           color: 'rose'    },
  { id: 'poll',         label: 'Poll',         icon: ListChecks,    desc: 'Quick audience vote',        color: 'violet'  },
  { id: 'survey',       label: 'Survey',       icon: ClipboardList, desc: 'Multi-question form',        color: 'amber'   },
  { id: 'chart',        label: 'Chart',        icon: BarChart2,     desc: 'Publish visual data',        color: 'emerald' },
  { id: 'news',         label: 'News',         icon: Newspaper,     desc: 'Press & media releases',     color: 'sky'     },
  { id: 'article',      label: 'Article',      icon: BookOpen,      desc: 'Blog & editorial content',   color: 'indigo'  },
  { id: 'announcement', label: 'Announce',     icon: Megaphone,     desc: 'Updates & alerts',           color: 'amber'   },
  { id: 'document',     label: 'Document',     icon: FileText,      desc: 'Reports, files & uploads',   color: 'neutral' },
  { id: 'portfolio',    label: 'Portfolio',    icon: Layers,        desc: 'Work & project showcase',    color: 'violet'  },
  { id: 'job',          label: 'Job Post',     icon: Briefcase,     desc: 'Roles & hiring',             color: 'emerald' },
  { id: 'resume',       label: 'Resume',       icon: User,          desc: 'Talent profile',             color: 'sky'     },
  { id: 'product',      label: 'Product',      icon: Package,       desc: 'Listings & offerings',       color: 'orange'  },
  { id: 'event',        label: 'Event',        icon: CalendarDays,  desc: 'Conferences & meetups',      color: 'rose'    },
  { id: 'hackathon',    label: 'Hackathon',    icon: Terminal,      desc: 'Competitions & sprints',     color: 'green'   },
  { id: 'gig',          label: 'Gig',          icon: Zap,           desc: 'Freelance & contracts',      color: 'yellow'  },
  { id: 'thread',    label: 'Thread',    icon: MessageSquare, desc: 'Multi-part discussion',   color: 'sky'     },
  { id: 'video',     label: 'Video',     icon: Video,         desc: 'Video link & description', color: 'red'     },
  { id: 'milestone', label: 'Milestone', icon: Award,         desc: 'Achievement & celebration',color: 'yellow'  },
  { id: 'tutorial',  label: 'Tutorial',  icon: BookMarked,    desc: 'Step-by-step guide',       color: 'indigo'  },
] as const;

type CategoryId = typeof CATEGORIES[number]['id'];

/* `accent` is the same rgb already encoded in `glow`, as a space-separated triple
   so it can be handed to CSS as --cat-accent for the selected ring. */
const CAT_COLORS: Record<string, { bg: string; icon: string; ring: string; glow: string; grad: string; iconBg: string; accent: string }> = {
  rose:    { bg: 'bg-rose-500/[0.10]',    icon: 'text-rose-300',    ring: 'ring-rose-500/[0.15]',    glow: 'hover:shadow-[0_8px_32px_rgba(244,63,94,0.20)]',    grad: 'from-rose-500/[0.14] via-rose-500/[0.04]',    iconBg: 'bg-rose-500/20 ring-1 ring-rose-500/25', accent: '244 63 94'    },
  violet:  { bg: 'bg-violet-500/[0.10]',  icon: 'text-violet-300',  ring: 'ring-violet-500/[0.15]',  glow: 'hover:shadow-[0_8px_32px_rgba(139,92,246,0.20)]',  grad: 'from-violet-500/[0.14] via-violet-500/[0.04]',  iconBg: 'bg-violet-500/20 ring-1 ring-violet-500/25', accent: '139 92 246'  },
  amber:   { bg: 'bg-amber-500/[0.10]',   icon: 'text-amber-300',   ring: 'ring-amber-500/[0.15]',   glow: 'hover:shadow-[0_8px_32px_rgba(245,158,11,0.20)]',   grad: 'from-amber-500/[0.14] via-amber-500/[0.04]',   iconBg: 'bg-amber-500/20 ring-1 ring-amber-500/25', accent: '245 158 11'   },
  emerald: { bg: 'bg-emerald-500/[0.10]', icon: 'text-emerald-300', ring: 'ring-emerald-500/[0.15]', glow: 'hover:shadow-[0_8px_32px_rgba(16,185,129,0.20)]', grad: 'from-emerald-500/[0.14] via-emerald-500/[0.04]', iconBg: 'bg-emerald-500/20 ring-1 ring-emerald-500/25', accent: '16 185 129' },
  sky:     { bg: 'bg-sky-500/[0.10]',     icon: 'text-sky-300',     ring: 'ring-sky-500/[0.15]',     glow: 'hover:shadow-[0_8px_32px_rgba(14,165,233,0.20)]',     grad: 'from-sky-500/[0.14] via-sky-500/[0.04]',     iconBg: 'bg-sky-500/20 ring-1 ring-sky-500/25', accent: '14 165 233'     },
  indigo:  { bg: 'bg-indigo-500/[0.10]',  icon: 'text-indigo-300',  ring: 'ring-indigo-500/[0.15]',  glow: 'hover:shadow-[0_8px_32px_rgba(99,102,241,0.20)]',  grad: 'from-indigo-500/[0.14] via-indigo-500/[0.04]',  iconBg: 'bg-indigo-500/20 ring-1 ring-indigo-500/25', accent: '99 102 241'  },
  neutral: { bg: 'bg-white/[0.06]',       icon: 'text-white/70',    ring: 'ring-white/[0.10]',       glow: 'hover:shadow-[0_8px_32px_rgba(255,255,255,0.08)]', grad: 'from-white/[0.06] via-white/[0.02]',            iconBg: 'bg-white/10 ring-1 ring-white/15', accent: '255 255 255'           },
  orange:  { bg: 'bg-orange-500/[0.10]',  icon: 'text-orange-300',  ring: 'ring-orange-500/[0.15]',  glow: 'hover:shadow-[0_8px_32px_rgba(249,115,22,0.20)]',  grad: 'from-orange-500/[0.14] via-orange-500/[0.04]',  iconBg: 'bg-orange-500/20 ring-1 ring-orange-500/25', accent: '249 115 22'  },
  green:   { bg: 'bg-green-500/[0.10]',   icon: 'text-green-300',   ring: 'ring-green-500/[0.15]',   glow: 'hover:shadow-[0_8px_32px_rgba(34,197,94,0.20)]',   grad: 'from-green-500/[0.14] via-green-500/[0.04]',   iconBg: 'bg-green-500/20 ring-1 ring-green-500/25', accent: '34 197 94'   },
  yellow:  { bg: 'bg-yellow-500/[0.10]',  icon: 'text-yellow-300',  ring: 'ring-yellow-500/[0.15]',  glow: 'hover:shadow-[0_8px_32px_rgba(234,179,8,0.20)]',  grad: 'from-yellow-500/[0.14] via-yellow-500/[0.04]',  iconBg: 'bg-yellow-500/20 ring-1 ring-yellow-500/25', accent: '234 179 8'  },
  red:     { bg: 'bg-red-500/[0.10]',     icon: 'text-red-300',     ring: 'ring-red-500/[0.15]',     glow: 'hover:shadow-[0_8px_32px_rgba(239,68,68,0.20)]',     grad: 'from-red-500/[0.14] via-red-500/[0.04]',     iconBg: 'bg-red-500/20 ring-1 ring-red-500/25', accent: '239 68 68'     },
};

/* ─── field states ──────────────────────────────────────────── */
const blank = {
  title: '', tags: '', notes: '', visibility: 'public' as Visibility,
  // call-to-action button (optional, one per post)
  ctaLabel: '', ctaUrl: '',
  // news
  publisher: '', location: '', sourceUrl: '', newsDate: '',
  // article
  author: '', excerpt: '', content: '',
  // document
  file: null as File | null, textFormat: 'pdf' as 'pdf' | 'docx' | 'txt' | 'html',
  // portfolio
  client: '', projectUrl: '', technologies: '',
  // announcement
  priority: 'medium' as 'high' | 'medium' | 'low', expiresAt: '',
  // job
  company: '', jobLocation: '', jobType: 'onsite' as 'remote' | 'onsite' | 'hybrid', salary: '', requirements: '', description: '',
  jobApplyUrl: '',
  // product
  price: '', features: '', productShopUrl: '', productWhatsapp: '',
  // event
  eventDate: '', eventEndDate: '', eventTime: '', eventVenue: '', eventMode: 'in-person' as 'in-person' | 'online' | 'hybrid', eventUrl: '', eventCapacity: '', eventOrganiser: '',
  // hackathon
  hackThemes: '', hackPrize: '', hackTeamSize: '', hackRegDeadline: '', hackStartDate: '', hackEndDate: '', hackMode: 'in-person' as 'in-person' | 'online' | 'hybrid', hackOrganiser: '', hackProblem: '', hackRegUrl: '',
  // gig
  gigSummary: '', gigCategory: '', gigSkills: '', gigDeliverables: '',
  gigBudget: '', gigTimeline: '', gigEngagement: 'one_time' as 'one_time' | 'ongoing' | 'retainer',
  gigLocation: 'remote' as 'remote' | 'hybrid' | 'onsite',
  gigBidMode: 'fixed' as 'fixed' | 'bidding',
  gigMinBid: '', gigBidDeadline: '', gigApplyUrl: '',
  // post
  postCaption: '',
  // poll
  pollQuestion: '', pollDuration: '7', pollMultiSelect: false as boolean,
  // chart
  chartType: 'bar' as 'bar' | 'line' | 'pie', chartLabels: '', chartValues: '',
  chartType2: 'bar' as 'bar' | 'line' | 'pie', chartLabels2: '', chartValues2: '',
  chartCount: 1 as 1 | 2,
  // survey
  surveyDesc: '',
  // thread
  threadPoints: '',
  // video
  videoUrl: '', videoDuration: '', videoSource: '',
  // milestone
  milestoneMetric: '', milestoneContext: '',
  // tutorial
  tutorialDifficulty: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
  tutorialPrereqs: '',
};

type FieldState = typeof blank;

const blankResume = {
  displayName: '', headline: '', location: '', tags: '', skills: '', summary: '',
  pastedText: '', visibility: 'public' as Visibility,
  category: 'Engineering',
  contactEmail: '', contactLinkedin: '', contactWebsite: '',
  avatarFile: null as File | null, resumeFile: null as File | null,
};

const RESUME_CATEGORIES = [
  'Engineering', 'Design', 'Product', 'Marketing', 'Sales', 'Operations',
  'Finance', 'HR', 'Legal', 'Data Science', 'DevOps', 'Content', 'Research', 'Other',
];

/* One composer screen. The former intent/category/details/preview steps are
   now controls and panels inside it; the category grid is an overlay, not a
   stop on a journey. */
/* The composer is the only screen: Create publication opens it directly.
   Photo-only, caption-only and photo+caption are all still supported — the
   composer simply accepts whichever the author provides. */
type Step = 'compose';

/**
 * A titled group of fields.
 *
 * Deliberately one thin container per group rather than a glass card per
 * field — the panel gives hierarchy, the fields inside keep the product's
 * existing input styling untouched.
 */
function FormSection({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4">
      <div className="mb-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">{label}</h3>
        {hint && <p className="mt-1 text-[11px] leading-snug text-white/30">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/* ─── shared input styles ────────────────────────────────────── */
function Field({ label, children, span, hint, required }: { label: string; children: React.ReactNode; span?: boolean; hint?: string; required?: boolean }) {
  return (
    <div className={span ? 'sm:col-span-2' : ''}>
      <label className="mb-1.5 flex items-center gap-1 text-[11.5px] font-semibold text-white/50">
        {label}
        {required && <span className="text-rose-400/80">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[10.5px] text-white/25 leading-relaxed">{hint}</p>}
    </div>
  );
}

/* The publication body counter. Mirrors the counter the article editor already
   showed, now reading the shared limit so composer and API agree. */
function BodyCounter({ value }: { value: string }) {
  const max = usePublicationMax();
  const used = publicationBodyLength(value);
  /* A quiet warning as the limit approaches, amber once it is reached. */
  const tone = used >= max ? 'text-amber-300/70' : used >= max * 0.9 ? 'text-white/45' : 'text-white/20';
  return (
    <p className={`mt-1 text-right text-[10.5px] ${tone}`}>
      {used} / {max}
    </p>
  );
}

/**
 * The Super Admin limit, fetched once per mount from the existing public
 * feed-config endpoint and published to lib/publication-body so that every
 * clampPublicationBody() call in this file uses it too.
 */
function usePublicationMax(): number {
  const [max, setMax] = useState<number>(getPublicationMax());
  useEffect(() => {
    let cancelled = false;
    fetch('/api/feed-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { publication?: { maxChars?: number } } | null) => {
        const next = d?.publication?.maxChars;
        if (cancelled || typeof next !== 'number') return;
        setConfiguredPublicationMax(next);
        setMax(next);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return max;
}

function OptionalSection({ children, label = 'Add more details' }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sm:col-span-2 mt-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.015] px-3.5 py-2.5 text-[12px] font-semibold text-white/30 transition hover:bg-white/[0.04] hover:text-white/50 hover:border-white/[0.10]"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        {label}
        <span className="ml-auto rounded-full border border-white/[0.07] bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/25">optional</span>
      </button>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 animate-in fade-in slide-in-from-top-2 duration-150">
          {children}
        </div>
      )}
    </div>
  );
}

const inputCls = 'h-9 sm:h-10 w-full rounded-xl border border-white/[0.09] bg-white/[0.04] px-3 sm:px-3.5 text-[13px] sm:text-[13.5px] text-white placeholder:text-white/20 outline-none transition focus:border-white/[0.22] focus:bg-white/[0.06] focus:ring-2 focus:ring-white/[0.06]';
const textareaCls = 'w-full resize-none rounded-xl border border-white/[0.09] bg-white/[0.04] px-3 sm:px-3.5 py-2.5 sm:py-3 text-[13px] sm:text-[13.5px] text-white placeholder:text-white/20 outline-none transition focus:border-white/[0.22] focus:bg-white/[0.06] focus:ring-2 focus:ring-white/[0.06] leading-relaxed';
const selectCls = 'h-9 sm:h-10 w-full cursor-pointer appearance-none rounded-xl border border-white/[0.09] bg-white/[0.04] px-3 sm:px-3.5 text-[13px] sm:text-[13.5px] text-white outline-none transition focus:border-white/[0.22] focus:bg-white/[0.06] focus:ring-2 focus:ring-white/[0.06]';

/* ─── build post HTML gallery ────────────────────────────────── */
const buildPostHtml = async (images: File[], caption: string): Promise<{ dataUrl: string; fileName: string; mimeType: string; sizeInBytes: number }> => {
  const encoded = await Promise.all(images.map(f => fileToDataUrl(f)));
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;background:#000;display:flex;flex-direction:column;align-items:center;padding:24px;font-family:system-ui,sans-serif}h2{color:#fff;font-size:16px;font-weight:500;margin-bottom:16px;max-width:600px;text-align:center}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;max-width:700px;width:100%}img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px}</style></head><body>${caption ? `<h2>${caption.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</h2>` : ''}<div class="grid">${encoded.map(src => `<img src="${src}" alt="" />`).join('')}</div></body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const file = new File([blob], `post_${Date.now()}.html`, { type: 'text/html' });
  return { dataUrl: await fileToDataUrl(file), fileName: file.name, mimeType: 'text/html', sizeInBytes: file.size };
};

const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024; // 2 MB
// Recommended cover image dimensions shown to the user
const THUMB_RECOMMENDED_W = 1200;
const THUMB_RECOMMENDED_H = 630;

/** A pre-request check that failed — the user must be returned to the fields,
    unlike a network/server failure where staying put is correct. */
class PublishValidationError extends Error {}

/* ─── main component ─────────────────────────────────────────── */
export default function PublishAnythingDialog({
  open,
  onOpenChange,
  isAuthenticated,
  initialCategory,
  businessPageId,
  businessPageSlug,
  businessPageName,
  businessLogoUrl,
  onPublished,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  isAuthenticated: boolean;
  /** If set, skip the picker step and jump straight to this category's form when the dialog opens. */
  initialCategory?: CategoryId;
  /** If set, publish is attributed to this business page and a cross-post is created */
  businessPageId?: string;
  businessPageSlug?: string;
  businessPageName?: string;
  businessLogoUrl?: string;
  /** Called after a successful publish with the published item's content */
  onPublished?: (data: { id: string; title: string; content: string; category: string }) => void;
}) {
  const router = useRouter();
  const [step] = useState<Step>('compose');
  /** Category grid, opened from the composer's Category control. */
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Mobile-only preview toggle; desktop shows the preview permanently. */
  const [showPreview, setShowPreview] = useState(false);
  const { data: session } = useSession();
  /* The session JWT deliberately does not carry the avatar — the auth callback
     avoids pulling profile blobs on every request. /api/me/badge is the app's
     existing canonical resolver (same one HomepageNav uses): it derives the
     user from the session server-side and returns UserProfileData.avatarUrl
     with no-store, so a photo changed elsewhere shows up on the next open. */
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [fields, setFields] = useState<FieldState>({ ...blank });
  const [resume, setResume] = useState({ ...blankResume });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successHref, setSuccessHref] = useState<string | null>(null);
  /* Set alongside successHref so the post-publish screen can offer View Post
     and Share. Public posts live at /published/<shareId|id>. */
  const [publishedTitle, setPublishedTitle] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const [catSearch, setCatSearch] = useState('');

  // thumbnail state
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailUrlInput, setThumbnailUrlInput] = useState('');
  const [thumbnailMode, setThumbnailMode] = useState<'upload' | 'url'>('upload');
  const thumbnailRef = useRef<HTMLInputElement>(null);

  // new category state
  const [pollOptions, setPollOptions] = useState<string[]>(['', '', '']);
  const [surveyQuestions, setSurveyQuestions] = useState<{ text: string; type: 'text' | 'rating' | 'yesno' }[]>([{ text: '', type: 'text' }]);
  const [postImages, setPostImages] = useState<File[]>([]);
  const postImagesRef = useRef<HTMLInputElement>(null);
  // product images
  const [productImages, setProductImages] = useState<File[]>([]);
  const productImagesRef = useRef<HTMLInputElement>(null);
  // tutorial steps
  const [tutorialSteps, setTutorialSteps] = useState<{ title: string; desc: string; imageUrl: string }[]>([{ title: '', desc: '', imageUrl: '' }]);

  const fileRef   = useRef<HTMLInputElement>(null);
  const resumeRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<FieldState>) => setFields(f => ({ ...f, ...patch }));

  /* Once per open — not per render, and never polled. The previous value is
     kept while it refreshes so the avatar does not flash back to an initial. */
  useEffect(() => {
    if (!open || !isAuthenticated) return;
    let cancelled = false;
    fetch('/api/me/badge')
      .then(r => (r.ok ? r.json() : null))
      .then((d: { avatarUrl?: string | null } | null) => {
        if (!cancelled && d) setProfileAvatar(d.avatarUrl ?? null);
      })
      .catch(() => { /* keep the initial fallback */ });
    return () => { cancelled = true; };
  }, [open, isAuthenticated]);

  /* ── Call-to-action ───────────────────────────────────────────
     One optional CTA per post. `ctaDraft` is the validated value that goes
     into the publish payload; the server re-validates it either way. */
  const [ctaOpen, setCtaOpen] = useState(false);
  const ctaLabelClean = sanitizeCtaLabel(fields.ctaLabel);
  const ctaUrlClean = sanitizeCtaUrl(fields.ctaUrl);
  const ctaDraft = ctaLabelClean && ctaUrlClean ? { label: ctaLabelClean, url: ctaUrlClean } : null;
  const ctaUrlInvalid = fields.ctaUrl.trim().length > 0 && !ctaUrlClean;

  // reset on open
  useEffect(() => {
    if (open) {
      setError('');
      setSuccessHref(null);
      setFields({ ...blank });
      setResume({ ...blankResume });
      setPollOptions(['', '', '']);
      setSurveyQuestions([{ text: '', type: 'text' }]);
      setPostImages([]);
      setProductImages([]);
      setTutorialSteps([{ title: '', desc: '', imageUrl: '' }]);
      setThumbnailFile(null);
      setThumbnailUrlInput('');
      setThumbnailMode('upload');
      setCatSearch('');
      setConfirmClose(false);
      setPublishedTitle('');
      setShareCopied(false);
      setPickerOpen(false);
      setShowPreview(false);
      /* Opens as a Post composer — the fastest path, and the one most people
         want. A deep link (business page "post a job") still pins its own
         category. */
      setCategory(initialCategory ?? 'post');
      setAnimKey(k => k + 1);
    }
  }, [open, initialCategory]);

  const pickCategory = (id: CategoryId) => {
    setCategory(id);
    setPickerOpen(false);
    setError('');
    setSuccessHref(null);
    setAnimKey(k => k + 1);
  };

  /** Closing the category overlay is the only "back" the composer has. */
  const goBack = () => { setPickerOpen(false); setError(''); };

  /* ── Closing safely ───────────────────────────────────────────────────────
     Cancel, the X, the backdrop and Escape all used to drop everything the
     user had typed without asking. The guard below only interrupts when there
     is something to lose — an untouched wizard still closes on the first
     click. It reads the existing state; it does not track a second copy. */
  const [confirmClose, setConfirmClose] = useState(false);

  const hasUnsavedInput = (): boolean => {
    if (successHref) return false;                        // already published
    if (thumbnailFile || thumbnailUrlInput.trim()) return true;
    if (postImages.length > 0 || productImages.length > 0) return true;
    if (category === 'resume') return JSON.stringify(resume) !== JSON.stringify(blankResume);
    if (JSON.stringify(fields) !== JSON.stringify(blank)) return true;
    if (pollOptions.some(o => o.trim())) return true;
    if (surveyQuestions.some(q => q.text.trim())) return true;
    if (tutorialSteps.some(t => t.title.trim() || t.desc.trim() || t.imageUrl.trim())) return true;
    return false;
  };

  /** Every user-initiated close goes through here. */
  const requestClose = () => {
    if (hasUnsavedInput()) { setConfirmClose(true); return; }
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirmClose) { setConfirmClose(false); return; }
      requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });


  /* Identity for the composer row and the preview. Session data the app has
     already fetched, or the business page being posted as — never a lookup. */
  const authorName = businessPageName || session?.user?.name || 'You';
  const authorAvatar = businessLogoUrl || profileAvatar || session?.user?.image || null;
  /* An email is not a headline, and putting one on a post preview exposes it
     for no benefit. Fall back to the organisation, or show nothing. */
  const authorContext = businessPageName
    ? 'Business page'
    : ((session?.user as { organizationName?: string } | undefined)?.organizationName ?? null);


  /* ── build text body from form ── */
  const buildTextBody = (): string => {
    const f = fields;
    switch (category) {
      case 'news': return [
        `Headline: ${f.title}`,
        f.publisher  && `Publisher: ${f.publisher}`,
        f.newsDate   && `Date: ${f.newsDate}`,
        f.location   && `Location: ${f.location}`,
        f.sourceUrl  && `Source: ${f.sourceUrl}`,
        '',
        f.notes,
      ].filter(Boolean).join('\n');

      case 'article': return [
        `Title: ${f.title}`,
        f.author  && `Author: ${f.author}`,
        f.excerpt && `Excerpt: ${f.excerpt}`,
        '',
        f.content || f.notes,
      ].filter(Boolean).join('\n');

      case 'portfolio': return [
        `Project: ${f.title}`,
        f.client       && `Client: ${f.client}`,
        f.projectUrl   && `URL: ${f.projectUrl}`,
        f.technologies && `Technologies: ${f.technologies}`,
        '',
        f.notes,
      ].filter(Boolean).join('\n');

      case 'announcement': return [
        `Announcement: ${f.title}`,
        `Priority: ${f.priority.toUpperCase()}`,
        f.expiresAt && `Expires: ${f.expiresAt}`,
        '',
        f.notes,
      ].filter(Boolean).join('\n');

      case 'job': return [
        `Job: ${f.title}`,
        f.company      && `Company: ${f.company}`,
        f.jobLocation  && `Location: ${f.jobLocation}`,
        `Type: ${f.jobType}`,
        f.salary       && `Salary: ${f.salary}`,
        f.jobApplyUrl  && `Apply URL: ${f.jobApplyUrl}`,
        '',
        f.description,
        '',
        f.requirements && `Requirements:\n${f.requirements}`,
      ].filter(Boolean).join('\n');

      case 'product': return [
        `Product: ${f.title}`,
        f.price           && `Price: ${f.price}`,
        f.productShopUrl  && `Shop URL: ${f.productShopUrl}`,
        f.productWhatsapp && `WhatsApp: ${f.productWhatsapp}`,
        '',
        f.content || f.notes,
        '',
        f.features && `Features:\n${f.features}`,
      ].filter(Boolean).join('\n');

      case 'event': return [
        `Event: ${f.title}`,
        f.eventOrganiser  && `Organiser: ${f.eventOrganiser}`,
        f.eventDate       && `Date: ${f.eventDate}${f.eventEndDate ? ` – ${f.eventEndDate}` : ''}`,
        f.eventTime       && `Time: ${f.eventTime}`,
        `Mode: ${f.eventMode}`,
        f.eventVenue      && `Venue: ${f.eventVenue}`,
        f.eventUrl        && `Register / Info: ${f.eventUrl}`,
        f.eventCapacity   && `Capacity: ${f.eventCapacity}`,
        '',
        f.notes,
      ].filter(Boolean).join('\n');

      case 'hackathon': return [
        `Hackathon: ${f.title}`,
        f.hackOrganiser    && `Organiser: ${f.hackOrganiser}`,
        f.hackThemes       && `Themes / Tracks: ${f.hackThemes}`,
        f.hackPrize        && `Prize Pool: ${f.hackPrize}`,
        f.hackTeamSize     && `Team Size: ${f.hackTeamSize}`,
        f.hackRegDeadline  && `Registration Deadline: ${f.hackRegDeadline}`,
        f.hackStartDate    && `Event Dates: ${f.hackStartDate}${f.hackEndDate ? ` – ${f.hackEndDate}` : ''}`,
        `Mode: ${f.hackMode}`,
        f.hackRegUrl       && `Registration URL: ${f.hackRegUrl}`,
        '',
        f.hackProblem      && `Problem Statement:\n${f.hackProblem}`,
        '',
        f.notes,
      ].filter(Boolean).join('\n');

      case 'gig': return [
        `Gig: ${f.title}`,
        f.gigCategory  && `Category: ${f.gigCategory}`,
        f.gigBudget    && `Budget: ${f.gigBudget}`,
        f.gigTimeline  && `Timeline: ${f.gigTimeline}`,
        `Engagement: ${f.gigEngagement}`,
        `Location: ${f.gigLocation}`,
        f.gigSkills    && `Skills: ${f.gigSkills}`,
        f.gigApplyUrl  && `Apply URL: ${f.gigApplyUrl}`,
        '',
        f.gigSummary,
        '',
        f.gigDeliverables && `Deliverables:\n${f.gigDeliverables}`,
      ].filter(Boolean).join('\n');

      case 'poll': return [
        `Poll: ${fields.title || 'Untitled Poll'}`,
        `Question: ${fields.pollQuestion}`,
        `Options:\n${pollOptions.filter(Boolean).map((o, i) => `  ${i + 1}. ${o}`).join('\n')}`,
        `Duration: ${fields.pollDuration} days`,
        `Type: ${fields.pollMultiSelect ? 'Multi-select' : 'Single choice'}`,
      ].join('\n\n');

      case 'survey': return [
        `Survey: ${fields.title || 'Untitled Survey'}`,
        fields.surveyDesc && `About: ${fields.surveyDesc}`,
        `Questions:\n${surveyQuestions.map((q, i) => `  Q${i+1}. ${q.text} [${q.type}]`).join('\n')}`,
      ].filter(Boolean).join('\n\n');

      case 'chart': {
        const charts = [
          [`Chart: ${fields.title || 'Untitled Chart'}`, `Type: ${fields.chartType}`, `Labels: ${fields.chartLabels}`, `Values: ${fields.chartValues}`].join('\n'),
        ];
        if (fields.chartCount === 2 && fields.chartLabels2 && fields.chartValues2) {
          charts.push(['===', `Chart: ${fields.title || 'Untitled Chart'} (2)`, `Type: ${fields.chartType2}`, `Labels: ${fields.chartLabels2}`, `Values: ${fields.chartValues2}`].join('\n'));
        }
        return charts.join('\n');
      }

      case 'thread': return [
        `Thread: ${f.title}`,
        '',
        f.threadPoints,
        f.notes && `\nNotes: ${f.notes}`,
      ].filter(Boolean).join('\n');

      case 'video': return [
        `Video: ${f.title}`,
        f.videoUrl      && `URL: ${f.videoUrl}`,
        f.videoDuration && `Duration: ${f.videoDuration}`,
        f.videoSource   && `Source: ${f.videoSource}`,
        '',
        f.notes,
      ].filter(Boolean).join('\n');

      case 'milestone': return [
        `Milestone: ${f.title}`,
        f.milestoneMetric  && `Key metric: ${f.milestoneMetric}`,
        f.milestoneContext && `Context: ${f.milestoneContext}`,
        '',
        f.notes,
      ].filter(Boolean).join('\n');

      case 'tutorial': return ''; // handled via tutorialStepsState below

      case 'post': return f.postCaption || '';

      default: return f.notes || f.content || '';
    }
  };

  /* ── publish ── */
  /* Duplicate-submission lock.
     `busy` alone cannot stop this: setBusy(true) is async, so several clicks
     landing in the same tick all read busy === false and all fire a request —
     measured as 2 publications from 6 rapid clicks. A ref flips synchronously
     on the first call, so the rest return immediately. */
  const publishing = useRef(false);

  const publish = async () => {
    if (publishing.current) return;
    publishing.current = true;
    try {
      await runPublish();
    } finally {
      publishing.current = false;
    }
  };

  const runPublish = async () => {
    if (!category) return;
    setError(''); setSuccessHref(null);

    /* A failed check must land the user next to the field it is about. When
       the attempt came from Preview that means stepping back to the form —
       otherwise the message points at inputs that are not on screen. */
    const invalid = (message: string) => {
      setError(message);
      setPickerOpen(false);   // never leave the message hidden behind the grid
    };

    if (category === 'resume') {
      if (!isAuthenticated) { invalid('Login required to publish a resume.'); return; }
      if (!resume.displayName.trim()) { invalid('Display name is required.'); return; }
      if (!resume.category.trim()) { invalid('Please select a category.'); return; }
      if (!resume.resumeFile && !resume.pastedText.trim()) { invalid('Upload a resume file or paste resume text.'); return; }
      setBusy(true);
      try {
        // 1. Create talent profile
        const fd = new FormData();
        Object.entries(resume).forEach(([k, v]) => {
          if (v instanceof File) fd.append(k, v);
          else if (v !== null && v !== undefined) fd.append(k, String(v));
        });
        const res = await fetch('/api/resumes', { method: 'POST', body: fd });
        const json = await res.json() as { slug?: string; error?: string };
        if (!res.ok) throw new Error(json.error || 'Failed to publish resume.');

        // 2. Also create a published card in the file-directory system
        const resumeBodyLines = [
          resume.headline ? `Headline: ${resume.headline}` : '',
          resume.location ? `Location: ${resume.location}` : '',
          resume.category ? `Category: ${resume.category}` : '',
          resume.skills ? `Skills: ${resume.skills}` : '',
          resume.contactEmail ? `Email: ${resume.contactEmail}` : '',
          resume.contactLinkedin ? `LinkedIn: ${resume.contactLinkedin}` : '',
          '',
          resume.summary?.trim() || resume.pastedText?.trim() || '',
        ].filter(Boolean).join('\n').trim();

        const resumeBlob = new Blob([resumeBodyLines], { type: 'text/plain' });
        const resumeFile = new File([resumeBlob], `resume_${Date.now()}.txt`, { type: 'text/plain' });
        const resumeDataUrl = await fileToDataUrl(resumeFile);

        const publishPayload = {
          fileName: resumeFile.name,
          mimeType: 'text/plain',
          dataUrl: resumeDataUrl,
          sizeInBytes: resumeFile.size,
          directoryCategory: 'resume',
          directoryVisibility: resume.visibility || 'public',
          directoryTags: [resume.category || 'Talent', resume.location].filter(Boolean),
          title: resume.displayName,
          notes: resumeBodyLines,
        };

        let publishedId = '';
        try {
          const pubRes = await fetch('/api/public/file-directory/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(publishPayload),
          });
          if (pubRes.ok) {
            const pubJson = await pubRes.json() as { id?: string };
            publishedId = pubJson.id || '';
          }
        } catch {}

        setResume({ ...blankResume });
        setBusy(false);
        if (publishedId && onPublished) {
          onPublished({ id: publishedId, title: resume.displayName || '', content: resumeBodyLines, category: 'resume' });
        }
        onOpenChange(false);
        router.refresh();
        return;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed.');
        setBusy(false);
        return;
      }
    }

    if (category === 'gig' && !fields.title.trim()) { invalid('Gig title is required.'); return; }
    if (category === 'gig' && !fields.gigSummary.trim()) { invalid('Gig summary is required.'); return; }
    if (category === 'poll' && !fields.pollQuestion.trim()) { invalid('Poll question is required.'); return; }
    if (category === 'poll' && pollOptions.filter(Boolean).length < 2) { invalid('At least 2 poll options are required.'); return; }
    if (category === 'survey' && !surveyQuestions.some(q => q.text.trim())) { invalid('At least 1 survey question is required.'); return; }
    if (category === 'chart' && !fields.chartLabels.trim()) { invalid('Chart labels are required.'); return; }
    if (category === 'chart' && !fields.chartValues.trim()) { invalid('Chart values are required.'); return; }
    if (category === 'post' && !fields.postCaption.trim() && postImages.length === 0) {
      /* Caption, photo, or both — any one of them is a publishable post. */
      invalid('Add a caption or at least one image.'); return;
    }
    if (category === 'tutorial' && !tutorialSteps.some(s => s.title.trim())) { invalid('Add at least one step.'); return; }

    /* The body limit, measured exactly as the publish API measures it — the
       structured fields and the title never count towards it, so a long
       headline with a full-length body still publishes. The per-field caps
       above stop this being reached by typing; it catches the cases where a
       category composes its body from more than one field. */
    if (isPublicationBodyOverLimit(category === 'post' ? fields.postCaption : buildTextBody(), category)) {
      invalid(PUBLICATION_BODY_ERROR); return;
    }

    /* Fields the forms already mark with * but nothing enforced — the UI
       promised a rule the validator did not apply, so a user could publish a
       Job with no title. Wording follows the existing "X is required." style. */
    if (category === 'news'         && !fields.notes.trim())       { invalid('Summary is required.'); return; }
    if (category === 'article'      && !fields.content.trim())     { invalid('Article body is required.'); return; }
    if (category === 'portfolio'    && !fields.notes.trim())       { invalid('Project description is required.'); return; }
    if (category === 'announcement' && !fields.notes.trim())       { invalid('Announcement message is required.'); return; }
    if (category === 'job'          && !fields.title.trim())       { invalid('Job title is required.'); return; }
    if (category === 'job'          && !fields.description.trim()) { invalid('Job description is required.'); return; }
    if (category === 'product'      && !fields.title.trim())       { invalid('Product name is required.'); return; }
    if (category === 'event'        && !fields.title.trim())       { invalid('Event name is required.'); return; }
    if (category === 'event'        && !fields.notes.trim())       { invalid('Event description is required.'); return; }
    if (category === 'hackathon'    && !fields.title.trim())       { invalid('Hackathon name is required.'); return; }
    if (category === 'milestone'    && !fields.notes.trim())       { invalid('Milestone story is required.'); return; }
    /* buildTextBody() emits a literal "Thread: " prefix, so an entirely empty
       thread still produced non-empty body text and slipped past the generic
       empty-content guard below. */
    if (category === 'thread' && !fields.title.trim() && !fields.threadPoints.trim()) {
      invalid('Add a thread title or your first entry.'); return;
    }
    if (category === 'video') {
      if (!fields.videoUrl.trim()) { invalid('Video URL is required.'); return; }
      // Same vetting the CTA uses — no second URL rule invented for this field.
      if (!sanitizeCtaUrl(fields.videoUrl)) { invalid('Enter a valid http:// or https:// video URL.'); return; }
    }

    const isDoc = category === 'document';
    const hasFile = Boolean(isDoc && fields.file);

    setBusy(true);
    try {
      let dataUrl = '', fileName = '', mimeType = '', sizeInBytes = 0;

      // product: handle multiple images (pack into gallery html)
      if (category === 'product' && productImages.length > 0) {
        const gallery = await buildPostHtml(productImages, fields.title);
        dataUrl = gallery.dataUrl; fileName = gallery.fileName; mimeType = gallery.mimeType; sizeInBytes = gallery.sizeInBytes;
      }
      // tutorial: build structured text body from steps
      else if (category === 'tutorial') {
        const validSteps = tutorialSteps.filter(s => s.title.trim());
        const stepsText = validSteps.map((s, i) =>
          [`Step ${i + 1}: ${s.title}`, s.desc.trim() && `Description: ${s.desc}`, s.imageUrl.trim() && `Image: ${s.imageUrl}`].filter(Boolean).join('\n')
        ).join('\n\n');
        const tutorialBody = [
          `Tutorial: ${fields.title || 'Untitled Tutorial'}`,
          `Difficulty: ${fields.tutorialDifficulty}`,
          fields.tutorialPrereqs.trim() ? `Prerequisites: ${fields.tutorialPrereqs}` : '',
          '',
          stepsText,
        ].filter(Boolean).join('\n');
        const blob = new Blob([tutorialBody], { type: 'text/plain' });
        const f = new File([blob], `tutorial_${Date.now()}.txt`, { type: 'text/plain' });
        dataUrl = await fileToDataUrl(f); fileName = f.name; mimeType = 'text/plain'; sizeInBytes = f.size;
      }
      // post: handle images — compress first to keep payload manageable
      else if (category === 'post' && postImages.length > 0) {
        const compressed = await Promise.all(postImages.map(img => compressImage(img)));
        if (compressed.length === 1) {
          const img = compressed[0];
          dataUrl = await fileToDataUrl(img);
          fileName = img.name; mimeType = img.type || 'image/jpeg'; sizeInBytes = img.size;
        } else {
          const gallery = await buildPostHtml(compressed, fields.postCaption);
          dataUrl = gallery.dataUrl; fileName = gallery.fileName; mimeType = gallery.mimeType; sizeInBytes = gallery.sizeInBytes;
        }
      } else if (hasFile && fields.file) {
        const file = fields.file;
        const isImage = file.type.startsWith('image/');
        if (fields.visibility === 'public') {
          const limit = isImage ? MAX_PUBLIC_IMAGE_BYTES : MAX_PUBLIC_FILE_BYTES;
          if (file.size > limit) throw new PublishValidationError(`File too large for public publishing (max ${formatBytes(limit)}).`);
        }
        dataUrl = await fileToDataUrl(file);
        fileName = file.name; mimeType = file.type || 'application/octet-stream'; sizeInBytes = file.size;
      } else {
        const text = buildTextBody();
        if (!text.trim() && !fields.title.trim()) { throw new PublishValidationError('Add content to publish.'); }
        const titleBase = (fields.title.trim() || category).replace(/[^\w\s-]+/g, '').trim().replace(/\s+/g, '_') || 'post';
        const fmt = isDoc ? fields.textFormat : 'txt';
        const isNewCat = ['post', 'poll', 'survey', 'chart', 'thread', 'video', 'milestone', 'tutorial'].includes(category);
        if (fmt === 'txt' || fmt === 'html' || isNewCat) {
          const mime = fmt === 'html' ? 'text/html' : 'text/plain';
          const ext = isNewCat ? 'txt' : fmt;
          const blob = new Blob([text], { type: mime });
          const f = new File([blob], `${titleBase}.${ext}`, { type: blob.type });
          dataUrl = await fileToDataUrl(f); fileName = f.name; mimeType = blob.type; sizeInBytes = blob.size;
        } else {
          const html = `<div class="docword-export-page-flow"><div class="docword-export-body">${text.split(/\n{2,}/).map(p => `<p>${p.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br/>')}</p>`).join('')}</div></div>`;
          const ep = fmt === 'docx' ? '/api/docword/export/docx' : '/api/docword/export/pdf';
          const r = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: fields.title || category, html, documentTheme: 'classic', exportProfile: 'compact' }) });
          if (!r.ok) { const e = await r.json().catch(() => null) as any; throw new Error(e?.error || `Failed to build ${fmt.toUpperCase()}.`); }
          const blob = await r.blob();
          const f = new File([blob], `${titleBase}.${fmt}`, { type: blob.type });
          dataUrl = await fileToDataUrl(f); fileName = f.name; mimeType = blob.type || 'application/octet-stream'; sizeInBytes = blob.size;
        }
      }

      // ── Resolve thumbnail ────────────────────────────────────────────────
      // Priority: 1) explicitly uploaded/pasted cover  2) auto-derive from images
      let resolvedThumbnailUrl: string | undefined;

      if (thumbnailMode === 'upload' && thumbnailFile) {
        if (thumbnailFile.size > MAX_THUMBNAIL_BYTES) throw new PublishValidationError(`Thumbnail too large (max ${formatBytes(MAX_THUMBNAIL_BYTES)}).`);
        resolvedThumbnailUrl = await fileToDataUrl(thumbnailFile);
      } else if (thumbnailMode === 'url' && thumbnailUrlInput.trim()) {
        resolvedThumbnailUrl = thumbnailUrlInput.trim();
      }

      // Auto-derive from first post/product image when no explicit cover was provided
      if (!resolvedThumbnailUrl) {
        if (category === 'post' && postImages.length > 0) {
          const thumb = await compressImage(postImages[0], 800, 0.75);
          resolvedThumbnailUrl = await fileToDataUrl(thumb);
        } else if (category === 'product' && productImages.length > 0) {
          const thumb = await compressImage(productImages[0], 800, 0.75);
          resolvedThumbnailUrl = await fileToDataUrl(thumb);
        }
        // For document/image uploads, the main dataUrl is image — backend handles it automatically
      }

      const endpoint = fields.visibility === 'public' ? '/api/public/file-directory/publish' : '/api/file-transfers';
      const contentBody = (category === 'post' ? fields.postCaption : buildTextBody()).trim() || undefined;
      // Photo posts have no title field — never fall back to the category id,
      // otherwise the literal word "post" is stored and rendered as the title.
      const resolvedTitle = fields.title.trim() || (category === 'post' ? '' : category);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: resolvedTitle || undefined,
          fileName, mimeType, dataUrl, sizeInBytes,
          notes: contentBody,
          directoryVisibility: fields.visibility,
          directoryCategory: category,
          directoryTags: fields.tags.split(',').map(t => t.trim()).filter(Boolean),
          authMode: fields.visibility === 'public' ? 'public' : 'password',
          videoUrl: category === 'video' && fields.videoUrl.trim() ? fields.videoUrl.trim() : undefined,
          thumbnailUrl: resolvedThumbnailUrl,
          // Structured CTA — the server re-validates and drops it if unsafe.
          cta: ctaDraft ?? undefined,
          // Business page attribution — if publishing from a company page
          uploadedByName: businessPageName || undefined,
          avatarUrl: businessLogoUrl || undefined,
          businessPageSlug: businessPageSlug || undefined,
          businessPageId: businessPageId || undefined,
        }),
      });
      const p = await res.json().catch(() => null) as any;
      if (!res.ok) throw new Error(p?.error || 'Publish failed.');
      const transfer = p?.transfer || p;
      const publishedId = transfer?.id;
      // Reset all state
      setFields({ ...blank });
      setPostImages([]);
      setProductImages([]);
      setTutorialSteps([{ title: '', desc: '', imageUrl: '' }]);
      setPollOptions(['', '', '']);
      setSurveyQuestions([{ text: '', type: 'text' }]);
      setThumbnailFile(null);
      setThumbnailUrlInput('');
      setThumbnailMode('upload');
      if (fileRef.current) fileRef.current.value = '';
      if (thumbnailRef.current) thumbnailRef.current.value = '';
      // Fire onPublished callback so callers (e.g. business page) can cross-post
      if (publishedId && onPublished) {
        onPublished({
          id: publishedId,
          title: resolvedTitle,
          content: contentBody || '',
          category,
        });
      }
      /* Show the success screen instead of closing. The surrounding page is
         still refreshed so the new post appears behind the dialog. */
      setPublishedTitle(resolvedTitle || '');
      if (publishedId && fields.visibility === 'public') {
        const shareId = (transfer as { shareId?: string })?.shareId || publishedId;
        setSuccessHref(`/published/${shareId}`);
        router.refresh();
      } else {
        setSuccessHref(publishedId ? `/transfer/${publishedId}` : '/file-directory');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Publish failed.';
      // Validation → back to the fields. Server/network failure → stay put so
      // the user can simply retry from where they are.
      if (e instanceof PublishValidationError) invalid(message); else setError(message);
    }
    finally { setBusy(false); }
  };

  if (!open) return null;

  const activeCat = category ? CATEGORIES.find(c => c.id === category) : null;
  /* Publishing from this composer is always public: the private option was
     removed from the UI, so there is no longer a variable to branch on. The
     form's `visibility` field still defaults to 'public' and is what the
     request actually carries — see the publish() body. */

  const filteredCats = catSearch.trim()
    ? CATEGORIES.filter(c =>
        c.label.toLowerCase().includes(catSearch.toLowerCase()) ||
        c.desc.toLowerCase().includes(catSearch.toLowerCase())
      )
    : CATEGORIES;

  return (
    <>
    {/* Publishing loader overlay */}
    {busy && (
      <div className="fixed inset-0 z-[500] flex flex-col items-center justify-center bg-black/85 backdrop-blur-xl">
        <div className="flex flex-col items-center gap-7">
          <div className="relative h-[72px] w-[72px]">
            <div className="absolute inset-0 rounded-full border-[3px] border-white/[0.08]" />
            <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-white animate-spin" style={{ animationDuration: '0.9s' }} />
            <div className="absolute inset-[9px] rounded-full border-[2px] border-transparent border-t-white/35 animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white/50" />
            </div>
          </div>
          <div className="text-center space-y-1.5">
            <p className="text-[15px] font-bold text-white tracking-[-0.02em]">Publishing…</p>
            <p className="text-[12.5px] text-white/35">Preparing your content for the world</p>
          </div>
          <div className="w-44 h-[3px] rounded-full bg-white/[0.08] overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-white/50 to-white/80 animate-[shimmer_1.4s_ease-in-out_infinite]" style={{ width: '70%' }} />
          </div>
        </div>
      </div>
    )}

    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4 md:p-6 pb-[84px] sm:pb-0 px-0 sm:px-4"
      onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-lg animate-in fade-in duration-200" aria-hidden="true" />

      {/* Dialog */}
      {/* The composer fills the height the app actually leaves free on a phone —
          the global bottom nav is z-9995 and outranks this dialog — and becomes
          a wide panel with room for the live preview from lg up. */}
      <div className="relative flex w-full flex-col overflow-hidden
        h-[calc(100dvh-84px)] max-h-[calc(100dvh-84px)] rounded-none pt-[env(safe-area-inset-top)]
        sm:h-auto sm:max-h-[88dvh] sm:rounded-[28px] sm:pt-0
        max-w-[680px] lg:max-w-[1020px]
        border border-white/[0.08] bg-[#0a0a0e]
        shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_-1px_0_0_rgba(255,255,255,0.06),0_32px_80px_rgba(0,0,0,0.98)]
        animate-in fade-in slide-in-from-bottom-4 [animation-duration:200ms] [animation-timing-function:cubic-bezier(0.25,0.75,0,1)]
        motion-reduce:animate-none
        sm:zoom-in-[99%] sm:[animation-duration:180ms]">

        {confirmClose && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center p-5"
            role="alertdialog"
            aria-modal="true"
            aria-label="Discard this publication?"
          >
            <div className="absolute inset-0 bg-black/70" onClick={() => setConfirmClose(false)} />
            <div className="relative w-full max-w-[340px] rounded-2xl border border-white/[0.10] bg-[#111116] p-5
              shadow-[0_24px_60px_rgba(0,0,0,0.6)]
              animate-in fade-in zoom-in-[98%] [animation-duration:170ms] motion-reduce:animate-none">
              <p className="text-[14px] font-bold text-white">Discard this publication?</p>
              <p className="mt-1 text-[12px] leading-relaxed text-white/45">Your changes will not be saved.</p>
              <div className="mt-4 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  autoFocus
                  onClick={() => setConfirmClose(false)}
                  className="h-9 shrink-0 whitespace-nowrap rounded-xl border border-white/[0.10] bg-transparent px-4 text-[13px] font-medium text-white/60 transition hover:bg-white/[0.06] hover:text-white"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmClose(false); onOpenChange(false); }}
                  className="h-9 shrink-0 whitespace-nowrap rounded-xl border border-red-500/30 bg-red-500/[0.14] px-4 text-[13px] font-bold text-red-300 transition hover:bg-red-500/25 hover:text-red-200"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}


        {/* ── Close ──
            The header bar (sparkles mark, "Create publication", its subtitle
            and the mobile Preview toggle) is gone; the composer now opens
            straight onto the author's own row, which is the first thing worth
            reading. Only the close affordance survives, as a small floating
            control so it costs no vertical space — `absolute` inside the
            dialog's own stacking context, above the scroll area but below the
            category picker overlay.

            The mobile Preview toggle it used to hold has moved to the footer
            beside Cancel: the panel it controls is still there, and deleting
            the only way to reach it would have removed a working feature
            rather than a header. */}
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-20 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-[#0a0a0e]/80 text-white/40 backdrop-blur-md transition hover:bg-white/[0.09] hover:text-white active:scale-95"
        >
          <X className="h-4 w-4" />
        </button>

        {/* ── Composer ──────────────────────────────────────────────────────
            One screen. Editing on the left, a live card preview on the right
            where there is room for it. Everything the old steps collected is
            still here, just reachable without a journey. */}
        {!successHref && step === 'compose' && (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* Editor */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4 sm:px-6 sm:py-5 scrollbar-minimal overscroll-contain">
              <div key={animKey} className="mx-auto w-full max-w-[620px] animate-in fade-in [animation-duration:180ms] motion-reduce:animate-none">

                {/* Who is posting — real session/page identity, never invented. */}
                <div className="flex items-center gap-2.5">
                  <IdentityAvatar src={authorAvatar} name={authorName} />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-white/85">{authorName}</p>
                    <p className="text-[10.5px] text-white/35">Anyone on Docrud</p>
                  </div>
                </div>

                {/* Post is the default: one box, start typing. Other categories
                    bring their own fields instead. */}
                {category === 'post' ? (
                  (
                  <>
                    <textarea
                      autoFocus
                      rows={5}
                      value={fields.postCaption}
                      onChange={e => set({ postCaption: clampPublicationBody(e.target.value) })}
                      placeholder="What's on your mind?"
                      className="mt-3.5 w-full resize-none bg-transparent text-[15px] leading-relaxed text-white placeholder:text-white/25 outline-none"
                    />
                    <BodyCounter value={fields.postCaption} />
                  </>
                  )
                ) : (
                  <div className="mt-4">
                    <FormSection label={`${activeCat?.label ?? 'Category'} details`}>
                      <div className="space-y-4">
                        {category === 'poll'         && <PollForm fields={fields} set={set} pollOptions={pollOptions} setPollOptions={setPollOptions} />}
                        {category === 'survey'       && <SurveyForm fields={fields} set={set} surveyQuestions={surveyQuestions} setSurveyQuestions={setSurveyQuestions} />}
                        {category === 'chart'        && <ChartForm fields={fields} set={set} />}
                        {category === 'news'         && <NewsForm fields={fields} set={set} />}
                        {category === 'article'      && <ArticleForm fields={fields} set={set} />}
                        {category === 'document'     && <DocumentForm fields={fields} set={set} fileRef={fileRef} />}
                        {category === 'portfolio'    && <PortfolioForm fields={fields} set={set} />}
                        {category === 'announcement' && <AnnouncementForm fields={fields} set={set} />}
                        {category === 'job'          && <JobForm fields={fields} set={set} />}
                        {category === 'resume'       && <ResumeForm resume={resume} setResume={setResume} isAuthenticated={isAuthenticated} resumeRef={resumeRef} avatarRef={avatarRef} />}
                        {category === 'product'      && <ProductForm fields={fields} set={set} productImages={productImages} setProductImages={setProductImages} productImagesRef={productImagesRef} />}
                        {category === 'event'        && <EventForm fields={fields} set={set} />}
                        {category === 'hackathon'    && <HackathonForm fields={fields} set={set} />}
                        {category === 'gig'          && <GigForm fields={fields} set={set} />}
                        {category === 'thread'       && <ThreadForm fields={fields} set={set} />}
                        {category === 'video'        && <VideoForm fields={fields} set={set} />}
                        {category === 'milestone'    && <MilestoneForm fields={fields} set={set} />}
                        {category === 'tutorial'     && <TutorialForm fields={fields} set={set} steps={tutorialSteps} setSteps={setTutorialSteps} />}
                      </div>
                    </FormSection>
                  </div>
                )}

                {/* Media — the Task 4 component, in place, not on another screen. */}
                {category && (
                  <div className="mt-4">
                    <ThumbnailSection
                      category={category}
                      thumbnailFile={thumbnailFile}
                      thumbnailUrlInput={thumbnailUrlInput}
                      thumbnailMode={thumbnailMode}
                      onFileChange={setThumbnailFile}
                      onUrlChange={setThumbnailUrlInput}
                      onModeChange={setThumbnailMode}
                      thumbnailRef={thumbnailRef}
                      postImages={category === 'post' ? postImages : undefined}
                      postImagesRef={category === 'post' ? postImagesRef : undefined}
                      setPostImages={category === 'post' ? setPostImages : undefined}
                    />
                  </div>
                )}

                {/* Controls: category, visibility, CTA — compact, collapsed. */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/[0.09] bg-white/[0.04] px-3 text-[12px] font-semibold text-white/70 transition hover:bg-white/[0.09] hover:text-white"
                  >
                    {activeCat && <activeCat.icon className="h-3.5 w-3.5" />}
                    {activeCat?.label ?? 'Category'}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>

                  {/* Publishing is public. Not a toggle any more: with one
                      option a segmented control asks the author to choose
                      between a thing and nothing. It stays visible because
                      "who will see this" is worth stating before someone
                      presses Publish — it just states it instead of asking.
                      `visibility` already defaults to 'public' in the blank
                      form, so nothing downstream changes. */}
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.09] bg-white/[0.04] px-3 text-[12px] font-semibold text-white/70">
                    <Globe className="h-3.5 w-3.5" /> Public
                  </span>

                  {!ctaOpen && !ctaDraft && (
                    <button
                      type="button"
                      onClick={() => setCtaOpen(true)}
                      className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/[0.09] bg-white/[0.04] px-3 text-[12px] font-semibold text-white/60 transition hover:bg-white/[0.09] hover:text-white"
                    >
                      <Plus className="h-3 w-3" /> Add CTA
                    </button>
                  )}
                  {!ctaOpen && ctaDraft && (
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/[0.14] bg-white/[0.08] px-3 text-[12px] font-semibold text-white/85">
                      {ctaDraft.label} <span aria-hidden>&rarr;</span>
                      <button type="button" onClick={() => setCtaOpen(true)} aria-label="Edit call to action" className="ml-1 text-white/45 hover:text-white">Edit</button>
                      <button type="button" onClick={() => set({ ctaLabel: '', ctaUrl: '' })} aria-label="Remove call to action" className="text-white/45 hover:text-white"><X className="h-3 w-3" /></button>
                    </span>
                  )}
                </div>

                {/* CTA editor — same fields, same sanitisation as before. */}
                {ctaOpen && (
                  <div className="mt-3 rounded-xl border border-white/[0.09] bg-white/[0.025] p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[11px] text-white/40">Button text</label>
                        <input className={inputCls} value={fields.ctaLabel} maxLength={CTA_LABEL_MAX}
                          onChange={e => set({ ctaLabel: e.target.value })} placeholder="Learn more" />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-white/40">Link</label>
                        <input className={inputCls} value={fields.ctaUrl} inputMode="url"
                          onChange={e => set({ ctaUrl: e.target.value })} placeholder="https://example.com" />
                      </div>
                    </div>
                    {ctaUrlInvalid && <p className="mt-1.5 text-[11px] text-rose-300/80">Enter a valid http:// or https:// link.</p>}
                    <div className="mt-2.5 flex items-center justify-end gap-2">
                      <button type="button" onClick={() => { set({ ctaLabel: '', ctaUrl: '' }); setCtaOpen(false); }}
                        className="h-8 rounded-lg px-3 text-[12px] font-medium text-white/45 transition hover:text-white">Cancel</button>
                      <button type="button" onClick={() => setCtaOpen(false)} disabled={!ctaDraft}
                        className="h-8 rounded-lg border border-white/[0.12] bg-white/[0.08] px-3 text-[12px] font-semibold text-white/85 transition hover:bg-white/[0.14] disabled:opacity-40">Done</button>
                    </div>
                  </div>
                )}

                {error && (
                  <div
                    role="alert"
                    ref={el => { el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }}
                    className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-500/[0.18] bg-red-500/[0.07] px-3.5 py-2.5 text-[12.5px] text-red-400"
                  >
                    <X className="h-3.5 w-3.5 mt-px shrink-0 opacity-70" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Mobile preview lives under the editor, not on another page. */}
                {showPreview && (
                  <div className="mt-5 lg:hidden">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">Preview</p>
                    <PublishPreviewCard
                      category={category} activeCat={activeCat} fields={fields} resume={resume}
                      thumbnailFile={thumbnailFile} thumbnailUrlInput={thumbnailUrlInput} thumbnailMode={thumbnailMode}
                      postImages={postImages} productImages={productImages} pollOptions={pollOptions} tutorialSteps={tutorialSteps}
                      authorName={authorName} authorAvatar={authorAvatar} authorContext={authorContext} cta={ctaDraft}
                    />
                  </div>
                )}

                <div className="h-4" />
              </div>
            </div>

            {/* Live preview — permanent where there is width for it. */}
            <aside className="hidden lg:flex w-[340px] shrink-0 flex-col overflow-y-auto border-l border-white/[0.06] bg-white/[0.012] px-5 py-5 scrollbar-minimal">
              <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">Preview</p>
              <PublishPreviewCard
                category={category} activeCat={activeCat} fields={fields} resume={resume}
                thumbnailFile={thumbnailFile} thumbnailUrlInput={thumbnailUrlInput} thumbnailMode={thumbnailMode}
                postImages={postImages} productImages={productImages} pollOptions={pollOptions} tutorialSteps={tutorialSteps}
                authorName={authorName} authorAvatar={authorAvatar} authorContext={authorContext} cta={ctaDraft}
              />
              <p className="mt-3 text-[10.5px] leading-relaxed text-white/25">Updates as you type.</p>
            </aside>

            {/* Category grid — an overlay over the composer, not a step. */}
            {pickerOpen && (
              <div className="absolute inset-0 z-20 flex flex-col bg-[#0a0a0e] animate-in fade-in [animation-duration:170ms] motion-reduce:animate-none">
                <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-3.5 sm:px-6">
                  <div>
                    <h3 className="text-[14px] font-bold text-white">Choose a category</h3>
                    <p className="mt-0.5 text-[10.5px] text-white/35">Select the category that best describes your publication.</p>
                  </div>
                  <button type="button" onClick={goBack} aria-label="Close category picker"
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-white/45 transition hover:bg-white/[0.09] hover:text-white">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 sm:p-4 scrollbar-minimal">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 lg:grid-cols-4">
                    {CATEGORIES.map(({ id, label, icon: Icon, desc, color }) => {
                      const c = CAT_COLORS[color] ?? CAT_COLORS['neutral'];
                      const selected = category === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => pickCategory(id)}
                          aria-pressed={selected}
                          aria-label={`${label}. ${desc}.`}
                          style={{ ['--cat-accent' as string]: c.accent }}
                          className={[
                            'publish-category-card group relative flex flex-col gap-2 overflow-hidden rounded-2xl p-3 text-left backdrop-blur-xl backdrop-saturate-150',
                            selected ? 'bg-white/[0.075]' : 'bg-white/[0.03] hover:bg-white/[0.055]',
                          ].join(' ')}
                        >
                          <div aria-hidden className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${c.grad} to-transparent transition-opacity duration-200 motion-reduce:transition-none ${selected ? 'opacity-100' : 'opacity-60 group-hover:opacity-90'}`} />
                          <div className="relative flex items-start justify-between gap-2">
                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${c.iconBg}`}>
                              <Icon className={`h-4 w-4 ${c.icon}`} />
                            </span>
                            {selected
                              ? <CheckCircle2 className="h-4 w-4 shrink-0 text-white" />
                              : <ArrowRight className={`h-3.5 w-3.5 shrink-0 ${c.icon} opacity-25 transition-opacity duration-200 group-hover:opacity-70 motion-reduce:transition-none`} />}
                          </div>
                          <div className="relative min-w-0">
                            <p className={`text-[12px] font-bold leading-tight tracking-[-0.01em] ${selected ? 'text-white' : 'text-white/85'}`}>{label}</p>
                            <p className="mt-1 text-[10.5px] leading-snug text-white/40 line-clamp-2">{desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Published successfully ── */}
        {successHref && (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/[0.12] ring-1 ring-emerald-500/25">
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            </span>
            <p className="mt-4 text-[16px] font-bold text-white">Published successfully</p>
            {publishedTitle && (
              <p className="mt-1 max-w-[380px] truncate text-[12.5px] text-white/40">{publishedTitle}</p>
            )}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
              <Link
                href={successHref}
                className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl bg-white px-4 text-[13px] font-bold text-[#09090c] transition hover:bg-white/90"
              >
                View post <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <button
                type="button"
                onClick={async () => {
                  const url = `${window.location.origin}${successHref}`;
                  try { await navigator.clipboard.writeText(url); } catch { /* clipboard unavailable */ }
                  setShareCopied(true);
                  setTimeout(() => setShareCopied(false), 1800);
                }}
                className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/[0.10] bg-white/[0.04] px-4 text-[13px] font-semibold text-white/70 transition hover:bg-white/[0.09] hover:text-white"
              >
                {shareCopied ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> Link copied</> : <><Link2 className="h-3.5 w-3.5" /> Share</>}
              </button>
              <button
                type="button"
                /* Straight back to step 1 with a clean slate — the reset the
                   open-effect already performs, without closing the dialog. */
                onClick={() => {
                  setSuccessHref(null); setPublishedTitle(''); setError('');
                  setFields({ ...blank }); setResume({ ...blankResume });
                  setPollOptions(['', '', '']); setSurveyQuestions([{ text: '', type: 'text' }]);
                  setTutorialSteps([{ title: '', desc: '', imageUrl: '' }]);
                  setPostImages([]); setProductImages([]);
                  setThumbnailFile(null); setThumbnailUrlInput(''); setThumbnailMode('upload');
                  setCategory(initialCategory ?? 'post');
                  setPickerOpen(false); setShowPreview(false); setCtaOpen(false); setAnimKey(k => k + 1);
                }}
                className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/[0.10] bg-white/[0.04] px-4 text-[13px] font-semibold text-white/70 transition hover:bg-white/[0.09] hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" /> Create another
              </button>
            </div>
          </div>
        )}

        {/* ── Footer ── one primary action, nothing competing with it. */}
        {!successHref && !pickerOpen && step === 'compose' && (
          <div
            className="flex shrink-0 items-center justify-end gap-2.5 border-t border-white/[0.06] bg-[#0a0a0e] px-5 py-3.5 sm:px-6 sm:py-4"
            style={{ paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom))' }}
          >
            {/* Preview, on phones only — the panel it toggles is `lg:hidden`
                and desktop shows the preview permanently beside the editor.
                It lived in the header that this change removed; without a
                home here, the mobile preview would still exist but be
                unreachable, which is a deleted feature dressed as a tidy-up. */}
            <button
              type="button"
              onClick={() => setShowPreview(v => !v)}
              aria-pressed={showPreview}
              className={`lg:hidden mr-auto inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/[0.07] px-3.5 text-[13px] font-medium transition ${showPreview ? 'bg-white/[0.10] text-white' : 'bg-transparent text-white/45 hover:bg-white/[0.05] hover:text-white'}`}
            >
              <Eye className="h-3.5 w-3.5" /> Preview
            </button>
            <button
              type="button"
              onClick={requestClose}
              className="h-9 shrink-0 whitespace-nowrap rounded-xl border border-white/[0.07] bg-transparent px-4 sm:px-5 text-[13px] font-medium text-white/45 transition hover:bg-white/[0.05] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void publish()}
              disabled={busy}
              className="inline-flex h-9 min-w-[120px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white px-5 sm:px-6 text-[13px] font-bold text-[#09090c] shadow-[0_4px_20px_rgba(255,255,255,0.12),0_2px_8px_rgba(0,0,0,0.3)] transition-all duration-[170ms] hover:bg-white/90 active:scale-[0.97] disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              {busy ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#09090c]/30 border-t-[#09090c]" />
                  Publishing…
                </>
              ) : (
                <>Publish</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* hidden file inputs */}
      <input ref={fileRef} type="file" className="hidden" onChange={e => set({ file: e.target.files?.[0] ?? null })} />
      <input ref={resumeRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.txt" onChange={e => setResume(r => ({ ...r, resumeFile: e.target.files?.[0] ?? null }))} />
      <input ref={avatarRef} type="file" className="hidden" accept="image/*" onChange={e => setResume(r => ({ ...r, avatarFile: e.target.files?.[0] ?? null }))} />
      <input
        ref={thumbnailRef}
        type="file"
        className="hidden"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={e => {
          const f = e.target.files?.[0] ?? null;
          setThumbnailFile(f);
          if (thumbnailRef.current) thumbnailRef.current.value = '';
        }}
      />
      <input
        ref={postImagesRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*"
        onChange={e => {
          const files = Array.from(e.target.files ?? []);
          setPostImages(prev => [...prev, ...files].slice(0, 6));
          if (postImagesRef.current) postImagesRef.current.value = '';
        }}
      />
      <input
        ref={productImagesRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*"
        onChange={e => {
          const files = Array.from(e.target.files ?? []);
          setProductImages(prev => [...prev, ...files].slice(0, 6));
          if (productImagesRef.current) productImagesRef.current.value = '';
        }}
      />
    </div>
    </>
  );
}

/* ─────────────────── new category forms ─────────────────────── */

function PostForm({
  fields: f,
  set,
  postImages,
  setPostImages,
  postImagesRef,
}: {
  fields: FieldState;
  set: (p: Partial<FieldState>) => void;
  postImages: File[];
  setPostImages: React.Dispatch<React.SetStateAction<File[]>>;
  postImagesRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={ImageIcon} label="Photo post" />
      <div className="grid gap-3">
        <Field label="Caption" span>
          <textarea
            className={textareaCls}
            rows={4}
            value={f.postCaption}
            onChange={e => set({ postCaption: e.target.value })}
            placeholder="What's on your mind?"
          />
        </Field>

        {/* image upload zone */}
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-white/55">
            Images{postImages.length > 0 ? ` (${postImages.length}/6)` : ' (up to 6)'}
          </label>
          {postImages.length < 6 && (
            <button
              type="button"
              onClick={() => postImagesRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.15] bg-white/[0.02] py-6 text-center transition hover:border-white/25 hover:bg-white/[0.04]"
            >
              <Upload className="h-5 w-5 text-white/30" />
              <span className="text-sm font-medium text-white/50">Click to add images</span>
              <span className="text-[11px] text-white/25">PNG, JPG, GIF · up to 6 total</span>
            </button>
          )}
          {postImages.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {postImages.map((img, i) => (
                <PostImageTile
                  key={`${img.name}-${img.size}-${img.lastModified}-${i}`}
                  file={img}
                  index={i}
                  onRemove={() => setPostImages(prev => prev.filter((_, j) => j !== i))}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PollForm({
  fields: f,
  set,
  pollOptions,
  setPollOptions,
}: {
  fields: FieldState;
  set: (p: Partial<FieldState>) => void;
  pollOptions: string[];
  setPollOptions: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={ListChecks} label="Poll" />
      <div className="grid gap-3 sm:grid-cols-2">
        {/* The question is the poll — it leads, and the optional name follows. */}
        <Field label="Question" required span>
          <textarea
            className={textareaCls}
            rows={3}
            value={f.pollQuestion}
            onChange={e => set({ pollQuestion: clampPublicationBody(e.target.value) })}
            placeholder="Ask your audience something…"
          />
          <BodyCounter value={f.pollQuestion} />
        </Field>
        <Field label="Poll title (optional)" span>
          <input className={inputCls} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="Give your poll a name…" />
        </Field>

        <div className="sm:col-span-2 space-y-2">
          <label className="block text-[11px] sm:text-[12px] font-medium text-white/50">Options (min 2, max 6)</label>
          {pollOptions.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={inputCls}
                value={opt}
                onChange={e => setPollOptions(prev => prev.map((o, j) => j === i ? e.target.value : o))}
                placeholder={`Option ${i + 1}`}
              />
              {pollOptions.length > 2 && (
                <button
                  type="button"
                  onClick={() => setPollOptions(prev => prev.filter((_, j) => j !== i))}
                  aria-label={`Remove option ${i + 1}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/40 transition hover:bg-white/[0.08] hover:text-white/70"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {pollOptions.length < 6 && (
            <button
              type="button"
              onClick={() => setPollOptions(prev => [...prev, ''])}
              className="mt-1 text-[12px] font-semibold text-white/40 transition hover:text-white/70"
            >
              + Add option
            </button>
          )}
        </div>

        <Field label="Duration">
          <select className={selectCls} value={f.pollDuration} onChange={e => set({ pollDuration: e.target.value })}>
            <option value="1" className="bg-[#0D0D0F]">1 day</option>
            <option value="3" className="bg-[#0D0D0F]">3 days</option>
            <option value="7" className="bg-[#0D0D0F]">7 days</option>
            <option value="14" className="bg-[#0D0D0F]">14 days</option>
            <option value="30" className="bg-[#0D0D0F]">30 days</option>
          </select>
        </Field>

        <Field label="Response type">
          <label className="flex cursor-pointer items-center gap-3 h-9 sm:h-10 px-3 sm:px-3.5 rounded-xl border border-white/[0.10] bg-white/[0.04]">
            <input
              type="checkbox"
              checked={f.pollMultiSelect}
              onChange={e => set({ pollMultiSelect: e.target.checked })}
              className="h-4 w-4 rounded border-white/20 bg-white/10 accent-white"
            />
            <span className="text-[13px] sm:text-sm text-white/70">Allow multiple selections</span>
          </label>
        </Field>
      </div>
    </div>
  );
}

function SurveyForm({
  fields: f,
  set,
  surveyQuestions,
  setSurveyQuestions,
}: {
  fields: FieldState;
  set: (p: Partial<FieldState>) => void;
  surveyQuestions: { text: string; type: 'text' | 'rating' | 'yesno' }[];
  setSurveyQuestions: React.Dispatch<React.SetStateAction<{ text: string; type: 'text' | 'rating' | 'yesno' }[]>>;
}) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={ClipboardList} label="Survey" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Survey title (optional)" span>
          <input className={inputCls} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="e.g. Customer satisfaction survey" />
        </Field>
        <Field label="Description (optional)" span>
          <textarea
            className={textareaCls}
            rows={2}
            value={f.surveyDesc}
            onChange={e => set({ surveyDesc: clampPublicationBody(e.target.value) })}
            placeholder="What is this survey about?"
          />
          <BodyCounter value={f.surveyDesc} />
        </Field>

        <div className="sm:col-span-2 space-y-2.5">
          <label className="block text-[11px] sm:text-[12px] font-medium text-white/50">Questions (min 1, max 8)</label>
          {surveyQuestions.map((q, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={inputCls}
                value={q.text}
                onChange={e => setSurveyQuestions(prev => prev.map((sq, j) => j === i ? { ...sq, text: e.target.value } : sq))}
                placeholder={`Question ${i + 1}`}
              />
              <select
                className={`${selectCls} w-auto shrink-0 min-w-[130px]`}
                value={q.type}
                onChange={e => setSurveyQuestions(prev => prev.map((sq, j) => j === i ? { ...sq, type: e.target.value as any } : sq))}
              >
                <option value="text" className="bg-[#0D0D0F]">Text answer</option>
                <option value="rating" className="bg-[#0D0D0F]">Rating 1–5</option>
                <option value="yesno" className="bg-[#0D0D0F]">Yes or No</option>
              </select>
              {surveyQuestions.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSurveyQuestions(prev => prev.filter((_, j) => j !== i))}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/40 transition hover:bg-white/[0.08] hover:text-white/70"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {surveyQuestions.length < 8 && (
            <button
              type="button"
              onClick={() => setSurveyQuestions(prev => [...prev, { text: '', type: 'text' }])}
              className="mt-1 text-[12px] font-semibold text-white/40 transition hover:text-white/70"
            >
              + Add question
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ChartForm({ fields: f, set }: { fields: FieldState; set: (p: Partial<FieldState>) => void }) {
  const labels = f.chartLabels.split(',').map(l => l.trim()).filter(Boolean);
  const values = f.chartValues.split(',').map(v => parseFloat(v.trim())).filter(n => !isNaN(n));
  const maxVal = Math.max(...values, 1);
  const hasBars = labels.length > 0 && values.length > 0;

  return (
    <div className="space-y-4">
      <SectionHeader icon={BarChart2} label="Chart / Data" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Chart title" span>
          <input className={inputCls} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="Monthly revenue, Votes by region…" />
        </Field>
        <Field label="Chart type">
          <select className={selectCls} value={f.chartType} onChange={e => set({ chartType: e.target.value as any })}>
            <option value="bar" className="bg-[#0D0D0F]">Bar chart</option>
            <option value="line" className="bg-[#0D0D0F]">Line chart</option>
            <option value="pie" className="bg-[#0D0D0F]">Pie chart</option>
          </select>
        </Field>
        <Field label="Labels (comma-separated)" required span>
          <input className={inputCls} value={f.chartLabels} onChange={e => set({ chartLabels: e.target.value })} placeholder="Jan, Feb, Mar, Apr…" />
        </Field>
        <Field label="Values (comma-separated)" required span>
          <input className={inputCls} value={f.chartValues} onChange={e => set({ chartValues: e.target.value })} placeholder="120, 240, 80, 310…" />
        </Field>
      </div>

      {/* Live mini-preview */}
      {hasBars && f.chartType === 'bar' && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="mb-3 text-[11px] font-semibold text-white/40 uppercase tracking-wider">Live Preview</p>
          <div className="flex items-end gap-2" style={{ height: '110px' }}>
            {labels.slice(0, 10).map((label, i) => {
              const val = values[i] ?? 0;
              const pct = Math.round((val / maxVal) * 100);
              const displayVal = val >= 1000 ? `${(val / 1000).toFixed(1)}k` : String(val);
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-0.5 min-w-0" style={{ height: '110px', justifyContent: 'flex-end' }}>
                  <span className="text-[8px] font-semibold text-white/50 mb-0.5">{displayVal}</span>
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-indigo-600/70 to-indigo-400/90 transition-all duration-500"
                    style={{ height: `${Math.max(pct, 3)}%`, maxHeight: '76px' }}
                  />
                  <span className="truncate text-[9px] text-white/30 w-full text-center mt-0.5">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasBars && f.chartType === 'pie' && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="mb-3 text-[11px] font-semibold text-white/40 uppercase tracking-wider">Preview</p>
          <div className="flex flex-wrap gap-2">
            {labels.slice(0, 8).map((label, i) => {
              const val = values[i] ?? 0;
              const total = values.slice(0, 8).reduce((s, v) => s + v, 0) || 1;
              const pct = Math.round((val / total) * 100);
              const colors = ['bg-indigo-400', 'bg-rose-400', 'bg-emerald-400', 'bg-amber-400', 'bg-sky-400', 'bg-violet-400', 'bg-orange-400', 'bg-green-400'];
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <div className={`h-2.5 w-2.5 rounded-full ${colors[i % colors.length]}`} />
                  <span className="text-[10px] text-white/50">{label} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasBars && f.chartType === 'line' && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="mb-3 text-[11px] font-semibold text-white/40 uppercase tracking-wider">Preview</p>
          <div className="relative h-20 flex items-end gap-px">
            {labels.slice(0, 12).map((label, i) => {
              const val = values[i] ?? 0;
              const pct = Math.round((val / maxVal) * 100);
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-1 min-w-0">
                  <div className="w-full flex items-end justify-center" style={{ height: '72px' }}>
                    <div
                      className="w-1.5 rounded-full bg-sky-400/70"
                      style={{ height: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                  <span className="truncate text-[9px] text-white/30 w-full text-center">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────── existing category forms ─────────────────── */

function NewsForm({ fields: f, set }: { fields: FieldState; set: (p: Partial<FieldState>) => void }) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={Newspaper} label="News Article" hint="Press releases, breaking news, or media updates" />
      <div className="space-y-3">
        <Field label="Headline" hint="Leave blank to auto-generate from body">
          <input className={inputCls} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="Breaking: Company announces product launch…" />
        </Field>
        <Field label="Body / Summary" required>
          <textarea className={textareaCls} rows={7} value={f.notes} onChange={e => set({ notes: clampPublicationBody(e.target.value) })} placeholder="Write the full news story here. Cover the who, what, when, where, why…" />
          <BodyCounter value={f.notes} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Publisher / Source">
            <input className={inputCls} value={f.publisher} onChange={e => set({ publisher: e.target.value })} placeholder="TechCrunch, Reuters, Your Company…" />
          </Field>
          <Field label="Date">
            <input className={`${inputCls} [color-scheme:dark]`} type="date" value={f.newsDate} onChange={e => set({ newsDate: e.target.value })} />
          </Field>
        </div>
        <OptionalSection>
          <Field label="Location">
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" />
              <input className={`${inputCls} pl-9`} value={f.location} onChange={e => set({ location: e.target.value })} placeholder="New Delhi, India" />
            </div>
          </Field>
          <Field label="Source URL">
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" />
              <input className={`${inputCls} pl-9`} type="url" value={f.sourceUrl} onChange={e => set({ sourceUrl: e.target.value })} placeholder="https://original-source.com/article" />
            </div>
          </Field>
        </OptionalSection>
      </div>
    </div>
  );
}

function ArticleForm({ fields: f, set }: { fields: FieldState; set: (p: Partial<FieldState>) => void }) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={BookOpen} label="Article / Blog Post" hint="Publish editorial content, thought leadership, or stories" />
      <div className="space-y-3">
        <Field label="Title" hint="Leave blank to auto-generate from content">
          <input className={inputCls} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="e.g. Why good design is invisible…" />
        </Field>
        <Field label="Write your article" required>
          <textarea className={textareaCls} rows={9} value={f.content} onChange={e => set({ content: clampPublicationBody(e.target.value) })} placeholder="Start writing here. Markdown supported — use # headings, **bold**, _italic_, lists…" />
          <BodyCounter value={f.content} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Author name">
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" />
              <input className={`${inputCls} pl-9`} value={f.author} onChange={e => set({ author: e.target.value })} placeholder="Your name or pen name" />
            </div>
          </Field>
          <Field label="One-line teaser">
            <input className={inputCls} value={f.excerpt} onChange={e => set({ excerpt: e.target.value })} placeholder="Shown in search results & previews" />
          </Field>
        </div>
      </div>
    </div>
  );
}

function DocumentForm({ fields: f, set, fileRef }: { fields: FieldState; set: (p: Partial<FieldState>) => void; fileRef: React.RefObject<HTMLInputElement> }) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={FileText} label="Document / file" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" span>
          <input className={inputCls} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="Q4 Report, NDA, Invoice…" />
        </Field>

        {/* file upload zone */}
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-[12px] font-medium text-white/55">Attach file</label>
          {f.file ? (
            <div className="flex items-center justify-between rounded-xl border border-white/[0.10] bg-white/[0.04] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{f.file.name}</p>
                <p className="mt-0.5 text-[11px] text-white/40">{f.file.type || 'file'} · {formatBytes(f.file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => { set({ file: null }); if (fileRef.current) fileRef.current.value = ''; }}
                aria-label={`Remove ${f.file.name}`}
                className="ml-3 shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/[0.09] hover:text-white"
              >
                Remove
              </button>
            </div>
          ) : (
            /* Same picker and same `file` field — the shared empty state just
               adds drag & drop and matches every other uploader in the wizard.
               No accept filter: this input takes any file type, as before. */
            <MediaDropZone
              title="Attach a file"
              hint="Drag & drop a file here or choose from your device · PDF, DOCX, Images and more · 15 MB max"
              onChoose={() => fileRef.current?.click()}
              onFiles={files => set({ file: files[0] })}
            />
          )}
        </div>

        {!f.file && (
          <>
            <Field label="Or write text" span>
              <textarea className={textareaCls} rows={5} value={f.notes} onChange={e => set({ notes: clampPublicationBody(e.target.value) })} placeholder="Paste or write document content…" />
              <BodyCounter value={f.notes} />
            </Field>
            <Field label="Export as">
              <select className={selectCls} value={f.textFormat} onChange={e => set({ textFormat: e.target.value as any })}>
                <option value="pdf" className="bg-[#0D0D0F]">PDF</option>
                <option value="docx" className="bg-[#0D0D0F]">DOCX</option>
                <option value="txt" className="bg-[#0D0D0F]">TXT</option>
                <option value="html" className="bg-[#0D0D0F]">HTML</option>
              </select>
            </Field>
          </>
        )}
      </div>
    </div>
  );
}

function PortfolioForm({ fields: f, set }: { fields: FieldState; set: (p: Partial<FieldState>) => void }) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={Layers} label="Portfolio / Case Study" hint="Showcase your work — projects, designs, products you've built" />
      <div className="space-y-3">
        <Field label="Project Name" hint="Leave blank to auto-generate">
          <input className={inputCls} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="Project Nebula, Mobile App Redesign…" />
        </Field>
        <Field label="Project Description" required>
          <textarea className={textareaCls} rows={6} value={f.notes} onChange={e => set({ notes: clampPublicationBody(e.target.value) })} placeholder="Describe the project — what was the problem, what did you build, what was the outcome and impact?&#10;&#10;Use bullet points or paragraphs." />
          <BodyCounter value={f.notes} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client / Company">
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" />
              <input className={`${inputCls} pl-9`} value={f.client} onChange={e => set({ client: e.target.value })} placeholder="Acme Corp, Personal project…" />
            </div>
          </Field>
          <Field label="Live URL">
            <div className="relative">
              <ExternalLink className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" />
              <input className={`${inputCls} pl-9`} type="url" value={f.projectUrl} onChange={e => set({ projectUrl: e.target.value })} placeholder="https://myproject.com" />
            </div>
          </Field>
          <Field label="Technologies Used" span>
            <div className="relative">
              <Terminal className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" />
              <input className={`${inputCls} pl-9`} value={f.technologies} onChange={e => set({ technologies: e.target.value })} placeholder="React, Next.js, Figma, PostgreSQL…" />
            </div>
          </Field>
        </div>
      </div>
    </div>
  );
}

function AnnouncementForm({ fields: f, set }: { fields: FieldState; set: (p: Partial<FieldState>) => void }) {
  const priorityConfig = { high: 'text-red-400', medium: 'text-amber-400', low: 'text-emerald-400' };
  return (
    <div className="space-y-4">
      <SectionHeader icon={Megaphone} label="Announcement" hint="Platform alerts, feature launches, company updates" />
      <div className="space-y-3">
        <Field label="Title" hint="Leave blank to auto-generate">
          <input className={inputCls} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="New feature launch, Platform update…" />
        </Field>
        <Field label="Message" required>
          <textarea className={textareaCls} rows={6} value={f.notes} onChange={e => set({ notes: clampPublicationBody(e.target.value) })} placeholder="Write your announcement here. Be clear and concise…" />
          <BodyCounter value={f.notes} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Priority">
            <select className={`${selectCls} ${priorityConfig[f.priority]}`} value={f.priority} onChange={e => set({ priority: e.target.value as any })}>
              <option value="high" className="bg-[#0a0a0e] text-white">🔴 High — urgent action needed</option>
              <option value="medium" className="bg-[#0a0a0e] text-white">🟡 Medium — informational</option>
              <option value="low" className="bg-[#0a0a0e] text-white">🟢 Low — FYI only</option>
            </select>
          </Field>
          <Field label="Expires on" hint="Auto-archive after this date">
            <input className={`${inputCls} [color-scheme:dark]`} type="date" value={f.expiresAt} onChange={e => set({ expiresAt: e.target.value })} />
          </Field>
        </div>
      </div>
    </div>
  );
}

function JobForm({ fields: f, set }: { fields: FieldState; set: (p: Partial<FieldState>) => void }) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={Briefcase} label="Job Posting" hint="Reach thousands of professionals actively looking for opportunities" />
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Job Title" required>
            <input className={inputCls} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="Senior Frontend Engineer" />
          </Field>
          <Field label="Company">
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" />
              <input className={`${inputCls} pl-9`} value={f.company} onChange={e => set({ company: e.target.value })} placeholder="Acme Inc." />
            </div>
          </Field>
        </div>
        <Field label="Job Description" required>
          <textarea className={textareaCls} rows={5} value={f.description} onChange={e => set({ description: clampPublicationBody(e.target.value) })} placeholder="What will this person do? Describe the role, team, and impact…" />
          <BodyCounter value={f.description} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Work Type">
            <select className={selectCls} value={f.jobType} onChange={e => set({ jobType: e.target.value as any })}>
              <option value="remote" className="bg-[#0a0a0e]">Remote</option>
              <option value="hybrid" className="bg-[#0a0a0e]">Hybrid</option>
              <option value="onsite" className="bg-[#0a0a0e]">On-site</option>
            </select>
          </Field>
          <Field label="Location">
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" />
              <input className={`${inputCls} pl-9`} value={f.jobLocation} onChange={e => set({ jobLocation: e.target.value })} placeholder="Mumbai / Remote" />
            </div>
          </Field>
          <Field label="Salary / CTC">
            <input className={inputCls} value={f.salary} onChange={e => set({ salary: e.target.value })} placeholder="₹18–24 LPA" />
          </Field>
        </div>
        <Field label="Apply URL" hint="Applicants are redirected here — leave blank for in-app apply">
          <div className="relative">
            <ExternalLink className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" />
            <input className={`${inputCls} pl-9`} type="url" value={f.jobApplyUrl} onChange={e => set({ jobApplyUrl: e.target.value })} placeholder="https://company.com/careers/apply" />
          </div>
        </Field>
        <OptionalSection label="Requirements & additional details">
          <Field label="Requirements" span>
            <textarea className={textareaCls} rows={3} value={f.requirements} onChange={e => set({ requirements: e.target.value })} placeholder="3+ yrs React, strong TypeScript, CS degree preferred…" />
          </Field>
        </OptionalSection>
      </div>
    </div>
  );
}

function ResumeForm({ resume: r, setResume, isAuthenticated, resumeRef, avatarRef }: {
  resume: typeof blankResume;
  setResume: React.Dispatch<React.SetStateAction<typeof blankResume>>;
  isAuthenticated: boolean;
  resumeRef: React.RefObject<HTMLInputElement>;
  avatarRef: React.RefObject<HTMLInputElement>;
}) {
  const set = (p: Partial<typeof blankResume>) => setResume(prev => ({ ...prev, ...p }));
  return (
    <div className="space-y-4">
      <SectionHeader icon={User} label="Talent profile / resume" />
      {!isAuthenticated && (
        <div className="rounded-xl border border-white/[0.10] bg-white/[0.05] px-4 py-3 text-sm text-white/60">
          Login required to publish a resume profile.
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Display name" required>
          <input className={inputCls} value={r.displayName} onChange={e => set({ displayName: e.target.value })} placeholder="Kushagra Sharma" />
        </Field>
        <Field label="Category" required>
          <select className={selectCls} value={r.category} onChange={e => set({ category: e.target.value })}>
            {RESUME_CATEGORIES.map(cat => (
              <option key={cat} value={cat} className="bg-[#0D0D0F]">{cat}</option>
            ))}
          </select>
        </Field>
        <Field label="Headline">
          <input className={inputCls} value={r.headline} onChange={e => set({ headline: e.target.value })} placeholder="Full-stack Engineer · SaaS" />
        </Field>
        <Field label="Location">
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
            <input className={`${inputCls} pl-9`} value={r.location} onChange={e => set({ location: e.target.value })} placeholder="New Delhi, India" />
          </div>
        </Field>
        <Field label="Skills">
          <input className={inputCls} value={r.skills} onChange={e => set({ skills: e.target.value })} placeholder="React, Node, TypeScript…" />
        </Field>
        <Field label="Tags (for discovery)">
          <input className={inputCls} value={r.tags} onChange={e => set({ tags: e.target.value })} placeholder="frontend, remote, startup…" />
        </Field>
        <Field label="Contact email">
          <input className={inputCls} type="email" value={r.contactEmail} onChange={e => set({ contactEmail: e.target.value })} placeholder="you@company.com" />
        </Field>
        <Field label="LinkedIn URL">
          <input className={inputCls} type="url" value={r.contactLinkedin} onChange={e => set({ contactLinkedin: e.target.value })} placeholder="linkedin.com/in/…" />
        </Field>
        <Field label="Summary" span>
          <textarea className={textareaCls} rows={3} value={r.summary} onChange={e => set({ summary: e.target.value })} placeholder="Professional summary…" />
        </Field>

        {/* Resume file */}
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-[12px] font-medium text-white/55">Upload resume file</label>
          {r.resumeFile ? (
            <div className="flex items-center justify-between rounded-xl border border-white/[0.10] bg-white/[0.04] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{r.resumeFile.name}</p>
                <p className="mt-0.5 text-[11px] text-white/40">{formatBytes(r.resumeFile.size)}</p>
              </div>
              <button type="button" onClick={() => { set({ resumeFile: null }); if (resumeRef.current) resumeRef.current.value = ''; }} className="ml-3 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-white/60 hover:text-white">Remove</button>
            </div>
          ) : (
            <button type="button" onClick={() => resumeRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.15] bg-white/[0.02] py-5 text-sm font-medium text-white/40 transition hover:border-white/25 hover:text-white/60">
              <Upload className="h-4 w-4" /> Upload PDF / DOCX
            </button>
          )}
        </div>

        <Field label="Or paste resume text" span>
          <textarea className={textareaCls} rows={4} value={r.pastedText} onChange={e => set({ pastedText: e.target.value })} placeholder="Paste your resume text…" />
        </Field>
      </div>
    </div>
  );
}

function ProductForm({
  fields: f, set,
  productImages, setProductImages, productImagesRef,
}: {
  fields: FieldState;
  set: (p: Partial<FieldState>) => void;
  productImages: File[];
  setProductImages: React.Dispatch<React.SetStateAction<File[]>>;
  productImagesRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={Package} label="Product listing (e-commerce)" />

      {/* Name first — "what is this?" before its pictures. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Product name" required span>
          <input className={inputCls} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="e.g. Wireless Noise-Cancelling Headphones" />
        </Field>
      </div>

      {/* Product images — same state, same setter, same 6-photo cap and MAIN
          badge as before; only the presentation is now the shared one, which
          also brings drag & drop and a remove control that works on touch. */}
      <div>
        <label className="mb-1.5 block text-[12px] font-medium text-white/55">
          Product Images{productImages.length > 0 ? ` (${productImages.length}/6)` : ' — up to 6'}
        </label>
        {productImages.length < 6 && (
          <MediaDropZone
            title={productImages.length === 0 ? 'Add product images' : `Add more (${productImages.length}/6)`}
            hint="Drag & drop images here or choose from your device · PNG, JPG, WebP · up to 6 photos"
            onChoose={() => productImagesRef.current?.click()}
            accept={file => file.type.startsWith('image/')}
            onFiles={files => setProductImages(prev => [...prev, ...files].slice(0, 6))}
          />
        )}
        {productImages.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {productImages.map((img, i) => (
              <MediaTile
                key={`${img.name}-${img.size}-${i}`}
                file={img}
                badge={i === 0 ? 'MAIN' : undefined}
                oversizeLimit={MAX_PUBLIC_IMAGE_BYTES}
                onRemove={() => setProductImages(prev => prev.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Description" span>
          <textarea className={textareaCls} rows={4} value={f.content} onChange={e => set({ content: clampPublicationBody(e.target.value) })} placeholder="What does this product do? What problem does it solve? Who is it for?" />
          <BodyCounter value={f.content} />
        </Field>
        <Field label="Price">
          <input className={inputCls} value={f.price} onChange={e => set({ price: e.target.value })} placeholder="₹2,499 · Free shipping" />
        </Field>
        <Field label="Category / Type">
          <input className={inputCls} value={f.notes} onChange={e => set({ notes: e.target.value })} placeholder="Electronics, SaaS, Fashion, Food…" />
        </Field>
        <Field label="Shop / Buy Now URL" span>
          <div className="relative">
            <ShoppingBag className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
            <input className={`${inputCls} pl-9`} type="url" value={f.productShopUrl} onChange={e => set({ productShopUrl: e.target.value })} placeholder="https://yourstore.com/product" />
          </div>
          <p className="mt-1 text-[11px] text-white/30">Buyers will be redirected here when they click "Shop Now"</p>
        </Field>
        <Field label="WhatsApp Contact (optional)">
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
            <input className={`${inputCls} pl-9`} type="tel" value={f.productWhatsapp} onChange={e => set({ productWhatsapp: e.target.value })} placeholder="+91 98765 43210" />
          </div>
          <p className="mt-1 text-[11px] text-white/30">Shown on the product page for direct inquiries</p>
        </Field>
        <Field label="Key features" span>
          <textarea className={textareaCls} rows={3} value={f.features} onChange={e => set({ features: e.target.value })} placeholder="• Fast delivery across India&#10;• 1-year warranty&#10;• Easy returns" />
        </Field>
      </div>
    </div>
  );
}

function EventForm({ fields: f, set }: { fields: FieldState; set: (p: Partial<FieldState>) => void }) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={CalendarDays} label="Event / Conference / Meetup" hint="Get RSVPs from the community — conferences, workshops, webinars" />
      <div className="space-y-3">
        <Field label="Event Name" required>
          <input className={inputCls} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="React India 2026, Mumbai DevMeetup…" />
        </Field>
        <Field label="Description" required>
          <textarea className={textareaCls} rows={4} value={f.notes} onChange={e => set({ notes: clampPublicationBody(e.target.value) })} placeholder="What's this event about? Who should attend? What will they gain?" />
          <BodyCounter value={f.notes} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Mode">
            <select className={selectCls} value={f.eventMode} onChange={e => set({ eventMode: e.target.value as any })}>
              <option value="in-person" className="bg-[#0a0a0e]">In-person</option>
              <option value="online" className="bg-[#0a0a0e]">Online</option>
              <option value="hybrid" className="bg-[#0a0a0e]">Hybrid</option>
            </select>
          </Field>
          <Field label="Start Date">
            <input className={`${inputCls} [color-scheme:dark]`} type="date" value={f.eventDate} onChange={e => set({ eventDate: e.target.value })} />
          </Field>
          <Field label="End Date">
            <input className={`${inputCls} [color-scheme:dark]`} type="date" value={f.eventEndDate} onChange={e => set({ eventEndDate: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Venue / City">
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" />
              <input className={`${inputCls} pl-9`} value={f.eventVenue} onChange={e => set({ eventVenue: e.target.value })} placeholder="NSCI Dome, Mumbai" />
            </div>
          </Field>
          <Field label="Register / Info URL" hint="Attendees are redirected here on click">
            <div className="relative">
              <ExternalLink className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" />
              <input className={`${inputCls} pl-9`} type="url" value={f.eventUrl} onChange={e => set({ eventUrl: e.target.value })} placeholder="https://lu.ma/event" />
            </div>
          </Field>
        </div>
        <OptionalSection label="Organiser, time & capacity">
          <Field label="Organiser / Host">
            <input className={inputCls} value={f.eventOrganiser} onChange={e => set({ eventOrganiser: e.target.value })} placeholder="GDG Mumbai, Nasscom…" />
          </Field>
          <Field label="Time">
            <div className="relative">
              <Clock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" />
              <input className={`${inputCls} pl-9`} value={f.eventTime} onChange={e => set({ eventTime: e.target.value })} placeholder="10:00 AM – 5:00 PM IST" />
            </div>
          </Field>
          <Field label="Capacity">
            <input className={inputCls} value={f.eventCapacity} onChange={e => set({ eventCapacity: e.target.value })} placeholder="500 seats · Unlimited" />
          </Field>
        </OptionalSection>
      </div>
    </div>
  );
}

function HackathonForm({ fields: f, set }: { fields: FieldState; set: (p: Partial<FieldState>) => void }) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={Terminal} label="Hackathon / coding sprint" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Hackathon name" required span>
          <input className={inputCls} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="HackIndia 2026, Build for Bharat…" />
        </Field>
        <Field label="Problem statement / brief" span>
          <textarea className={textareaCls} rows={4} value={f.hackProblem} onChange={e => set({ hackProblem: clampPublicationBody(e.target.value) })} placeholder="What problem are participants solving? Key constraints, data, APIs available…" />
          <BodyCounter value={f.hackProblem} />
        </Field>
        <Field label="Prize pool">
          <div className="relative">
            <Trophy className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
            <input className={`${inputCls} pl-9`} value={f.hackPrize} onChange={e => set({ hackPrize: e.target.value })} placeholder="₹10,00,000 · $50k…" />
          </div>
        </Field>
        <Field label="Mode">
          <select className={selectCls} value={f.hackMode} onChange={e => set({ hackMode: e.target.value as any })}>
            <option value="in-person" className="bg-[#0D0D0F]">In-person</option>
            <option value="online" className="bg-[#0D0D0F]">Online</option>
            <option value="hybrid" className="bg-[#0D0D0F]">Hybrid</option>
          </select>
        </Field>
        <Field label="Registration URL" span>
          <div className="relative">
            <ExternalLink className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
            <input className={`${inputCls} pl-9`} type="url" value={f.hackRegUrl} onChange={e => set({ hackRegUrl: e.target.value })} placeholder="https://devfolio.co/hackathon or https://unstop.com/…" />
          </div>
          <p className="mt-1 text-[11px] text-white/30">Users will be redirected directly to this URL when they click Register</p>
        </Field>
        <OptionalSection label="More details (optional)">
          <Field label="Organiser">
            <input className={inputCls} value={f.hackOrganiser} onChange={e => set({ hackOrganiser: e.target.value })} placeholder="Devfolio, MLH, NASSCOM…" />
          </Field>
          <Field label="Themes / tracks">
            <input className={inputCls} value={f.hackThemes} onChange={e => set({ hackThemes: e.target.value })} placeholder="AI/ML, FinTech, GovTech, Web3…" />
          </Field>
          <Field label="Team size">
            <input className={inputCls} value={f.hackTeamSize} onChange={e => set({ hackTeamSize: e.target.value })} placeholder="1–4 members" />
          </Field>
          <Field label="Reg. deadline">
            <input className={`${inputCls} [color-scheme:dark]`} type="date" value={f.hackRegDeadline} onChange={e => set({ hackRegDeadline: e.target.value })} />
          </Field>
          <Field label="Start date">
            <input className={`${inputCls} [color-scheme:dark]`} type="date" value={f.hackStartDate} onChange={e => set({ hackStartDate: e.target.value })} />
          </Field>
          <Field label="End date">
            <input className={`${inputCls} [color-scheme:dark]`} type="date" value={f.hackEndDate} onChange={e => set({ hackEndDate: e.target.value })} />
          </Field>
          <Field label="About / description" span>
            <textarea className={textareaCls} rows={3} value={f.notes} onChange={e => set({ notes: e.target.value })} placeholder="Who should participate? Judging criteria? Perks?" />
          </Field>
        </OptionalSection>
      </div>
    </div>
  );
}

function GigForm({ fields: f, set }: { fields: FieldState; set: (p: Partial<FieldState>) => void }) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={Zap} label="Gig / freelance brief" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What do you need done?" required span>
          <textarea className={textareaCls} rows={5} value={f.gigSummary} onChange={e => set({ gigSummary: clampPublicationBody(e.target.value) })} placeholder="Describe the work, context, and what success looks like…" />
          <BodyCounter value={f.gigSummary} />
        </Field>
        <Field label="Gig title" required span>
          <input className={inputCls} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="e.g. Build a React dashboard, Logo design for startup…" />
        </Field>
        {/* Apply URL — prominent placement */}
        <Field label="Apply / Contact URL" span>
          <div className="relative">
            <ExternalLink className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
            <input
              className={`${inputCls} pl-9`}
              type="url"
              value={f.gigApplyUrl}
              onChange={e => set({ gigApplyUrl: e.target.value })}
              placeholder="https://toptal.com/gig or mailto:hello@yourco.com"
            />
          </div>
          <p className="mt-1 text-[11px] text-white/30">Freelancers will be redirected here when they click Apply — leave blank to use in-app bidding</p>
        </Field>
        <OptionalSection>
          <Field label="Budget">
            <input className={inputCls} value={f.gigBudget} onChange={e => set({ gigBudget: e.target.value })} placeholder="e.g. ₹5,000 – ₹15,000" />
          </Field>
          <Field label="Timeline">
            <input className={inputCls} value={f.gigTimeline} onChange={e => set({ gigTimeline: e.target.value })} placeholder="e.g. 2 weeks, 1 month" />
          </Field>
          <Field label="Category">
            <input className={inputCls} value={f.gigCategory} onChange={e => set({ gigCategory: e.target.value })} placeholder="Development, Design, Writing…" />
          </Field>
          <Field label="Engagement type">
            <select className={selectCls} value={f.gigEngagement} onChange={e => set({ gigEngagement: e.target.value as any })}>
              <option value="one_time">One-time project</option>
              <option value="ongoing">Ongoing</option>
              <option value="retainer">Retainer</option>
            </select>
          </Field>
          <Field label="Location">
            <select className={selectCls} value={f.gigLocation} onChange={e => set({ gigLocation: e.target.value as any })}>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
            </select>
          </Field>
          <Field label="Bid mode">
            <select className={selectCls} value={f.gigBidMode} onChange={e => set({ gigBidMode: e.target.value as any })}>
              <option value="fixed">Fixed budget</option>
              <option value="bidding">Open to bids</option>
            </select>
          </Field>
          {f.gigBidMode === 'bidding' && (
            <>
              <Field label="Min. bid (₹)">
                <input className={inputCls} type="number" value={f.gigMinBid} onChange={e => set({ gigMinBid: e.target.value })} placeholder="0" />
              </Field>
              <Field label="Bid deadline">
                <input className={`${inputCls} [color-scheme:dark]`} type="date" value={f.gigBidDeadline} onChange={e => set({ gigBidDeadline: e.target.value })} />
              </Field>
            </>
          )}
          <Field label="Required skills" span>
            <input className={inputCls} value={f.gigSkills} onChange={e => set({ gigSkills: e.target.value })} placeholder="React, Figma, Copywriting…" />
          </Field>
          <Field label="Deliverables" span>
            <textarea className={textareaCls} rows={3} value={f.gigDeliverables} onChange={e => set({ gigDeliverables: e.target.value })} placeholder="What should be delivered on completion?" />
          </Field>
          <Field label="Tags" span>
            <input className={inputCls} value={f.tags} onChange={e => set({ tags: e.target.value })} placeholder="freelance, urgent, design…" />
          </Field>
        </OptionalSection>
      </div>
    </div>
  );
}

function ThreadForm({ fields: f, set }: { fields: FieldState; set: (p: Partial<FieldState>) => void }) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={MessageSquare} label="Thread / discussion" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Thread title" span>
          <input className={inputCls} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="Why I stopped using X — and what I use instead" />
        </Field>
        <Field label="Thread content (use line breaks for each point)" span>
          <textarea className={textareaCls} rows={8} value={f.threadPoints} onChange={e => set({ threadPoints: clampPublicationBody(e.target.value) })} placeholder={"1/ Start with your hook...\n\n2/ Expand the idea...\n\n3/ Add evidence or examples..."} />
          <BodyCounter value={f.threadPoints} />
        </Field>
      </div>
    </div>
  );
}

function detectVideoPlatform(url: string): string {
  if (!url) return '';
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
  if (u.includes('vimeo.com')) return 'Vimeo';
  if (u.includes('loom.com')) return 'Loom';
  if (u.includes('drive.google.com')) return 'Google Drive';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'X (Twitter)';
  if (u.includes('instagram.com')) return 'Instagram';
  if (u.includes('tiktok.com')) return 'TikTok';
  if (u.includes('dailymotion.com')) return 'Dailymotion';
  if (u.includes('twitch.tv')) return 'Twitch';
  if (u.match(/\.(mp4|webm|ogg|mov)(\?|$)/)) return 'Direct video';
  if (url.startsWith('http')) return 'Web embed';
  return '';
}

function VideoForm({ fields: f, set }: { fields: FieldState; set: (p: Partial<FieldState>) => void }) {
  const detected = detectVideoPlatform(f.videoUrl);
  const PLATFORM_CHIPS = ['YouTube', 'Vimeo', 'Loom', 'Google Drive', 'X (Twitter)', 'Direct MP4'];
  return (
    <div className="space-y-4">
      <SectionHeader icon={Video} label="Video / media" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Video title" span>
          <input className={inputCls} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="Full-stack tutorial, Conference talk, Product demo…" />
        </Field>
        <Field label="Video URL" required span>
          <div className="relative">
            <Video className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
            <input
              className={`${inputCls} pl-9`}
              type="url"
              value={f.videoUrl}
              onChange={e => set({ videoUrl: e.target.value })}
              placeholder="Paste any video URL…"
            />
            {detected && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                {detected}
              </span>
            )}
          </div>
          {/* Supported platforms chips */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PLATFORM_CHIPS.map(p => (
              <span key={p} className="text-[10px] text-white/30 bg-white/[0.04] border border-white/[0.07] rounded-full px-2 py-0.5">{p}</span>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-white/30">Any publicly accessible video URL works — YouTube, Vimeo, Loom, Drive, Twitter/X, direct MP4, etc.</p>
        </Field>
        <Field label="Duration">
          <input className={inputCls} value={f.videoDuration} onChange={e => set({ videoDuration: e.target.value })} placeholder="12m 30s" />
        </Field>
        <Field label="Platform (auto-detected)">
          <input
            className={inputCls}
            value={f.videoSource || detected}
            onChange={e => set({ videoSource: e.target.value })}
            placeholder="YouTube, Loom, Vimeo…"
          />
        </Field>
        <Field label="Description" span>
          <textarea className={textareaCls} rows={4} value={f.notes} onChange={e => set({ notes: clampPublicationBody(e.target.value) })} placeholder="What will viewers learn? Who is it for?" />
          <BodyCounter value={f.notes} />
        </Field>
      </div>
    </div>
  );
}

function MilestoneForm({ fields: f, set }: { fields: FieldState; set: (p: Partial<FieldState>) => void }) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={Award} label="Milestone / Achievement" hint="Celebrate wins — revenue goals, user counts, launches, completions" />
      <div className="space-y-3">
        <Field label="Headline" hint="Leave blank to auto-generate">
          <input className={inputCls} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="We just crossed ₹1 Crore ARR 🎉" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Key Metric">
            <div className="relative">
              <Trophy className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" />
              <input className={`${inputCls} pl-9`} value={f.milestoneMetric} onChange={e => set({ milestoneMetric: e.target.value })} placeholder="₹1 Crore ARR, 10k users, 100 days…" />
            </div>
          </Field>
          <Field label="Context / Timeframe">
            <input className={inputCls} value={f.milestoneContext} onChange={e => set({ milestoneContext: e.target.value })} placeholder="18 months bootstrapped, 4-person team…" />
          </Field>
        </div>
        <Field label="Story" required>
          <textarea className={textareaCls} rows={6} value={f.notes} onChange={e => set({ notes: clampPublicationBody(e.target.value) })} placeholder="Share the journey behind this milestone — what you learned, who helped, what's next. Authentic stories resonate most…" />
          <BodyCounter value={f.notes} />
        </Field>
      </div>
    </div>
  );
}

function TutorialForm({
  fields: f,
  set,
  steps,
  setSteps,
}: {
  fields: FieldState;
  set: (p: Partial<FieldState>) => void;
  steps: { title: string; desc: string; imageUrl: string }[];
  setSteps: React.Dispatch<React.SetStateAction<{ title: string; desc: string; imageUrl: string }[]>>;
}) {
  const updateStep = (i: number, patch: Partial<{ title: string; desc: string; imageUrl: string }>) =>
    setSteps(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addStep = () => setSteps(prev => [...prev, { title: '', desc: '', imageUrl: '' }]);
  const removeStep = (i: number) => setSteps(prev => prev.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-4">
      <SectionHeader icon={BookMarked} label="Tutorial / guide" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tutorial title (auto-generated if empty)" span>
          <input className={inputCls} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="Build a REST API with Go and Gin…" />
        </Field>
        <Field label="Difficulty">
          <select className={selectCls} value={f.tutorialDifficulty} onChange={e => set({ tutorialDifficulty: e.target.value as any })}>
            <option value="beginner" className="bg-[#0D0D0F]">Beginner</option>
            <option value="intermediate" className="bg-[#0D0D0F]">Intermediate</option>
            <option value="advanced" className="bg-[#0D0D0F]">Advanced</option>
          </select>
        </Field>
        <Field label="Prerequisites" span>
          <input className={inputCls} value={f.tutorialPrereqs} onChange={e => set({ tutorialPrereqs: e.target.value })} placeholder="Basic JavaScript, Node.js installed…" />
        </Field>
      </div>

      {/* Step-by-step editor */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Steps ({steps.length})</p>
          <button
            type="button"
            onClick={addStep}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 text-[12px] font-semibold text-indigo-400 hover:bg-indigo-500/20 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add Step
          </button>
        </div>

        {steps.map((step, i) => (
          <div key={i} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/20 text-[11px] font-bold text-indigo-400 shrink-0">
                {i + 1}
              </span>
              <input
                className={`${inputCls} flex-1`}
                value={step.title}
                onChange={e => updateStep(i, { title: e.target.value })}
                placeholder={`Step ${i + 1} title — e.g. Install dependencies`}
              />
              {steps.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  className="shrink-0 rounded-lg p-1.5 text-white/20 hover:bg-white/[0.06] hover:text-red-400 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <textarea
              className={textareaCls}
              rows={3}
              value={step.desc}
              onChange={e => updateStep(i, { desc: e.target.value })}
              placeholder="Explain what to do in this step… (optional)"
            />
            <div className="relative">
              <ImageIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
              <input
                className={`${inputCls} pl-9 text-[12px]`}
                type="url"
                value={step.imageUrl}
                onChange={e => updateStep(i, { imageUrl: e.target.value })}
                placeholder="Image URL for this step (optional)"
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addStep}
          className="w-full rounded-xl border border-dashed border-white/[0.12] py-3 text-[12px] text-white/30 hover:border-white/20 hover:text-white/50 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="h-3.5 w-3.5" /> Add another step
        </button>
      </div>
    </div>
  );
}

/* ─── thumbnail section ──────────────────────────────────────── */
function ThumbnailSection({
  category,
  thumbnailFile,
  thumbnailUrlInput,
  thumbnailMode,
  onFileChange,
  onUrlChange,
  onModeChange,
  thumbnailRef,
  postImages,
  postImagesRef,
  setPostImages,
}: {
  category: string;
  thumbnailFile: File | null;
  thumbnailUrlInput: string;
  thumbnailMode: 'upload' | 'url';
  onFileChange: (f: File | null) => void;
  onUrlChange: (v: string) => void;
  onModeChange: (m: 'upload' | 'url') => void;
  thumbnailRef: React.RefObject<HTMLInputElement>;
  postImages?: File[];
  postImagesRef?: React.RefObject<HTMLInputElement>;
  setPostImages?: React.Dispatch<React.SetStateAction<File[]>>;
}) {
  const [urlError, setUrlError] = useState(false);
  const isPost = category === 'post';

  // Created once per file and revoked on change — see useObjectUrl.
  const uploadPreview = useObjectUrl(!isPost ? thumbnailFile : null);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d0d11]">
      {/* ── header ── */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 sm:px-5 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/[0.07]">
            <ImageIcon className="h-3.5 w-3.5 text-white/45" />
          </div>
          <span className="text-[12.5px] font-semibold text-white/60 tracking-[-0.01em]">
            {isPost ? 'Photos' : 'Cover Image'}
          </span>
          {!isPost && (
            <span className="hidden sm:inline rounded-md bg-white/[0.04] px-2 py-px text-[10px] font-medium text-white/25 border border-white/[0.06] tabular-nums">
              {THUMB_RECOMMENDED_W}×{THUMB_RECOMMENDED_H}px · max 2 MB
            </span>
          )}
          <span className="rounded-full bg-white/[0.04] px-2 py-px text-[10px] font-medium text-white/20 border border-white/[0.05]">
            optional
          </span>
        </div>

        {/* mode toggle — only for non-post */}
        {!isPost && (
          <div className="flex items-center gap-px rounded-xl border border-white/[0.07] bg-white/[0.02] p-1">
            <button
              type="button"
              onClick={() => { onModeChange('upload'); setUrlError(false); }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${
                thumbnailMode === 'upload'
                  ? 'bg-white/[0.10] text-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]'
                  : 'text-white/35 hover:text-white/60'
              }`}
            >
              <Upload className="h-2.5 w-2.5" />
              Upload
            </button>
            <button
              type="button"
              onClick={() => { onModeChange('url'); onFileChange(null); }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${
                thumbnailMode === 'url'
                  ? 'bg-white/[0.10] text-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]'
                  : 'text-white/35 hover:text-white/60'
              }`}
            >
              <Globe className="h-2.5 w-2.5" />
              From URL
            </button>
          </div>
        )}
      </div>

      {/* ── body ── */}
      <div className="p-3 sm:p-4">

        {/* POST: multi-image picker. Same 6-image cap and same state setter. */}
        {isPost && postImages !== undefined && postImagesRef !== undefined && setPostImages !== undefined && (
          <div className="space-y-3">
            {(postImages?.length ?? 0) < 6 && (
              <MediaDropZone
                title={(postImages?.length ?? 0) === 0 ? 'Add photos' : `Add more (${postImages?.length ?? 0}/6)`}
                hint="Drag & drop images here or choose from your device · PNG, JPG, GIF · up to 6 · 5 MB each"
                onChoose={() => postImagesRef.current?.click()}
                accept={f => f.type.startsWith('image/')}
                /* Same cap the hidden input enforces. */
                onFiles={files => setPostImages(prev => [...prev, ...files].slice(0, 6))}
              />
            )}
            {(postImages?.length ?? 0) > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {postImages?.map((img, i) => (
                  <MediaTile
                    key={`${img.name}-${img.size}-${i}`}
                    file={img}
                    badge={i === 0 ? 'COVER' : undefined}
                    oversizeLimit={MAX_PUBLIC_IMAGE_BYTES}
                    onRemove={() => setPostImages(prev => prev.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* NON-POST: upload zone */}
        {!isPost && thumbnailMode === 'upload' && (
          <>
            {uploadPreview ? (
              /* ── preview ── */
              <div className="group relative overflow-hidden rounded-xl border border-white/[0.10]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {/* contain, not cover: this preview exists so the uploader can
                    confirm what they picked — a crop defeats it. */}
                <img src={uploadPreview} alt="Cover preview" className="max-h-64 w-full object-contain bg-black/25" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 right-24">
                  <p className="truncate text-[11px] font-semibold text-white/80">{thumbnailFile?.name}</p>
                  <p className="text-[10px] text-white/50">{thumbnailFile ? formatBytes(thumbnailFile.size) : ''}</p>
                </div>
                {/* Controls stay visible on touch, where there is no hover. */}
                <button
                  type="button"
                  onClick={() => onFileChange(null)}
                  aria-label="Remove cover image"
                  className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/75 text-white/80 transition duration-150 hover:bg-red-500/80 hover:text-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 motion-reduce:transition-none"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => thumbnailRef.current?.click()}
                  className="absolute bottom-3 right-3 rounded-lg border border-white/20 bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white/75 transition duration-150 hover:bg-white/15 hover:text-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 motion-reduce:transition-none"
                >
                  Change
                </button>
                {thumbnailFile && thumbnailFile.size > MAX_THUMBNAIL_BYTES && (
                  <p className="absolute left-3 top-3 rounded-md bg-red-500/85 px-2 py-1 text-[10px] font-semibold text-white">
                    Over {formatBytes(MAX_THUMBNAIL_BYTES)}
                  </p>
                )}
              </div>
            ) : (
              /* ── drop zone ── */
              <MediaDropZone
                title="Add cover image"
                hint={`Drag & drop an image here or choose from your device · PNG, JPG, WebP · max ${formatBytes(MAX_THUMBNAIL_BYTES)} · recommended ${THUMB_RECOMMENDED_W}×${THUMB_RECOMMENDED_H}px`}
                onChoose={() => thumbnailRef.current?.click()}
                accept={f => f.type.startsWith('image/')}
                onFiles={files => onFileChange(files[0])}
              />
            )}
          </>
        )}

        {/* NON-POST: URL input */}
        {!isPost && thumbnailMode === 'url' && (
          <div className="space-y-3">
            <div className="relative">
              <Globe className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
              <input
                className={`${inputCls} pl-9`}
                type="url"
                value={thumbnailUrlInput}
                onChange={e => { onUrlChange(e.target.value); setUrlError(false); }}
                placeholder="https://images.example.com/cover.jpg"
                autoComplete="off"
              />
              {thumbnailUrlInput && (
                <button
                  type="button"
                  onClick={() => { onUrlChange(''); setUrlError(false); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {thumbnailUrlInput.trim() && (
              <div className="overflow-hidden rounded-xl border border-white/[0.10]">
                {!urlError ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbnailUrlInput.trim()}
                    alt="Cover preview"
                    className="max-h-64 w-full object-contain bg-black/25"
                    onError={() => setUrlError(true)}
                    onLoad={() => setUrlError(false)}
                  />
                ) : (
                  <div className="flex h-32 flex-col items-center justify-center gap-2 bg-white/[0.02] text-center">
                    <ImageIcon className="h-5 w-5 text-white/20" />
                    <p className="text-[11.5px] font-medium text-white/30">Could not load image from this URL</p>
                    <p className="text-[10.5px] text-white/20">Make sure the link points directly to an image file</p>
                  </div>
                )}
              </div>
            )}

            {!thumbnailUrlInput && (
              <div className="space-y-1 text-center">
                <p className="text-[11px] text-white/25">
                  Paste a direct image URL — JPG, PNG, WebP, GIF
                </p>
                <p className="text-[10.5px] text-white/15">
                  Recommended {THUMB_RECOMMENDED_W}×{THUMB_RECOMMENDED_H}px · only shown in feed if provided
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The signed-in user's (or business page's) avatar.
 *
 * Used by BOTH the composer identity row and the live preview so the two are
 * guaranteed to match. Falls back to the initial when there is no photo, and
 * again if the photo fails to load — never a broken image.
 */
function IdentityAvatar({ src, name, className = 'h-9 w-9' }: { src?: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  // Reset when the photo changes, or a recycled component keeps showing the
  // initial for a src that would load fine.
  useEffect(() => { setFailed(false); }, [src]);

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        className={`${className} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <span className={`${className} flex shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[13px] font-bold text-white/70`}>
      {(name || 'You').charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * A preview URL for a File that is created once and revoked on unmount.
 *
 * The previous inline `URL.createObjectURL(file)` ran on every render, minting
 * a fresh blob URL each time and never revoking any of them — the browser held
 * every one for the life of the page.
 */
/**
 * One selected post image in the composer grid.
 *
 * A square crop is right for a GRID chip — that is how the feed shows a
 * multi-image post — so the full picture is reached by clicking it, which opens
 * the uncropped viewer.
 *
 * It is a component rather than inline JSX for a reason: the grid previously
 * called `URL.createObjectURL(img)` inside its map, minting a fresh blob URL on
 * every render and revoking none of them. `useObjectUrl` creates one per file
 * and revokes it on unmount, so the browser decodes each image once.
 */
function PostImageTile({
  file, index, onRemove,
}: {
  file: File; index: number; onRemove: () => void;
}) {
  const url = useObjectUrl(file);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative group aspect-square rounded-xl overflow-hidden border border-white/[0.10]">
      {url && !failed ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`View image ${index + 1} full size`}
          className="block h-full w-full cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            onError={() => setFailed(true)}
            className="w-full h-full object-cover"
          />
        </button>
      ) : (
        /* A file that cannot be decoded shows a calm placeholder instead of a
           broken-image icon, so one bad file never wrecks the grid. */
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-white/[0.03] px-2 text-center">
          <ImageIcon className="h-4 w-4 text-white/25" />
          <p className="w-full truncate text-[10px] text-white/35">{file.name}</p>
        </div>
      )}

      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white/80 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition hover:bg-black/90 hover:text-white text-[10px]"
        aria-label={`Remove image ${index + 1}`}
      >
        <X className="h-2.5 w-2.5" />
      </button>

      {open && url && (
        <FullImageViewer src={url} alt={file.name} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

/* ─── full-image viewer ───────────────────────────────────────────────────
   Composer thumbnails are deliberately cropped squares — that IS how the feed
   grid shows them. This is how the WHOLE image stays reachable: click any
   thumbnail and it opens uncropped on a dark backdrop.

   No dependency, no animation, no editing. Escape and an outside click close
   it, and the close button takes focus on open so a keyboard user is never
   stranded behind the backdrop. */
function FullImageViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    /* The page behind must not scroll while the viewer is up. */
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Full image"
      onClick={onClose}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close image"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06] text-white/70 transition hover:bg-white/[0.12] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
      >
        <X className="h-4 w-4" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        /* contain + viewport caps: the entire image, never cropped, never
           larger than the screen, aspect ratio untouched. */
        className="max-h-[92vh] max-w-[92vw] object-contain"
      />
    </div>
  );
}

function useObjectUrl(file: File | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setUrl(null); return; }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

/**
 * One selected file. Images show their thumbnail; anything else falls back to
 * an icon with the name and size, so a non-image never renders as a broken
 * picture.
 */
function MediaTile({ file, badge, onRemove, oversizeLimit }: {
  file: File;
  badge?: string;
  onRemove: () => void;
  /** Existing publish-time limit for this slot, used for an early heads-up. */
  oversizeLimit?: number;
}) {
  const url = useObjectUrl(file);
  const isImage = file.type.startsWith('image/');
  const oversize = oversizeLimit !== undefined && file.size > oversizeLimit;
  const [viewing, setViewing] = useState(false);

  return (
    <div className="group relative">
      <div
        className={`relative aspect-square overflow-hidden rounded-xl border transition-colors duration-150 motion-reduce:transition-none ${
          oversize ? 'border-red-500/40' : 'border-white/[0.09]'
        }`}
      >
        {isImage && url ? (
          /* Square chip, like the feed's own attachment grid — clicking opens
             the whole image rather than leaving it cropped. */
          <button
            type="button"
            onClick={() => setViewing(true)}
            aria-label={`View ${file.name} full size`}
            className="block h-full w-full cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={file.name} className="h-full w-full object-cover" />
          </button>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-white/[0.03] px-2 text-center">
            <FileText className="h-5 w-5 text-white/30" />
            <p className="w-full truncate text-[10px] font-medium text-white/45">{file.name}</p>
            <p className="text-[9.5px] text-white/25">{formatBytes(file.size)}</p>
          </div>
        )}

        {badge && (
          <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white/70">
            {badge}
          </span>
        )}

        {/* Always tappable on touch; fades in on pointer devices. */}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${file.name}`}
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-black/75 text-white/80 transition duration-150 hover:bg-red-500/80 hover:text-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 motion-reduce:transition-none"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Surfaces the EXISTING publish-time size rule next to the file that
          breaks it. Nothing is blocked here — publish() stays the enforcer. */}
      {oversize && (
        <p className="mt-1 text-[10px] leading-snug text-red-400/90">
          Over {formatBytes(oversizeLimit!)} — remove or replace to publish.
        </p>
      )}
      {viewing && url && (
        <FullImageViewer src={url} alt={file.name} onClose={() => setViewing(false)} />
      )}
    </div>
  );
}

/**
 * The empty state. Deliberately one quiet dashed panel: an icon, a line of
 * instruction, the accepted formats, and a button.
 */
function MediaDropZone({ title, hint, onChoose, onFiles, accept }: {
  title: string;
  hint: string;
  onChoose: () => void;
  onFiles: (files: File[]) => void;
  accept?: (f: File) => boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);   // dragenter/leave fire per child; count them

  return (
    <div
      onDragEnter={e => { e.preventDefault(); depth.current += 1; setDragging(true); }}
      onDragOver={e => e.preventDefault()}
      onDragLeave={e => { e.preventDefault(); depth.current -= 1; if (depth.current <= 0) { depth.current = 0; setDragging(false); } }}
      onDrop={e => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        const files = Array.from(e.dataTransfer.files ?? []).filter(f => !accept || accept(f));
        if (files.length) onFiles(files);
      }}
      /* Styling comes from .publish-dropzone — see the note in globals.css. */
      data-dragging={dragging}
      className="publish-dropzone rounded-xl"
    >
      <div className="flex flex-col items-center gap-2.5 px-4 py-4 text-center sm:flex-row sm:gap-3.5 sm:py-5 sm:text-left">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors duration-150 motion-reduce:transition-none ${
            dragging ? 'border-white/25 bg-white/10' : 'border-white/[0.10] bg-white/[0.05]'
          }`}
        >
          <Upload className={`h-4 w-4 transition-colors duration-150 motion-reduce:transition-none ${dragging ? 'text-white/70' : 'text-white/35'}`} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white/60">{dragging ? 'Drop to add' : title}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-white/28">{hint}</p>
        </div>

        <button
          type="button"
          onClick={onChoose}
          className="shrink-0 whitespace-nowrap rounded-xl border border-white/[0.12] bg-white/[0.06] px-3.5 py-2 text-[12px] font-semibold text-white/70 transition duration-150 hover:bg-white/[0.11] hover:text-white motion-reduce:transition-none"
        >
          Choose files
        </button>
      </div>
    </div>
  );
}

/**
 * Feed-card preview.
 *
 * Mirrors the hierarchy the real cards use — category badge, title, body,
 * category-specific metadata, actions — from the values currently in the form.
 * It reads state; it never writes, so opening Preview can never alter a draft.
 */
function PublishPreviewCard({
  category, activeCat, fields: f, resume: r,
  thumbnailFile, thumbnailUrlInput, thumbnailMode,
  postImages, productImages, pollOptions, tutorialSteps,
  authorName, authorAvatar, authorContext, cta,
}: {
  category: CategoryId | null;
  activeCat: (typeof CATEGORIES)[number] | null | undefined;
  fields: FieldState;
  resume: typeof blankResume;
  thumbnailFile: File | null;
  thumbnailUrlInput: string;
  thumbnailMode: 'upload' | 'url';
  postImages: File[];
  productImages: File[];
  pollOptions: string[];
  tutorialSteps: { title: string; desc: string; imageUrl: string }[];
  /** Identity comes from the session/business page the composer already has —
      no lookup, no client-supplied id. */
  authorName: string;
  authorAvatar?: string | null;
  authorContext?: string | null;
  cta: PostCta | null;
}) {
  // Cover: uploaded file, pasted URL, or the first gallery image.
  const gallery = category === 'product' ? productImages : postImages;
  const coverFile = thumbnailFile ?? (gallery.length > 0 ? gallery[0] : null);
  const coverObjectUrl = useObjectUrl(coverFile);
  const cover = thumbnailMode === 'url' && thumbnailUrlInput.trim()
    ? thumbnailUrlInput.trim()
    : coverObjectUrl;

  const c = CAT_COLORS[activeCat?.color ?? 'neutral'] ?? CAT_COLORS['neutral'];
  const Icon = activeCat?.icon ?? FileText;

  const title =
    category === 'resume' ? r.displayName
    : category === 'poll' ? (f.pollQuestion || f.title)
    : category === 'post' ? (f.postCaption || f.title)
    : f.title;

  const body =
    category === 'article' ? f.content
    : category === 'post' ? ''
    : category === 'gig' ? f.gigSummary
    : (f.notes || f.description || f.content || f.excerpt);

  /* Metadata mirrors what each card type shows in the feed. Only entries the
     user actually filled in are rendered. */
  const meta: string[] = (() => {
    switch (category) {
      case 'job':       return [f.jobLocation, f.jobType, f.salary];
      case 'event':     return [f.eventDate, f.eventTime, f.eventVenue || f.eventMode];
      case 'product':   return [f.price, f.notes];
      case 'tutorial':  return [`${tutorialSteps.filter(t => t.title.trim()).length} steps`];
      case 'gig':       return [f.gigBudget, f.gigTimeline, f.gigLocation];
      case 'video':     return [f.videoDuration, f.videoSource];
      case 'poll':      return [`${pollOptions.filter(Boolean).length} options`, f.pollDuration && `${f.pollDuration} days`];
      case 'news':      return [f.publisher, f.newsDate];
      case 'document':  return [f.file ? (f.file.type.split('/').pop() || 'file').toUpperCase() : f.textFormat?.toUpperCase()];
      case 'hackathon': return [f.hackMode, f.hackPrize, f.hackStartDate];
      case 'milestone': return [f.milestoneMetric, f.milestoneContext];
      default:          return [];
    }
  })().filter((x): x is string => Boolean(x && String(x).trim()));

  const tags = f.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 3);

  return (
    <article
      className="overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.025]"
      style={{ ['--cat-accent' as string]: c.accent }}
      aria-label="Preview of your publication"
    >
      {cover && (
        /* The feed renders a cover as `w-full h-auto` — the whole image, not a
           crop. This preview used a fixed 160px box with object-cover, so it
           showed a slice of the image and misrepresented what publishing would
           produce. Natural height with a cap matches the feed and keeps a very
           tall image from taking over the column. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          className="w-full h-auto max-h-[420px] object-contain bg-black/20"
          loading="lazy"
          decoding="async"
        />
      )}
      <div className="p-4">
        {/* Author row — the same hierarchy the real feed cards use. */}
        <div className="flex items-start gap-2.5">
          <IdentityAvatar src={authorAvatar} name={authorName} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-tight text-white/90">{authorName || 'You'}</p>
            {authorContext && <p className="mt-0.5 truncate text-[10.5px] leading-tight text-white/35">{authorContext}</p>}
            <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] leading-tight text-white/30">
              <span className={`inline-flex items-center gap-1 ${c.icon}`}>
                <Icon className="h-3 w-3" />
                {activeCat?.label ?? 'Publication'}
              </span>
              <span aria-hidden className="opacity-50">·</span>
              {/* Always Public: the composer no longer offers a private
                  option, so branching here would render a state the author
                  can no longer produce. */}
              Public
              <span aria-hidden className="opacity-50">·</span>
              just now
            </p>
          </div>
        </div>

        <h4 className="mt-3 text-[15px] font-bold leading-snug tracking-[-0.01em] text-white">
          {title?.trim() || <span className="text-white/30">Untitled</span>}
        </h4>

        {body?.trim() && (
          <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-relaxed text-white/50">{body}</p>
        )}

        {category === 'poll' && pollOptions.filter(Boolean).length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {pollOptions.filter(Boolean).map((o, i) => (
              <li key={i} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/65">{o}</li>
            ))}
          </ul>
        )}

        {meta.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/40">
            {meta.map((m, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden className="opacity-40">·</span>}{m}
              </span>
            ))}
          </div>
        )}

        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map(t => (
              <span key={t} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10.5px] text-white/45">#{t}</span>
            ))}
          </div>
        )}

        {gallery.length > 1 && (
          <p className="mt-3 text-[10.5px] text-white/30">+{gallery.length - 1} more image{gallery.length > 2 ? 's' : ''}</p>
        )}

        {/* CTA — label only. The raw URL is never surfaced once a label exists. */}
        {cta && (
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-[11px] border border-white/[0.14] bg-white/[0.08] px-3.5 py-2 text-[12.5px] font-semibold text-white/85">
            {cta.label} <span aria-hidden>&rarr;</span>
          </span>
        )}

        {/* Actions, as they appear on a real card. No counts are shown —
            a brand-new post has no engagement, and inventing some would lie. */}
        <div aria-hidden className="mt-3.5 flex items-center gap-5 border-t border-white/[0.06] pt-2.5 text-[11.5px] font-semibold text-white/30">
          <span className="inline-flex items-center gap-1.5"><Heart className="h-3.5 w-3.5" /> Like</span>
          <span className="inline-flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Comment</span>
          <span className="inline-flex items-center gap-1.5"><Share2 className="h-3.5 w-3.5" /> Share</span>
        </div>
      </div>
    </article>
  );
}

function SectionHeader({ icon: Icon, label, hint }: { icon: React.ElementType; label: string; hint?: string }) {
  return (
    <div className="mb-2 flex items-center gap-2.5 pb-3 border-b border-white/[0.05]">
      <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-white/[0.09]">
        <Icon className="h-3.5 w-3.5 text-white/55" />
      </div>
      <div>
        <span className="text-[13px] sm:text-[13.5px] font-bold text-white/85 tracking-[-0.01em]">{label}</span>
        {hint && <p className="mt-px text-[10.5px] text-white/30">{hint}</p>}
      </div>
    </div>
  );
}
