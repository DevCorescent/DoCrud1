import { NextRequest, NextResponse } from 'next/server';
import { appendSuperAdminAudit, revokeSuperAdminSession } from '@/lib/server/super-admin-auth';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('sa_session')?.value || '';
  if (token) {
    await revokeSuperAdminSession(token);
    await appendSuperAdminAudit({ action: 'super_admin_logout', ip: req.headers.get('x-forwarded-for') || undefined });
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set('sa_session', '', { maxAge: 0, path: '/' });
  return res;
}
