'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useSession } from 'next-auth/react';
import {
  ArrowRight,
  Code2,
  Copy,
  FileArchive,
  FileText,
  GraduationCap,
  ImageIcon,
  Loader2,
  Lock,
  Megaphone,
  Sparkles,
  Users,
} from 'lucide-react';
import type {
  DocrudianAttachment,
  DocrudianCircle,
  DocrudianPost,
  DocrudiansWorkspaceData,
  LandingSettings,
} from '@/types/document';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PublicDocrudiansPageProps {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
}

type PublicPayload = Pick<DocrudiansWorkspaceData, 'posts' | 'circles' | 'stats'>;

const useCases = [
  { id: 'developers', label: 'Developers', icon: Code2, blurb: 'Ship builds, docs, issue packs, and launch resources in one room.' },
  { id: 'students', label: 'Students', icon: GraduationCap, blurb: 'Run study groups, project rooms, internships, and proof-of-work packs.' },
  { id: 'colleges', label: 'Colleges', icon: Users, blurb: 'Coordinate clubs, fests, placements, and team operations securely.' },
  { id: 'events', label: 'Events', icon: Megaphone, blurb: 'Manage speaker packs, media kits, volunteer docs, and attendee drops.' },
] as const;

const emptyRoomForm = {
  title: '',
  description: '',
  category: 'developers',
  visibility: 'public' as 'public' | 'private',
  tags: '',
  accessCode: '',
};

const emptyPostForm = {
  roomId: '',
  title: '',
  content: '',
  visibility: 'public' as 'public' | 'members',
  category: 'showcase',
};

