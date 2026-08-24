'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn, signOut, useSession } from 'next-auth/react';
import AnimatedLoginBackground, {
  SPLASH_PROFILES_TOP, SPLASH_PROFILES_BTM,
} from '@/components/AnimatedLoginBackground';
import AccountTypeToggle, { normalizeAccountKind, type AccountKind } from '@/components/AccountTypeToggle';
import BusinessSignupForm from '@/components/BusinessSignupForm';
import TurnstileWidget from '@/components/security/TurnstileWidget';
import {
  ArrowRight, Award, Bot, Briefcase, CheckCircle2, Eye, EyeOff,
  FileSignature, FileText, FormInput, Globe,
  Layers, LockKeyhole, MapPin, Network, PenLine, Rss, Shield, Share2,
  Sparkles, Table2, Users, X, Zap,
} from 'lucide-react';

/* ─── Splash ─────────────────────────────────────────────────── */
const SLOT_WORDS = ['professional network', 'Documents', 'Jobs', 'Talent'];
const SPLASH_FEATS = [
  'e-sign docs with OTP magic — zero paperwork. ✦',
  'AI writes your documents in under 60 seconds. ✦',
  'annotate, stamp & share PDFs — just like that. ✦',
  'smart forms that actually think for you. ✦',
  '3,400+ verified pros, one friendly platform. ✦',
  'post gigs, find talent, get things done. ✦',
  'DocSheets — spreadsheets, but make it fun. ✦',
  'SOC 2 & GDPR-ready. your data, always safe. ✦',
];

/* ─── Constants ──────────────────────────────────────────────── */
const POPULAR_SKILLS = [
  'React','Node.js','Python','Figma','Product Design','TypeScript',
  'Go','Machine Learning','Data Science','Marketing','Content Writing',
  'SEO','Sales','Finance','Legal','Operations','UX Research',
  'Brand Design','Video Editing','Copywriting',
];
const INTEREST_CATEGORIES = [
  'Technology','Design','Business','Finance','Legal','Marketing',
  'Writing','Data & AI','Engineering','Product',
  'Healthcare','Education','Startup','Freelance',
];

const TOUR_END    = 3;
const SIGNUP_SCR  = 4;
const OTP_SCR     = 5;
const PROFILE_SCR = 6;
const SKILLS_SCR  = 7;
const PEOPLE_SCR  = 8;
const DONE_SCR    = 9;
const TOTAL_SCR   = 10;

/* Kept for non-heading uses (progress bar, step dots, strength meter) */
const GOLD_GRAD = 'linear-gradient(90deg,#4f46e5,#818cf8,#4f46e5)';

/* Shared input class — compact on mobile */
const INP = [
  'h-10 sm:h-11 w-full rounded-[12px] border border-white/[0.08]',
  'bg-white/[0.04] text-white px-3 text-[13px] sm:text-sm',
  'placeholder:text-white/20 focus:outline-none focus:border-white/[0.22]',
  'focus:bg-white/[0.06] focus:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]',
  'transition-all duration-200',
].join(' ');

function initials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'U';
}

/* ─── Particles ─────────────────────────────────────────────── */
const PARTICLES = [
  { x: 8,  y:12, s:2,   d:'0s',   t:'obParticle 4.2s ease-in-out infinite',  warm:false },
  { x:22,  y:68, s:1.5, d:'0.7s', t:'obParticle2 5.1s ease-in-out infinite', warm:true  },
  { x:45,  y:22, s:1.5, d:'1.2s', t:'obParticle 3.8s ease-in-out infinite',  warm:false },
  { x:63,  y:78, s:2,   d:'0.3s', t:'obParticle2 6.2s ease-in-out infinite', warm:false },
  { x:78,  y:35, s:1.5, d:'1.8s', t:'obParticle 4.6s ease-in-out infinite',  warm:false },
  { x:88,  y:82, s:2,   d:'0.9s', t:'obParticle2 5.5s ease-in-out infinite', warm:false },
  { x:35,  y:90, s:1.5, d:'2.1s', t:'obParticle 3.5s ease-in-out infinite',  warm:true  },
  { x:55,  y:48, s:2,   d:'0.5s', t:'obParticle2 4.9s ease-in-out infinite', warm:false },
  { x:92,  y:18, s:1.5, d:'1.5s', t:'obParticle 5.8s ease-in-out infinite',  warm:false },
  { x:18,  y:42, s:2,   d:'2.4s', t:'obParticle2 4.1s ease-in-out infinite', warm:false },
  { x:72,  y:60, s:1.5, d:'0.2s', t:'obParticle 6.0s ease-in-out infinite',  warm:false },
  { x:48,  y: 8, s:2,   d:'1.0s', t:'obParticle2 3.9s ease-in-out infinite', warm:false },
  { x:12,  y:85, s:1.5, d:'1.7s', t:'obParticle 5.3s ease-in-out infinite',  warm:false },
  { x:82,  y:50, s:2,   d:'0.6s', t:'obParticle2 4.4s ease-in-out infinite', warm:false },
  { x:30,  y:30, s:1.5, d:'2.8s', t:'obParticle 4.7s ease-in-out infinite',  warm:false },
  { x:67,  y:95, s:2,   d:'1.3s', t:'obParticle2 5.0s ease-in-out infinite', warm:false },
  { x:95,  y:70, s:1.5, d:'0.4s', t:'obParticle 3.6s ease-in-out infinite',  warm:false },
  { x: 5,  y:55, s:2,   d:'2.0s', t:'obParticle2 6.4s ease-in-out infinite', warm:false },
];

/* ─── Premium highlighter component ─────────────────────────── */
function Highlight({ children, delay = '0.48s' }: { children: React.ReactNode; delay?: string }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      <span
        aria-hidden
        className="absolute inset-x-[-4px] bottom-[-2px] top-[16%] rounded-[5px]"
        style={{
          background: 'linear-gradient(105deg,rgba(251,146,60,0.30) 0%,rgba(245,158,11,0.24) 45%,rgba(253,186,116,0.20) 100%)',
          transformOrigin: 'left center',
          animation: `obHighlight 0.90s ${delay} cubic-bezier(0.16,1,0.3,1) both`,
        }}
      />
      <span className="relative text-white">{children}</span>
    </span>
  );
}

/* ─── Screen transition ──────────────────────────────────────── */
function ScreenIn({ children, className }: { children: React.ReactNode; className?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
    return () => cancelAnimationFrame(r);
  }, []);
  return (
    <div className={className} style={{
      transition: 'opacity 420ms ease, transform 420ms cubic-bezier(.22,1,.36,1)',
      opacity: on ? 1 : 0,
      transform: on ? 'none' : 'translateY(20px)',
    }}>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SPLASH SCREEN
═══════════════════════════════════════════════════════════════ */

/* ─── Main splash screen ─────────────────────────────────────── */
function SplashScreen({ visible, onSkip }: { visible: boolean; onSkip: () => void }) {
  const slotRef    = useRef<HTMLSpanElement>(null);
  const slotCurRef = useRef(0);
  const [slotWord, setSlotWord] = useState(SLOT_WORDS[0]);

  useEffect(() => {
    let cancelled = false;
    const cycle = () => {
      const el = slotRef.current;
      if (!el || cancelled) return;
      el.style.transition = 'transform 300ms cubic-bezier(0.4,0,1,1), opacity 260ms ease';
      el.style.transform  = 'translateY(-72%)';
      el.style.opacity    = '0';
      setTimeout(() => {
        if (cancelled) return;
        const el2 = slotRef.current;
        if (!el2) return;
        el2.style.transition = 'none';
        el2.style.transform  = 'translateY(72%)';
        el2.style.opacity    = '0';
        slotCurRef.current   = (slotCurRef.current + 1) % SLOT_WORDS.length;
        setSlotWord(SLOT_WORDS[slotCurRef.current]);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (cancelled) return;
          const el3 = slotRef.current;
          if (!el3) return;
          el3.style.transition = 'transform 420ms cubic-bezier(0.22,1,0.36,1), opacity 340ms ease';
          el3.style.transform  = 'translateY(0)';
          el3.style.opacity    = '1';
        }));
      }, 320);
    };
    const t = setInterval(cycle, 2800);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  return (
    <div
      aria-hidden={!visible}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#060608', overflow: 'hidden',
        transition: 'opacity 900ms cubic-bezier(0.4,0,0.2,1)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {/* ── Animated card-marquee background (rows + blur mask + vignettes) ── */}
      <AnimatedLoginBackground />

      {/* ── Center content ── */}
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 24px',
        }}
      >
        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>

          {/* Headline */}
          <div style={{ animation: 'obSlideUp 0.55s 0.45s both', opacity: 0, textAlign: 'center', position: 'relative' }}>
            {/* Frosted blur behind text — mobile only (hidden ≥ sm) */}
            <div className="sm:hidden" style={{
              position: 'absolute', inset: '-18px -28px',
              backdropFilter: 'blur(22px)',
              WebkitBackdropFilter: 'blur(22px)',
              background: 'rgba(5,5,8,0.32)',
              borderRadius: 28,
              pointerEvents: 'none',
            }} />
            {/* Single-line heading */}
            <div style={{ position: 'relative', zIndex: 1, fontSize: 'clamp(0.82rem, 4.15vw, 2.8rem)', letterSpacing: '-0.04em', lineHeight: 1.15 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '0.28em', fontWeight: 300, whiteSpace: 'nowrap' }}>
                <span style={{ color: 'rgba(255,255,255,0.38)', fontWeight: 300 }}>Manage</span>
                <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', lineHeight: 1.2 }}>
                  <span
                    ref={slotRef}
                    style={{ display: 'inline-block', color: '#ffffff', fontWeight: 700, letterSpacing: '-0.045em' }}
                  >
                    {slotWord}
                  </span>
                </span>
                <span style={{ color: 'rgba(255,255,255,0.38)', fontWeight: 300 }}>&amp; More</span>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div style={{ animation: 'obFadeIn 0.5s 1.5s both', opacity: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={onSkip}
              className="group flex items-center gap-2 rounded-full border border-white/[0.10] bg-white/[0.04] px-5 py-2.5 text-[13px] font-medium text-white/60 backdrop-blur-sm transition-all duration-200 hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white/90 active:scale-[0.97]"
            >
              create profile
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
            <Link
              href="/login"
              className="flex items-center gap-2 rounded-full border border-white/[0.10] bg-white/[0.04] px-5 py-2.5 text-[13px] font-medium text-white/60 backdrop-blur-sm transition-all duration-200 hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white/90 active:scale-[0.97]"
            >
              sign in
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   BACKGROUND
═══════════════════════════════════════════════════════════════ */
function BgOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>

      {/* Diagonal pinned orange glows — top-left & bottom-right */}
      <div className="absolute -top-48 -left-48 h-[700px] w-[700px] rounded-full"
        style={{ background: 'radial-gradient(circle,rgba(249,115,22,0.09) 0%,rgba(234,88,12,0.05) 40%,transparent 70%)', filter: 'blur(140px)' }} />
      <div className="absolute -bottom-48 -right-48 h-[700px] w-[700px] rounded-full"
        style={{ background: 'radial-gradient(circle,rgba(249,115,22,0.09) 0%,rgba(234,88,12,0.05) 40%,transparent 70%)', filter: 'blur(140px)' }} />

      {/* Orange-gold moving orbs */}
      <div className="absolute -left-40 -top-40 h-[800px] w-[800px] rounded-full"
        style={{ background: 'radial-gradient(circle,rgba(251,146,60,0.20) 0%,rgba(245,158,11,0.12) 38%,rgba(234,88,12,0.05) 62%,transparent 76%)', filter: 'blur(95px)', animation: 'obGoldDrift1 30s ease-in-out infinite' }} />
      <div className="absolute -right-32 top-[12%] h-[660px] w-[660px] rounded-full"
        style={{ background: 'radial-gradient(circle,rgba(245,158,11,0.17) 0%,rgba(251,146,60,0.09) 42%,rgba(253,186,116,0.04) 66%,transparent 78%)', filter: 'blur(85px)', animation: 'obGoldDrift2 38s ease-in-out infinite 5s' }} />
      <div className="absolute bottom-[-8%] left-[28%] h-[580px] w-[580px] rounded-full"
        style={{ background: 'radial-gradient(circle,rgba(234,88,12,0.15) 0%,rgba(245,158,11,0.10) 40%,rgba(251,146,60,0.04) 64%,transparent 76%)', filter: 'blur(80px)', animation: 'obGoldDrift3 34s ease-in-out infinite 10s' }} />
      <div className="absolute right-[18%] bottom-[22%] h-[340px] w-[340px] rounded-full"
        style={{ background: 'radial-gradient(circle,rgba(253,186,116,0.11) 0%,rgba(245,158,11,0.06) 52%,transparent 72%)', filter: 'blur(60px)', animation: 'obGoldDrift1 22s ease-in-out infinite 8s' }} />

      {/* Particles — warm amber + white */}
      {PARTICLES.map((p, i) => (
        <div key={i} className="absolute rounded-full"
          style={{
            left: `${p.x}%`, top: `${p.y}%`,
            width: p.s, height: p.s,
            animationDelay: p.d, animation: p.t,
            background: p.warm ? 'rgba(251,146,60,0.65)' : 'rgba(255,255,255,0.45)',
          }} />
      ))}

      {/* Glass grain */}
      <div className="absolute inset-0 opacity-[0.025]"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundRepeat: 'repeat', backgroundSize: '180px 180px' }} />

      {/* Micro-grid */}
      <div className="absolute inset-0 opacity-[0.016]"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.5) 1px,transparent 1px)', backgroundSize: '64px 64px' }} />

      {/* Warm top glow */}
      <div className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 110% 60% at 50% -5%,rgba(245,158,11,0.06) 0%,transparent 55%)' }} />

      {/* Edge darken */}
      <div className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center,transparent 38%,rgba(5,5,8,0.82) 100%)' }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LEFT PANELS  (desktop only — hidden on mobile)
