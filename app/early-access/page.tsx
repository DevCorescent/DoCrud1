import dynamic from 'next/dynamic';

const EarlyAccessPage = dynamic(() => import('@/components/EarlyAccessPage'), { ssr: false });

export default function EarlyAccessRoute() {
  return <EarlyAccessPage />;
}
