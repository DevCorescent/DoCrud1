'use client';

/**
 * First-run onboarding — welcome → interests → first post.
 *
 * Everything here is wired to endpoints the app already owns:
 *   interests + completion → POST /api/onboarding/complete
 *   the first post         → POST /api/public/file-directory/publish
 * No new auth, post, category or media system is introduced.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  PUBLICATION_BODY_MAX,
  clampPublicationBody,
  publicationBodyLength,
} from '@/lib/publication-body';
import {
  ArrowRight, BarChart3, BrainCircuit, Briefcase, Check, Code2, FolderOpen,
  GraduationCap, Globe, Hand, Heart, ImageIcon, LineChart, Loader2, Megaphone,
  MoreHorizontal, Palette, PenLine, Plus, Sparkles, X,
} from 'lucide-react';

/* ─── Constants ──────────────────────────────────────────────── */

const TOTAL_STEPS = 3;
const MAX_INTERESTS = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // matches the publish API's public image limit
const DRAFT_KEY = 'docrud:onboarding:draft';

const INTERESTS = [
  { label: 'Developer',    Icon: Code2 },
  { label: 'Finance',      Icon: LineChart },
  { label: 'Data Analyst', Icon: BarChart3 },
  { label: 'Marketing',    Icon: Megaphone },
  { label: 'Design',       Icon: Palette },
  { label: 'AI & ML',      Icon: BrainCircuit },
  { label: 'Business',     Icon: Briefcase },
  { label: 'Education',    Icon: GraduationCap },
  { label: 'Creator',      Icon: Sparkles },
  { label: 'Other',        Icon: MoreHorizontal },
] as const;

/** Seed options for the first post — merged with whatever the user picked on step 2. */
const BASE_CATEGORIES = ['Developer', 'AI & ML', 'Design'];

type Draft = {
  step: number;
  interests: string[];
  otherInterest: string;
  title: string;
  story: string;
  category: string;
  customCategories: string[];
};

/* ─── Shared styles ──────────────────────────────────────────── */

const FIELD = [
  'w-full rounded-[13px] border border-white/[0.08] bg-white/[0.035] px-3.5 text-white',
  'placeholder:text-white/25 outline-none transition-all duration-200',
  'focus:border-white/25 focus:bg-white/[0.06] focus:shadow-[0_0_0_3px_rgba(255,255,255,0.05)]',
].join(' ');

const LABEL = 'mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.18em] text-white/40';

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090a]';

/* ─── Media helpers — same client-side contract the publish dialog uses ─── */

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

function compressImage(file: File, maxPx = 1280, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return Promise.resolve(file);
  return new Promise<File>((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : file),
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/* ─── Small building blocks ──────────────────────────────────── */

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2 lg:justify-start" aria-hidden="true">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <span
          key={i}
          className="block h-[6px] rounded-full transition-all duration-500"
          style={{
            transitionTimingFunction: 'cubic-bezier(.22,1,.36,1)',
            width: i === step ? 26 : 6,
            background: i === step ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.16)',
            boxShadow: i === step ? '0 0 16px rgba(255,255,255,0.28)' : 'none',
          }}
        />
      ))}
    </div>
  );
}

function HeroBadge({
  children, delay = '0.05s', ring = false,
}: {
  children: React.ReactNode;
  delay?: string;
  /** Soft ambient rings that breathe outward from the badge. */
  ring?: boolean;
}) {
  return (
    <div className="relative inline-flex" style={{ animation: `obScaleIn 0.6s ${delay} cubic-bezier(.22,1,.36,1) both` }}>
      <span
        aria-hidden="true"
        className="absolute -inset-5 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(255,255,255,0.10) 0%, transparent 68%)',
          animation: 'obGlow 4.5s ease-in-out infinite',
        }}
      />
      {ring && [0, 1.8].map((offset) => (
        <span
          key={offset}
          aria-hidden="true"
          className="absolute inset-0 rounded-full border border-white/[0.16]"
          style={{ animation: `obRingPulse 3.6s ${offset}s cubic-bezier(.22,1,.36,1) infinite` }}
        />
      ))}
      <span className="relative flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.055] text-white sm:h-14 sm:w-14 lg:h-16 lg:w-16">
        {children}
      </span>
    </div>
  );
}

