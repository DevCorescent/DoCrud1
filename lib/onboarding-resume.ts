/**
 * The resume a person may attach on the first onboarding step.
 *
 * ═══ WHAT THIS DOES, AND WHAT IT DOES NOT ═══
 *
 * It holds the chosen file in the flow and validates it against the SAME rules
 * the existing parser enforces (8 MB, the document types
 * lib/server/document-parser.ts can read). Nothing is uploaded here.
 *
 * It does NOT extract anything, and it deliberately does not try.
 * /api/onboarding/parse-resume returns 401 without a session and writes its
 * result to `session.user.id`; this step is pre-auth by design, so there is no
 * authorised way to parse from here. Parsing is therefore deferred until after
 * authentication rather than worked around — opening an unauthenticated,
 * AI-backed file endpoint is a cost and abuse decision, not a UI one.
 *
 * The consequence, stated plainly so nothing downstream pretends otherwise:
 * name, roles and skills are NOT pre-filled from a resume yet. Every step
 * already accepts its value from the flow, so when parsing becomes available
 * post-auth the suggestions flow in without any step changing.
 */

/** Mirrors the parser's own limit. */
export const RESUME_MAX_BYTES = 8 * 1024 * 1024;

/** The document types lib/server/document-parser.ts can actually read. */
export const RESUME_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'html', 'htm'] as const;

export const RESUME_ACCEPT = RESUME_EXTENSIONS.map(e => `.${e}`).join(',');

export type ResumeRejection = { code: 'NO_FILE' | 'TOO_LARGE' | 'EMPTY' | 'UNSUPPORTED'; message: string };

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase();
}

/** Null when the file is acceptable. Same shape the logo uploader uses. */
export function validateResumeUpload(file: File | null | undefined): ResumeRejection | null {
  if (!file) return { code: 'NO_FILE', message: 'Choose a file to continue.' };
  if (file.size === 0) return { code: 'EMPTY', message: 'That file is empty.' };
  if (file.size > RESUME_MAX_BYTES) {
    return { code: 'TOO_LARGE', message: `That file is over ${RESUME_MAX_BYTES / 1024 / 1024} MB.` };
  }
  if (!(RESUME_EXTENSIONS as readonly string[]).includes(extensionOf(file.name))) {
    return { code: 'UNSUPPORTED', message: `We can read ${RESUME_EXTENSIONS.join(', ')} files.` };
  }
  return null;
}

/* ── Extraction ────────────────────────────────────────────────────────── */

/**
 * What the résumé suggested. Every field is a suggestion the person may
 * overwrite; none of it is treated as an answer.
 */
export type ResumeExtraction = {
  name?: string;
  /** JobDomain ids, for the Role step. */
  roles: string[];
  /** Canonical ATS skill names, for the Skills step. */
  skills: string[];
};

/**
 * The four outcomes, kept distinct on purpose.
 *
 * "read it, found nothing" is not the same as "could not read it", and neither
 * is a failure the person should be blocked by. The UI says which happened and
 * carries on either way.
 */
export type ExtractionState =
  | { status: 'none' }
  | { status: 'parsing' }
  | { status: 'done'; extraction: ResumeExtraction }
  | { status: 'empty' }
  | { status: 'failed'; message: string };

/**
 * Reads a résumé through the anonymous onboarding route.
 *
 * Deliberately never throws: a résumé that cannot be read must not stop
 * onboarding, so every outcome comes back as a state the caller can render.
 */
export async function extractResume(file: File, signal?: AbortSignal): Promise<ExtractionState> {
  const body = new FormData();
  body.append('file', file);
  try {
    const res = await fetch('/api/onboarding/resume-extract', { method: 'POST', body, signal });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { status: 'failed', message: data?.error || 'We could not read that file.' };
    }
    if (!data?.readable) return { status: 'empty' };
    const extraction: ResumeExtraction = {
      name: typeof data.extraction?.name === 'string' ? data.extraction.name : undefined,
      roles: Array.isArray(data.extraction?.roles) ? data.extraction.roles : [],
      skills: Array.isArray(data.extraction?.skills) ? data.extraction.skills : [],
    };
    /* Read cleanly but nothing to offer — say so rather than claiming success. */
    if (!extraction.name && !extraction.roles.length && !extraction.skills.length) {
      return { status: 'empty' };
    }
    return { status: 'done', extraction };
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') return { status: 'none' };
    return { status: 'failed', message: 'We could not read that file.' };
  }
}
