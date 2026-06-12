import { redirect } from 'next/navigation';

export default function PublicOpenRedirectPage({ params }: { params: { id: string } }) {
  redirect(`/transfer/${params.id}`);
}
