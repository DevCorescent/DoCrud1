/**
 * Cross-provider service discovery.
 *
 * Read-only. Profile → Services remains the only writer.
 *
 * Cost is flat regardless of how many services match: one services read, one
 * cached users read, and one batched avatar lookup for the page slice only.
 * Nothing is resolved per service, per provider or per card.
 *
 * Provider identity is derived from the stored service record's `userId`. The
 * client cannot pass a userId/ownerId/providerId to influence what comes back.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAllServices, type Service } from '@/lib/server/services';
import { getStoredUsers, type StoredUser } from '@/lib/server/users';
import { getProfileAvatars } from '@/lib/server/user-profiles';

export const dynamic = 'force-dynamic';

/** Same visibility rule the rest of the public service surface applies. */
function isVisibleProvider(u: StoredUser | undefined): u is StoredUser {
  if (!u) return false;
  if (u.isActive === false) return false;
  if (u.deactivatedAt) return false;
  if (u.pendingDeletion) return false;
  if (u.inviteStatus === 'disabled') return false;
  return true;
}

/**
 * Comparable price, or null when there is nothing to compare.
 *
 * "Contact for quote" stores basePrice 0, which would otherwise rank as the
 * cheapest service on the site. Null keeps those listings out of price
 * ordering and out of price-range filtering rather than misrepresenting them.
 */
function priceOf(s: Service): number | null {
  if (s.pricingModel === 'contact') return null;
  return typeof s.basePrice === 'number' ? s.basePrice : null;
}

/** Delivery normalised to hours so mixed units sort against each other. */
function deliveryHours(s: Service): number | null {
  if (!s.deliveryTime) return null;
  const mult: Record<string, number> = { hours: 1, days: 24, weeks: 168, months: 720 };
  return s.deliveryTime * (mult[s.deliveryUnit ?? 'days'] ?? 24);
}

