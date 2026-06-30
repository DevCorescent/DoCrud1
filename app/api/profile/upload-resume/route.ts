export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { getAuthSession } from '@/lib/server/auth';
import { getProfileData, updateProfileData } from '@/lib/server/user-profiles';
import { generateAiText, isAiConfigured } from '@/lib/server/ai';
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

/* ─── DOMMatrix polyfill (pdfjs-dist uses it for text transforms; absent in Node.js) ── */
function ensureDomMatrixPolyfill() {
  if (typeof globalThis.DOMMatrix !== 'undefined') return;
  // Minimal 2-D matrix — only the operations pdfjs-dist needs for text extraction
  class DOMMatrixPolyfill {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    is2D = true; isIdentity = true;
    constructor(init?: number[] | string) {
      if (Array.isArray(init) && init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init as [number, number, number, number, number, number];
        this.m11 = this.a; this.m12 = this.b;
        this.m21 = this.c; this.m22 = this.d;
        this.m41 = this.e; this.m42 = this.f;
      }
    }
    transformPoint(p: { x: number; y: number; z?: number; w?: number }) {
      return { x: this.a * p.x + this.c * p.y + this.e, y: this.b * p.x + this.d * p.y + this.f, z: 0, w: 1 };
    }
    multiply(o: DOMMatrixPolyfill) {
      const r = new DOMMatrixPolyfill();
      r.a = this.a * o.a + this.c * o.b;  r.b = this.b * o.a + this.d * o.b;
      r.c = this.a * o.c + this.c * o.d;  r.d = this.b * o.c + this.d * o.d;
      r.e = this.a * o.e + this.c * o.f + this.e;
      r.f = this.b * o.e + this.d * o.f + this.f;
      return r;
    }
    scale(sx = 1, sy = sx) { const r = new DOMMatrixPolyfill([this.a * sx, this.b * sx, this.c * sy, this.d * sy, this.e, this.f]); return r; }
    translate(tx = 0, ty = 0) { const r = new DOMMatrixPolyfill([this.a, this.b, this.c, this.d, this.e + tx, this.f + ty]); return r; }
    inverse() {
      const det = this.a * this.d - this.b * this.c;
      if (!det) return new DOMMatrixPolyfill();
      return new DOMMatrixPolyfill([this.d / det, -this.b / det, -this.c / det, this.a / det, (this.c * this.f - this.d * this.e) / det, (this.b * this.e - this.a * this.f) / det]);
    }
    toString() { return `matrix(${this.a},${this.b},${this.c},${this.d},${this.e},${this.f})`; }
  }
  (globalThis as Record<string, unknown>).DOMMatrix = DOMMatrixPolyfill;
}

