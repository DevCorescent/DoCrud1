export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { getAuthSession } from '@/lib/server/auth';
import { getProfileData, updateProfileData } from '@/lib/server/user-profiles';
import { generateAiText, isAiConfigured } from '@/lib/server/ai';
import { resolveParsedResume } from '@/lib/server/resume-upload-parse';
import { isR2Configured, uploadToR2 } from '@/lib/server/r2';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_HISTORY = 5;

const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

/**
 * Store resume buffer.
 * Priority: R2 (works everywhere) → /tmp (Vercel safe) → local public/uploads (dev only)
 * Returns a public URL or null if storage is unavailable.
 */
async function storeResumeFile(
  buf: Buffer,
  userId: string,
  fileType: string,
  fileName: string,
): Promise<{ url: string | null; storageMethod: string }> {
  const uid  = userId.replace(/[^a-z0-9]/gi, '').slice(0, 12);
  const rand = crypto.randomBytes(6).toString('hex');
  const ext  = fileType;
  const key  = `resumes/${uid}_${rand}.${ext}`;

  // ── 1. R2 (production-safe, publicly accessible) ──────────────────────────
  if (isR2Configured()) {
    try {
      const url = await uploadToR2(key, buf, ext === 'pdf' ? 'application/pdf' : 'application/octet-stream');
      console.log(`[upload-resume] stored to R2: ${url}`);
      return { url, storageMethod: 'r2' };
    } catch (r2Err) {
      console.error('[upload-resume] R2 upload failed:', r2Err instanceof Error ? `${r2Err.message}` : r2Err);
    }
  } else {
    console.warn('[upload-resume] R2 not configured (ACCOUNT_ID/ACCESS_KEY/SECRET/BUCKET/PUBLIC_URL) — skipping R2');
  }

  // ── 2. /tmp fallback (Vercel has 512 MB ephemeral /tmp) ───────────────────
  if (isVercel) {
    try {
      const tmpPath = path.join('/tmp', `resume_${uid}_${rand}.${ext}`);
      await fs.writeFile(tmpPath, buf);
      console.log(`[upload-resume] stored to /tmp: ${tmpPath} (ephemeral — not publicly accessible)`);
      return { url: null, storageMethod: 'tmp' }; // /tmp is not publicly served
    } catch (tmpErr) {
      console.error('[upload-resume] /tmp write failed:', tmpErr instanceof Error ? tmpErr.message : tmpErr);
    }
  }

  // ── 3. Local disk (dev only) ───────────────────────────────────────────────
  if (!isVercel) {
    try {
      const dir = path.join(process.cwd(), 'public', 'uploads', 'resumes');
      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `${uid}_${rand}.${ext}`);
      await fs.writeFile(filePath, buf);
      const url = `/uploads/resumes/${uid}_${rand}.${ext}`;
      console.log(`[upload-resume] stored locally: ${url}`);
      return { url, storageMethod: 'local' };
    } catch (localErr) {
      console.error('[upload-resume] local write failed:', localErr instanceof Error ? localErr.message : localErr);
    }
  }

  // ── No storage available — parse still proceeds, file URL will be null ────
  console.warn('[upload-resume] all storage methods failed — resume will be parsed but file URL will not be stored');
  return { url: null, storageMethod: 'none' };
}

/* ─── Magic-byte file detection ───────────────────────────────────────────── */
type KnownType = 'pdf' | 'docx' | 'doc' | 'txt';

function detectType(buf: Buffer, name: string): KnownType {
  if (buf.length >= 4) {
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'pdf';
    if (buf[0] === 0x50 && buf[1] === 0x4b) return 'docx';
    if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return 'doc';
  }
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'doc') return 'doc';
  if (['txt', 'md', 'rtf'].includes(ext)) return 'txt';
  const snippet = buf.slice(0, 512).toString('utf8');
  const printable = snippet.split('').filter(c => c.charCodeAt(0) >= 32 || '\n\r\t'.includes(c)).length;
  return snippet.length > 0 && printable / snippet.length > 0.85 ? 'txt' : 'txt';
}

/* ─── PDF extraction — pure Node.js, no browser deps, no worker ──────────── */
// Handles FlateDecode-compressed streams (virtually all modern resume PDFs).
// Extracts both literal (text) and hex <AABB> string operands from BT/ET blocks.

function pdfDecodeLiteral(s: string): string {
  return s
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\')
    .replace(/\\([0-7]{1,3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8)));
}

