'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Eye,
  EyeOff,
  FileSignature,
  FileText,
  FormInput,
  LockKeyhole,
  PenLine,
  Shield,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Zap,
  Network,
  Award,
  Layers,
  Share2,
} from 'lucide-react';
import { requiredPolicyIds, policyDefinitions } from '@/lib/policies';
import AnimatedLoginBackground from '@/components/AnimatedLoginBackground';

/* ─────────────────────────────────────────────────────────────
   Feature showcase data
───────────────────────────────────────────────────────────── */
const FEATURES = [
  {
    id: 'esign',
    icon: FileSignature,
    name: 'E-Sign Studio',
    tagline: 'Legally-binding digital signatures',
    desc: 'Send, sign, and track contracts with OTP verification, real-time audit trails, and witness signing.',
    color: '#E8EDFF',
    accentHex: 'rgba(255,255,255,0.12)',
  },
  {
    id: 'docai',
    icon: Bot,
    name: 'Document AI',
    tagline: 'Generate compliant docs in seconds',
    desc: 'Create NDAs, invoices, offer letters, and contracts from smart templates using built-in AI.',
    color: '#F0EBF8',
    accentHex: 'rgba(255,255,255,0.10)',
  },
  {
    id: 'docword',
    icon: PenLine,
    name: 'DocWord Studio',
    tagline: 'Real-time collaborative editor',
    desc: 'Write, edit, and co-author professional documents with live AI suggestions and version history.',
    color: '#E8F5EF',
    accentHex: 'rgba(255,255,255,0.08)',
  },
  {
    id: 'forms',
    icon: FormInput,
    name: 'Smart Form Builder',
    tagline: 'Forms with conditional logic',
    desc: 'Build intelligent multi-step forms with embedded signatures, workflow routing, and analytics.',
    color: '#FDF3E3',
    accentHex: 'rgba(255,255,255,0.09)',
  },
  {
    id: 'pdf',
    icon: FileText,
    name: 'PDF Studio',
    tagline: 'Edit, annotate & share PDFs',
    desc: 'Upload, annotate, watermark, compress, and share secure PDFs with granular permission controls.',
    color: '#E6F1FB',
    accentHex: 'rgba(255,255,255,0.10)',
  },
  {
    id: 'vault',
    icon: Shield,
    name: 'Compliance Vault',
    tagline: 'SOC 2 & GDPR-ready storage',
    desc: 'Encrypted document storage with role-based access, automated retention policies, and audit logs.',
    color: '#F5E8E8',
    accentHex: 'rgba(255,255,255,0.08)',
  },
];

/* ─────────────────────────────────────────────────────────────
   Live activity ticker
───────────────────────────────────────────────────────────── */
const ACTIVITIES = [
  { icon: FileSignature, text: 'Arjun K. signed an NDA with Acme Corp', time: 'just now' },
  { icon: Bot,           text: 'Priya M. generated a ₹45,000 invoice',  time: '2m ago'  },
  { icon: Zap,           text: 'TechVentures posted a Design gig',       time: '4m ago'  },
  { icon: FileText,      text: 'Rahul S. published article to 14K readers', time: '7m ago' },
  { icon: FormInput,     text: 'Sneha P. submitted compliance form',     time: '11m ago' },
  { icon: Network,       text: 'Docrud welcomed 38 new professionals',   time: '18m ago' },
];

const METRICS = [
  { value: '24K+',  label: 'Docs signed'  },
  { value: '99.9%', label: 'Uptime SLA'   },
  { value: 'SOC 2', label: 'Certified'    },
  { value: 'GDPR',  label: 'Compliant'    },
];

