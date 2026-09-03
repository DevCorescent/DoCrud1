/**
 * The uploaded company marks — public, because the logos themselves are.
 *
 * Every one of these URLs is already rendered on public pages: job cards, the
 * Company Explorer, the homepage strip. Listing them exposes nothing that a
 * visitor could not read off the markup.
 *
 * What is deliberately NOT here: storage paths, the admin who uploaded, the
 * upload time, and anything else from the stored record. This response is an
 * id→URL map and nothing more, so the endpoint cannot become a way to read
 * operational detail out of the configuration.
 */
import { NextResponse } from 'next/server';
import { getHomepageConfig } from '@/lib/server/homepage-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const config = await getHomepageConfig();
    const logos: Record<string, string> = {};
    for (const [id, entry] of Object.entries(config.companyLogos ?? {})) {
      if (entry?.url) logos[id] = entry.url;
    }
    return NextResponse.json({ logos }, {
      /* Short, shared: an upload should appear within a minute everywhere,
         and this is read on nearly every page. */
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    });
  } catch {
    /* A failure here must never break a page — an empty map simply means
       every company falls back to its existing logo. */
    return NextResponse.json({ logos: {} });
  }
}