export default function PublicDocrudiansPage({ softwareName, accentLabel, settings }: PublicDocrudiansPageProps) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated' && Boolean(session?.user);
  const [data, setData] = useState<PublicPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [roomForm, setRoomForm] = useState(emptyRoomForm);
  const [postForm, setPostForm] = useState(emptyPostForm);
  const [attachments, setAttachments] = useState<DocrudianAttachment[]>([]);
  const [joinCodes, setJoinCodes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(isAuthenticated ? '/api/docrudians' : '/api/public/docrudians', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to load Docrudians rooms.');
      setData({
        circles: payload.circles || [],
        posts: payload.posts || [],
        stats: payload.stats || { members: 0, posts: 0, circles: 0, opportunities: 0, matchingCircles: 0 },
      });
      setPostForm((current) => ({
        ...current,
        roomId: current.roomId || payload?.circles?.[0]?.id || '',
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load Docrudians rooms.');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAttachmentInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const next = await Promise.all(
      files.slice(0, 4).map(
        (file) =>
          new Promise<DocrudianAttachment>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                id: `${file.name}-${Date.now()}`,
                type: file.type.startsWith('image/') ? 'image' : 'document',
                name: file.name,
                url: String(reader.result || ''),
                mimeType: file.type,
                sizeLabel: `${Math.max(1, Math.round(file.size / 1024))} KB`,
              });
            reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
            reader.readAsDataURL(file);
          }),
      ),
    );
    setAttachments((current) => [...current, ...next].slice(0, 4));
    event.target.value = '';
  };

  const createRoom = async () => {
    if (!isAuthenticated) {
      setMessage('Login first to create rooms.');
      return;
    }
    try {
      setSaving(true);
      setMessage('');
      const response = await fetch('/api/docrudians', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'circle',
          data: {
            ...roomForm,
            tags: roomForm.tags.split(',').map((item) => item.trim()).filter(Boolean),
            useCase:
              roomForm.category === 'developers'
                ? 'developer'
                : roomForm.category === 'students'
                  ? 'student'
                  : roomForm.category === 'colleges'
                    ? 'college'
                    : roomForm.category === 'events'
                      ? 'event'
                      : 'team',
            featureFlags: ['resources', 'invite_link', 'compression', 'announcements', 'submissions'],
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to create room.');
      setRoomForm(emptyRoomForm);
      setMessage('Room created. Share the room link or open it from your workspace.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create room.');
    } finally {
      setSaving(false);
    }
  };

  const publishUpdate = async () => {
    if (!isAuthenticated) {
      setMessage('Login first to post inside rooms.');
      return;
    }
    try {
      setSaving(true);
      setMessage('');
      const response = await fetch('/api/docrudians', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'post',
          data: {
            ...postForm,
            attachments,
            tags: [],
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to post update.');
      setPostForm((current) => ({ ...emptyPostForm, roomId: current.roomId }));
      setAttachments([]);
      setMessage('Room update posted.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to post update.');
    } finally {
      setSaving(false);
    }
  };

  const joinRoom = async (room: DocrudianCircle) => {
    if (!isAuthenticated) {
      setMessage('Login first to join rooms.');
      return;
    }
    try {
      setSaving(true);
      setMessage('');
      const response = await fetch('/api/docrudians', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'join-circle',
          circleId: room.id,
          accessCode: joinCodes[room.id] || '',
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to join room.');
      setMessage('Joined room successfully.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to join room.');
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async (room: DocrudianCircle) => {
    const shareLink = typeof window !== 'undefined' ? `${window.location.origin}${room.shareLink || `/docrudians/room/${room.id}`}` : room.shareLink || '';
    await navigator.clipboard.writeText(shareLink);
    setMessage('Room link copied.');
  };

  const featuredRooms = useMemo(() => data?.circles || [], [data?.circles]);
  const latestUpdates = useMemo(() => (data?.posts || []).slice(0, 6), [data?.posts]);

  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="rounded-[2rem] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(241,246,255,0.92))] p-5 sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-700">
              <Sparkles className="h-4 w-4 text-sky-600" />
              Docrudians Rooms
            </span>
            <h1 className="mt-4 text-[2.2rem] font-semibold leading-[1.02] tracking-[-0.05em] text-slate-950 sm:text-[3.5rem]">
              Public and private rooms for real work.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              Create focused spaces for developers, students, colleges, events, and teams. Share room links, compress resources, drop updates, and keep everything trusted and easy to use.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {['Share by room link', 'Public or private access', 'Useful for docs and images', 'Compression-ready workflows'].map((item) => (
                <span key={item} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:w-[28rem]">
            {[
              { label: 'Rooms', value: data?.stats.circles || 0 },
              { label: 'Public', value: data?.stats.publicRooms || 0 },
              { label: 'Private', value: data?.stats.privateRooms || 0 },
              { label: 'Resources', value: data?.stats.sharedResources || 0 },
            ].map((item) => (
              <div key={item.label} className="rounded-[1.2rem] border border-white/80 bg-white/85 p-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-4">
        {useCases.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.id} className="rounded-[1.6rem] border border-slate-200 bg-white p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                <Icon className="h-5 w-5 text-slate-900" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-950">{item.label}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.blurb}</p>
            </div>
          );
        })}
      </section>

      {message ? <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{message}</div> : null}

      <section className="grid gap-5 xl:grid-cols-[0.7fr_1.3fr]">
        <div className="space-y-5">
          <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-sky-600" />
              <h2 className="text-lg font-semibold text-slate-950">Create a room</h2>
            </div>
            <div className="mt-5 grid gap-3">
              <Input placeholder="Room title" value={roomForm.title} onChange={(event) => setRoomForm((current) => ({ ...current, title: event.target.value }))} />
              <textarea
                className="min-h-[108px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900"
                placeholder="What will this room help people do?"
                value={roomForm.description}
                onChange={(event) => setRoomForm((current) => ({ ...current, description: event.target.value }))}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" value={roomForm.category} onChange={(event) => setRoomForm((current) => ({ ...current, category: event.target.value }))}>
                  <option value="developers">Developers</option>
                  <option value="students">Students</option>
                  <option value="colleges">Colleges</option>
                  <option value="events">Events</option>
                  <option value="builders">Builders</option>
                  <option value="operators">Operators</option>
                </select>
                <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" value={roomForm.visibility} onChange={(event) => setRoomForm((current) => ({ ...current, visibility: event.target.value as 'public' | 'private' }))}>
                  <option value="public">Public room</option>
                  <option value="private">Private room</option>
                </select>
              </div>
              <Input placeholder="Tags, comma separated" value={roomForm.tags} onChange={(event) => setRoomForm((current) => ({ ...current, tags: event.target.value }))} />
              {roomForm.visibility === 'private' ? (
                <Input placeholder="Private room access code" value={roomForm.accessCode} onChange={(event) => setRoomForm((current) => ({ ...current, accessCode: event.target.value }))} />
              ) : null}
              <Button type="button" className="rounded-xl bg-slate-950 text-white hover:bg-slate-800" disabled={saving} onClick={createRoom}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                Create room
              </Button>
            </div>
          </div>

          <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2">
              <FileArchive className="h-4 w-4 text-violet-600" />
              <h2 className="text-lg font-semibold text-slate-950">Useful inside every room</h2>
            </div>
            <div className="mt-5 space-y-3 text-sm text-slate-600">
              <div className="rounded-[1rem] bg-slate-50 p-4">Compress resource packs before sharing so dev handoffs, college docs, and event assets stay light.</div>
              <div className="rounded-[1rem] bg-slate-50 p-4">Invite people with one room link instead of sending files one by one.</div>
              <div className="rounded-[1rem] bg-slate-50 p-4">Keep announcements, updates, images, docs, and proofs inside the same room.</div>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-950">Active rooms</h2>
              {loading ? <Loader2 className="h-5 w-5 animate-spin text-slate-500" /> : null}
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {featuredRooms.map((room) => (
                <article key={room.id} className="rounded-[1.3rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,247,255,0.92))] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">{room.category}</span>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${room.visibility === 'private' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {room.visibility}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold tracking-[-0.03em] text-slate-950">{room.title}</h3>
                    </div>
                    {room.visibility === 'private' ? <Lock className="h-4 w-4 text-amber-600" /> : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{room.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(room.tags || []).slice(0, 4).map((tag) => (
                      <span key={tag} className="rounded-full bg-white px-3 py-1 text-xs text-slate-600">{tag}</span>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-3 text-xs text-slate-500">
                    <span>{room.memberUserIds.length} members</span>
                    <span>{room.resources?.length || 0} resources</span>
                  </div>
                  {room.visibility === 'private' ? (
                    <Input
                      className="mt-4"
                      placeholder="Access code"
                      value={joinCodes[room.id] || ''}
                      onChange={(event) => setJoinCodes((current) => ({ ...current, [room.id]: event.target.value }))}
                    />
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" className="rounded-xl" onClick={() => void copyLink(room)}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy room link
                    </Button>
                    <Button type="button" className="rounded-xl bg-slate-950 text-white hover:bg-slate-800" onClick={() => void joinRoom(room)} disabled={saving}>
                      Join room
                    </Button>
                    <Button asChild variant="outline" className="rounded-xl">
                      <Link href={room.shareLink || `/docrudians/room/${room.id}`}>Open</Link>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-950">Post to a room</h2>
              {!isAuthenticated ? <span className="text-xs text-slate-500">Login required</span> : null}
            </div>
            <div className="mt-5 grid gap-3">
              <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" value={postForm.roomId} onChange={(event) => setPostForm((current) => ({ ...current, roomId: event.target.value }))}>
                <option value="">Select room</option>
                {featuredRooms.map((room) => (
                  <option key={room.id} value={room.id}>{room.title}</option>
                ))}
              </select>
              <Input placeholder="Update title" value={postForm.title} onChange={(event) => setPostForm((current) => ({ ...current, title: event.target.value }))} />
              <textarea
                className="min-h-[108px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900"
                placeholder="Share a useful update, notes, or room instructions."
                value={postForm.content}
                onChange={(event) => setPostForm((current) => ({ ...current, content: event.target.value }))}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" value={postForm.visibility} onChange={(event) => setPostForm((current) => ({ ...current, visibility: event.target.value as 'public' | 'members' }))}>
                  <option value="public">Visible to room visitors</option>
                  <option value="members">Members only</option>
                </select>
                <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Add images or docs
                  <input type="file" multiple className="hidden" accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.txt" onChange={handleAttachmentInput} />
                </label>
              </div>
              {attachments.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {attachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center gap-3 rounded-[1rem] border border-slate-200 bg-slate-50 p-3">
                      {attachment.type === 'image' ? <ImageIcon className="h-4 w-4 text-sky-600" /> : <FileText className="h-4 w-4 text-violet-600" />}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{attachment.name}</p>
                        <p className="text-xs text-slate-500">{attachment.sizeLabel || 'Attachment'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <Button type="button" className="rounded-xl bg-slate-950 text-white hover:bg-slate-800" onClick={publishUpdate} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                Publish to room
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.8rem] border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">Latest room updates</h2>
          <Button asChild variant="outline" className="rounded-xl">
            <Link href="/workspace?tab=docrudians">Open full rooms workspace</Link>
          </Button>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {latestUpdates.map((post) => {
            const room = featuredRooms.find((item) => item.id === post.roomId);
            return (
              <article key={post.id} className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">{room?.title || 'Room update'}</span>
                  <span className="text-xs text-slate-500">{post.authorName}</span>
                </div>
                <h3 className="mt-3 text-base font-semibold text-slate-950">{post.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{post.content}</p>
              </article>
            );
          })}
        </div>
      </section>
    </PublicSiteChrome>
  );
}
