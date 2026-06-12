import NextAuth from 'next-auth';
import { buildAuthOptions } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: { nextauth: string[] } }) {
  const handler = NextAuth(buildAuthOptions());
  return handler(request, context);
}

export async function POST(request: Request, context: { params: { nextauth: string[] } }) {
  const handler = NextAuth(buildAuthOptions());
  return handler(request, context);
}
