'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { BriefcaseBusiness, Loader2, QrCode, Share2, Sparkles } from 'lucide-react';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HiringJobPosting, LandingSettings } from '@/types/document';
import { buildAbsoluteAppUrl, buildQrImageUrl } from '@/lib/url';

type ResumeAtsResponse = {
  atsScore: number;
  executiveSummary: string;
  roleMatches: Array<{ role: string; score: number; why: string }>;
  applicationRiskLevel?: 'low' | 'medium' | 'high';
};

type PublicHiringJobPageProps = {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
  job: HiringJobPosting;
};

export default function PublicHiringJobPage({ softwareName, accentLabel, settings, job }: PublicHiringJobPageProps) {
  const { data: session, status } = useSession();
  const [resumeText, setResumeText] = useState('');
  const [candidatePhone, setCandidatePhone] = useState('');
  const [analysis, setAnalysis] = useState<ResumeAtsResponse | null>(null);
  const [message, setMessage] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const shareUrl = buildAbsoluteAppUrl(job.shareUrl || `/jobs/${job.id}`, typeof window !== 'undefined' ? window.location.origin : undefined);
  const qrUrl = buildQrImageUrl(job.shareUrl || `/jobs/${job.id}`, typeof window !== 'undefined' ? window.location.origin : undefined, 220);
  const eligible = analysis ? analysis.atsScore >= job.minimumAtsScore : false;
  const isCandidate = status === 'authenticated' && session?.user?.accountType === 'individual';

  const jobHighlights = useMemo(
    () => [
      { label: 'Work mode', value: job.workMode || 'hybrid' },
      { label: 'Level', value: job.experienceLevel || 'associate' },
      { label: 'Location', value: job.location || 'Flexible' },
      { label: 'Screening', value: 'Company-managed' },
    ],
    [job.experienceLevel, job.location, job.workMode],
  );

  const analyzeResume = async () => {
    if (!resumeText.trim()) {
      setMessage('Paste the resume first to check eligibility.');
      return;
    }
    try {
      setIsAnalyzing(true);
      setMessage('');
      const formData = new FormData();
      formData.append('resumeText', resumeText.trim());
      formData.append('targetRole', job.title);
      const response = await fetch('/api/ai/resume-ats', { method: 'POST', body: formData });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to analyze resume right now.');
      }
      setAnalysis(payload as ResumeAtsResponse);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to analyze resume right now.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applyNow = async () => {
    if (!resumeText.trim()) {
      setMessage('Paste the resume first.');
      return;
    }
    try {
      setIsApplying(true);
      setMessage('');
      const response = await fetch('/api/hiring/applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          resumeText: resumeText.trim(),
          targetRole: job.title,
          candidatePhone,
          resumeFileName: `${job.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-application.txt`,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to submit this application.');
      }
      setMessage(`Application submitted to ${job.organizationName}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to submit this application.');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white">
            <BriefcaseBusiness className="h-4 w-4" />
            Hiring Desk
          </div>
          <h1 className="mt-4 text-[2rem] font-semibold tracking-[-0.04em] text-slate-950 sm:text-[2.8rem]">{job.title}</h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">{job.organizationName} · {job.department || 'General hiring'} · {job.location || 'Location flexible'}</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {jobHighlights.map((item) => (
              <div key={item.label} className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-[1.4rem] border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-950">Role overview</p>
            <p className="mt-3 text-sm leading-7 text-slate-600">{job.description}</p>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div className="rounded-[1.4rem] border border-slate-200 bg-white p-5">
              <p className="text-sm font-semibold text-slate-950">Responsibilities</p>
              <div className="mt-3 space-y-2">
                {job.responsibilities.map((item) => (
                  <div key={item} className="rounded-[1rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">{item}</div>
                ))}
              </div>
            </div>
            <div className="rounded-[1.4rem] border border-slate-200 bg-white p-5">
              <p className="text-sm font-semibold text-slate-950">Requirements</p>
              <div className="mt-3 space-y-2">
                {job.requirements.map((item) => (
                  <div key={item} className="rounded-[1rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">{item}</div>
                ))}
              </div>
            </div>
          </div>
        </article>

        <aside className="space-y-5">
          <article className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-950">Share this job</p>
              <Share2 className="h-4 w-4 text-slate-500" />
            </div>
            <div className="mt-4 flex items-center justify-center rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
              <img src={qrUrl} alt={`${job.title} QR`} className="h-40 w-40 rounded-xl object-contain" />
            </div>
            <div className="mt-4 grid gap-2">
              <Button type="button" variant="outline" className="h-10 rounded-xl border-slate-300 bg-white text-slate-950 hover:bg-slate-950 hover:text-white" onClick={() => navigator.clipboard.writeText(shareUrl)}>
                Copy job link
              </Button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Apply here: ${shareUrl}`)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-950 transition hover:bg-slate-950 hover:text-white"
              >
                Share on WhatsApp
              </a>
            </div>
          </article>

          <article className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-950">Resume benchmark check</p>
              <span className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">Private screening</span>
            </div>
            <div className="mt-4 grid gap-3">
              <Input placeholder="Phone number" value={candidatePhone} onChange={(event) => setCandidatePhone(event.target.value)} />
              <textarea
                value={resumeText}
                onChange={(event) => setResumeText(event.target.value)}
                className="min-h-[220px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900"
                placeholder="Paste the resume here to check whether it clears the company's ATS threshold."
              />
              <Button type="button" className="h-11 rounded-xl bg-slate-950 text-white hover:bg-slate-800" onClick={analyzeResume} disabled={isAnalyzing}>
                {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {isAnalyzing ? 'Scoring resume...' : 'Check eligibility'}
              </Button>
            </div>

            {analysis ? (
              <div className={`mt-4 rounded-[1.2rem] border p-4 ${eligible ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-950">Current ATS score</p>
                  <span className="text-lg font-semibold text-slate-950">{analysis.atsScore}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{analysis.executiveSummary}</p>
                <p className="mt-2 text-xs text-slate-500">Best-fit role: {analysis.roleMatches[0]?.role || 'Not enough data'}</p>
              </div>
            ) : null}

            {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {isCandidate ? (
                <Button type="button" className="h-11 rounded-xl bg-slate-950 px-5 text-white hover:bg-slate-800" disabled={!eligible || isApplying} onClick={applyNow}>
                  {isApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Apply now
                </Button>
              ) : (
                <Button asChild type="button" className="h-11 rounded-xl bg-slate-950 px-5 text-white hover:bg-slate-800">
                  <Link href={`/login?next=${encodeURIComponent(`/jobs/${job.id}`)}`}>Login to apply</Link>
                </Button>
              )}
              {!eligible && analysis ? <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700">Resume does not yet meet this role&apos;s internal screening gate</span> : null}
            </div>
          </article>
        </aside>
      </section>
    </PublicSiteChrome>
  );
}
