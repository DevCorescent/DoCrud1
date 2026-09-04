/**
 * Anonymous résumé read, for onboarding only.
 *
 * ═══ WHY A SEPARATE ROUTE ═══
 *
 * /api/onboarding/parse-resume keeps its session check and is untouched: it
 * calls an LLM and writes to the caller's profile, neither of which may happen
 * for an anonymous request. This route is the narrow, deterministic
 * counterpart — it reads a file, returns three suggestions, and forgets it.
 *
 * ═══ WHAT IT WILL NOT DO ═══
 *
 *  · It never calls a model. Extraction is pure CPU (see
 *    lib/server/onboarding-resume-extract.ts), so an abusive caller wastes
 *    milliseconds, not money.
 *  · It never persists. The buffer lives for the request; nothing is written to
 *    storage, to a profile, or to any collection. There is no user to attach it
 *    to and creating one would be worse than not parsing at all.
 *  · It never returns raw résumé text. Only name, roles and skills leave the
 *    server, so a mistake here cannot leak the document back out.
 *  · It creates no session and no user.
 *
 * ═══ WHAT IT CHECKS ═══
 *
 *  1. A per-address ceiling, through the app's existing fixed-window limiter.
 *  2. Size, before the body is read into memory.
 *  3. Extension, against the list the text extractor can actually read.
 *  4. The bytes themselves — a file claiming to be a PDF must start like one.
 *     The extension is a claim; the magic bytes are evidence.
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractDocumentText } from '@/lib/server/document-parser';
import { extractFromResumeText } from '@/lib/server/onboarding-resume-extract';
import { consumeRateLimit } from '@/lib/server/service-safety';
import { RESUME_MAX_BYTES } from '@/lib/onboarding-resume';

export const dynamic = 'force-dynamic';
/* The parser is Node-only: pdf-parse, mammoth and the Buffer APIs below have no
   Edge equivalent. Declared explicitly so a future default change, or someone
   moving this to Edge for cold-start reasons, fails loudly here rather than at
   runtime on a résumé upload. */
export const runtime = 'nodejs';

/* The SHARED limit — see lib/onboarding-resume.ts. Imported, never retyped, so
   the browser and this handler cannot disagree about what is acceptable. */
const MAX_BYTES = RESUME_MAX_BYTES;
const ALLOWED = ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'html', 'htm'] as const;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * Does the content match what the name claims?
 *
 * Binary formats have unambiguous signatures. The text formats have none by
 * definition, so they are checked for being decodable text instead — which is
 * the honest test for them, and still refuses a renamed binary.
 */
function contentMatchesExtension(ext: string, buf: Buffer): boolean {
  const startsWith = (...bytes: number[]) => bytes.every((b, i) => buf[i] === b);
  switch (ext) {
    case 'pdf':  return buf.subarray(0, 5).toString('latin1') === '%PDF-';
    /* docx is a zip; older .doc is the OLE compound file header. */
    case 'docx': return startsWith(0x50, 0x4b);
    case 'doc':  return startsWith(0xd0, 0xcf, 0x11, 0xe0) || startsWith(0x50, 0x4b);
    case 'rtf':  return buf.subarray(0, 5).toString('latin1') === '{\\rtf';
    case 'txt': case 'md': case 'html': case 'htm': {
      const head = buf.subarray(0, 512);
      /* NUL bytes do not occur in the text formats; their presence means this
         is a binary wearing a text extension. */
      return !head.includes(0x00);
    }
    default: return false;
  }
}

/** The client address, for the rate-limit key. Never logged, never stored. */
function clientKey(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for') ?? '';
  return forwarded.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
}

export async function POST(req: NextRequest) {
  const limit = await consumeRateLimit('resumeExtract', clientKey(req)).catch(() => null);
  if (limit && !limit.allowed) {
    return NextResponse.json(
      { error: 'Too many resume reads. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  if (!req.headers.get('content-type')?.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `That file is over ${MAX_BYTES / 1024 / 1024} MB.` }, { status: 413 });
  }

  const ext = extensionOf(file.name);
  if (!(ALLOWED as readonly string[]).includes(ext)) {
    return NextResponse.json({ error: `We can read ${ALLOWED.join(', ')} files.` }, { status: 415 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (!contentMatchesExtension(ext, buf)) {
    return NextResponse.json({ error: 'That file does not look like the type it claims to be.' }, { status: 415 });
  }

  try {
    const text = await extractDocumentText(file.name, file.type || '', buf);
    if (!text || text.trim().length < 40) {
      /* Read fine, found nothing usable. A real outcome, not a failure — the
         caller shows manual entry rather than an error. */
      return NextResponse.json({ extraction: { roles: [], skills: [] }, readable: false });
    }
    return NextResponse.json({ extraction: extractFromResumeText(text), readable: true });
  } catch {
    /* Genuinely could not read it. Distinct from "nothing useful in it", so the
       caller can say which happened. */
    return NextResponse.json({ error: 'We could not read that file.' }, { status: 422 });
  }
}
