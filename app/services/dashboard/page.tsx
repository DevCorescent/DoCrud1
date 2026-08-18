import ProviderServiceDashboard from '@/components/services/ProviderServiceDashboard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Service Dashboard | Docrud',
  description: 'Your services, leads, bookings and performance.',
};

export default function ServiceDashboardPage() {
  return (
    <main className="min-h-screen bg-[#0D0D0F] text-white">
      <ProviderServiceDashboard />
    </main>
  );
}
