import { NextRequest, NextResponse } from 'next/server';
import { appendSuperAdminAudit, createSuperAdminSession, verifySuperAdminPassword } from '@/lib/server/super-admin-auth';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const result = await verifySuperAdminPassword(String(email), String(password));
    if (!result.valid || !result.email) {
      return NextResponse.json({ error: result.error || 'Invalid email or password' }, { status: 401 });
    }

    const token = await createSuperAdminSession(result.email, req);

    await appendSuperAdminAudit({
      action: 'super_admin_login',
      details: { email: result.email, method: 'password' },
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
    });

    const res = NextResponse.json({ success: true });
    res.cookies.set('sa_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 4 * 60 * 60,
      secure: process.env.NODE_ENV === 'production',
    });
    return res;
  } catch (err) {
    console.error('[super-admin/auth/login]', err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
