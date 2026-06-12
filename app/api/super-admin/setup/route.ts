import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminEmail, setSuperAdminEmail } from '@/lib/server/super-admin-auth';

// One-time setup endpoint — only works when no super admin email is configured
export async function POST(req: NextRequest) {
  try {
    const existing = await getSuperAdminEmail();
    if (existing) {
      return NextResponse.json({ error: 'Super admin already configured. Use environment variable SUPER_ADMIN_EMAIL to change.' }, { status: 403 });
    }

    const { email, setupKey } = await req.json();
    const envKey = process.env.SUPER_ADMIN_SETUP_KEY;
    if (!envKey || setupKey !== envKey) {
      return NextResponse.json({ error: 'Invalid setup key' }, { status: 403 });
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    await setSuperAdminEmail(email.trim().toLowerCase());
    return NextResponse.json({ success: true, email: email.trim().toLowerCase() });
  } catch (err) {
    console.error('[super-admin/setup]', err);
    return NextResponse.json({ error: 'Setup failed' }, { status: 500 });
  }
}

export async function GET() {
  const email = await getSuperAdminEmail();
  return NextResponse.json({ configured: Boolean(email) });
}
