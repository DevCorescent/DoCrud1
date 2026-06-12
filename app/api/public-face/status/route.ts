import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/server/auth';
import { publicFaceApplicationsPath, readJsonFile } from '@/lib/server/storage';
import type { PublicFaceApplication } from '@/types/document';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const applications = await readJsonFile<PublicFaceApplication[]>(publicFaceApplicationsPath, []);
    const application = applications.find(a => a.userId === session.user.id);

    if (!application) {
      return NextResponse.json({ application: null });
    }

    // Strip identity proof from response for privacy
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { identityProofDataUrl, ...safe } = application;
    return NextResponse.json({ application: safe });
  } catch (err) {
    console.error('[public-face/status]', err);
    return NextResponse.json({ error: 'Failed to fetch status.' }, { status: 500 });
  }
}
