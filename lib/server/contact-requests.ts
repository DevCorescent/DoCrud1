import { ContactRequest } from '@/types/document';
import { addContactRequestToRepository, getContactRequestsFromRepository } from '@/lib/server/repositories';

export async function getContactRequests() {
  const requests = await getContactRequestsFromRepository();
  return [...requests].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export async function addContactRequest(payload: Omit<ContactRequest, 'id' | 'createdAt'>) {
  const requests = await getContactRequests();
  const next: ContactRequest = {
    id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...payload,
  };

  await addContactRequestToRepository(next);
  return next;
}
