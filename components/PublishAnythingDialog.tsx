'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  ChevronDown,
  BarChart2,
  BookMarked,
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
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

const CAT_COLORS: Record<string, { bg: string; icon: string; ring: string; glow: string; grad: string; iconBg: string }> = {
  rose:    { bg: 'bg-rose-500/[0.10]',    icon: 'text-rose-300',    ring: 'ring-rose-500/[0.15]',    glow: 'hover:shadow-[0_8px_32px_rgba(244,63,94,0.20)]',    grad: 'from-rose-500/[0.14] via-rose-500/[0.04]',    iconBg: 'bg-rose-500/20 ring-1 ring-rose-500/25'    },
  violet:  { bg: 'bg-violet-500/[0.10]',  icon: 'text-violet-300',  ring: 'ring-violet-500/[0.15]',  glow: 'hover:shadow-[0_8px_32px_rgba(139,92,246,0.20)]',  grad: 'from-violet-500/[0.14] via-violet-500/[0.04]',  iconBg: 'bg-violet-500/20 ring-1 ring-violet-500/25'  },
  amber:   { bg: 'bg-amber-500/[0.10]',   icon: 'text-amber-300',   ring: 'ring-amber-500/[0.15]',   glow: 'hover:shadow-[0_8px_32px_rgba(245,158,11,0.20)]',   grad: 'from-amber-500/[0.14] via-amber-500/[0.04]',   iconBg: 'bg-amber-500/20 ring-1 ring-amber-500/25'   },
  emerald: { bg: 'bg-emerald-500/[0.10]', icon: 'text-emerald-300', ring: 'ring-emerald-500/[0.15]', glow: 'hover:shadow-[0_8px_32px_rgba(16,185,129,0.20)]', grad: 'from-emerald-500/[0.14] via-emerald-500/[0.04]', iconBg: 'bg-emerald-500/20 ring-1 ring-emerald-500/25' },
  sky:     { bg: 'bg-sky-500/[0.10]',     icon: 'text-sky-300',     ring: 'ring-sky-500/[0.15]',     glow: 'hover:shadow-[0_8px_32px_rgba(14,165,233,0.20)]',     grad: 'from-sky-500/[0.14] via-sky-500/[0.04]',     iconBg: 'bg-sky-500/20 ring-1 ring-sky-500/25'     },
  indigo:  { bg: 'bg-indigo-500/[0.10]',  icon: 'text-indigo-300',  ring: 'ring-indigo-500/[0.15]',  glow: 'hover:shadow-[0_8px_32px_rgba(99,102,241,0.20)]',  grad: 'from-indigo-500/[0.14] via-indigo-500/[0.04]',  iconBg: 'bg-indigo-500/20 ring-1 ring-indigo-500/25'  },
  neutral: { bg: 'bg-white/[0.06]',       icon: 'text-white/70',    ring: 'ring-white/[0.10]',       glow: 'hover:shadow-[0_8px_32px_rgba(255,255,255,0.08)]', grad: 'from-white/[0.06] via-white/[0.02]',            iconBg: 'bg-white/10 ring-1 ring-white/15'           },
  orange:  { bg: 'bg-orange-500/[0.10]',  icon: 'text-orange-300',  ring: 'ring-orange-500/[0.15]',  glow: 'hover:shadow-[0_8px_32px_rgba(249,115,22,0.20)]',  grad: 'from-orange-500/[0.14] via-orange-500/[0.04]',  iconBg: 'bg-orange-500/20 ring-1 ring-orange-500/25'  },
  green:   { bg: 'bg-green-500/[0.10]',   icon: 'text-green-300',   ring: 'ring-green-500/[0.15]',   glow: 'hover:shadow-[0_8px_32px_rgba(34,197,94,0.20)]',   grad: 'from-green-500/[0.14] via-green-500/[0.04]',   iconBg: 'bg-green-500/20 ring-1 ring-green-500/25'   },
  yellow:  { bg: 'bg-yellow-500/[0.10]',  icon: 'text-yellow-300',  ring: 'ring-yellow-500/[0.15]',  glow: 'hover:shadow-[0_8px_32px_rgba(234,179,8,0.20)]',  grad: 'from-yellow-500/[0.14] via-yellow-500/[0.04]',  iconBg: 'bg-yellow-500/20 ring-1 ring-yellow-500/25'  },
  red:     { bg: 'bg-red-500/[0.10]',     icon: 'text-red-300',     ring: 'ring-red-500/[0.15]',     glow: 'hover:shadow-[0_8px_32px_rgba(239,68,68,0.20)]',     grad: 'from-red-500/[0.14] via-red-500/[0.04]',     iconBg: 'bg-red-500/20 ring-1 ring-red-500/25'     },
};

