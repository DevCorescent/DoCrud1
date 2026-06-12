export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getBusinessProfile, setBusinessProfile, BusinessTool, BusinessProfile } from '@/lib/server/messages';
import crypto from 'crypto';

// GET /api/messages/business-profile
export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const profile = await getBusinessProfile(session.user.id);
  return NextResponse.json({ profile });
}

// PATCH /api/messages/business-profile — add or delete a single tool
// Body: { action: 'add' | 'delete', category: 'catalogues'|'meetings'|'payments'|'contacts', item?: Omit<BusinessTool,'id'>, id?: string }
export async function PATCH(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    action: 'add' | 'delete' | 'update';
    category: keyof BusinessProfile;
    item?: Omit<BusinessTool, 'id'>;
    id?: string;
  };

  if (!['catalogues', 'meetings', 'payments', 'contacts'].includes(body.category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }

  const profile = await getBusinessProfile(session.user.id);
  const arr = profile[body.category] as BusinessTool[];

  if (body.action === 'add') {
    if (!body.item?.label?.trim() || !body.item?.value?.trim()) {
      return NextResponse.json({ error: 'label and value required' }, { status: 400 });
    }
    const newTool: BusinessTool = {
      id: `bt_${crypto.randomBytes(6).toString('hex')}`,
      label: body.item.label.trim(),
      value: body.item.value.trim(),
      ...(body.item.extra ? { extra: body.item.extra.trim() } : {}),
    };
    arr.push(newTool);
    const updated = await setBusinessProfile(session.user.id, profile);
    return NextResponse.json({ profile: updated, tool: newTool });
  }

  if (body.action === 'delete') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    profile[body.category] = arr.filter(t => t.id !== body.id) as BusinessTool[];
    const updated = await setBusinessProfile(session.user.id, profile);
    return NextResponse.json({ profile: updated });
  }

  if (body.action === 'update') {
    if (!body.id || !body.item?.label?.trim() || !body.item?.value?.trim()) {
      return NextResponse.json({ error: 'id, label and value required' }, { status: 400 });
    }
    const tool = arr.find(t => t.id === body.id);
    if (tool) {
      tool.label = body.item.label.trim();
      tool.value = body.item.value.trim();
      tool.extra = body.item.extra?.trim() ?? '';
    }
    const updated = await setBusinessProfile(session.user.id, profile);
    return NextResponse.json({ profile: updated });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
