import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { buildDashboardMetrics } from '@/lib/server/dashboard';
import { getHistoryEntries } from '@/lib/server/history';
import { getDbPool } from '@/lib/server/database';
import { selectHistoryRowsForUser } from '@/lib/server/db/history-rows';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = session.user.email || '';
    const userRole = session.user.role;
    let visibleHistory;
    if (getDbPool()) {
      visibleHistory = await selectHistoryRowsForUser({ role: userRole, email: userEmail, orgId: session.user.id });
    } else {
      const history = await getHistoryEntries();
      visibleHistory = userRole === 'admin'
        ? history
        : userRole === 'employee'
          ? history.filter((entry) => entry.employeeEmail?.toLowerCase() === userEmail.toLowerCase())
        : userRole === 'client'
          ? history.filter((entry) => entry.organizationId === session.user.id || entry.clientEmail?.toLowerCase() === userEmail.toLowerCase())
          : history.filter((entry) => entry.generatedBy === userEmail);
    }

    return NextResponse.json(buildDashboardMetrics(visibleHistory));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load dashboard metrics' }, { status: 500 });
  }
}
