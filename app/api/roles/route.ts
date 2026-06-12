import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getRoleProfiles, saveRoleProfiles } from '@/lib/server/roles';
import { RoleProfile } from '@/types/document';

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'admin';
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(await getRoleProfiles());
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load roles' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json() as Partial<RoleProfile>;
    if (!payload.name?.trim()) {
      return NextResponse.json({ error: 'Role name is required' }, { status: 400 });
    }

    const roles = await getRoleProfiles();
    const now = new Date().toISOString();
    const nextRole: RoleProfile = {
      id: `role-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: payload.name.trim(),
      description: payload.description?.trim() || '',
      baseRole: payload.baseRole === 'admin' || payload.baseRole === 'hr' || payload.baseRole === 'legal' ? payload.baseRole : 'user',
      permissions: Array.isArray(payload.permissions) ? payload.permissions.map(String).filter(Boolean) : [],
      governanceScopes: Array.isArray(payload.governanceScopes) ? payload.governanceScopes.map(String).filter(Boolean) : [],
      createdAt: now,
      updatedAt: now,
      isSystem: false,
    };

    roles.push(nextRole);
    await saveRoleProfiles(roles);
    return NextResponse.json(nextRole, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to create role' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json() as Partial<RoleProfile> & { id?: string };
    if (!payload.id) {
      return NextResponse.json({ error: 'Role id is required' }, { status: 400 });
    }

    const roles = await getRoleProfiles();
    const index = roles.findIndex((role) => role.id === payload.id);
    if (index === -1) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    roles[index] = {
      ...roles[index],
      name: payload.name?.trim() || roles[index].name,
      description: payload.description?.trim() || roles[index].description,
      baseRole: payload.baseRole === 'admin' || payload.baseRole === 'hr' || payload.baseRole === 'legal' || payload.baseRole === 'user' ? payload.baseRole : roles[index].baseRole,
      permissions: Array.isArray(payload.permissions) ? payload.permissions.map(String).filter(Boolean) : roles[index].permissions,
      governanceScopes: Array.isArray(payload.governanceScopes) ? payload.governanceScopes.map(String).filter(Boolean) : roles[index].governanceScopes,
      updatedAt: new Date().toISOString(),
    };

    await saveRoleProfiles(roles);
    return NextResponse.json(roles[index]);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Role id is required' }, { status: 400 });
    }

    const roles = await getRoleProfiles();
    const existing = roles.find((role) => role.id === id);
    if (!existing) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }
    if (existing.isSystem) {
      return NextResponse.json({ error: 'System roles cannot be deleted' }, { status: 400 });
    }

    await saveRoleProfiles(roles.filter((role) => role.id !== id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to delete role' }, { status: 500 });
  }
}
