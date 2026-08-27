'use client';

/**
 * Job details — the marketplace-side view of one role, drawn in the SAME shell
 * as /jobs and /people (56px fixed header with a back button, rigid 100dvh
 * frame, one scrolling column) so opening a card never leaves the marketplace.
 *
 * It carries the whole application experience:
 *   · scraped role  → Apply goes to the employer's own stored applyUrl, opened
 *                     in a new tab and never rewritten.
 *   · Docrud role   → the native flow below: pick a resume already on the
 *                     profile or attach one for this application only, add the
 *                     documents the job asked for, write an optional note, and
 *                     submit through the existing POST /api/hiring/applications
 *                     (its ATS gate, duplicate check and tenant rules unchanged).
 *
 * Only fields that exist are rendered — a role with no requirements shows no
 * Requirements section rather than an empty one. Nothing is invented.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, Bookmark, BookmarkCheck, Briefcase, Check,
  Copy, Facebook, FileText, Link2, Linkedin, Loader2, MapPin, Paperclip, Share2,
  Twitter, Upload, X, Zap,
} from 'lucide-react';
import { HiringJobPosting } from '@/types/document';
import {
  EMPLOYMENT_TYPE_LABELS, WORK_MODE_LABELS, EXPERIENCE_LABELS,
  formatJobLocation, formatPosted, jobSourceLabel, isValidApplyUrl, companyHue,
} from '@/lib/jobs-ui';
import { getCompanyLogo } from '@/lib/company-logos';

type ResumeFile = { id: string; fileName: string; url: string; uploadedAt: string };
type UploadedFile = { url: string; fileName: string };
type AppliedState = { id: string; status: string; appliedAt: string } | null;

const PANEL = 'rounded-2xl border border-white/[0.07] bg-white/[0.02]';
const INPUT =
  'w-full rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[13px] text-white placeholder:text-white/20 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.06]';
const GHOST_BTN =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-[13px] border border-white/[0.10] bg-white/[0.04] px-5 text-[13px] font-semibold text-white/55 transition hover:bg-white/[0.08] hover:text-white/85';
const PRIMARY_BTN =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-[13px] bg-white px-5 text-[13px] font-bold text-[#0A0A0C] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60';
/* Apply is emerald-on-white-text so the button and its label stay legible on a
   light ground as well as this dark one — a white pill vanishes on white.
   Emerald is already the jobs accent, so no new colour is introduced. */
const APPLY_BTN =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-[13px] bg-emerald-500 px-5 text-[13px] font-bold text-white shadow-[0_1px_8px_rgba(16,185,129,0.30)] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60';
const APPLY_BTN_SM =
  'inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-emerald-500 px-3.5 text-[12.5px] font-bold text-white transition hover:bg-emerald-400';

/* ─── company mark (same rules as the feed card) ──────────────────────── */
function CompanyLogo({ company }: { company: string }) {
  const logo = getCompanyLogo(company);
  const [failed, setFailed] = useState(false);
  const box = 'h-14 w-14 shrink-0 overflow-hidden rounded-2xl sm:h-16 sm:w-16';

  if (logo && !failed) {
    return (
      <div className={`${box} flex items-center justify-center border border-white/[0.08] bg-white/[0.05]`}>
        <img src={logo.src} alt={`${logo.name} logo`} width={64} height={64}
          loading="lazy" decoding="async" onError={() => setFailed(true)}
          className="h-full w-full object-contain p-2" />
      </div>
    );
  }
  const initials = company.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'C';
  const hue = companyHue(company);
  return (
    <div className={`${box} flex items-center justify-center text-[16px] font-bold`}
      role="img" aria-label={`${company} logo`}
      style={{
        background: `hsl(${hue} 45% 16%)`,
        border: `1px solid hsl(${hue} 45% 30% / 0.5)`,
        color: `hsl(${hue} 60% 76%)`,
      }}>
      {initials}
    </div>
  );
}

