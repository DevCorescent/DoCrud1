import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicTalentProfilePage from '@/components/PublicTalentProfilePage';
import { buildPageMetadata, buildPersonSchema, buildBreadcrumbSchema, jsonLd, metaDesc } from '@/lib/seo';
import { getPublicResumeBySlug } from '@/lib/server/resume-directory';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';
import { getPublicAppBaseUrl } from '@/lib/url';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const entry = await getPublicResumeBySlug(params.slug);

  if (!entry) {
    return buildPageMetadata({
      title: 'Talent Profile | Docrud',
      description: 'Browse professional talent profiles and resumes on Docrud.',
      path: `/talent/${params.slug}`,
      noIndex: true,
    });
  }

  const topSkills = (entry.skills ?? []).slice(0, 8).map((s) => String(s));
  const description = metaDesc(entry.headline || entry.summary, 160) ||
    `${entry.displayName} — ${topSkills.slice(0, 3).join(', ')} professional on Docrud Talent.`;

  return buildPageMetadata({
    title: `${entry.displayName} | ${entry.headline ?? 'Professional'} | Docrud Talent`,
    description,
    path: `/talent/${params.slug}`,
    keywords: [
      entry.displayName,
      entry.headline ?? '',
      entry.location ?? '',
      ...topSkills,
      'resume',
      'talent',
      'hire',
      'freelance',
      'docrud talent',
    ].filter(Boolean) as string[],
    ogType: 'profile',
    tags: topSkills,
  });
}

export default async function TalentProfilePage({ params }: { params: { slug: string } }) {
  const baseUrl = getPublicAppBaseUrl();
  const entry = await getPublicResumeBySlug(params.slug);
  if (!entry) notFound();

  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  const topSkills = (entry.skills ?? []).slice(0, 15).map((s) => String(s));

  const personSchema = buildPersonSchema({
    name: entry.displayName,
    headline: entry.headline,
    description: metaDesc(entry.summary, 500),
    location: entry.location,
    skills: topSkills,
    url: `${baseUrl}/talent/${params.slug}`,
  });

  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: 'Home', url: baseUrl },
    { name: 'Talent', url: `${baseUrl}/talent` },
    { name: entry.displayName, url: `${baseUrl}/talent/${params.slug}` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(personSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }}
      />
      <PublicTalentProfilePage
        settings={landingSettings}
        softwareName={themeSettings.softwareName}
        accentLabel={themeSettings.accentLabel}
        entry={entry}
      />
    </>
  );
}
