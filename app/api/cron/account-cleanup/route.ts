/**
 * Cron route — account cleanup
 *
 * Call this endpoint daily (e.g. via Vercel Cron, a simple cron job,
 * or a scheduled server task) to:
 *   1. Send 7-day warning emails to users whose deactivationDeadline is ≤ 7 days away
 *   2. Permanently delete accounts whose deactivationDeadline has passed
 *
 * Secure with a secret header: CRON_SECRET env var.
 * If not set, only localhost calls are accepted.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getStoredUsers, saveStoredUsers } from '@/lib/server/auth';
import { readJsonFile, writeJsonFile, userProfilesPath, followsPath } from '@/lib/server/storage';
import {
  sendDeactivationWarningEmail,
  sendAccountDeletedEmail,
} from '@/lib/server/account-emails';

const CREDITS_FILE = path.join(process.cwd(), 'data', 'credits.json');
const ONE_DAY_MS   = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get('x-cron-secret') || req.headers.get('authorization');
    return header === secret || header === `Bearer ${secret}`;
  }
  // If no secret set, only allow from localhost in development
  const host = req.headers.get('host') || '';
  return host.startsWith('localhost') || host.startsWith('127.0.0.1');
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = Date.now();
  const users = await getStoredUsers();

  const warningsSent: string[] = [];
  const deleted: string[] = [];

  // Process deactivated users with a deadline
  const deactivatedWithDeadline = users.filter(
    (u) => u.isActive === false && u.deactivationDeadline && !u.pendingDeletion,
  );

  for (const user of deactivatedWithDeadline) {
    const deadline = new Date(user.deactivationDeadline!).getTime();
    const msToDeadline = deadline - now;

    if (msToDeadline <= 0) {
      // ── Delete the account ──────────────────────────────────────
      deleted.push(user.id);

      // Remove profile
      try {
        const profiles = await readJsonFile<Record<string, unknown>>(userProfilesPath, {});
        delete profiles[user.id];
        await writeJsonFile(userProfilesPath, profiles);
      } catch { /* ignore */ }

      // Remove credits
      try {
        const raw   = await fs.readFile(CREDITS_FILE, 'utf8');
        const store = JSON.parse(raw) as { users: Record<string, unknown> };
        delete store.users[user.id];
        await fs.writeFile(CREDITS_FILE, JSON.stringify(store, null, 2), 'utf8');
      } catch { /* ignore */ }

      // Remove follows
      try {
        const follows = await readJsonFile<Record<string, string[]>>(followsPath, {});
        delete follows[user.id];
        for (const k of Object.keys(follows)) {
          follows[k] = (follows[k] || []).filter((id) => id !== user.id);
        }
        await writeJsonFile(followsPath, follows);
      } catch { /* ignore */ }

      // Goodbye email
      sendAccountDeletedEmail({ to: user.email, name: user.name }).catch(() => {});

    } else if (msToDeadline <= SEVEN_DAYS_MS && !user.deactivationWarningEmailSentAt) {
      // ── Send 7-day warning ──────────────────────────────────────
      warningsSent.push(user.id);

      sendDeactivationWarningEmail({
        to: user.email,
        name: user.name,
        deadline: user.deactivationDeadline!,
      }).catch(() => {});

      // Mark warning as sent
      const idx = users.findIndex((u) => u.id === user.id);
      if (idx >= 0) {
        users[idx] = { ...users[idx], deactivationWarningEmailSentAt: new Date().toISOString() };
      }
    }
  }

  // Remove deleted users from the store
  const survivingUsers = users.filter((u) => !deleted.includes(u.id));
  await saveStoredUsers(survivingUsers);

  console.log(`[account-cleanup] warnings=${warningsSent.length} deleted=${deleted.length}`);

  return NextResponse.json({
    ok: true,
    warningsSent: warningsSent.length,
    deleted: deleted.length,
    processedAt: new Date().toISOString(),
  });
}
