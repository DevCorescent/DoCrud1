/**
 * The job-posting wizard's logic, with no JSX in it.
 *
 * Steps, per-step validation, draft persistence and the outgoing payload all
 * live here so they can be tested directly and so no step component can invent
 * a rule of its own. The components render this; they do not decide it.
 *
 * THE PAYLOAD IS THE EXISTING ONE. `buildJobPayload` produces exactly what the
 * single long form used to POST to /api/hiring/jobs — same newline splitting,
 * same numeric minimumAtsScore, same title-derived targetRoleKeywords — plus
 * the compensation fields that upsertHiringJob now reads. Nothing else was
 * added, because the server would ignore it.
 */

/** The wizard's draft. One flat object: the form state the composer already had. */
export interface JobDraft {
  title: string;
  location: string;
  workMode: string;
  description: string;
  department: string;
  employmentType: string;
  experienceLevel: string;
  /** '' means the poster did not say — see lib/job-urgency.ts. */
  hiringUrgency: string;
  responsibilities: string;
  requirements: string;
  preferredSkills: string;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  salaryPeriod: string;
  minimumAtsScore: string;
  requiredDocuments: string;
  status: string;
  /** Presentation only — the server stores neither, so neither is sent. */
  language: string;
  country: string;
}

/* Defaults are the ones upsertHiringJob itself falls back to, so an untouched
   wizard posts the identical record the old form did. */
export const EMPTY_DRAFT: JobDraft = {
  title: '',
  location: '',
  workMode: 'hybrid',
  description: '',
  department: '',
  employmentType: 'full_time',
  experienceLevel: 'associate',
  /* Deliberately empty rather than a default. Urgency is a claim about the
     employer's own timeline; pre-selecting one would put words in their mouth
     and tint the card on the strength of it. */
  hiringUrgency: '',
  responsibilities: '',
  requirements: '',
  preferredSkills: '',
  salaryMin: '',
  salaryMax: '',
  salaryCurrency: 'INR',
  salaryPeriod: 'year',
  minimumAtsScore: '72',
  requiredDocuments: '',
  status: 'published',
  language: 'English',
  country: 'India',
};

export type StepId =
  | 'basics' | 'details' | 'requirements' | 'compensation'
  | 'screening' | 'preview' | 'publish';

export interface StepDef {
  id: StepId;
  /** Sidebar / progress label. Short enough not to wrap at 1024px. */
  label: string;
  /** The step's own heading. */
  title: string;
  /** One line under the heading saying why this step exists. */
  caption: string;
}

export const STEPS: StepDef[] = [
  {
    id: 'basics',
    label: 'Basics',
    title: 'Add job basics',
    caption: 'The essentials a candidate needs to recognise the role and where it is.',
  },
  {
    id: 'details',
    label: 'Details',
    title: 'Describe the role',
    caption: 'What the job is, how it is worked, and the seniority you are hiring at.',
  },
  {
    id: 'requirements',
    label: 'Requirements',
    title: 'Responsibilities and requirements',
    caption: 'What the person will do, and what they need to bring.',
  },
  {
    id: 'compensation',
    label: 'Compensation',
    title: 'Pay range',
    caption: 'Optional — but postings that state a range get more qualified applicants.',
  },
  {
    id: 'screening',
    label: 'Screening',
    title: 'Applications and screening',
    caption: 'What applicants must attach, and the ATS score below which they cannot apply.',
  },
  {
    id: 'preview',
    label: 'Preview',
    title: 'Preview your posting',
    caption: 'This is what a candidate reads. Go back to any step to change it.',
  },
  {
    id: 'publish',
    label: 'Publish',
    title: 'Ready to publish?',
    caption: 'Nothing is posted until you confirm.',
  },
];

export const STEP_IDS = STEPS.map((s) => s.id);

export function stepIndex(id: string): number {
  const i = STEP_IDS.indexOf(id as StepId);
  return i === -1 ? 0 : i;
}

export function isStepId(value: string): value is StepId {
  return (STEP_IDS as string[]).includes(value);
}

