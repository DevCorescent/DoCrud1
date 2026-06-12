import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { getFeedbackPromptStatus, submitUserFeedback } from '@/lib/server/user-intelligence';

export const dynamic = 'force-dynamic';

async function resolveActor() {
  const session = await getAuthSession();
  if (!session?.user?.email) {
    return null;
  }
  const users = await getStoredUsers();
  return users.find((entry) => entry.id === session.user.id || entry.email.toLowerCase() === session.user.email?.toLowerCase()) || null;
}

export async function GET() {
  try {
    const actor = await resolveActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(await getFeedbackPromptStatus(actor));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load feedback status' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await resolveActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json() as {
      rating: 1 | 2 | 3 | 4 | 5;
      summary: string;
      painPoints: string;
      requestedImprovements: string;
      mostUsedFeature?: string;
    };

    if (!payload.summary?.trim() || !payload.painPoints?.trim() || !payload.requestedImprovements?.trim() || !payload.rating) {
      return NextResponse.json({ error: 'Rating, summary, pain points, and requested improvements are required.' }, { status: 400 });
    }

    const entry = await submitUserFeedback(actor, {
      rating: payload.rating,
      summary: payload.summary.trim(),
      painPoints: payload.painPoints.trim(),
      requestedImprovements: payload.requestedImprovements.trim(),
      mostUsedFeature: payload.mostUsedFeature?.trim(),
    });
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 });
  }
}
