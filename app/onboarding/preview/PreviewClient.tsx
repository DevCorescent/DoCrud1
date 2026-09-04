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
 * ═══ A RESUME WOULD ONLY EVER PRE-FILL ═══
 *
 * Every value below is plain state that the person edits. When resume
 * extraction becomes possible it seeds these same fields once, and from that
 * moment they are ordinary edits — nothing re-applies an extraction over a
 * correction. Extraction is not wired today: /api/onboarding/parse-resume is
 * 401 without a session and this flow is pre-auth. See lib/onboarding-resume.ts.
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
import { DEFAULT_PERSONA_OPTIONS, accountKindForPersona } from '@/lib/onboarding-personas';
import {
  DEFAULT_ROLE_OPTIONS, fetchRoleAvailability, roleOptionsByAvailability,
  type RoleAvailability,
} from '@/lib/onboarding-roles';
import { DEFAULT_SKILL_OPTIONS } from '@/lib/onboarding-skills';
import { DEFAULT_BUSINESS_SPACE_OPTIONS } from '@/lib/onboarding-business-spaces';
import { fetchJobPreview, jobQueryForRoles, type JobPreview } from '@/lib/onboarding-jobs';
import { fetchTalentMetrics, type TalentMetric } from '@/lib/onboarding-talent';

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
  const [name, setName] = useState('');
  const [persona, setPersona] = useState<string | null>(null);
  const [personaOther, setPersonaOther] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [customRoles, setCustomRoles] = useState<string[]>([]);
  const [roleDraft, setRoleDraft] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [space, setSpace] = useState<string | null>(null);
  const [businessSkills, setBusinessSkills] = useState<string[]>([]);

  /* ── Derived from real data ── */
  const [availability, setAvailability] = useState<RoleAvailability>({});
  const [jobs, setJobs] = useState<JobPreview[]>([]);
  const [jobTotal, setJobTotal] = useState(0);
  const [jobStatus, setJobStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [talentMetrics, setTalentMetrics] = useState<TalentMetric[]>([]);
  const [talentStatus, setTalentStatus] = useState<'loading' | 'ready' | 'error'>('loading');

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
      .then(result => { setJobs(result.jobs); setJobTotal(result.total); setJobStatus('ready'); })
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
    : step === 'persona' ? Boolean(persona)
    : step === 'role' ? isRoleSelectionValid(roles, customRoles)
    : step === 'space' ? Boolean(space)
    : step === 'skills' ? skills.length > 0
    : step === 'businessSkills' ? businessSkills.length > 0
    : true;

  /* The branch is decided by the persona's accountKind, never its id. */
  const goNext = () => {
    if (step === 'name' && isNameValid(name)) setStep('persona');
    else if (step === 'persona' && accountKindForPersona(persona) === 'individual') setStep('role');
    else if (step === 'persona' && accountKindForPersona(persona) === 'business') setStep('space');
    else if (step === 'role' && isRoleSelectionValid(roles, customRoles)) setStep('skills');
    else if (step === 'skills' && skills.length > 0) setStep('jobs');
    else if (step === 'space' && space) setStep('businessSkills');
    else if (step === 'businessSkills' && businessSkills.length > 0) setStep('talent');
  };

  /* Both value pages lead to the same gate; Back from it returns to whichever
     one the person came through. */
  const toAuth = (from: 'jobs' | 'talent') => { BACK.auth = from; setStep('auth'); };
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
          onLogin={() => router.push('/login')}
        />
      )}
      {step === 'name' && (
        <NameStep value={name} onChange={setName} onContinue={goNext} total={7} />
      )}
      {step === 'persona' && (
        <PersonaStep
          options={DEFAULT_PERSONA_OPTIONS}
          value={persona}
          onChange={setPersona}
          otherText={personaOther}
          onOtherTextChange={setPersonaOther}
          onContinue={goNext}
          total={7}
        />
      )}
      {step === 'role' && (
        <RoleStep
          options={roleOptionsByAvailability(DEFAULT_ROLE_OPTIONS, availability)}
          availability={availability}
          value={roles}
          onChange={setRoles}
          customRoles={customRoles}
          onCustomRolesChange={setCustomRoles}
          draft={roleDraft}
          onDraftChange={setRoleDraft}
          onContinue={goNext}
          total={7}
        />
      )}
      {step === 'skills' && (
        <SkillsStep options={DEFAULT_SKILL_OPTIONS} value={skills} onChange={setSkills} total={7} />
      )}
      {step === 'jobs' && (
        <JobPreviewStep
          jobs={jobs}
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
          onGoogle={() => router.push('/login?method=google')}
          onEmail={() => router.push('/login?method=email')}
        />
      )}
    </OnboardingShell>
  );
}
