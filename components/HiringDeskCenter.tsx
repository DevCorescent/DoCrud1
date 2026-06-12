'use client';

import { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, Loader2, QrCode, Send, Share2, Sparkles, Users } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HiringJobApplication, HiringJobPosting } from '@/types/document';
import { buildAbsoluteAppUrl, buildQrImageUrl } from '@/lib/url';

type ResumeAtsResponse = {
  atsScore: number;
  executiveSummary: string;
  roleMatches: Array<{ role: string; score: number; why: string }>;
};

const emptyJob = {
  title: '',
  department: '',
  location: '',
  description: '',
  responsibilities: '',
  requirements: '',
  preferredSkills: '',
  minimumAtsScore: '72',
  status: 'draft',
};

export default function HiringDeskCenter() {
  const { data: session } = useSession();
  const isBusiness = session?.user?.accountType === 'business' || session?.user?.role === 'client' || session?.user?.role === 'member' || session?.user?.role === 'admin';
  const [jobs, setJobs] = useState<HiringJobPosting[]>([]);
  const [applications, setApplications] = useState<HiringJobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [jobForm, setJobForm] = useState(emptyJob);
  const [message, setMessage] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [candidatePhone, setCandidatePhone] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [atsResult, setAtsResult] = useState<ResumeAtsResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [savingJob, setSavingJob] = useState(false);
  const [submittingJobId, setSubmittingJobId] = useState('');
  const [applicationFilter, setApplicationFilter] = useState<'all' | HiringJobApplication['status']>('all');

  const load = async () => {
    setLoading(true);
    try {
      const [jobsResponse, applicationsResponse] = await Promise.all([
        fetch('/api/hiring/jobs', { cache: 'no-store' }),
        fetch('/api/hiring/applications', { cache: 'no-store' }),
      ]);
      const jobsPayload = await jobsResponse.json().catch(() => []);
      const applicationsPayload = await applicationsResponse.json().catch(() => []);
      if (jobsResponse.ok) setJobs(Array.isArray(jobsPayload) ? jobsPayload : []);
      if (applicationsResponse.ok) setApplications(Array.isArray(applicationsPayload) ? applicationsPayload : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const eligibleJobs = useMemo(() => {
    if (!atsResult) return [];
    return jobs.filter((job) => job.status === 'published' && atsResult.atsScore >= job.minimumAtsScore);
  }, [atsResult, jobs]);

  const submittedJobIds = useMemo(() => new Set(applications.map((entry) => entry.jobId)), [applications]);
  const filteredApplications = useMemo(
    () => applicationFilter === 'all' ? applications : applications.filter((entry) => entry.status === applicationFilter),
    [applicationFilter, applications],
  );

  const analyzeResume = async () => {
    if (!resumeText.trim()) {
      setMessage('Paste your resume first to match jobs.');
      return;
    }
    try {
      setAnalyzing(true);
      setMessage('');
      const formData = new FormData();
      formData.append('resumeText', resumeText.trim());
      formData.append('targetRole', targetRole.trim());
      const response = await fetch('/api/ai/resume-ats', { method: 'POST', body: formData });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to analyze resume.');
      }
      setAtsResult(payload as ResumeAtsResponse);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to analyze resume.');
    } finally {
      setAnalyzing(false);
    }
  };

  const saveJob = async () => {
    try {
      setSavingJob(true);
      setMessage('');
      const response = await fetch('/api/hiring/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...jobForm,
          minimumAtsScore: Number(jobForm.minimumAtsScore || 0),
          responsibilities: jobForm.responsibilities.split('\n').map((item) => item.trim()).filter(Boolean),
          requirements: jobForm.requirements.split('\n').map((item) => item.trim()).filter(Boolean),
          preferredSkills: jobForm.preferredSkills.split('\n').map((item) => item.trim()).filter(Boolean),
          targetRoleKeywords: jobForm.title.split(/\s+/).filter(Boolean),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to save job.');
      }
      setJobForm(emptyJob);
      setMessage('Job posting saved.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save job.');
    } finally {
      setSavingJob(false);
    }
  };

  const applyToJob = async (job: HiringJobPosting) => {
    try {
      setSubmittingJobId(job.id);
      setMessage('');
      const response = await fetch('/api/hiring/applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          resumeText: resumeText.trim(),
          targetRole: targetRole.trim() || job.title,
          candidatePhone,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to submit application.');
      }
      setMessage(`Application sent to ${job.organizationName}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to submit application.');
    } finally {
      setSubmittingJobId('');
    }
  };

  const updateApplicationStatus = async (applicationId: string, status: HiringJobApplication['status']) => {
    const response = await fetch('/api/hiring/applications', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ applicationId, status }),
    });
    if (response.ok) {
      await load();
    }
  };

  if (loading) {
    return (
      <div className="rounded-[1.6rem] border border-slate-200 bg-white p-10 text-center shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {message ? <div className="rounded-[1.1rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">{message}</div> : null}

      {isBusiness ? (
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="flex items-center gap-2">
              <BriefcaseBusiness className="h-4 w-4 text-slate-900" />
              <h2 className="text-lg font-semibold text-slate-950">Post a hiring role</h2>
            </div>
            <div className="mt-4 grid gap-3">
              <Input placeholder="Job title" value={jobForm.title} onChange={(event) => setJobForm((prev) => ({ ...prev, title: event.target.value }))} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input placeholder="Department" value={jobForm.department} onChange={(event) => setJobForm((prev) => ({ ...prev, department: event.target.value }))} />
                <Input placeholder="Location" value={jobForm.location} onChange={(event) => setJobForm((prev) => ({ ...prev, location: event.target.value }))} />
              </div>
              <textarea className="min-h-[110px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900" placeholder="Role overview" value={jobForm.description} onChange={(event) => setJobForm((prev) => ({ ...prev, description: event.target.value }))} />
              <textarea className="min-h-[90px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900" placeholder="Responsibilities (one per line)" value={jobForm.responsibilities} onChange={(event) => setJobForm((prev) => ({ ...prev, responsibilities: event.target.value }))} />
              <textarea className="min-h-[90px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900" placeholder="Requirements (one per line)" value={jobForm.requirements} onChange={(event) => setJobForm((prev) => ({ ...prev, requirements: event.target.value }))} />
              <textarea className="min-h-[90px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900" placeholder="Preferred skills (one per line)" value={jobForm.preferredSkills} onChange={(event) => setJobForm((prev) => ({ ...prev, preferredSkills: event.target.value }))} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input placeholder="Minimum ATS score" value={jobForm.minimumAtsScore} onChange={(event) => setJobForm((prev) => ({ ...prev, minimumAtsScore: event.target.value }))} />
                <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900" value={jobForm.status} onChange={(event) => setJobForm((prev) => ({ ...prev, status: event.target.value }))}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <Button type="button" className="h-11 rounded-xl bg-slate-950 text-white hover:bg-slate-800" onClick={saveJob} disabled={savingJob}>
                {savingJob ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {savingJob ? 'Saving role...' : 'Save job posting'}
              </Button>
            </div>
          </section>

          <section className="space-y-5">
            <article className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-[1.4rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]"><p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Jobs</p><p className="mt-3 text-lg font-semibold text-slate-950">{jobs.length}</p></div>
              <div className="rounded-[1.4rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]"><p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Published</p><p className="mt-3 text-lg font-semibold text-slate-950">{jobs.filter((job) => job.status === 'published').length}</p></div>
              <div className="rounded-[1.4rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]"><p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Applications</p><p className="mt-3 text-lg font-semibold text-slate-950">{applications.length}</p></div>
            </article>
            <article className="grid gap-4 sm:grid-cols-4">
              <div className="rounded-[1.1rem] border border-slate-200 bg-white p-4"><p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Submitted</p><p className="mt-2 text-base font-semibold text-slate-950">{applications.filter((entry) => entry.status === 'submitted').length}</p></div>
              <div className="rounded-[1.1rem] border border-slate-200 bg-white p-4"><p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Reviewing</p><p className="mt-2 text-base font-semibold text-slate-950">{applications.filter((entry) => entry.status === 'reviewing').length}</p></div>
              <div className="rounded-[1.1rem] border border-slate-200 bg-white p-4"><p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Shortlisted</p><p className="mt-2 text-base font-semibold text-slate-950">{applications.filter((entry) => entry.status === 'shortlisted').length}</p></div>
              <div className="rounded-[1.1rem] border border-slate-200 bg-white p-4"><p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Hired</p><p className="mt-2 text-base font-semibold text-slate-950">{applications.filter((entry) => entry.status === 'hired').length}</p></div>
            </article>
            <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-950">Company hiring dashboard</h3>
                <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900" value={applicationFilter} onChange={(event) => setApplicationFilter(event.target.value as 'all' | HiringJobApplication['status'])}>
                  <option value="all">All applications</option>
                  <option value="submitted">Submitted</option>
                  <option value="reviewing">Reviewing</option>
                  <option value="shortlisted">Shortlisted</option>
                  <option value="rejected">Rejected</option>
                  <option value="hired">Hired</option>
                </select>
              </div>
              <div className="mt-4 space-y-4">
                {jobs.map((job) => (
                  <div key={job.id} className="rounded-[1.1rem] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{job.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{job.department || 'General'} · ATS {job.minimumAtsScore}+ · {job.status}</p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                        {filteredApplications.filter((application) => application.jobId === job.id).length} applicants
                      </span>
                    </div>
                    {job.status === 'published' ? (
                      <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_auto]">
                        <div className="rounded-[1rem] border border-white bg-white px-4 py-3">
                          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                            <Share2 className="h-3.5 w-3.5" />
                            Share job
                          </div>
                          <p className="mt-2 break-all text-sm text-slate-600">{buildAbsoluteAppUrl(job.shareUrl || `/jobs/${job.id}`, typeof window !== 'undefined' ? window.location.origin : undefined)}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button type="button" variant="outline" className="h-9 rounded-lg border-slate-300 bg-white px-3 text-xs text-slate-950 hover:bg-slate-950 hover:text-white" onClick={() => navigator.clipboard.writeText(buildAbsoluteAppUrl(job.shareUrl || `/jobs/${job.id}`, typeof window !== 'undefined' ? window.location.origin : undefined))}>
                              Copy link
                            </Button>
                            <a
                              href={`https://wa.me/?text=${encodeURIComponent(`Apply here: ${buildAbsoluteAppUrl(job.shareUrl || `/jobs/${job.id}`, typeof window !== 'undefined' ? window.location.origin : undefined)}`)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-950 transition hover:bg-slate-950 hover:text-white"
                            >
                              Share on WhatsApp
                            </a>
                          </div>
                        </div>
                        <div className="flex items-center justify-center rounded-[1rem] border border-white bg-white p-3">
                          <div className="flex flex-col items-center gap-2">
                            <QrCode className="h-4 w-4 text-slate-500" />
                            <img src={buildQrImageUrl(job.shareUrl || `/jobs/${job.id}`, typeof window !== 'undefined' ? window.location.origin : undefined, 120)} alt={`${job.title} QR`} className="h-24 w-24 rounded-lg object-contain" />
                          </div>
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-3 space-y-2">
                      {filteredApplications.filter((application) => application.jobId === job.id).map((application) => (
                        <div key={application.id} className="rounded-[1rem] border border-white bg-white p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-950">{application.candidateName}</p>
                              <p className="text-xs text-slate-500">{application.candidateEmail} · ATS {application.atsScore}</p>
                            </div>
                            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900" value={application.status} onChange={(event) => void updateApplicationStatus(application.id, event.target.value as HiringJobApplication['status'])}>
                              <option value="submitted">Submitted</option>
                              <option value="reviewing">Reviewing</option>
                              <option value="shortlisted">Shortlisted</option>
                              <option value="rejected">Rejected</option>
                              <option value="hired">Hired</option>
                            </select>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{application.analysisSummary}</p>
                          {application.analysisDetails ? (
                            <div className="mt-3 grid gap-3 lg:grid-cols-2">
                              <div className="rounded-[0.9rem] border border-slate-200 bg-slate-50 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">AI fit</p>
                                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                                    application.analysisDetails.applicationRiskLevel === 'low'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : application.analysisDetails.applicationRiskLevel === 'medium'
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-rose-100 text-rose-700'
                                  }`}>
                                    {application.analysisDetails.applicationRiskLevel || 'review'}
                                  </span>
                                </div>
                                <p className="mt-2 text-sm leading-6 text-slate-600">{application.analysisDetails.roleAlignmentSummary || application.analysisDetails.recruiterImpression}</p>
                              </div>
                              <div className="rounded-[0.9rem] border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Best roles</p>
                                <div className="mt-2 space-y-2">
                                  {application.analysisDetails.roleMatches.slice(0, 2).map((match) => (
                                    <div key={match.role} className="rounded-[0.8rem] border border-white bg-white px-3 py-2 text-sm text-slate-700">
                                      {match.role} · {match.score}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="rounded-[0.9rem] border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Strengths</p>
                                <div className="mt-2 space-y-2">
                                  {application.analysisDetails.strengths.slice(0, 3).map((item) => (
                                    <div key={item} className="rounded-[0.8rem] border border-white bg-white px-3 py-2 text-sm text-slate-700">{item}</div>
                                  ))}
                                </div>
                              </div>
                              <div className="rounded-[0.9rem] border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Improve before interview</p>
                                <div className="mt-2 space-y-2">
                                  {application.analysisDetails.improvementAreas.slice(0, 3).map((item) => (
                                    <div key={item} className="rounded-[0.8rem] border border-white bg-white px-3 py-2 text-sm text-slate-700">{item}</div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {jobs.length === 0 ? <p className="text-sm text-slate-500">No hiring roles created yet.</p> : null}
              </div>
            </article>
          </section>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
          <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-900" />
              <h2 className="text-lg font-semibold text-slate-950">Match jobs from your resume</h2>
            </div>
            <div className="mt-4 grid gap-3">
              <Input placeholder="Target role" value={targetRole} onChange={(event) => setTargetRole(event.target.value)} />
              <Input placeholder="Phone number for application" value={candidatePhone} onChange={(event) => setCandidatePhone(event.target.value)} />
              <textarea className="min-h-[220px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900" placeholder="Paste your latest resume here to unlock matching jobs." value={resumeText} onChange={(event) => setResumeText(event.target.value)} />
              <Button type="button" className="h-11 rounded-xl bg-slate-950 text-white hover:bg-slate-800" onClick={analyzeResume} disabled={analyzing}>
                {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {analyzing ? 'Scoring your resume...' : 'Find matching jobs'}
              </Button>
            </div>
            {atsResult ? (
              <div className="mt-5 rounded-[1.1rem] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">ATS score</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">{atsResult.atsScore}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{atsResult.executiveSummary}</p>
              </div>
            ) : null}
          </section>

          <section className="space-y-5">
            <article className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-[1.4rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]"><p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Eligible jobs</p><p className="mt-3 text-lg font-semibold text-slate-950">{eligibleJobs.length}</p></div>
              <div className="rounded-[1.4rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]"><p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">My applications</p><p className="mt-3 text-lg font-semibold text-slate-950">{applications.length}</p></div>
              <div className="rounded-[1.4rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]"><p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Best role</p><p className="mt-3 text-sm font-semibold text-slate-950">{atsResult?.roleMatches?.[0]?.role || 'Analyze first'}</p></div>
            </article>
            <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <h3 className="text-sm font-semibold text-slate-950">Jobs you can apply for right now</h3>
              <div className="mt-4 space-y-4">
                {eligibleJobs.map((job) => (
                  <div key={job.id} className="rounded-[1.1rem] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{job.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{job.organizationName} · {job.location || 'Location flexible'} · ATS {job.minimumAtsScore}+</p>
                      </div>
                      <Button type="button" className="h-10 rounded-xl bg-slate-950 px-4 text-white hover:bg-slate-800" disabled={submittingJobId === job.id || submittedJobIds.has(job.id)} onClick={() => void applyToJob(job)}>
                        {submittingJobId === job.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        {submittedJobIds.has(job.id) ? 'Applied' : 'Apply'}
                      </Button>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{job.description}</p>
                  </div>
                ))}
                {atsResult && eligibleJobs.length === 0 ? <p className="text-sm text-slate-500">No published jobs match your current ATS score yet.</p> : null}
              </div>
            </article>
          </section>
        </div>
      )}
    </div>
  );
}
