import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { listResumeLeads } from '@/lib/server/resume-leads';
import { getPublicResumeById } from '@/lib/server/resume-directory';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const leadId = context.params.id;
    const result = await listResumeLeads({ buyerUserId: session.user.id, limit: 60, offset: 0 });
    const lead = result.leads.find((item) => item.id === leadId);
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }

    const entry = await getPublicResumeById(lead.resumeId);
    if (!entry || !entry.resumeDataUrl) {
      return NextResponse.json({ error: 'Resume file not available.' }, { status: 404 });
    }

    return NextResponse.json(
      {
        resumeDataUrl: entry.resumeDataUrl,
        fileName: entry.resumeFileName || `${entry.displayName}-resume`,
        mimeType: entry.resumeMimeType || 'application/octet-stream',
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch resume.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

