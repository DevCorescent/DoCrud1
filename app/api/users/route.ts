import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers, saveStoredUsers } from '@/lib/server/auth';
import { createPasswordHash, isValidEmail, normalizeEmail } from '@/lib/server/security';
import { User } from '@/types/document';

export const dynamic = 'force-dynamic';

type UserWritePayload = Omit<User, 'id' | 'createdAt' | 'lastLogin'> & {
  password?: string;
};

function isAdmin(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'admin';
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const users = await getStoredUsers();
    return NextResponse.json(users.map(({ passwordHash, passwordSalt, ...user }) => user));
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const userData = await request.json() as UserWritePayload;
    if (!userData.name?.trim() || !isValidEmail(userData.email) || !userData.password || userData.password.length < 8) {
      return NextResponse.json({ error: 'Name, valid email, and password of at least 8 characters are required' }, { status: 400 });
    }

    const users = await getStoredUsers();
    const normalizedEmail = normalizeEmail(userData.email);

    if (users.some(u => u.email === normalizedEmail)) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
    }

    const newUser = {
      ...userData,
      email: normalizedEmail,
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      permissions: Array.isArray(userData.permissions) ? userData.permissions.map(String) : [],
      roleProfileId: userData.roleProfileId ? String(userData.roleProfileId) : undefined,
      roleProfileName: userData.roleProfileName ? String(userData.roleProfileName) : undefined,
      ...createPasswordHash(userData.password),
    };
    delete newUser.password;

    users.push(newUser);
    await saveStoredUsers(users);

    const { passwordHash, passwordSalt, ...safeUser } = newUser;
    return NextResponse.json(safeUser, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id, password, ...updates } = await request.json() as Partial<UserWritePayload> & { id: string };
    if (!id) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const users = await getStoredUsers();
    const userIndex = users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const nextEmail = updates.email ? normalizeEmail(updates.email) : users[userIndex].email;
    if (!isValidEmail(nextEmail)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }
    if (users.some(u => u.email === nextEmail && u.id !== id)) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
    }

    users[userIndex] = {
      ...users[userIndex],
      ...updates,
      email: nextEmail,
      permissions: Array.isArray(updates.permissions) ? updates.permissions.map(String) : users[userIndex].permissions,
      roleProfileId: updates.roleProfileId ? String(updates.roleProfileId) : updates.roleProfileId === '' ? undefined : users[userIndex].roleProfileId,
      roleProfileName: updates.roleProfileName ? String(updates.roleProfileName) : updates.roleProfileName === '' ? undefined : users[userIndex].roleProfileName,
      ...(password ? createPasswordHash(password) : {}),
    };
    await saveStoredUsers(users);

    const { passwordHash, passwordSalt, ...safeUser } = users[userIndex];
    return NextResponse.json(safeUser);
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
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
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const users = await getStoredUsers();
    const filteredUsers = users.filter(u => u.id !== id);

    if (filteredUsers.length === users.length) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await saveStoredUsers(filteredUsers);

    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
