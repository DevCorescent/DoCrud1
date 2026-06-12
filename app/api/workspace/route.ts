import { NextResponse } from 'next/server';
import { documentTemplates } from '@/data/templates';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { getDropdownOptions } from '@/lib/server/dropdown-options';
import { getHistoryEntries } from '@/lib/server/history';
import { getCustomTemplatesFromRepository } from '@/lib/server/repositories';
import { getRoleProfiles } from '@/lib/server/roles';

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'admin';
}

function getCategoryFromId(id: string): string {
  const categories: Record<string, string> = {
    'contractual-agreement': 'Legal',
    'internship-letter': 'HR',
    'appointment-letter': 'HR',
    'offer-letter': 'HR',
    'termination-letter': 'HR',
    'resignation-letter': 'HR',
    'performance-appraisal': 'HR',
    'nda': 'Legal',
    'employment-contract': 'Legal',
    'loan-agreement': 'Legal',
    'service-agreement': 'Legal',
    'partnership-agreement': 'Legal',
    'invoice': 'Finance',
    'quotation': 'Finance',
    'receipt': 'Finance',
    'payment-reminder': 'Finance',
    'meeting-minutes': 'General',
    'memo': 'General',
    'announcement': 'General',
  };
  return categories[id] || 'General';
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [history, customTemplates, users, roles, dropdownOptions] = await Promise.all([
      getHistoryEntries(),
      getCustomTemplatesFromRepository(),
      getStoredUsers(),
      getRoleProfiles(),
      getDropdownOptions(),
    ]);

    const templates = [
      ...documentTemplates.map((template) => ({
        ...template,
        isCustom: false,
        category: getCategoryFromId(template.id),
        createdAt: template.createdAt || '2024-01-01T00:00:00Z',
        updatedAt: template.updatedAt || '2024-01-01T00:00:00Z',
        version: template.version || 1,
      })),
      ...customTemplates,
    ];

    return NextResponse.json({
      documents: history,
      templates,
      users: users.map(({ passwordHash, passwordSalt, ...user }) => user),
      roles,
      dropdownOptions,
    });
  } catch (error) {
    console.error('Error loading workspace payload:', error);
    return NextResponse.json({ error: 'Failed to load enterprise workspace payload' }, { status: 500 });
  }
}
