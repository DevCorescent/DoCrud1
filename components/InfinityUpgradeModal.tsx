'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  X, Crown, Zap, Building2, MessageSquare, Star,
  FileSignature, HardDrive, Check, FileText, Eye,
} from 'lucide-react';

type InfinityFeature = 'business_page' | 'services_limit' | 'chat' | 'public_face' | 'esign' | 'drive' | 'resume' | 'profile_intelligence';

interface Props {
  feature: InfinityFeature;
  onClose: () => void;
  returnTo?: string;
}

const FEATURE_META: Record<InfinityFeature, { icon: React.ReactNode; title: string; desc: string; color: string; glow: string }> = {
  business_page: {
    icon: <Building2 className="w-5 h-5" />,
    title: 'Business Pages require Infinity',
    desc: 'Create a verified business presence with products, jobs, events, and analytics.',
    color: 'text-violet-400',
    glow: 'shadow-[0_0_40px_rgba(124,58,237,0.25)]',
  },
  services_limit: {
    icon: <Zap className="w-5 h-5" />,
    title: 'Unlimited Services require Infinity',
    desc: 'You\'ve reached the 2-service limit for free accounts. Upgrade to list as many as you need.',
    color: 'text-amber-400',
    glow: 'shadow-[0_0_40px_rgba(245,158,11,0.2)]',
  },
  chat: {
    icon: <MessageSquare className="w-5 h-5" />,
    title: 'Direct Messaging requires Infinity',
    desc: 'Connect with professionals, clients, and collaborators with full messaging access.',
    color: 'text-sky-400',
    glow: 'shadow-[0_0_40px_rgba(56,189,248,0.2)]',
  },
  public_face: {
    icon: <Star className="w-5 h-5" />,
    title: 'Public Face Badge requires Infinity',
    desc: 'Apply for Public Face status and get a verified badge visible across the platform.',
    color: 'text-pink-400',
    glow: 'shadow-[0_0_40px_rgba(236,72,153,0.2)]',
  },
  esign: {
    icon: <FileSignature className="w-5 h-5" />,
    title: 'E-Signing requires Infinity',
    desc: 'Send documents for e-signature with OTP verification, reminders, and audit trails.',
    color: 'text-emerald-400',
    glow: 'shadow-[0_0_40px_rgba(52,211,153,0.2)]',
  },
  resume: {
    icon: <FileText className="w-5 h-5" />,
    title: 'Resume downloads require Infinity',
    desc: 'Download resumes from other profiles, and see who viewed your profile or downloaded yours.',
    color: 'text-indigo-400',
    glow: 'shadow-[0_0_40px_rgba(129,140,248,0.22)]',
  },
  profile_intelligence: {
    icon: <Eye className="w-5 h-5" />,
    title: 'Profile intelligence requires Infinity',
    desc: 'See exactly who viewed your profile and who downloaded your resume, with names and profile links.',
    color: 'text-indigo-400',
    glow: 'shadow-[0_0_40px_rgba(129,140,248,0.22)]',
  },
  drive: {
    icon: <HardDrive className="w-5 h-5" />,
    title: '5 GB Drive Storage with Infinity',
    desc: 'Get 5 GB of free cloud storage for your files, documents, and media.',
    color: 'text-cyan-400',
    glow: 'shadow-[0_0_40px_rgba(34,211,238,0.2)]',
  },
};

const PERKS = [
  { icon: <Building2 className="w-3.5 h-3.5" />, label: 'Business Pages' },
  { icon: <Zap className="w-3.5 h-3.5" />,        label: 'Unlimited Services' },
  { icon: <MessageSquare className="w-3.5 h-3.5" />, label: 'Direct Messaging' },
  { icon: <Star className="w-3.5 h-3.5" />,       label: 'Public Face Badge' },
  { icon: <FileSignature className="w-3.5 h-3.5" />, label: 'E-Sign Documents' },
  { icon: <HardDrive className="w-3.5 h-3.5" />,  label: '5 GB Drive Storage' },
  { icon: <FileText className="w-3.5 h-3.5" />,   label: 'Resume Downloads' },
  { icon: <Eye className="w-3.5 h-3.5" />,        label: 'Profile Visitor Insights' },
];

export default function InfinityUpgradeModal({ feature, onClose, returnTo }: Props) {
  const router = useRouter();
  const meta = FEATURE_META[feature];

  function goToCheckout() {
    const params = new URLSearchParams();
    if (returnTo) params.set('returnTo', returnTo);
    router.push(`/infinity${params.size ? `?${params}` : ''}`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto px-4 py-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Card */}
      <div className={`relative w-full max-w-md my-auto rounded-3xl border border-violet-500/20 bg-[#0e0e1a] overflow-hidden ${meta.glow}`}>
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors z-10"
        >
          <X className="w-4 h-4 text-zinc-400" />
        </button>

        {/* Purple header band */}
        <div className="bg-gradient-to-r from-violet-700 to-purple-700 px-6 pt-6 pb-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <Crown className="w-4 h-4 text-amber-300" />
              <span className="text-xs font-bold text-amber-300 tracking-widest uppercase">Docrud Infinity</span>
            </div>
            <div className={`w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center mb-3 ${meta.color}`}>
              {meta.icon}
            </div>
            <h2 className="text-lg font-bold text-white leading-tight">{meta.title}</h2>
            <p className="text-sm text-white/70 mt-1 leading-relaxed">{meta.desc}</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="text-xs text-zinc-500 font-semibold uppercase tracking-widest mb-3">Everything included</p>
          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2 mb-6">
            {PERKS.map((p) => (
              <div key={p.label} className="flex items-center gap-2 text-xs text-zinc-300">
                <div className="w-5 h-5 rounded-full bg-violet-500/15 flex items-center justify-center text-violet-400 flex-shrink-0">
                  <Check className="w-2.5 h-2.5" />
                </div>
                {p.label}
              </div>
            ))}
          </div>

          {/* Pricing callout */}
          <div className="bg-violet-500/8 border border-violet-500/15 rounded-2xl px-4 py-3 mb-5 flex items-center justify-between">
            <div>
              <div className="text-white font-bold text-lg">₹2,499<span className="text-zinc-400 text-xs font-normal">/year</span></div>
              <div className="text-zinc-500 text-xs">or ₹299/month · +GST</div>
            </div>
            <div className="bg-amber-500/20 text-amber-400 text-xs font-bold border border-amber-500/30 rounded-full px-2.5 py-1">
              Save 30%
            </div>
          </div>

          <button
            onClick={goToCheckout}
            className="w-full h-12 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold text-sm flex items-center justify-center gap-2 hover:from-violet-500 hover:to-purple-500 transition-all shadow-[0_8px_24px_rgba(124,58,237,0.3)]"
          >
            <Crown className="w-4 h-4" />
            Upgrade to Infinity
          </button>
          <button
            onClick={onClose}
            className="w-full mt-2 h-9 rounded-xl text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