/**
 * The earliest step at which a real server draft is possible.
 *
 * POST /api/hiring/jobs rejects a payload without BOTH title and description.
 * Title is step 1 and description is step 2, so index 2 — the Requirements
 * step — is the first place "Save draft" can succeed. Offering it sooner would
 * be a button that always fails.
 */
export const FIRST_SERVER_DRAFT_STEP = 2;

export function canSaveServerDraft(draft: JobDraft): boolean {
  return Boolean(draft.title.trim() && draft.description.trim());
}

/* ── Validation ───────────────────────────────────────────────────────────
   Each step validates ONLY its own fields. The two hard requirements mirror
   the server's rule exactly; everything else is a real constraint the server
   or the data model imposes, never an invented one. */

export type FieldErrors = Partial<Record<keyof JobDraft, string>>;

export function validateStep(id: StepId, draft: JobDraft): FieldErrors {
  const errors: FieldErrors = {};

  if (id === 'basics') {
    if (!draft.title.trim()) errors.title = 'Add a job title so candidates can find this role.';
    /* Location is required unless the role is fully remote, where there is
       nothing truthful to put in it. */
    if (draft.workMode !== 'remote' && !draft.location.trim()) {
      errors.location = 'Add a city or location for an on-site or hybrid role.';
    }
  }

  if (id === 'details' && !draft.description.trim()) {
    errors.description = 'Describe the role — this is what candidates read first.';
  }

  if (id === 'compensation') {
    const min = draft.salaryMin.trim();
    const max = draft.salaryMax.trim();
    const bad = (v: string) => v !== '' && (!Number.isFinite(Number(v)) || Number(v) <= 0);
    if (bad(min)) errors.salaryMin = 'Enter a number greater than zero, or leave it blank.';
    if (bad(max)) errors.salaryMax = 'Enter a number greater than zero, or leave it blank.';
    if (!bad(min) && !bad(max) && min !== '' && max !== '' && Number(min) > Number(max)) {
      errors.salaryMax = 'The maximum must be at least the minimum.';
    }
  }

  if (id === 'screening') {
    const score = Number(draft.minimumAtsScore);
    if (draft.minimumAtsScore.trim() === '' || !Number.isFinite(score) || score < 0 || score > 100) {
      errors.minimumAtsScore = 'Enter a score between 0 and 100.';
    }
  }

  return errors;
}

/** Every step whose required fields are still missing. Drives the progress rail. */
export function incompleteSteps(draft: JobDraft): StepId[] {
  return STEP_IDS.filter((id) => Object.keys(validateStep(id, draft)).length > 0);
}

/* ── Payload ──────────────────────────────────────────────────────────────*/

const lines = (value: string): string[] =>
  value.split('\n').map((item) => item.trim()).filter(Boolean);

const salaryNumber = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
};

/**
 * The request body, identical to what the previous single-page form sent.
 *
 * `language` and `country` are deliberately absent: no field on
 * HiringJobPosting stores them, so sending them would be data the server
 * discards while the UI implies it was saved.
 */
export function buildJobPayload(
  draft: JobDraft,
  options: { editId?: string; status?: string } = {},
): Record<string, unknown> {
  const salaryMin = salaryNumber(draft.salaryMin);
  const salaryMax = salaryNumber(draft.salaryMax);
  const hasSalary = salaryMin !== undefined || salaryMax !== undefined;

  return {
    ...(options.editId ? { id: options.editId } : {}),
    title: draft.title,
    department: draft.department,
    location: draft.location,
    employmentType: draft.employmentType,
    workMode: draft.workMode,
    hiringUrgency: draft.hiringUrgency || undefined,
    experienceLevel: draft.experienceLevel,
    description: draft.description,
    status: options.status ?? draft.status,
    minimumAtsScore: Number(draft.minimumAtsScore || 0),
    responsibilities: lines(draft.responsibilities),
    requirements: lines(draft.requirements),
    preferredSkills: lines(draft.preferredSkills),
    requiredDocuments: lines(draft.requiredDocuments),
    targetRoleKeywords: draft.title.split(/\s+/).filter(Boolean),
    ...(hasSalary
      ? {
          ...(salaryMin !== undefined ? { salaryMin } : {}),
          ...(salaryMax !== undefined ? { salaryMax } : {}),
          salaryCurrency: draft.salaryCurrency,
          salaryPeriod: draft.salaryPeriod,
        }
      : {}),
  };
}

