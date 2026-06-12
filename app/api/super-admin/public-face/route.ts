import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  publicFaceApplicationsPath,
  userProfilesPath,
  readJsonFile,
  writeJsonFile,
} from '@/lib/server/storage';
import {
  sendPublicFaceApprovedEmail,
  sendPublicFaceRejectedEmail,
} from '@/lib/server/public-face-emails';
import type { PublicFaceApplication, PublicFaceBadgeInfo } from '@/types/document';

async function verifySuperAdmin() {
  const cookieStore = await cookies();
  return cookieStore.get('sa_session')?.value === 'authenticated';
}

interface UserProfile {
  [key: string]: unknown;
  publicFace?: PublicFaceBadgeInfo;
}

export async function GET(req: NextRequest) {
  if (!(await verifySuperAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status') || '';

  const applications = await readJsonFile<PublicFaceApplication[]>(publicFaceApplicationsPath, []);
  let result = [...applications];

  if (statusFilter) {
    result = result.filter(a => a.status === statusFilter);
  }

  // Sort by submittedAt desc
  result.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  // Strip identity proofs from list view
  const safe = result.map(({ identityProofDataUrl, ...rest }) => rest);

  return NextResponse.json({ applications: safe });
}

export async function POST(req: NextRequest) {
  if (!(await verifySuperAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { applicationId, action, adminNote } = body as {
    applicationId: string;
    action: 'approve' | 'reject' | 'under_review';
    adminNote?: string;
  };

  if (!applicationId || !action) {
    return NextResponse.json({ error: 'applicationId and action required.' }, { status: 400 });
  }

  const applications = await readJsonFile<PublicFaceApplication[]>(publicFaceApplicationsPath, []);
  const idx = applications.findIndex(a => a.id === applicationId);
  if (idx === -1) {
    return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  }

  const app = applications[idx];
  const now = new Date().toISOString();

  applications[idx] = {
    ...app,
    status: action === 'under_review' ? 'under_review' : action === 'approve' ? 'approved' : 'rejected',
    adminNote: adminNote?.trim() || undefined,
    reviewedAt: now,
    updatedAt: now,
  };

  await writeJsonFile(publicFaceApplicationsPath, applications);

  // Update user profile
  if (action === 'approve') {
    const profiles = await readJsonFile<Record<string, UserProfile>>(userProfilesPath, {});
    profiles[app.userId] = {
      ...(profiles[app.userId] || {}),
      publicFace: {
        category: app.category,
        approvedAt: now,
      },
    };
    await writeJsonFile(userProfilesPath, profiles);

    try {
      await sendPublicFaceApprovedEmail({
        to: app.userEmail,
        name: app.userName,
        category: app.category,
      });
    } catch (e) {
      console.error('[super-admin/public-face] approval email failed', e);
    }
  } else if (action === 'reject') {
    // Remove badge if previously approved
    const profiles = await readJsonFile<Record<string, UserProfile>>(userProfilesPath, {});
    if (profiles[app.userId]?.publicFace) {
      const { publicFace: _removed, ...rest } = profiles[app.userId];
      profiles[app.userId] = rest;
      await writeJsonFile(userProfilesPath, profiles);
    }

    try {
      await sendPublicFaceRejectedEmail({
        to: app.userEmail,
        name: app.userName,
        category: app.category,
        adminNote: adminNote?.trim(),
      });
    } catch (e) {
      console.error('[super-admin/public-face] rejection email failed', e);
    }
  }

  return NextResponse.json({ success: true });
}

// GET single application (with identity proof for admin)
export async function PATCH(req: NextRequest) {
  if (!(await verifySuperAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { applicationId } = await req.json();
  const applications = await readJsonFile<PublicFaceApplication[]>(publicFaceApplicationsPath, []);
  const app = applications.find(a => a.id === applicationId);
  if (!app) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  return NextResponse.json({ application: app });
}