/* ─── field states ──────────────────────────────────────────── */
const blank = {
  title: '', tags: '', notes: '', visibility: 'public' as Visibility,
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

/* ─── step state ─────────────────────────────────────────────── */
type Step = 'pick' | 'form';

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
  const [step, setStep] = useState<Step>('pick');
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [fields, setFields] = useState<FieldState>({ ...blank });
  const [resume, setResume] = useState({ ...blankResume });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successHref, setSuccessHref] = useState<string | null>(null);
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
      if (initialCategory) {
        setCategory(initialCategory);
        setStep('form');
        setAnimKey(k => k + 1);
      } else {
        setStep('pick');
        setCategory(null);
      }
    }
  }, [open, initialCategory]);

  const pickCategory = (id: CategoryId) => {
    setCategory(id);
    setStep('form');
    setError('');
    setSuccessHref(null);
    setAnimKey(k => k + 1);
  };

  const goBack = () => {
    setStep('pick');
    setError('');
    setSuccessHref(null);
  };

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
  const publish = async () => {
    if (!category) return;
    setError(''); setSuccessHref(null);

    if (category === 'resume') {
      if (!isAuthenticated) { setError('Login required to publish a resume.'); return; }
      if (!resume.displayName.trim()) { setError('Display name is required.'); return; }
      if (!resume.category.trim()) { setError('Please select a category.'); return; }
      if (!resume.resumeFile && !resume.pastedText.trim()) { setError('Upload a resume file or paste resume text.'); return; }
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

    if (category === 'gig' && !fields.title.trim()) { setError('Gig title is required.'); return; }
    if (category === 'gig' && !fields.gigSummary.trim()) { setError('Gig summary is required.'); return; }
    if (category === 'poll' && !fields.pollQuestion.trim()) { setError('Poll question is required.'); return; }
    if (category === 'poll' && pollOptions.filter(Boolean).length < 2) { setError('At least 2 poll options are required.'); return; }
    if (category === 'survey' && !surveyQuestions.some(q => q.text.trim())) { setError('At least 1 survey question is required.'); return; }
    if (category === 'chart' && !fields.chartLabels.trim()) { setError('Chart labels are required.'); return; }
    if (category === 'chart' && !fields.chartValues.trim()) { setError('Chart values are required.'); return; }
    if (category === 'post' && !fields.postCaption.trim() && postImages.length === 0) { setError('Add a caption or at least one image.'); return; }
    if (category === 'tutorial' && !tutorialSteps.some(s => s.title.trim())) { setError('Add at least one step.'); return; }

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
          if (file.size > limit) throw new Error(`File too large for public publishing (max ${formatBytes(limit)}).`);
        }
        dataUrl = await fileToDataUrl(file);
        fileName = file.name; mimeType = file.type || 'application/octet-stream'; sizeInBytes = file.size;
      } else {
        const text = buildTextBody();
        if (!text.trim() && !fields.title.trim()) { throw new Error('Add content to publish.'); }
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
        if (thumbnailFile.size > MAX_THUMBNAIL_BYTES) throw new Error(`Thumbnail too large (max ${formatBytes(MAX_THUMBNAIL_BYTES)}).`);
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
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: fields.title.trim() || category,
          fileName, mimeType, dataUrl, sizeInBytes,
          notes: contentBody,
          directoryVisibility: fields.visibility,
          directoryCategory: category,
          directoryTags: fields.tags.split(',').map(t => t.trim()).filter(Boolean),
          authMode: fields.visibility === 'public' ? 'public' : 'password',
          videoUrl: category === 'video' && fields.videoUrl.trim() ? fields.videoUrl.trim() : undefined,
          thumbnailUrl: resolvedThumbnailUrl,
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
          title: fields.title.trim() || category,
          content: contentBody || '',
          category,
        });
      }
      // Close dialog and refresh current page data without navigating away
      if (publishedId && fields.visibility === 'public') {
        onOpenChange(false);
        router.refresh();
      } else {
        setSuccessHref(publishedId ? `/transfer/${publishedId}` : '/file-directory');
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Publish failed.'); }
    finally { setBusy(false); }
  };

  if (!open) return null;

  const activeCat = category ? CATEGORIES.find(c => c.id === category) : null;
  const vis = category === 'resume' ? resume.visibility : fields.visibility;
  const setVis = (v: Visibility) => {
    if (category === 'resume') setResume(r => ({ ...r, visibility: v }));
    else set({ visibility: v });
  };

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
      onClick={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-lg animate-in fade-in duration-200" aria-hidden="true" />

      {/* Dialog */}
      <div className="relative flex w-full max-w-[880px] flex-col overflow-hidden
        h-auto max-h-[calc(96dvh-84px)] rounded-t-[28px]
        sm:h-auto sm:max-h-[88dvh] sm:rounded-[28px]
        border border-white/[0.08] bg-[#0a0a0e]
        shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_-1px_0_0_rgba(255,255,255,0.06),0_32px_80px_rgba(0,0,0,0.98)]
        animate-in fade-in slide-in-from-bottom-8 duration-[300ms] ease-[cubic-bezier(0.25,0.75,0,1)]
        sm:slide-in-from-bottom-4 sm:zoom-in-[99%] sm:duration-[180ms]">

        {/* Mobile drag handle */}
        <div className="flex sm:hidden shrink-0 justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-white/[0.12]" />
        </div>

        {/* ── Header ── */}
        <div className="flex shrink-0 items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-white/[0.06]">
          {step === 'pick' ? (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] ring-1 ring-white/[0.09]">
                <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white/60" />
              </div>
              <div>
                <h2 className="text-[14px] sm:text-[15px] font-bold text-white leading-tight tracking-[-0.01em]">Publish anything</h2>
                <p className="mt-0.5 text-[10.5px] sm:text-[11px] text-white/35 leading-tight">{CATEGORIES.length} formats · choose one to get started</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={goBack}
                className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/50 transition hover:bg-white/[0.09] hover:text-white active:scale-95"
                aria-label="Back to categories"
              >
                <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
              {activeCat && (
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${CAT_COLORS[activeCat.color]?.bg ?? 'bg-white/[0.06]'} ${CAT_COLORS[activeCat.color]?.ring ?? 'ring-white/[0.10]'}`}>
                    <activeCat.icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${CAT_COLORS[activeCat.color]?.icon ?? 'text-white/70'}`} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[14px] sm:text-[15px] font-bold text-white leading-tight tracking-[-0.01em] truncate">{activeCat.label}</h2>
                    <p className="mt-0.5 text-[10.5px] text-white/35 leading-tight truncate">{activeCat.desc}</p>
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-white/40 transition hover:bg-white/[0.09] hover:text-white active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Body ── */}
        {step === 'pick' ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Search bar — hidden on all sizes */}
            <div className="hidden shrink-0 px-5 sm:px-6 pt-4 pb-3.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/20" />
                <input
                  type="text"
                  value={catSearch}
                  onChange={e => setCatSearch(e.target.value)}
                  placeholder="Search — article, job post, product, gig…"
                  className="h-11 w-full rounded-2xl border border-white/[0.08] bg-white/[0.035] pl-11 pr-10 text-[13.5px] text-white placeholder:text-white/18 outline-none transition-all focus:border-white/[0.18] focus:bg-white/[0.055] focus:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
                  autoComplete="off"
                />
                {catSearch && (
                  <button
                    type="button"
                    onClick={() => setCatSearch('')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-white/40 hover:bg-white/20 hover:text-white/70 transition"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Category grid */}
            <div className="flex-1 overflow-y-auto px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-2 scrollbar-minimal">
              {filteredCats.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.08]">
                    <Search className="h-5 w-5 text-white/20" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-white/40">No formats found</p>
                    <p className="mt-1 text-[11.5px] text-white/22">Try a different keyword</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2">
                  {filteredCats.map(({ id, label, icon: Icon, desc, color }) => {
                    const c = CAT_COLORS[color] ?? CAT_COLORS['neutral'];
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => pickCategory(id)}
                        className={`group relative flex flex-col gap-2 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0e0e12] p-2.5 sm:p-3 text-left transition-all duration-200 hover:border-white/[0.14] hover:scale-[1.02] active:scale-[0.98] ${c.glow}`}
                      >
                        {/* gradient wash */}
                        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${c.grad} to-transparent opacity-100 transition-opacity duration-300 group-hover:opacity-100`} />
                        {/* icon */}
                        <div className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${c.iconBg}`}>
                          <Icon className={`h-3.5 w-3.5 ${c.icon}`} />
                        </div>
                        {/* text */}
                        <div className="relative min-w-0">
                          <p className="text-[11px] sm:text-[12px] font-bold text-white/85 leading-tight group-hover:text-white transition-colors">{label}</p>
                        </div>
                        {/* arrow */}
                        <ArrowRight className={`absolute right-2.5 top-2.5 h-3 w-3 ${c.icon} opacity-0 group-hover:opacity-50 transition-opacity`} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Form area */
          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6 scrollbar-minimal overscroll-contain">
            <div key={animKey} className="animate-in fade-in slide-in-from-bottom-2 duration-200 space-y-5">

              {/* ── Cover Image — always FIRST, visible immediately in every form ── */}
              {category && (
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
              )}

              {/* ── Category-specific fields ── */}
              {category === 'post'         && <PostForm fields={fields} set={set} postImages={postImages} setPostImages={setPostImages} postImagesRef={postImagesRef} />}
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

            {/* Common: tags + notes */}
            {category && !['resume', 'gig', 'post', 'poll', 'survey', 'chart', 'thread', 'video', 'milestone', 'tutorial'].includes(category) && (
              <div className="mt-2 grid gap-3 sm:grid-cols-2 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4">
                <Field label="Tags" hint="Comma-separated keywords for discovery" span>
                  <div className="relative">
                    <Tag className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/22" />
                    <input className={`${inputCls} pl-9`} value={fields.tags} onChange={e => set({ tags: e.target.value })} placeholder="e.g. nda, contract, template" />
                  </div>
                </Field>
                <Field label="Short description" hint="Shown in search and discovery listings" span>
                  <input className={inputCls} value={fields.notes} onChange={e => set({ notes: e.target.value })} placeholder="One-line summary of this content…" />
                </Field>
              </div>
            )}

            {/* Tags for new categories */}
            {category && ['post', 'poll', 'survey', 'chart', 'thread', 'video', 'milestone', 'tutorial'].includes(category) && (
              <div className="mt-2 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4">
                <Field label="Tags" hint="Comma-separated keywords — helps people find your content">
                  <div className="relative">
                    <Tag className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/22" />
                    <input className={`${inputCls} pl-9`} value={fields.tags} onChange={e => set({ tags: e.target.value })} placeholder="e.g. community, feedback, product" />
                  </div>
                </Field>
              </div>
            )}

            {error && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-500/[0.18] bg-red-500/[0.07] px-3.5 py-3 text-[13px] text-red-400">
                <X className="h-3.5 w-3.5 mt-px shrink-0 opacity-70" />
                <span>{error}</span>
              </div>
            )}

            {successHref && (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-500/[0.18] bg-emerald-500/[0.07] px-3.5 py-3 text-[13px] text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span className="font-medium">Published!{' '}
                  <Link href={successHref} className="font-bold underline underline-offset-2 hover:text-emerald-300 transition">
                    View it <ArrowRight className="inline h-3.5 w-3.5" />
                  </Link>
                </span>
              </div>
            )}

            <div className="h-6" />
          </div>
        )}

        {/* ── Footer ── */}
        <div className="flex shrink-0 flex-col gap-2.5 border-t border-white/[0.06] bg-[#0a0a0e] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-4">
          {step === 'pick' ? (
            <div className="flex w-full items-center justify-between">
              <p className="text-[11.5px] text-white/22">Select a format above to begin publishing</p>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-8 rounded-xl border border-white/[0.07] bg-transparent px-4 text-[12.5px] font-medium text-white/45 transition hover:bg-white/[0.05] hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              {/* Visibility toggle */}
              <div className="flex items-center gap-1.5 self-start rounded-xl border border-white/[0.07] bg-white/[0.025] p-[3px]">
                <button
                  type="button"
                  onClick={() => setVis('public')}
                  className={[
                    'inline-flex h-7 sm:h-7.5 items-center gap-1.5 rounded-[10px] px-3 text-[11.5px] font-semibold transition-all',
                    vis === 'public'
                      ? 'bg-white/[0.12] text-white shadow-[0_1px_3px_rgba(0,0,0,0.4)]'
                      : 'text-white/35 hover:text-white/60',
                  ].join(' ')}
                >
                  <Globe className="h-3 w-3" /> Public
                </button>
                <button
                  type="button"
                  onClick={() => setVis('private')}
                  className={[
                    'inline-flex h-7 sm:h-7.5 items-center gap-1.5 rounded-[10px] px-3 text-[11.5px] font-semibold transition-all',
                    vis === 'private'
                      ? 'bg-white/[0.12] text-white shadow-[0_1px_3px_rgba(0,0,0,0.4)]'
                      : 'text-white/35 hover:text-white/60',
                  ].join(' ')}
                >
                  <Lock className="h-3 w-3" /> Private
                </button>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="h-9 sm:h-9.5 rounded-xl border border-white/[0.07] bg-transparent px-4 sm:px-5 text-[13px] font-medium text-white/45 transition hover:bg-white/[0.05] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void publish()}
                  disabled={busy}
                  className={[
                    'inline-flex h-9 sm:h-9.5 min-w-[130px] items-center justify-center gap-2 rounded-xl px-5 sm:px-6 text-[13px] font-bold transition-all active:scale-[0.97] disabled:opacity-40',
                    vis === 'private'
                      ? 'border border-white/[0.14] bg-white/[0.08] text-white hover:bg-white/[0.14] shadow-[0_2px_12px_rgba(0,0,0,0.3)]'
                      : 'bg-white text-[#09090c] hover:bg-white/90 shadow-[0_4px_20px_rgba(255,255,255,0.12),0_2px_8px_rgba(0,0,0,0.3)]',
                  ].join(' ')}
                >
                  {busy ? (
                    <>
                      <div className={`h-3.5 w-3.5 animate-spin rounded-full border-2 ${vis === 'private' ? 'border-white/30 border-t-white' : 'border-[#09090c]/30 border-t-[#09090c]'}`} />
                      Publishing…
                    </>
                  ) : (
                    <>
                      {vis === 'private'
                        ? <><Lock className="h-3.5 w-3.5" /> Save privately</>
                        : <><Globe className="h-3.5 w-3.5" /> Publish publicly</>
                      }
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
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
              {postImages.map((img, i) => {
                const url = URL.createObjectURL(img);
                return (
                  <div key={i} className="relative group aspect-square rounded-xl overflow-hidden border border-white/[0.10]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPostImages(prev => prev.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white/80 opacity-0 group-hover:opacity-100 transition hover:bg-black/90 hover:text-white text-[10px]"
                      aria-label="Remove image"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                );
              })}
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
        <Field label="Poll title (optional)" span>
          <input className={inputCls} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="Give your poll a name…" />
        </Field>
        <Field label="Question *" span>
          <textarea
            className={textareaCls}
            rows={3}
            value={f.pollQuestion}
            onChange={e => set({ pollQuestion: e.target.value })}
            placeholder="Ask your audience something…"
          />
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
            onChange={e => set({ surveyDesc: e.target.value })}
            placeholder="What is this survey about?"
          />
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
        <Field label="Labels (comma-separated)" span>
          <input className={inputCls} value={f.chartLabels} onChange={e => set({ chartLabels: e.target.value })} placeholder="Jan, Feb, Mar, Apr…" />
        </Field>
        <Field label="Values (comma-separated)" span>
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
          <textarea className={textareaCls} rows={7} value={f.notes} onChange={e => set({ notes: e.target.value })} placeholder="Write the full news story here. Cover the who, what, when, where, why…" />
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
          <textarea className={textareaCls} rows={9} value={f.content} onChange={e => set({ content: e.target.value })} placeholder="Start writing here. Markdown supported — use # headings, **bold**, _italic_, lists…" />
          {f.content.length > 0 && <p className="mt-1 text-[10.5px] text-white/20 text-right">{f.content.length} chars</p>}
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
              <button type="button" onClick={() => { set({ file: null }); if (fileRef.current) fileRef.current.value = ''; }} className="ml-3 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-white/60 hover:text-white">Remove</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.15] bg-white/[0.02] py-8 text-center transition hover:border-white/25 hover:bg-white/[0.04]"
            >
              <Upload className="h-6 w-6 text-white/30" />
              <span className="text-sm font-medium text-white/50">Click to upload a file</span>
              <span className="text-[11px] text-white/25">PDF, DOCX, Images and more · 15 MB max</span>
            </button>
          )}
        </div>

        {!f.file && (
          <>
            <Field label="Or write text" span>
              <textarea className={textareaCls} rows={5} value={f.notes} onChange={e => set({ notes: e.target.value })} placeholder="Paste or write document content…" />
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
          <textarea className={textareaCls} rows={6} value={f.notes} onChange={e => set({ notes: e.target.value })} placeholder="Describe the project — what was the problem, what did you build, what was the outcome and impact?&#10;&#10;Use bullet points or paragraphs." />
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
          <textarea className={textareaCls} rows={6} value={f.notes} onChange={e => set({ notes: e.target.value })} placeholder="Write your announcement here. Be clear and concise…" />
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
          <textarea className={textareaCls} rows={5} value={f.description} onChange={e => set({ description: e.target.value })} placeholder="What will this person do? Describe the role, team, and impact…" />
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
        <Field label="Display name *">
          <input className={inputCls} value={r.displayName} onChange={e => set({ displayName: e.target.value })} placeholder="Kushagra Sharma" />
        </Field>
        <Field label="Category *">
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

      {/* Product images */}
      <div>
        <label className="mb-1.5 block text-[12px] font-medium text-white/55">
          Product Images{productImages.length > 0 ? ` (${productImages.length}/6)` : ' — up to 6'}
        </label>
        {productImages.length < 6 && (
          <button
            type="button"
            onClick={() => productImagesRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.15] bg-white/[0.02] py-6 text-center transition hover:border-white/25 hover:bg-white/[0.04]"
          >
            <Upload className="h-5 w-5 text-white/30" />
            <span className="text-sm font-medium text-white/50">Click to add product images</span>
            <span className="text-[11px] text-white/25">PNG, JPG, WebP · up to 6 photos</span>
          </button>
        )}
        {productImages.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {productImages.map((img, i) => {
              const url = URL.createObjectURL(img);
              return (
                <div key={i} className="relative group aspect-square rounded-xl overflow-hidden border border-white/[0.10]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setProductImages(prev => prev.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white/80 opacity-0 group-hover:opacity-100 transition hover:bg-red-500/80"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                  {i === 0 && <div className="absolute bottom-1 left-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white/70">MAIN</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Product name *" span>
          <input className={inputCls} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="e.g. Wireless Noise-Cancelling Headphones" />
        </Field>
        <Field label="Description" span>
          <textarea className={textareaCls} rows={4} value={f.content} onChange={e => set({ content: e.target.value })} placeholder="What does this product do? What problem does it solve? Who is it for?" />
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
          <textarea className={textareaCls} rows={4} value={f.notes} onChange={e => set({ notes: e.target.value })} placeholder="What's this event about? Who should attend? What will they gain?" />
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
        <Field label="Hackathon name *" span>
          <input className={inputCls} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="HackIndia 2026, Build for Bharat…" />
        </Field>
        <Field label="Problem statement / brief" span>
          <textarea className={textareaCls} rows={4} value={f.hackProblem} onChange={e => set({ hackProblem: e.target.value })} placeholder="What problem are participants solving? Key constraints, data, APIs available…" />
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
        <Field label="What do you need done? *" span>
          <textarea className={textareaCls} rows={5} value={f.gigSummary} onChange={e => set({ gigSummary: e.target.value })} placeholder="Describe the work, context, and what success looks like…" />
        </Field>
        <Field label="Gig title (auto-generated if empty)" span>
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
          <textarea className={textareaCls} rows={8} value={f.threadPoints} onChange={e => set({ threadPoints: e.target.value })} placeholder={"1/ Start with your hook...\n\n2/ Expand the idea...\n\n3/ Add evidence or examples..."} />
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
        <Field label="Video URL *" span>
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
          <textarea className={textareaCls} rows={4} value={f.notes} onChange={e => set({ notes: e.target.value })} placeholder="What will viewers learn? Who is it for?" />
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
          <textarea className={textareaCls} rows={6} value={f.notes} onChange={e => set({ notes: e.target.value })} placeholder="Share the journey behind this milestone — what you learned, who helped, what's next. Authentic stories resonate most…" />
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
  const [isDragging, setIsDragging] = useState(false);
  const isPost = category === 'post';

  // For non-post: resolve preview from file or url
  const uploadPreview = !isPost && thumbnailFile ? URL.createObjectURL(thumbnailFile) : null;
  const hasPreview = isPost
    ? (postImages?.length ?? 0) > 0
    : !!(uploadPreview || (thumbnailMode === 'url' && thumbnailUrlInput.trim() && !urlError));

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isPost) return; // post has its own uploader
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) onFileChange(file);
  };

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

        {/* POST: grid image picker */}
        {isPost && postImages !== undefined && postImagesRef !== undefined && setPostImages !== undefined && (
          <div className="space-y-3">
            {(postImages?.length ?? 0) < 6 && (
              <button
                type="button"
                onClick={() => postImagesRef.current?.click()}
                className="group flex w-full items-center justify-center gap-3 rounded-xl border border-dashed border-white/[0.13] bg-white/[0.015] py-5 transition hover:border-white/25 hover:bg-white/[0.03]"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.05] transition group-hover:bg-white/[0.09]">
                  <Upload className="h-4 w-4 text-white/35 transition group-hover:text-white/60" />
                </div>
                <div className="text-left">
                  <p className="text-[13px] font-semibold text-white/50">
                    {(postImages?.length ?? 0) === 0 ? 'Add photos' : `Add more (${postImages?.length ?? 0}/6)`}
                  </p>
                  <p className="text-[11px] text-white/25">PNG, JPG, GIF · up to 6 images · 5 MB each</p>
                </div>
              </button>
            )}
            {(postImages?.length ?? 0) > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {postImages?.map((img, i) => {
                  const url = URL.createObjectURL(img);
                  return (
                    <div key={i} className="group relative aspect-square overflow-hidden rounded-xl border border-white/[0.09]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 transition group-hover:opacity-100" />
                      <button
                        type="button"
                        onClick={() => setPostImages(prev => prev.filter((_, j) => j !== i))}
                        className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/80 text-white/80 opacity-0 transition group-hover:opacity-100 hover:bg-red-500/80"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                      {i === 0 && (
                        <div className="absolute bottom-1.5 left-1.5">
                          <span className="rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white/70">COVER</span>
                        </div>
                      )}
                    </div>
                  );
                })}
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
                <img src={uploadPreview} alt="Cover preview" className="h-44 w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
                {/* gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                {/* file name */}
                <div className="absolute bottom-3 left-3 right-12">
                  <p className="truncate text-[11px] font-semibold text-white/70">{thumbnailFile?.name}</p>
                  <p className="text-[10px] text-white/40">{thumbnailFile ? formatBytes(thumbnailFile.size) : ''}</p>
                </div>
                {/* remove */}
                <button
                  type="button"
                  onClick={() => onFileChange(null)}
                  className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white/70 opacity-0 transition group-hover:opacity-100 hover:bg-red-500/80 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                {/* change label */}
                <button
                  type="button"
                  onClick={() => thumbnailRef.current?.click()}
                  className="absolute bottom-3 right-3 rounded-lg border border-white/20 bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white/60 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-white"
                >
                  Change
                </button>
              </div>
            ) : (
              /* ── drop zone ── */
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`relative overflow-hidden rounded-xl border border-dashed transition-all ${
                  isDragging
                    ? 'border-white/40 bg-white/[0.06]'
                    : 'border-white/[0.13] bg-white/[0.015] hover:border-white/25 hover:bg-white/[0.03]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => thumbnailRef.current?.click()}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left"
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all ${
                    isDragging ? 'border-white/25 bg-white/10' : 'border-white/[0.10] bg-white/[0.05]'
                  }`}>
                    <Upload className={`h-4 w-4 transition ${isDragging ? 'text-white/70' : 'text-white/30'}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-white/50">
                      {isDragging ? 'Drop to set cover image' : 'Upload cover image'}
                    </p>
                    <p className="text-[11px] text-white/25 mt-0.5">
                      Recommended {THUMB_RECOMMENDED_W}×{THUMB_RECOMMENDED_H}px · PNG, JPG, WebP · max 2 MB
                    </p>
                    <p className="text-[10.5px] text-white/18 mt-1 leading-relaxed">
                      Only shown in the homepage feed if a cover image is uploaded
                    </p>
                  </div>
                </button>
                {isDragging && (
                  <div className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-inset ring-white/20" />
                )}
              </div>
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
                    className="h-44 w-full object-cover"
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
