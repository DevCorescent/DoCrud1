import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { canUserAccessFeature, consumeAiUsageByEmail, getAiEntitlementSnapshot } from '@/lib/server/saas';
import { analyzeDoxpertContent } from '@/lib/server/doxpert';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Login is required to use DoXpert AI.' }, { status: 401 });
    }

    if (session.user.role === 'client' || session.user.role === 'individual') {
      const storedUser = (await getStoredUsers()).find((user) => user.email === session.user.email);
      if (!storedUser || !(await canUserAccessFeature(storedUser, 'doxpert'))) {
        return NextResponse.json({ error: 'Your current plan does not include DoXpert AI Advisor.' }, { status: 403 });
      }
      const aiEntitlement = await getAiEntitlementSnapshot(storedUser);
      if (!aiEntitlement.allowed) {
        return NextResponse.json({ error: 'Your free AI tries are used up. Upgrade to docrud Workspace Pro to continue using DoXpert AI.' }, { status: 403 });
      }
    }

    const contentType = request.headers.get('content-type') || '';
    let title = '';
    let sourceType: 'upload' | 'paste' | 'preview' = 'paste';
    let rawContent = '';
    let question = '';

    if (contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'DoXpert currently supports direct text analysis only. Paste the document text or analyze the current preview.' }, { status: 400 });
    } else {
      const payload = await request.json() as {
        title?: string;
        content?: string;
        question?: string;
        sourceType?: 'upload' | 'paste' | 'preview';
      };
      title = payload.title || 'Untitled document';
      rawContent = payload.content || '';
      question = payload.question || '';
      sourceType = payload.sourceType || 'paste';
    }

    const analysis = await analyzeDoxpertContent({
      title,
      rawContent,
      question,
      sourceType,
    });

    if (session.user.email && (session.user.role === 'client' || session.user.role === 'individual')) {
      await consumeAiUsageByEmail(session.user.email);
    }

    return NextResponse.json(analysis);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to run DoXpert analysis' }, { status: 500 });
  }
}
