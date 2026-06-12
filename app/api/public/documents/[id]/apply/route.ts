import { NextRequest, NextResponse } from 'next/server';
import { updateFileTransfer } from '@/lib/server/file-transfers';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as { name?: string; email?: string; note?: string };
    const { name, email, note } = body;
    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }
    const updated = await updateFileTransfer(id, (entry) => {
      const existing = entry.jobApplications ?? [];
      const alreadyApplied = existing.some(a => a.email.toLowerCase() === email.toLowerCase().trim());
      if (alreadyApplied) return null;
      return {
        jobApplications: [
          ...existing,
          {
            id: `app-${Date.now()}-${randomBytes(3).toString('hex')}`,
            name: name.trim(),
            email: email.toLowerCase().trim(),
            note: note?.trim(),
            appliedAt: new Date().toISOString(),
          },
        ],
      };
    });
    if (!updated) {
      return NextResponse.json({ applied: true, duplicate: true });
    }
    return NextResponse.json({ applied: true, count: updated.jobApplications?.length ?? 0 });
  } catch {
    return NextResponse.json({ error: 'Failed to track application' }, { status: 500 });
  }
}
