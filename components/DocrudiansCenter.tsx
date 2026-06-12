'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { ArrowRight, Copy, FileText, ImageIcon, Loader2, Lock, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DocrudianAttachment, DocrudiansWorkspaceData } from '@/types/document';

const emptyRoomForm = {
  title: '',
  description: '',
  category: 'developers',
  visibility: 'public' as 'public' | 'private',
  tags: '',
  accessCode: '',
};

const emptyUpdateForm = {
  roomId: '',
  title: '',
  content: '',
  visibility: 'public' as 'public' | 'members',
};

export default function DocrudiansCenter() {
  const [data, setData] = useState<DocrudiansWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [roomForm, setRoomForm] = useState(emptyRoomForm);
  const [updateForm, setUpdateForm] = useState(emptyUpdateForm);
  const [attachments, setAttachments] = useState<DocrudianAttachment[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/docrudians', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to load Docrudians rooms.');
      const typed = payload as DocrudiansWorkspaceData;
      setData(typed);
      setUpdateForm((current) => ({ ...current, roomId: current.roomId || typed.circles[0]?.id || '' }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load Docrudians rooms.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createRoom = async () => {
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
            featureFlags: ['resources', 'invite_link', 'compression', 'announcements', 'submissions'],
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to create room.');
      setRoomForm(emptyRoomForm);
      setMessage('Room created successfully.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create room.');
    } finally {
      setSaving(false);
    }
  };

  const postUpdate = async () => {
    try {
      setSaving(true);
      setMessage('');
      const response = await fetch('/api/docrudians', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'post',
          data: {
            ...updateForm,
            attachments,
            category: 'showcase',
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to post update.');
      setUpdateForm((current) => ({ ...emptyUpdateForm, roomId: current.roomId }));
      setAttachments([]);
      setMessage('Room update posted.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to post update.');
    } finally {
      setSaving(false);
    }
  };

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

  const copyLink = async (roomId: string, shareLink?: string) => {
    const link = typeof window !== 'undefined' ? `${window.location.origin}${shareLink || `/docrudians/room/${roomId}`}` : shareLink || '';
    await navigator.clipboard.writeText(link);
    setMessage('Room link copied.');
  };

  const myRooms = useMemo(() => data?.circles || [], [data?.circles]);
  const recentUpdates = useMemo(() => data?.posts?.slice(0, 10) || [], [data?.posts]);

  if (loading) {
    return (
      <div className="rounded-[1.6rem] border border-slate-200 bg-white p-10 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {message ? <div className="rounded-[1.1rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{message}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Rooms', value: data?.stats.circles || 0 },
          { label: 'Public', value: data?.stats.publicRooms || 0 },
          { label: 'Private', value: data?.stats.privateRooms || 0 },
          { label: 'Resources', value: data?.stats.sharedResources || 0 },
          { label: 'Updates', value: data?.stats.posts || 0 },
        ].map((item) => (
          <div key={item.label} className="rounded-[1.35rem] border border-slate-200 bg-white p-5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{item.value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="rooms" className="w-full space-y-4">
        <TabsList className="grid w-full grid-cols-3 rounded-2xl bg-slate-100 p-1">
          <TabsTrigger value="rooms" className="rounded-xl text-xs sm:text-sm">Rooms</TabsTrigger>
          <TabsTrigger value="create" className="rounded-xl text-xs sm:text-sm">Create</TabsTrigger>
          <TabsTrigger value="updates" className="rounded-xl text-xs sm:text-sm">Updates</TabsTrigger>
        </TabsList>

        <TabsContent value="rooms" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            {myRooms.map((room) => (
              <div key={room.id} className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">{room.category}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${room.visibility === 'private' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{room.visibility}</span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-slate-950">{room.title}</h3>
                  </div>
                  {room.visibility === 'private' ? <Lock className="h-4 w-4 text-amber-600" /> : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{room.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(room.tags || []).slice(0, 4).map((tag) => (
                    <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{tag}</span>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
                  <span>{room.memberUserIds.length} members</span>
                  <span>{room.resources?.length || 0} resources</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => void copyLink(room.id, room.shareLink)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy link
                  </Button>
                  <Button asChild variant="outline" className="rounded-xl">
                    <a href={room.shareLink || `/docrudians/room/${room.id}`} target="_blank" rel="noreferrer">
                      Open room
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="create" className="space-y-4">
          <div className="grid gap-5 xl:grid-cols-[0.78fr_1.22fr]">
            <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5">
              <div className="grid gap-3">
                <Input placeholder="Room title" value={roomForm.title} onChange={(event) => setRoomForm((current) => ({ ...current, title: event.target.value }))} />
                <textarea className="min-h-[110px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900" placeholder="What will this room be used for?" value={roomForm.description} onChange={(event) => setRoomForm((current) => ({ ...current, description: event.target.value }))} />
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
                {roomForm.visibility === 'private' ? <Input placeholder="Private access code" value={roomForm.accessCode} onChange={(event) => setRoomForm((current) => ({ ...current, accessCode: event.target.value }))} /> : null}
                <Button type="button" className="rounded-xl bg-slate-950 text-white hover:bg-slate-800" disabled={saving} onClick={createRoom}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Create room
                </Button>
              </div>
            </section>

            <section className="rounded-[1.6rem] border border-slate-200 bg-[linear-gradient(180deg,#0f172a,#111827)] p-5 text-white">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/50">Why rooms work better</p>
              <div className="mt-4 grid gap-3">
                {[
                  'Use one link to bring people into a shared space.',
                  'Keep docs, images, notes, and updates tied to the same room.',
                  'Run private rooms for events, colleges, and internal teams.',
                  'Ship public rooms for dev communities, launches, and open resources.',
                ].map((item) => (
                  <div key={item} className="rounded-[1rem] border border-white/10 bg-white/10 px-4 py-3 text-sm text-white/80">
                    {item}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="updates" className="space-y-4">
          <div className="grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
            <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5">
              <div className="grid gap-3">
                <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" value={updateForm.roomId} onChange={(event) => setUpdateForm((current) => ({ ...current, roomId: event.target.value }))}>
                  <option value="">Select room</option>
                  {myRooms.map((room) => (
                    <option key={room.id} value={room.id}>{room.title}</option>
                  ))}
                </select>
                <Input placeholder="Update title" value={updateForm.title} onChange={(event) => setUpdateForm((current) => ({ ...current, title: event.target.value }))} />
                <textarea className="min-h-[110px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900" placeholder="Share room updates, context, or fresh resources." value={updateForm.content} onChange={(event) => setUpdateForm((current) => ({ ...current, content: event.target.value }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" value={updateForm.visibility} onChange={(event) => setUpdateForm((current) => ({ ...current, visibility: event.target.value as 'public' | 'members' }))}>
                    <option value="public">Public</option>
                    <option value="members">Members only</option>
                  </select>
                  <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Add files
                    <input type="file" multiple className="hidden" accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.txt" onChange={handleAttachmentInput} />
                  </label>
                </div>
                {attachments.length ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {attachments.map((attachment) => (
                      <div key={attachment.id} className="flex items-center gap-3 rounded-[1rem] bg-slate-50 p-3">
                        {attachment.type === 'image' ? <ImageIcon className="h-4 w-4 text-sky-600" /> : <FileText className="h-4 w-4 text-violet-600" />}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{attachment.name}</p>
                          <p className="text-xs text-slate-500">{attachment.sizeLabel || 'Attachment'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <Button type="button" className="rounded-xl bg-slate-950 text-white hover:bg-slate-800" disabled={saving} onClick={postUpdate}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                  Publish update
                </Button>
              </div>
            </section>

            <section className="space-y-3">
              {recentUpdates.length ? recentUpdates.map((post) => {
                const room = myRooms.find((item) => item.id === post.roomId);
                return (
                  <div key={post.id} className="rounded-[1.2rem] border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{post.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{room?.title || 'Room update'} · {post.authorName}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">{post.visibility}</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{post.content}</p>
                  </div>
                );
              }) : (
                <div className="rounded-[1.2rem] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                  No room updates yet. Publish the first one from this tab.
                </div>
              )}
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
