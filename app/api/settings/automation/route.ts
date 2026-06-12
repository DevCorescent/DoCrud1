import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { defaultAutomationSettings, getAutomationSettings, saveAutomationSettings } from '@/lib/server/settings';
import { WorkflowAutomationSettings } from '@/types/document';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(await getAutomationSettings());
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load automation settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json() as WorkflowAutomationSettings;
    const nextSettings = { ...defaultAutomationSettings, ...payload };
    await saveAutomationSettings(nextSettings);

    return NextResponse.json(nextSettings);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save automation settings' }, { status: 500 });
  }
}
