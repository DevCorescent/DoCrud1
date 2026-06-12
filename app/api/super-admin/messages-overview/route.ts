import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getStoredUsers } from '@/lib/server/auth';
import { getWebTelemetryEvents } from '@/lib/server/telemetry';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [users, telemetry] = await Promise.all([
      getStoredUsers(),
      getWebTelemetryEvents().catch(() => []),
    ]);

    const now = Date.now();
    const day7 = now - 7 * 86400000;
    const day30 = now - 30 * 86400000;
    const day1 = now - 86400000;

    // Extract message-related telemetry events
    type TelEvent = { type: string; createdAt?: string; userId?: string; path?: string; featureId?: string };
    const tel = telemetry as TelEvent[];

    const messageEvents = tel.filter((e) =>
      e.type === 'feature_open' && (e.featureId === 'messages' || e.path?.includes('/messages'))
    );
    const messageEvents7d = messageEvents.filter((e) => e.createdAt && new Date(e.createdAt).getTime() >= day7);
    const messageEvents24h = messageEvents.filter((e) => e.createdAt && new Date(e.createdAt).getTime() >= day1);

    // Users who used messages
    const usersMessaging7d = new Set(messageEvents7d.map((e) => e.userId).filter(Boolean)).size;
    const usersMessaging24h = new Set(messageEvents24h.map((e) => e.userId).filter(Boolean)).size;

    // Daily message activity
    const dailyActivity: { date: string; sessions: number; users: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const dateStr = d.toISOString().slice(0, 10);
      const dayEvents = messageEvents.filter((e) => String(e.createdAt || '').slice(0, 10) === dateStr);
      dailyActivity.push({
        date: dateStr,
        sessions: dayEvents.length,
        users: new Set(dayEvents.map((e) => e.userId).filter(Boolean)).size,
      });
    }

    // Total users who have been on messages at all
    const totalMessageUsers = new Set(messageEvents.map((e) => e.userId).filter(Boolean)).size;
    const messagingAdoption = users.length > 0 ? Math.round((totalMessageUsers / users.length) * 100) : 0;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalUsers: users.length,
        totalMessageUsers,
        messagingAdoption,
        usersMessaging24h,
        usersMessaging7d,
        messageSessions7d: messageEvents7d.length,
        messageSessions24h: messageEvents24h.length,
      },
      dailyActivity,
    });
  } catch (err) {
    console.error('[super-admin/messages-overview GET]', err);
    return NextResponse.json({ error: 'Failed to load messages overview' }, { status: 500 });
  }
}