function pdfDecodeHex(hex: string): string {
  const h = hex.replace(/\s/g, '');
  let r = '';
  for (let i = 0; i < h.length; i += 2) r += String.fromCharCode(parseInt(h.slice(i, i + 2) || '0', 16));
  return r;
}

async function extractPdf(buf: Buffer): Promise<string> {
  console.log(`[pdf-extract] START size=${buf.length}`);
  const { inflateSync } = await import('node:zlib');

  const raw   = buf.toString('binary');
  const texts: string[] = [];

  // Walk every stream…endstream block in the file
  // Array.from avoids RegExpStringIterator + downlevelIteration TS error under es6 lib
  for (const sm of Array.from(raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g))) {
    let content = sm[1];

    // Attempt FlateDecode — covers virtually all modern text PDFs
    try { content = inflateSync(Buffer.from(sm[1], 'binary')).toString('latin1'); }
    catch { /* uncompressed or non-zlib stream — use as-is */ }

    // Process BT…ET text objects
    for (const bm of Array.from(content.matchAll(/BT([\s\S]*?)ET/g))) {
      const block = bm[1];

      // Tj / ' / "  (single string operands — literal)
      for (const m of Array.from(block.matchAll(/\(((?:[^)(\\]|\\[\s\S])*)\)\s*(?:Tj|'|")/g)))
        { const t = pdfDecodeLiteral(m[1]); if (t.trim()) texts.push(t); }

      // Tj  (single hex string)
      for (const m of Array.from(block.matchAll(/<([0-9A-Fa-f\s]*)>\s*Tj/g)))
        { const t = pdfDecodeHex(m[1]); if (t.trim()) texts.push(t); }

      // TJ  (array — mix of literal + hex + kerning numbers)
      for (const am of Array.from(block.matchAll(/\[([\s\S]*?)\]\s*TJ/g))) {
        const parts: string[] = [];
        for (const m of Array.from(am[1].matchAll(/\(((?:[^)(\\]|\\[\s\S])*)\)/g))) parts.push(pdfDecodeLiteral(m[1]));
        for (const m of Array.from(am[1].matchAll(/<([0-9A-Fa-f\s]*)>/g)))          parts.push(pdfDecodeHex(m[1]));
        const combined = parts.join('');
        if (combined.trim()) texts.push(combined);
      }
    }
  }

  const result = texts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  console.log(`[pdf-extract] done — streams scanned, ${texts.length} text chunks, ${result.length} chars`);

  if (!result) throw new Error('No readable text found in PDF — the file may be scanned/image-based');
  return result;
}

/* ─── DOCX/DOC extraction ─────────────────────────────────────────────────── */
async function extractDocx(buf: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  try {
    const res = await mammoth.extractRawText({ buffer: buf });
    if (res.value.trim().length > 20) return res.value;
  } catch { /* fall through */ }
  const html = await mammoth.convertToHtml({ buffer: buf });
  return html.value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ─── Unified extraction with fallbacks ───────────────────────────────────── */
async function extractText(buf: Buffer, type: KnownType): Promise<{ text: string; warning?: string }> {
  try {
    let raw = '';
    if (type === 'pdf') raw = await extractPdf(buf);
    else if (type === 'docx' || type === 'doc') raw = await extractDocx(buf);
    else raw = buf.toString('utf8');

    // Detect image-only PDF (no actual text layer)
    if (type === 'pdf' && raw.replace(/--- PAGE BREAK ---/g, '').trim().length < 80) {
      return {
        text: raw,
        warning: 'This PDF appears to be scanned/image-based with very little extractable text. Upload a text-based PDF or Word document for best results.',
      };
    }

    return { text: raw };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[upload-resume] extraction error, falling back to raw utf8:', msg, err);
    const raw = buf.toString('utf8');
    return { text: raw, warning: `Text extraction failed (${msg}) — try uploading a .docx file instead.` };
  }
}


/* ─── Route handler ───────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get('resume');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: `File too large — max ${MAX_BYTES / 1024 / 1024} MB.` }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: 'The file appears to be empty.' }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const fileType = detectType(buf, file.name);

    console.log(`[upload-resume] userId=${userId} file="${file.name}" size=${file.size}B detectedType=${fileType}`);

    /* ── extract text ── */
    const { text: rawText, warning: extractWarning } = await extractText(buf, fileType);
    const cleaned = rawText.trim().replace(/\s{3,}/g, '\n\n');

    console.log(`[upload-resume] text extracted: ${cleaned.length} chars${extractWarning ? ` WARNING: ${extractWarning}` : ''}`);

    if (cleaned.length < 30) {
      console.error(`[upload-resume] insufficient text (${cleaned.length} chars) — snippet: "${cleaned.slice(0, 80)}"`);
      return NextResponse.json(
        { error: "Not enough readable text found. Make sure the file isn't a scanned image, password-protected, or empty. Try a Word .docx file for best results." },
        { status: 422 },
      );
    }

    /* ── store file (R2 → /tmp → local) — never block parse on storage failure ── */
    const extMap: Record<KnownType, string> = { pdf: 'pdf', docx: 'docx', doc: 'doc', txt: 'txt' };
    console.log(`[upload-resume] env=vercel:${isVercel} r2:${isR2Configured()} — storing file`);
    const { url: fileUrl, storageMethod } = await storeResumeFile(buf, userId, extMap[fileType], file.name);
    console.log(`[upload-resume] storage method=${storageMethod} url=${fileUrl ?? 'null'}`);

    /* ── parse: AI first, deterministic parser second ──
       The AI is no longer the only parser. When it fails — a retired model, a
       timeout, malformed JSON, or no key at all — `resolveParsedResume` falls
       back to the pure sectioner in lib/server/ats/resume-text.ts. If BOTH
       come up empty the score is null, not zero: a parser outage must never be
       published to a member as "your resume scored 0". */
    const aiAvailable = isAiConfigured();
    console.log(`[upload-resume] AI configured: ${aiAvailable}`);

    const trimmed = cleaned.slice(0, 12000); // ~3 dense pages
    if (aiAvailable) console.log(`[upload-resume] calling AI with ${trimmed.length} chars`);

    const runAi = async () => generateAiText([
          {
            role: 'system',
            content: `You are an expert resume parser. Your job is to extract EVERY piece of professional information from the resume text.

Return ONLY valid raw JSON with exactly this schema. No markdown, no explanation:
{
  "headline":  string | null,
  "bio":       string | null,
  "location":  string | null,
  "website":   string | null,
  "skills":    string[],
  "experience": [{ "title": string, "company": string, "period": string, "desc": string | null }],
  "education":  [{ "degree": string, "school": string, "year": string | null }],
  "achievements": [{ "title": string, "desc": string | null }],
  "socialLinks": { "linkedin": string | null, "github": string | null, "twitter": string | null }
}

FIELD RULES — follow exactly:
headline:     Most recent job title + " at " + company. E.g. "Product Designer at Flipkart". Max 90 chars. null if no job info.
bio:          1st-person professional summary (start with "I "). Condense any summary section; or write 2–3 sentences from the work history if no summary exists. Max 450 chars.
location:     City + Country or City + State. From contact/header section. E.g. "Bengaluru, India".
website:      Personal portfolio or site URL (not LinkedIn). Full URL with https://. null if absent.
skills:       ALL skills, tools, frameworks, languages mentioned anywhere. Short labels only. Max 25.
experience:   ALL roles, internships, freelance work. Reverse-chronological. period: "MMM YYYY – MMM YYYY" or "MMM YYYY – Present". desc: one strong impact sentence max 150 chars. Max 10.
education:    ALL degrees, diplomas, certs, bootcamps. year: graduation year string or null. Max 8.
achievements: Awards, publications, patents, open-source, speaking, hackathon wins. Max 8.
socialLinks:  Extract full URLs — linkedin.com/in/…, github.com/…, x.com/… or twitter.com/…. null if not present.

Be thorough. Extract EVERYTHING. If a field is genuinely missing from the resume, use null/[].`,
          },
          {
            role: 'user',
            content: `Parse this resume completely:\n\n${trimmed}`,
          },
        ]);

    const { parsed: safe, source: parseSource, atsScore, notes: parseNotes } =
      await resolveParsedResume(cleaned, aiAvailable ? runAi : null);

    console.log(
      `[upload-resume] parse source=${parseSource} skills=${safe.skills.length} `
      + `exp=${safe.experience.length} edu=${safe.education.length} `
      + `ats=${atsScore ? `${atsScore.score}/${atsScore.grade}` : 'not-scored'}`
      + (parseNotes.length ? ` notes=${parseNotes.join(',')}` : ''),
    );

    /* A parse that recovered nothing is an infrastructure fault, not a verdict
       on the resume. It is logged at error level so it shows up in production
       triage instead of being absorbed as a very low score. */
    if (parseSource === 'none') {
      console.error(`[upload-resume] BOTH parsers returned nothing — no ATS score stored. notes=${parseNotes.join(',')}`);
    }

    /* ── apply to profile ── */
    const existing = await getProfileData(userId);
    const appliedFields: string[] = [];
    const patch: Record<string, unknown> = {};

    if (safe.headline) { patch.headline = safe.headline; appliedFields.push('Headline'); }
    if (safe.bio)      { patch.bio      = safe.bio;      appliedFields.push('Bio'); }
    if (safe.location) { patch.location = safe.location; appliedFields.push('Location'); }
    if (safe.website)  { patch.website  = safe.website;  appliedFields.push('Website'); }

    if (safe.skills.length > 0) {
      const existing_skills = existing.skills ?? [];
      const seen = new Set(existing_skills.map(s => s.toLowerCase()));
      patch.skills = [...existing_skills, ...safe.skills.filter(s => !seen.has(s.toLowerCase()))].slice(0, 25);
      appliedFields.push(`Skills (${safe.skills.length})`);
    }

    if (safe.experience.length > 0) {
      patch.experience = safe.experience.map(e => ({ title: e.title, company: e.company, period: e.period, ...(e.desc ? { desc: e.desc } : {}) }));
      appliedFields.push(`Experience (${safe.experience.length} roles)`);
    }

    if (safe.education.length > 0) {
      patch.education = safe.education.map(e => ({ degree: e.degree, school: e.school, ...(e.year ? { year: e.year } : {}) }));
      appliedFields.push(`Education (${safe.education.length} entries)`);
    }

    if (safe.achievements.length > 0) {
      patch.achievements = safe.achievements.map(e => ({ title: e.title, ...(e.desc ? { desc: e.desc } : {}) }));
      appliedFields.push(`Achievements (${safe.achievements.length})`);
    }

    const newSocialLinks: Record<string, string> = {};
    if (safe.socialLinks.linkedin && !existing.socialLinks?.linkedin) newSocialLinks.linkedin = safe.socialLinks.linkedin;
    if (safe.socialLinks.github   && !existing.socialLinks?.github)   newSocialLinks.github   = safe.socialLinks.github;
    if (safe.socialLinks.twitter  && !existing.socialLinks?.twitter)  newSocialLinks.twitter  = safe.socialLinks.twitter;
    if (Object.keys(newSocialLinks).length > 0) {
      patch.socialLinks = { ...(existing.socialLinks ?? {}), ...newSocialLinks };
      appliedFields.push('Social links');
    }

    // Build resume history entry
    const newEntry = {
      id: crypto.randomUUID(),
      fileName: file.name,
      url: fileUrl,
      uploadedAt: new Date().toISOString(),
      /* Null when no parser recovered anything. The profile UI already guards
         on `atsScore` being present and renders "no quality score recorded"
         instead of a 0% dial. */
      atsScore,
      parsedData: {
        headline:     safe.headline,
        bio:          safe.bio,
        location:     safe.location,
        website:      safe.website,
        skills:       safe.skills,
        experience:   safe.experience,
        education:    safe.education,
        achievements: safe.achievements,
        socialLinks:  safe.socialLinks,
      },
    };
    patch.resumeFiles = [newEntry, ...(existing.resumeFiles ?? [])].slice(0, MAX_HISTORY);

    console.log(`[upload-resume] applying fields to profile: ${appliedFields.join(', ') || 'none'} | ATS ${atsScore ? `score=${atsScore.score} grade=${atsScore.grade}` : 'not scored (parse failed)'}`);

    try {
      await updateProfileData(userId, patch as Parameters<typeof updateProfileData>[1]);
    } catch (dbErr) {
      console.error('[upload-resume] updateProfileData failed for', userId, dbErr);
      return NextResponse.json({ error: 'Profile update failed — please try again.' }, { status: 500 });
    }
    const updated = await getProfileData(userId);

    return NextResponse.json({
      profile:       updated,
      id:            newEntry.id,
      fileName:      file.name,
      url:           fileUrl,
      uploadedAt:    newEntry.uploadedAt,
      atsScore,
      appliedFields,
      aiConfigured:  aiAvailable,
      /* How the resume was read: 'ai', 'deterministic', or 'none' when neither
         parser recovered anything. A client must use this — not `atsScore === 0`
         — to decide whether parsing failed. */
      parseSource,
      parseFailed:   parseSource === 'none',
      warning:       extractWarning ?? (parseSource === 'none'
        ? "We stored your resume, but couldn't read its contents well enough to score it or fill in your profile. Try a text-based PDF or a .docx file."
        : null),
    });

  } catch (err) {
    console.error('[profile/upload-resume] unhandled error', err);
    return NextResponse.json({ error: 'Resume upload failed — please try again.' }, { status: 500 });
  }
}
