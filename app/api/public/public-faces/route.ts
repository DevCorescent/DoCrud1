import { NextRequest, NextResponse } from 'next/server';
import {
  publicFaceApplicationsPath,
  userProfilesPath,
  followsPath,
  upraisedPath,
  readJsonFile,
} from '@/lib/server/storage';
import type { PublicFaceApplication } from '@/types/document';

interface UserProfile {
  headline?: string;
  bio?: string;
  location?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  coverGradient?: string;
  skills?: string[];
  openToWork?: boolean;
  socialLinks?: {
    twitter?: string;
    linkedin?: string;
    github?: string;
    instagram?: string;
    youtube?: string;
  };
}

interface FollowRecord { followerId: string; followingId: string; }
interface UpraisedRecord { upraisedUserId: string; upraisedByUserId: string; }

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || '';
    const search = searchParams.get('q') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = 24;

    const [applications, profiles, follows, upraised] = await Promise.all([
      readJsonFile<PublicFaceApplication[]>(publicFaceApplicationsPath, []),
      readJsonFile<Record<string, UserProfile>>(userProfilesPath, {}),
      readJsonFile<FollowRecord[]>(followsPath, []),
      readJsonFile<UpraisedRecord[]>(upraisedPath, []),
    ]);

    // Only approved Public Faces
    let approved = applications.filter(a => a.status === 'approved');

    if (category) {
      approved = approved.filter(a => a.category === category);
    }

    if (search) {
      const q = search.toLowerCase();
      approved = approved.filter(a =>
        a.userName.toLowerCase().includes(q) ||
        a.userEmail.toLowerCase().includes(q) ||
        profiles[a.userId]?.headline?.toLowerCase().includes(q) ||
        profiles[a.userId]?.location?.toLowerCase().includes(q),
      );
    }

    const total = approved.length;
    const offset = (page - 1) * limit;
    const paginated = approved.slice(offset, offset + limit);

    const followCounts: Record<string, number> = {};
    for (const f of follows) {
      followCounts[f.followingId] = (followCounts[f.followingId] || 0) + 1;
    }
    const upraiseCounts: Record<string, number> = {};
    for (const u of upraised) {
      upraiseCounts[u.upraisedUserId] = (upraiseCounts[u.upraisedUserId] || 0) + 1;
    }

    const publicFaces = paginated.map(app => {
      const profile = profiles[app.userId] || {};
      return {
        userId: app.userId,
        name: app.userName,
        category: app.category,
        approvedAt: app.reviewedAt,
        profile: {
          headline: profile.headline,
          bio: profile.bio,
          location: profile.location,
          avatarUrl: profile.avatarUrl,
          bannerUrl: profile.bannerUrl,
          coverGradient: profile.coverGradient,
          skills: profile.skills,
          openToWork: profile.openToWork,
          socialLinks: profile.socialLinks,
        },
        stats: {
          followers: followCounts[app.userId] || 0,
          upraiseCount: upraiseCounts[app.userId] || 0,
        },
      };
    });

    // Sort by follower count desc
    publicFaces.sort((a, b) => b.stats.followers - a.stats.followers);

    return NextResponse.json({ publicFaces, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[public/public-faces]', err);
    return NextResponse.json({ error: 'Failed to fetch Public Faces.' }, { status: 500 });
  }
}
