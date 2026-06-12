'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  Award,
  BookOpen,
  BriefcaseBusiness,
  Copy,
  Download,
  FileText,
  GraduationCap,
  Home,
  LifeBuoy,
  ListChecks,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Share2,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Wrench,
} from 'lucide-react';
import ClientDate from '@/components/ClientDate';
import { LandingSettings } from '@/types/document';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type ResumeEntry = {
  id: string;
  slug: string;
  displayName: string;
  avatarDataUrl?: string;
  headline?: string;
  location?: string;
  category: string;
  skills: string[];
  tags: string[];
  summary?: string;
  resumeText: string;
  resumeFileName?: string;
  resumeMimeType?: string;
  resumeDataUrl?: string;
  contact: {
    email?: string;
    phone?: string;
    linkedin?: string;
    website?: string;
    visibility: 'public' | 'members' | 'hidden';
  };
  viewCount: number;
  contactCount: number;
  updatedAt: string;
};

export default function PublicTalentProfilePage(props: {
  settings: LandingSettings;
  softwareName: string;
  accentLabel: string;
  entry: ResumeEntry;
}) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated' && Boolean(session?.user);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactError, setContactError] = useState('');
  const [contactPayload, setContactPayload] = useState<{ contact?: Record<string, string | undefined>; note?: string } | null>(null);
  const [resumePreviewOpen, setResumePreviewOpen] = useState(false);
  const [compatOpen, setCompatOpen] = useState(false);
  const [jdText, setJdText] = useState('');
  const [compatBusy, setCompatBusy] = useState(false);
  const [compatError, setCompatError] = useState('');
  const [compatResult, setCompatResult] = useState<any>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [analysis, setAnalysis] = useState<any>(null);
  const [pendingResumeAction, setPendingResumeAction] = useState<'download' | 'preview' | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallBusy, setPaywallBusy] = useState(false);
  const [paywallError, setPaywallError] = useState('');
  const [paywallPurchaseId, setPaywallPurchaseId] = useState('');
  const [paywallMode, setPaywallMode] = useState<'one_time' | 'monthly_pass'>('one_time');
  const [paywallKeyId, setPaywallKeyId] = useState('');
  const [paywallAmount, setPaywallAmount] = useState(0);
  const [activeTab, setActiveTab] = useState<'overview' | 'experience' | 'projects' | 'education' | 'skills' | 'certificates' | 'activity'>('overview');
  const [shortlisted, setShortlisted] = useState(false);
  const [upraisedCount, setUpraisedCount] = useState(0);
  const [hasUpraised, setHasUpraised] = useState(false);
  const [upraiseBusy, setUpraiseBusy] = useState(false);

  const hasDownload = Boolean(props.entry.resumeDataUrl);
  const hasUnlock = Boolean(contactPayload?.contact);

  const safeContactVisible = useMemo(() => {
    if (props.entry.contact.visibility === 'hidden') return false;
    if (props.entry.contact.visibility === 'public') return true;
    return isAuthenticated;
  }, [isAuthenticated, props.entry.contact.visibility]);

  const requestContact = async () => {
    if (!isAuthenticated && props.entry.contact.visibility === 'members') {
      setContactError('Login required to view contact on this profile.');
      return;
    }
    setContactBusy(true);
    setContactError('');
    try {
      let jdText: string | undefined;
      try {
        const stored = sessionStorage.getItem('docrud:talent-jd') || '';
        const trimmed = stored.trim();
        if (trimmed.length >= 120 || trimmed.includes('\n')) {
          jdText = trimmed.slice(0, 10_000);
        }
      } catch {
        jdText = undefined;
      }

      const response = await fetch(`/api/resumes/${props.entry.id}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jdText }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 402 && payload?.paywall) {
          setPaywallError('');
          setPaywallOpen(true);
          return;
        }
        throw new Error(payload?.error || 'Unable to request contact');
      }
      setContactPayload(payload);
      // If the user tried to open the resume before unlocking, continue that action now.
      if (pendingResumeAction === 'preview') {
        setPendingResumeAction(null);
        setResumePreviewOpen(true);
      }
      if (pendingResumeAction === 'download') {
        setPendingResumeAction(null);
        if (props.entry.resumeDataUrl) {
          const a = document.createElement('a');
          a.href = props.entry.resumeDataUrl;
          a.download = props.entry.resumeFileName || `${props.entry.displayName}-resume`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      }
    } catch (error) {
      setContactError(error instanceof Error ? error.message : 'Unable to request contact.');
    } finally {
      setContactBusy(false);
    }
  };

  const ensureUnlocked = async (next: 'download' | 'preview' | 'compat' | 'analysis') => {
    if (hasUnlock) return true;
    setPendingResumeAction(next === 'download' || next === 'preview' ? next : null);
    await requestContact();
    return false;
  };

  const runCompatibility = async () => {
    if (!jdText.trim()) return;
    setCompatBusy(true);
    setCompatError('');
    setCompatResult(null);
    try {
      const response = await fetch(`/api/resumes/${props.entry.id}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jdText }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to score compatibility.');
      }
      setCompatResult(payload?.match || null);
    } catch (error) {
      setCompatError(error instanceof Error ? error.message : 'Unable to score compatibility.');
    } finally {
      setCompatBusy(false);
    }
  };

  const loadAnalysis = async () => {
    setAnalysisBusy(true);
    setAnalysisError('');
    setAnalysis(null);
    try {
      if (!hasUnlock) {
        const unlocked = await ensureUnlocked('analysis');
        if (!unlocked) return;
      }
      const response = await fetch(`/api/resumes/${props.entry.id}/analysis`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 402 && payload?.paywall) {
          setPaywallOpen(true);
          return;
        }
        throw new Error(payload?.error || 'Unable to analyze resume.');
      }
      setAnalysis(payload?.analysis || null);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Unable to analyze resume.');
    } finally {
      setAnalysisBusy(false);
    }
  };

  const loadRazorpayScript = async () => {
    if (typeof window === 'undefined') return false;
    if ((window as any).Razorpay) return true;
    return new Promise<boolean>((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const startCheckout = async (mode: 'one_time' | 'monthly_pass') => {
    if (!isAuthenticated) {
      setPaywallError('Login required to purchase Resume Connect.');
      return;
    }
    setPaywallBusy(true);
    setPaywallError('');
    try {
      const orderResponse = await fetch('/api/resumes/connect/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, resumeId: props.entry.id, resumeSlug: props.entry.slug }),
      });
      const orderPayload = await orderResponse.json().catch(() => null);
      if (!orderResponse.ok) throw new Error(orderPayload?.error || 'Unable to create checkout.');

      const loaded = await loadRazorpayScript();
      if (!loaded || !(window as any).Razorpay) throw new Error('Razorpay checkout script could not be loaded on this device.');

      setPaywallPurchaseId(String(orderPayload.purchaseId || ''));
      setPaywallMode(mode);
      setPaywallKeyId(String(orderPayload.keyId || ''));
      setPaywallAmount(Number(orderPayload.amountInPaise || 0));

      const instance = new (window as any).Razorpay({
        key: orderPayload.keyId,
        amount: orderPayload.amountInPaise,
        currency: 'INR',
        name: 'docrud',
        description: mode === 'monthly_pass' ? 'Resume Connect monthly pass' : 'Resume Connect (one-time)',
        order_id: orderPayload.order?.id,
        handler: async (gatewayPayload: Record<string, string>) => {
          try {
            const verifyResponse = await fetch('/api/resumes/connect/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...gatewayPayload,
                purchaseId: orderPayload.purchaseId,
                mode,
                resumeId: props.entry.id,
                resumeSlug: props.entry.slug,
              }),
            });
            const verifyPayload = await verifyResponse.json().catch(() => null);
            if (!verifyResponse.ok) throw new Error(verifyPayload?.error || 'Payment verification failed.');
            setPaywallOpen(false);
            // Now fetch contact
            await requestContact();
          } catch (verificationError) {
            setPaywallError(verificationError instanceof Error ? verificationError.message : 'Payment verification failed.');
          } finally {
            setPaywallBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            setPaywallBusy(false);
          },
        },
        prefill: {
          name: session?.user?.name || '',
          email: session?.user?.email || '',
        },
        notes: {
          product: 'resume_connect',
          mode,
          resumeId: props.entry.id,
        },
        theme: { color: '#0f172a' },
      });
      instance.open();
    } catch (error) {
      setPaywallError(error instanceof Error ? error.message : 'Unable to start checkout.');
      setPaywallBusy(false);
    }
  };

  useEffect(() => {
    void fetch(`/api/resumes/${props.entry.id}/view`, { method: 'POST' }).catch(() => undefined);
  }, [props.entry.id]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('docrud:talent-shortlist') || '[]') as string[];
      setShortlisted(Array.isArray(stored) && stored.includes(props.entry.id));
    } catch {
      setShortlisted(false);
    }
  }, [props.entry.id]);

  useEffect(() => {
    fetch(`/api/upraise/${props.entry.id}`)
      .then(r => r.json())
      .then((d: { count?: number; hasUpraised?: boolean }) => {
        setUpraisedCount(d.count ?? 0);
        setHasUpraised(d.hasUpraised ?? false);
      })
      .catch(() => {});
  }, [props.entry.id]);

  const toggleShortlist = () => {
    try {
      const stored = JSON.parse(localStorage.getItem('docrud:talent-shortlist') || '[]') as string[];
      const next = Array.isArray(stored) ? stored.slice() : [];
      const idx = next.indexOf(props.entry.id);
      if (idx >= 0) next.splice(idx, 1);
      else next.push(props.entry.id);
      localStorage.setItem('docrud:talent-shortlist', JSON.stringify(next.slice(0, 400)));
      setShortlisted(idx < 0);
    } catch {
      setShortlisted((c) => !c);
    }
  };

  const toggleUpraise = async () => {
    setUpraiseBusy(true);
    try {
      const res = await fetch(`/api/upraise/${props.entry.id}`, { method: 'POST' });
      const d = await res.json() as { count?: number; upraised?: boolean };
      setUpraisedCount(d.count ?? upraisedCount);
      setHasUpraised(d.upraised ?? !hasUpraised);
    } catch {
      // ignore
    } finally {
      setUpraiseBusy(false);
    }
  };

  const tabItems = useMemo(() => ([
    { id: 'overview', label: 'Overview', icon: BookOpen, tone: 'from-indigo-500/18 via-sky-500/10 to-emerald-500/16' },
    { id: 'experience', label: 'Experience', icon: BriefcaseBusiness, tone: 'from-amber-500/18 via-rose-500/10 to-fuchsia-500/14' },
    { id: 'projects', label: 'Projects', icon: ListChecks, tone: 'from-cyan-500/18 via-indigo-500/10 to-fuchsia-500/14' },
    { id: 'education', label: 'Education', icon: GraduationCap, tone: 'from-emerald-500/18 via-sky-500/10 to-indigo-500/14' },
    { id: 'skills', label: 'Skills', icon: Wrench, tone: 'from-sky-500/18 via-indigo-500/10 to-emerald-500/14' },
    { id: 'certificates', label: 'Certificates', icon: Award, tone: 'from-fuchsia-500/18 via-amber-500/10 to-indigo-500/14' },
    { id: 'activity', label: 'Activity', icon: Sparkles, tone: 'from-rose-500/18 via-fuchsia-500/10 to-indigo-500/14' },
  ] as const), []);

  const shareProfile = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    try {
      if ((navigator as any).share) {
        await (navigator as any).share({ title: props.entry.displayName, url });
        return;
      }
    } catch {
      // fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore
    }
  };

  function parseResumeSections(text: string) {
    const raw = String(text || '').replace(/\r/g, '');
    const lines = raw.split('\n');
    const headers = ['summary', 'experience', 'projects', 'education', 'skills', 'certifications', 'certificates', 'activity'];
    const normalized = lines.map((l) => l.trim());
    const idxFor = (h: string) => normalized.findIndex((l) => l.toLowerCase() === h);
    const ranges: Record<string, { start: number; end: number }> = {};
    const found = headers
      .map((h) => ({ h, i: idxFor(h) }))
      .filter((x) => x.i >= 0)
      .sort((a, b) => a.i - b.i);
    for (let k = 0; k < found.length; k += 1) {
      const cur = found[k];
      const next = found[k + 1];
      ranges[cur.h] = { start: cur.i + 1, end: next ? next.i : lines.length };
    }
    const take = (h: string, maxLines: number) => {
      const range = ranges[h];
      if (!range) return '';
      const body = lines.slice(range.start, range.end).map((l) => l.trim()).filter(Boolean);
      return body.slice(0, maxLines).join('\n');
    };
    return {
      experience: take('experience', 40),
      projects: take('projects', 30),
      education: take('education', 18),
      skills: take('skills', 18),
      certificates: take('certifications', 18) || take('certificates', 18),
    };
  }

  const resumeSections = useMemo(() => parseResumeSections(props.entry.resumeText), [props.entry.resumeText]);

  const resumePreviewText = useMemo(() => {
    const raw = String(props.entry.resumeText || '').replace(/\r/g, '').trim();
    const lines = raw.split('\n');
    const excerpt = lines.slice(0, 22).join('\n').trim();
    return excerpt.length > 1200 ? `${excerpt.slice(0, 1200).trim()}…` : excerpt;
  }, [props.entry.resumeText]);

  useEffect(() => {
    // If the user searched with a JD on the directory, auto-calc match here for the right-side card.
    let cancelled = false;
    const run = async () => {
      try {
        const stored = sessionStorage.getItem('docrud:talent-jd') || '';
        const trimmed = stored.trim();
        if (!trimmed) return;
        setJdText((v) => v || trimmed.slice(0, 10_000));
        const response = await fetch(`/api/resumes/${props.entry.id}/match`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jdText: trimmed.slice(0, 10_000) }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || cancelled) return;
        setCompatResult(payload?.match || null);
      } catch {
        // ignore
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [props.entry.id]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(245,248,255,1),rgba(255,255,255,1))]">
      <div className="mx-auto flex max-w-[1500px] gap-4 px-3 py-4 sm:px-5 lg:px-7 lg:py-6">
        <aside className="hidden w-64 shrink-0 flex-col rounded-[1.25rem] border border-slate-200/70 bg-white/70 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur xl:flex">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.12)]">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">Talent</p>
              <p className="truncate text-xs text-slate-500">Directory</p>
            </div>
          </div>

          <nav className="mt-4 space-y-1">
            <Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-950/5">
              <Home className="h-4 w-4 text-slate-500" />
              Home
            </Link>
            <Link href="/talent" className="flex items-center gap-3 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(15,23,42,0.10)]">
              <Users className="h-4 w-4 text-white" />
              Directory
            </Link>
            {isAuthenticated ? (
              <Link href="/workspace?tab=talent-leads" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-950/5">
                <Star className="h-4 w-4 text-slate-500" />
                Shortlist
              </Link>
            ) : null}
          </nav>

          <div className="mt-auto">
            <div className="mt-4 rounded-xl border border-slate-200/70 bg-white/70 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                  {(session?.user?.name || session?.user?.email || 'U').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{session?.user?.name || 'Workspace'}</p>
                  <p className="truncate text-xs text-slate-500">{session?.user?.email || 'Guest'}</p>
                </div>
              </div>
            </div>
            <Link href="/contact" className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-950/5">
              <LifeBuoy className="h-4 w-4 text-slate-500" />
              Help
            </Link>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="rounded-[1.5rem] border border-slate-200/70 bg-white/70 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)] backdrop-blur sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-500">
                  <Link href="/talent" className="hover:text-slate-950">Talent Directory</Link>
                  <span className="px-2 text-slate-300">›</span>
                  <span className="text-slate-950">{props.entry.displayName}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-900" onClick={() => void shareProfile()}>
                  <Share2 className="mr-2 h-4 w-4" />
                  Share profile
                </Button>
                <Button
                  type="button"
                  className={`h-10 rounded-xl px-4 text-sm font-semibold transition ${
                    hasUpraised
                      ? 'bg-orange-500 text-white hover:bg-orange-600'
                      : 'bg-slate-950 text-white hover:bg-slate-900'
                  }`}
                  onClick={() => void toggleUpraise()}
                  disabled={upraiseBusy}
                >
                  <TrendingUp className="mr-2 h-4 w-4" />
                  {hasUpraised ? `Upraised (${upraisedCount})` : `Upraise${upraisedCount > 0 ? ` (${upraisedCount})` : ''}`}
                </Button>
                <Button type="button" className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-900" onClick={toggleShortlist}>
                  <Star className={`mr-2 h-4 w-4 ${shortlisted ? 'fill-white text-white' : ''}`} />
                  {shortlisted ? 'Shortlisted' : 'Add to shortlist'}
                </Button>
                <Button
                  type="button"
                  className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-900"
                  onClick={requestContact}
                  disabled={contactBusy || props.entry.contact.visibility === 'hidden'}
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  {contactBusy ? 'Unlocking…' : 'Message'}
                </Button>
              </div>
            </div>

            <div className="mt-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="relative h-20 w-20 overflow-hidden rounded-[1.3rem] bg-[linear-gradient(135deg,rgba(37,99,235,0.25),rgba(168,85,247,0.22))]">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.82),transparent_58%)]" />
                      {props.entry.avatarDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={props.entry.avatarDataUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      ) : null}
                      <div className="relative flex h-full w-full items-center justify-center text-2xl font-semibold text-slate-900">
                        {!props.entry.avatarDataUrl ? String(props.entry.displayName || 'T').trim().slice(0, 1).toUpperCase() : null}
                      </div>
                      <span className="absolute bottom-1.5 right-1.5 h-4 w-4 rounded-full bg-emerald-500 ring-2 ring-white" />
                    </div>
                    <div className="min-w-0">
                      <h1 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">{props.entry.displayName}</h1>
                      <p className="mt-1 text-sm font-semibold text-slate-600">{props.entry.headline || props.entry.category}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                        {props.entry.location ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-4 w-4" /> {props.entry.location}
                          </span>
                        ) : null}
                        <span className="text-slate-300">·</span>
                        <span>Updated <ClientDate value={props.entry.updatedAt} /></span>
                        <span className="text-slate-300">·</span>
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Open to work</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {props.entry.skills.slice(0, 6).map((skill) => (
                          <span key={`top-skill-${skill}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{skill}</span>
                        ))}
                        {props.entry.skills.length > 6 ? (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">+{props.entry.skills.length - 6} more</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="min-w-[220px] space-y-2 text-sm">
                    {hasUnlock && contactPayload?.contact?.email ? (
                      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700">
                        <Mail className="h-4 w-4 text-slate-500" />
                        <span className="min-w-0 truncate">{contactPayload.contact.email}</span>
                      </div>
                    ) : null}
                    {hasUnlock && contactPayload?.contact?.phone ? (
                      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700">
                        <Phone className="h-4 w-4 text-slate-500" />
                        <span className="min-w-0 truncate">{contactPayload.contact.phone}</span>
                      </div>
                    ) : null}
                    {!hasUnlock ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                        Contact locked. Click Message to unlock.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-4 border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
                  {tabItems.map((t) => {
                    const active = activeTab === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveTab(t.id)}
                        className={`group inline-flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold shadow-sm transition ${
                          active
                            ? 'bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.16)]'
                            : 'border border-white/60 bg-white/70 text-slate-700 hover:bg-white/90 hover:shadow-[0_16px_40px_rgba(15,23,42,0.06)]'
                        }`}
                      >
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-2xl transition ${
                            active
                              ? 'bg-white/10'
                              : `bg-gradient-to-br ${t.tone} ring-1 ring-white/70 group-hover:brightness-[1.02]`
                          }`}
                        >
                          <t.icon className={`h-4 w-4 ${active ? 'text-white' : 'text-slate-800'}`} />
                        </span>
                        <span className="whitespace-nowrap">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
                <div className="space-y-4">
                  {activeTab === 'overview' ? (
                    <>
                      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                        <p className="text-sm font-semibold text-slate-950">About</p>
                        <p className="mt-2 text-sm leading-7 text-slate-600">{props.entry.summary || 'Profile summary not provided.'}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                        <p className="text-sm font-semibold text-slate-950">Experience</p>
                        <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">
                          {resumeSections.experience || 'No structured experience section detected. Open resume preview to read full details.'}
                        </pre>
                      </div>
                    </>
                  ) : null}

                  {activeTab === 'experience' ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                      <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">{resumeSections.experience || 'No structured experience section detected.'}</pre>
                    </div>
                  ) : null}

                  {activeTab === 'projects' ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                      <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">{resumeSections.projects || 'No structured projects section detected.'}</pre>
                    </div>
                  ) : null}

                  {activeTab === 'education' ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                      <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">{resumeSections.education || 'No structured education section detected.'}</pre>
                    </div>
                  ) : null}

                  {activeTab === 'skills' ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                      <div className="flex flex-wrap gap-2">
                        {props.entry.skills.map((skill) => (
                          <span key={`skill-chip-${skill}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{skill}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {activeTab === 'certificates' ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                      <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">{resumeSections.certificates || 'No certificates section detected.'}</pre>
                    </div>
                  ) : null}

                  {activeTab === 'activity' ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                      <div className="grid gap-2 text-sm text-slate-700">
                        <p><span className="font-semibold text-slate-950">{props.entry.viewCount}</span> profile views</p>
                        <p><span className="font-semibold text-slate-950">{props.entry.contactCount}</span> contact unlocks</p>
                        <p>Last update <ClientDate value={props.entry.updatedAt} /></p>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950">AI Match Score</p>
                      <span className="inline-flex items-center rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                        FREE
                      </span>
                    </div>
                    <p className="mt-2 text-3xl font-semibold text-emerald-600">{compatResult?.matchScore ? `${Math.round(Number(compatResult.matchScore))}%` : '—'}</p>
                    <p className="mt-1 text-sm text-slate-600">{compatResult?.rationale || 'Paste a JD in Compatibility to score this profile.'}</p>
                    <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, Number(compatResult?.matchScore || 0)))}%` }} />
                    </div>
                    <Button type="button" className="mt-4 h-10 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white hover:bg-slate-900" onClick={() => setCompatOpen(true)}>
                      Compatibility (FREE)
                    </Button>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                    <p className="text-sm font-semibold text-slate-950">Resume</p>
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-rose-500" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{props.entry.resumeFileName || `${props.entry.displayName}_Resume`}</p>
                          <p className="mt-0.5 text-xs text-slate-500">Updated <ClientDate value={props.entry.updatedAt} /></p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-xl bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-900"
                        onClick={() => {
                          if (!hasUnlock) { void ensureUnlocked('preview'); return; }
                          setResumePreviewOpen(true);
                        }}
                      >
                        Preview
                      </button>
                    </div>
                    {hasDownload ? (
                      <button
                        type="button"
                        className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-900"
                        onClick={() => {
                          if (!hasUnlock) { void ensureUnlocked('download'); return; }
                          if (!props.entry.resumeDataUrl) return;
                          const a = document.createElement('a');
                          a.href = props.entry.resumeDataUrl;
                          a.download = props.entry.resumeFileName || `${props.entry.displayName}-resume`;
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                        }}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </button>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                    <p className="text-sm font-semibold text-slate-950">Availability</p>
                    <div className="mt-3 grid gap-2 text-sm text-slate-700">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-600">Status</span>
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Open to work</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-600">Notice period</span>
                        <span className="font-semibold text-slate-950">15 days</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-600">Preferred</span>
                        <span className="font-semibold text-slate-950">{props.entry.location || 'Remote'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                    <p className="text-sm font-semibold text-slate-950">Highlights</p>
                    <div className="mt-3 grid gap-2 text-sm text-slate-700">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-600">Projects</span>
                        <span className="font-semibold text-slate-950">{resumeSections.projects ? Math.min(9, resumeSections.projects.split('\n').filter(Boolean).length) : 0}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-600">Skills</span>
                        <span className="font-semibold text-slate-950">{props.entry.skills.length}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-600">Certifications</span>
                        <span className="font-semibold text-slate-950">{resumeSections.certificates ? Math.min(9, resumeSections.certificates.split('\n').filter(Boolean).length) : 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <Dialog open={resumePreviewOpen} onOpenChange={setResumePreviewOpen}>
        <DialogContent className="cloud-panel flex max-h-[92vh] w-[min(96vw,60rem)] flex-col overflow-hidden rounded-[1.6rem] border border-white/70 bg-white/85 p-0 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
          <DialogHeader>
            <div className="border-b border-white/60 px-5 pb-4 pt-5">
              <DialogTitle className="text-base font-semibold tracking-[-0.02em] text-slate-950">
                Full resume
              </DialogTitle>
              <p className="mt-1 text-sm text-slate-600">
                Parsed text preview for quick review. Download the original file for exact formatting.
              </p>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {hasUnlock ? (
              <pre className="whitespace-pre-wrap break-words rounded-[1.2rem] border border-white/70 bg-white/70 px-4 py-4 text-[13px] leading-6 text-slate-800">
                {String(props.entry.resumeText || '').trim() || 'Resume text was not extracted.'}
              </pre>
            ) : (
              <div className="rounded-[1.2rem] border border-white/70 bg-white/70 px-4 py-4 text-sm text-slate-600">
                Resume content is locked. Unlock this profile to view.
              </div>
            )}
          </div>
          <div className="border-t border-white/60 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" className="rounded-full bg-slate-950 text-white hover:bg-slate-900" onClick={() => setResumePreviewOpen(false)}>
                Close
              </Button>
              {hasDownload ? (
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-full bg-slate-950 px-5 text-[12px] font-semibold text-white shadow-[0_14px_30px_rgba(15,23,42,0.16)] transition hover:bg-slate-800"
                  onClick={() => {
                    if (!hasUnlock) {
                      void ensureUnlocked('download');
                      return;
                    }
                    if (!props.entry.resumeDataUrl) return;
                    const a = document.createElement('a');
                    a.href = props.entry.resumeDataUrl;
                    a.download = props.entry.resumeFileName || `${props.entry.displayName}-resume`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {hasUnlock ? 'Download original' : 'Unlock + download'}
                </button>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={compatOpen} onOpenChange={setCompatOpen}>
        <DialogContent className="cloud-panel max-w-2xl overflow-hidden rounded-[1.6rem] border border-white/70 bg-white/85 p-0 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
          <DialogHeader>
            <div className="border-b border-white/60 px-5 pb-4 pt-5">
                <div className="flex items-center justify-between gap-3">
                  <DialogTitle className="text-base font-semibold tracking-[-0.02em] text-slate-950">
                    Compatibility score
                  </DialogTitle>
                  <span className="inline-flex items-center rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                    FREE
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  Paste a JD and get an AI compatibility score for this profile.
                </p>
              </div>
          </DialogHeader>
          <div className="px-5 py-4">
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste job description here"
              className="min-h-[180px] w-full resize-none rounded-[1.3rem] border border-white/70 bg-white/70 px-4 py-3 text-sm leading-6 text-slate-900 outline-none backdrop-blur-2xl placeholder:text-slate-500 focus:border-slate-300"
            />

            {compatError ? (
              <div className="mt-3 rounded-[1.1rem] border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
                {compatError}
              </div>
            ) : null}

            {compatResult ? (
              <div className="mt-4 grid gap-3">
                <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
                  <span className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                    Match {Math.round(Number(compatResult.matchScore || 0))}%
                  </span>
                  {typeof compatResult.compatibilityScore === 'number' ? (
                    <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1">
                      Compatibility {Math.round(Number(compatResult.compatibilityScore || 0))}%
                    </span>
                  ) : null}
                  {typeof compatResult.aiScore === 'number' ? (
                    <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1">
                      AI {Math.round(Number(compatResult.aiScore || 0))}%
                    </span>
                  ) : null}
                </div>
                {compatResult.rationale ? (
                  <p className="text-sm leading-6 text-slate-700">{compatResult.rationale}</p>
                ) : null}
                {Array.isArray(compatResult.matchedSkills) && compatResult.matchedSkills.length ? (
                  <div className="flex flex-wrap gap-2">
                    {compatResult.matchedSkills.slice(0, 12).map((skill: string) => (
                      <span key={`compat-skill-${skill}`} className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] font-semibold text-slate-700">
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="border-t border-white/60 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" className="rounded-full bg-slate-950 text-white hover:bg-slate-900" onClick={() => setCompatOpen(false)}>
                Close
              </Button>
              <Button
                type="button"
                className="rounded-full bg-slate-950 text-white hover:bg-slate-800"
                onClick={() => void runCompatibility()}
                disabled={compatBusy || !jdText.trim()}
              >
                {compatBusy ? 'Scoring…' : 'Score'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={paywallOpen} onOpenChange={setPaywallOpen}>
        <DialogContent className="cloud-panel max-w-lg overflow-hidden rounded-[1.6rem] border border-white/70 bg-white/80 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-[-0.02em] text-slate-950">
              Resume Connect required
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 grid gap-3">
            <p className="text-sm leading-6 text-slate-600">
              To view contact details, purchase a one-time connect or a monthly pass. This keeps listings high-signal and sustainable.
            </p>

            {paywallError ? (
              <div className="rounded-[1.1rem] border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
                {paywallError}
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => startCheckout('one_time')}
                className="group rounded-[1.4rem] border border-white/70 bg-white/70 p-4 text-left shadow-[0_18px_50px_rgba(15,23,42,0.06)] transition hover:bg-white hover:shadow-[0_22px_60px_rgba(15,23,42,0.08)]"
                disabled={paywallBusy}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">One-time</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">₹49</p>
                <p className="mt-1 text-sm text-slate-600">Unlock this profile contact (30 days).</p>
                <p className="mt-3 text-xs font-semibold text-slate-700">Pay once</p>
              </button>
              <button
                type="button"
                onClick={() => startCheckout('monthly_pass')}
                className="group rounded-[1.4rem] border border-white/70 bg-[linear-gradient(135deg,rgba(37,99,235,0.14),rgba(168,85,247,0.12))] p-4 text-left shadow-[0_18px_50px_rgba(37,99,235,0.10)] transition hover:shadow-[0_22px_60px_rgba(37,99,235,0.14)]"
                disabled={paywallBusy}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Monthly pass</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-semibold text-slate-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    Best value
                  </span>
                </div>
                <p className="mt-2 text-lg font-semibold text-slate-950">₹199</p>
                <p className="mt-1 text-sm text-slate-600">30 connects for 30 days.</p>
                <p className="mt-3 text-xs font-semibold text-slate-700">Get pass</p>
              </button>
            </div>
            <Button type="button" className="h-10 rounded-xl bg-slate-950 text-sm font-semibold text-white hover:bg-slate-900" onClick={() => setPaywallOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
