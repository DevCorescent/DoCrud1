import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, resolveSessionUserId } from '@/lib/server/auth';
import {
  publicFaceOtpsPath,
  publicFaceApplicationsPath,
  usersPath,
  readJsonFile,
  writeJsonFile,
} from '@/lib/server/storage';
import { sendPublicFaceOtpEmail } from '@/lib/server/public-face-emails';
import { hasInfinity } from '@/lib/server/infinity';
import type { PublicFaceApplication } from '@/types/document';

interface OtpRecord {
  id: string;
  userId: string;
  email: string;
  otp: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = await resolveSessionUserId(session);
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userEmail = session?.user?.email as string;
    const userName = session?.user?.name as string;

    const infinity = await hasInfinity(userId);
    if (!infinity) {
      return NextResponse.json({ error: 'Docrud Infinity required', code: 'INFINITY_REQUIRED', feature: 'public_face' }, { status: 403 });
    }

    // Block if already approved
    const applications = await readJsonFile<PublicFaceApplication[]>(publicFaceApplicationsPath, []);
    const existing = applications.find(a => a.userId === userId);
    if (existing?.status === 'approved') {
      return NextResponse.json({ error: 'You already have an approved Public Face status.' }, { status: 400 });
    }
    if (existing?.status === 'pending' || existing?.status === 'under_review') {
      return NextResponse.json({ error: 'You already have a pending application.' }, { status: 400 });
    }

    // Rate-limit: one OTP per 2 minutes
    const otps = await readJsonFile<OtpRecord[]>(publicFaceOtpsPath, []);
    const recent = otps.find(
      o => o.userId === userId && !o.used && new Date(o.createdAt).getTime() > Date.now() - 2 * 60 * 1000,
    );
    if (recent) {
      return NextResponse.json({ error: 'Please wait 2 minutes before requesting another OTP.' }, { status: 429 });
    }

    const otp = generateOtp();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

    const record: OtpRecord = {
      id: `pfotp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      email: userEmail,
      otp,
      createdAt: now.toISOString(),
      expiresAt,
      used: false,
    };

    // Remove old OTPs for this user
    const cleaned = otps.filter(o => o.userId !== userId);
    cleaned.push(record);
    await writeJsonFile(publicFaceOtpsPath, cleaned);

    await sendPublicFaceOtpEmail({ to: userEmail, name: userName, otp, expiresAt });

    return NextResponse.json({ success: true, message: `OTP sent to ${userEmail}` });
  } catch (err) {
    console.error('[public-face/send-otp]', err);
    return NextResponse.json({ error: 'Failed to send OTP.' }, { status: 500 });
  }
}
