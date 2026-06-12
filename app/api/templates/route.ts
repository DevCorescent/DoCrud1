import { NextResponse } from 'next/server';
import { documentTemplates } from '@/data/templates';
import { getAuthSession } from '@/lib/server/auth';
import { getCustomTemplatesFromRepository } from '@/lib/server/repositories';
import { DocumentTemplate } from '@/types/document';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const customTemplates = await getCustomTemplatesFromRepository();
    const visibleCustomTemplates = session.user.role === 'admin'
      ? customTemplates
      : session.user.role === 'client'
        ? customTemplates.filter((template) => !template.organizationId || template.organizationId === session.user.id)
      : session.user.role === 'individual'
        ? customTemplates.filter((template) => !template.organizationId && (!template.createdBy || template.createdBy.toLowerCase() === (session.user.email || '').toLowerCase()))
        : customTemplates;
    const allTemplates = [
      ...documentTemplates.map(template => ({
        ...template,
        isCustom: false,
        category: getCategoryFromId(template.id),
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        version: 1,
      })),
      ...visibleCustomTemplates
    ];

    return NextResponse.json(allTemplates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
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