/** Rebuilds the wizard draft from a stored job, for the ?edit= flow. */
export function draftFromJob(job: Record<string, unknown>): JobDraft {
  const text = (v: unknown, fallback = '') => (v === undefined || v === null ? fallback : String(v));
  const list = (v: unknown) => (Array.isArray(v) ? v.join('\n') : '');
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? String(v) : '');
  return {
    ...EMPTY_DRAFT,
    title: text(job.title),
    department: text(job.department),
    location: text(job.location),
    employmentType: text(job.employmentType, 'full_time'),
    workMode: text(job.workMode, 'hybrid'),
    hiringUrgency: text(job.hiringUrgency, ''),
    experienceLevel: text(job.experienceLevel, 'associate'),
    description: text(job.description),
    responsibilities: list(job.responsibilities),
    requirements: list(job.requirements),
    preferredSkills: list(job.preferredSkills),
    requiredDocuments: list(job.requiredDocuments),
    minimumAtsScore: text(job.minimumAtsScore, '72'),
    status: text(job.status, 'published'),
    salaryMin: num(job.salaryMin),
    salaryMax: num(job.salaryMax),
    salaryCurrency: text(job.salaryCurrency, 'INR'),
    salaryPeriod: text(job.salaryPeriod, 'year'),
  };
}

/* ── Local restore ────────────────────────────────────────────────────────
   Survives a refresh, a closed tab and a Back navigation. It holds ONLY what
   the poster typed about a job — nothing about the account, and no server
   response — so it is safe in localStorage. It is not persistence: the
   authority is always the record the server returns. */

const DRAFT_KEY = 'docrud-job-post-draft';
const DRAFT_VERSION = 2;
/* A draft older than this is stale enough that restoring it would surprise
   someone returning weeks later to post a different job. */
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredDraft {
  version: number;
  savedAt: number;
  /** Which job this belongs to, so an edit draft never leaks into a new post. */
  editId: string;
  step: StepId;
  draft: JobDraft;
}

/** Namespaced per job so editing one posting cannot restore another's text. */
function storageKey(editId: string): string {
  return editId ? `${DRAFT_KEY}:${editId}` : DRAFT_KEY;
}

export function saveLocalDraft(editId: string, step: StepId, draft: JobDraft): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: StoredDraft = { version: DRAFT_VERSION, savedAt: Date.now(), editId, step, draft };
    window.localStorage.setItem(storageKey(editId), JSON.stringify(payload));
  } catch {
    /* Private mode, a full quota, or blocked site data. The wizard still works
       in memory; losing the restore is not worth breaking the page over. */
  }
}

export function readLocalDraft(editId: string): { step: StepId; draft: JobDraft } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(editId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    if (parsed?.version !== DRAFT_VERSION) return null;
    if (parsed.editId !== editId) return null;
    if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > DRAFT_MAX_AGE_MS) return null;
    if (!parsed.draft || typeof parsed.draft !== 'object') return null;
    /* Merged over EMPTY_DRAFT so a draft written by an older build, missing
       fields this one expects, restores rather than rendering undefined. */
    const draft: JobDraft = { ...EMPTY_DRAFT, ...parsed.draft };
    for (const key of Object.keys(EMPTY_DRAFT) as Array<keyof JobDraft>) {
      if (typeof draft[key] !== 'string') draft[key] = EMPTY_DRAFT[key];
    }
    const step = isStepId(String(parsed.step)) ? (parsed.step as StepId) : 'basics';
    return { step, draft };
  } catch {
    return null;
  }
}

export function clearLocalDraft(editId: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(storageKey(editId)); } catch { /* see above */ }
}

/** True when the draft holds anything a poster would mind losing. */
export function draftHasContent(draft: JobDraft): boolean {
  return (Object.keys(EMPTY_DRAFT) as Array<keyof JobDraft>)
    .some((key) => draft[key].trim() !== EMPTY_DRAFT[key]);
}
