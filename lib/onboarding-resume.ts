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
