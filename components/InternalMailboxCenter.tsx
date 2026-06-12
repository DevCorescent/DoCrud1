'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Loader2, Mail, MessageSquare, Plus, Sparkles, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { InternalMailThread, User } from '@/types/document';

type MailboxPayload = {
  threads: InternalMailThread[];
  members: Array<User>;
  currentUserId?: string;
  currentUserEmail?: string;
};

type InternalMailboxCenterProps = {
  onMailboxUpdate?: () => void;
};

export default function InternalMailboxCenter({ onMailboxUpdate }: InternalMailboxCenterProps) {
  const [data, setData] = useState<MailboxPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [activeThreadId, setActiveThreadId] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [composerOpen, setComposerOpen] = useState(true);
  const autoReadThreadIdsRef = useRef<Set<string>>(new Set());

  const syncThreadMeta = async (threadId: string, updates: { status?: 'sent' | 'delivered' | 'read' | 'actioned'; aiSummary?: string; aiActionItems?: string[] }) => {
    await fetch('/api/internal-mailbox', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, ...updates }),
    });
  };

  const load = useCallback(async (options?: { quiet?: boolean; preferredThreadId?: string }) => {
    if (!options?.quiet) {
      setLoading(true);
    }
    setError('');
    try {
      const response = await fetch('/api/internal-mailbox', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to load internal mailbox.');
      }
      setData(payload);
      const nextThreadId = options?.preferredThreadId || activeThreadId;
      if (nextThreadId && payload?.threads?.some((thread: InternalMailThread) => thread.id === nextThreadId)) {
        setActiveThreadId(nextThreadId);
      } else if (payload?.threads?.[0]?.id) {
        setActiveThreadId(payload.threads[0].id);
      } else {
        setActiveThreadId('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load internal mailbox.');
    } finally {
      if (!options?.quiet) {
        setLoading(false);
      }
    }
  }, [activeThreadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeThread = useMemo(
    () => data?.threads?.find((thread) => thread.id === activeThreadId) || data?.threads?.[0] || null,
    [activeThreadId, data?.threads],
  );

  useEffect(() => {
    const unreadFromOthers = activeThread?.messages.some((message) =>
      message.senderId !== data?.currentUserId && !(message.readBy || []).includes((data?.currentUserEmail || '').toLowerCase()),
    );

    if (activeThread?.id && unreadFromOthers && !autoReadThreadIdsRef.current.has(activeThread.id)) {
      autoReadThreadIdsRef.current.add(activeThread.id);
      void syncThreadMeta(activeThread.id, { status: 'read' })
        .then(() => load({ quiet: true, preferredThreadId: activeThread.id }))
        .then(() => onMailboxUpdate?.())
        .catch(() => {
          autoReadThreadIdsRef.current.delete(activeThread.id);
        });
    }
  }, [activeThread?.id, activeThread?.messages, data?.currentUserEmail, data?.currentUserId, load, onMailboxUpdate]);

  const mailboxStats = useMemo(() => {
    const threads = data?.threads || [];
    return {
      awaitingReply: threads.filter((thread) => thread.overallStatus === 'awaiting_reply').length,
      read: threads.filter((thread) => thread.overallStatus === 'read').length,
      actioned: threads.filter((thread) => thread.overallStatus === 'actioned').length,
      total: threads.length,
    };
  }, [data?.threads]);

  const availableRecipients = useMemo(
    () => (data?.members || []).filter((member) => member.id !== data?.currentUserId),
    [data?.currentUserId, data?.members],
  );

  const sendMail = async () => {
    try {
      setBusy(true);
      setError('');
      const response = await fetch('/api/internal-mailbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          body,
          recipientIds: selectedRecipientIds,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to send internal mail.');
      }
      setSubject('');
      setBody('');
      setSelectedRecipientIds([]);
      await load({ quiet: true, preferredThreadId: payload.id });
      onMailboxUpdate?.();
      setActiveThreadId(payload.id);
      setComposerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send internal mail.');
    } finally {
      setBusy(false);
    }
  };

  const replyToThread = async () => {
    if (!activeThread) return;
    try {
      setBusy(true);
      setError('');
      const response = await fetch('/api/internal-mailbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: activeThread.id,
          body: replyBody,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to reply to thread.');
      }
      setReplyBody('');
      await load({ quiet: true, preferredThreadId: payload.id });
      onMailboxUpdate?.();
      setActiveThreadId(payload.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reply to thread.');
    } finally {
      setBusy(false);
    }
  };

  const runAi = async (mode: 'draft' | 'summary') => {
    try {
      setAiBusy(true);
      setError('');
      const response = await fetch('/api/ai/internal-mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          subject: mode === 'draft' ? subject : activeThread?.subject,
          body: mode === 'draft' ? body : activeThread?.messages.map((message) => `${message.senderName}: ${message.body}`).join('\n\n'),
          threadContext: activeThread?.messages.map((message) => `${message.senderName}: ${message.body}`) || [],
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to generate AI output.');
      }

      if (mode === 'draft') {
        setBody(payload.output || body);
      } else {
        setReplyBody(payload.output || replyBody);
        if (activeThread?.id) {
          await syncThreadMeta(activeThread.id, {
            aiSummary: payload.output || '',
            aiActionItems: Array.isArray(payload.bullets) ? payload.bullets : [],
          });
          await load({ quiet: true, preferredThreadId: activeThread.id });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate AI output.');
    } finally {
      setAiBusy(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading internal mailbox...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-white/60 bg-white/84 backdrop-blur">
        <CardHeader className="border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.92))]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl font-medium tracking-tight">
                <Mail className="h-5 w-5" />
                Internal Mailbox
              </CardTitle>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                A full workspace inbox for internal operations, threaded replies, AI summaries, and tracked status across your team.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant={composerOpen ? 'default' : 'outline'} className="rounded-xl" onClick={() => setComposerOpen((prev) => !prev)}>
                <Plus className="mr-2 h-4 w-4" />
                {composerOpen ? 'Hide Composer' : 'New Message'}
              </Button>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => void load()}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Refresh Inbox
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Awaiting reply</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{mailboxStats.awaitingReply}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Read</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{mailboxStats.read}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Actioned</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{mailboxStats.actioned}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Total threads</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{mailboxStats.total}</p>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="space-y-4">
              {composerOpen ? (
                <div className="rounded-[1.8rem] border border-white/70 bg-white/90 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur">
                  <div className="flex items-center gap-2">
                    <Plus className="h-4 w-4 text-slate-700" />
                    <p className="text-sm font-semibold text-slate-950">New internal thread</p>
                  </div>
                  <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" className="mt-4 rounded-2xl" />
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-slate-500" />
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Available recipients</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {availableRecipients.length ? availableRecipients.map((member) => {
                        const selected = selectedRecipientIds.includes(member.id);
                        return (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => setSelectedRecipientIds((current) => selected ? current.filter((id) => id !== member.id) : [...current, member.id])}
                            className={`rounded-2xl border px-3 py-2 text-left text-xs transition ${selected ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700'}`}
                          >
                            <span className="block font-medium">{member.name}</span>
                            <span className={`mt-1 block ${selected ? 'text-slate-300' : 'text-slate-400'}`}>{member.loginId || member.email}</span>
                          </button>
                        );
                      }) : (
                        <p className="text-sm text-slate-500">No other workspace recipients are available yet. Ask the workspace owner to create internal users in Team Workspace.</p>
                      )}
                    </div>
                  </div>
                  <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    className="mt-4 min-h-[180px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none"
                    placeholder="Write an internal operational message..."
                  />
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => void runAi('draft')} disabled={aiBusy || !body.trim()}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      AI improve draft
                    </Button>
                    <Button onClick={() => void sendMail()} disabled={busy || !subject.trim() || !body.trim() || selectedRecipientIds.length === 0}>
                      <ArrowRight className="mr-2 h-4 w-4" />
                      Send message
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="rounded-[1.8rem] border border-white/70 bg-white/90 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Inbox threads</p>
                <div className="mt-4 grid max-h-[calc(100vh-22rem)] gap-3 overflow-auto pr-1">
                  {(data?.threads || []).map((thread) => (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => setActiveThreadId(thread.id)}
                      className={`rounded-2xl border p-4 text-left transition ${activeThread?.id === thread.id ? 'border-slate-950 bg-slate-950 text-white shadow-[0_18px_42px_rgba(15,23,42,0.18)]' : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-300 hover:bg-white'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{thread.subject}</p>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${activeThread?.id === thread.id ? 'bg-white/10 text-white' : 'bg-white text-slate-500'}`}>{thread.overallStatus || 'active'}</span>
                      </div>
                      <p className={`mt-2 text-sm ${activeThread?.id === thread.id ? 'text-slate-300' : 'text-slate-500'}`}>{thread.lastMessagePreview}</p>
                      <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">
                        {thread.participants.map((participant) => participant.name).join(' • ')}
                      </p>
                      {thread.latestAiSummary ? (
                        <p className={`mt-2 text-xs leading-5 ${activeThread?.id === thread.id ? 'text-slate-300' : 'text-slate-500'}`}>AI: {thread.latestAiSummary}</p>
                      ) : null}
                    </button>
                  ))}
                  {(data?.threads || []).length === 0 ? <p className="text-sm text-slate-500">No internal threads yet.</p> : null}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
              {activeThread ? (
                <Card className="overflow-hidden border-white/70 bg-white/92 shadow-[0_22px_52px_rgba(15,23,42,0.08)] backdrop-blur">
                  <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 bg-slate-50/70">
                    <div>
                      <CardTitle className="text-lg font-medium">{activeThread.subject}</CardTitle>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                        {activeThread.participants.map((participant) => participant.name).join(' • ')}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void runAi('summary')} disabled={aiBusy || activeThread.messages.length === 0}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      AI summarize
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4 p-4">
                    {activeThread.latestAiSummary ? (
                      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                        <p className="text-sm font-medium text-sky-950">AI thread summary</p>
                        <p className="mt-2 text-sm leading-6 text-sky-900">{activeThread.latestAiSummary}</p>
                        {activeThread.latestAiActionItems?.length ? (
                          <div className="mt-3 space-y-2">
                            {activeThread.latestAiActionItems.map((item) => (
                              <p key={item} className="text-sm text-sky-900">• {item}</p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="min-h-[420px] max-h-[calc(100vh-25rem)] space-y-3 overflow-y-auto rounded-[1.75rem] bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(241,245,249,0.88))] p-4">
                      {activeThread.messages.map((message) => {
                        const isOwnMessage = message.senderId === data?.currentUserId;
                        return (
                          <div key={message.id} className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[82%] rounded-[1.5rem] border p-4 shadow-sm ${isOwnMessage ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-800'}`}>
                              <div className="flex items-center justify-between gap-3">
                                <p className={`font-medium ${isOwnMessage ? 'text-white' : 'text-slate-900'}`}>{message.senderName}</p>
                                <div className="text-right">
                                  <p className={`text-xs ${isOwnMessage ? 'text-slate-300' : 'text-slate-500'}`}>{new Date(message.createdAt).toLocaleString()}</p>
                                  <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${isOwnMessage ? 'text-slate-300' : 'text-slate-400'}`}>{message.status || 'sent'}</p>
                                </div>
                              </div>
                              <p className={`mt-2 text-sm leading-6 whitespace-pre-wrap ${isOwnMessage ? 'text-slate-100' : 'text-slate-700'}`}>{message.body}</p>
                              <div className={`mt-3 flex flex-wrap gap-2 text-[11px] ${isOwnMessage ? 'text-slate-300' : 'text-slate-500'}`}>
                                <span className={`rounded-full px-2.5 py-1 ${isOwnMessage ? 'bg-white/10' : 'border border-slate-200 bg-slate-50'}`}>Sender: {message.senderName}</span>
                                <span className={`rounded-full px-2.5 py-1 ${isOwnMessage ? 'bg-white/10' : 'border border-slate-200 bg-slate-50'}`}>Receivers: {message.recipientEmails.length}</span>
                                <span className={`rounded-full px-2.5 py-1 ${isOwnMessage ? 'bg-white/10' : 'border border-slate-200 bg-slate-50'}`}>Status: {message.status || 'sent'}</span>
                              </div>
                              {message.aiSummary ? (
                                <p className={`mt-2 text-xs leading-5 ${isOwnMessage ? 'text-slate-200' : 'text-slate-500'}`}>AI summary: {message.aiSummary}</p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
                      <textarea
                        value={replyBody}
                        onChange={(event) => setReplyBody(event.target.value)}
                        className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none"
                        placeholder="Reply in this thread..."
                      />
                      <div className="mt-3 flex flex-wrap gap-3">
                        <Button onClick={() => void replyToThread()} disabled={busy || !replyBody.trim()}>
                          Reply in thread
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void (async () => {
                            await syncThreadMeta(activeThread.id, { status: 'read' });
                            await load();
                            onMailboxUpdate?.();
                          })()}
                          disabled={busy}
                        >
                        Mark read
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void (async () => {
                            await syncThreadMeta(activeThread.id, { status: 'actioned' });
                            await load();
                            onMailboxUpdate?.();
                          })()}
                          disabled={busy}
                        >
                        Mark actioned
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                  No internal threads yet.
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
