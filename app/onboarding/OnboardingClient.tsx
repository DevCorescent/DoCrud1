'use client';

/**
 * The onboarding flow, on its staging route.
 *
 * Shape, and why it is this shape:
 *
 *   1 Welcome (resume optional) → 2 Name → 3 Who are you
 *     individual → 4 Role → 5 Skills → 6 Recommended jobs
 *     business   → 4 Space → 5 Business skills → 6 Talent
 *   → 7 Create account
 *
 * ═══ ONE STATE, OWNED HERE ═══
 *
 * Every answer lives in this component and is handed down. The step components
 * hold none of it, so Back cannot lose anything and no two steps can disagree.
 * There is no localStorage: refresh persistence is a later phase, and faking it
 * here would be a second store to unpick.
 *
 * ═══ A RESUME ONLY EVER PRE-FILLS ═══
 *
 * An attached résumé is read once, anonymously and deterministically, and its
 * three suggestions seed name, roles and skills. From that instant they are
 * ordinary values: editable, removable, and never re-applied.
 *
 * `touched` is what makes that guarantee real. The moment a person changes a
 * field it is marked, and no later extraction — a replaced résumé, a re-parse —
 * may write over it. Their correction outranks the document, always. Removing
 * the résumé withdraws only the suggestions they never touched.
 *
 * ═══ THE BRANCH ═══
 *
 * `accountKind` decides it, and nothing else does. It is collected as itself on
 * step 3, so no display label is ever translated back into a route and a new
 * persona cannot silently redirect anybody.
 *
 * ═══ NOBODY IS AUTHENTICATED HERE ═══
 *
 * The last step hands off to the existing /login. This file never calls signIn,
 * never issues an OTP, and never writes a profile.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import OnboardingShell from '@/components/onboarding/OnboardingShell';
import WelcomeStep from '@/components/onboarding/WelcomeStep';
import NameStep, { isNameValid } from '@/components/onboarding/NameStep';
import PersonaStep from '@/components/onboarding/PersonaStep';
import RoleStep, { isRoleSelectionValid } from '@/components/onboarding/RoleStep';
import SkillsStep from '@/components/onboarding/SkillsStep';
import JobPreviewStep from '@/components/onboarding/JobPreviewStep';
import BusinessSpaceStep from '@/components/onboarding/BusinessSpaceStep';
import BusinessSkillsStep from '@/components/onboarding/BusinessSkillsStep';
import TalentPreviewStep from '@/components/onboarding/TalentPreviewStep';
import AuthGate from '@/components/onboarding/AuthGate';
import { StepNav } from '@/components/onboarding/StepChrome';
import type { AccountKind } from '@/lib/onboarding-personas';
import {
  DEFAULT_ROLE_OPTIONS, fetchRoleAvailability, roleOptionsByAvailability,
  type RoleAvailability,
} from '@/lib/onboarding-roles';
import { DEFAULT_SKILL_OPTIONS } from '@/lib/onboarding-skills';
import { DEFAULT_BUSINESS_SPACE_OPTIONS } from '@/lib/onboarding-business-spaces';
import { fetchJobPreview, jobQueryForRoles } from '@/lib/onboarding-jobs';
import { fetchTalentMetrics, type TalentMetric } from '@/lib/onboarding-talent';
import { extractResume, type ExtractionState } from '@/lib/onboarding-resume';

type Step =
  | 'welcome' | 'name' | 'persona'
  | 'role' | 'skills' | 'jobs'
  | 'space' | 'businessSkills' | 'talent'
  | 'auth';

const BACK: Record<Exclude<Step, 'welcome'>, Step> = {
  name: 'welcome',
  persona: 'name',
  role: 'persona',
  skills: 'role',
  jobs: 'skills',
  space: 'persona',
  businessSkills: 'space',
  talent: 'businessSkills',
  auth: 'jobs',
};

export default function PreviewClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');

  /* ── Everything the person has told us ── */
  const [resume, setResume] = useState<File | null>(null);
  const [extraction, setExtraction] = useState<ExtractionState>({ status: 'none' });
  const [retryNonce, setRetryNonce] = useState(0);
  /* Fields the person has edited themselves. Extraction never writes to these. */
  const [touched, setTouched] = useState<{ name: boolean; roles: boolean; skills: boolean }>(
    { name: false, roles: false, skills: false },
  );
  const [name, setName] = useState('');
  /* The branch discriminator, collected directly rather than derived from a
     persona label. See PersonaStep. */
  const [accountKind, setAccountKind] = useState<AccountKind | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [customRoles, setCustomRoles] = useState<string[]>([]);
  const [roleDraft, setRoleDraft] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [space, setSpace] = useState<string | null>(null);
  const [businessSkills, setBusinessSkills] = useState<string[]>([]);

  /* ── Derived from real data ── */
  const [availability, setAvailability] = useState<RoleAvailability>({});
  const [jobTotal, setJobTotal] = useState(0);
  const [jobStatus, setJobStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [talentMetrics, setTalentMetrics] = useState<TalentMetric[]>([]);
  const [talentStatus, setTalentStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  /**
   * Read the résumé once, when it is attached or replaced.
   *
   * A replacement aborts the previous read, so a slow first parse can never
   * land after a newer one and overwrite it with stale suggestions.
   */
  useEffect(() => {
    if (!resume) { setExtraction({ status: 'none' }); return; }
    const controller = new AbortController();
    setExtraction({ status: 'parsing' });
    extractResume(resume, controller.signal).then(next => {
      if (!controller.signal.aborted) setExtraction(next);
    });
    return () => controller.abort();
    /* `retryNonce` re-runs this for the SAME file after a failure. It is not a
       second extraction path — it is this one, asked again. */
  }, [resume, retryNonce]);

  /* Read the attached résumé again. Only ever offered after a failure, so a
     transient error is one click to recover from rather than a dead end that
     forces the person to re-pick the file. */
  const retryExtraction = useCallback(() => {
    if (resume) setRetryNonce(n => n + 1);
  }, [resume]);

  /**
   * Seed the untouched fields from the suggestions.
   *
   * Guarded by `touched`, so this can run again after a replacement without
   * undoing a single thing the person typed or unticked.
   */
  useEffect(() => {
    if (extraction.status !== 'done') return;
    const { name: suggestedName, roles: suggestedRoles, skills: suggestedSkills } = extraction.extraction;
    if (suggestedName && !touched.name) setName(suggestedName);
    if (suggestedRoles.length && !touched.roles) setRoles(suggestedRoles);
    if (suggestedSkills.length && !touched.skills) setSkills(suggestedSkills.slice(0, 10));
    // `touched` is read, not tracked: re-running on a change to it would
    // re-seed a field the moment it was edited, which is the opposite of intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraction]);

  /**
   * Taking the résumé away withdraws only what it suggested. Anything the
   * person changed is theirs and stays.
   */
  useEffect(() => {
    if (resume || extraction.status !== 'none') return;
    if (!touched.name) setName('');
    if (!touched.roles) setRoles([]);
    if (!touched.skills) setSkills([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, extraction.status]);

  /* Every edit below marks its field, which locks extraction out of it. */
  const editName = (value: string) => { setTouched(t => ({ ...t, name: true })); setName(value); };
  const editRoles = (value: string[]) => { setTouched(t => ({ ...t, roles: true })); setRoles(value); };
  const editSkills = (value: string[]) => { setTouched(t => ({ ...t, skills: true })); setSkills(value); };

  /**
   * Coming back from Google.
   *
   * The answers travelled in the httpOnly intent cookie, so this only has to
   * ask the server to finish the write — it sends no user id, and the endpoint
   * would ignore one. Home is reached only once that write has succeeded.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('authed') !== '1') return;
    let live = true;
    fetch('/api/onboarding/handoff', { method: 'POST' })
      .then(res => { if (live && res.ok) router.replace('/'); })
      .catch(() => { /* stay put; the gate still shows an actionable error */ });
    return () => { live = false; };
  }, [router]);

  /* Real open-role counts, so the Role step reflects where the work is. */
  useEffect(() => {
    if (step !== 'role') return;
    let live = true;
    fetchRoleAvailability().then(a => { if (live) setAvailability(a); }).catch(() => {});
    return () => { live = false; };
  }, [step]);

  const loadJobs = useCallback(() => {
    setJobStatus('loading');
    fetchJobPreview(jobQueryForRoles(roles, customRoles, DEFAULT_ROLE_OPTIONS))
      .then(result => { setJobTotal(result.total); setJobStatus('ready'); })
      .catch(() => setJobStatus('error'));
  }, [roles, customRoles]);
  useEffect(() => { if (step === 'jobs') loadJobs(); }, [step, loadJobs]);

  const loadTalent = useCallback(() => {
    setTalentStatus('loading');
    const chosen = DEFAULT_SKILL_OPTIONS.filter(option => businessSkills.includes(option.id));
    fetchTalentMetrics(chosen)
      .then(result => { setTalentMetrics(result); setTalentStatus('ready'); })
      .catch(() => setTalentStatus('error'));
  }, [businessSkills]);
  useEffect(() => { if (step === 'talent') loadTalent(); }, [step, loadTalent]);

  const canContinue =
    step === 'name' ? isNameValid(name)
    : step === 'persona' ? Boolean(accountKind)
    : step === 'role' ? isRoleSelectionValid(roles, customRoles)
    : step === 'space' ? Boolean(space)
    : step === 'skills' ? skills.length > 0
    : step === 'businessSkills' ? businessSkills.length > 0
    : true;

  /* The branch is decided by the persona's accountKind, never its id. */
  const goNext = () => {
    if (step === 'name' && isNameValid(name)) setStep('persona');
    else if (step === 'persona' && accountKind === 'individual') setStep('role');
    else if (step === 'persona' && accountKind === 'business') setStep('space');
    else if (step === 'role' && isRoleSelectionValid(roles, customRoles)) setStep('skills');
    else if (step === 'skills' && skills.length > 0) setStep('jobs');
    else if (step === 'space' && space) setStep('businessSkills');
    else if (step === 'businessSkills' && businessSkills.length > 0) setStep('talent');
  };

  /* Both value pages lead to the same gate; Back from it returns to whichever
     one the person came through. */
  const toAuth = (from: 'jobs' | 'talent') => { BACK.auth = from; setStep('auth'); };
  /* The ids as chosen — the profile stores the same JobDomain ids the corpus
     uses, so nothing is translated on the way in. */
  const roleLabels = [...roles];
  const roleLabel = [
    ...roles.map(id => DEFAULT_ROLE_OPTIONS.find(o => o.id === id)?.label ?? id),
    ...customRoles,
  ].join(', ');

  return (
    <OnboardingShell
      navigation={
        step === 'welcome' ? undefined : (
          <StepNav
            onBack={() => setStep(BACK[step])}
            /* The value pages and the gate carry their own actions. */
            onContinue={step === 'jobs' || step === 'talent' || step === 'auth' ? undefined : goNext}
            canContinue={canContinue}
          />
        )
      }
    >
      {step === 'welcome' && (
        <WelcomeStep
          onContinue={() => setStep('name')}
          resume={resume}
          onResumeChange={setResume}
          extraction={extraction}
          onLogin={() => router.push('/login')}
        />
      )}
      {step === 'name' && (
        <NameStep
          value={name}
          onChange={editName}
          onContinue={goNext}
          total={7}
          extraction={extraction}
          onRetryExtraction={retryExtraction}
        />
      )}
      {step === 'persona' && (
        <PersonaStep value={accountKind} onChange={setAccountKind} onContinue={goNext} />
      )}
      {step === 'role' && (
        <RoleStep
          options={roleOptionsByAvailability(DEFAULT_ROLE_OPTIONS, availability)}
          availability={availability}
          value={roles}
          onChange={editRoles}
          customRoles={customRoles}
          onCustomRolesChange={setCustomRoles}
          draft={roleDraft}
          onDraftChange={setRoleDraft}
          onContinue={goNext}
          total={7}
          extraction={extraction}
          onRetryExtraction={retryExtraction}
        />
      )}
      {step === 'skills' && (
        <SkillsStep
          options={DEFAULT_SKILL_OPTIONS}
          value={skills}
          onChange={editSkills}
          total={7}
          extraction={extraction}
          onRetryExtraction={retryExtraction}
        />
      )}
      {step === 'jobs' && (
        <JobPreviewStep
          total={jobTotal}
          status={jobStatus}
          direction={roleLabel}
          firstName={name}
          onRetry={loadJobs}
          onLogin={() => toAuth('jobs')}
          stepTotal={7}
        />
      )}
      {step === 'space' && (
        <BusinessSpaceStep
          options={DEFAULT_BUSINESS_SPACE_OPTIONS}
          value={space}
          onChange={setSpace}
          onContinue={goNext}
          total={7}
        />
      )}
      {step === 'businessSkills' && (
        <BusinessSkillsStep
          options={DEFAULT_SKILL_OPTIONS}
          value={businessSkills}
          onChange={setBusinessSkills}
          total={7}
        />
      )}
      {step === 'talent' && (
        <TalentPreviewStep
          metrics={talentMetrics}
          status={talentStatus}
          spaceLabel={DEFAULT_BUSINESS_SPACE_OPTIONS.find(o => o.id === space)?.label ?? ''}
          firstName={name}
          onRetry={loadTalent}
          onLogin={() => toAuth('talent')}
          total={7}
        />
      )}
      {step === 'auth' && (
        <AuthGate
          firstName={name}
          accountKind={accountKind ?? 'individual'}
          answers={{
            name,
            roles: roleLabels,
            customRoles: [...customRoles],
            skills: [...skills],
            businessSpace: space ?? undefined,
            businessSkills: [...businessSkills],
          }}
          onDone={() => router.push('/')}
        />
      )}
    </OnboardingShell>
  );
}
