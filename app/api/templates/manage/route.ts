import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getCustomTemplatesFromRepository, saveCustomTemplatesToRepository } from '@/lib/server/repositories';
import { DocumentField, DocumentTemplate } from '@/types/document';

export const dynamic = 'force-dynamic';

async function getCustomTemplates(): Promise<DocumentTemplate[]> {
  return getCustomTemplatesFromRepository();
}

async function saveCustomTemplates(templates: DocumentTemplate[]): Promise<void> {
  await saveCustomTemplatesToRepository(templates);
}

function isAdmin(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'admin';
}

function canManageTemplates(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return Boolean(session?.user?.id);
}

function isValidField(field: DocumentField) {
  return Boolean(field.id && field.name && field.label && field.type);
}

function isValidTemplatePayload(template: Partial<DocumentTemplate>) {
  return Boolean(
    template.name?.trim() &&
    template.template?.trim() &&
    template.category?.trim() &&
    Array.isArray(template.fields) &&
    template.fields.every(isValidField)
  );
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!canManageTemplates(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const template: Omit<DocumentTemplate, 'id' | 'createdAt' | 'updatedAt' | 'version'> = await request.json();
    if (!isValidTemplatePayload(template)) {
      return NextResponse.json({ error: 'Invalid template payload' }, { status: 400 });
    }

    const customTemplates = await getCustomTemplates();

    const newTemplate: DocumentTemplate = {
      ...template,
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      isCustom: true,
      createdBy: session?.user?.email ?? undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      organizationId: session?.user?.role === 'client' ? session.user.id : undefined,
      organizationName: session?.user?.role === 'client' ? session.user.organizationName || session.user.name || 'Business Workspace' : undefined,
    };

    customTemplates.push(newTemplate);
    await saveCustomTemplates(customTemplates);

    return NextResponse.json(newTemplate, { status: 201 });
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!canManageTemplates(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id, ...updates }: Partial<DocumentTemplate> & { id: string } = await request.json();
    if (!id || !isValidTemplatePayload({ ...updates, id })) {
      return NextResponse.json({ error: 'Invalid template payload' }, { status: 400 });
    }

    const customTemplates = await getCustomTemplates();
    const templateIndex = customTemplates.findIndex(t => t.id === id);

    if (templateIndex === -1) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    const existing = customTemplates[templateIndex];
    const requesterEmail = session?.user?.email?.trim().toLowerCase() || '';
    const ownerEmail = (existing.createdBy || '').trim().toLowerCase();
    const isOwner = Boolean(requesterEmail && ownerEmail && requesterEmail === ownerEmail);
    const isAllowed = session?.user?.role === 'admin' || isOwner;
    if (!isAllowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    customTemplates[templateIndex] = {
      ...customTemplates[templateIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
      version: (customTemplates[templateIndex].version || 0) + 1,
    };

    await saveCustomTemplates(customTemplates);

    return NextResponse.json(customTemplates[templateIndex]);
  } catch (error) {
    console.error('Error updating template:', error);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!canManageTemplates(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Template ID required' }, { status: 400 });
    }

    const customTemplates = await getCustomTemplates();
    const targetTemplate = customTemplates.find((template) => template.id === id);
    if (!targetTemplate) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    const requesterEmail = session?.user?.email?.trim().toLowerCase() || '';
    const ownerEmail = (targetTemplate.createdBy || '').trim().toLowerCase();
    const isOwner = Boolean(requesterEmail && ownerEmail && requesterEmail === ownerEmail);
    const isAllowed = session?.user?.role === 'admin' || isOwner;
    if (!isAllowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const filteredTemplates = customTemplates.filter(t => t.id !== id);

    await saveCustomTemplates(filteredTemplates);

    return NextResponse.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}
