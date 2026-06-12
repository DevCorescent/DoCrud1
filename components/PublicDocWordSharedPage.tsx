'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Copy, Download, Loader2, Share2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DocWordBlock, DocWordDocument } from '@/types/document';
import { buildAbsoluteAppUrl } from '@/lib/url';
import { cn } from '@/lib/utils';

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function estimateReadTime(value: string) {
  return Math.max(1, Math.ceil(countWords(value) / 220));
}

function buildHtml(blocks: DocWordBlock[]) {
  return blocks
    .map((block) => {
      if (block.type === 'image') {
        return block.meta?.src
          ? `<figure><img src="${block.meta.src}" alt="${block.meta.alt || 'DocWord image'}" /><figcaption>${block.html || ''}</figcaption></figure>`
          : '';
      }
      if (block.type === 'table') {
        const columns = block.meta?.columns || ['Column 1', 'Column 2'];
        const rows = block.meta?.rows || [['', '']];
        return `<table><thead><tr>${columns.map((column) => `<th>${column}</th>`).join('')}</tr></thead><tbody>${rows
          .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`;
      }
      const tag =
        block.type === 'heading-1'
          ? 'h1'
          : block.type === 'heading-2'
            ? 'h2'
            : block.type === 'heading-3'
              ? 'h3'
              : block.type === 'quote'
                ? 'blockquote'
                : block.type === 'callout'
                  ? 'aside'
                  : 'div';
      return `<${tag}>${block.html || ''}</${tag}>`;
    })
    .join('\n');
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function SharedEditableBlock({
  block,
  onChange,
}: {
  block: DocWordBlock;
  onChange: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (ref.current.innerHTML !== block.html) {
      ref.current.innerHTML = block.html || '';
    }
  }, [block.html]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      className="docword-editable min-h-[36px] rounded-2xl px-3 py-2 text-base leading-7 text-slate-700 outline-none"
      onInput={(event) => onChange((event.currentTarget as HTMLDivElement).innerHTML)}
    />
  );
}

