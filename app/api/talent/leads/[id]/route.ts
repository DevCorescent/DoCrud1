import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { updateResumeLead } from '@/lib/server/resume-leads';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as any;
    const status = body?.status ? String(body.status) : undefined;
    const noteBody = body?.note ? String(body.note) : undefined;

    const result = await updateResumeLead({
      buyerUserId: session.user.id,
      leadId: context.params.id,
      status: status as any,
      noteBody,
    });

    return NextResponse.json({ ok: true, result }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update lead.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

