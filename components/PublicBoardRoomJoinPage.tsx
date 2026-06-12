'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { BriefcaseBusiness, CalendarClock, Lock, ShieldCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type PublicBoardRoomJoinPageProps = {
  token: string;
};

type PublicRoomPayload = {
  room: {
    id: string;
    title: string;
    summary: string;
    counterpartyName: string;
    stage: string;
    targetCloseDate?: string;
    organizationName?: string;
  };
  auth: {
    loggedIn: boolean;
    participant: { accessLevel: string; source?: string } | null;
    pendingRequest: { requestedAccessLevel: string; requestedAt: string } | null;
  };
};

export default function PublicBoardRoomJoinPage({ token }: PublicBoardRoomJoinPageProps) {
  const { status } = useSession();
  const [payload, setPayload] = useState<PublicRoomPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [requestedAccessLevel, setRequestedAccessLevel] = useState<'viewer' | 'editor' | 'approver'>('viewer');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/public/board-rooms/${token}`, { cache: 'no-store' });
      const nextPayload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(nextPayload?.error || 'Unable to load board room.');
      setPayload(nextPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load board room.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load, status]);

  const handleRequest = async () => {
    try {
      setBusy(true);
      setError('');
      setSuccess('');
      const response = await fetch(`/api/public/board-rooms/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joinPassword, requestedAccessLevel, note }),
      });
      const nextPayload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(nextPayload?.error || 'Unable to request access.');
      setSuccess(nextPayload?.status === 'joined' ? 'You already have access. Open the board room from your workspace dashboard.' : 'Access request submitted. The board room owner will review it.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to request access.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-5xl px-4 py-16 text-sm text-slate-600">Loading board room...</div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[2rem] border-white/80 bg-white/88 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
          <CardHeader className="space-y-4">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              <BriefcaseBusiness className="h-4 w-4 text-slate-900" />
              Board Room Access
            </div>
            <div>
              <CardTitle className="text-3xl tracking-tight text-slate-950">{payload?.room.title}</CardTitle>
              <p className="mt-3 text-sm leading-7 text-slate-600">{payload?.room.summary || 'This board room is being used to manage a governed transaction workflow.'}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{payload?.room.counterpartyName}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{payload?.room.stage.replace(/_/g, ' ')}</span>
              {payload?.room.targetCloseDate ? <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Target close {new Date(payload.room.targetCloseDate).toLocaleDateString()}</span> : null}
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <ShieldCheck className="mb-3 h-4 w-4 text-slate-900" />
              <p className="text-sm font-medium text-slate-950">Controlled access</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">The room owner approves who can enter and what level of access they should have.</p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <Lock className="mb-3 h-4 w-4 text-slate-900" />
              <p className="text-sm font-medium text-slate-950">Link + password</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">You need the shared room password to request entry through this invite link.</p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <CalendarClock className="mb-3 h-4 w-4 text-slate-900" />
              <p className="text-sm font-medium text-slate-950">Deadline-aware workflow</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">The board room tracks stage, countdown, tasks, and room activity in one place.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-white/80 bg-white/88 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
          <CardHeader>
            <CardTitle className="text-xl text-slate-950">Join this board room</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {status !== 'authenticated' ? (
              <div className="space-y-4">
                <p className="text-sm leading-6 text-slate-600">
                  You need a docrud account before joining. You can log in with an existing account or create an individual profile and then return to this invite link.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Link href={`/login?callbackUrl=${encodeURIComponent(`/board-room/${token}`)}`}>
                    <Button className="w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800">Login to Continue</Button>
                  </Link>
                  <Link href={`/individual-signup`}>
                    <Button variant="outline" className="w-full rounded-xl">Create Individual Profile</Button>
                  </Link>
                </div>
              </div>
            ) : payload?.auth.participant ? (
              <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-medium text-emerald-900">You already have board room access.</p>
                <p className="mt-2 text-sm text-emerald-800">Open your workspace to continue with the board room flow.</p>
                <Link href="/workspace?tab=deal-room" className="mt-4 inline-flex">
                  <Button className="rounded-xl bg-slate-950 text-white hover:bg-slate-800">Open Board Room</Button>
                </Link>
              </div>
            ) : payload?.auth.pendingRequest ? (
              <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-900">Your access request is pending.</p>
                <p className="mt-2 text-sm text-amber-800">Requested access: {payload.auth.pendingRequest.requestedAccessLevel}. The board room creator will review it soon.</p>
              </div>
            ) : (
              <>
                <Input value={joinPassword} onChange={(event) => setJoinPassword(event.target.value)} placeholder="Enter board room password" />
                <div className="grid gap-3 sm:grid-cols-3">
                  {(['viewer', 'editor', 'approver'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setRequestedAccessLevel(level)}
                      className={`rounded-[1.25rem] border px-3 py-3 text-sm font-medium transition ${requestedAccessLevel === level ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700'}`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Tell the board room owner why you need access"
                  className="min-h-[120px] w-full rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                />
                <Button onClick={() => void handleRequest()} disabled={busy || !joinPassword.trim()} className="w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800">
                  {busy ? 'Submitting...' : 'Request Board Room Access'}
                </Button>
              </>
            )}

            {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{success}</div> : null}
            {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <div className="flex items-center gap-2 font-medium text-slate-950">
                <Users className="h-4 w-4" />
                What happens next
              </div>
              <p className="mt-2 leading-6">
                If the creator approves your request, the board room will appear in your workspace dashboard. If the creator provisioned a username for you directly, log in with that username and you will land inside the board-room workflow immediately.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