/* ─── PDF extraction ─────────────────────────────────────────────────────── */
async function extractPdf(buf: Buffer): Promise<string> {
  const L = (msg: string) => console.log(`[pdf-extract] ${msg}`);

  L(`START — buf.length=${buf.length} platform=${process.platform} cwd=${process.cwd()}`);
  L(`Node.js version: ${process.version}`);
  L(`DOMMatrix before polyfill: ${typeof (globalThis as Record<string,unknown>).DOMMatrix}`);

  ensureDomMatrixPolyfill();
  L(`DOMMatrix after polyfill: ${typeof (globalThis as Record<string,unknown>).DOMMatrix}`);

  // ── Step 1: resolve worker path ──────────────────────────────────────────
  const nodePath = await import('node:path');
  const nodeFs   = await import('node:fs');
  const workerPath = nodePath.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.mjs');
  const workerExists = nodeFs.existsSync(workerPath);
  L(`worker path: ${workerPath} — exists: ${workerExists}`);

  if (!workerExists) {
    // Log what IS in pdfjs-dist/build to help diagnose
    const buildDir = nodePath.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'build');
    const buildExists = nodeFs.existsSync(buildDir);
    L(`pdfjs build dir (${buildDir}) exists: ${buildExists}`);
    if (buildExists) {
      const files = nodeFs.readdirSync(buildDir).slice(0, 20);
      L(`pdfjs build dir contents: ${files.join(', ')}`);
    }
  }

  // ── Step 2: import pdfjs ─────────────────────────────────────────────────
  L('importing pdfjs-dist…');
  const { getDocument, GlobalWorkerOptions, version: pdfjsVersion } = await import('pdfjs-dist') as typeof import('pdfjs-dist') & { version?: string };
  L(`pdfjs-dist imported — version: ${pdfjsVersion ?? 'unknown'}`);
  L(`GlobalWorkerOptions: ${JSON.stringify({ workerSrc: GlobalWorkerOptions.workerSrc, workerPort: typeof GlobalWorkerOptions.workerPort })}`);

  // ── Step 3: set up worker ─────────────────────────────────────────────────
  if (workerExists) {
    L('creating node:worker_threads Worker…');
    try {
      const { Worker: NodeWorker } = await import('node:worker_threads');
      L(`NodeWorker constructor type: ${typeof NodeWorker}`);
      const nodeWorker = new NodeWorker(workerPath, { type: 'module' } as import('node:worker_threads').WorkerOptions);
      L(`nodeWorker created — type: ${typeof nodeWorker}, keys: ${Object.keys(nodeWorker).slice(0,8).join(',')}`);
      GlobalWorkerOptions.workerPort = nodeWorker as unknown as globalThis.Worker;
      L('workerPort set');

      try {
        L('calling getDocument…');
        const pdf = await getDocument({ data: new Uint8Array(buf), disableFontFace: true, useSystemFonts: false }).promise;
        L(`getDocument resolved — numPages: ${pdf.numPages}`);

        const pageTexts: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page    = await pdf.getPage(i);
          const content = await page.getTextContent();
          const line    = content.items
            .filter(it => 'str' in it && Boolean((it as { str: string }).str.trim()))
            .map(it => (it as { str: string }).str)
            .join(' ');
          if (line.trim()) pageTexts.push(line);
        }
        const result = pageTexts.join('\n\n');
        L(`extraction done — ${result.length} chars across ${pageTexts.length} page blocks`);
        await nodeWorker.terminate();
        return result;
      } catch (pdfjsErr) {
        L(`getDocument/page error: ${pdfjsErr instanceof Error ? pdfjsErr.message : String(pdfjsErr)}`);
        await nodeWorker.terminate().catch(() => {});
        throw pdfjsErr;
      }
    } catch (workerErr) {
      L(`worker_threads setup error: ${workerErr instanceof Error ? workerErr.message : String(workerErr)}`);
      throw workerErr;
    }
  } else {
    L('worker file not found — cannot proceed with pdfjs');
    throw new Error(`pdfjs worker not found at ${workerPath}`);
  }
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

/* ─── AI-parsed resume schema ─────────────────────────────────────────────── */
interface ParsedResume {
  headline:     string | null;
  bio:          string | null;
  location:     string | null;
  website:      string | null;
  skills:       string[];
  experience:   Array<{ title: string; company: string; period: string; desc: string | null }>;
  education:    Array<{ degree: string; school: string; year: string | null }>;
  achievements: Array<{ title: string; desc: string | null }>;
  socialLinks:  { linkedin: string | null; github: string | null; twitter: string | null };
}

/* ─── Rule-based ATS scoring (no AI needed, always works) ────────────────── */
interface AtsScore {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  breakdown: {
    contact:      number;
    summary:      number;
    skills:       number;
    experience:   number;
    education:    number;
    achievements: number;
  };
  tips: string[];
}

