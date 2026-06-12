import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getPublicResumeById } from '@/lib/server/resume-directory';
import { generateAiText, isAiConfigured, parseStructuredJson } from '@/lib/server/ai';
import { hasResumeConnectAccess } from '@/lib/server/resume-connect';

export const dynamic = 'force-dynamic';

function clampInt(value: unknown, min: number, max: number) {
  const num = Math.round(Number(value || 0));
  return Math.max(min, Math.min(max, num));
}

function normalize(value?: string) {
  return (value || '').trim();
}

export async function GET(_request: Request, context: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Login required.' }, { status: 401 });
    }

    const resumeId = context.params.id;
    const access = await hasResumeConnectAccess({ buyerUserId: session.user.id, resumeId });
    if (!access.ok) {
      return NextResponse.json({ error: 'Resume Connect required.', paywall: true }, { status: 402 });
    }

    const entry = await getPublicResumeById(resumeId);
    if (!entry) {
      return NextResponse.json({ error: 'Resume not found.' }, { status: 404 });
    }

    const text = String(entry.resumeText || '').slice(0, 10_000);
    if (!text.trim()) {
      return NextResponse.json({ error: 'Resume text is not available.' }, { status: 400 });
    }

    if (!isAiConfigured()) {
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      const summary = lines.slice(0, 4).join(' · ').slice(0, 260);
      return NextResponse.json(
        {
          analysis: {
            provider: 'local',
            summary,
            scores: {
              clarity: 62,
              impact: 58,
              atsReadiness: 55,
              structure: 60,
            },
            bestFits: entry.skills.slice(0, 6),
            improvements: ['Add quantified outcomes', 'Tighten role headline', 'Ensure consistent formatting'],
          },
        },
        { status: 200 },
      );
    }

    const raw = await generateAiText([
      {
        role: 'system',
        content:
          'You are a resume reviewer. Output JSON only. Give short actionable insight. Do not include any contact details, phone numbers, emails, or external links in output.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          resumeText: text,
          outputJsonShape: {
            summary: 'string',
            scores: {
              clarity: 'number (0-100)',
              impact: 'number (0-100)',
              atsReadiness: 'number (0-100)',
              structure: 'number (0-100)',
            },
            bestFits: ['string'],
            improvements: ['string'],
          },
        }),
      },
    ]);

    const parsed = parseStructuredJson<any>(raw);
    const summary = normalize(parsed?.summary).slice(0, 420) || 'Resume summary not available.';
    const scores = {
      clarity: clampInt(parsed?.scores?.clarity, 0, 100),
      impact: clampInt(parsed?.scores?.impact, 0, 100),
      atsReadiness: clampInt(parsed?.scores?.atsReadiness, 0, 100),
      structure: clampInt(parsed?.scores?.structure, 0, 100),
    };
    const bestFits = Array.isArray(parsed?.bestFits) ? parsed.bestFits.map((v: any) => normalize(String(v))).filter(Boolean).slice(0, 8) : [];
    const improvements = Array.isArray(parsed?.improvements) ? parsed.improvements.map((v: any) => normalize(String(v))).filter(Boolean).slice(0, 8) : [];

    return NextResponse.json(
      {
        analysis: {
          provider: 'groq',
          summary,
          scores,
          bestFits,
          improvements,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to analyze resume.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

