import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import {
  getEarlyAccessFeatures,
  saveEarlyAccessFeatures,
  getWaitlistEntries,
  getFeatureWishes,
  type EarlyAccessFeature,
} from '@/lib/server/early-access';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const view = searchParams.get('view') || 'overview';
  const featureId = searchParams.get('featureId') || undefined;

  try {
    const features = await getEarlyAccessFeatures();

    if (view === 'overview') {
      const allWaitlist = await getWaitlistEntries();
      const allWishes = await getFeatureWishes();
      const totalWaitlist = allWaitlist.filter((e) => e.verified).length;
      const totalWishes = allWishes.length;
      const uniqueEmails = new Set([...allWaitlist.map((e) => e.email), ...allWishes.map((w) => w.email)]).size;

      const featureSummaries = features.map((f) => ({
        ...f,
        waitlistVerified: allWaitlist.filter((e) => e.featureId === f.id && e.verified).length,
        wishCount: allWishes.filter((w) => w.featureId === f.id).length,
        recentSignups: allWaitlist
          .filter((e) => e.featureId === f.id && e.verified)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 3)
          .map((e) => ({ email: e.email, name: e.name, createdAt: e.createdAt })),
      }));

      return NextResponse.json({ features: featureSummaries, stats: { totalWaitlist, totalWishes, uniqueEmails, totalFeatures: features.length } });
    }

    if (view === 'waitlist') {
      const entries = await getWaitlistEntries(featureId);
      return NextResponse.json({ entries: entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) });
    }

    if (view === 'wishes') {
      const wishes = await getFeatureWishes(featureId);
      return NextResponse.json({ wishes: wishes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) });
    }

    return NextResponse.json({ error: 'Unknown view' }, { status: 400 });
  } catch (err) {
    console.error('[super-admin/early-access GET]', err);
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { action, data } = await req.json();
    await appendSuperAdminAudit({ action: `early_access_${action}`, details: data || {}, ip: req.headers.get('x-forwarded-for') || undefined });

    const features = await getEarlyAccessFeatures();

    if (action === 'update_feature') {
      const { id, ...updates } = data as Partial<EarlyAccessFeature> & { id: string };
      const idx = features.findIndex((f) => f.id === id);
      if (idx < 0) return NextResponse.json({ error: 'Feature not found' }, { status: 404 });
      features[idx] = { ...features[idx], ...updates, id, updatedAt: new Date().toISOString() };
      await saveEarlyAccessFeatures(features);
      return NextResponse.json({ success: true });
    }

    if (action === 'add_feature') {
      const newFeature: EarlyAccessFeature = {
        id: `feat-${Date.now()}`,
        title: data.title || 'New Feature',
        tagline: data.tagline || '',
        description: data.description || '',
        category: data.category || 'General',
        tags: data.tags || [],
        status: 'coming_soon',
        eta: data.eta || 'TBD',
        icon: data.icon || 'Star',
        accentColor: data.accentColor || 'amber',
        featured: false,
        order: features.length + 1,
        waitlistCount: 0,
        wishCount: 0,
        createdAt: new Date().toISOString(),
      };
      features.push(newFeature);
      await saveEarlyAccessFeatures(features);
      return NextResponse.json({ success: true, id: newFeature.id });
    }

    if (action === 'delete_feature') {
      const filtered = features.filter((f) => f.id !== data.id);
      await saveEarlyAccessFeatures(filtered);
      return NextResponse.json({ success: true });
    }

    if (action === 'reorder') {
      const { ids } = data as { ids: string[] };
      const reordered = ids.map((id, idx) => {
        const f = features.find((x) => x.id === id);
        return f ? { ...f, order: idx + 1 } : null;
      }).filter(Boolean) as EarlyAccessFeature[];
      const rest = features.filter((f) => !ids.includes(f.id));
      await saveEarlyAccessFeatures([...reordered, ...rest]);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[super-admin/early-access POST]', err);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
