import SavedServicesCenter from '@/components/services/SavedServicesCenter';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Saved Services | Docrud',
  description: 'Services you have shortlisted to revisit later.',
};

export default function SavedServicesPage() {
  return (
    <main className="min-h-screen bg-[#0D0D0F] text-white">
      <SavedServicesCenter />
    </main>
  );
}