function Heading({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h1
      className={`text-balance font-black leading-[1.14] tracking-[-0.035em] text-white ${
        className || 'text-[1.72rem] sm:text-[2rem] lg:text-[2.05rem] xl:text-[2.3rem]'
      }`}
      style={{ animation: 'obSlideUp 0.55s 0.12s cubic-bezier(.22,1,.36,1) both' }}
    >
      {children}
    </h1>
  );
}

function Description({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mt-3 max-w-[34ch] text-[13.5px] leading-[1.65] text-white/45 sm:text-[14.5px] lg:max-w-[40ch]"
      style={{ animation: 'obSlideUp 0.55s 0.2s cubic-bezier(.22,1,.36,1) both' }}
    >
      {children}
    </p>
  );
}

function PrimaryButton({
  onClick, busy, disabled, children,
}: { onClick: () => void; busy?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    // Compact rather than full-bleed, but still well past the 44px tap target.
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className={`group inline-flex h-[46px] min-w-[196px] items-center justify-center gap-2 rounded-full bg-white px-7 text-[13.5px] font-extrabold tracking-[0.005em] text-[#08090a] transition-all duration-200 hover:bg-white/92 hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:translate-y-0 disabled:bg-white/[0.22] disabled:text-white/55 disabled:shadow-none disabled:active:scale-100 ${FOCUS_RING}`}
      style={{ boxShadow: busy || disabled ? 'none' : '0 4px 18px rgba(255,255,255,0.13), 0 0 0 1px rgba(255,255,255,0.08)' }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : children}
    </button>
  );
}

/* ─── Step 1 visual — the official Docrud mark, gently orbited ─── */

