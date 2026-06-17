import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { generateAiText, getAiModelName, isAiConfigured } from '@/lib/server/ai';
import { extractDocumentText } from '@/lib/server/document-parser';
import { getProfileData, updateProfileData } from '@/lib/server/user-profiles';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAiConfigured()) {
      console.error('[parse-resume] AI not configured — GROQ_API_KEY missing or placeholder');
      return NextResponse.json(
        { error: 'AI is not configured — add GROQ_API_KEY to .env.local to enable resume parsing.' },
        { status: 503 },
      );
    }

    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get('resume');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `File too large — max ${MAX_BYTES / 1024 / 1024} MB.` }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'The file appears to be empty.' }, { status: 400 });
    }

    console.log(`[parse-resume] file received: name="${file.name}" type="${file.type}" size=${file.size}B model=${getAiModelName()}`);

    const buf = Buffer.from(await file.arrayBuffer());

    let rawText = '';
    try {
      rawText = await extractDocumentText(file.name, file.type || '', buf);
      console.log(`[parse-resume] text extracted: ${rawText.length} chars`);
    } catch (extractErr) {
      console.error('[parse-resume] text extraction failed:', extractErr);
      try {
        rawText = buf.toString('utf8');
        console.log(`[parse-resume] utf8 fallback: ${rawText.length} chars`);
      } catch {
        return NextResponse.json(
          { error: 'Could not extract text from this file. Try saving it as a PDF and re-uploading.' },
          { status: 422 },
        );
      }
    }

    rawText = rawText.trim().replace(/\s{3,}/g, '\n\n');
    if (rawText.length < 30) {
      console.error(`[parse-resume] not enough text: ${rawText.length} chars — snippet: "${rawText.slice(0, 80)}"`);
      return NextResponse.json(
        { error: "Not enough text found in this file. If it's a scanned image PDF, ensure your device has OCR support." },
        { status: 422 },
      );
    }

    const trimmed = rawText.slice(0, 8000);
    console.log(`[parse-resume] sending ${trimmed.length} chars to AI`);

    const MESSAGES = [
      {
        role: 'system' as const,
        content: `You are a precise resume parser. Extract structured professional profile data.
Return ONLY valid raw JSON — no markdown fences, no explanation, just the JSON object.

Schema (use null when a field is not present or unclear):
{
  "name":       string | null,
  "headline":   string | null,
  "bio":        string | null,
  "location":   string | null,
  "website":    string | null,
  "email":      string | null,
  "skills":     string[],
  "experience": [{ "title": string, "company": string, "period": string, "desc": string | null }],
  "education":  [{ "degree": string, "school": string, "year": string | null }]
}

Rules:
- headline: most recent job title + company (max 80 chars), e.g. "Senior Engineer at Google"
- bio: professional summary in 1st person, max 400 chars; write one if a summary section exists; null otherwise
- location: "City, Country" format
- website: personal site, portfolio, or LinkedIn URL (full URL preferred)
- skills: up to 15 short labels — "React", "Python", "Product Strategy"
- experience: up to 5 most recent roles; period like "Jan 2021 – Mar 2024"
- education: up to 3 entries
- prefer null over a guess when uncertain`,
      },
      {
        role: 'user' as const,
        content: `Parse this resume:\n\n${trimmed}`,
      },
    ];

    // Try with JSON mode first; fall back without it if the model rejects it
    let aiResponse = '';
    try {
      aiResponse = await generateAiText(MESSAGES, { jsonMode: true });
      console.log(`[parse-resume] AI response (json-mode): ${aiResponse.length} chars — first 200: ${aiResponse.slice(0, 200)}`);
    } catch (jsonModeErr) {
      console.warn('[parse-resume] json-mode call failed, retrying without response_format:', jsonModeErr instanceof Error ? jsonModeErr.message : jsonModeErr);
      try {
        aiResponse = await generateAiText(MESSAGES);
        console.log(`[parse-resume] AI response (plain): ${aiResponse.length} chars — first 200: ${aiResponse.slice(0, 200)}`);
      } catch (plainErr) {
        console.error('[parse-resume] AI call failed entirely:', plainErr);
        throw plainErr;
      }
    }

    if (!aiResponse) {
      console.error('[parse-resume] AI returned empty response');
      return NextResponse.json({ error: 'AI returned an empty response. Please try again.' }, { status: 500 });
    }

    let parsed: {
      name?: string | null;
      headline?: string | null;
      bio?: string | null;
      location?: string | null;
      website?: string | null;
      email?: string | null;
      skills?: unknown;
      experience?: unknown;
      education?: unknown;
    } = {};

    try {
      const clean = aiResponse
        .replace(/^```[a-z]*\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();
      parsed = JSON.parse(clean) as typeof parsed;
      console.log(`[parse-resume] JSON parsed OK — keys: ${Object.keys(parsed).join(', ')}`);
    } catch (parseErr) {
      console.warn('[parse-resume] direct JSON.parse failed:', parseErr instanceof Error ? parseErr.message : parseErr);
      const match = aiResponse.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]) as typeof parsed;
          console.log(`[parse-resume] regex JSON.parse OK — keys: ${Object.keys(parsed).join(', ')}`);
        } catch (regexParseErr) {
          console.error('[parse-resume] regex JSON.parse also failed:', regexParseErr);
        }
      } else {
        console.error('[parse-resume] no JSON object found in AI response — raw response:', aiResponse);
      }
      if (!parsed || Object.keys(parsed).length === 0) {
        return NextResponse.json(
          { error: 'AI returned an unexpected format. Please try again.' },
          { status: 500 },
        );
      }
    }

    const skills = Array.isArray(parsed.skills)
      ? (parsed.skills as unknown[])
          .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          .map((s) => s.trim())
          .slice(0, 15)
      : [];

    type ExpEntry = { title: string; company: string; period: string; desc?: string };
    const experience: ExpEntry[] = Array.isArray(parsed.experience)
      ? (parsed.experience as Array<Record<string, unknown>>)
          .filter((e) => typeof e?.title === 'string' && typeof e?.company === 'string')
          .map((e) => ({
            title:   String(e.title ?? '').trim(),
            company: String(e.company ?? '').trim(),
            period:  String(e.period ?? '').trim(),
            ...(typeof e.desc === 'string' && e.desc.trim() ? { desc: e.desc.trim() } : {}),
          }))
          .slice(0, 5)
      : [];

    type EduEntry = { degree: string; school: string; year?: string };
    const education: EduEntry[] = Array.isArray(parsed.education)
      ? (parsed.education as Array<Record<string, unknown>>)
          .filter((e) => typeof e?.degree === 'string' && typeof e?.school === 'string')
          .map((e) => ({
            degree: String(e.degree ?? '').trim(),
            school: String(e.school ?? '').trim(),
            ...(typeof e.year === 'string' && e.year.trim() ? { year: e.year.trim() } : {}),
          }))
          .slice(0, 3)
      : [];

    const result = {
      name:       typeof parsed.name     === 'string' ? parsed.name.trim()                    : null,
      headline:   typeof parsed.headline === 'string' ? parsed.headline.trim().slice(0, 100)  : null,
      bio:        typeof parsed.bio      === 'string' ? parsed.bio.trim().slice(0, 500)        : null,
      location:   typeof parsed.location === 'string' ? parsed.location.trim()                : null,
      website:    typeof parsed.website  === 'string' ? parsed.website.trim()                 : null,
      email:      typeof parsed.email    === 'string' ? parsed.email.trim()                   : null,
      skills,
      experience,
      education,
    };

    console.log(`[parse-resume] result: name="${result.name}" headline="${result.headline}" skills=${skills.length} exp=${experience.length} edu=${education.length}`);

    // Persist immediately — only fill fields that are currently empty on the profile
    try {
      const userId = session.user.id;
      const existing = await getProfileData(userId);
      const update: Parameters<typeof updateProfileData>[1] = {};
      if (result.headline  && !existing.headline)                                             update.headline   = result.headline;
      if (result.bio       && !existing.bio)                                                   update.bio        = result.bio;
      if (result.location  && !existing.location)                                             update.location   = result.location;
      if (result.website   && !existing.website)                                               update.website    = result.website;
      if (skills.length    && (!existing.skills     || existing.skills.length     === 0))     update.skills     = skills;
      if (experience.length && (!existing.experience || existing.experience.length === 0))    update.experience = experience;
      if (education.length  && (!existing.education  || existing.education.length  === 0))    update.education  = education;
      if (Object.keys(update).length > 0) {
        await updateProfileData(userId, update);
        console.log(`[parse-resume] profile saved — fields: ${Object.keys(update).join(', ')}`);
      } else {
        console.log('[parse-resume] profile save skipped — existing fields already populated');
      }
    } catch (saveErr) {
      console.error('[parse-resume] profile save error (non-fatal):', saveErr);
    }

    return NextResponse.json(result);

  } catch (err) {
    console.error('[parse-resume] unhandled error:', err instanceof Error ? `${err.message}\n${err.stack}` : err);
    return NextResponse.json({ error: 'Resume parsing failed — please try again.' }, { status: 500 });
  }
}