/** Weighted match score. Title matches outrank description mentions. */
function relevance(s: Service, providerName: string, terms: string[]): number {
  if (!terms.length) return 0;
  const fields: Array<[string, number]> = [
    [s.title ?? '', 10],
    [s.tagline ?? '', 5],
    [s.category ?? '', 5],
    [(s.tags ?? []).join(' '), 3],
    [providerName, 3],
    [s.description ?? '', 1],
  ];
  let score = 0;
  for (const term of terms) {
    for (const [text, weight] of fields) {
      if (text.toLowerCase().includes(term)) score += weight;
    }
  }
  return score;
}

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const q = (sp.get('q') || '').trim().toLowerCase();
    const terms = q ? q.split(/\s+/).filter(Boolean).slice(0, 8) : [];
    const categories = (sp.get('categories') || '').split(',').map((c) => c.trim()).filter(Boolean);
    const pricingModels = (sp.get('pricing') || '').split(',').map((c) => c.trim()).filter(Boolean);
    const minRating = Number(sp.get('minRating') || '0') || 0;
    const minPrice = sp.get('minPrice') !== null ? Number(sp.get('minPrice')) : null;
    const maxPrice = sp.get('maxPrice') !== null ? Number(sp.get('maxPrice')) : null;
    const sort = sp.get('sort') || 'recommended';
    const limit = Math.min(Math.max(parseInt(sp.get('limit') || '24', 10), 1), 48);
    const page = Math.max(parseInt(sp.get('page') || '1', 10), 1);

    const [store, users] = await Promise.all([getAllServices(), getStoredUsers()]);
    const userById = new Map(users.map((u) => [u.id, u]));

    /* Flatten to visible (service, provider) pairs once. */
    const rows: Array<{ service: Service; provider: StoredUser }> = [];
    for (const [userId, list] of Object.entries(store)) {
      const provider = userById.get(userId);
      if (!isVisibleProvider(provider)) continue;
      for (const service of list ?? []) {
        if (!service?.isActive) continue;
        rows.push({ service, provider });
      }
    }

    const providerName = (p: StoredUser) => p.name?.trim() || 'Docrud member';

    /* Everything except the category filter. Facet counts are computed from
       this set so selecting one category cannot hide the others — otherwise
       multi-select would be impossible. */
    const matchesNonCategory = ({ service: s, provider }: { service: Service; provider: StoredUser }) => {
      if (terms.length && relevance(s, providerName(provider), terms) === 0) return false;
      if (pricingModels.length && !pricingModels.includes(s.pricingModel)) return false;
      if (minRating > 0 && (s.rating ?? 0) < minRating) return false;
      if (minPrice !== null || maxPrice !== null) {
        const p = priceOf(s);
        if (p === null) return false; // no comparable number — excluded from a range
        if (minPrice !== null && p < minPrice) return false;
        if (maxPrice !== null && p > maxPrice) return false;
      }
      return true;
    };

    const nonCategory = rows.filter(matchesNonCategory);
    const filtered = categories.length
      ? nonCategory.filter((r) => categories.includes(r.service.category))
      : nonCategory;

    const categoryFacets: Record<string, number> = {};
    for (const r of nonCategory) {
      categoryFacets[r.service.category] = (categoryFacets[r.service.category] ?? 0) + 1;
    }
    const pricingFacets: Record<string, number> = {};
    for (const r of nonCategory) {
      pricingFacets[r.service.pricingModel] = (pricingFacets[r.service.pricingModel] ?? 0) + 1;
    }

    const rel = (r: { service: Service; provider: StoredUser }) =>
      relevance(r.service, providerName(r.provider), terms);

    const comparators: Record<string, (a: typeof filtered[number], b: typeof filtered[number]) => number> = {
      recommended: (a, b) =>
        Number(b.service.featured) - Number(a.service.featured)
        || (b.service.rating ?? 0) - (a.service.rating ?? 0)
        || (b.service.bookingCount ?? 0) - (a.service.bookingCount ?? 0),
      relevance: (a, b) => rel(b) - rel(a),
      bookings: (a, b) => (b.service.bookingCount ?? 0) - (a.service.bookingCount ?? 0),
      rating: (a, b) => (b.service.rating ?? 0) - (a.service.rating ?? 0),
      reviews: (a, b) => (b.service.reviewCount ?? 0) - (a.service.reviewCount ?? 0),
      newest: (a, b) => Date.parse(b.service.createdAt || '') - Date.parse(a.service.createdAt || ''),
      // Unpriced ("contact") listings sort last in BOTH directions.
      price_asc: (a, b) => (priceOf(a.service) ?? Infinity) - (priceOf(b.service) ?? Infinity),
      price_desc: (a, b) => (priceOf(b.service) ?? -Infinity) - (priceOf(a.service) ?? -Infinity),
      delivery: (a, b) => (deliveryHours(a.service) ?? Infinity) - (deliveryHours(b.service) ?? Infinity),
    };

    const sorted = [...filtered].sort(comparators[sort] ?? comparators.recommended);

    const total = sorted.length;
    const slice = sorted.slice((page - 1) * limit, page * limit);

    /* One batched avatar lookup, for the visible page only. */
    const avatars = await getProfileAvatars(slice.map((r) => r.provider.id));

    return NextResponse.json(
      {
        services: slice.map(({ service: s, provider }) => ({
          id: s.id,
          title: s.title,
          tagline: s.tagline,
          category: s.category,
          pricingModel: s.pricingModel,
          basePrice: s.basePrice,
          currency: s.currency,
          imageUrl: s.imageUrl || null,
          rating: s.rating ?? 0,
          reviewCount: s.reviewCount ?? 0,
          /* Public identity only. The id is present because the catalogue
             route needs it; no email, role or profile internals are sent. */
          provider: {
            id: provider.id,
            name: providerName(provider),
            avatarUrl: avatars.get(provider.id) ?? null,
          },
        })),
        total,
        hasMore: page * limit < total,
        page,
        facets: { categories: categoryFacets, pricing: pricingFacets },
        /* Total visible services, so the page can tell "nothing published yet"
           apart from "nothing matches your filters". */
        libraryTotal: rows.length,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[services/discover] GET error', error);
    return NextResponse.json({ error: 'Failed to load services.' }, { status: 500 });
  }
}