function WelcomeVisual() {
  const satellites = [
    { Icon: PenLine,    style: { top: '6%',  left: '4%'  }, anim: 'obFloat 6.5s ease-in-out infinite' },
    { Icon: FolderOpen, style: { top: '14%', right: '2%' }, anim: 'obFloatAlt 7.5s ease-in-out infinite 0.6s' },
    { Icon: Globe,      style: { bottom: '4%', left: '26%' }, anim: 'obFloat 8s ease-in-out infinite 1.2s' },
  ];

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[260px] sm:max-w-[300px] lg:max-w-[380px]">
      {/* Concentric guide rings — `inset-0 m-auto` centres them without a
          transform, so the rotation animation has the property to itself. */}
      {[100, 74, 48].map((size, i) => (
        <span
          key={size}
          aria-hidden="true"
          className="absolute inset-0 m-auto rounded-full border border-dashed border-white/[0.09]"
          style={{
            width: `${size}%`,
            height: `${size}%`,
            animation: `${i % 2 === 0 ? 'obRotateSlow' : 'obRotateSlowCCW'} ${52 + i * 16}s linear infinite`,
          }}
        />
      ))}

      {/* Ambient glow behind the mark */}
      <span
        aria-hidden="true"
        className="absolute inset-0 m-auto h-[56%] w-[56%] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(255,255,255,0.13) 0%, rgba(129,140,248,0.07) 45%, transparent 70%)',
          animation: 'obGlow 5s ease-in-out infinite',
        }}
      />

      {/* The logo */}
      <div
        className="absolute inset-0 m-auto flex h-[34%] w-[34%] items-center justify-center overflow-hidden rounded-[24%] border border-white/[0.10] bg-white/[0.05] backdrop-blur-sm"
        style={{ animation: 'obScaleIn 0.75s 0.1s cubic-bezier(.22,1,.36,1) both' }}
      >
        <Image
          src="/docrud-icon.png"
          alt="Docrud"
          width={128}
          height={128}
          priority
          className="h-[78%] w-[78%] object-contain"
        />
      </div>

      {/* Satellites */}
      {satellites.map(({ Icon, style, anim }, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="absolute flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.045] text-white/60 backdrop-blur-sm sm:h-12 sm:w-12"
          style={{ ...style, animation: `${anim}, obFadeIn 0.7s ${0.3 + i * 0.12}s both` }}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
        </span>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FLOW
═══════════════════════════════════════════════════════════════ */

export default function OnboardingFlow({
  initialInterests,
  userName = '',
  scriptFontClass = '',
}: {
  initialInterests: string[];
  /** First name from the session — greeting falls back to "there" without it. */
  userName?: string;
  /** next/font variable class for the step-3 script heading. */
  scriptFontClass?: string;
}) {
  const router = useRouter();
  // Empty without a resolvable name, which degrades to "Hello, Welcome to Docrud."
  const greetName = userName.trim();

  const [step, setStep] = useState(0);
  const [interests, setInterests] = useState<string[]>(initialInterests.slice(0, MAX_INTERESTS));
  const [otherInterest, setOtherInterest] = useState('');

  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [category, setCategory] = useState('');
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');

  const [busy, setBusy] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);
  const newCategoryRef = useRef<HTMLInputElement>(null);
  // State, not a ref: the save effect below must not run until a render that has
  // the restored values, otherwise it writes the initial state back over the draft.
  const [hydrated, setHydrated] = useState(false);

  /* ── Draft persistence — survives a refresh mid-onboarding ── */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Partial<Draft>;
        if (typeof d.step === 'number') setStep(Math.min(Math.max(d.step, 0), TOTAL_STEPS - 1));
        if (Array.isArray(d.interests)) setInterests(d.interests.slice(0, MAX_INTERESTS));
        if (typeof d.otherInterest === 'string') setOtherInterest(d.otherInterest);
        if (typeof d.title === 'string') setTitle(d.title);
        if (typeof d.story === 'string') setStory(d.story);
        if (typeof d.category === 'string') setCategory(d.category);
        if (Array.isArray(d.customCategories)) setCustomCategories(d.customCategories.filter((c) => typeof c === 'string'));
      }
    } catch { /* a corrupt draft is not worth failing onboarding over */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const draft: Draft = { step, interests, otherInterest, title, story, category, customCategories };
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch { /* private mode / quota — the flow still works in memory */ }
  }, [hydrated, step, interests, otherInterest, title, story, category, customCategories]);

  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview); }, [imagePreview]);

  const clearDraft = useCallback(() => {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  }, []);

  /* ── Interests ── */
  const atLimit = interests.length >= MAX_INTERESTS;

  const toggleInterest = useCallback((label: string) => {
    setInterests((prev) => {
      if (prev.includes(label)) return prev.filter((i) => i !== label);
      if (prev.length >= MAX_INTERESTS) return prev;
      return [...prev, label];
    });
  }, []);

  /* ── Categories for the first post — the picks from step 2 come along ── */
  const categoryOptions = useMemo(() => {
    const merged = [...interests.filter((i) => i !== 'Other'), ...BASE_CATEGORIES, ...customCategories];
    return Array.from(new Set(merged.map((c) => c.trim()).filter(Boolean)));
  }, [interests, customCategories]);

  // Waits for hydration, otherwise this default would land after the restored
  // draft in the same commit and quietly replace the user's saved choice.
  useEffect(() => {
    if (!hydrated) return;
    if (!category && categoryOptions.length > 0) setCategory(categoryOptions[0]);
  }, [hydrated, category, categoryOptions]);

  const addCategory = useCallback(() => {
    const value = newCategory.trim().slice(0, 40);
    if (!value) { setAddingCategory(false); return; }
    setCustomCategories((prev) => (prev.some((c) => c.toLowerCase() === value.toLowerCase()) ? prev : [...prev, value]));
    setCategory(value);
    setNewCategory('');
    setAddingCategory(false);
  }, [newCategory]);

  /* ── Media ── */
  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return; }
    setError('');
    const compressed = await compressImage(file);
    if (compressed.size > MAX_IMAGE_BYTES) { setError('That image is too large — the limit is 5 MB.'); return; }
    setImagePreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(compressed); });
    setImageFile(compressed);
  }, []);

  const removeImage = useCallback(() => {
    setImagePreview((prev) => { if (prev) URL.revokeObjectURL(prev); return ''; });
    setImageFile(null);
  }, []);

  /* ── Persistence ── */
  const buildInterestList = useCallback(() => {
    const extra = otherInterest.trim();
    return Array.from(new Set([...interests, ...(extra ? [extra] : [])])).slice(0, MAX_INTERESTS + 1);
  }, [interests, otherInterest]);

  /** Reuses the app's existing onboarding endpoint — no duplicate API. */
  const completeOnboarding = useCallback(async (mode: 'completed' | 'skipped') => {
    const now = new Date().toISOString();
    const res = await fetch('/api/onboarding/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        profile: {
          interests: buildInterestList(),
          onboardingDone: true,
          ...(mode === 'skipped' ? { onboardingSkippedAt: now } : { onboardingCompletedAt: now }),
        },
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null) as { error?: string } | null;
      throw new Error(data?.error || 'Could not save your onboarding progress.');
    }
  }, [buildInterestList]);

  const leaveOnboarding = useCallback(() => {
    clearDraft();
    router.replace('/');
    router.refresh();
  }, [clearDraft, router]);

  const handleSkip = useCallback(async () => {
    if (skipping || busy) return;
    setSkipping(true);
    setError('');
    try {
      await completeOnboarding('skipped');
      leaveOnboarding();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not skip right now.');
      setSkipping(false);
    }
  }, [busy, completeOnboarding, leaveOnboarding, skipping]);

  /** Publishes through the same endpoint the Publish dialog uses. */
  const handlePublish = useCallback(async () => {
    const cleanTitle = title.trim();
    const cleanStory = story.trim();
    if (!cleanTitle && !cleanStory && !imageFile) {
      setError('Add a title, a story or an image to publish.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      let dataUrl = '';
      let fileName = '';
      let mimeType = '';
      let sizeInBytes = 0;
      let thumbnailUrl: string | undefined;

      if (imageFile) {
        dataUrl = await fileToDataUrl(imageFile);
        fileName = imageFile.name || 'first-post.jpg';
        mimeType = imageFile.type || 'image/jpeg';
        sizeInBytes = imageFile.size;
        const thumb = await compressImage(imageFile, 800, 0.75);
        thumbnailUrl = await fileToDataUrl(thumb);
      } else {
        const body = [cleanTitle, cleanStory].filter(Boolean).join('\n\n');
        const base = (cleanTitle || 'first_post').replace(/[^\w\s-]+/g, '').trim().replace(/\s+/g, '_') || 'first_post';
        const blob = new Blob([body], { type: 'text/plain' });
        const file = new File([blob], `${base}.txt`, { type: 'text/plain' });
        dataUrl = await fileToDataUrl(file);
        fileName = file.name;
        mimeType = 'text/plain';
        sizeInBytes = file.size;
      }

      const res = await fetch('/api/public/file-directory/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: cleanTitle || undefined,
          fileName,
          mimeType,
          dataUrl,
          sizeInBytes,
          notes: cleanStory || undefined,
          directoryVisibility: 'public',
          // Existing content taxonomy: an image-led post vs. a written article.
          directoryCategory: imageFile ? 'post' : 'article',
          // The topic the user picked rides along on the existing tag system.
          directoryTags: [category, ...interests].filter(Boolean).slice(0, 4),
          authMode: 'public',
          thumbnailUrl,
        }),
      });
      const data = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error || 'Could not publish your post.');

      await completeOnboarding('completed');
      leaveOnboarding();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish your post.');
      setBusy(false);
    }
  }, [category, completeOnboarding, imageFile, interests, leaveOnboarding, story, title]);

  const handlePrimary = useCallback(() => {
    setError('');
    if (step < TOTAL_STEPS - 1) { setStep((s) => s + 1); return; }
    void handlePublish();
  }, [handlePublish, step]);

  const canPublish = Boolean(title.trim() || story.trim() || imageFile);

  /* ── Shared bottom controls (rendered once per breakpoint) ── */
  const dots = <StepDots step={step} />;
  const cta = (
    <PrimaryButton
      onClick={handlePrimary}
      busy={busy}
      disabled={skipping || (step === 2 && !canPublish)}
    >
      {step === 2 ? (
        <>
          Publish Post
          <ArrowRight
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-[3px]"
            aria-hidden="true"
          />
        </>
      ) : 'Continue'}
    </PrimaryButton>
  );

  /* ── Left column: hero + copy, per step ── */
  const copy = (() => {
    if (step === 0) {
      return (
        <>
          <HeroBadge ring>
            {/* Waving hand — pivots at the wrist so the gesture reads as "hi". */}
            <Hand
              className="h-6 w-6 lg:h-[26px] lg:w-[26px]"
              strokeWidth={1.7}
              aria-hidden="true"
              style={{ transformOrigin: '60% 85%', animation: 'obWave 3.6s 0.75s ease-in-out infinite' }}
            />
          </HeroBadge>
          <div className="mt-4 lg:mt-5">
            {/* Sized down a step from the other headings so the greeting keeps
                to one line wherever the column is wide enough for it. */}
            <Heading className="text-[1.5rem] sm:text-[1.78rem] lg:text-[1.72rem] xl:text-[1.95rem]">
              <span className="font-extrabold text-white/55">Hello{greetName ? ` ${greetName}` : ''},</span>{' '}
              <span className="whitespace-nowrap">Welcome to Docrud.</span>
            </Heading>
            <p
              className="mt-3.5 text-[14.5px] font-bold leading-[1.4] tracking-[-0.015em] text-white/85 sm:text-[15.5px]"
              style={{ animation: 'obSlideUp 0.55s 0.2s cubic-bezier(.22,1,.36,1) both' }}
            >
              One connection can change everything !
            </p>
            <p
              className="mt-2 max-w-[38ch] text-[13px] leading-[1.6] text-white/45 sm:text-[13.5px] lg:max-w-[46ch]"
              style={{ animation: 'obSlideUp 0.55s 0.28s cubic-bezier(.22,1,.36,1) both' }}
            >
              Docrud connects talent with opportunities, businesses with the right people, and
              professionals with networks that open doors.
            </p>
            <p
              className="mt-2.5 text-[12.5px] font-extrabold uppercase tracking-[0.16em] text-white/70 sm:text-[13px]"
              style={{ animation: 'obSlideUp 0.55s 0.36s cubic-bezier(.22,1,.36,1) both' }}
            >
              Connect. Discover. Grow.
            </p>
          </div>
        </>
      );
    }
    if (step === 1) {
      return (
        <>
          <HeroBadge ring>
            <Heart
              className="h-6 w-6"
              strokeWidth={1.8}
              aria-hidden="true"
              style={{ animation: 'obHeartBeat 3.2s 0.7s ease-in-out infinite' }}
            />
          </HeroBadge>
          <div className="mt-4 lg:mt-5">
            <Heading className="text-[1.62rem] sm:text-[1.9rem] lg:text-[1.95rem] xl:text-[2.15rem]">
              What are you interested in?
            </Heading>
            <Description>Choose up to 3 topics to personalize your Docrud experience.</Description>
          </div>
          <div
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/[0.11] bg-white/[0.045] px-3.5 py-1.5 transition-all duration-300"
            style={{
              animation: 'obSlideUp 0.5s 0.28s cubic-bezier(.22,1,.36,1) both',
              boxShadow: interests.length > 0 ? '0 0 18px rgba(255,255,255,0.09)' : 'none',
            }}
          >
            <span className="text-[11.5px] font-bold tabular-nums tracking-[0.02em] text-white/75" aria-live="polite">
              {interests.length}/{MAX_INTERESTS} selected
            </span>
          </div>
        </>
      );
    }
    return (
      <>
        <HeroBadge ring>
          <PenLine
            className="h-6 w-6"
            strokeWidth={1.8}
            aria-hidden="true"
            style={{ animation: 'obPenWrite 4s 0.8s ease-in-out infinite' }}
          />
        </HeroBadge>
        <div className="mt-5">
          <h1
            className={`${scriptFontClass} text-[2.9rem] leading-[1.05] text-white sm:text-[3.4rem] lg:text-[3.5rem] xl:text-[3.9rem]`}
            style={{
              fontFamily: 'var(--font-docrud-script), Georgia, serif',
              fontWeight: 700,
              backgroundImage: 'linear-gradient(105deg, #ffffff 12%, rgba(255,255,255,0.72) 62%, rgba(199,205,255,0.85) 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              // Descenders on the script face clip against a tight line-box.
              paddingBottom: '0.12em',
              animation: 'obSlideUp 0.6s 0.12s cubic-bezier(.22,1,.36,1) both',
            }}
          >
            Share your story
          </h1>
          <Description>Start with an idea. We&apos;ll help you publish it.</Description>
        </div>
      </>
    );
  })();

  /* ── Right column: the interactive panel, per step ── */
  const panel = (() => {
    if (step === 0) return <WelcomeVisual />;

    if (step === 1) {
      return (
        <div
          className="rounded-[20px] border border-white/[0.06] bg-white/[0.02] p-3.5 backdrop-blur-xl sm:p-4 lg:p-5"
          style={{ animation: 'obSlideUp 0.55s 0.3s cubic-bezier(.22,1,.36,1) both' }}
        >
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5" role="group" aria-label="Topics">
            {INTERESTS.map(({ label, Icon }, i) => {
              const selected = interests.includes(label);
              const blocked = !selected && atLimit;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleInterest(label)}
                  aria-pressed={selected}
                  // Kept focusable at the limit — a disabled button drops out of
                  // the tab order, and the toggle already refuses a fourth pick.
                  aria-disabled={blocked}
                  className={[
                    'group flex min-h-[46px] items-center gap-2 rounded-full border px-3 py-2.5 text-left',
                    'transition-all duration-200 [transition-timing-function:cubic-bezier(.22,1,.36,1)] active:scale-[0.98] sm:px-3.5',
                    FOCUS_RING,
                    selected
                      ? 'border-white/85 bg-white text-[#08090a] shadow-[0_4px_16px_rgba(255,255,255,0.14)]'
                      : blocked
                        ? 'cursor-not-allowed border-white/[0.05] bg-white/[0.015] text-white/25'
                        : 'border-white/[0.09] bg-white/[0.03] text-white/75 hover:-translate-y-[1px] hover:border-white/25 hover:bg-white/[0.06] hover:text-white',
                  ].join(' ')}
                  title={blocked ? `You can choose up to ${MAX_INTERESTS} topics` : undefined}
                  style={{ animation: `obSlideUp 0.45s ${0.32 + i * 0.035}s cubic-bezier(.22,1,.36,1) both` }}
                >
                  <Icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.8} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold tracking-[-0.005em] sm:text-[13px]">{label}</span>
                  <span
                    aria-hidden="true"
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-all duration-200"
                    style={{
                      background: selected ? '#08090a' : 'transparent',
                      transform: selected ? 'scale(1)' : 'scale(0.4)',
                      opacity: selected ? 1 : 0,
                    }}
                  >
                    <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3.5" style={{ animation: 'obSlideUp 0.45s 0.7s cubic-bezier(.22,1,.36,1) both' }}>
            <label htmlFor="ob-other-interest" className="sr-only">Tell us what else you are interested in</label>
            <input
              id="ob-other-interest"
              type="text"
              value={otherInterest}
              onChange={(e) => setOtherInterest(e.target.value.slice(0, 60))}
              placeholder="Tell us (optional)"
              className={`${FIELD} h-11 text-[13px]`}
              aria-describedby="ob-other-hint"
            />
            <p id="ob-other-hint" className="mt-1.5 px-1 text-[11px] text-white/25">
              e.g. Product Management, Cybersecurity
            </p>
          </div>
        </div>
      );
    }

    return (
      <div
        className="rounded-[20px] border border-white/[0.06] bg-white/[0.02] p-3.5 backdrop-blur-xl sm:p-4 lg:p-5"
        style={{ animation: 'obSlideUp 0.55s 0.3s cubic-bezier(.22,1,.36,1) both' }}
      >
        <div>
          <label htmlFor="ob-title" className={LABEL}>Title</label>
          <input
            id="ob-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 120))}
            placeholder="Give your post a title..."
            className={`${FIELD} h-12 text-[13.5px]`}
          />
        </div>

        <div className="mt-3.5">
          <label htmlFor="ob-story" className={LABEL}>Story</label>
          <textarea
            id="ob-story"
            value={story}
            onChange={(e) => setStory(clampPublicationBody(e.target.value))}
            placeholder="Write something you'd like to share..."
            rows={4}
            className={`${FIELD} resize-none py-3 text-[13.5px] leading-relaxed`}
          />
          <p className={`mt-1 text-right text-[10.5px] ${publicationBodyLength(story) >= PUBLICATION_BODY_MAX ? 'text-amber-300/70' : 'text-white/25'}`}>
            {publicationBodyLength(story)} / {PUBLICATION_BODY_MAX}
          </p>
        </div>

        <div className="mt-3.5">
          <span className={LABEL}>Category</span>
          <div className="flex flex-wrap gap-2">
            {categoryOptions.map((option) => {
              const selected = category === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCategory(option)}
                  aria-pressed={selected}
                  className={[
                    'flex min-h-[38px] items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-semibold',
                    'transition-all duration-200 active:scale-[0.98]',
                    FOCUS_RING,
                    selected
                      ? 'border-white/85 bg-white text-[#08090a]'
                      : 'border-white/[0.09] bg-white/[0.03] text-white/65 hover:border-white/25 hover:bg-white/[0.06]',
                  ].join(' ')}
                >
                  {option}
                  {selected && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#08090a]" aria-hidden="true">
                      <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                    </span>
                  )}
                </button>
              );
            })}

            {addingCategory ? (
              <span className="flex min-h-[38px] items-center gap-1 rounded-full border border-white/25 bg-white/[0.06] px-2.5">
                <label htmlFor="ob-new-category" className="sr-only">New category name</label>
                <input
                  id="ob-new-category"
                  ref={newCategoryRef}
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addCategory(); }
                    if (e.key === 'Escape') { setNewCategory(''); setAddingCategory(false); }
                  }}
                  onBlur={addCategory}
                  placeholder="Category name"
                  className="w-[118px] bg-transparent text-[12.5px] font-semibold text-white outline-none placeholder:text-white/25"
                />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={addCategory}
                  aria-label="Add category"
                  className={`flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#08090a] ${FOCUS_RING}`}
                >
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => { setAddingCategory(true); setTimeout(() => newCategoryRef.current?.focus(), 30); }}
                className={`flex min-h-[38px] items-center gap-1.5 rounded-full border border-dashed border-white/[0.14] px-3.5 text-[12.5px] font-semibold text-white/45 transition-all duration-200 hover:border-white/30 hover:text-white/75 active:scale-[0.98] ${FOCUS_RING}`}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
                Create category
              </button>
            )}
          </div>
        </div>

        <div className="mt-3.5">
          <span className={LABEL}>Media <span className="normal-case tracking-normal text-white/25">(optional)</span></span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            className="sr-only"
            aria-label="Add an image to your post"
          />
          {imagePreview ? (
            <div className="relative overflow-hidden rounded-[14px] border border-white/[0.09]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="Selected post image preview" className="h-[132px] w-full object-cover sm:h-[150px]" />
              <button
                type="button"
                onClick={removeImage}
                aria-label="Remove image"
                className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/65 text-white backdrop-blur-sm transition-colors hover:bg-black/85 ${FOCUS_RING}`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={`flex h-[92px] w-full flex-col items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-white/[0.13] bg-white/[0.015] text-white/40 transition-all duration-200 hover:border-white/25 hover:bg-white/[0.04] hover:text-white/65 ${FOCUS_RING}`}
            >
              <ImageIcon className="h-[18px] w-[18px]" strokeWidth={1.7} aria-hidden="true" />
              <span className="text-[12.5px] font-semibold">Add image</span>
            </button>
          )}
        </div>
      </div>
    );
  })();

  /* ── Render ──────────────────────────────────────────────── */
  return (
    // No `overflow-x-hidden` here: it would make this element the scroll
    // container and kill the sticky mobile action bar. The ambient layer below
    // is the only thing that can exceed the viewport, and it clips itself.
    <div className="ob-start relative flex min-h-[100dvh] flex-col bg-[#08090a] text-white">
      <style>{`
        .ob-start ::-webkit-scrollbar { width: 6px; height: 6px; }
        .ob-start ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 99px; }
        @media (prefers-reduced-motion: reduce) {
          .ob-start *, .ob-start *::before, .ob-start *::after {
            animation: none !important;
            transition-duration: 1ms !important;
          }
        }
      `}</style>

      {/* Ambient background — same language as the existing signup/login screens */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute left-[12%] top-[8%] h-[520px] w-[520px] rounded-full bg-indigo-500/[0.055] blur-[150px]"
          style={{ animation: 'obDrift1 24s ease-in-out infinite' }}
        />
        <div
          className="absolute bottom-[6%] right-[8%] h-[430px] w-[430px] rounded-full bg-violet-500/[0.05] blur-[135px]"
          style={{ animation: 'obDrift2 30s ease-in-out infinite 5s' }}
        />
        <div
          className="absolute left-[52%] top-[46%] h-[340px] w-[340px] rounded-full bg-sky-500/[0.035] blur-[120px]"
          style={{ animation: 'obDrift3 26s ease-in-out infinite 3s' }}
        />
        <div className="absolute inset-0 opacity-[0.016] [background-image:linear-gradient(rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 mx-auto flex w-full max-w-[1200px] items-center justify-between px-5 pt-[max(0.9rem,env(safe-area-inset-top))] sm:px-8 lg:pt-7">
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-[10px] border border-white/[0.10] bg-white/[0.05]">
            <Image src="/docrud-icon.png" alt="" aria-hidden="true" width={64} height={64} priority className="h-full w-full object-contain" />
          </span>
          <span className="text-[15px] font-black tracking-[-0.03em] text-white/90">Docrud</span>
        </span>
        <button
          type="button"
          onClick={handleSkip}
          disabled={skipping || busy}
          className={`-mr-1 flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-white/45 transition-colors hover:text-white disabled:opacity-40 ${FOCUS_RING}`}
        >
          {skipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
          Skip
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </header>

      {/* Body */}
      {/* pb clears the pinned mobile action bar */}
      <main className="relative z-10 mx-auto flex w-full max-w-[1200px] flex-1 flex-col justify-center px-5 pb-[124px] pt-6 sm:px-8 sm:pt-8 lg:pb-8 lg:pt-4">
        <div
          key={step}
          className="flex flex-1 flex-col justify-center gap-7 lg:grid lg:flex-none lg:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)] lg:items-center lg:gap-12 xl:gap-16"
          style={{ animation: 'obFadeIn 0.4s both' }}
        >
          <section className={`flex flex-col items-center text-center lg:items-start lg:text-left ${step === 0 ? 'order-2 lg:order-1' : 'order-1'}`}>
            {copy}
            <div
              className="mt-8 hidden w-full max-w-[320px] lg:block"
              style={{ animation: 'obSlideUp 0.5s 0.46s cubic-bezier(.22,1,.36,1) both' }}
            >
              {dots}
              <div className="mt-4 flex justify-start lg:mt-5">{cta}</div>
            </div>
          </section>

          <section className={`${step === 0 ? 'order-1 lg:order-2' : 'order-2'} w-full`}>
            <div className="mx-auto w-full max-w-[440px] lg:max-w-none">{panel}</div>
          </section>
        </div>

        {error && (
          <p
            role="alert"
            className="mx-auto mt-4 w-full max-w-[440px] rounded-[12px] border border-rose-500/25 bg-rose-500/[0.08] px-3.5 py-2.5 text-center text-[12.5px] text-rose-200 lg:max-w-none"
          >
            {error}
          </p>
        )}
      </main>

      {/* Mobile / tablet controls */}
      {/* Pinned so the primary action stays reachable on short screens where the
          form is taller than the viewport. `fixed` rather than `sticky`: the app
          sets `overflow-x: hidden` on <body>, which makes body its own scroll
          container and stops sticky from resolving against the viewport. */}
      <footer className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#08090a] via-[#08090a] to-transparent px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5 sm:px-8 lg:hidden">
        <div
          className="mx-auto w-full max-w-[460px]"
          style={{ animation: 'obSlideUp 0.5s 0.46s cubic-bezier(.22,1,.36,1) both' }}
        >
          {dots}
          <div className="mt-4 flex justify-center">{cta}</div>
        </div>
      </footer>
    </div>
  );
}
