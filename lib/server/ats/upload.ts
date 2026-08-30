/**
 * ATS upload — validation rules, kept pure so they can be tested.
 *
 * The route that uses them (app/api/ats/upload/route.ts) parses a file and
 * returns the parsed resume to the caller. It writes NOTHING: not the profile,
 * not the resume history, not object storage. That is the whole reason this
 * path exists rather than reusing /api/profile/upload-resume, which rewrites
 * headline, bio, location, skills, experience, education and resumeFiles as a
 * side effect of uploading. Evaluating a resume against a job posting must not
 * silently rewrite the member's profile.
 */

/* The formats and the size ceiling live in lib/ats-upload-limits.ts, outside
   lib/server, because the file input in the browser needs the same lists. */
export {
  ALLOWED_RESUME_TYPES, ALLOWED_RESUME_EXTENSIONS, MAX_UPLOAD_BYTES,
  RESUME_ACCEPT_ATTRIBUTE,
} from '@/lib/ats-upload-limits';
import { ALLOWED_RESUME_TYPES, ALLOWED_RESUME_EXTENSIONS, MAX_UPLOAD_BYTES } from '@/lib/ats-upload-limits';

/** Below this the extraction produced nothing worth scoring. */
export const MIN_EXTRACTED_CHARS = 30;

export type UploadRejection =
  | { code: 'NO_FILE'; message: string }
  | { code: 'EMPTY_FILE'; message: string }
  | { code: 'FILE_TOO_LARGE'; message: string }
  | { code: 'UNSUPPORTED_FORMAT'; message: string };

export function extensionOf(fileName: string): string {
  const parts = fileName.trim().toLowerCase().split('.');
  return parts.length > 1 ? (parts.pop() ?? '') : '';
}

/**
 * Validate a file before any bytes are read.
 *
 * The EXTENSION is authoritative when the browser's MIME type is absent or
 * generic — browsers routinely send `application/octet-stream` for a .docx, and
 * rejecting on that alone would refuse valid resumes. Neither signal is
 * trusted on its own: one of the two must name a supported format.
 */
export function validateResumeUpload(
  file: { name: string; size: number; type: string } | null,
): UploadRejection | null {
  if (!file) {
    return { code: 'NO_FILE', message: 'Choose a resume file to upload.' };
  }
  if (file.size === 0) {
    return { code: 'EMPTY_FILE', message: 'That file is empty. Choose a different resume.' };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      code: 'FILE_TOO_LARGE',
      message: `That file is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Upload a smaller resume.`,
    };
  }
  const byMime = Boolean(ALLOWED_RESUME_TYPES[file.type?.toLowerCase() ?? '']);
  const byExtension = ALLOWED_RESUME_EXTENSIONS.includes(extensionOf(file.name));
  if (!byMime && !byExtension) {
    return {
      code: 'UNSUPPORTED_FORMAT',
      message: 'Upload a PDF, DOCX, DOC, RTF, MD or TXT resume.',
    };
  }
  return null;
}
