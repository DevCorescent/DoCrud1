'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ArrowLeft, ArrowRight, Copy, Download, ExternalLink, FileText, ImageIcon, Link2, Loader2, Lock, Share2, Users } from 'lucide-react';
import { buildAbsoluteAppUrl, buildQrImageUrl } from '@/lib/url';
import type { DocrudianAttachment, DocrudianCircle, DocrudianPost, DocrudianRoomActivity, LandingSettings } from '@/types/document';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type RoomPayload = {
  room: DocrudianCircle;
  posts: DocrudianPost[];
  analytics: {
    views: number;
    joins: number;
    fileOpens: number;
    downloads: number;
    activity: DocrudianRoomActivity[];
  };
};

export default function PublicDocrudiansRoomPage({
  softwareName,
  accentLabel,
  settings,
  roomId,
}: {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
  roomId: string;
}) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated';
  const actorName = session?.user?.name || undefined;
  const actorUserId = session?.user?.email || undefined;
  const [payload, setPayload] = useState<RoomPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessCode, setAccessCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedAttachment, setSelectedAttachment] = useState<DocrudianAttachment | null>(null);

  const trackEvent = useCallback(
    async (action: 'view' | 'join' | 'file_open' | 'download' | 'share', attachment?: DocrudianAttachment) => {
      try {
        await fetch(`/api/public/docrudians/${roomId}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action,
            actorName,
            actorUserId,
            resourceId: attachment?.id,
            resourceName: attachment?.name,
          }),
        });
      } catch {}
    },
    [actorName, actorUserId, roomId],
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/public/docrudians/${roomId}`, { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || 'Unable to load room.');
        setPayload(data);
        if (data?.room?.resources?.[0]) {
          setSelectedAttachment(data.room.resources[0]);
        } else if (data?.posts?.[0]?.attachments?.[0]) {
          setSelectedAttachment(data.posts[0].attachments[0]);
        }
        void trackEvent('view');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to load room.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [roomId, trackEvent]);

  const joinRoom = async () => {
    if (!isAuthenticated) {
      setMessage('Login first to join this room.');
      return;
    }
    try {
      setJoining(true);
      setMessage('');
      const response = await fetch('/api/docrudians', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'join-circle', circleId: roomId, accessCode }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Unable to join room.');
      void trackEvent('join');
      setMessage('Room joined. Open it from your workspace now.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to join room.');
    } finally {
      setJoining(false);
    }
  };

  const handleOpenAttachment = async (attachment: DocrudianAttachment) => {
    setSelectedAttachment(attachment);
    void trackEvent('file_open', attachment);
  };

  const handleDownloadAttachment = async (attachment: DocrudianAttachment) => {
    void trackEvent('download', attachment);
    const link = document.createElement('a');
    link.href = attachment.url;
    link.download = attachment.name || 'room-file';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleShareAttachment = async (attachment: DocrudianAttachment) => {
    const shareValue = buildAbsoluteAppUrl(attachment.shareUrl || attachment.url, typeof window !== 'undefined' ? window.location.origin : undefined);
    if (navigator.share) {
      try {
        await navigator.share({ title: attachment.name, url: shareValue });
      } catch {}
    } else {
      await navigator.clipboard.writeText(shareValue);
    }
    void trackEvent('share', attachment);
    setMessage(`${attachment.name} share link copied.`);
  };

  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="rounded-[2rem] border border-white/80 bg-white/85 p-5 sm:p-8">
        <Link href="/docrudians" className="inline-flex items-center gap-2 text-sm text-slate-500">
          <ArrowLeft className="h-4 w-4" />
          Back to rooms
        </Link>

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : payload ? (
          <div className="mt-5 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-5">
              <div className="rounded-[1.8rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(241,245,255,0.92))] p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                    {payload.room.visibility === 'private' ? 'Private room' : 'Public room'}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                    {payload.room.category}
                  </span>
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-slate-950">{payload.room.title}</h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">{payload.room.description}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {(payload.room.tags || []).map((tag) => (
                    <span key={tag} className="rounded-full bg-white px-3 py-1.5 text-xs text-slate-600">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'Views', value: payload.analytics.views },
                  { label: 'Joins', value: payload.analytics.joins },
                  { label: 'File opens', value: payload.analytics.fileOpens },
                  { label: 'Downloads', value: payload.analytics.downloads },
                ].map((item) => (
                  <div key={item.label} className="rounded-[1.2rem] border border-slate-200 bg-white p-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                    <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-950">Shared files and preview</h2>
                  <span className="text-xs text-slate-500">{(payload.room.resources?.length || 0) + payload.posts.reduce((count, post) => count + post.attachments.length, 0)} files</span>
                </div>
                <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                  <div className="space-y-3">
                    {(payload.room.resources || []).map((attachment) => (
                      <div key={attachment.id} className="rounded-[1rem] border border-slate-200 bg-slate-50 p-3">
                        <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => void handleOpenAttachment(attachment)}>
                          {attachment.type === 'image' ? <ImageIcon className="h-5 w-5 text-sky-600" /> : attachment.type === 'link' ? <Link2 className="h-5 w-5 text-violet-600" /> : <FileText className="h-5 w-5 text-emerald-600" />}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900">{attachment.name}</p>
                            <p className="text-xs text-slate-500">{attachment.sizeLabel || 'Room resource'}</p>
                          </div>
                        </button>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button asChild type="button" size="sm" variant="outline" className="rounded-xl">
                            <Link href={attachment.shareUrl || `/docrudians/room/${payload.room.id}/file/${attachment.id}`}>Open</Link>
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => void handleOpenAttachment(attachment)}>
                            Preview
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => navigator.clipboard.writeText(buildAbsoluteAppUrl(attachment.shareUrl || `/docrudians/room/${payload.room.id}/file/${attachment.id}`, typeof window !== 'undefined' ? window.location.origin : undefined))}>
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                            Copy URL
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => void handleDownloadAttachment(attachment)}>
                            <Download className="mr-1.5 h-3.5 w-3.5" />
                            Download
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => void handleShareAttachment(attachment)}>
                            <Share2 className="mr-1.5 h-3.5 w-3.5" />
                            Share
                          </Button>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                          <div className="rounded-[0.9rem] bg-white px-3 py-2 text-[11px] text-slate-500 break-all">
                            {buildAbsoluteAppUrl(attachment.shareUrl || `/docrudians/room/${payload.room.id}/file/${attachment.id}`, typeof window !== 'undefined' ? window.location.origin : undefined)}
                          </div>
                          <div className="relative h-20 w-20 overflow-hidden rounded-xl bg-white p-1">
                            <Image src={attachment.qrUrl || buildQrImageUrl(attachment.shareUrl || `/docrudians/room/${payload.room.id}/file/${attachment.id}`, typeof window !== 'undefined' ? window.location.origin : undefined, 180)} alt={`${attachment.name} QR`} fill unoptimized className="object-contain p-1" />
                          </div>
                        </div>
                      </div>
                    ))}
                    {payload.posts.flatMap((post) => post.attachments).map((attachment) => (
                      <div key={attachment.id} className="rounded-[1rem] border border-slate-200 bg-slate-50 p-3">
                        <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => void handleOpenAttachment(attachment)}>
                          {attachment.type === 'image' ? <ImageIcon className="h-5 w-5 text-sky-600" /> : attachment.type === 'link' ? <Link2 className="h-5 w-5 text-violet-600" /> : <FileText className="h-5 w-5 text-emerald-600" />}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900">{attachment.name}</p>
                            <p className="text-xs text-slate-500">{attachment.sizeLabel || 'Post attachment'}</p>
                          </div>
                        </button>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button asChild type="button" size="sm" variant="outline" className="rounded-xl">
                            <Link href={attachment.shareUrl || `/docrudians/room/${payload.room.id}/file/${attachment.id}`}>Open</Link>
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => void handleOpenAttachment(attachment)}>
                            Preview
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => navigator.clipboard.writeText(buildAbsoluteAppUrl(attachment.shareUrl || `/docrudians/room/${payload.room.id}/file/${attachment.id}`, typeof window !== 'undefined' ? window.location.origin : undefined))}>
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                            Copy URL
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => void handleDownloadAttachment(attachment)}>
                            <Download className="mr-1.5 h-3.5 w-3.5" />
                            Download
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => void handleShareAttachment(attachment)}>
                            <Share2 className="mr-1.5 h-3.5 w-3.5" />
                            Share
                          </Button>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                          <div className="rounded-[0.9rem] bg-white px-3 py-2 text-[11px] text-slate-500 break-all">
                            {buildAbsoluteAppUrl(attachment.shareUrl || `/docrudians/room/${payload.room.id}/file/${attachment.id}`, typeof window !== 'undefined' ? window.location.origin : undefined)}
                          </div>
                          <div className="relative h-20 w-20 overflow-hidden rounded-xl bg-white p-1">
                            <Image src={attachment.qrUrl || buildQrImageUrl(attachment.shareUrl || `/docrudians/room/${payload.room.id}/file/${attachment.id}`, typeof window !== 'undefined' ? window.location.origin : undefined, 180)} alt={`${attachment.name} QR`} fill unoptimized className="object-contain p-1" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4">
                    {selectedAttachment ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">{selectedAttachment.name}</p>
                            <p className="text-xs text-slate-500">{selectedAttachment.sizeLabel || 'Preview ready'}</p>
                          </div>
                          <a href={selectedAttachment.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-slate-600">
                            Open raw
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                        {selectedAttachment.type === 'image' ? (
                          <div className="relative h-[32rem] w-full overflow-hidden rounded-[1rem] bg-white">
                            <Image src={selectedAttachment.url} alt={selectedAttachment.name} fill unoptimized className="object-contain" />
                          </div>
                        ) : selectedAttachment.type === 'link' ? (
                          <div className="rounded-[1rem] bg-white p-5 text-sm text-slate-600">
                            This shared item is a link. Use the actions above to open, share, or copy it.
                          </div>
                        ) : (
                          <iframe src={selectedAttachment.url} title={selectedAttachment.name} className="h-[32rem] w-full rounded-[1rem] border border-slate-200 bg-white" />
                        )}
                      </div>
                    ) : (
                      <div className="flex min-h-[16rem] items-center justify-center rounded-[1rem] bg-white text-sm text-slate-500">
                        Select a file to preview it here.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-950">Room feed</h2>
                  <span className="text-xs text-slate-500">{payload.posts.length} updates</span>
                </div>
                <div className="mt-5 space-y-4">
                  {payload.posts.length ? (
                    payload.posts.map((post) => (
                      <article key={post.id} className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">{post.title}</p>
                            <p className="mt-1 text-xs text-slate-500">{post.authorName}</p>
                          </div>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] text-slate-500">{post.category}</span>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-600">{post.content}</p>
                        {post.attachments.length ? (
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {post.attachments.map((attachment) => (
                              <a
                                key={attachment.id}
                                href={attachment.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-3 rounded-[1rem] border border-slate-200 bg-white p-3"
                              >
                                {attachment.type === 'image' ? (
                                  <ImageIcon className="h-5 w-5 text-sky-600" />
                                ) : attachment.type === 'link' ? (
                                  <Link2 className="h-5 w-5 text-violet-600" />
                                ) : (
                                  <FileText className="h-5 w-5 text-emerald-600" />
                                )}
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-slate-900">{attachment.name}</p>
                                  <p className="text-xs text-slate-500">{attachment.sizeLabel || 'Open attachment'}</p>
                                </div>
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    ))
                  ) : (
                    <div className="rounded-[1.2rem] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                      This room is live, but it does not have public updates yet.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <aside className="space-y-5">
              <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-slate-950">Join room</h2>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-[1rem] bg-slate-50 p-4 text-sm text-slate-600">
                    <div className="flex items-center gap-2 font-medium text-slate-900">
                      <Users className="h-4 w-4 text-sky-600" />
                      {payload.room.memberUserIds.length} members inside
                    </div>
                    <p className="mt-2">
                      Join from your account to post updates, add files, publish resources, and keep work in one trusted room.
                    </p>
                  </div>
                  {payload.room.visibility === 'private' ? (
                    <div className="grid gap-2">
                      <label className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Access code</label>
                      <Input value={accessCode} onChange={(event) => setAccessCode(event.target.value)} placeholder="Enter room access code" />
                    </div>
                  ) : null}
                  <Button type="button" className="rounded-xl bg-slate-950 text-white hover:bg-slate-800" onClick={joinRoom} disabled={joining}>
                    {joining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                    Join this room
                  </Button>
                  <Button asChild variant="outline" className="rounded-xl">
                    <Link href="/workspace?tab=docrudians">Open workspace rooms</Link>
                  </Button>
                  {message ? <p className="text-sm text-slate-600">{message}</p> : null}
                </div>
              </div>

              <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-slate-950">What this room supports</h2>
                <div className="mt-4 space-y-3">
                  {(payload.room.featureFlags || []).map((feature) => (
                    <div key={feature} className="rounded-[1rem] bg-slate-50 px-4 py-3 text-sm text-slate-700">
                      {feature === 'compression'
                        ? 'Compress and organize room resources before sharing.'
                        : feature === 'invite_link'
                          ? 'Invite members with one secure room link.'
                          : feature === 'resources'
                            ? 'Keep PDFs, docs, links, and image resources in one place.'
                            : feature === 'submissions'
                              ? 'Collect materials from coordinators, teams, or attendees.'
                              : 'Run pinned updates and room-wide announcements cleanly.'}
                    </div>
                  ))}
                </div>
                {payload.room.visibility === 'private' ? (
                  <div className="mt-4 rounded-[1rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <div className="flex items-center gap-2 font-medium">
                      <Lock className="h-4 w-4" />
                      Protected room
                    </div>
                    <p className="mt-1 text-amber-800">Only people with the room link and access code can join.</p>
                  </div>
                ) : null}
              </div>

              <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-slate-950">Member activity timeline</h2>
                <div className="mt-4 space-y-3">
                  {payload.analytics.activity.length ? (
                    payload.analytics.activity.map((item) => (
                      <div key={item.id} className="rounded-[1rem] bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        <p className="font-medium text-slate-900">
                          {item.actorName || 'Visitor'} {item.type === 'view' ? 'viewed the room' : item.type === 'join' ? 'joined the room' : item.type === 'file_open' ? 'opened a file' : item.type === 'download' ? 'downloaded a file' : 'shared a file'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {[item.resourceName, item.note, new Date(item.createdAt).toLocaleString()].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[1rem] bg-slate-50 px-4 py-3 text-sm text-slate-500">Room activity will appear here as people open files, download packs, and join.</div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        ) : (
          <div className="mt-5 rounded-[1.8rem] border border-dashed border-slate-200 bg-white p-10 text-center text-slate-500">
            Room not found.
          </div>
        )}
      </section>
    </PublicSiteChrome>
  );
}
