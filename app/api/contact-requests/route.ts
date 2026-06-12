import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { addContactRequest, getContactRequests } from '@/lib/server/contact-requests';

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

    return NextResponse.json(await getContactRequests());
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load contact requests' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      requestType?: 'contact' | 'demo' | 'pricing' | 'wishlist';
      name?: string;
      email?: string;
      organization?: string;
      phone?: string;
      message?: string;
      preferredDate?: string;
      teamSize?: string;
      useCase?: string;
      searchedFor?: string;
      sourcePath?: string;
    };

    if (!payload.name?.trim() || !payload.email?.trim() || !payload.message?.trim()) {
      return NextResponse.json({ error: 'Name, email, organization, and message are required' }, { status: 400 });
    }

    const saved = await addContactRequest({
      requestType: payload.requestType || 'contact',
      name: payload.name.trim(),
      email: payload.email.trim().toLowerCase(),
      organization: payload.organization?.trim() || 'Public Portal',
      phone: payload.phone?.trim(),
      message: payload.message.trim(),
      preferredDate: payload.preferredDate?.trim(),
      teamSize: payload.teamSize?.trim(),
      useCase: payload.useCase?.trim(),
      searchedFor: payload.searchedFor?.trim(),
      sourcePath: payload.sourcePath?.trim(),
    });

    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to submit contact request' }, { status: 500 });
  }
}
