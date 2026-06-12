import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/server/auth';
import {
  publicFaceOtpsPath,
  publicFaceApplicationsPath,
  usersPath,
  readJsonFile,
  writeJsonFile,
} from '@/lib/server/storage';
import {
  sendPublicFaceApplicationReceivedEmail,
  sendPublicFaceAdminNotificationEmail,
} from '@/lib/server/public-face-emails';
import { getPublicAppBaseUrl } from '@/lib/url';
import { hasInfinity } from '@/lib/server/infinity';
import type { PublicFaceApplication, PublicFaceCategory } from '@/types/document';

interface OtpRecord {
  id: string;
  userId: string;
  email: string;
  otp: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
}

interface UserRecord {
  id: string;
  email: string;
  name: string;
  role?: string;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = session.user.id;

    const infinity = await hasInfinity(userId);
    if (!infinity) {
      return NextResponse.json({ error: 'Docrud Infinity required', code: 'INFINITY_REQUIRED', feature: 'public_face' }, { status: 403 });
    }

    const body = await req.json();
    const {
      otp,
      category,
      instagramHandle,
      twitterHandle,
      youtubeChannel,
      facebookPage,
      tiktokHandle,
      websiteUrl,
      totalFollowers,
      monthlyReach,
      mediaFeatures,
      awardsRecognitions,
      notableProjects,
      publicStatement,
      identityProofDataUrl,
      identityProofFileName,
      identityProofMimeType,
    } = body as {
      otp: string;
      category: PublicFaceCategory;
      instagramHandle?: string;
      twitterHandle?: string;
      youtubeChannel?: string;
      facebookPage?: string;
      tiktokHandle?: string;
      websiteUrl?: string;
      totalFollowers?: string;
      monthlyReach?: string;
      mediaFeatures?: string;
      awardsRecognitions?: string;
      notableProjects?: string;
      publicStatement: string;
      identityProofDataUrl?: string;
      identityProofFileName?: string;
      identityProofMimeType?: string;
    };

    // Validate required fields
    if (!otp || !category || !publicStatement?.trim()) {
      return NextResponse.json({ error: 'OTP, category, and public statement are required.' }, { status: 400 });
    }
    if (publicStatement.trim().length < 50) {
      return NextResponse.json({ error: 'Public statement must be at least 50 characters.' }, { status: 400 });
    }

    // Check no existing pending/approved application
    const applications = await readJsonFile<PublicFaceApplication[]>(publicFaceApplicationsPath, []);
    const existing = applications.find(a => a.userId === userId);
    if (existing?.status === 'approved') {
      return NextResponse.json({ error: 'You already have an approved Public Face status.' }, { status: 400 });
    }
    if (existing?.status === 'pending' || existing?.status === 'under_review') {
      return NextResponse.json({ error: 'You already have a pending application.' }, { status: 400 });
    }

    // Verify OTP
    const otps = await readJsonFile<OtpRecord[]>(publicFaceOtpsPath, []);
    const otpRecord = otps.find(o => o.userId === userId && !o.used);
    if (!otpRecord) {
      return NextResponse.json({ error: 'No OTP found. Please request a new one.' }, { status: 400 });
    }
    if (otpRecord.otp !== otp.trim()) {
      return NextResponse.json({ error: 'Invalid OTP. Please try again.' }, { status: 400 });
    }
    if (new Date(otpRecord.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'OTP has expired. Please request a new one.' }, { status: 400 });
    }

    // Mark OTP as used
    const updatedOtps = otps.map(o =>
      o.id === otpRecord.id ? { ...o, used: true } : o,
    );
    await writeJsonFile(publicFaceOtpsPath, updatedOtps);

    const users = await readJsonFile<UserRecord[]>(usersPath, []);
    const user = users.find(u => u.id === userId);
    const userEmail = user?.email || (session.user.email as string);
    const userName = user?.name || (session.user.name as string);

    const now = new Date().toISOString();
    const applicationId = `pf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const application: PublicFaceApplication = {
      id: applicationId,
      userId,
      userEmail,
      userName,
      status: 'pending',
      category,
      instagramHandle: instagramHandle?.trim() || undefined,
      twitterHandle: twitterHandle?.trim() || undefined,
      youtubeChannel: youtubeChannel?.trim() || undefined,
      facebookPage: facebookPage?.trim() || undefined,
      tiktokHandle: tiktokHandle?.trim() || undefined,
      websiteUrl: websiteUrl?.trim() || undefined,
      totalFollowers: totalFollowers?.trim() || undefined,
      monthlyReach: monthlyReach?.trim() || undefined,
      mediaFeatures: mediaFeatures?.trim() || undefined,
      awardsRecognitions: awardsRecognitions?.trim() || undefined,
      notableProjects: notableProjects?.trim() || undefined,
      publicStatement: publicStatement.trim(),
      identityProofDataUrl: identityProofDataUrl || undefined,
      identityProofFileName: identityProofFileName || undefined,
      identityProofMimeType: identityProofMimeType || undefined,
      emailVerified: true,
      otpVerifiedAt: now,
      submittedAt: now,
      updatedAt: now,
    };

    // If rejected before, replace; otherwise add
    const filtered = applications.filter(a => a.userId !== userId);
    filtered.push(application);
    await writeJsonFile(publicFaceApplicationsPath, filtered);

    // Send confirmation email to applicant
    try {
      await sendPublicFaceApplicationReceivedEmail({ to: userEmail, name: userName, category, applicationId });
    } catch (e) {
      console.error('[public-face/apply] confirmation email failed', e);
    }

    // Notify super admins
    try {
      const superAdmins = users.filter(u => u.role === 'super_admin' || u.role === 'superadmin');
      const base = getPublicAppBaseUrl().replace(/\/$/, '');
      for (const admin of superAdmins) {
        await sendPublicFaceAdminNotificationEmail({
          adminEmail: admin.email,
          applicantName: userName,
          applicantEmail: userEmail,
          category,
          applicationId,
          adminPanelUrl: `${base}/super-admin?tab=public_face`,
        });
      }
    } catch (e) {
      console.error('[public-face/apply] admin notification failed', e);
    }

    return NextResponse.json({ success: true, applicationId });
  } catch (err) {
    console.error('[public-face/apply]', err);
    return NextResponse.json({ error: 'Failed to submit application.' }, { status: 500 });
  }
}
