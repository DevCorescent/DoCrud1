import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { listBusinessPages, getBusinessPagesByOwner, createBusinessPage, generateUniqueSlug } from '@/lib/server/business-pages';
import { hasInfinity } from '@/lib/server/infinity';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;

    // Owner-scoped listing (for profile page)
    const ownerUserId = searchParams.get('ownerUserId');
    if (ownerUserId) {
      const pages = await getBusinessPagesByOwner(ownerUserId);
      return NextResponse.json({ pages, total: pages.length });
    }

    const result = await listBusinessPages({
      industry: searchParams.get('industry') || undefined,
      companySize: searchParams.get('companySize') || undefined,
      country: searchParams.get('country') || undefined,
      verified: searchParams.get('verified') === 'true' ? true : undefined,
      search: searchParams.get('search') || undefined,
      sortBy: (searchParams.get('sortBy') as 'newest' | 'followers' | 'name') || 'newest',
      limit: Math.min(parseInt(searchParams.get('limit') || '24', 10), 100),
      offset: parseInt(searchParams.get('offset') || '0', 10),
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ pages: [], total: 0 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    const userId = await resolveSessionUserId(session);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json() as {
      name?: string; tagline?: string; description?: string; industry?: string;
      companySize?: string; foundedYear?: number; website?: string; logoUrl?: string;
      location?: string; city?: string; country?: string; phone?: string; email?: string;
      socialLinks?: Record<string, string>;
    };

    if (!body.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (!body.industry?.trim()) return NextResponse.json({ error: 'Industry is required' }, { status: 400 });

    const infinity = await hasInfinity(userId);
    if (!infinity) {
      return NextResponse.json({ error: 'Docrud Infinity required', code: 'INFINITY_REQUIRED', feature: 'business_page' }, { status: 403 });
    }

    const slug = await generateUniqueSlug(body.name.trim());
    const page = await createBusinessPage({
      id: randomUUID(),
      slug,
      ownerUserId: userId,
      name: body.name.trim(),
      tagline: body.tagline?.trim(),
      description: body.description?.trim(),
      industry: body.industry,
      companySize: body.companySize,
      foundedYear: body.foundedYear,
      website: body.website?.trim(),
      logoUrl: body.logoUrl?.trim(),
      location: body.location?.trim(),
      city: body.city?.trim(),
      country: body.country?.trim(),
      phone: body.phone?.trim(),
      email: body.email?.trim(),
      socialLinks: body.socialLinks,
    });
    return NextResponse.json({ page }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
