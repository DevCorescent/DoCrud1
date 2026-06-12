import { NextResponse } from 'next/server';
import { recordResumeView } from '@/lib/server/resume-directory';

export async function POST(_request: Request, context: { params: { id: string } }) {
  try {
    await recordResumeView(context.params.id);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