export default function PublicDocWordSharedPage({ token }: { token: string }) {
  const searchParams = useSearchParams();
  const [document, setDocument] = useState<DocWordDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState('');
  const [memberId, setMemberId] = useState('');
  const [memberPassword, setMemberPassword] = useState('');
  const [lockedTitle, setLockedTitle] = useState('Shared document');
  const [needsGroupAccess, setNeedsGroupAccess] = useState(false);
  const [acceptsGroupAccess, setAcceptsGroupAccess] = useState(false);
  const [credentialAccessLabel, setCredentialAccessLabel] = useState('');
  const [credentialPermission, setCredentialPermission] = useState<'read' | 'write' | ''>('');
  const [targetGroupName, setTargetGroupName] = useState('');
  const [inviteGroupName, setInviteGroupName] = useState('');
  const [invitePermission, setInvitePermission] = useState<'read' | 'write'>('read');
  const [joinName, setJoinName] = useState('');
  const [joiningGroup, setJoiningGroup] = useState(false);
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveArmedRef = useRef(false);
  const credentialRef = useRef({
    password: '',
    memberId: '',
    memberPassword: '',
  });

  const groupToken = searchParams?.get('group') || '';
  const inviteToken = searchParams?.get('invite') || '';
  const runtimeAppOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
  const shareUrl = useMemo(() => buildAbsoluteAppUrl(`/docword/shared/${token}`, runtimeAppOrigin), [runtimeAppOrigin, token]);
  const canEdit = useMemo(
    () => Boolean(document && (document.shareMode === 'write' || credentialPermission === 'write')),
    [credentialPermission, document],
  );

  useEffect(() => {
    credentialRef.current = {
      password,
      memberId,
      memberPassword,
    };
  }, [memberId, memberPassword, password]);

  const loadDocument = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const credentials = credentialRef.current;
      const params = new URLSearchParams();
      if (credentials.password.trim()) params.set('password', credentials.password.trim());
      if (credentials.memberId.trim()) params.set('memberId', credentials.memberId.trim());
      if (credentials.memberPassword.trim()) params.set('memberPassword', credentials.memberPassword.trim());
      if (groupToken.trim()) params.set('group', groupToken.trim());
      if (inviteToken.trim()) params.set('invite', inviteToken.trim());
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`/api/public/docword/${token}${query}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to load shared document.');
      if (payload.locked) {
        setLocked(true);
        setLockedTitle(payload.title || 'Shared document');
        setNeedsGroupAccess(Boolean(payload.needsGroupAccess));
        setAcceptsGroupAccess(Boolean(payload.acceptsGroupAccess));
        setCredentialPermission('');
        setCredentialAccessLabel('');
        setTargetGroupName(payload.targetGroupName || '');
        setInviteGroupName(payload.inviteGroupName || '');
        setInvitePermission(payload.invitePermission === 'write' ? 'write' : 'read');
        setDocument(null);
        return;
      }
      setLocked(false);
      setNeedsGroupAccess(false);
      setAcceptsGroupAccess(false);
      setTargetGroupName('');
      setInviteGroupName('');
      setCredentialPermission(payload.credentialAccess?.permission || '');
      setCredentialAccessLabel(
        payload.credentialAccess
          ? `${payload.credentialAccess.groupName} · ${payload.credentialAccess.permission === 'write' ? 'Can edit' : 'Read only'}`
          : '',
      );
      setDocument(payload.document);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to load shared document.');
    } finally {
      setLoading(false);
    }
  }, [groupToken, inviteToken, token]);

  useEffect(() => {
    void loadDocument();
  }, [loadDocument]);

  useEffect(() => {
    autosaveArmedRef.current = false;
  }, [document?.id]);

  const saveSharedDocument = useCallback(async (nextDocument: DocWordDocument) => {
    if (!(nextDocument.shareMode === 'write' || credentialPermission === 'write')) return;
    setSaving(true);
    try {
      const credentials = credentialRef.current;
      const html = buildHtml(nextDocument.blocks);
      const plainText = stripHtml(html);
      const params = new URLSearchParams();
      if (credentials.password.trim()) params.set('password', credentials.password.trim());
      if (credentials.memberId.trim()) params.set('memberId', credentials.memberId.trim());
      if (credentials.memberPassword.trim()) params.set('memberPassword', credentials.memberPassword.trim());
      if (groupToken.trim()) params.set('group', groupToken.trim());
      if (inviteToken.trim()) params.set('invite', inviteToken.trim());
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`/api/public/docword/${token}${query}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: nextDocument.title,
          blocks: nextDocument.blocks,
          html,
          plainText,
          wordCount: countWords(plainText),
          readTimeMinutes: estimateReadTime(plainText),
          saveSource: 'autosave',
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to save shared document.');
      setDocument(payload.document);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to save shared document.');
    } finally {
      setSaving(false);
    }
  }, [credentialPermission, groupToken, inviteToken, token]);

  const joinGroupViaInvite = useCallback(async () => {
    if (!inviteToken.trim() || !memberId.trim() || !memberPassword.trim()) return;
    setJoiningGroup(true);
    setError('');
    try {
      const response = await fetch(`/api/public/docword/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'join-group',
          inviteToken: inviteToken.trim(),
          userId: memberId.trim(),
          name: joinName.trim() || undefined,
          password: memberPassword.trim(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to join collaboration group.');
      await loadDocument();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to join collaboration group.');
    } finally {
      setJoiningGroup(false);
    }
  }, [inviteToken, joinName, loadDocument, memberId, memberPassword, token]);

  useEffect(() => {
    if (!document || !canEdit) return;
    if (!autosaveArmedRef.current) {
      autosaveArmedRef.current = true;
      return;
    }
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      void saveSharedDocument(document);
    }, 900);
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [canEdit, document, saveSharedDocument]);

  const exportDocument = useCallback(async (type: 'pdf' | 'docx') => {
    if (!document) return;
    try {
      const response = await fetch(`/api/docword/export/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: document.title,
          html: buildHtml(document.blocks),
          plainText: document.plainText,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Failed to export ${type.toUpperCase()}.`);
      }
      const blob = await response.blob();
      downloadBlob(blob, `${document.title || 'docword'}.${type === 'pdf' ? 'pdf' : 'docx'}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to export document.');
    }
  }, [document]);

  return (
    <div className="min-h-screen bg-[#f3f7ff] text-slate-950">
      <div className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1380px] items-center justify-between gap-3 px-3 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <ArrowLeft className="h-4 w-4" />
              docrud
            </Link>
            <div className="hidden h-6 w-px bg-slate-200 sm:block" />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.24em] text-sky-500">Shared with DocWord</p>
              <p className="truncate text-sm font-semibold text-slate-950 sm:text-base">{document?.title || 'Shared document'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="h-10 rounded-2xl border-slate-200 bg-white px-4" onClick={() => void navigator.clipboard.writeText(shareUrl)}>
              <Copy className="mr-2 h-4 w-4" />
              Copy link
            </Button>
            <Button type="button" className="h-10 rounded-2xl bg-slate-950 px-4 text-white hover:bg-slate-800" onClick={() => void exportDocument('pdf')}>
              <Download className="mr-2 h-4 w-4" />
              PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1380px] px-3 py-4 sm:px-5">
        {loading ? (
          <div className="flex min-h-[70vh] items-center justify-center rounded-[2rem] border border-white/80 bg-white/80">
            <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
          </div>
        ) : error ? (
          <div className="rounded-[2rem] border border-rose-200 bg-white p-6 text-sm text-rose-600">{error}</div>
        ) : locked ? (
          <div className="mx-auto max-w-xl rounded-[2rem] border border-amber-200 bg-white p-6 text-center">
            <p className="text-[11px] uppercase tracking-[0.24em] text-amber-600">{needsGroupAccess ? 'Group DocWord access' : 'Secure DocWord share'}</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{lockedTitle}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {needsGroupAccess
                ? 'This document is shared through a collaboration group. Enter the assigned user ID and password to continue.'
                : 'This shared document is protected. Enter the password to unlock the live view.'}
            </p>
            {targetGroupName ? (
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-sky-600">{targetGroupName} access</p>
            ) : null}
            <div className="mt-5 grid gap-3">
              {!needsGroupAccess ? (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    value={password}
                    onChange={(event) => setPassword(event.target.value.toUpperCase())}
                    placeholder="Enter document password"
                    className="h-11 rounded-2xl border-amber-200 bg-white"
                  />
                  <Button type="button" className="h-11 rounded-2xl bg-slate-950 px-5 text-white hover:bg-slate-800" onClick={() => void loadDocument()}>
                    Unlock
                  </Button>
                </div>
              ) : null}
              {acceptsGroupAccess || needsGroupAccess ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    value={memberId}
                    onChange={(event) => setMemberId(event.target.value)}
                    placeholder="Assigned user ID"
                    className="h-11 rounded-2xl border-slate-200 bg-white"
                  />
                  <Input
                    value={memberPassword}
                    onChange={(event) => setMemberPassword(event.target.value)}
                    placeholder="Assigned password"
                    className="h-11 rounded-2xl border-slate-200 bg-white"
                  />
                  <Button type="button" className="h-11 rounded-2xl bg-slate-950 px-5 text-white hover:bg-slate-800 sm:col-span-2" onClick={() => void loadDocument()}>
                    Open with group access
                  </Button>
                </div>
              ) : null}
              {inviteToken ? (
                <div className="rounded-[1.4rem] border border-sky-200 bg-sky-50 p-4 text-left">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-600">
                    Join {inviteGroupName || 'collaboration group'}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Create your own DocWord member ID and password. This invite will grant {invitePermission === 'write' ? 'editing' : 'read'} access to the document.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Input
                      value={joinName}
                      onChange={(event) => setJoinName(event.target.value)}
                      placeholder="Your name"
                      className="h-11 rounded-2xl border-slate-200 bg-white"
                    />
                    <Input
                      value={memberId}
                      onChange={(event) => setMemberId(event.target.value)}
                      placeholder="Create your user ID"
                      className="h-11 rounded-2xl border-slate-200 bg-white"
                    />
                    <Input
                      value={memberPassword}
                      onChange={(event) => setMemberPassword(event.target.value)}
                      placeholder="Create your password"
                      className="h-11 rounded-2xl border-slate-200 bg-white sm:col-span-2"
                    />
                    <Button
                      type="button"
                      className="h-11 rounded-2xl bg-slate-950 px-5 text-white hover:bg-slate-800 sm:col-span-2"
                      onClick={() => void joinGroupViaInvite()}
                      disabled={joiningGroup || !memberId.trim() || !memberPassword.trim()}
                    >
                      {joiningGroup ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Join group and open document
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : !document ? (
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-sm text-slate-500">This shared document is unavailable.</div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="rounded-[2rem] border border-white/80 bg-white/90 p-4 sm:p-6">
              {canEdit ? (
                <Input
                  value={document.title}
                  onChange={(event) => setDocument((current) => (current ? { ...current, title: event.target.value } : current))}
                  className="h-auto border-0 px-0 text-[1.8rem] font-semibold tracking-[-0.05em] text-slate-950 shadow-none focus-visible:ring-0 sm:text-[2.3rem]"
                />
              ) : (
                <h1 className="text-[1.8rem] font-semibold tracking-[-0.05em] text-slate-950 sm:text-[2.3rem]">{document.title}</h1>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{document.wordCount} words</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{document.readTimeMinutes} min read</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{canEdit ? 'Collaborative link' : 'Read-only link'}</span>
                {credentialAccessLabel ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{credentialAccessLabel}</span> : null}
                {saving ? <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-600">Saving...</span> : null}
              </div>

              <div className="mt-6 space-y-4">
                {document.blocks.map((block) => (
                  <article key={block.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
                    {block.type === 'image' ? (
                      <div className="space-y-3">
                        {block.meta?.src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={block.meta.src} alt={block.meta.alt || 'DocWord image'} className="max-h-[360px] w-full rounded-[1.2rem] object-cover" />
                        ) : null}
                        {canEdit ? (
                          <Input
                            value={block.meta?.src || ''}
                            onChange={(event) =>
                              setDocument((current) =>
                                current
                                  ? {
                                      ...current,
                                      blocks: current.blocks.map((item) =>
                                        item.id === block.id ? { ...item, meta: { ...(item.meta || {}), src: event.target.value } } : item,
                                      ),
                                    }
                                  : current,
                              )
                            }
                            placeholder="Image URL"
                            className="h-11 rounded-2xl border-slate-200 bg-white"
                          />
                        ) : null}
                        <p className="text-sm leading-6 text-slate-600">{block.html}</p>
                      </div>
                    ) : block.type === 'table' ? (
                      <div className="overflow-hidden rounded-[1.1rem] border border-slate-200">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-100 text-slate-700">
                            <tr>
                              {(block.meta?.columns || []).map((column) => (
                                <th key={column} className="px-4 py-3 font-semibold">{column}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="bg-white text-slate-600">
                            {(block.meta?.rows || []).map((row, rowIndex) => (
                              <tr key={`${block.id}-row-${rowIndex}`} className="border-t border-slate-200">
                                {row.map((cell, cellIndex) => (
                                  <td key={`${block.id}-cell-${rowIndex}-${cellIndex}`} className="px-4 py-3">{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : canEdit ? (
                      <SharedEditableBlock
                        block={block}
                        onChange={(html) =>
                          setDocument((current) =>
                            current
                              ? {
                                  ...current,
                                  blocks: current.blocks.map((item) =>
                                    item.id === block.id ? { ...item, html, text: stripHtml(html) } : item,
                                  ),
                                }
                              : current,
                          )
                        }
                      />
                    ) : (
                      <div className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: block.html || '' }} />
                    )}
                  </article>
                ))}
              </div>
            </section>

            <aside className="rounded-[2rem] border border-white/80 bg-white/90 p-4 sm:p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-sky-500">Shared access</p>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-slate-950">
                {canEdit ? 'Live collaborative draft' : 'Read-ready document'}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {canEdit
                  ? 'Edits save back to the source document automatically through this link.'
                  : 'This document is shared for viewing only. Export or copy the link as needed.'}
              </p>

              <div className="mt-4 rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-slate-900">
                  <Sparkles className="h-4 w-4 text-sky-500" />
                  <p className="text-sm font-semibold">Quick actions</p>
                </div>
                <div className="mt-3 space-y-2">
                  <Button type="button" variant="outline" className="h-10 w-full justify-start rounded-2xl border-slate-200 bg-white" onClick={() => void navigator.clipboard.writeText(shareUrl)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy share link
                  </Button>
                  <Button type="button" variant="outline" className="h-10 w-full justify-start rounded-2xl border-slate-200 bg-white" onClick={() => void exportDocument('docx')}>
                    <Download className="mr-2 h-4 w-4" />
                    Download DOCX
                  </Button>
                  <Button type="button" className="h-10 w-full justify-start rounded-2xl bg-slate-950 text-white hover:bg-slate-800" asChild>
                    <Link href="/docword">
                      <Share2 className="mr-2 h-4 w-4" />
                      Open DocWord
                    </Link>
                  </Button>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
