import PublicDocWordSharedPage from '@/components/PublicDocWordSharedPage';
import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Shared DocWord Document | Docrud',
  description: 'Open a shared DocWord document to read or collaborate through a secure live link.',
  path: '/docword/shared',
});

export default function SharedDocWordPage({ params }: { params: { token: string } }) {
  return <PublicDocWordSharedPage token={params.token} />;
}