function computeAts(p: ParsedResume): AtsScore {
  const tips: string[] = [];
  let contact = 0, summary = 0, skills = 0, experience = 0, education = 0, achievements = 0;

  // Contact (25 pts)
  if (p.headline)              contact += 8; else tips.push('Add a headline (e.g. "Senior Engineer at Google") — most ATS systems prioritise this');
  if (p.location)              contact += 5; else tips.push('Include your city/country — location is a key recruiter filter');
  if (p.website)               contact += 5;
  if (p.socialLinks.linkedin)  contact += 7; else tips.push('Add your LinkedIn URL — 87% of recruiters use LinkedIn to verify candidates');

  // Summary/Bio (15 pts)
  if (p.bio) {
    summary += 8;
    if (p.bio.length > 150) summary += 7;
    else tips.push('Expand your professional summary to 150+ characters for better ATS keyword coverage');
  } else {
    tips.push('Write a professional summary — it\'s the first section ATS and recruiters read');
  }

  // Skills (20 pts)
  const sc = p.skills.length;
  if (sc >= 15)      skills = 20;
  else if (sc >= 10) skills = 15;
  else if (sc >= 5)  skills = 10;
  else               skills = sc * 2;
  if (sc < 10) tips.push(`Add more skills — you have ${sc}, aim for 10–20 relevant keywords`);

  // Experience (25 pts)
  const ec = p.experience.length;
  if (ec >= 4)      experience += 15;
  else if (ec >= 2) experience += 10;
  else if (ec >= 1) experience += 5;
  else tips.push('Add work experience entries — experience is the #1 factor in ATS ranking');

  const missingDesc   = p.experience.filter(e => !e.desc).length;
  const missingPeriod = p.experience.filter(e => !e.period || e.period.toLowerCase() === 'unknown').length;

  if (ec > 0 && missingDesc === 0)   experience += 5;
  else if (missingDesc > 0)          tips.push('Add impact descriptions to each role — quantify results where possible (e.g. "Reduced load time by 40%")');

  if (ec > 0 && missingPeriod === 0) experience += 5;
  else if (missingPeriod > 0)        tips.push('Include clear date ranges for all positions (e.g. "Jan 2022 – Present")');

  // Education (10 pts)
  if (p.education.length >= 1) education = 10;
  else tips.push('Add your educational background — most ATS systems require at least one entry');

  // Achievements (5 pts)
  if (p.achievements.length >= 3) achievements = 5;
  else if (p.achievements.length >= 1) achievements = 2;
  else tips.push('Add awards, publications, or notable projects to stand out');

  const total = Math.min(contact + summary + skills + experience + education + achievements, 100);
  const grade = total >= 85 ? 'A' : total >= 70 ? 'B' : total >= 55 ? 'C' : total >= 40 ? 'D' : 'F';

  return {
    score: total,
    grade,
    breakdown: { contact, summary, skills, experience, education, achievements },
    tips: tips.slice(0, 5),
  };
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

    /* ── AI parse ── */
    let parsed: ParsedResume = {
      headline: null, bio: null, location: null, website: null,
      skills: [], experience: [], education: [], achievements: [],
      socialLinks: { linkedin: null, github: null, twitter: null },
    };

    const aiAvailable = isAiConfigured();
    console.log(`[upload-resume] AI configured: ${aiAvailable}`);

    if (aiAvailable) {
      const trimmed = cleaned.slice(0, 12000); // ~3 dense pages
      console.log(`[upload-resume] calling AI with ${trimmed.length} chars`);
      let aiRaw = '';
      try {
        aiRaw = await generateAiText([
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
      } catch (aiErr) {
        console.error('[upload-resume] AI call failed:', aiErr instanceof Error ? `${aiErr.message}\n${aiErr.stack}` : aiErr);
        aiRaw = '';
      }

      if (aiRaw.trim()) {
        console.log(`[upload-resume] AI response: ${aiRaw.length} chars — first 200: ${aiRaw.slice(0, 200)}`);
        try {
          const clean = aiRaw.replace(/^```[a-z]*\s*/i, '').replace(/\s*```\s*$/, '').trim();
          parsed = JSON.parse(clean) as ParsedResume;
          console.log(`[upload-resume] AI JSON parsed OK — skills=${parsed.skills?.length ?? 0} exp=${parsed.experience?.length ?? 0} edu=${parsed.education?.length ?? 0}`);
        } catch (parseErr) {
          console.warn('[upload-resume] direct JSON.parse failed:', parseErr instanceof Error ? parseErr.message : parseErr);
          const m = aiRaw.match(/\{[\s\S]*\}/);
          if (m) {
            try {
              parsed = JSON.parse(m[0]) as ParsedResume;
              console.log('[upload-resume] regex JSON.parse OK');
            } catch (regexErr) {
              console.error('[upload-resume] regex JSON.parse also failed:', regexErr instanceof Error ? regexErr.message : regexErr);
            }
          }
          console.error('[upload-resume] JSON parse failed on AI response. First 300 chars:', aiRaw.slice(0, 300));
        }
      } else {
        console.warn('[upload-resume] AI returned empty response');
      }
    } else {
      console.warn('[upload-resume] AI not configured — skipping AI parse, using empty parsed data');
    }

    /* ── sanitise ── */
    const safe: ParsedResume = {
      headline: typeof parsed.headline === 'string' && parsed.headline.trim() ? parsed.headline.trim().slice(0, 100) : null,
      bio:      typeof parsed.bio      === 'string' && parsed.bio.trim()      ? parsed.bio.trim().slice(0, 500)      : null,
      location: typeof parsed.location === 'string' && parsed.location.trim() ? parsed.location.trim()               : null,
      website:  typeof parsed.website  === 'string' && parsed.website.trim()  ? parsed.website.trim()                : null,
      skills: Array.isArray(parsed.skills)
        ? (parsed.skills as unknown[]).filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map(s => s.trim()).slice(0, 25)
        : [],
      experience: Array.isArray(parsed.experience)
        ? (parsed.experience as Array<Record<string, unknown>>)
            .filter(e => e && typeof e.title === 'string' && String(e.title).trim())
            .map(e => ({
              title:   String(e.title   ?? '').trim(),
              company: String(e.company ?? '').trim(),
              period:  String(e.period  ?? '').trim(),
              desc:    typeof e.desc === 'string' && e.desc.trim() ? e.desc.trim().slice(0, 160) : null,
            }))
            .slice(0, 10)
        : [],
      education: Array.isArray(parsed.education)
        ? (parsed.education as Array<Record<string, unknown>>)
            .filter(e => e && typeof e.degree === 'string' && String(e.degree).trim())
            .map(e => ({
              degree: String(e.degree ?? '').trim(),
              school: String(e.school ?? '').trim(),
              year:   typeof e.year === 'string' && e.year.trim() ? e.year.trim() : null,
            }))
            .slice(0, 8)
        : [],
      achievements: Array.isArray(parsed.achievements)
        ? (parsed.achievements as Array<Record<string, unknown>>)
            .filter(e => e && typeof e.title === 'string' && String(e.title).trim())
            .map(e => ({
              title: String(e.title ?? '').trim(),
              desc:  typeof e.desc === 'string' && e.desc.trim() ? e.desc.trim().slice(0, 200) : null,
            }))
            .slice(0, 8)
        : [],
      socialLinks: {
        linkedin: typeof parsed.socialLinks?.linkedin === 'string' && parsed.socialLinks.linkedin.trim() ? parsed.socialLinks.linkedin.trim() : null,
        github:   typeof parsed.socialLinks?.github   === 'string' && parsed.socialLinks.github.trim()   ? parsed.socialLinks.github.trim()   : null,
        twitter:  typeof parsed.socialLinks?.twitter  === 'string' && parsed.socialLinks.twitter.trim()  ? parsed.socialLinks.twitter.trim()  : null,
      },
    };

    /* ── compute ATS score ── */
    const atsScore = computeAts(safe);

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

    console.log(`[upload-resume] applying fields to profile: ${appliedFields.join(', ') || 'none'} | ATS score=${atsScore.score} grade=${atsScore.grade}`);

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
      warning:       extractWarning ?? null,
    });

  } catch (err) {
    console.error('[profile/upload-resume] unhandled error', err);
    return NextResponse.json({ error: 'Resume upload failed — please try again.' }, { status: 500 });
  }
}
