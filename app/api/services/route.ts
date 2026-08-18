import { NextRequest, NextResponse } from 'next/server';
import { getStoredUsers, getAuthSession } from '@/lib/server/auth';
import { getUserServices, createService, type Service } from '@/lib/server/services';
import { hasInfinity } from '@/lib/server/infinity';

export const dynamic = 'force-dynamic';

async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.email) return null;
  const users = await getStoredUsers();
  return users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase()) ?? null;
}

export async function GET() {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const services = await getUserServices(actor.id);
    return NextResponse.json({ services });
  } catch (error) {
    console.error('[services] GET error', error);
    return NextResponse.json({ error: 'Failed to load services.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json()) as Partial<Service>;

    if (!body.title?.trim()) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
    if (!body.description?.trim()) return NextResponse.json({ error: 'Description is required.' }, { status: 400 });
    if (!body.category) return NextResponse.json({ error: 'Category is required.' }, { status: 400 });

    const infinity = await hasInfinity(actor.id);
    if (!infinity) {
      const existing = await getUserServices(actor.id);
      if (existing.length >= 2) {
        return NextResponse.json({ error: 'Docrud Infinity required', code: 'INFINITY_REQUIRED', feature: 'services_limit', currentCount: existing.length }, { status: 403 });
      }
    }

    const service = await createService(actor.id, {
      title: body.title.trim(),
      tagline: body.tagline?.trim() ?? '',
      description: body.description.trim(),
      category: body.category,
      subcategory: body.subcategory,
      tags: body.tags ?? [],
      pricingModel: body.pricingModel ?? 'fixed',
      basePrice: body.basePrice ?? 0,
      currency: body.currency ?? 'USD',
      packages: body.packages,
      deliveryTime: body.deliveryTime,
      deliveryUnit: body.deliveryUnit,
      imageUrl: body.imageUrl,
      /* Service-specific identity and placement. Undefined when the provider
         left them blank — never defaulted to a fabricated value. */
      coverImageUrl: body.coverImageUrl,
      serviceImageUrl: body.serviceImageUrl,
      useMainProfileImage: body.useMainProfileImage ?? false,
      location: body.location,
      workMode: body.workMode,
      availability: body.availability,
      gallery: body.gallery,
      skills: body.skills,
      deliverables: body.deliverables,
      requirements: body.requirements,
      process: body.process,
      languages: body.languages,
      serviceArea: body.serviceArea,
      videoUrl: body.videoUrl,
      faqs: body.faqs,
      isActive: body.isActive ?? true,
      featured: body.featured ?? false,
    });

    return NextResponse.json({ service }, { status: 201 });
  } catch (error) {
    console.error('[services] POST error', error);
    return NextResponse.json({ error: 'Failed to create service.' }, { status: 500 });
  }
}
