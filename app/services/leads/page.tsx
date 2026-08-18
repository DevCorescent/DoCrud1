import ServiceLeadsCenter from '@/components/services/ServiceLeadsCenter';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Service Leads | Docrud',
  description: 'Enquiries and booking requests received for your services.',
};

export default function ServiceLeadsPage() {
  return (
    <main className="min-h-screen bg-[#0D0D0F] text-white">
      <ServiceLeadsCenter />
    </main>
  );
}