/** A section that renders only when it has real content. */
function ListSection({ title, items }: { title: string; items?: string[] }) {
  const real = (items ?? []).filter(Boolean);
  if (real.length === 0) return null;
  return (
    <section className="border-t border-white/[0.06] px-5 py-6 sm:px-6">
      <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{title}</h2>
      <ul className="mt-3.5 flex flex-col gap-2">
        {real.map((item) => (
          <li key={item} className="flex gap-2.5 text-[13.5px] leading-relaxed text-white/60">
            <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-400/70" />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─── job description, structured ─────────────────────────────────────────
   Descriptions arrive as one free-text blob — scraped roles especially, where
   "About the job:", "Key responsibilities:", "1. …", "Stipend: ₹15,000 /month"
   all sit inside a single paragraph. This reads that text back into the blocks
   it already contains — sub-headings, bullet lists and label/value facts — so
   the section is scannable instead of a wall of prose.

   It only re-arranges what the employer wrote: every line survives, nothing is
   reworded, and text with no structure still renders as its own paragraph. */

type DescBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'facts'; items: Array<{ label: string; value: string }> }
  | { kind: 'text'; text: string };

const BULLET_RE = /^\s*(?:[-–—•*·▪◦]|\(?\d{1,2}[.)])\s+/;
/** "Stipend: ₹15,000 /month" — a short label, then a real value on one line. */
const FACT_RE = /^([A-Za-z][A-Za-z0-9 /&()'.+-]{1,34}):\s*(\S.*)$/;

function parseDescription(raw: string): DescBlock[] {
  const lines = raw
    .split(/\r?\n/)
    // A single line carrying inline bullets is really several bullet lines.
    .flatMap((line) => {
      const parts = line.split(/\s+[•·▪]\s+/);
      return parts.length > 2 ? parts.map((part) => `• ${part.replace(BULLET_RE, '').trim()}`) : [line];
    })
    .map((line) => line.trim())
    .filter(Boolean);

  const blocks: DescBlock[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const last = blocks[blocks.length - 1];

    if (BULLET_RE.test(line)) {
      const item = line.replace(BULLET_RE, '').trim();
      if (!item) continue;
      if (last?.kind === 'list') last.items.push(item);
      else blocks.push({ kind: 'list', items: [item] });
      continue;
    }

    // "Key responsibilities:" — a colon with nothing after it is a sub-heading.
    if (/:$/.test(line) && line.replace(/:$/, '').trim().split(/\s+/).length <= 8) {
      blocks.push({ kind: 'heading', text: line.replace(/:$/, '').trim() });
      continue;
    }

    /* A bare label line — "About the job", "Perks". Deliberately narrow so a
       short sentence is never promoted: no comma, no closing punctuation, and
       something must follow it. */
    if (
      index < lines.length - 1 && line.length <= 48
      && !line.includes(',') && !line.includes(':') && !/[.;!?]$/.test(line)
      && line.split(/\s+/).length <= 6
    ) {
      blocks.push({ kind: 'heading', text: line });
      continue;
    }

    const fact = FACT_RE.exec(line);
    if (fact && fact[2].length <= 120) {
      const item = { label: fact[1].trim(), value: fact[2].trim() };
      if (last?.kind === 'facts') last.items.push(item);
      else blocks.push({ kind: 'facts', items: [item] });
      continue;
    }

    if (last?.kind === 'text') last.text = `${last.text} ${line}`;
    else blocks.push({ kind: 'text', text: line });
  }
  return blocks;
}

function JobDescription({ description }: { description: string }) {
  const blocks = useMemo(() => parseDescription(description), [description]);
  if (blocks.length === 0) return null;

  return (
    <div className="mt-3.5 flex flex-col gap-3">
      {blocks.map((block, i) => {
        if (block.kind === 'heading') {
          return (
            <h3 key={`h-${i}`} className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/45 first:mt-0">
              {block.text}
            </h3>
          );
        }
        if (block.kind === 'list') {
          return (
            <ul key={`l-${i}`} className="flex flex-col gap-2">
              {block.items.map((item, j) => (
                <li key={`${i}-${j}`} className="flex gap-2.5 text-[13.5px] leading-relaxed text-white/60">
                  <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-white/25" />
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (block.kind === 'facts') {
          return (
            <dl key={`f-${i}`} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {block.items.map((item, j) => (
                <div key={`${i}-${j}`} className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                  <dt className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/25">{item.label}</dt>
                  <dd className="mt-1 text-[12.5px] font-semibold text-white/70">{item.value}</dd>
                </div>
              ))}
            </dl>
          );
        }
        return (
          <p key={`p-${i}`} className="text-[13.5px] leading-relaxed text-white/60">{block.text}</p>
        );
      })}
    </div>
  );
}

/* ─── save + share bar ────────────────────────────────────────────────────
   Same controls as the reference layout, in Docrud's own visual language:
   the "early applicant" note sits at the start of the row and the save /
   share controls sit at its end. Only the arrangement is borrowed — every
   surface below reuses the detail page's existing button tokens, so no
   colour, radius, height or background of the Jobs UI changes.

   Saving is client-side only (the same localStorage pattern the public
   profile already uses for its saved items); no job API is touched. */

const SAVED_JOBS_KEY = 'docrud-saved-jobs';
/** A role counts as "early" for its first week, measured from its real postedAt. */
const EARLY_APPLICANT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const ICON_BTN =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border border-white/[0.10] bg-white/[0.04] text-white/55 transition hover:bg-white/[0.08] hover:text-white/85';
const ICON_BTN_ON =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border border-amber-400/25 bg-amber-400/[0.10] text-amber-200/90 transition hover:bg-amber-400/[0.16]';
const MENU_ITEM =
  'flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[12.5px] font-semibold text-white/60 transition hover:bg-white/[0.06] hover:text-white/90';

function readSavedJobs(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVED_JOBS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch { return []; }
}

/** WhatsApp has no lucide glyph, so its mark is drawn inline. */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.02h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.17 8.17 0 0 1-1.25-4.35c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.2-8.25 8.2Zm4.52-6.16c-.25-.13-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.71-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.41.09-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.41-.56-.42h-.47c-.16 0-.43.06-.65.31-.22.24-.85.83-.85 2.03s.87 2.35.99 2.51c.12.17 1.72 2.62 4.16 3.68.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.68-1.18.2-.58.2-1.07.14-1.18-.06-.11-.22-.17-.47-.29Z" />
    </svg>
  );
}

function JobActionBar({
  jobId, title, company, shareUrl, postedAt, onNote,
}: {
  jobId: string;
  title: string;
  company: string;
  shareUrl: string;
  postedAt?: string;
  onNote: (note: string) => void;
}) {
  const [saved, setSaved] = useState(false);
  const [early, setEarly] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);

  /* Both flags are resolved after mount: saved state lives in the browser and
     "early" depends on the current clock, so neither can be rendered on the
     server without a hydration mismatch. */
  useEffect(() => { setSaved(readSavedJobs().includes(jobId)); }, [jobId]);
  useEffect(() => {
    const at = postedAt ? new Date(postedAt).getTime() : NaN;
    setEarly(Number.isFinite(at) && Date.now() - at <= EARLY_APPLICANT_WINDOW_MS);
  }, [postedAt]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const toggleSave = () => {
    const current = readSavedJobs();
    const next = saved ? current.filter((id) => id !== jobId) : [...current, jobId];
    try { window.localStorage.setItem(SAVED_JOBS_KEY, JSON.stringify(next)); } catch { /* private mode — the button still reflects this session */ }
    setSaved(!saved);
  };

  /** Tags the shared link with its channel, exactly as the share row implies. */
  const tagged = (channel: string) => {
    try {
      const url = new URL(shareUrl, typeof window !== 'undefined' ? window.location.origin : 'https://docrud.com');
      url.searchParams.set('utm_source', channel);
      url.searchParams.set('referral', 'web_share');
      return url.toString();
    } catch { return shareUrl; }
  };

  const headline = `${title} at ${company}`;
  const iconCls = 'h-4 w-4 shrink-0 text-white/40';
  const channels = [
    { key: 'wp', label: 'Share on WhatsApp', icon: <WhatsAppIcon className={iconCls} />, href: `https://wa.me/?text=${encodeURIComponent(`Check out this job — ${headline}\n${tagged('wp_share')}`)}` },
    { key: 'li', label: 'Share on LinkedIn', icon: <Linkedin className={iconCls} />, href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(tagged('li_share'))}` },
    { key: 'fb', label: 'Share on Facebook', icon: <Facebook className={iconCls} />, href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(tagged('fb_share'))}` },
    { key: 'tw', label: 'Share on X', icon: <Twitter className={iconCls} />, href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(headline)}&url=${encodeURIComponent(tagged('tw_share'))}` },
  ];

  const copyLink = async () => {
    const link = tagged('cp_link');
    try {
      await navigator.clipboard.writeText(link);
      onNote('Link copied');
    } catch {
      // No clipboard permission — fall back to selecting the hidden field.
      const field = linkRef.current;
      if (field) {
        field.value = link;
        field.select();
        const ok = document.execCommand?.('copy');
        onNote(ok ? 'Link copied' : 'Copy failed — select the URL manually');
      } else {
        onNote('Copy failed — select the URL manually');
      }
    }
    setMenuOpen(false);
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-2.5 sm:ml-auto sm:w-auto">
      {early && (
        <span className="inline-flex h-10 items-center gap-1.5 rounded-[13px] border border-amber-400/20 bg-amber-400/[0.07] px-3.5 text-[12.5px] font-semibold text-amber-200/85">
          <Zap className="h-3.5 w-3.5 shrink-0 text-amber-300/90" /> Be an early applicant
        </span>
      )}

      <div ref={wrapRef} className="relative ml-auto flex items-center gap-2.5">
        <button type="button" onClick={toggleSave} aria-pressed={saved}
          aria-label={saved ? 'Remove this job from saved' : 'Save this job'}
          title={saved ? 'Saved' : 'Save this job'}
          className={saved ? ICON_BTN_ON : ICON_BTN}>
          {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        </button>

        <button type="button" onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="menu" aria-expanded={menuOpen} className={GHOST_BTN}>
          <Share2 className="h-3.5 w-3.5" /> Share Job
        </button>

        {menuOpen && (
          <div role="menu" aria-label="Share this job"
            className="absolute right-0 top-[calc(100%+8px)] z-40 w-60 overflow-hidden rounded-[13px] border border-white/[0.10] bg-[#111114] p-1 shadow-[0_18px_40px_rgba(0,0,0,0.55)]">
            {channels.map(({ key, label, icon, href }) => (
              <a key={key} role="menuitem" href={href} target="_blank" rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)} className={MENU_ITEM}>
                {icon} {label}
              </a>
            ))}
            <button type="button" role="menuitem" onClick={copyLink} className={MENU_ITEM}>
              <Link2 className={iconCls} /> Copy link
            </button>
          </div>
        )}
      </div>

      {/* Copy fallback for browsers without the async clipboard API. */}
      <input ref={linkRef} type="text" readOnly defaultValue={shareUrl} tabIndex={-1} aria-hidden
        className="pointer-events-none fixed left-[-9999px] top-0 h-px w-px opacity-0" />
    </div>
  );
}

export default function JobDetailPage({ job }: { job: HiringJobPosting }) {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [profileResumes, setProfileResumes] = useState<ResumeFile[]>([]);
  const [resumeChoice, setResumeChoice] = useState<string>('');
  const [uploadedResume, setUploadedResume] = useState<UploadedFile | null>(null);
  const [docs, setDocs] = useState<Record<string, UploadedFile>>({});
  const [coverLetter, setCoverLetter] = useState('');
  const [phone, setPhone] = useState('');
  const [busyField, setBusyField] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState<AppliedState>(null);
  const [shareNote, setShareNote] = useState('');
  const applyRef = useRef<HTMLDivElement>(null);

  const company = job.organizationName || 'Company';
  const source = jobSourceLabel(job.applyUrl);
  const externalApply = isValidApplyUrl(job.applyUrl);
  const locationLabel = formatJobLocation(job.location, job.workMode);
  const posted = formatPosted(job.createdAt);
  const requiredDocs = useMemo(() => (job.requiredDocuments ?? []).filter(Boolean), [job.requiredDocuments]);

  const isCandidate = status === 'authenticated' && session?.user?.accountType === 'individual';
  const signedOut = status === 'unauthenticated';

  const meta = useMemo(() => {
    const out: Array<{ label: string; value: string }> = [];
    if (locationLabel) out.push({ label: 'Location', value: locationLabel });
    if (job.employmentType) out.push({ label: 'Employment', value: EMPLOYMENT_TYPE_LABELS[job.employmentType] ?? job.employmentType });
    if (job.workMode) out.push({ label: 'Work mode', value: WORK_MODE_LABELS[job.workMode] ?? job.workMode });
    if (job.experienceLevel) out.push({ label: 'Level', value: EXPERIENCE_LABELS[job.experienceLevel] ?? job.experienceLevel });
    if (job.department) out.push({ label: 'Team', value: job.department });
    if (posted) out.push({ label: 'Posted', value: posted });
    return out;
  }, [job.department, job.employmentType, job.experienceLevel, job.workMode, locationLabel, posted]);

  /* The viewer's own applications only — the endpoint is server-scoped, so a
     candidate sees theirs and nobody else's. Drives the Already applied state. */
  useEffect(() => {
    if (!isCandidate) { setApplied(null); return; }
    let active = true;
    fetch('/api/hiring/applications', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (!active || !Array.isArray(list)) return;
        const mine = list.find((a: { jobId?: string }) => a?.jobId === job.id);
        if (mine) setApplied({ id: mine.id, status: mine.status, appliedAt: mine.appliedAt });
      })
      .catch(() => { /* non-fatal — the server still blocks duplicates */ });
    return () => { active = false; };
  }, [isCandidate, job.id]);

  /* Resumes already on the profile, so nobody re-uploads what Docrud has. */
  useEffect(() => {
    if (!isCandidate || externalApply) return;
    let active = true;
    fetch('/api/profile/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active) return;
        const files: ResumeFile[] = (data?.profile?.resumeFiles ?? [])
          .filter((f: ResumeFile) => f?.url && f?.id);
        setProfileResumes(files);
        if (files[0]) setResumeChoice(files[0].id);
      })
      .catch(() => { /* the upload path still works */ });
    return () => { active = false; };
  }, [isCandidate, externalApply]);

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/jobs/${job.id}`
    : `/jobs/${job.id}`;

  const shareJob = useCallback(async () => {
    const payload = { title: `${job.title} at ${company}`, text: `${job.title} at ${company}`, url: shareUrl };
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(payload);
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setShareNote('Link copied');
    } catch {
      // A cancelled native share is not an error; only a real copy failure is.
      try {
        await navigator.clipboard.writeText(shareUrl);
        setShareNote('Link copied');
      } catch { setShareNote('Copy failed — select the URL manually'); }
    }
  }, [company, job.title, shareUrl]);

  useEffect(() => {
    if (!shareNote) return;
    const t = setTimeout(() => setShareNote(''), 2400);
    return () => clearTimeout(t);
  }, [shareNote]);

  /** Uploads one file for THIS application. Never touches the profile library. */
  const upload = async (file: File, field: string): Promise<UploadedFile | null> => {
    setError('');
    setBusyField(field);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/hiring/application-files', { method: 'POST', body });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Upload failed.');
      return { url: payload.url, fileName: payload.fileName };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
      return null;
    } finally {
      setBusyField('');
    }
  };

  const missingDocs = requiredDocs.filter((label) => !docs[label]);
  const resumeReady = resumeChoice === 'upload' ? !!uploadedResume : !!resumeChoice;
  const canSubmit = isCandidate && resumeReady && missingDocs.length === 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setError('');
    setSubmitting(true);
    try {
      const resumeSource = resumeChoice === 'upload'
        ? { kind: 'upload', url: uploadedResume!.url, fileName: uploadedResume!.fileName }
        : { kind: 'profile', resumeId: resumeChoice };
      const response = await fetch('/api/hiring/applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          targetRole: job.title,
          candidatePhone: phone.trim(),
          coverLetter: coverLetter.trim(),
          resumeSource,
          documents: Object.entries(docs).map(([label, file], i) => ({
            id: `doc-${i + 1}`, label, fileName: file.fileName, url: file.url,
          })),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to submit this application.');
      const a = payload?.application;
      setApplied({ id: a?.id ?? '', status: a?.status ?? 'submitted', appliedAt: a?.appliedAt ?? new Date().toISOString() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to submit this application.');
    } finally {
      setSubmitting(false);
    }
  };

  const scrollToApply = () => applyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#0A0A0C] text-white">
      <style>{`.no-sb::-webkit-scrollbar{display:none}.no-sb{scrollbar-width:none}`}</style>

      {/* ══ Header ═══════════════════════════════════════════════════════ */}
      <header className="shrink-0 z-30 border-b border-white/[0.06]"
        style={{ height: 56, background: 'rgba(10,10,12,0.96)', backdropFilter: 'blur(20px) saturate(180%)' }}>
        <div className="h-full px-3 sm:px-5 lg:px-8 flex items-center gap-3">
          <button onClick={() => router.back()} aria-label="Back"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-white/48 hover:text-white hover:bg-white/[0.08] transition-all">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Link href="/jobs" className="truncate text-[15px] font-bold tracking-[-0.01em] text-white hover:text-white/80">
            Jobs
          </Link>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button type="button" onClick={shareJob}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-3.5 text-[12.5px] font-semibold text-white/48 transition-all hover:bg-white/[0.08] hover:text-white/72">
              <Share2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Share</span>
            </button>
            {externalApply ? (
              <a href={job.applyUrl} target="_blank" rel="noopener noreferrer nofollow"
                className={APPLY_BTN_SM}>
                Apply <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            ) : (
              <button type="button" onClick={scrollToApply}
                className={APPLY_BTN_SM}>
                {applied ? 'Applied' : 'Apply'} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ══ Body ═════════════════════════════════════════════════════════ */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
          <div className="absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-indigo-500/[0.05] blur-[160px]" />
        </div>

        <div className="mx-auto w-full max-w-3xl px-3 pb-20 pt-7 sm:px-5 lg:px-8">

          {shareNote && (
            <div role="status" className="mb-4 flex items-center gap-2 rounded-[12px] border border-emerald-500/25 bg-emerald-500/[0.07] px-3.5 py-2.5 text-[12.5px] font-medium text-emerald-200/90">
              <Copy className="h-3.5 w-3.5" /> {shareNote}
            </div>
          )}

          {/* ── Identity ─────────────────────────────────────────────── */}
          <div className="flex items-start gap-4">
            <CompanyLogo company={company} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-white/45">
                {company}{source && <span className="text-white/28"> · via {source}</span>}
              </p>
              <h1 className="mt-1 text-[22px] font-bold leading-tight tracking-[-0.02em] text-white sm:text-[26px]">
                {job.title}
              </h1>
              {locationLabel && (
                <p className="mt-2 flex items-center gap-1.5 text-[13px] text-white/35">
                  <MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="min-w-0">{locationLabel}</span>
                </p>
              )}
            </div>
          </div>

          {/* ── Meta ─────────────────────────────────────────────────── */}
          {meta.length > 0 && (
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {meta.map((m) => (
                <div key={m.label} className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                  <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/25">{m.label}</p>
                  <p className="mt-1 truncate text-[12.5px] font-semibold text-white/70">{m.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Actions ──────────────────────────────────────────────── */}
          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            {externalApply ? (
              <a href={job.applyUrl} target="_blank" rel="noopener noreferrer nofollow"
                aria-label={`Apply for ${job.title} at ${company} on the original source`}
                className={`${APPLY_BTN} w-full sm:w-auto`}>
                Apply Now <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            ) : (
              <button type="button" onClick={scrollToApply} className={`${APPLY_BTN} w-full sm:w-auto`}>
                {applied ? 'View Application' : 'Apply Now'} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
            <JobActionBar jobId={job.id} title={job.title} company={company}
              shareUrl={shareUrl} postedAt={job.createdAt} onNote={setShareNote} />
          </div>

          {externalApply && (
            <p className="mt-2.5 text-[11.5px] text-white/22">
              Applications for this role are handled by {source || 'the employer'} on their own site.
            </p>
          )}

          {/* ── Role content ─────────────────────────────────────────── */}
          <div className={`mt-6 overflow-hidden ${PANEL}`}>
            {job.description && (
              <section className="px-5 py-6 sm:px-6">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Job description</h2>
                <JobDescription description={job.description} />
              </section>
            )}
            <ListSection title="Responsibilities" items={job.responsibilities} />
            <ListSection title="Requirements" items={job.requirements} />

            {(job.preferredSkills ?? []).filter(Boolean).length > 0 && (
              <section className="border-t border-white/[0.06] px-5 py-6 sm:px-6">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Preferred skills</h2>
                <div className="mt-3.5 flex flex-wrap gap-1.5">
                  {job.preferredSkills.filter(Boolean).map((s) => (
                    <span key={s} className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11.5px] font-medium text-white/50">{s}</span>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ── Native application ───────────────────────────────────── */}
          {!externalApply && (
            <div id="apply" ref={applyRef} className={`mt-6 overflow-hidden scroll-mt-4 ${PANEL}`}>
              <div className="border-b border-white/[0.06] px-5 py-5 sm:px-6">
                <h2 className="text-[15px] font-bold tracking-[-0.01em] text-white">
                  {applied ? 'Your application' : 'Apply on Docrud'}
                </h2>
                <p className="mt-1 text-[12.5px] text-white/32">
                  {applied
                    ? `Sent to ${company}. The team reviews applications from their Hiring Desk.`
                    : `Your application goes straight to ${company}.`}
                </p>
              </div>

              {/* Already applied — no duplicate is created. */}
              {applied ? (
                <div className="px-5 py-6 sm:px-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.12] px-3 py-1 text-[11.5px] font-bold text-emerald-300">
                      <Check className="h-3.5 w-3.5" /> Already applied
                    </span>
                    <span className="rounded-full border border-white/[0.10] bg-white/[0.04] px-3 py-1 text-[11.5px] font-semibold capitalize text-white/55">
                      Status: {applied.status}
                    </span>
                    {applied.appliedAt && (
                      <span className="text-[11.5px] text-white/25">Applied {formatPosted(applied.appliedAt) || 'recently'}</span>
                    )}
                  </div>
                  <p className="mt-3.5 text-[12.5px] leading-relaxed text-white/32">
                    You can track this application from your workspace. Applying again would not create a second
                    application for this role.
                  </p>
                  <Link href="/workspace?tab=hiring-desk" className={`${GHOST_BTN} mt-4 w-full sm:w-auto`}>
                    View Application <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ) : signedOut ? (
                <div className="px-5 py-6 sm:px-6">
                  <p className="text-[13px] text-white/40">Sign in to apply with your Docrud profile and resume.</p>
                  <Link href={`/login?next=${encodeURIComponent(`/jobs/${job.id}`)}`} className={`${PRIMARY_BTN} mt-4 w-full sm:w-auto`}>
                    Login to apply <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ) : !isCandidate ? (
                <div className="px-5 py-6 text-[13px] text-white/40 sm:px-6">
                  Company workspaces review applications rather than submit them. Sign in with an individual account to apply.
                </div>
              ) : (
                <div className="flex flex-col gap-6 px-5 py-6 sm:px-6">

                  {/* Profile — prefilled, not retyped */}
                  <section>
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Your profile</h3>
                    <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-3">
                      <p className="truncate text-[13px] font-semibold text-white/75">{session?.user?.name}</p>
                      <p className="truncate text-[12px] text-white/35">{session?.user?.email}</p>
                    </div>
                    <label htmlFor="apply-phone" className="mt-3 mb-1.5 block text-[11.5px] font-semibold text-white/55">
                      Phone <span className="font-medium text-white/25">(optional)</span>
                    </label>
                    <input id="apply-phone" value={phone} onChange={(e) => setPhone(e.target.value)}
                      inputMode="tel" placeholder="+91…" className={INPUT} />
                  </section>

                  {/* Resume */}
                  <section>
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Resume</h3>
                    <div className="mt-3 flex flex-col gap-2">
                      {profileResumes.map((r) => (
                        <label key={r.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition ${
                            resumeChoice === r.id ? 'border-white/[0.20] bg-white/[0.06]' : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]'
                          }`}>
                          <input type="radio" name="resume" value={r.id}
                            checked={resumeChoice === r.id} onChange={() => setResumeChoice(r.id)}
                            className="h-3.5 w-3.5 shrink-0 accent-white" />
                          <FileText className="h-4 w-4 shrink-0 text-white/30" />
                          <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-white/70">{r.fileName}</span>
                          <span className="shrink-0 text-[10.5px] text-white/22">on your profile</span>
                        </label>
                      ))}

                      <label
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition ${
                          resumeChoice === 'upload' ? 'border-white/[0.20] bg-white/[0.06]' : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]'
                        }`}>
                        <input type="radio" name="resume" value="upload"
                          checked={resumeChoice === 'upload'} onChange={() => setResumeChoice('upload')}
                          className="h-3.5 w-3.5 shrink-0 accent-white" />
                        <Upload className="h-4 w-4 shrink-0 text-white/30" />
                        <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-white/70">
                          {uploadedResume ? uploadedResume.fileName : 'Upload a different resume'}
                        </span>
                      </label>

                      {resumeChoice === 'upload' && (
                        <div className="pl-1">
                          <input
                            id="resume-file" type="file" className="sr-only"
                            accept=".pdf,.doc,.docx,.txt"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const result = await upload(file, 'resume');
                              if (result) setUploadedResume(result);
                            }}
                          />
                          <label htmlFor="resume-file"
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.04] px-3.5 py-1.5 text-[11.5px] font-semibold text-white/55 transition hover:bg-white/[0.08] hover:text-white/85">
                            {busyField === 'resume'
                              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</>
                              : <><Paperclip className="h-3.5 w-3.5" /> {uploadedResume ? 'Replace file' : 'Choose file'}</>}
                          </label>
                          <p className="mt-1.5 text-[11px] text-white/22">
                            PDF, Word or text, up to 10 MB. Used for this application only — your profile resume stays as it is.
                          </p>
                        </div>
                      )}

                      {profileResumes.length === 0 && resumeChoice !== 'upload' && (
                        <p className="text-[11.5px] text-white/25">
                          No resume on your profile yet — upload one above to apply.
                        </p>
                      )}
                    </div>
                  </section>

                  {/* Documents the job actually asked for */}
                  {requiredDocs.length > 0 && (
                    <section>
                      <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                        Requested documents
                      </h3>
                      <div className="mt-3 flex flex-col gap-2">
                        {requiredDocs.map((label, i) => {
                          const file = docs[label];
                          const id = `doc-${i}`;
                          return (
                            <div key={label} className="flex flex-wrap items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
                              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-white/70">{label}</span>
                              {file ? (
                                <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-emerald-300/80">
                                  <Check className="h-3.5 w-3.5 shrink-0" />
                                  <span className="min-w-0 truncate">{file.fileName}</span>
                                  <button type="button" aria-label={`Remove ${label}`}
                                    onClick={() => setDocs((prev) => { const n = { ...prev }; delete n[label]; return n; })}
                                    className="shrink-0 text-white/30 hover:text-white/70"><X className="h-3.5 w-3.5" /></button>
                                </span>
                              ) : (
                                <>
                                  <input id={id} type="file" className="sr-only"
                                    accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                                    onChange={async (e) => {
                                      const f = e.target.files?.[0];
                                      if (!f) return;
                                      const result = await upload(f, label);
                                      if (result) setDocs((prev) => ({ ...prev, [label]: result }));
                                    }} />
                                  <label htmlFor={id}
                                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.04] px-3 py-1 text-[11.5px] font-semibold text-white/55 transition hover:bg-white/[0.08] hover:text-white/85">
                                    {busyField === label
                                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</>
                                      : <><Paperclip className="h-3.5 w-3.5" /> Attach</>}
                                  </label>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* Optional message */}
                  <section>
                    <label htmlFor="cover-letter" className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                      Message <span className="font-semibold normal-case tracking-normal text-white/25">(optional)</span>
                    </label>
                    <textarea id="cover-letter" rows={4} value={coverLetter}
                      onChange={(e) => setCoverLetter(e.target.value)}
                      placeholder={`Why you're a fit for this role at ${company}…`}
                      className={`${INPUT} mt-3 min-h-[96px] leading-6`} />
                  </section>

                  {error && (
                    <p role="alert" className="rounded-[12px] border border-rose-500/25 bg-rose-500/[0.07] px-3.5 py-2.5 text-[12.5px] font-medium text-rose-200/90">
                      {error}
                    </p>
                  )}

                  <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[11px] text-white/22">
                      {missingDocs.length > 0
                        ? `Still needed: ${missingDocs.join(', ')}`
                        : !resumeReady ? 'Choose a resume to continue.' : 'Your profile, resume and attachments are sent together.'}
                    </p>
                    <button type="button" onClick={submit} disabled={!canSubmit}
                      className={`${APPLY_BTN} w-full sm:w-auto`}>
                      {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {submitting ? 'Submitting…' : 'Submit Application'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex items-center gap-2 text-[11.5px] text-white/22">
            <Briefcase className="h-3.5 w-3.5" />
            <Link href="/jobs" className="hover:text-white/50">Back to all jobs</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
