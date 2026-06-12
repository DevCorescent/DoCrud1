import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getPublicResumeById } from '@/lib/server/resume-directory';
import { scoreResumeToJd } from '@/lib/server/resume-matching';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Login required.' }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as any;
    const jdText = typeof body?.jdText === 'string' ? body.jdText.trim().slice(0, 10_000) : '';
    if (!jdText || jdText.length < 40) {
      return NextResponse.json({ error: 'Paste a longer JD to score compatibility.' }, { status: 400 });
    }

    const resumeId = context.params.id;
    const entry = await getPublicResumeById(resumeId);
    if (!entry) {
      return NextResponse.json({ error: 'Resume not found.' }, { status: 404 });
    }

    const match = await scoreResumeToJd({ jdText, entry });
    return NextResponse.json(
      {
        match: {
          matchScore: match.matchScore,
          compatibilityScore: match.compatibilityScore,
          aiScore: match.aiScore,
          provider: match.provider,
          rationale: match.rationale,
          matchedSkills: match.matchedSkills,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to score compatibility.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