═══════════════════════════════════════════════════════════════ */
function HeroLeftPanel() {
  const coreFeatures = [
    { Icon: FileSignature, label: 'E-Sign Studio',    sub: 'OTP-verified contracts',       delay: '0.10s' },
    { Icon: Bot,           label: 'Document AI',      sub: 'Generate docs in seconds',     delay: '0.18s' },
    { Icon: PenLine,       label: 'DocWord Studio',   sub: 'AI-powered editor',            delay: '0.26s' },
    { Icon: FormInput,     label: 'Form Builder',     sub: 'Smart forms & workflows',      delay: '0.34s' },
    { Icon: FileText,      label: 'PDF Studio',       sub: 'Annotate, watermark & share',  delay: '0.42s' },
    { Icon: Shield,        label: 'Compliance Vault', sub: 'SOC 2 & GDPR-ready',           delay: '0.50s' },
    { Icon: Users,         label: 'People Network',   sub: '3,400+ professionals',         delay: '0.58s' },
    { Icon: Zap,           label: 'Gig Board',        sub: 'Find & post opportunities',    delay: '0.66s' },
    { Icon: Layers,        label: 'DocSheet',         sub: 'Collaborative spreadsheets',   delay: '0.74s' },
  ];
  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-8 xl:p-12 select-none">
      <div className="w-full max-w-md mb-6" style={{ animation: 'obSlideUp 0.5s both' }}>
        <div className="mb-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/[0.12]" />
          <span className="text-[9px] font-black uppercase tracking-[0.35em] text-white/22">Everything you need</span>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/[0.12]" />
        </div>
        <h2 className="text-[2.2rem] font-black leading-[1.08] tracking-[-0.05em] text-white">
          One platform.<br />
          <Highlight delay="0.55s">Every tool.</Highlight>
        </h2>
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-white/35">
          From AI-powered document creation to professional networking — everything a modern professional needs.
        </p>
      </div>
      <div className="w-full max-w-md grid grid-cols-3 gap-2.5">
        {coreFeatures.map(({ Icon, label, sub, delay }) => (
          <div key={label}
            className="group relative flex flex-col gap-2.5 overflow-hidden rounded-[16px] border border-white/[0.07] bg-white/[0.025] p-3.5 transition-all duration-300 hover:border-white/[0.14] hover:bg-white/[0.05]"
            style={{ animation: `obSlideUp 0.45s ${delay} ease both` }}>
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.06] transition-all group-hover:border-white/[0.16] group-hover:bg-white/[0.10]">
              <Icon className="h-4 w-4 text-white/55 transition-all group-hover:text-white/80" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-white/72 leading-tight">{label}</div>
              <div className="mt-0.5 text-[9.5px] text-white/28 leading-tight">{sub}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex w-full max-w-md items-center justify-between gap-4" style={{ animation: 'obSlideUp 0.5s 0.8s both' }}>
        {[['12k+','Published'],['3.4k','Creators'],['98%','Satisfy']].map(([v, l]) => (
          <div key={l} className="text-center">
            <div className="text-[24px] font-black text-white">{v}</div>
            <div className="text-[10px] font-medium text-white/28">{l}</div>
          </div>
        ))}
        <div className="flex-1 rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-0.5">
            <div className="relative h-1.5 w-1.5">
              <div className="absolute inset-0 rounded-full bg-white/50 animate-ping" />
              <div className="h-1.5 w-1.5 rounded-full" style={{ background: '#D4AF37' }} />
            </div>
            <span className="text-[10px] font-bold text-white/45">Live</span>
          </div>
          <div className="text-[9.5px] text-white/28 leading-tight">Platform active<br />right now</div>
        </div>
      </div>
    </div>
  );
}

function PublishLeftPanel() {
  const publishTypes = [
    { type: 'Article',   title: 'How Bengaluru Startups Rewrote Global SaaS Playbooks', badge: 'Trending',  reads: '29.6k', icon: FileText     },
    { type: 'Document',  title: 'DPDP Act 2023 — Enterprise Compliance Handbook',       badge: 'Featured',  reads: '318',   icon: FileSignature },
    { type: 'Portfolio', title: 'Reimagining IRCTC for the Next Billion Users',          badge: null,        reads: '14.2k', icon: Layers        },
    { type: 'Gig',       title: 'Brand System Refresh for a SaaS Launch · ₹35k–₹60k',  badge: 'New',       reads: '6 bids', icon: Zap          },
  ];
  return (
    <div className="flex flex-col justify-center h-full w-full max-w-lg mx-auto p-10 xl:p-14 select-none">
      <div className="mb-6" style={{ animation: 'obSlideUp 0.5s both' }}>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">
          <div className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: '#D4AF37' }} />
          Live Feed
        </div>
        <h3 className="mt-3 text-[2rem] font-black text-white leading-[1.1] tracking-tight">
          Your content reaches<br />
          <Highlight delay="0.55s">thousands daily.</Highlight>
        </h3>
      </div>
      <div className="mb-4 flex items-center gap-3 rounded-[15px] border border-white/[0.06] bg-white/[0.03] px-4 py-3" style={{ animation: 'obSlideUp 0.5s 0.05s both' }}>
        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.05]">
          <svg className="h-4 w-4 text-white/40" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2l5 5H9v5H7V7H3z"/></svg>
        </div>
        <span className="flex-1 text-sm text-white/22">What are you sharing today?</span>
        <div className="flex h-7 items-center rounded-[9px] bg-white px-3 text-[11px] font-black text-[#050508]" style={{ boxShadow: '0 0 16px rgba(255,255,255,0.12)', animation: 'obPulse 3.5s ease-in-out infinite' }}>Publish</div>
      </div>
      <div className="space-y-2.5">
        {publishTypes.map((c, i) => {
          const Icon = c.icon;
          return (
            <div key={c.title}
              className="relative flex items-start gap-3 overflow-hidden rounded-[16px] border border-white/[0.05] bg-white/[0.025] px-4 py-3.5"
              style={{ animation: `obSlideUp 0.45s ${0.10 + i * 0.08}s both` }}>
              <div className="absolute inset-y-0 left-0 w-[2px] rounded-l-full bg-gradient-to-b from-white/30 via-white/10 to-transparent" />
              <div className="shrink-0 flex h-7 w-7 items-center justify-center rounded-[9px] border border-white/[0.07] bg-white/[0.04]">
                <Icon className="h-3 w-3 text-white/40" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-md border border-white/[0.08] bg-white/[0.06] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-white/40">{c.type}</span>
                  {c.badge && <span className="rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-white/55">{c.badge}</span>}
                </div>
                <p className="text-[12px] font-semibold text-white/70 line-clamp-1 leading-snug">{c.title}</p>
                <div className="mt-0.5 text-[10px] text-white/28">{c.reads} {c.type === 'Gig' ? '' : 'reads'}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-5" style={{ animation: 'obSlideUp 0.5s 0.6s both' }}>
        <div className="mb-2 flex items-center justify-between text-[10px]">
          <span className="text-white/25 font-medium">Today&apos;s reach</span>
          <span className="font-black text-white">47,200 impressions</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full origin-left"
            style={{ width: '78%', background: 'linear-gradient(90deg,rgba(255,255,255,0.25),rgba(212,175,55,0.60),rgba(255,255,255,0.35))', animation: 'obBarGrow 1.2s 0.8s cubic-bezier(.22,1,.36,1) both' }} />
        </div>
      </div>
    </div>
  );
}

function ConnectLeftPanel() {
  const nodes = [
    { name:'Ananya', role:'Product Designer',  init:'A',  x:50, y:10, size:54 },
    { name:'Rohan',  role:'Full-stack Dev',    init:'R',  x:82, y:36, size:50 },
    { name:'Priya',  role:'Brand Strategist',  init:'P',  x:74, y:74, size:46 },
    { name:'Vikram', role:'Startup Founder',   init:'V',  x:26, y:76, size:46 },
    { name:'Meera',  role:'Data Scientist',    init:'M',  x:8,  y:42, size:48 },
    { name:'Arnav',  role:'UX Researcher',     init:'Ar', x:20, y:14, size:44 },
  ];
  return (
    <div className="flex flex-col justify-center h-full w-full p-10 xl:p-14 select-none">
      <div className="mb-5" style={{ animation: 'obSlideUp 0.5s both' }}>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">
          <div className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: '#D4AF37' }} />
          Professional Network
        </div>
        <h3 className="mt-3 text-[2rem] font-black text-white leading-[1.1] tracking-tight">
          Connect with 3,400+<br />
          <Highlight delay="0.55s">professionals.</Highlight>
        </h3>
      </div>
      <div className="relative mx-auto" style={{ width: 320, height: 280 }}>
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 280" fill="none">
          <defs>
            {nodes.map((n, i) => (
              <linearGradient key={i} id={`cg${i}`} x1={160} y1={140} x2={n.x * 3.2} y2={n.y * 2.8} gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stopColor="white" stopOpacity="0.35" />
                <stop offset="100%" stopColor="white" stopOpacity="0.04" />
              </linearGradient>
            ))}
          </defs>
          {nodes.map((n, i) => (
            <line key={n.name} x1={160} y1={140} x2={n.x * 3.2} y2={n.y * 2.8}
              stroke={`url(#cg${i})`} strokeWidth="1.2" strokeDasharray="300"
              style={{ animation: `obDrawLine 0.9s ${0.08 + i * 0.12}s both` }} />
          ))}
          <line x1={160} y1={28}  x2={262} y2={101} stroke="rgba(255,255,255,0.07)" strokeWidth="0.8" strokeDasharray="200" style={{ animation: 'obDrawLine 1s 0.8s both' }} />
          <line x1={237} y1={207} x2={83}  y2={213} stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" strokeDasharray="200" style={{ animation: 'obDrawLine 1s 0.9s both' }} />
        </svg>
        <div className="absolute" style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }}>
          <div className="flex flex-col items-center">
            <div className="flex h-[68px] w-[68px] items-center justify-center rounded-[20px] border-2 border-white/[0.20] bg-white/[0.08] font-black text-white text-sm"
              style={{ boxShadow: '0 0 0 6px rgba(255,255,255,0.03),0 0 40px rgba(255,255,255,0.08)', animation: 'obNodePulse 3s ease-in-out infinite' }}>
              You
            </div>
            <div className="mt-1 text-[9px] text-white/28 font-medium">Your hub</div>
          </div>
        </div>
        {nodes.map((n, i) => (
          <div key={n.name} className="absolute flex flex-col items-center"
            style={{ left: `${n.x}%`, top: `${n.y}%`, transform: 'translate(-50%,-50%)', animation: `obScaleIn 0.4s ${0.12 + i * 0.10}s both` }}>
            <div className="flex items-center justify-center rounded-[14px] border border-white/[0.10] bg-white/[0.05] font-bold text-white/55"
              style={{ width: n.size, height: n.size, fontSize: n.size * 0.28 }}>
              {n.init}
            </div>
            <div className="mt-0.5 text-center">
              <div className="text-[8px] font-semibold text-white/35">{n.name}</div>
              <div className="text-[7.5px] text-white/20 max-w-[60px] truncate">{n.role}</div>
            </div>
          </div>
        ))}
        <div className="absolute right-0 top-4 rounded-full bg-white px-3 py-1 text-[9px] font-black text-[#050508]"
          style={{ boxShadow: '0 0 16px rgba(255,255,255,0.20)', animation: 'obBidPop 0.5s 1.1s both' }}>
          ✓ Following
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2.5" style={{ animation: 'obSlideUp 0.5s 1.0s both' }}>
        {[['2.4k','Followers'],['340','Following'],['89%','Reach rate']].map(([v, l]) => (
          <div key={l} className="rounded-[14px] border border-white/[0.06] bg-white/[0.03] p-3 text-center">
            <div className="text-[18px] font-black text-white">{v}</div>
            <div className="text-[9px] text-white/25 font-medium mt-0.5">{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GigsLeftPanel() {
  const gigs = [
    { cat:'Design',      title:'Brand identity redesign for Series A startup', budget:'₹40k–₹80k', bids:8,  skills:['Figma','Branding'], float:'obCardFloat1', d:'0.10s' },
    { cat:'Engineering', title:'Full-stack SaaS MVP — Next.js + Supabase',      budget:'₹1.2L–₹2L', bids:12, skills:['React','Node.js'],  float:'obCardFloat2', d:'0.22s' },
    { cat:'Marketing',   title:'GTM strategy and SEO content for fintech',     budget:'₹25k–₹45k', bids:5,  skills:['SEO','Content'],    float:'obCardFloat3', d:'0.34s' },
  ];
  return (
    <div className="flex flex-col justify-center h-full w-full max-w-lg mx-auto p-10 xl:p-14 select-none">
      <div className="mb-5 flex items-start justify-between" style={{ animation: 'obSlideUp 0.5s both' }}>
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">
            <div className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: '#D4AF37' }} />
            Gig Board
          </div>
          <h3 className="mt-3 text-[2rem] font-black text-white leading-[1.1] tracking-tight">
            25 new gigs<br />
            <Highlight delay="0.55s">posted today.</Highlight>
          </h3>
        </div>
        <div className="flex flex-col items-end rounded-[16px] border border-white/[0.07] bg-white/[0.03] p-3.5">
          <span className="text-[22px] font-black text-white">₹4.2L</span>
          <span className="text-[9px] text-white/28 font-medium mt-0.5">avg budget</span>
        </div>
      </div>
      <div className="space-y-3">
        {gigs.map((g, idx) => (
          <div key={g.title}
            className="relative overflow-hidden rounded-[18px] border border-white/[0.06] bg-white/[0.025] p-4"
            style={{ animation: `obSlideUp 0.5s ${g.d} both, ${g.float} ${5.5 + idx * 0.9}s ${idx * 0.5}s ease-in-out infinite` }}>
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-white/20 via-white/06 to-transparent" />
            <div className="mb-2.5 flex items-center justify-between">
              <span className="rounded-[8px] border border-white/[0.08] bg-white/[0.06] px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white/40">{g.cat}</span>
              <span className="text-[13px] font-black text-white/60">{g.budget}</span>
            </div>
            <p className="mb-3 text-[13px] font-semibold leading-snug text-white/72 line-clamp-1">{g.title}</p>
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {g.skills.map(s => (
                  <span key={s} className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[9px] font-medium text-white/32">{s}</span>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex -space-x-1">
                  {Array.from({ length: Math.min(g.bids, 4) }).map((_, i) => (
                    <div key={i} className="flex h-5 w-5 items-center justify-center rounded-full border border-[#050508] bg-white/[0.12] font-bold text-[7px] text-white/55">{String.fromCharCode(65 + i)}</div>
                  ))}
                </div>
                <span className="text-[10px] text-white/25 font-medium">{g.bids} bids</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3 overflow-hidden rounded-[14px] border border-white/[0.07] bg-white/[0.025] px-4 py-3"
        style={{ animation: 'obNotifSlide 5s 1.2s ease-in-out infinite' }}>
        <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.05] font-bold text-white/50">K</div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-white/72">Kavya S. placed a bid</p>
          <p className="text-[10px] text-white/28">Brand identity redesign · ₹62k</p>
        </div>
        <span className="shrink-0 rounded-full border border-white/[0.10] bg-white/[0.06] px-2 py-0.5 text-[9px] font-black text-white/50">new</span>
      </div>
    </div>
  );
}

function AuthLeftPanel({ screen, headline, bio }: { screen: number; headline: string; bio: string }) {
  const testimonials = [
    { text:'Docrud helped me land three freelance clients in my first week. The gig system is brilliant.', name:'Rohan Mehta',     role:'Full-stack Developer' },
    { text:'I published my portfolio and got 2,400 views in 48 hours. No other platform comes close.',    name:'Ananya Krishnan', role:'Product Designer'     },
    { text:'We hired our entire design team through Docrud gigs. Fast, professional, and stress-free.',   name:'Siddharth Joshi', role:'Founder, SaaSify'      },
  ];
  const t = testimonials[screen % testimonials.length];
  const strength = headline ? (bio ? 65 : 40) : 20;
  return (
    <div className="flex flex-col justify-between h-full w-full p-12 xl:p-16 select-none">
      <div className="flex items-center gap-3" style={{ animation: 'obFadeIn 0.5s both' }}>
        <div className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-white/[0.12] bg-white/[0.06]"
          style={{ boxShadow: '0 0 20px rgba(255,255,255,0.06),inset 0 1px 0 rgba(255,255,255,0.10)' }}>
          <svg viewBox="0 0 32 32" className="h-5 w-5" fill="none" stroke="white" strokeWidth="1.8">
            <path d="M6 4h12l8 8v16H6V4z" /><path d="M18 4v8h8" /><path d="M10 16h12M10 20h8" />
          </svg>
        </div>
        <span className="text-base font-black text-white">Docrud</span>
      </div>
      <div style={{ animation: 'obSlideUp 0.6s 0.1s both' }}>
        <div className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-white/18">Your profile — building…</div>
        <div className="overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.025]">
          <div className="h-16 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.06) 0%,rgba(212,175,55,0.05) 60%,rgba(255,255,255,0.02) 100%)' }}>
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0D0D0F]/40" />
          </div>
          <div className="px-5 pb-5 -mt-7">
            <div className="mb-3 flex items-end gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] border-2 border-[#0D0D0F] bg-white/[0.08] font-black text-xl text-white/60">
                {initials(headline || 'D')}
              </div>
              <div className="mb-1 min-w-0 flex-1">
                <div className={`text-[15px] font-bold text-white transition-all duration-500 ${headline ? 'opacity-100' : 'opacity-20'}`}>{headline || 'Your name here'}</div>
                <div className={`mt-0.5 text-[11px] text-white/38 transition-all duration-500 ${bio ? 'opacity-100' : 'opacity-20'}`}>{bio ? bio.slice(0, 52) + (bio.length > 52 ? '…' : '') : 'Your headline here'}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center mb-4">
              {[['0','Published'],['0','Followers'],['0','Following']].map(([v, l]) => (
                <div key={l} className="rounded-[10px] bg-white/[0.03] py-2">
                  <div className="text-[15px] font-black text-white/22">{v}</div>
                  <div className="text-[9px] text-white/16 mt-0.5">{l}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[10px]">
                <span className="text-white/22 font-medium">Profile strength</span>
                <span className="font-black text-white/45">{strength}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${strength}%`, background: GOLD_GRAD }} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm" style={{ animation: 'obSlideUp 0.6s 0.25s both' }}>
        <div className="mb-2 flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <svg key={i} className="h-3 w-3" fill="#6366f1" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] italic leading-relaxed text-white/45">&ldquo;{t.text}&rdquo;</p>
        <div className="mt-3 flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.07] font-bold text-[9px] text-white/55">{t.name[0]}</div>
          <div>
            <p className="text-[11px] font-bold text-white/55">{t.name}</p>
            <p className="text-[10px] text-white/28">{t.role}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PROFILE SLIDER — live animated marquee of recent joins
═══════════════════════════════════════════════════════════════ */
const JOINED_TIMES = ['1m ago','2m ago','5m ago','9m ago','14m ago','21m ago','33m ago','47m ago','1h ago','1h 20m ago','2h ago','3h ago','4h ago','5h ago','7h ago','9h ago'];

function ProfileSlider({ speed = 38, compact = false, rows = 2 }: { speed?: number; compact?: boolean; rows?: number }) {
  const ALL = [...SPLASH_PROFILES_TOP, ...SPLASH_PROFILES_BTM] as Array<{ init:string; name:string; title:string; avail:string; availColor:string; rating:number; avatarGrad:string }>;
  const cardW = compact ? 148 : 162;
  const gap = compact ? 7 : 8;

  function renderRow(dir: 'left' | 'right', offset: number, rowSpeed: number) {
    const shifted = [...ALL.slice(offset), ...ALL.slice(0, offset)];
    const doubled = [...shifted, ...shifted];
    const anim = dir === 'left' ? `splashMarqueeL ${rowSpeed}s linear infinite` : `splashMarqueeR ${rowSpeed}s linear infinite`;
    return (
      <div style={{ display: 'flex', gap, animation: anim, width: 'max-content' }}>
        {doubled.map((p, i) => (
          <div key={i} style={{
            flexShrink: 0, width: cardW,
            borderRadius: 13,
            border: '1px solid rgba(255,255,255,0.05)',
            background: 'rgba(255,255,255,0.016)',
            padding: compact ? '9px 10px' : '10px 11px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
              <div style={{
                flexShrink: 0, width: compact ? 26 : 30, height: compact ? 26 : 30,
                borderRadius: 8, background: `linear-gradient(${p.avatarGrad})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: compact ? 9 : 10, fontWeight: 900, color: 'white',
              }}>{p.init}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: compact ? 9.5 : 10.5, fontWeight: 800, color: 'rgba(255,255,255,0.70)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{p.name}</p>
                <p style={{ fontSize: compact ? 8 : 8.5, color: 'rgba(255,255,255,0.25)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{p.title}</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
              <span style={{
                fontSize: 7, fontWeight: 700, borderRadius: 99, padding: '2px 5px',
                color: p.availColor,
                background: `${p.availColor}18`,
                border: `1px solid ${p.availColor}28`,
                whiteSpace: 'nowrap', display: 'block',
              }}>{p.avail}</span>
              <span style={{ fontSize: 8, color: 'rgba(232,204,122,0.58)', fontWeight: 700, flexShrink: 0 }}>★ {p.rating}</span>
            </div>
            <p style={{ fontSize: 7, color: 'rgba(255,255,255,0.15)', marginTop: 5, marginBottom: 0 }}>
              Joined {JOINED_TIMES[(i + offset) % JOINED_TIMES.length]}
            </p>
          </div>
        ))}
      </div>
    );
  }

  const rowConfigs: Array<{ dir: 'left' | 'right'; offset: number; speedMult: number }> = [
    { dir: 'left',  offset: 0,  speedMult: 1     },
    { dir: 'right', offset: 5,  speedMult: 1.18  },
    { dir: 'left',  offset: 10, speedMult: 0.88  },
  ];

  return (
    <div className="relative overflow-hidden flex flex-col gap-2"
      style={{
        maskImage: 'linear-gradient(to right,transparent,black 9%,black 91%,transparent)',
        WebkitMaskImage: 'linear-gradient(to right,transparent,black 9%,black 91%,transparent)',
      }}>
      {rowConfigs.slice(0, rows).map((cfg, ri) => (
        <div key={ri} className="overflow-hidden">
          {renderRow(cfg.dir, cfg.offset, speed * cfg.speedMult)}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SIGNUP LEFT PANEL — animated live profile-build preview
═══════════════════════════════════════════════════════════════ */
function SignupLeftPanel({ name, email }: { name: string; email: string }) {
  const displayName  = name.trim()  || 'Your Name';
  const displayEmail = email.trim() || 'you@example.com';
  const hasName  = name.trim().length > 0;
  const hasEmail = email.trim().length > 0;
  const completion = hasName && hasEmail ? 72 : hasName ? 44 : hasEmail ? 32 : 18;

  const DEMO_SKILLS = ['Product Design', 'Figma', 'UX Research', 'Prototyping'];

  return (
    <div className="flex h-full w-full flex-col p-10 xl:p-14 select-none">

      {/* Centre — animated profile preview */}
      <div className="flex-1 flex flex-col justify-center" style={{ animation: 'obSlideUp 0.6s 0.1s both' }}>

        {/* Section divider */}
        <div className="mb-3.5 flex items-center gap-3">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/[0.05]" />
          <span className="text-[8px] font-bold uppercase tracking-[0.32em] text-white/18">Profile preview</span>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/[0.05]" />
        </div>

        {/* Profile card */}
        <div className="relative overflow-hidden rounded-[22px] border border-white/[0.07]"
          style={{ background: 'linear-gradient(160deg,rgba(255,255,255,0.025) 0%,rgba(255,255,255,0.008) 100%)', boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.018)' }}>

          {/* Cover */}
          <div className="relative h-[80px] overflow-hidden"
            style={{ background: 'linear-gradient(135deg,rgba(201,168,76,0.10) 0%,rgba(100,60,200,0.05) 55%,rgba(20,100,200,0.04) 100%)' }}>
            <div className="absolute inset-0 opacity-[0.025]"
              style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)', backgroundSize: '20px 20px' }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom,transparent 20%,rgba(8,8,13,0.97) 100%)' }} />
            {[{l:'9%',t:'24%',d:'0s'},{l:'68%',t:'32%',d:'0.5s'},{l:'40%',t:'60%',d:'1s'},{l:'84%',t:'16%',d:'1.6s'}].map((p,i)=>(
              <div key={i} className="absolute h-0.5 w-0.5 rounded-full bg-white/20"
                style={{ left:p.l, top:p.t, animation:`obParticle ${3.5+i*0.55}s ease-in-out infinite ${p.d}` }} />
            ))}
          </div>

          <div className="px-4 pb-4 -mt-9">
            {/* Avatar + badges */}
            <div className="mb-3 flex items-end justify-between">
              <div className="relative shrink-0">
                <div className="absolute inset-[-4px] rounded-[18px] border border-white/[0.10]"
                  style={{ animation: 'splashPulse 3.5s ease-out infinite' }} />
                <div className="flex h-[48px] w-[48px] items-center justify-center rounded-[14px] border-2 border-[#08080d] font-black text-[17px] text-white/85 transition-all duration-500"
                  style={{ background: hasName ? 'linear-gradient(135deg,rgba(201,168,76,0.32),rgba(150,100,40,0.16))' : 'rgba(255,255,255,0.03)' }}>
                  {hasName ? initials(name) : <span className="text-white/12">?</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 pb-0.5">
                <div className="flex items-center gap-1 rounded-full border border-emerald-500/15 bg-emerald-500/[0.05] px-1.5 py-0.5">
                  <div className="h-1 w-1 rounded-full bg-emerald-400/70" />
                  <span className="text-[7px] font-bold uppercase tracking-[0.12em] text-emerald-400/55">Active</span>
                </div>
                <div className="flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5">
                  <Shield className="h-2 w-2 text-white/25" />
                  <span className="text-[7px] font-bold uppercase tracking-[0.12em] text-white/25">Verified</span>
                </div>
              </div>
            </div>

            {/* Name & email */}
            <div className="mb-3">
              <p className="text-[14px] font-black tracking-[-0.02em] text-white/75 transition-all duration-400"
                style={{ opacity: hasName ? 1 : 0.15 }}>
                {displayName}
              </p>
              <p className="mt-0.5 text-[10px] text-white/28 transition-all duration-400"
                style={{ opacity: hasEmail ? 1 : 0.15 }}>
                {hasEmail ? displayEmail.replace(/(.{5}).+(@.+)/, '$1…$2') : 'email@example.com'}
              </p>
            </div>

            {/* Skill pills */}
            <div className="mb-3 flex flex-wrap gap-1">
              {DEMO_SKILLS.map((s, i) => (
                <span key={s} style={{ animation: `obFadeIn 0.4s ${0.5 + i * 0.12}s both`, opacity: 0 }}
                  className="rounded-full border border-white/[0.05] bg-white/[0.025] px-2 py-[3px] text-[8.5px] font-medium text-white/25">
                  {s}
                </span>
              ))}
            </div>

            {/* Profile strength */}
            <div className="rounded-[10px] border border-white/[0.05] bg-white/[0.015] p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[8.5px] font-bold uppercase tracking-[0.18em] text-white/18">Profile strength</span>
                <span className="text-[11px] font-black" style={{ color: 'rgba(165,180,252,0.72)' }}>{completion}%</span>
              </div>
              <div className="h-[2px] overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${completion}%`, background: 'linear-gradient(90deg,#4f46e5,#818cf8,#4f46e5)' }} />
              </div>
              <p className="mt-1.5 text-[8px] text-white/15 leading-[1.5]">Complete to unlock AI job matching &amp; gig visibility</p>
            </div>
          </div>
        </div>

        {/* Live profile slider */}
        <div className="mt-3.5" style={{ animation: 'obFadeIn 0.5s 0.7s both', opacity: 0 }}>
          <div className="mb-2 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400/60" style={{ animation: 'obPulse 2s ease-in-out infinite' }} />
            <span className="text-[8px] font-bold uppercase tracking-[0.26em] text-white/20">Recently joined</span>
            <span className="ml-auto rounded-full border border-white/[0.05] bg-white/[0.02] px-2 py-px text-[7.5px] font-bold text-white/18">Live</span>
          </div>
          <ProfileSlider speed={55} />
        </div>
      </div>

    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   OTP FEED DATA  (module-level so mobile form can also use it)
═══════════════════════════════════════════════════════════════ */
type FeedItem = { Icon: React.ElementType; user: string; action: string; subject: string; time: string; tag: string; color: string; avatar: string };
const OTP_FEED: FeedItem[] = [
  { Icon: FileText,      user: 'Ananya K.',  action: 'published',     subject: 'UX Portfolio 2025',        time: '1m ago',  tag: 'Published', color: '#a78bfa', avatar: 'https://randomuser.me/api/portraits/women/10.jpg' },
  { Icon: Zap,           user: 'Vikram S.',  action: 'posted a gig',  subject: 'Cloud Architect · Remote', time: '3m ago',  tag: 'Gig',       color: '#60a5fa', avatar: 'https://randomuser.me/api/portraits/men/22.jpg'   },
  { Icon: FileSignature, user: 'Nisha K.',   action: 'e-signed',      subject: 'NDA Agreement',            time: '5m ago',  tag: 'E-Signed',  color: '#34d399', avatar: 'https://randomuser.me/api/portraits/women/44.jpg' },
  { Icon: Users,         user: 'Priya N.',   action: 'hired',         subject: 'Content Writer',           time: '7m ago',  tag: 'Hired',     color: '#fbbf24', avatar: 'https://randomuser.me/api/portraits/women/63.jpg' },
  { Icon: FileText,      user: 'Rohan M.',   action: 'published',     subject: 'ML Research Paper',        time: '9m ago',  tag: 'Published', color: '#f472b6', avatar: 'https://randomuser.me/api/portraits/men/55.jpg'   },
  { Icon: Zap,           user: 'Elena P.',   action: 'completed gig', subject: 'DevOps Infrastructure',   time: '12m ago', tag: 'Gig',       color: '#22d3ee', avatar: 'https://randomuser.me/api/portraits/women/73.jpg' },
  { Icon: FileSignature, user: 'James R.',   action: 'e-signed',      subject: 'Service Agreement',        time: '14m ago', tag: 'E-Signed',  color: '#34d399', avatar: 'https://randomuser.me/api/portraits/men/12.jpg'   },
  { Icon: FileText,      user: 'Sofia C.',   action: 'published',     subject: 'UX Research Report',       time: '18m ago', tag: 'Published', color: '#a78bfa', avatar: 'https://randomuser.me/api/portraits/women/82.jpg' },
  { Icon: Zap,           user: 'Kenji Y.',   action: 'posted a gig',  subject: 'iOS Engineer · Contract',  time: '22m ago', tag: 'Gig',       color: '#60a5fa', avatar: 'https://randomuser.me/api/portraits/men/42.jpg'   },
  { Icon: Users,         user: 'Amara O.',   action: 'hired',         subject: 'Growth Marketer',          time: '25m ago', tag: 'Hired',     color: '#fb923c', avatar: 'https://randomuser.me/api/portraits/women/34.jpg' },
  { Icon: FileText,      user: 'Meera I.',   action: 'published',     subject: 'Brand Identity Kit',       time: '28m ago', tag: 'Published', color: '#e879f9', avatar: 'https://randomuser.me/api/portraits/women/91.jpg' },
  { Icon: FileSignature, user: 'Aryan T.',   action: 'e-signed',      subject: 'Freelance Contract',       time: '31m ago', tag: 'E-Signed',  color: '#34d399', avatar: 'https://randomuser.me/api/portraits/men/77.jpg'   },
];

/* ═══════════════════════════════════════════════════════════════
   OTP LEFT PANEL
═══════════════════════════════════════════════════════════════ */
function OtpLeftPanel({ email }: { email: string }) {
  const displayEmail = email || 'your email';

  const FEED = OTP_FEED;
  const doubled = [...FEED, ...FEED];

  return (
    <div className="flex h-full w-full flex-col p-10 xl:p-14 gap-6 select-none">
      <style>{`@keyframes feedScrollUp{0%{transform:translateY(0)}100%{transform:translateY(-50%)}}`}</style>

      {/* Centre */}
      <div className="flex-1 min-h-0 flex flex-col" style={{ animation: 'obSlideUp 0.6s 0.1s both' }}>

        {/* Live feed label */}
        <div className="mb-2.5 flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400/60" style={{ animation: 'obPulse 2s ease-in-out infinite' }} />
          <span className="text-[8px] font-bold uppercase tracking-[0.3em] text-white/20">Live activity</span>
          <div className="h-px flex-1 bg-white/[0.05]" />
          <span className="rounded-full border border-white/[0.05] bg-white/[0.015] px-2 py-px text-[7px] font-bold text-white/15">Real-time</span>
        </div>

        {/* Upward scrolling feed */}
        <div className="relative flex-1 min-h-0 overflow-hidden rounded-[18px] border border-white/[0.06] bg-white/[0.012]"
          style={{
            maskImage: 'linear-gradient(to bottom,transparent,black 10%,black 90%,transparent)',
            WebkitMaskImage: 'linear-gradient(to bottom,transparent,black 10%,black 90%,transparent)',
          }}>
          <div style={{ animation: 'feedScrollUp 26s linear infinite', display: 'flex', flexDirection: 'column' }}>
            {doubled.map((item, i) => (
              <div key={i} style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                {/* Real photo avatar */}
                <img
                  src={item.avatar}
                  alt={item.user}
                  style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 10, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.10)' }}
                />
                {/* Text */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 10.5, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <span style={{ fontWeight: 800, color: 'rgba(255,255,255,0.72)' }}>{item.user}</span>
                    <span style={{ fontWeight: 500, color: 'rgba(255,255,255,0.30)', marginLeft: 4 }}>{item.action}</span>
                  </p>
                  <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.26)', margin: 0, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.subject}
                  </p>
                </div>
                {/* Tag + time */}
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <span style={{
                    display: 'block', fontSize: 7, fontWeight: 700, borderRadius: 99, padding: '2px 6px', marginBottom: 3,
                    color: item.color, background: `${item.color}18`, border: `1px solid ${item.color}28`,
                  }}>{item.tag}</span>
                  <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.18)' }}>{item.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   GO LEFT PANEL — referral earn-free animated diagram
═══════════════════════════════════════════════════════════════ */
function GoLeftPanel() {
  const benefits = [
    {
      title: 'Business Pages',
      desc: 'Create a full business presence with products, jobs & reviews',
      icon: (
        <svg className="h-[18px] w-[18px] text-indigo-300/85" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      title: 'Unlimited Services',
      desc: 'List as many services as you want — free is limited to 2',
      icon: (
        <svg className="h-[18px] w-[18px] text-indigo-300/85" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      title: 'Direct Messaging',
      desc: 'Chat with professionals, clients and collaborators',
      icon: (
        <svg className="h-[18px] w-[18px] text-indigo-300/85" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      ),
    },
    {
      title: 'Public Face Badge',
      desc: 'Apply for verified creator status on the platform',
      icon: (
        <svg className="h-[18px] w-[18px] text-indigo-300/85" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      ),
    },
    {
      title: 'E-Sign Documents',
      desc: 'Send contracts for OTP-verified e-signature',
      icon: (
        <svg className="h-[18px] w-[18px] text-indigo-300/85" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      ),
    },
    {
      title: '5 GB Drive Storage',
      desc: 'Free cloud storage for files, documents and media',
      icon: (
        <svg className="h-[18px] w-[18px] text-indigo-300/85" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex h-full w-full flex-col justify-between p-10 xl:p-14 select-none">
      <style>{`
        @keyframes goNodeIn {
          0%   { opacity: 0; transform: translateX(-14px); }
          100% { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {/* Top — eyebrow + headline */}
      <div style={{ animation: 'obFadeIn 0.5s both' }}>
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1"
          style={{ background: 'rgba(99,102,241,0.07)', borderColor: 'rgba(99,102,241,0.22)' }}>
          <div className="h-1.5 w-1.5 rounded-full" style={{ background: '#818cf8', animation: 'obPulse 2s infinite' }} />
          <span className="text-[9.5px] font-bold uppercase tracking-[0.24em]" style={{ color: 'rgba(165,180,252,0.75)' }}>Pro Access</span>
        </div>
        <h3 className="mt-2 text-[1.65rem] font-black tracking-[-0.04em] text-white leading-[1.15]"
          style={{ animation: 'obSlideUp 0.5s 0.1s both', opacity: 0 }}>
          Everything unlocked<br />with Infinity ∞
        </h3>
        <p className="mt-2 text-[12px] text-white/38 leading-relaxed"
          style={{ animation: 'obSlideUp 0.5s 0.18s both', opacity: 0 }}>
          One subscription. Business pages, messaging, e-sign, public face — all yours.
        </p>
      </div>

      {/* Benefits list */}
      <div className="space-y-3">
        {benefits.map(({ icon, title, desc }, i) => (
          <div key={title}
            style={{ animation: `goNodeIn 0.5s ${0.28 + i * 0.10}s both`, opacity: 0 }}
            className="flex items-center gap-3.5 rounded-[14px] border border-white/[0.07] bg-white/[0.025] px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
              style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.22),rgba(99,102,241,0.08))', border: '1px solid rgba(99,102,241,0.22)' }}>
              {icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-black text-white/88">{title}</p>
              <p className="text-[10px] text-white/32 mt-0.5 leading-snug">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom — social proof */}
      <div style={{ animation: 'obFadeIn 0.6s 0.7s both', opacity: 0 }}
        className="flex items-center gap-3.5 rounded-[14px] border border-white/[0.05] bg-white/[0.015] px-4 py-3.5">
        <div className="flex shrink-0 -space-x-1.5">
          {[['K','#6366f1'],['R','#7c3aed'],['A','#0ea5e9'],['S','#10b981'],['M','#f59e0b']].map(([init, bg]) => (
            <div key={init} className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#06060f] text-[7.5px] font-black text-white"
              style={{ background: bg }}>{init}</div>
          ))}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-black text-white/65">2,800+ professionals upgraded</p>
          <p className="text-[9px] text-white/28 mt-0.5">this month alone</p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PROFILE LEFT PANEL — live profile card preview
═══════════════════════════════════════════════════════════════ */
const DOCRUD_FEATURES = [
  { icon: Network,       label: 'Professional\nConnections', color: '#60a5fa' },
  { icon: Zap,           label: 'Gigs &\nFreelance',         color: '#34d399' },
  { icon: Briefcase,     label: 'Jobs &\nOpportunities',     color: '#a78bfa' },
  { icon: Rss,           label: 'Daily\nFeed',               color: '#fb923c' },
  { icon: FileText,      label: 'Doc\nEditor',               color: '#f472b6' },
  { icon: Table2,        label: '.xlsx /\n.csv Editor',      color: '#22d3ee' },
  { icon: PenLine,       label: 'Scratch-\npad',             color: '#fbbf24' },
  { icon: Bot,           label: 'AI Doc\nGen',               color: '#818cf8' },
  { icon: FileSignature, label: 'E-Sign\nStudio',            color: '#4ade80' },
  { icon: Layers,        label: 'PDF\nTools',                color: '#fb7185' },
] as const;

/* Shared feature grid used in both desktop left-panel and mobile in-form strip */
function DocrudFeatureGrid({ staggerBase = 0.18, compact = false }: { staggerBase?: number; compact?: boolean }) {
  return (
    <div className={`grid grid-cols-5 ${compact ? 'gap-2' : 'gap-2.5'}`}>
      {DOCRUD_FEATURES.map(({ icon: Icon, label, color }, i) => {
        const floatDur = 3.8 + i * 0.28;
        const floatDelay = staggerBase + 0.55 + i * 0.09;
        return (
          <div key={label}
            style={{ animation: `obFloat ${floatDur}s ease-in-out infinite ${floatDelay}s` }}>
            <div
              style={{
                animation: `obScaleIn 0.32s ${staggerBase + i * 0.042}s both`,
                opacity: 0,
                background: `linear-gradient(145deg, ${color}12 0%, ${color}05 55%, rgba(255,255,255,0.015) 100%)`,
                border: `1px solid ${color}20`,
                boxShadow: `0 4px 18px ${color}14, 0 1px 0 rgba(255,255,255,0.06) inset, 0 -1px 0 rgba(0,0,0,0.25) inset`,
              }}
              className={`group flex flex-col items-center justify-center gap-2 rounded-[14px] cursor-default select-none transition-all duration-300 hover:scale-[1.06] ${compact ? 'py-2.5 px-0.5' : 'py-3 px-1'}`}
            >
              <div
                className="flex shrink-0 items-center justify-center rounded-[9px] transition-all duration-300 group-hover:scale-110 group-hover:brightness-125"
                style={{
                  width: compact ? 26 : 30, height: compact ? 26 : 30,
                  background: `radial-gradient(circle at 35% 35%, ${color}35 0%, ${color}12 60%, transparent 100%)`,
                  boxShadow: `0 0 10px ${color}28`,
                }}
              >
                <Icon style={{ color, width: compact ? 12 : 14, height: compact ? 12 : 14 }} />
              </div>
              <span
                className="whitespace-pre-line text-center font-semibold leading-[1.3] text-white/55 group-hover:text-white/85 transition-colors duration-200"
                style={{ fontSize: compact ? '8px' : '9px' }}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProfileLeftPanel({ name, headline, bio, location, avatarUrl, bannerUrl, openToWork, skills }: {
  name: string; headline: string; bio: string; location: string;
  avatarUrl: string; bannerUrl: string; openToWork: boolean; skills: string[];
}) {
  const displayName = name.trim() || 'Your Name';

  const fields = [
    !!name.trim(), !!headline.trim(), !!bio.trim(),
    !!avatarUrl.trim(), !!bannerUrl.trim(), !!location.trim(), skills.length > 0,
  ];
  const filled    = fields.filter(Boolean).length;
  const completion      = Math.round((filled / fields.length) * 100);
  const completionColor = completion >= 70 ? '#34d399' : completion >= 40 ? '#a5b4fc' : 'rgba(255,255,255,0.45)';
  const completionGlow  = completion >= 70 ? 'rgba(52,211,153,0.25)' : completion >= 40 ? 'rgba(165,180,252,0.25)' : 'rgba(255,255,255,0.08)';
  const STEP_LABELS = ['Name','Headline','Bio','Avatar','Banner','Location','Skills'];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden p-7 xl:p-9 select-none gap-4 xl:gap-5">

      {/* Logo */}
      <div className="flex shrink-0 items-center gap-2.5" style={{ animation: 'obFadeIn 0.5s both' }}>
        <div className="flex h-8 w-8 items-center justify-center rounded-[11px]"
          style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.10) 0%,rgba(255,255,255,0.04) 100%)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 2px 12px rgba(0,0,0,0.4)' }}>
          <svg viewBox="0 0 32 32" className="h-3.5 w-3.5" fill="none" stroke="white" strokeWidth="1.8">
            <path d="M6 4h12l8 8v16H6V4z" /><path d="M18 4v8h8" /><path d="M10 16h12M10 20h8" />
          </svg>
        </div>
        <span className="text-[15px] font-black text-white tracking-tight">Docrud</span>
      </div>

      {/* ── Live profile preview card ── */}
      <div className="shrink-0" style={{ animation: 'obSlideUp 0.55s 0.08s both' }}>
        {/* Label row */}
        <div className="mb-2.5 flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2">
            <div className="relative flex h-2 w-2">
              <div className="absolute inset-0 rounded-full animate-ping" style={{ background: completionColor, opacity: 0.5 }} />
              <div className="relative rounded-full" style={{ background: completionColor, width: 8, height: 8 }} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">Live preview</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: 48, background: 'rgba(255,255,255,0.07)' }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${completion}%`, background: completionColor, boxShadow: `0 0 8px ${completionGlow}` }} />
            </div>
            <span className="text-[10px] font-black tabular-nums transition-colors duration-500" style={{ color: completionColor }}>{completion}%</span>
          </div>
        </div>

        {/* Card */}
        <div className="overflow-hidden rounded-[22px]"
          style={{
            background: 'linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)',
            border: '1px solid rgba(255,255,255,0.09)',
            boxShadow: `0 12px 40px rgba(0,0,0,0.60), 0 1px 0 rgba(255,255,255,0.06) inset, 0 0 0 1px rgba(0,0,0,0.3)`,
            backdropFilter: 'blur(12px)',
          }}>

          {/* Banner */}
          <div className="relative h-[68px] overflow-hidden">
            {bannerUrl
              ? <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
              : <>
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(125deg,rgba(201,168,76,0.20) 0%,rgba(99,102,241,0.14) 45%,rgba(236,72,153,0.10) 80%,rgba(14,165,233,0.08) 100%)' }} />
                  {/* Shimmer sweep */}
                  <div className="absolute inset-0 opacity-30" style={{ background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.10) 50%, transparent 65%)', animation: 'obShimmer 3.5s ease-in-out infinite' }} />
                  {[
                    {l:'8%',t:'22%',d:'0s'},{l:'52%',t:'16%',d:'0.6s'},{l:'75%',t:'58%',d:'1.1s'},{l:'31%',t:'70%',d:'0.4s'},{l:'88%',t:'32%',d:'1.7s'},
                  ].map((p,i) => (
                    <div key={i} className="absolute rounded-full bg-white/30"
                      style={{ left:p.l, top:p.t, width: i % 2 === 0 ? 2 : 1.5, height: i % 2 === 0 ? 2 : 1.5, animation:`obParticle ${3.2+i*0.55}s ease-in-out infinite ${p.d}` }} />
                  ))}
                </>
            }
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom,transparent 20%,rgba(8,8,14,0.90) 100%)' }} />
            {openToWork && (
              <div className="absolute bottom-2 right-2.5 flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 backdrop-blur-sm"
                style={{ animation:'obFadeIn 0.4s both', boxShadow: '0 2px 8px rgba(16,185,129,0.20)' }}>
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ animation: 'obPulse 2s infinite' }} />
                <span className="text-[8px] font-bold text-emerald-400">Open to Work</span>
              </div>
            )}
          </div>

          {/* Profile info */}
          <div className="px-4 pb-4 -mt-7">
            <div className="mb-3 flex items-end gap-3">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="h-12 w-12 overflow-hidden rounded-[14px]"
                  style={{ border: '2.5px solid rgba(8,8,14,1)', boxShadow: '0 4px 16px rgba(0,0,0,0.6)' }}>
                  {avatarUrl
                    ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    : <div className="flex h-full w-full items-center justify-center text-[13px] font-black text-white/80"
                        style={{ background: 'linear-gradient(135deg,rgba(201,168,76,0.30) 0%,rgba(99,102,241,0.25) 100%)' }}>
                        {initials(displayName)}
                      </div>
                  }
                </div>
                {/* Completion ring */}
                <svg className="absolute -inset-0.5 pointer-events-none" style={{ width: 54, height: 54 }} viewBox="0 0 54 54">
                  <circle cx="27" cy="27" r="25" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" />
                  <circle cx="27" cy="27" r="25" fill="none" stroke={completionColor} strokeWidth="1.5"
                    strokeDasharray={`${157 * completion / 100} 157`} strokeLinecap="round"
                    style={{ transformOrigin: '27px 27px', transform: 'rotate(-90deg)', transition: 'stroke-dasharray 0.6s ease, stroke 0.5s ease', opacity: 0.7 }} />
                </svg>
              </div>

              {/* Name + headline */}
              <div className="flex-1 min-w-0 pb-0.5">
                <p className="text-[14px] font-black leading-tight text-white truncate transition-all duration-400"
                  style={{ opacity: name.trim() ? 1 : 0.28, letterSpacing: '-0.01em' }}>{displayName}</p>
                <p className="mt-0.5 text-[10.5px] leading-snug text-white/45 truncate transition-all duration-400"
                  style={{ opacity: headline.trim() ? 1 : 0.25 }}>
                  {headline.trim() || 'Your headline will appear here'}
                </p>
                {location.trim() && (
                  <div className="mt-1 flex items-center gap-1" style={{ animation:'obFadeIn 0.3s both' }}>
                    <MapPin className="h-2.5 w-2.5 text-white/28 shrink-0" />
                    <span className="text-[9px] text-white/35 truncate">{location}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Skills */}
            {skills.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5" style={{ animation:'obFadeIn 0.3s both' }}>
                {skills.slice(0, 5).map(s => (
                  <span key={s} className="rounded-full border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-[8.5px] font-medium text-white/45">{s}</span>
                ))}
                {skills.length > 5 && <span className="text-[8.5px] text-white/25 self-center">+{skills.length - 5}</span>}
              </div>
            )}

            {/* Segmented strength bar */}
            <div>
              <div className="mb-1 flex gap-1">
                {STEP_LABELS.map((l, i) => (
                  <div key={l} title={l} className="h-[3.5px] flex-1 rounded-full transition-all duration-600"
                    style={{ background: fields[i] ? completionColor : 'rgba(255,255,255,0.07)', boxShadow: fields[i] ? `0 0 6px ${completionGlow}` : 'none' }} />
                ))}
              </div>
              <p className="text-[8px] text-white/25 font-medium">Profile strength · {completion}% complete</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Everything inside Docrud ── */}
      <div className="flex flex-1 flex-col min-h-0" style={{ animation: 'obSlideUp 0.55s 0.22s both' }}>
        {/* Section header */}
        <div className="mb-3 flex items-center gap-2.5">
          <div className="h-px flex-1" style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.10))' }} />
          <div className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1">
            <Sparkles className="h-2.5 w-2.5 text-white/35" />
            <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-white/40">Everything inside Docrud</span>
          </div>
          <div className="h-px flex-1" style={{ background: 'linear-gradient(to left, transparent, rgba(255,255,255,0.10))' }} />
        </div>

        <DocrudFeatureGrid staggerBase={0.22} />

        <p className="mt-2.5 text-center text-[8px] font-medium text-white/22 tracking-wide">
          Smart Forms · Portfolio · Resume ATS · Collaboration · and more
        </p>
      </div>
    </div>
  );
}

function LeftPanelSwitch({ screen, headline, bio, sName, sEmail, avatarUrl, bannerUrl, location, openToWork, skills }: {
  screen: number; headline: string; bio: string;
  sName?: string; sEmail?: string;
  avatarUrl?: string; bannerUrl?: string; location?: string;
  openToWork?: boolean; skills?: string[];
}) {
  if (screen === 0) return <HeroLeftPanel />;
  if (screen === 1) return <PublishLeftPanel />;
  if (screen === 2) return <ConnectLeftPanel />;
  if (screen === 3) return <GigsLeftPanel />;
  if (screen === SIGNUP_SCR) return <SignupLeftPanel name={sName ?? ''} email={sEmail ?? ''} />;
  if (screen === OTP_SCR)  return <OtpLeftPanel email={sEmail ?? ''} />;
  if (screen === PROFILE_SCR || screen === SKILLS_SCR || screen === PEOPLE_SCR) return (
    <ProfileLeftPanel
      name={sName ?? ''}
      headline={headline}
      bio={bio}
      location={location ?? ''}
      avatarUrl={avatarUrl ?? ''}
      bannerUrl={bannerUrl ?? ''}
      openToWork={openToWork ?? false}
      skills={skills ?? []}
    />
  );
  if (screen === DONE_SCR) return <GoLeftPanel />;
  return <AuthLeftPanel screen={screen} headline={headline} bio={bio} />;
}

/* ═══════════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════════ */
function OnboardingPageInner() {
  const { data: session, status, update: updateSession } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const skipSplash = searchParams?.get('start') === 'signup';
  const incomingRef = searchParams?.get('ref') ?? '';
  const [screen, setScreen] = useState(skipSplash ? SIGNUP_SCR : 0);
  const [showSplash, setShowSplash] = useState(!skipSplash);

  /* Individual ↔ Business account type. Chosen here, never trusted as the
     account type itself — that is written server-side by whichever signup route
     the chosen form posts to (/api/individual/signup vs /api/saas/signup). A
     bogus ?type= safely falls back to Individual. The choice lives in the URL so
     a refresh or shared link reopens in the same mode; ref/plan are preserved. */
  const [accountType, setAccountType] = useState<AccountKind>(
    normalizeAccountKind(searchParams?.get('type')),
  );
  /* A ref so the authenticated-redirect effect (registered once) never reads a
     stale value: while Business is active, BusinessSignupForm owns navigation
     after its own signup, so onboarding must not race it to '/'. */
  const accountTypeRef = useRef<AccountKind>(accountType);
  accountTypeRef.current = accountType;

  /* Google OAuth state. `googleBusy` blocks double-clicks and drives the button
     label. The OAuth round-trip returns to this page with ?oauth=return; until
     that return is resolved (matched → proceed, or mismatched → signed out) the
     normal authenticated-redirect below is paused so it can't bounce a
     wrong-type session onward. */
  const [googleBusy, setGoogleBusy] = useState(false);
  /* Bot-protection token for the individual signup POST (server-verified). */
  const [captchaToken, setCaptchaToken] = useState('');
  const oauthReturn = searchParams?.get('oauth') === 'return';
  const oauthReturnRef = useRef(oauthReturn);
  oauthReturnRef.current = oauthReturn;
  const oauthResolvedRef = useRef(false);

  const selectAccountType = useCallback((next: AccountKind) => {
    setAccountType(next);
    const params = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
    if (next === 'business') params.set('type', 'business');
    else params.delete('type');
    const qs = params.toString();
    router.replace(qs ? `/onboarding?${qs}` : '/onboarding', { scroll: false });
  }, [router, searchParams]);

  // Referral state
  const [referralCode, setReferralCode] = useState(incomingRef);
  const [referrer, setReferrer] = useState<{ name: string; headline?: string | null; avatarUrl?: string | null } | null>(null);
  const [referrerLoading, setReferrerLoading] = useState(!!incomingRef);

  const [sName,         setSName]         = useState('');
  const [sEmail,        setSEmail]        = useState('');
  const [sPass,         setSPass]         = useState('');
  const [showPass,      setShowPass]      = useState(false);
  const [sLoading,      setSLoading]      = useState(false);
  const [sError,        setSError]        = useState('');
  const [googleEnabled, setGoogleEnabled] = useState(false);

  const [otpDigits, setOtpDigits] = useState(['','','','','','']);
  const oRef0 = useRef<HTMLInputElement>(null);
  const oRef1 = useRef<HTMLInputElement>(null);
  const oRef2 = useRef<HTMLInputElement>(null);
  const oRef3 = useRef<HTMLInputElement>(null);
  const oRef4 = useRef<HTMLInputElement>(null);
  const oRef5 = useRef<HTMLInputElement>(null);
  const otpRefs = [oRef0, oRef1, oRef2, oRef3, oRef4, oRef5];
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);
  /* Track pending uploads so handleComplete can await them before saving */
  const pendingAvatarUploadRef = useRef<Promise<string | null>>(Promise.resolve(null));
  const pendingBannerUploadRef = useRef<Promise<string | null>>(Promise.resolve(null));

  const [otpSent,   setOtpSent]   = useState(false);
  const [otpError,  setOtpError]  = useState('');
  const [otpOk,     setOtpOk]     = useState(false);
  const [verifying, setVerifying] = useState(false);
  const otpVerifiedRef            = useRef(false); // ref so closures always see current value

  const [avatarUrl,       setAvatarUrl]       = useState('');
  const [bannerUrl,       setBannerUrl]       = useState('');
  /* Separate text-input state so typing / clearing the URL box never wipes an uploaded image */
  const [avatarUrlInput,  setAvatarUrlInput]  = useState('');
  const [bannerUrlInput,  setBannerUrlInput]  = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [resumeParsing,     setResumeParsing]     = useState(false);
  const [resumeParseErr,    setResumeParseErr]    = useState('');
  const [resumeFilled,      setResumeFilled]      = useState(false);
  const [resumeFilledFields, setResumeFilledFields] = useState<Set<string>>(new Set());
  const [profileLoaded,     setProfileLoaded]     = useState(false);
  const resumeFileRef = useRef<HTMLInputElement>(null);

  async function uploadImage(file: File, type: 'avatar' | 'banner'): Promise<string | null> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', type);
    try {
      const res = await fetch('/api/profile/upload-image', { method: 'POST', body: fd });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Upload failed');
      return data.url;
    } catch {
      return null;
    }
  }

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setAvatarUrl(preview);
    setAvatarUrlInput('');
    setAvatarUploading(true);
    const uploadPromise = uploadImage(file, 'avatar');
    pendingAvatarUploadRef.current = uploadPromise;
    const permanent = await uploadPromise;
    setAvatarUploading(false);
    if (permanent) {
      setAvatarUrl(permanent);
      URL.revokeObjectURL(preview);
      /* Persist immediately so user doesn't need to re-upload after onboarding */
      void fetch('/api/profile/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ avatarUrl: permanent }) });
    }
  }

  async function handleBannerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setBannerUrl(preview);
    setBannerUrlInput('');
    setBannerUploading(true);
    const uploadPromise = uploadImage(file, 'banner');
    pendingBannerUploadRef.current = uploadPromise;
    const permanent = await uploadPromise;
    setBannerUploading(false);
    if (permanent) {
      setBannerUrl(permanent);
      URL.revokeObjectURL(preview);
      void fetch('/api/profile/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bannerUrl: permanent }) });
    }
  }

  async function handleResumeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setResumeParsing(true);
    setResumeParseErr('');
    setResumeFilled(false);
    setResumeFilledFields(new Set());
    try {
      const fd = new FormData();
      fd.append('resume', file);
      const res = await fetch('/api/onboarding/parse-resume', { method: 'POST', body: fd });
      const data = await res.json() as {
        headline?: string | null; bio?: string | null; location?: string | null;
        website?: string | null; skills?: string[]; error?: string;
        experience?: Array<{ title: string; company: string; period: string; desc?: string }>;
        education?: Array<{ degree: string; school: string; year?: string }>;
      };
      if (!res.ok) { setResumeParseErr(data.error ?? 'Parse failed.'); return; }

      const filled = new Set<string>();
      const patch: Record<string, unknown> = {};

      if (data.headline) {
        setHeadline(data.headline.slice(0, 100));
        patch.headline = data.headline.slice(0, 100);
        filled.add('headline');
      }
      if (data.bio) {
        setBio(data.bio.slice(0, 500));
        patch.bio = data.bio.slice(0, 500);
        filled.add('bio');
      }
      if (data.location) {
        setLocation(data.location);
        patch.location = data.location;
        filled.add('location');
      }
      if (data.website) {
        setWebsite(data.website);
        patch.website = data.website;
        filled.add('website');
      }
      if (data.skills?.length) {
        setSkills(prev => {
          const seen = new Set(prev);
          const merged = [...prev, ...data.skills!.filter((s: string) => !seen.has(s))];
          return merged.slice(0, 20);
        });
        filled.add('skills');
      }
      if (data.experience?.length) {
        setExperience(data.experience);
        filled.add('experience');
      }
      if (data.education?.length) {
        setEducation(data.education);
        filled.add('education');
      }

      setResumeFilledFields(filled);
      setResumeFilled(true);

      // Persist immediately so data survives a page refresh
      if (Object.keys(patch).length > 0) {
        void fetch('/api/profile/me', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
      }
    } catch { setResumeParseErr('Something went wrong — try again.'); }
    finally { setResumeParsing(false); }
  }

  async function handleProfileContinue() {
    const [resolvedAvatar, resolvedBanner] = await Promise.all([
      pendingAvatarUploadRef.current,
      pendingBannerUploadRef.current,
    ]);
    const finalAvatarUrl = resolvedAvatar ?? (avatarUrl.startsWith('blob:') ? '' : avatarUrl);
    const finalBannerUrl = resolvedBanner ?? (bannerUrl.startsWith('blob:') ? '' : bannerUrl);
    void fetch('/api/profile/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        headline:    headline   || undefined,
        bio:         bio        || undefined,
        location:    location   || undefined,
        website:     website    || undefined,
        openToWork,
        skills:      skills.length ? skills : undefined,
        experience:  experience.length ? experience : undefined,
        education:   education.length  ? education  : undefined,
        avatarUrl:   finalAvatarUrl || undefined,
        bannerUrl:   finalBannerUrl || undefined,
      }),
    }).catch(() => { /* non-blocking: handleComplete will re-save images */ });
    next();
  }

  function applyAvatarUrlInput(val: string) {
    const trimmed = val.trim();
    if (trimmed) { setAvatarUrl(trimmed); setAvatarUrlInput(trimmed); }
  }
  function applyBannerUrlInput(val: string) {
    const trimmed = val.trim();
    if (trimmed) { setBannerUrl(trimmed); setBannerUrlInput(trimmed); }
  }
  const [headline,   setHeadline]   = useState('');
  const [bio,        setBio]        = useState('');
  const [location,   setLocation]   = useState('');
  const [website,    setWebsite]    = useState('');
  const [openToWork, setOpenToWork] = useState(false);

  const [skills,     setSkills]     = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [interests,  setInterests]  = useState<string[]>([]);
  const [experience, setExperience] = useState<Array<{ title: string; company: string; period: string; desc?: string }>>([]);
  const [education,  setEducation]  = useState<Array<{ degree: string; school: string; year?: string }>>([]);

  const [suggestions, setSuggestions] = useState<Array<{
    id: string; name: string; accountType?: string; docrudGo?: boolean;
    skillOverlap?: number; matchedSkills?: string[];
    profile: { headline?: string; avatarUrl?: string; bannerUrl?: string; location?: string; skills?: string[]; openToWork?: boolean };
    stats?: { followers: number; gigsCount: number };
    upraiseCount?: number;
  }>>([]);
  const [followed,    setFollowed]    = useState<string[]>([]);
  const [completing,  setCompleting]  = useState(false);

  /* Docrud Go offer state */
  type GoPhase = 'offer' | 'paying' | 'success' | 'skipped' | 'refer';
  const [goPhase,   setGoPhase]   = useState<GoPhase>('offer');
  const [goError,   setGoError]   = useState('');
  const [goStats,   setGoStats]   = useState<{ claimed: number; total: number; remaining: number; pct: number } | null>(null);

  /* Referral state */
  const [refLink,        setRefLink]        = useState('');
  const [refCode,        setRefCode]        = useState('');
  const [refLinkLoading, setRefLinkLoading] = useState(false);
  const [refCopied,      setRefCopied]      = useState(false);
  const [refInviteEmail, setRefInviteEmail] = useState('');
  const [refSending,     setRefSending]     = useState(false);
  const [refSentMsg,     setRefSentMsg]     = useState('');
  const [refSendErr,     setRefSendErr]     = useState('');

  const hasSignedUpInSession = useRef(false);

  /* Resolve a Google OAuth return: honour the chosen account type or reject a
     mismatch. Runs before the generic redirect below (which is paused while an
     OAuth return is unresolved), so a wrong-type session is never forwarded. */
  useEffect(() => {
    if (!oauthReturn || oauthResolvedRef.current) return;
    if (status !== 'authenticated') return;
    const intended = normalizeAccountKind(searchParams?.get('type'));
    const actual = session?.user?.accountType === 'business' ? 'business' : 'individual';
    if (actual !== intended) {
      /* Existing account is the other type — never converted server-side. Drop
         the session and tell the user to switch the toggle. */
      oauthResolvedRef.current = true;
      void signOut({ redirect: false }).then(() => {
        setAccountType(intended);
        setSError(actual === 'individual'
          ? 'This Google account is registered as an Individual account. Switch to Individual to continue.'
          : 'This Google account is registered as a Business account. Switch to Business to continue.');
        const qs = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
        qs.delete('oauth');
        router.replace(`/onboarding?${qs.toString()}`);
      });
      return;
    }
    /* Match — a real login/new account. Let the normal flow forward them. */
    oauthResolvedRef.current = true;
    hasSignedUpInSession.current = false;
    router.replace('/');
    router.refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oauthReturn, status]);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'authenticated') {
      if (hasSignedUpInSession.current) return;
      /* Pause while a Google OAuth return is still being resolved above. */
      if (oauthReturnRef.current && !oauthResolvedRef.current) return;
      /* Business signup manages its own post-auth redirect (to /welcome or
         /checkout); don't let onboarding race it to '/'. */
      if (accountTypeRef.current === 'business') return;
      // If the user is an individual with an unverified email, keep them on the
      // onboarding page and jump to the OTP step so they can verify.
      if (session?.user?.accountType === 'individual' && session?.user?.emailVerified === false) {
        setScreen(OTP_SCR);
        return;
      }
      router.replace('/');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session?.user?.emailVerified]);

  // Fetch Google auth availability
  useEffect(() => {
    let alive = true;
    fetch('/api/settings/auth')
      .then(r => r.json().catch(() => null))
      .then((p: { googleEnabled?: boolean } | null) => { if (alive) setGoogleEnabled(Boolean(p?.googleEnabled)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Fetch referrer info when a ref code is in the URL
  useEffect(() => {
    if (!incomingRef) return;
    setReferrerLoading(true);
    fetch(`/api/public/referrer?code=${encodeURIComponent(incomingRef)}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { name?: string; headline?: string | null; avatarUrl?: string | null } | null) => {
        if (d?.name) setReferrer({ name: d.name, headline: d.headline, avatarUrl: d.avatarUrl });
      })
      .catch(() => {})
      .finally(() => setReferrerLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (screen !== PEOPLE_SCR) return;
    const qs = new URLSearchParams();
    if (skills.length)    qs.set('skills',    skills.join(','));
    if (interests.length) qs.set('interests', interests.join(','));
    fetch(`/api/onboarding/suggest-people?${qs}`)
      .then(r => r.json())
      .then((d: { people?: typeof suggestions }) => { if (Array.isArray(d.people)) setSuggestions(d.people); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  useEffect(() => {
    if (screen !== OTP_SCR || otpSent) return;
    void sendOtp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  /* Fetch Go spot count when landing on DONE_SCR */
  useEffect(() => {
    if (screen !== DONE_SCR) return;
    fetch('/api/docrud-go/stats')
      .then(r => r.json())
      .then((d: { claimed?: number; total?: number; remaining?: number; pct?: number }) => {
        if (typeof d.claimed === 'number') {
          setGoStats({ claimed: d.claimed, total: d.total ?? 5000, remaining: d.remaining ?? 0, pct: d.pct ?? 0 });
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  /* Pre-load existing profile data so returning users see their saved info */
  useEffect(() => {
    if (status !== 'authenticated' || profileLoaded) return;
    fetch('/api/profile/me')
      .then(r => r.json())
      .then((d: { profile?: {
        headline?: string; bio?: string; location?: string; website?: string;
        openToWork?: boolean; avatarUrl?: string; bannerUrl?: string;
        skills?: string[]; interests?: string[];
        experience?: Array<{ title: string; company: string; period: string; desc?: string }>;
        education?: Array<{ degree: string; school: string; year?: string }>;
      } }) => {
        const p = d.profile;
        if (!p) return;
        if (p.headline)               setHeadline(p.headline);
        if (p.bio)                    setBio(p.bio);
        if (p.location)               setLocation(p.location);
        if (p.website)                setWebsite(p.website);
        if (p.openToWork !== undefined) setOpenToWork(p.openToWork);
        if (p.avatarUrl)              { setAvatarUrl(p.avatarUrl); setAvatarUrlInput(p.avatarUrl); }
        if (p.bannerUrl)              { setBannerUrl(p.bannerUrl); setBannerUrlInput(p.bannerUrl); }
        if (p.skills?.length)         setSkills(p.skills);
        if (p.interests?.length)      setInterests(p.interests);
        if (p.experience?.length)     setExperience(p.experience);
        if (p.education?.length)      setEducation(p.education);
      })
      .catch(() => {})
      .finally(() => setProfileLoaded(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, profileLoaded]);

  /* Load Razorpay checkout script once */
  useEffect(() => {
    const existing = document.getElementById('rzp-script');
    if (existing) return;
    const script = document.createElement('script');
    script.id  = 'rzp-script';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.head.appendChild(script);
  }, []);

  const next = useCallback(() => setScreen(s => {
    // Hard gate: OTP screen cannot be skipped without verified email
    if (s === OTP_SCR && !otpVerifiedRef.current) return s;
    return Math.min(s + 1, TOTAL_SCR - 1);
  }), []);
  const prev = useCallback(() => setScreen(s => Math.max(s - 1, PROFILE_SCR)), []);
  const skip  = () => router.push('/login');

  async function sendOtp() {
    setOtpError('');
    try {
      const res = await fetch('/api/onboarding/send-otp', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ email: sEmail || session?.user?.email }) });
      if (res.ok) {
        setOtpSent(true);
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setOtpError(d.error ?? 'Failed to send verification code. Please try again.');
      }
    } catch { setOtpError('Network error. Please check your connection and try again.'); }
  }

  async function verifyOtp() {
    setVerifying(true); setOtpError('');
    try {
      const res = await fetch('/api/onboarding/verify-otp', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ otp: otpDigits.join(''), email: sEmail || session?.user?.email }) });
      const d = await res.json() as { verified?: boolean; error?: string };
      if (d.verified) {
        otpVerifiedRef.current = true; // set ref synchronously so next() gate passes
        setOtpOk(true);
        // Refresh the JWT so it picks up emailVerified: true from the profile.
        // This ensures the middleware lets the user through after onboarding completes.
        void updateSession();
        setTimeout(next, 900);
      }
      else setOtpError(d.error ?? 'Invalid code. Please try again.');
    } catch { setOtpError('Something went wrong.'); }
    finally { setVerifying(false); }
  }

  function handleOtpChange(i: number, val: string) {
    const digit = val.replace(/\D/, '').slice(-1);
    const next_ = [...otpDigits]; next_[i] = digit; setOtpDigits(next_);
    if (digit && i < 5) otpRefs[i + 1].current?.focus();
  }
  function handleOtpKey(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otpDigits[i] && i > 0) otpRefs[i - 1].current?.focus();
  }

  async function handleSignup() {
    setSLoading(true); setSError('');
    try {
      const res = await fetch('/api/individual/signup', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ name:sName.trim(), email:sEmail.trim(), password:sPass, policyAccepted:true, referralCode: referralCode || undefined, captchaToken }) });
      const d = await res.json() as { error?: string };
      if (!res.ok) { setSError(d.error ?? 'Signup failed.'); return; }

      // Attempt signIn — retry once after a short delay (handles cases where the
      // new account hasn't fully propagated before the auth handler runs)
      let si = await signIn('credentials', { email:sEmail.trim(), password:sPass, policyAccepted:'accepted', redirect:false });
      if (si?.error) {
        await new Promise(r => setTimeout(r, 800));
        si = await signIn('credentials', { email:sEmail.trim(), password:sPass, policyAccepted:'accepted', redirect:false });
      }
      // Even if signIn failed both times, account exists — advance to OTP.
      // verify-otp falls back to email-based lookup when no session is present.
      if (!si?.error) hasSignedUpInSession.current = true;
      next();
    } catch { setSError('Something went wrong. Please try again.'); }
    finally { setSLoading(false); }
  }

  async function handleGoogleSignup() {
    if (googleBusy) return;
    setSError('');
    setGoogleBusy(true);
    try {
      const plan = searchParams?.get('plan') || undefined;
      const config = searchParams?.get('config') || undefined;
      /* Record the chosen account type server-side BEFORE leaving for Google, so
         the intent survives the redirect and the server (not a query param)
         decides what a new account becomes. */
      await fetch('/api/auth/oauth-intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountType, ref: referralCode || undefined, plan, config }),
      });
      /* Return to onboarding so we can confirm the resulting account type
         matches the toggle (mismatch → rejected). Legit params are preserved. */
      const cb = new URLSearchParams();
      cb.set('start', 'signup');
      if (accountType === 'business') cb.set('type', 'business');
      if (referralCode) cb.set('ref', referralCode);
      if (plan) cb.set('plan', plan);
      if (config) cb.set('config', config);
      cb.set('oauth', 'return');
      await signIn('google', { callbackUrl: `/onboarding?${cb.toString()}` });
    } catch {
      setSError('Could not connect to Google. Please try again.');
      setGoogleBusy(false);
    }
  }

  async function blobToDataUrl(blobUrl: string): Promise<string> {
    try {
      const r = await fetch(blobUrl);
      const blob = await r.blob();
      return new Promise<string>((res) => {
        const reader = new FileReader();
        reader.onload = (e) => res(String(e.target?.result || ''));
        reader.readAsDataURL(blob);
      });
    } catch { return ''; }
  }

  async function handleComplete() {
    setCompleting(true);
    try {
      /* Await any in-flight image uploads so we save permanent URLs, not blob: URLs */
      const [resolvedAvatar, resolvedBanner] = await Promise.all([
        pendingAvatarUploadRef.current,
        pendingBannerUploadRef.current,
      ]);
      let finalAvatarUrl = resolvedAvatar ?? (avatarUrl.startsWith('blob:') ? '' : avatarUrl);
      let finalBannerUrl = resolvedBanner ?? (bannerUrl.startsWith('blob:') ? '' : bannerUrl);
      if (!finalAvatarUrl && avatarUrl.startsWith('blob:')) finalAvatarUrl = await blobToDataUrl(avatarUrl);
      if (!finalBannerUrl && bannerUrl.startsWith('blob:')) finalBannerUrl = await blobToDataUrl(bannerUrl);

      await Promise.all([
        ...followed.map(id => fetch('/api/profile/follow', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ targetUserId:id, action:'follow' }) })),
        fetch('/api/onboarding/complete', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ profile:{ headline, bio, location, website, avatarUrl: finalAvatarUrl || undefined, bannerUrl: finalBannerUrl || undefined, openToWork, skills, interests, experience, education, profileSetupDone:true } }) }),
      ]);
      setScreen(DONE_SCR);
    } catch { setScreen(DONE_SCR); }
    finally { setCompleting(false); }
  }

  function addSkill() {
    const t = skillInput.trim();
    if (t && !skills.includes(t) && skills.length < 20) setSkills(p => [...p, t]);
    setSkillInput('');
  }

  if (status === 'loading') return (
    <div className="flex min-h-screen items-center justify-center bg-[#050508]">
      <div className="relative h-8 w-8">
        <div className="absolute inset-0 rounded-full border-2 border-white/[0.08] border-t-white/40 animate-spin" />
      </div>
    </div>
  );

  const isTour        = screen <= TOUR_END;
  const postAuthStep  = Math.max(0, screen - SIGNUP_SCR);
  const postAuthTotal = DONE_SCR - SIGNUP_SCR;
  const progressPct   = isTour ? 0 : Math.round((postAuthStep / postAuthTotal) * 100);
  const userName      = session?.user?.name ?? sName;

  /* Shared button styles */
  const WHITE_BTN = 'flex items-center justify-center gap-2 rounded-[12px] bg-white text-[13px] sm:text-[14px] font-black text-[#050508] hover:bg-white/92 active:scale-[0.98] transition-all';
  const WHITE_BTN_SHADOW: React.CSSProperties = { boxShadow: '0 4px 24px rgba(255,255,255,0.12)' };

  /* ─────────────────────────────────────────────────────────────
     TOUR SCREENS  — ultra-compact mobile, no preview cards
  ───────────────────────────────────────────────────────────── */
  function renderForm() {
    switch (screen) {

      /* ── 0  HERO ── */
      case 0: return (
        <div className="flex flex-col gap-4">
          {/* Logo — mobile only */}
          <div className="flex lg:hidden items-center gap-2.5" style={{ animation: 'obFadeIn 0.35s both' }}>
            <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/[0.14] bg-white/[0.07]">
              <svg viewBox="0 0 32 32" className="h-4 w-4" fill="none" stroke="white" strokeWidth="1.8">
                <path d="M6 4h12l8 8v16H6V4z" /><path d="M18 4v8h8" /><path d="M10 16h12M10 20h8" />
              </svg>
            </div>
            <span className="text-[15px] font-black tracking-[-0.03em] text-white">Docrud</span>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.2em] text-white/30">Platform</span>
          </div>

          {/* Headline */}
          <div style={{ animation: 'obSlideUp 0.5s 0.05s both' }}>
            <h1 className="text-[1.95rem] sm:text-[2.4rem] font-black tracking-[-0.04em] leading-[1.1] text-white">
              Your professional<br />
              <Highlight>network awaits.</Highlight>
            </h1>
            <p className="mt-2 text-[12px] sm:text-[13.5px] leading-[1.6] text-white/40">
              E-sign, AI docs, PDF tools, smart forms, and a thriving professional community — all in one platform.
            </p>
          </div>

          {/* Feature icon strip — compact */}
          <div className="flex items-center gap-2 lg:hidden" style={{ animation: 'obSlideUp 0.5s 0.12s both' }}>
            {[
              { Icon: FileSignature, label: 'E-Sign'   },
              { Icon: Bot,           label: 'Doc AI'   },
              { Icon: Users,         label: 'Network'  },
              { Icon: Zap,           label: 'Gigs'     },
              { Icon: FileText,      label: 'PDF'      },
              { Icon: FormInput,     label: 'Forms'    },
            ].map(({ Icon, label }) => (
              <div key={label} className="flex flex-1 flex-col items-center gap-1 rounded-[10px] border border-white/[0.06] bg-white/[0.03] py-2">
                <Icon className="h-3.5 w-3.5 text-white/35" />
                <span className="text-[8.5px] font-semibold text-white/35">{label}</span>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex flex-col gap-2" style={{ animation: 'obSlideUp 0.5s 0.2s both' }}>
            <button onClick={next} className={`h-10 sm:h-11 w-full ${WHITE_BTN}`} style={WHITE_BTN_SHADOW}>
              Explore the platform <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button onClick={skip} className="w-full py-2 text-[12px] font-medium text-white/30 hover:text-white/55 transition-colors">
              Already have an account? Sign in →
            </button>
          </div>

        </div>
      );

      /* ── 1  PUBLISH ── */
      case 1: return (
        <div className="flex flex-col gap-4">
          <div style={{ animation: 'obSlideUp 0.45s both' }}>
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-white/[0.08] bg-white/[0.05]">
                <FileText className="h-3.5 w-3.5 text-white/40" />
              </div>
              <span className="text-[9.5px] font-black uppercase tracking-[0.24em] text-white/28">Publish anything</span>
            </div>
            <h2 className="text-[1.7rem] sm:text-[2rem] font-black tracking-[-0.04em] leading-[1.1] text-white">
              Share your work<br /><Highlight>with the world.</Highlight>
            </h2>
            <p className="mt-2 text-[12px] sm:text-[13px] leading-[1.6] text-white/38">
              Articles, documents, portfolios, gigs, and announcements — published to a professional audience of thousands.
            </p>
          </div>

          {/* Publish type 2×2 */}
          <div className="grid grid-cols-2 gap-2" style={{ animation: 'obSlideUp 0.45s 0.08s both' }}>
            {[
              { Icon: FileText,     label: 'Articles & Blogs',  sub: 'Long-form writing'      },
              { Icon: FileSignature,label: 'Documents',          sub: 'Contracts & reports'    },
              { Icon: Layers,       label: 'Portfolios',         sub: 'Showcase your best work' },
              { Icon: Zap,          label: 'Gigs & Projects',   sub: 'Post opportunities'      },
            ].map(({ Icon, label, sub }) => (
              <div key={label} className="flex items-center gap-2.5 rounded-[12px] border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] border border-white/[0.07] bg-white/[0.04]">
                  <Icon className="h-3.5 w-3.5 text-white/38" />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-white/62 leading-tight">{label}</div>
                  <div className="text-[9.5px] text-white/28">{sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-5" style={{ animation: 'obFadeIn 0.45s 0.16s both' }}>
            {[['12k+','published'],['3.4k','creators'],['47k','daily reach']].map(([v, l]) => (
              <div key={l}>
                <div className="text-[18px] font-black text-white">{v}</div>
                <div className="text-[9.5px] text-white/28">{l}</div>
              </div>
            ))}
          </div>

          <button onClick={next} className={`h-10 sm:h-11 w-full ${WHITE_BTN}`} style={WHITE_BTN_SHADOW}>
            Next <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      );

      /* ── 2  CONNECT ── */
      case 2: return (
        <div className="flex flex-col gap-4">
          <div style={{ animation: 'obSlideUp 0.45s both' }}>
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-white/[0.08] bg-white/[0.05]">
                <Users className="h-3.5 w-3.5 text-white/40" />
              </div>
              <span className="text-[9.5px] font-black uppercase tracking-[0.24em] text-white/28">Professional Network</span>
            </div>
            <h2 className="text-[1.7rem] sm:text-[2rem] font-black tracking-[-0.04em] leading-[1.1] text-white">
              Build your<br /><Highlight>professional network.</Highlight>
            </h2>
            <p className="mt-2 text-[12px] sm:text-[13px] leading-[1.6] text-white/38">
              Follow creators and builders. Get discovered. Your profile is your passport to new opportunities.
            </p>
          </div>

          {/* Network feature list — compact rows */}
          <div className="space-y-1.5" style={{ animation: 'obSlideUp 0.45s 0.08s both' }}>
            {[
              { Icon: Users,    label: 'Follow & get followed',    sub: '3,400+ professionals on platform' },
              { Icon: Award,    label: 'Verified profile badges',  sub: 'Stand out with credentials'       },
              { Icon: Briefcase,label: 'Talent directory',         sub: 'Be found by recruiters & clients' },
              { Icon: Share2,   label: 'Public portfolio',         sub: 'Showcase work to the world'       },
            ].map(({ Icon, label, sub }) => (
              <div key={label} className="flex items-center gap-3 rounded-[11px] border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] border border-white/[0.07] bg-white/[0.04]">
                  <Icon className="h-3.5 w-3.5 text-white/38" />
                </div>
                <div>
                  <div className="text-[11.5px] font-semibold text-white/62 leading-tight">{label}</div>
                  <div className="text-[10px] text-white/28">{sub}</div>
                </div>
              </div>
            ))}
          </div>

          <button onClick={next} className={`h-10 sm:h-11 w-full ${WHITE_BTN}`} style={WHITE_BTN_SHADOW}>
            Next <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      );

      /* ── 3  GIGS ── */
      case 3: return (
        <div className="flex flex-col gap-4">
          <div style={{ animation: 'obSlideUp 0.45s both' }}>
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-white/[0.08] bg-white/[0.05]">
                <Briefcase className="h-3.5 w-3.5 text-white/40" />
              </div>
              <span className="text-[9.5px] font-black uppercase tracking-[0.24em] text-white/28">Opportunities</span>
            </div>
            <h2 className="text-[1.7rem] sm:text-[2rem] font-black tracking-[-0.04em] leading-[1.1] text-white">
              Find work.<br /><Highlight>Find talent.</Highlight>
            </h2>
            <p className="mt-2 text-[12px] sm:text-[13px] leading-[1.6] text-white/38">
              Post gig listings, receive bids, and hire the best. Or apply and get hired by top companies and startups.
            </p>
          </div>

          {/* Gig capability 2×2 */}
          <div className="grid grid-cols-2 gap-2" style={{ animation: 'obSlideUp 0.45s 0.08s both' }}>
            {[
              { label: 'Post gigs & projects',  sub: 'Receive competitive bids'   },
              { label: 'Browse opportunities',  sub: 'Filter by category & budget' },
              { label: 'Verified bidders',       sub: 'See profiles & portfolios'  },
              { label: 'All work categories',    sub: 'Design, Tech, Marketing+'   },
            ].map(({ label, sub }) => (
              <div key={label} className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <div className="text-[11.5px] font-bold text-white/62 leading-tight">{label}</div>
                <div className="mt-0.5 text-[9.5px] text-white/28">{sub}</div>
              </div>
            ))}
          </div>

          {/* Budget highlight */}
          <div className="flex items-center gap-4 rounded-[12px] border border-white/[0.06] bg-white/[0.02] px-4 py-3" style={{ animation: 'obFadeIn 0.4s 0.16s both' }}>
            <div>
              <div className="text-[20px] font-black text-white">₹4.2L</div>
              <div className="text-[9.5px] text-white/28">avg project budget</div>
            </div>
            <div className="h-8 w-px bg-white/[0.07]" />
            <div>
              <div className="text-[20px] font-black text-white">25</div>
              <div className="text-[9.5px] text-white/28">new gigs today</div>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-white/50 animate-pulse" />
              <span className="text-[9.5px] text-white/35 font-medium">Live</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button onClick={next} className={`h-10 sm:h-11 w-full ${WHITE_BTN}`} style={WHITE_BTN_SHADOW}>
              Create your account <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button onClick={skip} className="w-full py-1.5 text-[12px] font-medium text-white/28 hover:text-white/50 transition-colors">
              Already have an account? Sign in →
            </button>
          </div>
        </div>
      );

      /* ── 4  SIGNUP ── */
      case SIGNUP_SCR: return (
        <div className="flex flex-col gap-5">

          {/* Mobile header: logo only */}
          <div className="flex lg:hidden items-center gap-2" style={{ animation: 'obFadeIn 0.35s both' }}>
            <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/[0.10] bg-white/[0.04]">
              <svg viewBox="0 0 32 32" className="h-3.5 w-3.5" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1.8">
                <path d="M6 4h12l8 8v16H6V4z" /><path d="M18 4v8h8" /><path d="M10 16h12M10 20h8" />
              </svg>
            </div>
            <span className="text-[13.5px] font-black tracking-[-0.02em] text-white/80">Docrud</span>
          </div>

          {/* Heading */}
          <div style={{ animation: 'obSlideUp 0.45s 0.05s both', opacity: 0 }}>
            <h2 className="text-[1.75rem] sm:text-[2rem] font-black tracking-[-0.045em] text-white leading-[1.05]">
              {accountType === 'business' ? 'Create your workspace.' : 'Create your profile.'}
            </h2>
            <p className="mt-2 text-[12px] sm:text-[12.5px] text-white/32 leading-[1.65]">
              {accountType === 'business'
                ? 'Set up your business account. Takes a minute.'
                : 'Join 3,400+ professionals. Takes 30 seconds.'}
            </p>
          </div>

          {/* Account type — Individual (default) or Business. Selecting Business
              swaps in the existing BusinessSignupForm below; the onboarding shell
              and left preview stay the same. */}
          <div style={{ animation: 'obSlideUp 0.45s 0.07s both', opacity: 0 }}>
            <AccountTypeToggle value={accountType} onChange={selectAccountType} />
          </div>

          {/* ── Referrer banner — shown when visiting via referral link ── */}
          {(referralCode && (referrerLoading || referrer)) && (
            <div style={{ animation: 'obSlideUp 0.45s 0.08s both', opacity: 0 }}>
              {referrerLoading ? (
                <div className="flex items-center gap-3 rounded-[16px] border border-white/[0.07] bg-white/[0.03] px-4 py-3 animate-pulse">
                  <div className="h-9 w-9 rounded-full bg-white/[0.07] shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-2.5 w-28 rounded-full bg-white/[0.07]" />
                    <div className="h-2 w-44 rounded-full bg-white/[0.05]" />
                  </div>
                </div>
              ) : referrer && (
                <div className="relative overflow-hidden rounded-[16px]"
                  style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.12) 0%,rgba(139,92,246,0.08) 50%,rgba(99,102,241,0.06) 100%)', border: '1px solid rgba(99,102,241,0.22)', boxShadow: '0 4px 20px rgba(99,102,241,0.12)' }}>
                  {/* Shimmer sweep */}
                  <div className="pointer-events-none absolute inset-0 opacity-40"
                    style={{ background: 'linear-gradient(105deg,transparent 35%,rgba(255,255,255,0.06) 50%,transparent 65%)', animation: 'obShimmer 4s ease-in-out infinite' }} />
                  <div className="relative flex items-center gap-3 px-4 py-3">
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <div className="h-10 w-10 overflow-hidden rounded-full border-2"
                        style={{ borderColor: 'rgba(99,102,241,0.35)', boxShadow: '0 0 12px rgba(99,102,241,0.30)' }}>
                        {referrer.avatarUrl
                          ? <img src={referrer.avatarUrl} alt={referrer.name} className="h-full w-full object-cover" />
                          : <div className="flex h-full w-full items-center justify-center text-[12px] font-black text-white/80"
                              style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                              {referrer.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()}
                            </div>
                        }
                      </div>
                      {/* No presence dot here: the referrer lookup returns no
                          user id, so there is nothing authoritative to show.
                          A decorative green dot would read as "online". */}
                    </div>
                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-indigo-400/70">Invited by</span>
                      </div>
                      <p className="text-[13px] font-black text-white leading-tight truncate" style={{ letterSpacing: '-0.01em' }}>{referrer.name}</p>
                      {referrer.headline && (
                        <p className="text-[10px] text-white/40 truncate mt-0.5">{referrer.headline}</p>
                      )}
                    </div>
                    {/* Gift icon */}
                    <div className="shrink-0 flex flex-col items-center gap-0.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-[10px]"
                        style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)' }}>
                        <span className="text-[16px]">🎁</span>
                      </div>
                      <span className="text-[7.5px] font-bold text-indigo-400/60">Bonus</span>
                    </div>
                  </div>
                  {/* Bottom strip */}
                  <div className="px-4 pb-2.5 flex items-center gap-1.5">
                    <div className="h-1 w-1 rounded-full bg-emerald-400" style={{ animation: 'obPulse 2s infinite' }} />
                    <span className="text-[9px] text-white/30">
                      You were personally invited — your account is activated instantly.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form card — Individual: the existing onboarding signup fields.
              Business: the existing BusinessSignupForm, embedded in the same
              shell. Only the form body swaps; heading, toggle, referral banner
              and left preview stay. */}
          {accountType === 'individual' ? (
          <div className="overflow-hidden rounded-[22px] border border-white/[0.08] backdrop-blur-sm"
            style={{ animation: 'obSlideUp 0.45s 0.12s both', opacity: 0, background: 'linear-gradient(160deg,rgba(255,255,255,0.03) 0%,rgba(255,255,255,0.012) 100%)', boxShadow: '0 1px 0 rgba(255,255,255,0.05) inset, 0 0 0 1px rgba(255,255,255,0.025), 0 32px 80px rgba(0,0,0,0.55)' }}>

            <div className="p-4 sm:p-5 space-y-3.5">

              {/* Full name */}
              <div className="space-y-1.5">
                <label className="block text-[9.5px] font-bold uppercase tracking-[0.22em] text-white/28">Full name</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20">
                    <Users className="h-3.5 w-3.5" />
                  </span>
                  <input value={sName} onChange={e => setSName(e.target.value)} placeholder="Arjun Mehta"
                    className={INP + ' pl-10'} autoFocus />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="block text-[9.5px] font-bold uppercase tracking-[0.22em] text-white/28">Email address</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                  </span>
                  <input value={sEmail} onChange={e => setSEmail(e.target.value)} placeholder="you@company.com" type="email"
                    className={INP + ' pl-10'} />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="block text-[9.5px] font-bold uppercase tracking-[0.22em] text-white/28">Password</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20">
                    <LockKeyhole className="h-3.5 w-3.5" />
                  </span>
                  <input value={sPass} onChange={e => setSPass(e.target.value)} placeholder="Min 8 characters"
                    type={showPass ? 'text' : 'password'} className={INP + ' pl-10 pr-10'}
                    onKeyDown={e => { if (e.key === 'Enter') void handleSignup(); }} />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/22 hover:text-white/55 transition-colors">
                    {showPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {sPass.length > 0 && (
                  <div className="flex items-center gap-2 pt-0.5">
                    <div className="flex flex-1 gap-1">
                      {[1,2,3,4].map(i => (
                        <div key={i} className="h-[3px] flex-1 rounded-full transition-all duration-300"
                          style={{ background: sPass.length >= i * 2 + 2 ? (sPass.length >= 10 ? '#34d399' : '#fbbf24') : 'rgba(255,255,255,0.07)' }} />
                      ))}
                    </div>
                    <span className="text-[9px] font-semibold text-white/28">
                      {sPass.length < 6 ? 'Weak' : sPass.length < 10 ? 'Fair' : 'Strong'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Hairline divider */}
            <div className="mx-4 sm:mx-5 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />

            {/* Error */}
            {sError && (
              <div className="mx-4 sm:mx-5 mt-3.5 flex items-start gap-2 rounded-[10px] border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2.5 text-[12px] text-rose-300/75">
                <span className="mt-0.5 shrink-0">✕</span>{sError}
              </div>
            )}

            {/* CTA */}
            <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-4 space-y-2.5">
              <TurnstileWidget onToken={setCaptchaToken} action="individual_signup" />
              <button onClick={() => void handleSignup()}
                disabled={sLoading || !sName.trim() || !sEmail.trim() || sPass.length < 8}
                className={`h-11 w-full ${WHITE_BTN} disabled:opacity-28 text-[13.5px]`}
                style={{ ...WHITE_BTN_SHADOW, boxShadow: '0 4px 28px rgba(255,255,255,0.13), 0 1px 0 rgba(255,255,255,0.9) inset' }}>
                {sLoading
                  ? <div className="h-4 w-4 rounded-full border-2 border-[#050508]/25 border-t-[#050508] animate-spin" />
                  : <><span>Create profile</span><ArrowRight className="h-3.5 w-3.5" /></>}
              </button>

              {googleEnabled && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 border-t border-white/[0.06]" />
                    <span className="text-[10px] text-white/20">or</span>
                    <div className="flex-1 border-t border-white/[0.06]" />
                  </div>
                  <button type="button" onClick={() => void handleGoogleSignup()} disabled={googleBusy}
                    className="flex h-10 w-full items-center justify-center gap-2.5 rounded-[11px] border border-white/[0.08] bg-white/[0.03] text-[12.5px] font-semibold text-white/55 transition hover:bg-white/[0.08] hover:text-white/80 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
                    {googleBusy ? (
                      <><span className="h-3.5 w-3.5 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />Connecting to Google…</>
                    ) : (
                      <><span className="flex h-4 w-4 items-center justify-center rounded-full bg-[conic-gradient(from_180deg,#34a853_0deg,#4285f4_120deg,#fbbc05_220deg,#ea4335_320deg,#34a853_360deg)] text-[8px] font-black text-white">G</span>Continue with Google</>
                    )}
                  </button>
                </>
              )}

              <p className="text-center text-[10px] text-white/18">
                By continuing you agree to our{' '}
                <span className="text-white/38 underline underline-offset-2 cursor-pointer hover:text-white/60 transition-colors">Terms</span>
                {' '}&amp;{' '}
                <span className="text-white/38 underline underline-offset-2 cursor-pointer hover:text-white/60 transition-colors">Privacy Policy</span>.
              </p>
            </div>
          </div>
          ) : (
            <div style={{ animation: 'obSlideUp 0.45s 0.12s both', opacity: 0 }}>
              <BusinessSignupForm
                embedded
                initialReferralCode={referralCode}
                initialPlanId={searchParams?.get('plan') ?? undefined}
                initialConfig={searchParams?.get('config') ?? undefined}
                softwareName="Docrud"
              />

              {/* Same "Continue with Google" as Individual — identical style; the
                  selected toggle (Business) decides the account type created. */}
              {googleEnabled && (
                <div className="mt-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 border-t border-white/[0.06]" />
                    <span className="text-[10px] text-white/20">or</span>
                    <div className="flex-1 border-t border-white/[0.06]" />
                  </div>
                  <button type="button" onClick={() => void handleGoogleSignup()} disabled={googleBusy}
                    className="flex h-10 w-full items-center justify-center gap-2.5 rounded-[11px] border border-white/[0.08] bg-white/[0.03] text-[12.5px] font-semibold text-white/55 transition hover:bg-white/[0.08] hover:text-white/80 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
                    {googleBusy ? (
                      <><span className="h-3.5 w-3.5 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />Connecting to Google…</>
                    ) : (
                      <><span className="flex h-4 w-4 items-center justify-center rounded-full bg-[conic-gradient(from_180deg,#34a853_0deg,#4285f4_120deg,#fbbc05_220deg,#ea4335_320deg,#34a853_360deg)] text-[8px] font-black text-white">G</span>Continue with Google</>
                    )}
                  </button>
                </div>
              )}

              {/* Mismatch / OAuth errors surface here in Business mode. */}
              {sError && (
                <div className="mt-3 flex items-start gap-2 rounded-[10px] border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2.5 text-[12px] text-rose-300/75">
                  <span className="mt-0.5 shrink-0">✕</span>{sError}
                </div>
              )}
            </div>
          )}

          {/* Recently joined slider — mobile only */}
          <div className="lg:hidden" style={{ animation: 'obFadeIn 0.4s 0.5s both', opacity: 0 }}>
            <div className="mb-2 flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400/60" style={{ animation: 'obPulse 2s ease-in-out infinite' }} />
              <span className="text-[8px] font-bold uppercase tracking-[0.26em] text-white/20">Recently joined</span>
              <span className="ml-auto rounded-full border border-white/[0.05] bg-white/[0.02] px-2 py-px text-[7.5px] font-bold text-white/18">Live</span>
            </div>
            <ProfileSlider speed={42} compact />
          </div>

          {/* Sign in */}
          <p style={{ animation: 'obFadeIn 0.4s 0.6s both', opacity: 0 }}
            className="text-center text-[12px] text-white/28">
            Already have an account?{' '}
            <button onClick={skip} className="font-semibold text-white/55 hover:text-white/90 transition-colors">
              Sign in →
            </button>
          </p>
        </div>
      );

      /* ── 5  OTP ── */
      case OTP_SCR: return (
        <div className="flex flex-col gap-5">

          {/* Mobile verify badge — hidden on desktop */}
          <div className="lg:hidden flex items-center justify-between" style={{ animation: 'obFadeIn 0.3s both', opacity: 0 }}>
            <div className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-white/[0.08]">
              <LockKeyhole className="h-3.5 w-3.5 text-white/55" />
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-blue-400/20 bg-blue-400/[0.05] px-2.5 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-blue-400/80" style={{ animation: 'obPulse 2s infinite' }} />
              <span className="text-[8.5px] font-bold uppercase tracking-[0.22em] text-blue-300/50">Verify email</span>
            </div>
          </div>

          {/* Heading */}
          <div style={{ animation: 'obSlideUp 0.45s 0.05s both', opacity: 0 }}>
            <h2 className="text-[1.75rem] sm:text-[2rem] font-black tracking-[-0.045em] text-white leading-[1.05]">
              Check your email.
            </h2>
            <p className="mt-2 text-[12.5px] text-white/30 leading-relaxed">
              We sent a 6-digit code to{' '}
              <span className="font-semibold text-white/55">{session?.user?.email ?? sEmail}</span>
            </p>
          </div>

          {/* OTP input card */}
          <div style={{ animation: 'obSlideUp 0.45s 0.12s both', opacity: 0, background: 'linear-gradient(160deg,rgba(255,255,255,0.035) 0%,rgba(255,255,255,0.015) 100%)', boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 32px 80px rgba(0,0,0,0.5)' }}
            className="overflow-hidden rounded-[22px] border border-white/[0.06] backdrop-blur-sm">

            <div className="p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-blue-400/65" style={{ animation: 'obPulse 2.5s ease-in-out infinite' }} />
                  <p className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-white/22">Verification code</p>
                </div>
                <span className="rounded-full border border-white/[0.06] bg-white/[0.025] px-2 py-0.5 text-[9px] font-bold text-white/20">
                  {otpDigits.filter(Boolean).length} / 6
                </span>
              </div>

              {/* 6 boxes */}
              <div className="grid grid-cols-6 gap-2 sm:gap-2.5">
                {otpDigits.map((d, i) => (
                  <input
                    key={i}
                    ref={otpRefs[i]}
                    maxLength={1}
                    value={d}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKey(i, e)}
                    style={{
                      background: d ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)',
                      borderColor: d ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.07)',
                    }}
                    className="h-12 sm:h-[52px] w-full min-w-0 rounded-[12px] border text-center text-[1.2rem] font-black text-white outline-none transition-all duration-150 focus:border-white/[0.30] focus:bg-white/[0.09] focus:shadow-[0_0_0_3px_rgba(255,255,255,0.05)]"
                  />
                ))}
              </div>

              {/* Progress track */}
              <div className="mt-4 h-[2px] w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full bg-white/45 transition-all duration-300"
                  style={{ width: `${(otpDigits.filter(Boolean).length / 6) * 100}%` }} />
              </div>

              {otpError && (
                <p className="mt-3 text-[11.5px] text-rose-300/65" style={{ animation: 'obScaleIn 0.2s ease both' }}>
                  <span className="mr-1 text-rose-400/55">✕</span>{otpError}
                </p>
              )}
              {otpOk && (
                <div className="mt-3.5 flex items-center justify-center gap-2 rounded-[12px] border border-emerald-500/20 bg-emerald-500/[0.05] py-2.5 text-[12.5px] font-semibold text-emerald-400/90"
                  style={{ animation: 'obScaleIn 0.3s ease both' }}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Email verified!
                </div>
              )}
            </div>

            {/* Hairline + CTA */}
            <div className="mx-5 sm:mx-6 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
            <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-4">
              <button onClick={() => void verifyOtp()} disabled={otpDigits.join('').length < 6 || verifying || otpOk}
                className={`h-11 w-full ${WHITE_BTN} disabled:opacity-25 text-[13.5px]`}
                style={{ boxShadow: '0 4px 28px rgba(255,255,255,0.13), 0 1px 0 rgba(255,255,255,0.9) inset' }}>
                {verifying
                  ? <div className="h-4 w-4 rounded-full border-2 border-[#050508]/25 border-t-[#050508] animate-spin" />
                  : <><span>Verify &amp; continue</span><ArrowRight className="h-3.5 w-3.5" /></>}
              </button>
            </div>
          </div>

          {/* Security note */}
          <div style={{ animation: 'obFadeIn 0.4s 0.35s both', opacity: 0 }}
            className="flex items-center gap-2.5 rounded-[12px] border border-white/[0.04] bg-white/[0.018] px-3.5 py-2.5">
            <Shield className="h-3.5 w-3.5 shrink-0 text-white/22" />
            <p className="text-[11px] text-white/28 leading-snug">
              Code expires in <span className="font-semibold text-white/45">10 minutes</span>. Never share it with anyone.
            </p>
          </div>

          {/* Resend */}
          <div style={{ animation: 'obFadeIn 0.4s 0.45s both', opacity: 0 }}
            className="text-center text-[11.5px] text-white/25">
            Didn&apos;t get it?{' '}
            <button onClick={() => void sendOtp()} className="font-semibold text-white/40 hover:text-white/65 transition-colors">
              Resend code
            </button>
          </div>

          {/* Live activity feed — mobile only */}
          <div className="lg:hidden" style={{ animation: 'obFadeIn 0.4s 0.55s both', opacity: 0 }}>
            <style>{`@keyframes feedScrollUp{0%{transform:translateY(0)}100%{transform:translateY(-50%)}}`}</style>
            <div className="mb-2.5 flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400/60" style={{ animation: 'obPulse 2s ease-in-out infinite' }} />
              <span className="text-[8px] font-bold uppercase tracking-[0.3em] text-white/20">Live activity</span>
              <div className="h-px flex-1 bg-white/[0.05]" />
              <span className="rounded-full border border-white/[0.05] bg-white/[0.015] px-2 py-px text-[7px] font-bold text-white/15">Real-time</span>
            </div>
            <div className="relative overflow-hidden rounded-[16px] border border-white/[0.06] bg-white/[0.012]"
              style={{
                height: 168,
                maskImage: 'linear-gradient(to bottom,transparent,black 12%,black 88%,transparent)',
                WebkitMaskImage: 'linear-gradient(to bottom,transparent,black 12%,black 88%,transparent)',
              }}>
              <div style={{ animation: 'feedScrollUp 22s linear infinite', display: 'flex', flexDirection: 'column' }}>
                {[...OTP_FEED, ...OTP_FEED].map((item, i) => (
                  <div key={i} style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
                    <img
                      src={item.avatar}
                      alt={item.user}
                      style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.10)' }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 10, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ fontWeight: 800, color: 'rgba(255,255,255,0.68)' }}>{item.user}</span>
                        <span style={{ fontWeight: 500, color: 'rgba(255,255,255,0.28)', marginLeft: 4 }}>{item.action}</span>
                      </p>
                      <p style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.22)', margin: 0, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.subject}
                      </p>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <span style={{
                        display: 'block', fontSize: 6.5, fontWeight: 700, borderRadius: 99, padding: '2px 6px', marginBottom: 2,
                        color: item.color, background: `${item.color}18`, border: `1px solid ${item.color}28`,
                      }}>{item.tag}</span>
                      <span style={{ fontSize: 6.5, color: 'rgba(255,255,255,0.16)' }}>{item.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );

      /* ── 6  PROFILE ── */
      case PROFILE_SCR: return (
        <div className="flex flex-col gap-3.5">

          {/* Heading */}
          <div style={{ animation: 'obSlideUp 0.45s 0.05s both', opacity: 0 }}>
            <h2 className="text-[1.65rem] sm:text-[1.85rem] font-black tracking-[-0.045em] text-white leading-[1.05]">Build your profile.</h2>
            <p className="mt-1.5 text-[12px] text-white/32">This is what the Docrud community will see.</p>
          </div>

          {/* ── Resume import ── */}
          <div style={{ animation: 'obSlideUp 0.45s 0.08s both', opacity: 0 }}>
            {resumeFilled
              ? <div className="rounded-[16px] border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400/80" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-emerald-400/90">Profile filled from resume</p>
                      <p className="text-[10.5px] text-white/30 mt-0.5">Review and edit below — everything can be changed.</p>
                    </div>
                    <button onClick={() => { setResumeFilled(false); setResumeFilledFields(new Set()); }} className="text-[10px] text-white/25 hover:text-white/50 transition-colors shrink-0">
                      Re-upload
                    </button>
                  </div>
                  {/* Field-level import summary */}
                  <div className="flex flex-wrap gap-1.5">
                    {resumeFilledFields.has('headline')   && <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2 py-0.5 text-[9px] font-semibold text-emerald-400/70">Headline</span>}
                    {resumeFilledFields.has('bio')        && <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2 py-0.5 text-[9px] font-semibold text-emerald-400/70">Bio</span>}
                    {resumeFilledFields.has('location')   && <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2 py-0.5 text-[9px] font-semibold text-emerald-400/70">Location</span>}
                    {resumeFilledFields.has('website')    && <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2 py-0.5 text-[9px] font-semibold text-emerald-400/70">Website</span>}
                    {resumeFilledFields.has('skills')     && <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2 py-0.5 text-[9px] font-semibold text-emerald-400/70">{skills.length} Skills</span>}
                    {resumeFilledFields.has('experience') && <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2 py-0.5 text-[9px] font-semibold text-emerald-400/70">{experience.length} Roles</span>}
                    {resumeFilledFields.has('education')  && <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2 py-0.5 text-[9px] font-semibold text-emerald-400/70">{education.length} Education</span>}
                  </div>
                </div>
              : <button type="button" onClick={() => resumeFileRef.current?.click()} disabled={resumeParsing}
                  className="group relative w-full overflow-hidden rounded-[16px] border border-white/[0.08] bg-white/[0.025] px-4 py-3.5 text-left transition-all hover:border-white/[0.14] hover:bg-white/[0.04] disabled:opacity-60">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-white/[0.08] bg-white/[0.04]">
                      {resumeParsing
                        ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
                        : <svg className="h-4 w-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                          </svg>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold text-white/70">
                        {resumeParsing ? 'Reading your resume…' : 'Import from resume'}
                      </p>
                      <p className="text-[10.5px] text-white/30 mt-0.5">
                        {resumeParsing ? 'AI + OCR extracting your details…' : 'Upload PDF or Word — we auto-fill your profile'}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-white/[0.07] bg-white/[0.04] px-2 py-0.5 text-[7.5px] font-bold uppercase tracking-[0.2em] text-white/30">AI</span>
                  </div>
                  {resumeParseErr && (
                    <p className="mt-2.5 text-[10.5px] text-rose-300/65"><span className="mr-1">✕</span>{resumeParseErr}</p>
                  )}
                </button>
            }
          </div>

          {/* ── Banner + Avatar ── */}
          <div style={{ animation: 'obSlideUp 0.45s 0.12s both', opacity: 0, background: 'linear-gradient(160deg,rgba(255,255,255,0.03) 0%,rgba(255,255,255,0.012) 100%)' }}
            className="overflow-hidden rounded-[20px] border border-white/[0.07]">

            {/* Banner */}
            <button type="button" onClick={() => bannerFileRef.current?.click()}
              className="group relative flex h-[88px] w-full items-center justify-center overflow-hidden transition-all"
              style={{ background: bannerUrl ? undefined : 'linear-gradient(135deg,rgba(201,168,76,0.10) 0%,rgba(99,102,241,0.08) 50%,rgba(14,165,233,0.06) 100%)' }}>
              {bannerUrl && <img src={bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" onError={() => setBannerUrl('')} />}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" />
              {bannerUploading
                ? <div className="relative z-10 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/70 px-3 py-1.5">
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
                    <span className="text-[9.5px] text-white/70">Uploading…</span>
                  </div>
                : <div className="relative z-10 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/50 px-3 py-1.5 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="h-3 w-3 text-white/75" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                    <span className="text-[9.5px] font-semibold text-white/85">{bannerUrl ? 'Change cover' : 'Upload cover'}</span>
                  </div>
              }
            </button>

            {/* Avatar + name strip */}
            <div className="flex items-end gap-3 px-4 pb-4" style={{ marginTop: -22 }}>
              <button type="button" onClick={() => avatarFileRef.current?.click()}
                className="group relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[14px] border-2 border-[#0d0d12] bg-white/[0.06] flex items-center justify-center text-[15px] font-black text-white/50 transition-all hover:border-white/20">
                {avatarUrl
                  ? <img src={avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" onError={() => setAvatarUrl('')} />
                  : <span>{initials(userName || 'U')}</span>}
                {avatarUploading
                  ? <div className="absolute inset-0 flex items-center justify-center rounded-[12px] bg-black/70">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
                    </div>
                  : <div className="absolute inset-0 flex items-center justify-center rounded-[12px] bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="h-3.5 w-3.5 text-white/85" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0118.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                      </svg>
                    </div>
                }
              </button>
              <div className="flex-1 min-w-0 pb-0.5">
                <p className="text-[12.5px] font-bold text-white/75 truncate">{userName || 'Your Name'}</p>
                <p className="text-[10.5px] text-white/28 truncate">{headline || 'Add a headline below'}</p>
              </div>
            </div>
          </div>

          {/* ── Headline ── */}
          <div style={{ animation: 'obSlideUp 0.45s 0.16s both', opacity: 0 }}
            className={`rounded-[18px] border px-3.5 py-3 transition-colors duration-500 ${resumeFilledFields.has('headline') ? 'border-emerald-500/25 bg-emerald-500/[0.04]' : 'border-white/[0.07] bg-white/[0.025]'}`}>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/22">Headline</label>
              {resumeFilledFields.has('headline') && <span className="text-[8.5px] text-emerald-400/60 font-semibold">from resume</span>}
            </div>
            <input value={headline} onChange={e => { setHeadline(e.target.value.slice(0, 100)); setResumeFilledFields(p => { const n = new Set(p); n.delete('headline'); return n; }); }}
              placeholder="e.g. Product Designer at Razorpay" className={INP} />
          </div>

          {/* ── Bio ── */}
          <div style={{ animation: 'obSlideUp 0.45s 0.19s both', opacity: 0 }}
            className={`rounded-[18px] border px-3.5 py-3 transition-colors duration-500 ${resumeFilledFields.has('bio') ? 'border-emerald-500/25 bg-emerald-500/[0.04]' : 'border-white/[0.07] bg-white/[0.025]'}`}>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/22">Bio</label>
              <div className="flex items-center gap-2">
                {resumeFilledFields.has('bio') && <span className="text-[8.5px] text-emerald-400/60 font-semibold">from resume</span>}
                <span className="text-[9px] text-white/18">{bio.length}/500</span>
              </div>
            </div>
            <textarea value={bio} onChange={e => { setBio(e.target.value.slice(0, 500)); setResumeFilledFields(p => { const n = new Set(p); n.delete('bio'); return n; }); }} rows={3}
              placeholder="A short professional bio…"
              className="w-full rounded-[12px] border border-white/[0.07] bg-white/[0.035] text-white px-3 py-2.5 text-[12.5px] placeholder:text-white/18 focus:outline-none focus:border-white/[0.20] focus:shadow-[0_0_0_3px_rgba(255,255,255,0.04)] resize-none transition-all duration-200" />
          </div>

          {/* ── Location + Website ── */}
          <div style={{ animation: 'obSlideUp 0.45s 0.22s both', opacity: 0 }}
            className="grid grid-cols-2 gap-2.5">
            <div className={`rounded-[18px] border px-3.5 py-3 transition-colors duration-500 ${resumeFilledFields.has('location') ? 'border-emerald-500/25 bg-emerald-500/[0.04]' : 'border-white/[0.07] bg-white/[0.025]'}`}>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/22">Location</label>
                {resumeFilledFields.has('location') && <span className="text-[8px] text-emerald-400/60 font-semibold">from resume</span>}
              </div>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-white/18" />
                <input value={location} onChange={e => { setLocation(e.target.value); setResumeFilledFields(p => { const n = new Set(p); n.delete('location'); return n; }); }} placeholder="Mumbai, IN" className={INP + ' pl-7 text-[12px]'} />
              </div>
            </div>
            <div className={`rounded-[18px] border px-3.5 py-3 transition-colors duration-500 ${resumeFilledFields.has('website') ? 'border-emerald-500/25 bg-emerald-500/[0.04]' : 'border-white/[0.07] bg-white/[0.025]'}`}>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/22">Website</label>
                {resumeFilledFields.has('website') && <span className="text-[8px] text-emerald-400/60 font-semibold">from resume</span>}
              </div>
              <div className="relative">
                <Globe className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-white/18" />
                <input value={website} onChange={e => { setWebsite(e.target.value); setResumeFilledFields(p => { const n = new Set(p); n.delete('website'); return n; }); }} placeholder="yoursite.com" className={INP + ' pl-7 text-[12px]'} />
              </div>
            </div>
          </div>

          {/* ── Open to work + CTA ── */}
          <div style={{ animation: 'obSlideUp 0.45s 0.25s both', opacity: 0 }} className="space-y-3">
            <button type="button" onClick={() => setOpenToWork(v => !v)}
              className={`flex w-full cursor-pointer items-center gap-3 rounded-[14px] border px-4 py-3 transition-all duration-200 ${openToWork ? 'border-emerald-500/25 bg-emerald-500/[0.05]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
              <div className={`h-5 w-9 shrink-0 rounded-full flex items-center px-0.5 transition-all duration-300 ${openToWork ? 'bg-emerald-500' : 'bg-white/[0.10]'}`}>
                <div className={`h-4 w-4 rounded-full shadow transition-transform duration-300 ${openToWork ? 'translate-x-4 bg-white' : 'bg-white/35'}`} />
              </div>
              <div className="text-left">
                <p className={`text-[12px] font-semibold transition-colors ${openToWork ? 'text-emerald-400/90' : 'text-white/60'}`}>Open to work or opportunities</p>
                <p className="text-[10px] text-white/25">Visible to recruiters and collaborators</p>
              </div>
            </button>

            <button onClick={() => void handleProfileContinue()}
              className={`h-11 w-full ${WHITE_BTN} text-[13.5px]`}
              style={{ boxShadow: '0 4px 28px rgba(255,255,255,0.13), 0 1px 0 rgba(255,255,255,0.9) inset' }}>
              Save &amp; continue <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* ── Mobile: Docrud features — desktop shows this in the left panel ── */}
          <div className="lg:hidden mt-2" style={{ animation: 'obFadeIn 0.4s 0.55s both', opacity: 0 }}>
            <div className="mb-3 flex items-center gap-2">
              <div className="h-px flex-1" style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.10))' }} />
              <div className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1">
                <Sparkles className="h-2.5 w-2.5 text-white/35" />
                <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/40">Everything inside Docrud</span>
              </div>
              <div className="h-px flex-1" style={{ background: 'linear-gradient(to left, transparent, rgba(255,255,255,0.10))' }} />
            </div>
            <DocrudFeatureGrid staggerBase={0.58} compact />
            <p className="mt-2.5 text-center text-[8px] font-medium text-white/25 tracking-wide">
              Smart Forms · Portfolio · Resume ATS · and more
            </p>
          </div>
        </div>
      );

      /* ── 7  SKILLS ── */
      case SKILLS_SCR: return (
        <div className="flex flex-col gap-3.5">

          {/* Heading */}
          <div style={{ animation: 'obSlideUp 0.45s 0.05s both', opacity: 0 }}>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1">
              <div className="h-1.5 w-1.5 rounded-full" style={{ background: '#818cf8', animation: 'obPulse 2s infinite' }} />
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.26em] text-white/30">Step 4 of 5 — Skills</span>
            </div>
            <h2 className="text-[1.45rem] sm:text-[1.65rem] font-black tracking-[-0.04em] text-white leading-[1.1]">What are you good at?</h2>
            <p className="mt-1 text-[11.5px] text-white/35">Add skills — they power your search ranking and gig matches.</p>
          </div>

          {/* Skills card */}
          <div style={{ animation: 'obSlideUp 0.45s 0.10s both', opacity: 0 }}
            className="rounded-[18px] border border-white/[0.07] bg-white/[0.025] p-3.5 space-y-3">
            <div className="flex gap-2">
              <input value={skillInput} onChange={e => setSkillInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
                placeholder="e.g. React, Figma, Marketing…" className={INP.replace('w-full', 'flex-1')} />
              <button onClick={addSkill}
                className="h-10 sm:h-11 shrink-0 rounded-[12px] border border-white/[0.10] bg-white/[0.05] px-3.5 text-[12px] font-bold text-white/55 hover:bg-white/[0.09] hover:text-white/80 transition-all">
                Add
              </button>
            </div>

            {/* Added chips */}
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s, i) => (
                  <span key={s}
                    style={{ animation: `obScaleIn 0.25s ${i * 0.04}s both` }}
                    className="flex items-center gap-1.5 rounded-full border border-white/[0.15] bg-white/[0.07] px-3 py-1 text-[11.5px] font-semibold text-white/80">
                    {s}
                    <button onClick={() => setSkills(p => p.filter(x => x !== s))}
                      className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-white/[0.12] transition-all">
                      <X className="h-2.5 w-2.5 text-white/40 hover:text-white/70 transition-colors" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Skill counter */}
            {skills.length > 0 && (
              <p className="text-[9.5px] text-white/25">
                <span className="font-black text-white/50">{skills.length}</span> / 20 skills added
              </p>
            )}

            {/* Suggestions */}
            <div>
              <p className="mb-2 text-[8.5px] font-black uppercase tracking-[0.22em] text-white/22">Popular</p>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_SKILLS.filter(s => !skills.includes(s)).slice(0, 14).map(s => (
                  <button key={s}
                    onClick={() => { if (skills.length < 20) setSkills(p => [...p, s]); }}
                    className="rounded-full border border-white/[0.07] bg-white/[0.02] px-2.5 py-1 text-[11px] font-medium text-white/30 hover:text-white/70 hover:border-white/[0.16] hover:bg-white/[0.06] transition-all">
                    + {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Interests card */}
          <div style={{ animation: 'obSlideUp 0.45s 0.18s both', opacity: 0 }}
            className="rounded-[18px] border border-white/[0.07] bg-white/[0.025] p-3.5">
            <div className="mb-2.5 flex items-center justify-between">
              <p className="text-[9.5px] font-black uppercase tracking-[0.22em] text-white/30">Areas of interest</p>
              {interests.length > 0 && (
                <span className="rounded-full border border-white/[0.10] bg-white/[0.05] px-2 py-0.5 text-[9.5px] font-black text-white/50">
                  {interests.length} selected
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {INTEREST_CATEGORIES.map(cat => (
                <button key={cat}
                  onClick={() => setInterests(p => p.includes(cat) ? p.filter(x => x !== cat) : [...p, cat])}
                  className={`rounded-[10px] border px-3 py-1 text-[11.5px] font-semibold transition-all duration-150 ${
                    interests.includes(cat)
                      ? 'border-white/70 bg-white text-[#050508] shadow-[0_2px_12px_rgba(255,255,255,0.08)]'
                      : 'border-white/[0.07] bg-white/[0.025] text-white/38 hover:text-white/70 hover:border-white/[0.14] hover:bg-white/[0.05]'
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div style={{ animation: 'obSlideUp 0.45s 0.24s both', opacity: 0 }}>
            <button onClick={next} className={`h-10 sm:h-11 w-full ${WHITE_BTN}`} style={WHITE_BTN_SHADOW}
              disabled={skills.length === 0 && interests.length === 0}>
              {skills.length > 0 || interests.length > 0 ? 'Continue' : 'Skip for now'} <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      );

      /* ── 8  PEOPLE ── */
      case PEOPLE_SCR: return (
        <div className="flex flex-col gap-5">
          {/* Header */}
          <div style={{ animation: 'obSlideUp 0.4s both' }}>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-0.5">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ animation: 'obPulse 2s infinite' }} />
              <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/35">Step 5 of 5 — People</span>
            </div>
            <h2 className="text-[1.5rem] sm:text-[1.75rem] font-black tracking-[-0.035em] text-white leading-[1.1]">
              People you&apos;ll vibe with
            </h2>
            <p className="mt-1 text-[12px] text-white/38 leading-relaxed">
              {skills.length > 0 || interests.length > 0
                ? `Matched to your skills — follow to build your network.`
                : `Follow professionals in your field to stay updated.`}
            </p>
          </div>

          {/* Skill match chips — show if user has skills */}
          {(skills.length > 0 || interests.length > 0) && (
            <div className="flex flex-wrap gap-1.5" style={{ animation: 'obFadeIn 0.4s 0.1s both', opacity: 0 }}>
              {Array.from(new Set([...skills, ...interests])).slice(0, 5).map(s => (
                <span key={s} className="flex items-center gap-1 rounded-full border border-indigo-500/25 bg-indigo-500/[0.08] px-2.5 py-0.5 text-[10px] font-semibold text-indigo-300/80">
                  <span className="h-1 w-1 rounded-full bg-indigo-400/70" />
                  {s}
                </span>
              ))}
              {(skills.length + interests.length) > 5 && (
                <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-0.5 text-[10px] text-white/30">
                  +{(skills.length + interests.length) - 5} more
                </span>
              )}
            </div>
          )}

          {/* Cards grid */}
          <div className="grid grid-cols-2 gap-2.5 max-h-[42vh] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-1">
            {suggestions.length === 0
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-[168px] animate-pulse rounded-[18px] bg-white/[0.04]" style={{ animationDelay: `${i * 0.07}s` }} />
                ))
              : suggestions.map((p, i) => {
                  const isFollowed = followed.includes(p.id);
                  const hasMatch = (p.skillOverlap ?? 0) > 0;
                  // Deterministic banner gradient from name char code
                  const BAND_GRADS = [
                    'linear-gradient(125deg,rgba(99,102,241,0.55) 0%,rgba(168,85,247,0.35) 100%)',
                    'linear-gradient(125deg,rgba(16,185,129,0.50) 0%,rgba(14,165,233,0.35) 100%)',
                    'linear-gradient(125deg,rgba(245,158,11,0.50) 0%,rgba(249,115,22,0.35) 100%)',
                    'linear-gradient(125deg,rgba(236,72,153,0.50) 0%,rgba(239,68,68,0.35) 100%)',
                    'linear-gradient(125deg,rgba(14,165,233,0.50) 0%,rgba(99,102,241,0.35) 100%)',
                    'linear-gradient(125deg,rgba(168,85,247,0.50) 0%,rgba(236,72,153,0.35) 100%)',
                  ];
                  const bandGrad = BAND_GRADS[(p.name.charCodeAt(0) || 0) % BAND_GRADS.length];

                  return (
                    <div key={p.id}
                      style={{
                        animation: `obScaleIn 0.35s ${i * 0.055}s both`,
                        opacity: 0,
                        boxShadow: isFollowed ? '0 0 0 1px rgba(99,102,241,0.20), 0 4px 20px rgba(99,102,241,0.10)' : '0 2px 16px rgba(0,0,0,0.30)',
                      }}
                      className={`group relative flex flex-col overflow-hidden rounded-[18px] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)] ${
                        isFollowed
                          ? 'border border-indigo-500/30 bg-indigo-500/[0.06]'
                          : 'border border-white/[0.08] bg-white/[0.03]'
                      }`}>

                      {/* Banner */}
                      <div className="relative h-[42px] shrink-0 overflow-hidden">
                        {p.profile.bannerUrl
                          ? <img src={p.profile.bannerUrl} alt="" className="h-full w-full object-cover" />
                          : <div className="h-full w-full" style={{ background: bandGrad }} />
                        }
                        {/* Shimmer on banner */}
                        <div className="absolute inset-0 opacity-20" style={{ background: 'linear-gradient(105deg,transparent 35%,rgba(255,255,255,0.18) 50%,transparent 65%)', animation: `obShimmer ${5 + i * 0.4}s ease-in-out infinite ${i * 0.3}s` }} />

                        {/* Skill match badge */}
                        {hasMatch && (
                          <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/20 px-1.5 py-0.5 backdrop-blur-sm">
                            <span className="text-[7px] font-black text-emerald-400 uppercase tracking-wide">Match</span>
                          </div>
                        )}
                        {/* Open to work */}
                        {p.profile.openToWork && (
                          <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 rounded-full border border-emerald-500/25 bg-black/50 px-1.5 py-0.5 backdrop-blur-sm">
                            <div className="h-1 w-1 rounded-full bg-emerald-400" />
                            <span className="text-[7px] font-bold text-emerald-300">Open</span>
                          </div>
                        )}
                      </div>

                      {/* Body */}
                      <div className="flex flex-1 flex-col gap-2 px-3 pb-3 -mt-4">
                        {/* Avatar */}
                        <div className="flex items-end justify-between">
                          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[10px]"
                            style={{ border: '2px solid rgba(8,8,14,0.95)', boxShadow: '0 3px 12px rgba(0,0,0,0.5)' }}>
                            {p.profile.avatarUrl
                              ? <img src={p.profile.avatarUrl} alt="" className="h-full w-full object-cover" />
                              : <div className="flex h-full w-full items-center justify-center text-[10px] font-black text-white/80"
                                  style={{ background: bandGrad }}>
                                  {initials(p.name)}
                                </div>
                            }
                          </div>
                          {/* Go badge */}
                          {p.docrudGo && (
                            <div className="flex items-center gap-0.5 rounded-full border border-amber-500/30 bg-amber-500/[0.12] px-1.5 py-0.5">
                              <span className="text-[8px] font-black text-amber-400">∞</span>
                            </div>
                          )}
                        </div>

                        {/* Name + headline */}
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-black leading-tight text-white/90" style={{ letterSpacing: '-0.01em' }}>{p.name}</p>
                          {p.profile.headline && (
                            <p className="mt-0.5 line-clamp-2 text-[9.5px] leading-snug text-white/38">{p.profile.headline}</p>
                          )}
                          {p.profile.location && (
                            <div className="mt-0.5 flex items-center gap-0.5">
                              <MapPin className="h-2 w-2 text-white/20 shrink-0" />
                              <span className="truncate text-[8.5px] text-white/25">{p.profile.location}</span>
                            </div>
                          )}
                        </div>

                        {/* Skills chips — show matched first */}
                        {(p.profile.skills ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {(p.matchedSkills?.length ? p.matchedSkills : p.profile.skills ?? []).slice(0, 2).map(s => (
                              <span key={s}
                                className={`rounded-full px-1.5 py-px text-[7.5px] font-semibold ${
                                  p.matchedSkills?.includes(s)
                                    ? 'border border-indigo-500/25 bg-indigo-500/[0.12] text-indigo-300/80'
                                    : 'border border-white/[0.07] bg-white/[0.04] text-white/35'
                                }`}>
                                {s}
                              </span>
                            ))}
                            {(p.profile.skills ?? []).length > 2 && (
                              <span className="rounded-full border border-white/[0.05] bg-white/[0.02] px-1.5 py-px text-[7px] text-white/20">
                                +{(p.profile.skills ?? []).length - 2}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Stats row */}
                        {(p.stats?.followers ?? 0) > 0 && (
                          <div className="flex items-center gap-2.5 text-[8.5px] text-white/22">
                            <span className="font-semibold tabular-nums"><span className="text-white/40">{p.stats!.followers}</span> followers</span>
                            {p.stats!.gigsCount > 0 && <span className="font-semibold tabular-nums"><span className="text-white/40">{p.stats!.gigsCount}</span> gigs</span>}
                          </div>
                        )}

                        {/* Follow button */}
                        <button
                          onClick={() => setFollowed(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                          className={`mt-auto h-7 w-full rounded-[10px] text-[11px] font-black transition-all duration-200 ${
                            isFollowed
                              ? 'border border-indigo-500/30 bg-indigo-500/[0.12] text-indigo-300'
                              : 'bg-white text-[#050508] hover:bg-white/90 shadow-[0_2px_12px_rgba(255,255,255,0.12)]'
                          }`}
                          style={isFollowed ? {} : { boxShadow: '0 2px 12px rgba(255,255,255,0.10), inset 0 1px 0 rgba(255,255,255,0.9)' }}>
                          {isFollowed ? '✓ Following' : '+ Follow'}
                        </button>
                      </div>
                    </div>
                  );
                })}
          </div>

          {/* CTA */}
          <div className="flex flex-col gap-2" style={{ animation: 'obSlideUp 0.4s 0.3s both', opacity: 0 }}>
            <button onClick={() => void handleComplete()} disabled={completing}
              className={`h-10 sm:h-11 w-full ${WHITE_BTN} disabled:opacity-55`} style={WHITE_BTN_SHADOW}>
              {completing
                ? <div className="h-4 w-4 rounded-full border-2 border-[#050508]/25 border-t-[#050508] animate-spin" />
                : followed.length > 0
                  ? <>Continue with {followed.length} connection{followed.length > 1 ? 's' : ''} <ArrowRight className="h-3.5 w-3.5" /></>
                  : <>Skip for now <ArrowRight className="h-3.5 w-3.5" /></>
              }
            </button>
            {followed.length > 0 && (
              <p className="text-center text-[10px] text-white/22">Following {followed.length} professional{followed.length !== 1 ? 's' : ''}</p>
            )}
          </div>
        </div>
      );

      /* ── 9  DONE + DOCRUD GO OFFER ── */
      case DONE_SCR: {

        /* ── Success state after purchase ── */
        if (goPhase === 'success') return (
          <div className="flex flex-col items-center text-center gap-4" style={{ animation: 'obScaleIn 0.6s both' }}>
            {/* Infinity badge ring */}
            <div className="relative mx-auto h-24 w-24" style={{ animation: 'obScaleIn 0.7s 0.1s both' }}>
              <div className="absolute -inset-4 rounded-full"
                style={{ background: 'radial-gradient(circle,rgba(99,102,241,0.22) 0%,transparent 65%)', animation: 'obGlow 3s ease-in-out infinite' }} />
              <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.14),rgba(165,180,252,0.10))', border: '1.5px solid rgba(99,102,241,0.35)' }} />
              <svg className="absolute inset-0 h-24 w-24 -rotate-90" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="44" fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth="1.5" />
                <circle cx="48" cy="48" r="44" fill="none" strokeWidth="2.5" strokeLinecap="round"
                  strokeDasharray="276" strokeDashoffset="0"
                  style={{ stroke: 'url(#goGrad)', animation: 'obCheckDraw 1.4s 0.3s cubic-bezier(.4,0,.2,1) both' }} />
                <defs>
                  <linearGradient id="goGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4f46e5" /><stop offset="50%" stopColor="#a5b4fc" /><stop offset="100%" stopColor="#4f46e5" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center" style={{ animation: 'obScaleIn 0.45s 1.2s both', opacity: 0 }}>
                <span className="text-[30px] font-black" style={{ color: '#a5b4fc', filter: 'drop-shadow(0 0 12px rgba(99,102,241,0.6))' }}>∞</span>
              </div>
            </div>

            <div style={{ animation: 'obSlideUp 0.5s 0.5s both' }}>
              <div className="mb-1 text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: '#818cf8' }}>You&apos;re now</div>
              <h2 className="text-[1.7rem] sm:text-[1.95rem] font-black tracking-[-0.04em] text-white leading-[1.1]">
                Infinity <span style={{ color: '#a5b4fc' }}>∞</span> Member
              </h2>
              <p className="mt-1.5 max-w-[260px] mx-auto text-[12px] sm:text-[12.5px] text-white/40 leading-relaxed">
                Your Infinity badge is live. Check your email for a full welcome guide.
              </p>
            </div>

            <div className="w-full max-w-[280px] flex flex-col gap-2" style={{ animation: 'obSlideUp 0.5s 0.7s both' }}>
              <Link href="/"
                className="flex h-10 sm:h-11 w-full items-center justify-center gap-2 rounded-[12px] font-black text-[13px] sm:text-[14px] transition-all active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#ffffff', boxShadow: '0 4px 24px rgba(99,102,241,0.45)' }}>
                Go to Dashboard ∞
              </Link>
              <div className="grid grid-cols-2 gap-2">
                <Link href={`/u/${(session?.user as { id?: string })?.id ?? ''}`}
                  className="flex h-9 items-center justify-center rounded-[11px] border border-white/[0.08] bg-white/[0.03] text-[12px] font-bold text-white/45 hover:bg-white/[0.07] transition-all">
                  My profile
                </Link>
                <Link href="/people"
                  className="flex h-9 items-center justify-center rounded-[11px] border border-white/[0.08] bg-white/[0.03] text-[12px] font-bold text-white/45 hover:bg-white/[0.07] transition-all">
                  Find people
                </Link>
              </div>
            </div>
          </div>
        );

        /* ── Skipped / normal done state ── */
        if (goPhase === 'skipped') return (
          <div className="flex flex-col items-center text-center gap-4" style={{ animation: 'obSlideUp 0.5s both' }}>
            <div className="relative mx-auto h-20 w-20" style={{ animation: 'obScaleIn 0.6s 0.1s both' }}>
              <div className="absolute inset-0 rounded-full border border-white/[0.10] bg-white/[0.03]" />
              <svg className="absolute inset-0 h-20 w-20 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1.5" />
                <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2"
                  strokeDasharray="226" strokeLinecap="round"
                  style={{ animation: 'obCheckDraw 1.2s 0.3s cubic-bezier(.4,0,.2,1) both' }} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center" style={{ animation: 'obScaleIn 0.4s 1.1s both', opacity: 0 }}>
                <CheckCircle2 className="h-9 w-9 text-white/80" />
              </div>
            </div>
            <div>
              <h2 className="text-[1.55rem] sm:text-[1.75rem] font-black tracking-tight text-white">
                {userName ? `You're in, ${userName.split(' ')[0]}!` : "You're all set!"}
              </h2>
              <p className="mt-1.5 max-w-[240px] mx-auto text-[12px] text-white/38 leading-relaxed">
                Your profile is live. Start publishing, signing, and connecting.
              </p>
            </div>
            <div className="w-full max-w-[260px] flex flex-col gap-2">
              <Link href="/" className={`h-10 sm:h-11 w-full ${WHITE_BTN}`} style={WHITE_BTN_SHADOW}>
                Go to Dashboard <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <div className="grid grid-cols-2 gap-2">
                <Link href={`/u/${(session?.user as { id?: string })?.id ?? ''}`}
                  className="flex h-9 items-center justify-center rounded-[11px] border border-white/[0.08] bg-white/[0.03] text-[12px] font-bold text-white/45 hover:bg-white/[0.07] transition-all">
                  My profile
                </Link>
                <Link href="/people"
                  className="flex h-9 items-center justify-center rounded-[11px] border border-white/[0.08] bg-white/[0.03] text-[12px] font-bold text-white/45 hover:bg-white/[0.07] transition-all">
                  Find people
                </Link>
              </div>
              {/* Soft upsell nudge */}
              <button onClick={() => setGoPhase('offer')} className="mt-1 text-[10.5px] text-white/20 hover:text-white/45 transition-colors underline underline-offset-2">
                See Infinity offer
              </button>
            </div>
          </div>
        );

        /* ── Default: offer state ── */
        const handleGoPayment = async () => {
          setGoError('');
          setGoPhase('paying');
          try {
            const res = await fetch('/api/billing/infinity', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ period: 'annual' }),
            });
            const data = await res.json() as { order?: { id: string; amount: number; currency: string }; keyId?: string; customer?: { name: string; email: string }; error?: string };
            if (!res.ok || !data.order?.id) {
              setGoError(data.error ?? 'Could not initiate payment. Please try again.');
              setGoPhase('offer');
              return;
            }

            const win = window as typeof window & { Razorpay?: new (opts: Record<string, unknown>) => { open(): void } };
            if (!win.Razorpay) {
              setGoError('Payment gateway failed to load. Please refresh and retry.');
              setGoPhase('offer');
              return;
            }

            const rz = new win.Razorpay({
              key: data.keyId,
              amount: data.order.amount,
              currency: data.order.currency || 'INR',
              name: 'Docrud',
              description: 'Infinity ∞ — Annual Plan',
              order_id: data.order.id,
              prefill: { name: data.customer?.name || '', email: data.customer?.email || '' },
              theme: { color: '#6366f1' },
              modal: { backdropclose: false },
              handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
                try {
                  const vRes = await fetch('/api/billing/infinity', {
                    method: 'PUT',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ ...response, period: 'annual' }),
                  });
                  const vData = await vRes.json() as { success?: boolean; error?: string };
                  if (vData.success) {
                    setGoPhase('success');
                  } else {
                    setGoError(vData.error ?? 'Verification failed. Contact support.');
                    setGoPhase('offer');
                  }
                } catch {
                  setGoError('Verification failed. Contact support.');
                  setGoPhase('offer');
                }
              },
              'modal.ondismiss': () => {
                if (goPhase === 'paying') setGoPhase('offer');
              },
            });
            rz.open();
          } catch {
            setGoError('Something went wrong. Please try again.');
            setGoPhase('offer');
          }
        };

        /* ── Refer phase: share referral link ── */
        if (goPhase === 'refer') return (
          <div className="flex flex-col gap-4" style={{ animation: 'obSlideUp 0.35s both' }}>
            {/* Header */}
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#818cf8)', boxShadow: '0 6px 28px rgba(99,102,241,0.40)' }}>
                <svg className="h-7 w-7 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </div>
              <h3 className="text-[1.3rem] font-black tracking-[-0.03em] text-white">Refer &amp; Earn Free</h3>
              <p className="mt-1 text-[11px] text-white/38 max-w-[240px] mx-auto leading-relaxed">
                Share your link. When someone signs up with your code, <span style={{ color: '#a5b4fc' }}>both of you get 1 month of Infinity free</span>.
              </p>
            </div>

            {/* How it works — 3 steps */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { n: '1', label: 'Share your link' },
                { n: '2', label: 'Friend signs up' },
                { n: '3', label: '1 month Infinity free' },
              ].map(({ n, label }, i) => (
                <div key={n} className="flex flex-col items-center gap-1.5 rounded-[12px] py-3 px-2"
                  style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)', animation: `obSlideUp 0.3s ${i * 0.06}s ease both` }}>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black"
                    style={{ background: 'linear-gradient(135deg,#4f46e5,#818cf8)', color: '#fff' }}>{n}</span>
                  <span className="text-[9.5px] font-semibold text-white/50 text-center leading-tight">{label}</span>
                </div>
              ))}
            </div>

            {/* Referral link */}
            <div className="rounded-[14px] p-[1.5px]"
              style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.45),rgba(165,180,252,0.30),rgba(99,102,241,0.45))' }}>
              <div className="rounded-[13px] bg-[#06060f] px-3 py-3">
                <p className="mb-1.5 text-[9.5px] font-black uppercase tracking-[0.2em]" style={{ color: '#818cf8' }}>Your Referral Link</p>
                {refLinkLoading ? (
                  <div className="h-9 animate-pulse rounded-xl bg-white/[0.06]" />
                ) : (
                  <div className="flex gap-2">
                    <div className="flex-1 truncate rounded-xl border border-white/[0.09] bg-white/[0.04] px-2.5 py-2 font-mono text-[10px] text-white/65">
                      {refLink || '—'}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!refLink) return;
                        navigator.clipboard.writeText(refLink).then(() => {
                          setRefCopied(true);
                          setTimeout(() => setRefCopied(false), 2200);
                        });
                      }}
                      disabled={!refLink}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.06] transition hover:bg-white/[0.12] disabled:opacity-30"
                      title="Copy link"
                    >
                      {refCopied
                        ? <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        : <svg className="h-4 w-4 text-white/55" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                      }
                    </button>
                  </div>
                )}
                {refCode && (
                  <p className="mt-1 text-[9.5px] text-white/25">Code: <span className="font-mono font-bold text-white/45">{refCode}</span></p>
                )}
                {refCopied && (
                  <p className="mt-1 text-[10px] font-semibold text-emerald-400" style={{ animation: 'obScaleIn 0.2s both' }}>✓ Copied to clipboard!</p>
                )}
              </div>
            </div>

            {/* Email invite */}
            <div>
              <p className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-white/28">Send a direct invite</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={refInviteEmail}
                  onChange={(e) => setRefInviteEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (!refSending && refInviteEmail.trim()) {
                        setRefSendErr('');
                        setRefSentMsg('');
                        setRefSending(true);
                        fetch('/api/referrals/invite', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ email: refInviteEmail.trim() }),
                        })
                          .then(r => r.json())
                          .then((d: { success?: boolean; error?: string }) => {
                            if (d.success) { setRefSentMsg(`Invite sent to ${refInviteEmail.trim()} ✓`); setRefInviteEmail(''); }
                            else throw new Error(d.error || 'Failed');
                          })
                          .catch((err: unknown) => setRefSendErr(err instanceof Error ? err.message : 'Failed to send.'))
                          .finally(() => setRefSending(false));
                      }
                    }
                  }}
                  placeholder="colleague@company.com"
                  className="h-10 flex-1 rounded-xl border border-white/[0.09] bg-white/[0.04] px-3 text-[12px] text-white placeholder:text-white/22 outline-none transition focus:border-indigo-500/25 focus:ring-2 focus:ring-indigo-500/[0.08]"
                />
                <button
                  type="button"
                  disabled={refSending || !refInviteEmail.trim()}
                  onClick={() => {
                    setRefSendErr('');
                    setRefSentMsg('');
                    setRefSending(true);
                    fetch('/api/referrals/invite', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email: refInviteEmail.trim() }),
                    })
                      .then(r => r.json())
                      .then((d: { success?: boolean; error?: string }) => {
                        if (d.success) { setRefSentMsg(`Sent ✓`); setRefInviteEmail(''); }
                        else throw new Error(d.error || 'Failed');
                      })
                      .catch((err: unknown) => setRefSendErr(err instanceof Error ? err.message : 'Failed.'))
                      .finally(() => setRefSending(false));
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-500/25 bg-indigo-500/[0.10] transition hover:bg-indigo-500/[0.18] disabled:opacity-40"
                >
                  {refSending
                    ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-300/30 border-t-indigo-300" />
                    : <svg className="h-4 w-4 text-indigo-300" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                  }
                </button>
              </div>
              {refSentMsg && <p className="mt-1.5 text-[10.5px] text-emerald-400" style={{ animation: 'obScaleIn 0.2s both' }}>{refSentMsg}</p>}
              {refSendErr && <p className="mt-1.5 text-[10.5px] text-rose-400">{refSendErr}</p>}
            </div>

            <p className="text-center text-[9.5px] text-white/20 leading-4">
              Referrals can be sent to multiple people. Docrud Infinity activates <strong className="text-white/30">once per referrer</strong> — the moment a referred profile is created.
            </p>

            {/* Back + skip */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setGoPhase('offer')}
                className="flex items-center gap-1 text-[11px] text-white/25 hover:text-white/50 transition"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                Back to offer
              </button>
              <button
                type="button"
                onClick={() => setGoPhase('skipped')}
                className="text-[11px] text-white/20 hover:text-white/45 transition"
              >
                Skip →
              </button>
            </div>
          </div>
        );

        return (
          <div className="flex flex-col gap-4">

            {/* ── Welcome header ── */}
            <div style={{ animation: 'obSlideUp 0.45s both' }} className="text-center">
              {/* Animated check ring */}
              <div className="relative mx-auto mb-3 h-16 w-16">
                <div className="absolute -inset-3 rounded-full"
                  style={{ background: 'radial-gradient(circle,rgba(52,211,153,0.18) 0%,transparent 65%)', animation: 'obGlow 3s ease-in-out infinite' }} />
                <div className="absolute inset-0 flex items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/[0.07]">
                  <svg className="absolute inset-0 h-16 w-16 -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="29" fill="none" stroke="rgba(52,211,153,0.12)" strokeWidth="1.5" />
                    <circle cx="32" cy="32" r="29" fill="none" stroke="rgba(52,211,153,0.6)" strokeWidth="2" strokeLinecap="round"
                      strokeDasharray="182" strokeDashoffset="0"
                      style={{ animation: 'obCheckDraw 1.2s 0.2s cubic-bezier(.4,0,.2,1) both' }} />
                  </svg>
                  <CheckCircle2 className="h-7 w-7 text-emerald-400" style={{ animation: 'obScaleIn 0.4s 1.0s both', opacity: 0 }} />
                </div>
              </div>
              <h2 className="text-[1.4rem] sm:text-[1.6rem] font-black tracking-[-0.04em] text-white leading-tight">
                {userName ? `You're in, ${userName.split(' ')[0]}!` : "You're all set!"}
              </h2>
              <p className="mt-1 text-[11.5px] text-white/38">Your profile is live. Time to stand out.</p>
            </div>

            {/* ── Docrud Infinity Premium Card ── */}
            <div style={{ animation: 'obSlideUp 0.45s 0.12s both', opacity: 0, background: 'linear-gradient(135deg,#4f46e5 0%,#818cf8 35%,#a5b4fc 55%,#6366f1 80%,#3730a3 100%)' }}
              className="relative overflow-hidden rounded-[20px] p-[1.5px]">
              <div className="relative overflow-hidden rounded-[19px]" style={{ background: '#06060f' }}>

                {/* Ambient top glow */}
                <div className="pointer-events-none absolute inset-0"
                  style={{ background: 'radial-gradient(ellipse 100% 60% at 50% -5%,rgba(99,102,241,0.12) 0%,transparent 55%)' }} />

                {/* Shimmer line */}
                <div className="pointer-events-none absolute left-0 right-0 top-0 h-px"
                  style={{ background: 'linear-gradient(90deg,transparent 0%,rgba(165,180,252,0.55) 50%,transparent 100%)' }} />

                <div className="relative px-5 pt-5 pb-5">

                  {/* ── Top: plan name + price ── */}
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-[1.35rem] font-black tracking-[-0.04em] text-white leading-tight">
                        Infinity <span style={{ color: '#a5b4fc' }}>∞</span>
                      </h3>
                      <p className="text-[8.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'rgba(165,180,252,0.50)' }}>one plan · all access</p>
                      <p className="text-[10px] text-white/35 leading-snug mt-0.5">Unlock your verified professional identity.</p>
                    </div>

                    {/* Price block */}
                    <div className="shrink-0 text-right pt-0.5">
                      <div className="flex items-baseline justify-end gap-1 mb-0.5">
                        <span className="text-[10px] text-white/25 line-through">₹3,588</span>
                        <span className="text-[26px] font-black leading-none tracking-[-0.03em]" style={{ color: '#a5b4fc' }}>₹2,499</span>
                      </div>
                      <span className="text-[9px] text-white/28">per year · billed annually</span>
                    </div>
                  </div>

                  {/* ── Scarcity bar — live data ── */}
                  <div className="mb-4 rounded-[10px] px-3 py-2.5"
                    style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.16)' }}>
                    {goStats === null ? (
                      /* Loading skeleton */
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="h-2.5 w-20 rounded-full animate-pulse bg-white/[0.08]" />
                          <div className="h-2.5 w-14 rounded-full animate-pulse bg-white/[0.08]" />
                        </div>
                        <div className="h-1.5 w-full rounded-full animate-pulse bg-white/[0.06]" />
                        <div className="h-2 w-36 rounded-full animate-pulse bg-white/[0.05]" />
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[9.5px] font-bold text-white/45">Spots claimed</span>
                          <span className="text-[9.5px] font-black" style={{ color: '#818cf8' }}>
                            {goStats.claimed.toLocaleString()} / {goStats.total.toLocaleString()}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${goStats.pct}%`, background: 'linear-gradient(90deg,#4f46e5,#818cf8)' }} />
                        </div>
                        <p className="mt-1.5 text-[9px] text-white/30">
                          Limited to first <span className="font-black text-white/50">{goStats.total.toLocaleString()} users</span> only
                          {goStats.remaining > 0
                            ? <> — <span style={{ color: '#818cf8' }}>{goStats.remaining.toLocaleString()} spots left.</span></>
                            : <span style={{ color: '#fb7185' }}> — offer closed.</span>
                          }
                        </p>
                      </>
                    )}
                  </div>

                  {/* ── Divider ── */}
                  <div className="mb-4 h-px" style={{ background: 'linear-gradient(90deg,rgba(99,102,241,0.18),rgba(99,102,241,0.04) 80%,transparent)' }} />

                  {/* ── 3 benefit pillars ── */}
                  <div className="mb-4 grid grid-cols-3 gap-2">
                    {[
                      { icon: '🔍', title: 'More Visibility',  desc: '3× profile views & priority search' },
                      { icon: '⚡', title: 'Advanced Access',  desc: 'Premium gigs, AI tools & features'  },
                      { icon: '∞', title: 'Infinity Badge',   desc: 'Verified badge, instant credibility'  },
                    ].map(({ icon, title, desc }) => (
                      <div key={title} className="flex flex-col items-center gap-1.5 rounded-[11px] px-2 py-3"
                        style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.12)' }}>
                        <span className="text-[16px] leading-none" style={icon === '∞' ? { color: '#a5b4fc', fontWeight: 900 } : undefined}>{icon}</span>
                        <p className="text-[9px] font-black text-white/78 leading-tight text-center">{title}</p>
                        <p className="text-[8px] text-white/32 leading-snug text-center">{desc}</p>
                      </div>
                    ))}
                  </div>

                  {/* ── Social proof ── */}
                  <div className="mb-4 flex items-center gap-2.5 rounded-[10px] px-3 py-2.5"
                    style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.055)' }}>
                    <div className="flex shrink-0 -space-x-1.5">
                      {[['K','#6366f1'],['R','#7c3aed'],['A','#0ea5e9'],['S','#10b981']].map(([init, bg]) => (
                        <div key={init} className="flex h-5 w-5 items-center justify-center rounded-full border border-[#06060f] text-[7px] font-black text-white"
                          style={{ background: bg }}>
                          {init}
                        </div>
                      ))}
                    </div>
                    <p className="text-[9.5px] text-white/35 leading-tight">
                      <span className="font-bold text-white/58">2,800+ professionals</span> upgraded this month
                    </p>
                  </div>

                  {/* ── Error ── */}
                  {goError && (
                    <div className="mb-3 rounded-[9px] border border-rose-500/20 bg-rose-500/[0.07] px-3 py-2 text-[11px] text-rose-300/80">
                      {goError}
                    </div>
                  )}

                  {/* ── CTA row ── */}
                  <div className="flex items-stretch gap-2">

                    {/* Earn Free — secondary */}
                    <button
                      type="button"
                      onClick={() => {
                        setGoPhase('refer');
                        if (!refLink) {
                          setRefLinkLoading(true);
                          fetch('/api/referrals/stats')
                            .then(r => r.json())
                            .then((d: { link?: string; code?: string }) => {
                              setRefLink(d.link || '');
                              setRefCode(d.code || '');
                            })
                            .catch(() => {})
                            .finally(() => setRefLinkLoading(false));
                        }
                      }}
                      className="flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-[12px] h-11 px-3.5 font-bold text-[10.5px] tracking-[0.01em] transition-all active:scale-[0.97] border whitespace-nowrap hover:bg-indigo-500/10"
                      style={{ borderColor: 'rgba(99,102,241,0.28)', background: 'rgba(99,102,241,0.05)', color: 'rgba(165,180,252,0.80)' }}>
                      <svg className="h-3.5 w-3.5 shrink-0 mb-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                      </svg>
                      Earn Free
                    </button>

                    {/* Unlock Infinity — primary */}
                    <button
                      onClick={() => void handleGoPayment()}
                      disabled={goPhase === 'paying'}
                      className="flex-1 flex items-center justify-center gap-2 rounded-[12px] h-11 font-black text-[13px] tracking-[-0.01em] transition-all active:scale-[0.98] disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg,#4f46e5 0%,#6366f1 50%,#4f46e5 100%)', color: '#ffffff', boxShadow: '0 4px 28px rgba(99,102,241,0.50), inset 0 1px 0 rgba(255,255,255,0.15)' }}>
                      {goPhase === 'paying'
                        ? <><div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Processing…</>
                        : <>∞ Unlock Infinity — ₹2,499/yr</>
                      }
                    </button>
                  </div>

                  {/* ── Sub-note ── */}
                  <p className="mt-2.5 text-center text-[9px] text-white/22">
                    Secure payment · Instant activation · Renews yearly
                  </p>
                </div>
              </div>
            </div>

            {/* Skip */}
            <button
              onClick={() => setGoPhase('skipped')}
              style={{ animation: 'obFadeIn 0.5s 0.35s both', opacity: 0 }}
              className="text-center text-[10.5px] text-white/18 hover:text-white/42 transition-colors">
              Continue without upgrading →
            </button>
          </div>
        );
      }

      default: return null;
    }
  }

  /* ════════════ MAIN RENDER ════════════ */
  return (
    <div className="relative flex min-h-[100dvh] overflow-hidden text-white"
      style={{ background: 'radial-gradient(circle at 0% 0%, rgba(249,115,22,0.10) 0%, transparent 38%), radial-gradient(circle at 100% 100%, rgba(249,115,22,0.10) 0%, transparent 38%), #050508' }}>
      <SplashScreen visible={showSplash} onSkip={() => { setShowSplash(false); setScreen(SIGNUP_SCR); }} />
      <BgOrbs />

      {/* LEFT PANEL — desktop only */}
      <div className="relative hidden lg:flex lg:w-[52%] xl:w-[56%] shrink-0 flex-col overflow-hidden h-[100dvh]">
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/[0.07] to-transparent" />
        <div className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at 30% 50%,rgba(255,255,255,0.015) 0%,transparent 60%)' }} />
        <ScreenIn key={`left-${screen}`} className="h-full">
          <LeftPanelSwitch screen={screen} headline={headline} bio={bio} sName={sName} sEmail={sEmail} avatarUrl={avatarUrl} bannerUrl={bannerUrl} location={location} openToWork={openToWork} skills={skills} />
        </ScreenIn>
      </div>

      {/* RIGHT PANEL — full screen on mobile, side panel on desktop */}
      <div className="relative flex h-[100dvh] w-full flex-col lg:w-[48%] xl:w-[44%]">

        {/* Always-mounted hidden file inputs — never unmount so refs stay valid */}
        <input ref={bannerFileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleBannerFile} />
        <input ref={avatarFileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleAvatarFile} />
        <input ref={resumeFileRef} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={handleResumeFile} />

        {/* Top bar — fixed height */}
        <div className="relative z-10 flex h-12 shrink-0 items-center justify-between px-5 sm:px-6">
          {(screen === SKILLS_SCR || screen === PEOPLE_SCR) ? (
            <button
              onClick={prev}
              className="flex items-center gap-1.5 rounded-[9px] border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[10.5px] font-semibold text-white/38 hover:text-white/60 hover:bg-white/[0.06] transition-all">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          ) : (
            <span className="text-[10.5px] font-semibold text-white/20">
              {isTour ? `${screen + 1} of ${TOUR_END + 1}` : screen < DONE_SCR ? `Step ${postAuthStep} of ${postAuthTotal}` : ''}
            </span>
          )}
          {screen < DONE_SCR && (
            <button onClick={skip}
              className="rounded-[9px] border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[10.5px] font-semibold text-white/28 hover:text-white/50 hover:bg-white/[0.06] transition-all">
              Skip to login
            </button>
          )}
          {/* Gold progress bar — below top bar */}
          {!isTour && screen < DONE_SCR && (
            <div className="absolute bottom-0 inset-x-0 h-[2px] bg-white/[0.04]">
              <div className="h-full rounded-r-full transition-all duration-700 ease-out" style={{ width: `${progressPct}%`, background: GOLD_GRAD }} />
            </div>
          )}
        </div>

        {/* Scrollable content area */}
        <div className="relative flex flex-col flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="pointer-events-none absolute inset-0 bg-[#050508]/15" />
          <div className="relative z-10 mx-auto w-full max-w-[380px] px-5 sm:px-7 pt-5 pb-8">
            <ScreenIn key={screen}>
              {renderForm()}
            </ScreenIn>
          </div>
        </div>

        {/* Bottom — step dots or padding */}
        <div className="relative z-10 flex h-12 shrink-0 items-center justify-center">
          {isTour && (
            <div className="flex gap-2">
              {Array.from({ length: TOUR_END + 1 }).map((_, i) => (
                <button key={i} onClick={() => setScreen(i)}
                  className="rounded-full transition-all duration-300"
                  style={i === screen
                    ? { width: 24, height: 6, background: GOLD_GRAD, boxShadow: '0 0 8px rgba(212,175,55,0.40)' }
                    : { width: 6,  height: 6, background: 'rgba(255,255,255,0.18)' }
                  } />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingPageInner />
    </Suspense>
  );
}
