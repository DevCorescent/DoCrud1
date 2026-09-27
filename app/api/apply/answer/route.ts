export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { rememberAnswer, forgetAnswer, getApplyMemory } from '@/lib/server/apply-memory';

/**
 * Remember what the member just answered — or forget it.
 *
 * Called once per question answered in the extension's chat. The extension has
 * already written the value into the form by the time this runs; this is only
 * about not asking again.
 *
 * ═══ THE MEMBER OWNS THIS ═══
 *
 * DELETE is here in the same route as POST rather than being a later
 * afterthought, because a feature that remembers what somebody said about their
 * salary has to let them take it back in the same breath. `signature` removes
 * one answer; omitting it clears the lot.
 */

interface AnswerBody {
  signature?: string;
  value?: string;
  prompt?: string;
}

async function me() {
  const session = await getAuthSession();
  if (!session?.user) return null;
  return resolveSessionUserId(session).catch(() => null);
}

export async function GET() {
  const userId = await me();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ answers: await getApplyMemory(userId) });
}

export async function POST(req: NextRequest) {
  const userId = await me();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: AnswerBody;
  try {
    body = await req.json() as AnswerBody;
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  const signature = (body.signature ?? '').trim();
  const value = (body.value ?? '').trim();
  if (!signature || !value) {
    return NextResponse.json({ error: 'signature and value are required.' }, { status: 400 });
  }

  await rememberAnswer(userId, { signature, value, prompt: body.prompt ?? '' });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const userId = await me();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const signature = new URL(req.url).searchParams.get('signature') ?? undefined;
  await forgetAnswer(userId, signature || undefined);
  return NextResponse.json({ ok: true });
}
