'use client';
import '@/components/profile/profile.css';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Eye, FileText, Lock, Loader2 } from 'lucide-react';

interface ActivityItem {
  type: 'profile_visit' | 'resume_download';
  createdAt: string;
  anonymous: boolean;
  user: { id: string; name: string; avatarUrl: string | null; href: string } | null;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Owner-only activity feed. Rendered on the owner's own profile.
 *
 * Fetched lazily on mount of the owner's profile — never during a visitor's
 * page load. Identity redaction is decided server-side; this component only
 * renders whatever the API chose to disclose.
 */
export default function ProfileActivityPanel() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [canSeeIdentity, setCanSeeIdentity] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/profile/activity?limit=20')
      .then((r) => (r.ok ? r.json() : { activities: [], canSeeIdentity: false }))
      .then((d: { activities?: ActivityItem[]; canSeeIdentity?: boolean }) => {
        if (!alive) return;
        setItems(d.activities ?? []);
        setCanSeeIdentity(d.canSeeIdentity === true);
        setLoading(false);
      })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="rounded-[20px] border pf-rim pf-s1 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] pf-s2 border pf-rim-2">
            <Eye className="h-3.5 w-3.5 pf-ink-3" />
          </div>
          <div>
            <p className="text-[13px] font-semibold pf-ink-2">Profile activity</p>
            <p className="text-[10.5px] pf-ink-4">
              {loading ? 'Loading…' : `${items.length} recent`}
            </p>
          </div>
        </div>
        {!loading && !canSeeIdentity && items.length > 0 && (
          <Link
            href="/u/me?upgrade=infinity"
            className="flex items-center gap-1.5 h-8 px-3 rounded-[10px] border border-amber-500/25 bg-amber-500/[0.08] text-amber-400/90 text-[11px] font-semibold hover:bg-amber-500/[0.14] transition-colors"
          >
            <Lock className="h-3 w-3" />
            Upgrade to see who
          </Link>
        )}
      </div>

      {loading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin pf-ink-4" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-[13px] pf-ink-3">No activity yet</p>
          <p className="mt-1 text-[11px] pf-ink-4">
            Profile views and resume downloads will appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {items.map((item, index) => {
            const Icon = item.type === 'resume_download' ? FileText : Eye;
            const action = item.type === 'resume_download'
              ? 'downloaded your resume'
              : 'viewed your profile';
            return (
              <div
                key={`${item.type}-${item.createdAt}-${index}`}
                className="flex items-center gap-3 py-2.5 border-b pf-rim last:border-0"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] pf-s2 border pf-rim overflow-hidden">
                  {item.user?.avatarUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={item.user.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Icon className="h-3.5 w-3.5 pf-ink-3" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] pf-ink-2 truncate">
                    {item.user ? (
                      <Link href={item.user.href} className="font-semibold pf-ink hover:underline">
                        {item.user.name}
                      </Link>
                    ) : (
                      <span className="font-semibold pf-ink-2">Someone</span>
                    )}{' '}
                    {action}
                  </p>
                  <p className="text-[10.5px] pf-ink-4">{timeAgo(item.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