/* ─────────────────────────────────────────────────────────────
   Feature mockup — mini product preview inside showcase card
───────────────────────────────────────────────────────────── */
function FeatureMockup({ id, visible }: { id: string; visible: boolean }) {
  const anim = visible ? 'obMockupIn 0.5s 0.15s ease both' : 'none';

  if (id === 'esign') return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0c0c10] overflow-hidden" style={{ animation: anim }}>
      <div className="flex items-center gap-2 border-b border-white/[0.05] px-4 py-2.5">
        <div className="flex gap-1.5">
          {[...Array(3)].map((_, i) => <div key={i} className="h-2 w-2 rounded-full bg-white/[0.10]" />)}
        </div>
        <span className="flex-1 text-center text-[10px] text-white/20">service_agreement.pdf</span>
        <div className="flex h-5 items-center rounded-md bg-white/[0.07] px-2 text-[8px] font-bold text-white/35">2 of 3</div>
      </div>
      <div className="p-4 space-y-2">
        {[90, 82, 94, 65, 78].map((w, i) => (
          <div key={i} className="h-[5px] rounded-full bg-white/[0.07]" style={{ width: `${w}%` }} />
        ))}
        <div className="mt-3 rounded-lg border border-dashed border-white/[0.12] bg-white/[0.02] p-3">
          <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/20 mb-2">Authorized Signature</div>
          {visible && (
            <svg viewBox="0 0 220 32" className="w-full h-7" fill="none">
              <path
                d="M6,20 C18,6 28,30 44,18 C54,10 64,26 82,18 C96,12 108,28 126,18 C138,10 150,28 168,18 C178,12 190,22 210,18"
                stroke="rgba(255,255,255,0.60)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray="320" strokeDashoffset="320"
                style={{ animation: 'obWaveSign 1.8s 0.6s ease-out forwards' }}
              />
            </svg>
          )}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <div className="flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.05] px-2.5 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-white/70" style={{ animation: 'obPulse 2s infinite' }} />
            <span className="text-[8.5px] font-bold text-white/55">OTP Verified</span>
          </div>
          <div className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[8.5px] text-white/28">Audit trail active</div>
        </div>
      </div>
    </div>
  );

  if (id === 'docai') return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0c0c10] overflow-hidden" style={{ animation: anim }}>
      <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3 w-3 text-white/30" />
          <span className="text-[10px] font-bold text-white/30">Document AI</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.05] px-2.5 py-1">
          <div className="h-1.5 w-1.5 rounded-full bg-white/60 animate-pulse" />
          <span className="text-[8.5px] font-bold text-white/45">Generating…</span>
        </div>
      </div>
      <div className="p-4">
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
          <Bot className="h-3.5 w-3.5 shrink-0 text-white/25" />
          <span className="text-[10px] text-white/35">Create NDA for 2 parties, 12-month term, India jurisdiction</span>
        </div>
        <div className="space-y-1.5">
          {visible && [100, 88, 95, 78, 90, 60].map((w, i) => (
            <div key={i} className="h-[5px] rounded-full bg-white/[0.07]"
              style={{ width: `${w}%`, animation: `obDocReveal 0.4s ${0.3 + i * 0.12}s ease both` }} />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex h-7 flex-1 items-center justify-center rounded-lg bg-white/[0.08] text-[9px] font-bold text-white/50">
            Download · PDF
          </div>
          <div className="flex h-7 flex-1 items-center justify-center rounded-lg bg-white text-[9px] font-bold text-[#0c0c10]">
            Open in DocWord
          </div>
        </div>
      </div>
    </div>
  );

  if (id === 'docword') return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0c0c10] overflow-hidden" style={{ animation: anim }}>
      <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <PenLine className="h-3 w-3 text-white/25" />
          <span className="text-[10px] text-white/25">Quarterly Report Q1 2025.docx</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-5 w-5 rounded-full border border-white/[0.10] bg-white/[0.08] text-[7px] font-bold text-white/40 flex items-center justify-center">R</div>
          <div className="h-5 w-5 rounded-full border border-white/[0.10] bg-white/[0.08] text-[7px] font-bold text-white/40 flex items-center justify-center -ml-1.5">P</div>
        </div>
      </div>
      <div className="p-4">
        <div className="mb-2 flex gap-2 border-b border-white/[0.05] pb-2">
          {['B', 'I', 'U', 'H1', 'H2', '¶'].map(c => (
            <div key={c} className="flex h-5 min-w-5 items-center justify-center rounded text-[9px] font-bold text-white/25 hover:bg-white/[0.06] px-1">{c}</div>
          ))}
        </div>
        <div className="space-y-1.5 text-[10.5px] text-white/50">
          <div className="text-[13px] font-bold text-white/75">Executive Summary</div>
          <div>Revenue grew <span className="text-white/70 font-semibold">34%</span> YoY driven by…</div>
          <div className="flex items-center gap-1">
            <span>Enterprise expansion continues in</span>
            {visible && (
              <span className="inline-block" style={{ animation: 'obCursorBlink 1s infinite' }}>
                <span className="inline-block w-0.5 h-3.5 bg-white/60 ml-0.5" />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (id === 'forms') return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0c0c10] overflow-hidden" style={{ animation: anim }}>
      <div className="border-b border-white/[0.05] px-4 py-2.5">
        <span className="text-[10px] font-bold text-white/30">Vendor Onboarding Form</span>
        <div className="mt-1 text-[9px] text-white/18">Step 2 of 4 — Company Details</div>
      </div>
      <div className="p-4 space-y-2.5">
        <div>
          <div className="mb-1 text-[9px] font-medium text-white/25">Company Name</div>
          <div className="h-8 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 flex items-center text-[10px] text-white/40">Acme Corp Pvt Ltd</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="mb-1 text-[9px] font-medium text-white/25">GSTIN</div>
            <div className="h-8 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 flex items-center text-[10px] text-white/30">27AABCU9603R1ZX</div>
          </div>
          <div>
            <div className="mb-1 text-[9px] font-medium text-white/25">Category</div>
            <div className="h-8 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 flex items-center text-[10px] text-white/30">Technology ▾</div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
          <div className="h-3.5 w-3.5 shrink-0 rounded border border-white/[0.14] bg-white/[0.08] flex items-center justify-center">
            {visible && <div className="h-2 w-2 rounded-sm bg-white/70" style={{ animation: 'obScaleIn 0.3s 0.8s both' }} />}
          </div>
          <span className="text-[9px] text-white/30">I accept the vendor terms & e-sign consent</span>
        </div>
        <div className="flex h-8 items-center justify-center rounded-lg bg-white text-[10px] font-black text-[#0c0c10]">
          Next Step →
        </div>
      </div>
    </div>
  );

  if (id === 'pdf') return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0c0c10] overflow-hidden" style={{ animation: anim }}>
      <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <FileText className="h-3 w-3 text-white/25" />
          <span className="text-[10px] text-white/25">report_final.pdf</span>
        </div>
        <div className="flex gap-1">
          {['Annotate', 'Share', 'Lock'].map(a => (
            <div key={a} className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[8px] text-white/30">{a}</div>
          ))}
        </div>
      </div>
      <div className="relative p-4">
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3 space-y-1.5">
          {[92, 85, 96, 70, 88].map((w, i) => (
            <div key={i} className="h-[5px] rounded-full bg-white/[0.08]" style={{ width: `${w}%` }} />
          ))}
          {visible && (
            <>
              <div className="absolute top-8 right-8 flex items-center gap-1.5 rounded-lg border border-white/[0.14] bg-[#0e0e14] px-2.5 py-1.5 shadow-xl"
                style={{ animation: 'obBidPop 0.4s 0.5s both' }}>
                <div className="h-2 w-2 rounded-full border border-white/30 bg-white/10" />
                <span className="text-[8.5px] font-bold text-white/55">Confidential</span>
              </div>
              <div className="absolute bottom-8 left-8 flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-[#0e0e14] px-2.5 py-1.5 shadow-lg"
                style={{ animation: 'obBidPop 0.4s 0.8s both' }}>
                <CheckCircle2 className="h-3 w-3 text-white/50" />
                <span className="text-[8.5px] text-white/40">Watermarked</span>
              </div>
            </>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between text-[9px] text-white/25">
          <span>Page 1 of 8</span>
          <span>🔒 Access controlled</span>
        </div>
      </div>
    </div>
  );

  /* vault */
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0c0c10] overflow-hidden" style={{ animation: anim }}>
      <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Shield className="h-3 w-3 text-white/30" />
          <span className="text-[10px] font-bold text-white/30">Compliance Vault</span>
        </div>
        <div className="rounded-full border border-white/[0.10] bg-white/[0.05] px-2.5 py-0.5 text-[8.5px] font-bold text-white/45">AES-256</div>
      </div>
      <div className="p-4 space-y-2">
        {[
          { name: 'NDA_Acme_2025.pdf',       role: 'Admin',   size: '84 KB' },
          { name: 'Q1_Compliance_Audit.pdf', role: 'View',    size: '1.2 MB' },
          { name: 'GDPR_Data_Map.xlsx',       role: 'Admin',   size: '340 KB' },
          { name: 'SOC2_Report_2024.pdf',     role: 'Locked',  size: '2.8 MB' },
        ].map((f, i) => (
          <div key={f.name} className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2"
            style={{ animation: visible ? `obSlideRight 0.35s ${0.1 + i * 0.08}s both` : 'none' }}>
            <FileText className="h-3.5 w-3.5 shrink-0 text-white/25" />
            <span className="flex-1 truncate text-[9.5px] text-white/50">{f.name}</span>
            <span className="text-[9px] text-white/22">{f.size}</span>
            <div className={`rounded-md px-1.5 py-0.5 text-[8px] font-bold ${f.role === 'Locked' ? 'bg-white/[0.04] text-white/20' : 'bg-white/[0.07] text-white/40'}`}>{f.role}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Activity ticker
───────────────────────────────────────────────────────────── */
function ActivityTicker() {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<'in' | 'out'>('in');

  useEffect(() => {
    const cycle = () => {
      setPhase('out');
      setTimeout(() => {
        setIdx(p => (p + 1) % ACTIVITIES.length);
        setPhase('in');
      }, 380);
    };
    const t = setInterval(cycle, 4200);
    return () => clearInterval(t);
  }, []);

  const a = ACTIVITIES[idx];
  const Icon = a.icon;
  const anim = phase === 'in' ? 'obTickerIn 0.35s ease both' : 'obTickerOut 0.35s ease both';

  return (
    <div className="flex items-center gap-3 overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
      <div className="relative shrink-0">
        <div className="h-1.5 w-1.5 rounded-full bg-white/60 animate-pulse" />
        <div className="absolute inset-0 rounded-full bg-white/20 animate-ping" />
      </div>
      <div className="min-w-0 flex-1 overflow-hidden" style={{ animation: anim }}>
        <div className="flex items-center gap-2">
          <Icon className="h-3 w-3 shrink-0 text-white/30" />
          <span className="truncate text-[11px] text-white/45">{a.text}</span>
          <span className="ml-auto shrink-0 text-[9.5px] text-white/22">{a.time}</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Left brand panel
───────────────────────────────────────────────────────────── */
function LeftPanel({ activeFeature, setActiveFeature, mounted }: {
  activeFeature: number;
  setActiveFeature: (i: number) => void;
  mounted: boolean;
}) {
  const f = FEATURES[activeFeature];

  return (
    <div className="relative hidden lg:flex lg:w-[480px] xl:w-[540px] shrink-0 flex-col justify-between border-r border-white/[0.05] px-9 py-8 xl:px-11 xl:py-9">

      {/* Scanline effect */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent"
          style={{ animation: 'obScanline 12s linear infinite' }} />
      </div>

      {/* Corner accent */}
      <div className="pointer-events-none absolute right-0 top-0 h-[240px] w-[240px] rounded-bl-full"
        style={{ background: 'radial-gradient(circle at top right, rgba(255,255,255,0.025) 0%, transparent 65%)' }} />

      {/* ── TOP: Logo row + headline inline ── */}
      <div style={{ animation: mounted ? 'obSlideUp 0.5s 0.05s ease both' : 'none', opacity: mounted ? undefined : 0 }}>

        {/* Logo + tagline on same row */}
        <div className="mb-5 flex items-center justify-between">
          <Link href="/" className="group flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-[13px] border border-white/[0.12] bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition group-hover:bg-white/[0.10]"
              style={{ animation: 'obGlow 5s ease-in-out infinite' }}>
              <div className="h-3.5 w-3.5 rotate-45 rounded-[3px] bg-gradient-to-br from-white via-slate-100 to-white/70" />
            </div>
            <span className="text-[17px] font-black tracking-[-0.04em] text-white">Docrud</span>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.22em] text-white/30">
              Platform
            </span>
          </Link>
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-2.5 w-2.5 text-white/25" />
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.22em] text-white/20">Professional workspace</span>
          </div>
        </div>

        {/* Single-line headline */}
        <h1 className="whitespace-nowrap text-[clamp(1.6rem,2.8vw,2.1rem)] font-black leading-[1.1] tracking-[-0.05em] text-white">
          Every document.{' '}
          <span className="bg-gradient-to-r from-white/95 via-white/60 to-white/30 bg-clip-text text-transparent">
            One platform.
          </span>
        </h1>
        <p className="mt-2 max-w-[380px] text-[12px] leading-[1.65] text-white/30">
          E-signatures, AI docs, PDF editing, smart forms, and a professional network — unified.
        </p>
      </div>

      {/* ── MIDDLE: Feature showcase ── */}
      <div style={{ animation: mounted ? 'obSlideUp 0.55s 0.2s ease both' : 'none', opacity: mounted ? undefined : 0 }}>

        {/* Section label + progress dots */}
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-white/18">Explore features</p>
          <div className="flex gap-1.5">
            {FEATURES.map((_, i) => (
              <button key={i} onClick={() => setActiveFeature(i)}
                className="rounded-full transition-all duration-300"
                style={{
                  width:      i === activeFeature ? 18  : 5,
                  height:     5,
                  background: i === activeFeature ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.15)',
                }} />
            ))}
          </div>
        </div>

        {/* Main showcase card */}
        <div className="overflow-hidden rounded-[18px] border border-white/[0.07] bg-white/[0.02] p-3.5"
          style={{ animation: 'obCardGlow 6s ease-in-out infinite' }}>

          {/* Feature header row */}
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.10] bg-white/[0.06]"
              key={`icon-${activeFeature}`}
              style={{ animation: 'obScaleIn 0.35s ease both' }}>
              <f.icon className="h-3.5 w-3.5 text-white/60" />
            </div>
            <div key={`text-${activeFeature}`} className="flex-1 min-w-0" style={{ animation: 'obFeatureSwitch 0.4s ease both' }}>
              <div className="text-[13px] font-black text-white">{f.name}</div>
              <div className="text-[10.5px] text-white/35">{f.tagline}</div>
            </div>
            <p className="shrink-0 max-w-[140px] text-[10px] leading-[1.55] text-white/28 text-right"
              key={`desc-${activeFeature}`}
              style={{ animation: 'obFeatureSwitch 0.4s 0.08s ease both' }}>
              {f.desc.split(',')[0]}
            </p>
          </div>

          {/* Product mockup */}
          <div key={`mockup-${activeFeature}`}>
            <FeatureMockup id={f.id} visible />
          </div>
        </div>

        {/* Feature quick-select pills */}
        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          {FEATURES.map((feat, i) => {
            const isA = i === activeFeature;
            return (
              <button key={feat.id} onClick={() => setActiveFeature(i)}
                className="flex items-center gap-1.5 rounded-[9px] border px-2 py-1.5 text-left transition-all duration-300"
                style={{
                  borderColor: isA ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)',
                  background:  isA ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                }}>
                <feat.icon className="h-2.5 w-2.5 shrink-0 transition-all duration-300"
                  style={{ color: isA ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.25)' }} />
                <span className="truncate text-[9.5px] font-semibold transition-colors duration-300"
                  style={{ color: isA ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.28)' }}>
                  {feat.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── BOTTOM: Activity + metrics ── */}
      <div style={{ animation: mounted ? 'obSlideUp 0.6s 0.35s ease both' : 'none', opacity: mounted ? undefined : 0 }}>

        {/* Activity ticker */}
        <div className="mb-3">
          <div className="mb-1.5 flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-white/30" />
            <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-white/18">Live activity</span>
          </div>
          <ActivityTicker />
        </div>

        {/* Metrics strip */}
        <div className="grid grid-cols-4 gap-1.5 rounded-[14px] border border-white/[0.06] bg-white/[0.02] p-2.5">
          {METRICS.map((m, i) => (
            <div key={m.label} className="text-center"
              style={{ animation: mounted ? `obCountUp 0.5s ${0.5 + i * 0.07}s ease both` : 'none' }}>
              <p className="text-[13px] font-black tracking-tight text-white">{m.value}</p>
              <p className="mt-0.5 text-[8.5px] leading-tight text-white/25">{m.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-2 rounded-[11px] border border-white/[0.05] bg-white/[0.015] px-3 py-2">
          <ShieldCheck className="h-3 w-3 shrink-0 text-white/28" />
          <p className="text-[10px] text-white/25">End-to-end encrypted · SOC 2 Type II · GDPR ready · 99.9% uptime</p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main login page
───────────────────────────────────────────────────────────── */
export default function LoginPage() {
  const [identifier, setIdentifier]           = useState('');
  const [password, setPassword]               = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [policyAccepted, setPolicyAccepted]   = useState(false);
  const [error, setError]                     = useState('');
  const [notice, setNotice]                   = useState('');
  const [isSubmitting, setIsSubmitting]       = useState(false);
  const [googleEnabled, setGoogleEnabled]     = useState(false);
  const [mounted, setMounted]                 = useState(false);
  const [activeFeature, setActiveFeature]     = useState(0);
  const router                                = useRouter();
  const identifierRef                         = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMounted(true);
    let alive = true;
    void fetch('/api/settings/auth')
      .then(r => r.json().catch(() => null))
      .then(p => { if (alive) setGoogleEnabled(Boolean(p?.googleEnabled)); })
      .catch(() => { if (alive) setGoogleEnabled(false); });
    return () => { alive = false; };
  }, []);

  /* Auto-cycle feature showcase */
  useEffect(() => {
    const t = setInterval(() => setActiveFeature(p => (p + 1) % FEATURES.length), 3800);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!policyAccepted) {
      setError('You must accept the required policies before using this platform.');
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await signIn('credentials', {
        email: identifier.trim(),
        password,
        policyAccepted: 'accepted',
        redirect: false,
        callbackUrl: '/',
      });
      if (!result) throw new Error('Unable to reach the authentication service. Please try again.');
      if (result.error) {
        setError(result.error === 'CredentialsSignin'
          ? 'Invalid credentials — check your email and password.'
          : `Login failed: ${result.error}`);
        return;
      }
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setNotice('');
    if (!policyAccepted) {
      setError('Accept the required policies before continuing with Google.');
      return;
    }
    await signIn('google', { callbackUrl: '/' });
  };

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-[#060608] text-white">

      {/* ══ LAYER 1 — animated background reused from the onboarding splash ══
           components/AnimatedLoginBackground.tsx — decorative only,
           aria-hidden + pointer-events:none, so it never blocks the form. */}
      <AnimatedLoginBackground className="z-0" />

      {/* ══ LAYER 2 — subtle dark overlay, keeps the form legible over the cards ══ */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(5,5,8,0.55) 0%, rgba(5,5,8,0.30) 55%, rgba(5,5,8,0.10) 80%, transparent 100%)' }}
      />

      <div className="relative z-10 mx-auto flex h-[100dvh] max-w-[1380px] flex-col lg:flex-row">

        {/* ── Left panel ── TEMPORARILY DISABLED.
            The panel markup lives in the LeftPanel component above and is left fully
            intact. It could not be wrapped in a JSX comment in place, because it
            already contains nested JSX comments and those cannot nest, so it is
            disabled here at the render site instead.
            To restore: uncomment the line below. */}
        {/* <LeftPanel activeFeature={activeFeature} setActiveFeature={setActiveFeature} mounted={mounted} /> */}

        {/* ════════════════════════════════════════════════════════
            RIGHT — FORM PANEL
        ════════════════════════════════════════════════════════ */}
        <div className="flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-3 sm:px-8 sm:py-6">

          {/* ── Form area ── */}
          <div className="relative w-full max-w-[420px]"
            style={{ animation: mounted ? 'obSlideUp 0.55s 0.15s ease both' : 'none', opacity: mounted ? undefined : 0 }}>

            {/* Form card — the single primary glass surface */}
            <div
              className="relative z-10 overflow-hidden rounded-[22px]"
              style={{
                background: 'rgba(20, 20, 24, 0.42)',
                backdropFilter: 'blur(28px) saturate(115%)',
                WebkitBackdropFilter: 'blur(28px) saturate(115%)',
                border: '1px solid rgba(255,255,255,0.09)',
                boxShadow: '0 24px 80px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
            >
              <div className="p-4 sm:p-6">
                <form onSubmit={e => void handleSubmit(e)} className="space-y-3">

                  {/* Email input */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-white/28 sm:text-[11px]">Email or login ID</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20">
                        <Users className="h-3.5 w-3.5" />
                      </span>
                      <input
                        ref={identifierRef}
                        type="text"
                        value={identifier}
                        onChange={e => setIdentifier(e.target.value)}
                        placeholder="name@company.com"
                        className="h-9 w-full rounded-[11px] border border-white/[0.08] bg-white/[0.04] pl-10 pr-4 text-[13px] text-white placeholder:text-white/18 outline-none transition-all duration-200 focus:border-white/[0.18] focus:bg-white/[0.06] focus:shadow-[0_0_0_3px_rgba(255,255,255,0.05)] sm:h-10 sm:rounded-[13px] sm:text-sm"
                        required
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  {/* Password input */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-white/28 sm:text-[11px]">Password</label>
                      <span className="text-[11px] text-white/22 hover:text-white/45 cursor-pointer transition-colors">Forgot?</span>
                    </div>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20">
                        <LockKeyhole className="h-3.5 w-3.5" />
                      </span>
                      <input
                        type={passwordVisible ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="h-9 w-full rounded-[11px] border border-white/[0.08] bg-white/[0.04] pl-10 pr-10 text-[13px] text-white placeholder:text-white/18 outline-none transition-all duration-200 focus:border-white/[0.18] focus:bg-white/[0.06] focus:shadow-[0_0_0_3px_rgba(255,255,255,0.05)] sm:h-10 sm:rounded-[13px] sm:text-sm"
                        required
                        autoComplete="current-password"
                      />
                      <button type="button" onClick={() => setPasswordVisible(v => !v)}
                        aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-lg text-white/25 transition hover:bg-white/[0.07] hover:text-white/55">
                        {passwordVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Policy checkbox */}
                  <div className="rounded-[11px] border border-white/[0.06] bg-white/[0.02] px-3 py-2 sm:rounded-[13px] sm:px-4 sm:py-3">
                    <label className="flex cursor-pointer items-start gap-2.5 text-[11px] leading-4 text-white/38 sm:text-[12px] sm:leading-5">
                      <div className="relative mt-0.5 shrink-0">
                        <input
                          type="checkbox"
                          checked={policyAccepted}
                          onChange={e => setPolicyAccepted(e.target.checked)}
                          className="peer h-4 w-4 cursor-pointer appearance-none rounded-[5px] border border-white/[0.18] bg-transparent transition checked:border-white/30 checked:bg-white/[0.12]"
                        />
                        <CheckCircle2 className="pointer-events-none absolute inset-0 h-4 w-4 scale-0 text-white transition peer-checked:scale-100" />
                      </div>
                      <span>
                        I agree to the{' '}
                        {policyDefinitions.filter(p => requiredPolicyIds.includes(p.id)).slice(0, 3).map((p, i) => (
                          <span key={p.id}>
                            {i > 0 ? ', ' : ''}
                            <Link href={p.href}
                              className="font-semibold text-white/55 underline underline-offset-2 decoration-white/18 hover:text-white/85 hover:decoration-white/45 transition">
                              {p.shortLabel}
                            </Link>
                          </span>
                        ))}
                        {' '}policies.
                      </span>
                    </label>
                  </div>

                  {/* Notices */}
                  {notice && !error && (
                    <div className="rounded-[11px] border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-[12.5px] text-white/50">
                      {notice}
                    </div>
                  )}
                  {error && (
                    <div className="flex items-start gap-2.5 rounded-[11px] border border-rose-500/20 bg-rose-500/[0.07] px-4 py-3 text-[12.5px] text-rose-300/85"
                      style={{ animation: 'obScaleIn 0.2s ease both' }}>
                      <span className="mt-0.5 shrink-0 text-rose-400">✕</span>
                      {error}
                    </div>
                  )}

                  {/* Submit button */}
                  <button type="submit" disabled={isSubmitting}
                    className="group relative flex h-9 w-full items-center justify-center gap-2 overflow-hidden rounded-[11px] bg-white text-[13px] font-black text-[#070709] shadow-[0_0_40px_rgba(255,255,255,0.08),inset_0_1px_0_rgba(255,255,255,0.6)] transition hover:bg-white/93 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050508] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:rounded-[13px] sm:text-[13.5px]">
                    <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                    <span className="relative">{isSubmitting ? 'Signing in…' : 'Sign in'}</span>
                    {!isSubmitting && <ArrowRight className="relative h-3.5 w-3.5 transition group-hover:translate-x-0.5" />}
                    {isSubmitting && (
                      <svg className="relative h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
                        <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    )}
                  </button>

                  {/* Google sign-in */}
                  {googleEnabled && (
                    <>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 border-t border-white/[0.05]" />
                        <span className="text-[10px] text-white/20">or</span>
                        <div className="flex-1 border-t border-white/[0.05]" />
                      </div>
                      <button type="button" onClick={() => void handleGoogleLogin()}
                        className="flex h-9 w-full items-center justify-center gap-2.5 rounded-[11px] border border-white/[0.07] bg-white/[0.03] text-[12px] font-semibold text-white/60 transition hover:bg-white/[0.07] hover:text-white sm:h-10 sm:rounded-[13px] sm:text-[13px]">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[conic-gradient(from_180deg,#34a853_0deg,#4285f4_120deg,#fbbc05_220deg,#ea4335_320deg,#34a853_360deg)] text-[8px] font-black text-white">G</span>
                        Google
                      </button>
                    </>
                  )}
                </form>
              </div>

              {/* Bottom row: guest + create profile */}
              <div className="flex items-center justify-between gap-2 border-t border-white/[0.04] px-4 py-2.5">
                <button type="button"
                  onClick={() => {
                    document.cookie = 'guestMode=1; path=/; SameSite=Lax; max-age=86400';
                    window.location.assign('/');
                  }}
                  className="flex items-center gap-1.5 rounded-[9px] border border-dashed border-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-white/30 transition hover:border-white/[0.12] hover:text-white/50">
                  <LockKeyhole className="h-3 w-3 shrink-0" />
                  Guest
                </button>
                <Link
                  href="/onboarding?start=signup"
                  className="group flex items-center gap-1.5 rounded-[9px] border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-white/38 transition hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white/65"
                >
                  <UserRound className="h-3 w-3 shrink-0" />
                  Create profile
                  <ArrowRight className="h-2.5 w-2.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>

            <p className="relative z-10 mt-3 text-center text-[10.5px] text-white/16 whitespace-nowrap overflow-hidden text-ellipsis">
              Protected by enterprise-grade encryption · Docrud Platform
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
