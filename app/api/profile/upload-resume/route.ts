export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { getAuthSession } from '@/lib/server/auth';
import { getProfileData, updateProfileData } from '@/lib/server/user-profiles';
import { generateAiText, isAiConfigured } from '@/lib/server/ai';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'resumes');
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_HISTORY = 5;

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

/* ─── PDF extraction (position-sorted text) ───────────────────────────────── */
async function extractPdf(buf: Buffer): Promise<string> {
  const pdfjsLib = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as {
    getDocument: (src: { data: Uint8Array }) => {
      promise: Promise<{
        numPages: number;
        getPage: (n: number) => Promise<{
          getTextContent: () => Promise<{ items: Array<{ str?: string; transform?: number[] }> }>;
        }>;
      }>;
    };
    GlobalWorkerOptions: { workerSrc: string };
  };
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const pageTexts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Group items into lines by y-coordinate (3px tolerance), then sort lines top→bottom
    const lineMap = new Map<number, Array<{ x: number; str: string }>>();
    for (const item of content.items) {
      const y = Math.round((item.transform?.[5] ?? 0) / 3) * 3; // snap to 3px grid
      const x = item.transform?.[4] ?? 0;
      const str = item.str ?? '';
      if (!str.trim()) continue;
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push({ x, str });
    }

    // Sort lines top→bottom (higher y = higher on page in PDF coords)
    const sortedLines = Array.from(lineMap.entries())
      .sort(([ya], [yb]) => yb - ya)
      .map(([, lineItems]) =>
        lineItems.sort((a: { x: number; str: string }, b: { x: number; str: string }) => a.x - b.x).map((it: { str: string }) => it.str).join(' ')
      );

    pageTexts.push(sortedLines.join('\n'));
  }

  return pageTexts.join('\n\n--- PAGE BREAK ---\n\n');
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
    // Last-resort: raw bytes as UTF-8
    console.error('[upload-resume] extraction error, falling back to raw utf8', err);
    const raw = buf.toString('utf8');
    return { text: raw, warning: 'Text extraction used a raw fallback — results may vary.' };
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

    /* ── extract text ── */
    const { text: rawText, warning: extractWarning } = await extractText(buf, fileType);
    const cleaned = rawText.trim().replace(/\s{3,}/g, '\n\n');

    if (cleaned.length < 30) {
      return NextResponse.json(
        { error: "Not enough readable text found. Make sure the file isn't a scanned image, password-protected, or empty. Try a Word .docx file for best results." },
        { status: 422 },
      );
    }

    /* ── save file to disk ── */
    try {
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
    } catch (mkdirErr) {
      console.error('[upload-resume] mkdir failed', UPLOAD_DIR, mkdirErr);
      return NextResponse.json({ error: 'Server storage error — please try again.' }, { status: 500 });
    }
    const uid = userId.replace(/[^a-z0-9]/gi, '').slice(0, 12);
    const rand = crypto.randomBytes(6).toString('hex');
    const extMap: Record<KnownType, string> = { pdf: 'pdf', docx: 'docx', doc: 'doc', txt: 'txt' };
    const filename = `resume_${uid}_${rand}.${extMap[fileType]}`;
    try {
      await fs.writeFile(path.join(UPLOAD_DIR, filename), buf);
    } catch (writeErr) {
      console.error('[upload-resume] writeFile failed', path.join(UPLOAD_DIR, filename), writeErr);
      return NextResponse.json({ error: 'Server storage error — please try again.' }, { status: 500 });
    }
    const fileUrl = `/uploads/resumes/${filename}`;

    /* ── AI parse ── */
    let parsed: ParsedResume = {
      headline: null, bio: null, location: null, website: null,
      skills: [], experience: [], education: [], achievements: [],
      socialLinks: { linkedin: null, github: null, twitter: null },
    };

    const aiAvailable = isAiConfigured();

    if (aiAvailable) {
      const trimmed = cleaned.slice(0, 12000); // ~3 dense pages
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
        console.error('[upload-resume] AI call failed:', aiErr);
        aiRaw = '';
      }

      if (aiRaw.trim()) {
        try {
          const clean = aiRaw.replace(/^```[a-z]*\s*/i, '').replace(/\s*```\s*$/, '').trim();
          parsed = JSON.parse(clean) as ParsedResume;
        } catch {
          const m = aiRaw.match(/\{[\s\S]*\}/);
          if (m) {
            try { parsed = JSON.parse(m[0]) as ParsedResume; } catch { /* give up */ }
          }
          console.error('[upload-resume] JSON parse failed on AI response. First 300 chars:', aiRaw.slice(0, 300));
        }
      } else {
        console.warn('[upload-resume] AI returned empty response');
      }
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
