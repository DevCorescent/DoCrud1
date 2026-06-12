import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { addDropdownOption, getDropdownOptions } from '@/lib/server/dropdown-options';

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'admin';
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(await getDropdownOptions());
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load dropdown options' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json() as { fieldKey?: string; option?: string };
    if (!payload.fieldKey?.trim() || !payload.option?.trim()) {
      return NextResponse.json({ error: 'fieldKey and option are required' }, { status: 400 });
    }

    const next = await addDropdownOption(payload.fieldKey.trim(), payload.option.trim());
    return NextResponse.json(next);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save dropdown option' }, { status: 500 });
  }
}
