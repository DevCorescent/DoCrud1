import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import {
  generateAiText, isAiConfigured, parseStructuredJson, normalizeAiText,
} from '@/lib/server/ai';

export const dynamic = 'force-dynamic';

/**
 * Drafts the wordy parts of a job post from one sentence.
 *
 * ═══ WHAT IT WILL NOT WRITE ═══
 *
 * Compensation. Not the range, not the currency, not the period. Everything
 * else here is prose the employer will read and edit before anybody sees it;
 * a salary is a commercial commitment, and a plausible-looking number that
 * nobody checked is the one field on this form where a wrong value costs a
 * candidate real money. The wizard's compensation step stays the employer's to
 * fill, and this route never returns those keys.
 *
 * Nor the screening threshold or required documents — those decide who is
 * filtered out of a hiring process, which is not a thing to guess at.
 *
 * ═══ AND IT NEVER PUBLISHES ═══
 *
 * This returns a proposal. Applying it is a separate action in the wizard, and
 * publishing is another after that. Nothing here writes to a job.
 */

/* The enumerations the wizard already understands. Anything outside these is
   dropped rather than passed through, so the AI cannot invent a work mode the
   filters do not recognise. */
const EMPLOYMENT = ['full_time', 'part_time', 'contract', 'internship', 'freelance'];
const WORK_MODE = ['remote', 'hybrid', 'onsite'];
const EXPERIENCE = ['entry', 'associate', 'mid', 'senior', 'lead'];

const SYSTEM = `You write job postings. You return ONLY JSON, no prose around it.

Given a short description of a role, produce this exact shape:
{
  "title": string,
  "department": string,
  "employmentType": one of ${EMPLOYMENT.join(' | ')},
  "workMode": one of ${WORK_MODE.join(' | ')},
  "experienceLevel": one of ${EXPERIENCE.join(' | ')},
  "location": string,
  "description": string,
  "responsibilities": string,
  "requirements": string,
  "preferredSkills": string
}

Rules:
- "description" is 2-4 sentences about the role and the team. No marketing.
- "responsibilities" and "requirements" are newline-separated lines, 4-6 each,
  each a plain sentence. No bullet characters, no numbering.
- "preferredSkills" is a comma-separated list of 4-8 concrete skills.
- Use ONLY what the user's description supports. If they did not say where the
  role is, return "" for location — do not invent a city. Same for any field
  you are guessing at: an empty string is correct, a plausible fabrication is
  not.
- Never mention salary, pay, compensation, equity or benefits anywhere.
- Write in plain English. No superlatives, no "rockstar", no "ninja".`;

function pick(value: unknown, allowed: string[]): string {
  const v = normalizeAiText(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return allowed.includes(v) ? v : '';
}

/* Lines, cleaned: the model is told not to use bullets, and this enforces it
   rather than trusting it. */
function lines(value: unknown, max: number): string {
  return normalizeAiText(value)
    .split('\n')
    .map((l) => l.replace(/^\s*[-•*•]\s*/, '').replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, max)
    .join('\n');
}

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in to use AI drafting.' }, { status: 401 });
  }

  if (!isAiConfigured()) {
    /* A real, explainable state rather than a failure. The wizard shows this
       wording; it must say what is wrong and not pretend the feature broke. */
    return NextResponse.json(
      { error: 'AI drafting is not configured on this deployment.', configured: false },
      { status: 503 },
    );
  }

  let prompt = '';
  try {
    const body = await request.json();
    prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (prompt.length < 8) {
    return NextResponse.json(
      { error: 'Describe the role in a few more words — a title and a location is enough.' },
      { status: 400 },
    );
  }
  if (prompt.length > 600) prompt = prompt.slice(0, 600);

  let raw: string;
  try {
    raw = await generateAiText(
      [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: prompt },
      ],
      { jsonMode: true },
    );
  } catch (err) {
    console.error('[jobs/ai-draft] generation failed', {
      error: err instanceof Error ? { name: err.name, message: err.message } : err,
    });
    return NextResponse.json({ error: 'The draft could not be generated. Try again.' }, { status: 502 });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseStructuredJson<Record<string, unknown>>(raw);
  } catch {
    return NextResponse.json({ error: 'The draft came back unreadable. Try again.' }, { status: 502 });
  }

  /* Only the keys the wizard has fields for, each normalised. Anything the
     model added is dropped — including, deliberately, anything about pay. */
  const draft = {
    title: normalizeAiText(parsed.title).slice(0, 140),
    department: normalizeAiText(parsed.department).slice(0, 80),
    employmentType: pick(parsed.employmentType, EMPLOYMENT),
    workMode: pick(parsed.workMode, WORK_MODE),
    experienceLevel: pick(parsed.experienceLevel, EXPERIENCE),
    location: normalizeAiText(parsed.location).slice(0, 120),
    description: normalizeAiText(parsed.description).slice(0, 2000),
    responsibilities: lines(parsed.responsibilities, 6),
    requirements: lines(parsed.requirements, 6),
    preferredSkills: normalizeAiText(parsed.preferredSkills)
      .split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8).join(', '),
  };

  return NextResponse.json(
    { draft, model: 'groq' },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
