import type { Metadata } from 'next';
import PublicDocrudiansRoomPage from '@/components/PublicDocrudiansRoomPage';
import { buildPageMetadata } from '@/lib/seo';
import { getPublicDocrudiansRoom } from '@/lib/server/docrudians';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const payload = await getPublicDocrudiansRoom(id);
  if (!payload || payload.room.visibility !== 'public') {
    return buildPageMetadata({
      title: 'Docrudians Room | Docrud',
      description: 'Explore public Docrudians rooms for collaboration and shared resources.',
      path: `/docrudians/room/${id}`,
      noIndex: true,
    });
  }

  return buildPageMetadata({
    title: `${payload.room.title} | Docrudians Room | Docrud`,
    description: payload.room.description || `Join ${payload.room.title} on Docrudians to view public updates, files, and shared resources.`,
    path: `/docrudians/room/${payload.room.slug || payload.room.id}`,
    keywords: [payload.room.title, 'docrudians room', 'collaboration room', 'public room'],
  });
}

export default async function DocrudiansRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, landingSettings, themeSettings] = await Promise.all([
    params,
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicDocrudiansRoomPage
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
      settings={landingSettings}
      roomId={id}
    />
  );
}
