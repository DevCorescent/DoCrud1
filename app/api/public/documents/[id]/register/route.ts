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
      const existing = entry.registrations ?? [];
      const alreadyRegistered = existing.some(r => r.email.toLowerCase() === email.toLowerCase().trim());
      if (alreadyRegistered) return null;
      const category = entry.directoryCategory?.toLowerCase() || 'other';
      return {
        registrations: [
          ...existing,
          {
            id: `reg-${Date.now()}-${randomBytes(3).toString('hex')}`,
            name: name.trim(),
            email: email.toLowerCase().trim(),
            note: note?.trim(),
            registeredAt: new Date().toISOString(),
            type: (category === 'hackathon' ? 'hackathon' : category === 'event' ? 'event' : 'other') as 'event' | 'hackathon' | 'other',
          },
        ],
      };
    });
    if (!updated) {
      return NextResponse.json({ registered: true, duplicate: true });
    }
    return NextResponse.json({ registered: true, count: updated.registrations?.length ?? 0 });
  } catch {
    return NextResponse.json({ error: 'Failed to register' }, { status: 500 });
  }
}
