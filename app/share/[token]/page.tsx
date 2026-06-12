import type { Metadata } from 'next';
import ShareTokenClient from './ShareTokenClient';

/**
 * /share/[token]  —  SSR entry for share landing page.
 *
 * We don't read shareStore on the server (it's localStorage-based),
 * so we output a minimal shell and let the client component handle
 * token validation, password gating, and the "Open in Drive" CTA.
 */

export const metadata: Metadata = {
  title: 'DocDrive Share',
  description: 'A file or folder has been shared with you via DocDrive.',
};

export default function ShareTokenPage({
  params,
}: {
  params: { token: string };
}) {
  return <ShareTokenClient token={params.token} />;
}
