/**
 * Resume upload limits — shared by the server route and the browser.
 *
 * Deliberately OUTSIDE lib/server: the file input needs the accept list and the
 * size ceiling, and a client component importing from lib/server would be both
 * a convention violation and a trap the day someone adds a Node import to that
 * module. One definition, imported by both sides, so the input and the
 * validator can never disagree about what is allowed.
 */

/** Matches what lib/server/document-parser.ts can actually read. */
export const ALLOWED_RESUME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
};

export const ALLOWED_RESUME_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf'];

/** The same ceiling /api/profile/upload-resume uses, so neither path surprises. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The `accept` attribute for the file input, derived from the lists above. */
export const RESUME_ACCEPT_ATTRIBUTE = [
  ...Object.keys(ALLOWED_RESUME_TYPES),
  ...ALLOWED_RESUME_EXTENSIONS.map((e) => `.${e}`),
].join(',');
