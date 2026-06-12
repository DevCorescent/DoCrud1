'use client';

import Image from 'next/image';
import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, CalendarClock, CheckCircle2, CircleDot, Clock3, Copy, KeyRound, Loader2, Mail, MessageCircle, Plus, ShieldCheck, TimerReset, Upload, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buildAbsoluteAppUrl, buildQrImageUrl } from '@/lib/url';
import type { DealRoom, DealRoomParticipant, DealRoomStage, DealRoomSummary } from '@/types/document';

type BoardRoomPayload = {
  rooms: DealRoom[];
  summary: DealRoomSummary;
  participantOptions: Array<{ id: string; name: string; email: string; role: string }>;
  assetOptions: Array<{ assetType: 'document' | 'transfer' | 'sheet'; assetId: string; title: string; subtitle?: string; href?: string }>;
  currentUserId: string;
  currentUserRole: string;
  boardRoomOnly: boolean;
};

type MeetingWorkspaceBoardRoomHandoff = {
  title?: string;
  summary?: string;
  actions?: string[];
  transcript?: string;
  agenda?: string[];
  createdAt?: string;
};

const stageOptions: Array<{ value: DealRoomStage; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'shared', label: 'Shared' },
  { value: 'under_review', label: 'Under review' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'approval', label: 'Approval' },
  { value: 'signed', label: 'Signed' },
  { value: 'closed', label: 'Closed' },
];

const roomTypeOptions = [
  { value: 'sales', label: 'Sales deal' },
  { value: 'vendor', label: 'Vendor negotiation' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'fundraise', label: 'Fundraise' },
  { value: 'hiring', label: 'Hiring' },
  { value: 'custom', label: 'Custom workflow' },
] as const;

function getCountdownMeta(targetCloseDate?: string) {
  if (!targetCloseDate) {
    return { label: 'No deadline', tone: 'slate' as const, daysLeft: null as number | null };
  }
  const daysLeft = Math.ceil((new Date(targetCloseDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (daysLeft <= 0) {
    return { label: 'Due now', tone: 'rose' as const, daysLeft };
  }
  if (daysLeft <= 2) {
    return { label: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`, tone: 'rose' as const, daysLeft };
  }
  if (daysLeft <= 5) {
    return { label: `${daysLeft} days left`, tone: 'amber' as const, daysLeft };
  }
  return { label: `${daysLeft} days left`, tone: 'emerald' as const, daysLeft };
}

function toneClasses(tone: 'slate' | 'amber' | 'rose' | 'emerald') {
  if (tone === 'rose') return 'border-rose-200 bg-rose-50 text-rose-900';
  if (tone === 'amber') return 'border-amber-200 bg-amber-50 text-amber-900';
  if (tone === 'emerald') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  return 'border-slate-200 bg-slate-50 text-slate-900';
}

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Failed to read the selected file.'));
  reader.readAsDataURL(file);
});

export default function DealRoomCenter() {
  const [payload, setPayload] = useState<BoardRoomPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [viewTab, setViewTab] = useState('pipeline');
  const [roomTab, setRoomTab] = useState('overview');
  const [activeRoomId, setActiveRoomId] = useState('');
  const [createDraft, setCreateDraft] = useState({
    title: '',
    summary: '',
    counterpartyName: '',
    roomType: 'sales',
    targetCloseDate: '',
  });
  const [participantDraft, setParticipantDraft] = useState({
    mode: 'internal',
    userId: '',
    name: '',
    email: '',
    companyName: '',
    accessLevel: 'editor',
  });
  const [roomUserDraft, setRoomUserDraft] = useState({
    name: '',
    loginId: '',
    password: '',
    accessLevel: 'viewer',
  });
  const [signDocumentDraft, setSignDocumentDraft] = useState({
    title: '',
    recipientName: '',
    recipientEmail: '',
    requiredDocumentsText: '',
    shareAccessPolicy: 'standard',
    expiryDays: '7',
    maxAccessCount: '1',
    fileName: '',
    mimeType: 'application/pdf',
    dataUrl: '',
  });
  const [assetSelection, setAssetSelection] = useState('');
  const [taskDraft, setTaskDraft] = useState({
    title: '',
    description: '',
    dueAt: '',
    ownerId: '',
  });
  const [messageDraft, setMessageDraft] = useState('');
  const [messageVisibility, setMessageVisibility] = useState<'all_participants' | 'internal_only'>('all_participants');
  const [noteDraft, setNoteDraft] = useState('');
  const [meetingImportReady, setMeetingImportReady] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/deal-rooms', { cache: 'no-store' });
      const nextPayload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(nextPayload?.error || 'Unable to load board rooms.');
      setPayload(nextPayload);
      setActiveRoomId((current) => current || nextPayload.rooms?.[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load board rooms.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading || typeof window === 'undefined' || meetingImportReady) return;
    const savedHandoff = window.localStorage.getItem('docrud.meeting-handoff.board-room');
    if (!savedHandoff) return;

    try {
      const handoff = JSON.parse(savedHandoff) as MeetingWorkspaceBoardRoomHandoff;
      const summarySections = [
        handoff.summary?.trim() || '',
        handoff.agenda?.length ? `Agenda\n${handoff.agenda.filter(Boolean).map((item) => `• ${item}`).join('\n')}` : '',
        handoff.actions?.length ? `Next actions\n${handoff.actions.filter(Boolean).map((item) => `• ${item}`).join('\n')}` : '',
      ].filter(Boolean);

      setCreateDraft((current) => ({
        ...current,
        title: handoff.title?.trim() ? `${handoff.title.trim()} Board Room` : current.title,
        summary: summarySections.join('\n\n') || current.summary,
        roomType: current.roomType === 'sales' ? 'partnership' : current.roomType,
      }));
      setNoteDraft(handoff.transcript?.trim() || handoff.summary?.trim() || '');
      setViewTab('create');
      setSuccess('Meeting recap imported. Review the draft below and launch the board room when ready.');
      setMeetingImportReady(true);
    } catch {
      setError('Unable to import the meeting recap into Board Room.');
    } finally {
      window.localStorage.removeItem('docrud.meeting-handoff.board-room');
    }
  }, [loading, meetingImportReady]);

  const activeRoom = useMemo(
    () => payload?.rooms.find((room) => room.id === activeRoomId) || payload?.rooms[0] || null,
    [activeRoomId, payload?.rooms]
  );

  const activeParticipant = useMemo(
    () => activeRoom?.participants.find((participant) => participant.userId === payload?.currentUserId) || null,
    [activeRoom, payload?.currentUserId]
  );

  const canManageRoom = useMemo(() => {
    if (!payload || !activeRoom) return false;
    if (payload.currentUserRole === 'admin' || payload.currentUserRole === 'client') return true;
    return activeParticipant?.roleType === 'owner' || activeParticipant?.accessLevel === 'approver';
  }, [activeParticipant, activeRoom, payload]);

  const canEditRoom = canManageRoom || activeParticipant?.accessLevel === 'editor';
  const canSendInternalMessage = Boolean(payload && (payload.currentUserRole === 'admin' || payload.currentUserRole === 'client' || activeParticipant?.roleType === 'owner' || activeParticipant?.roleType === 'internal'));
  const countdown = getCountdownMeta(activeRoom?.targetCloseDate);
  const isRoomCreator = Boolean(activeRoom && payload && (payload.currentUserRole === 'admin' || activeRoom.ownerUserId === payload.currentUserId));
  const absoluteShareUrl = useMemo(() => {
    if (!activeRoom?.shareUrl) return '';
    return buildAbsoluteAppUrl(activeRoom.shareUrl, typeof window !== 'undefined' ? window.location.origin : undefined);
  }, [activeRoom?.shareUrl]);
  const shareMessage = useMemo(() => {
    if (!activeRoom) return '';
    return `Join the board room "${activeRoom.title}" on docrud.\nOpen: ${absoluteShareUrl}\nAsk the room creator for the board room password.`;
  }, [absoluteShareUrl, activeRoom]);
  const whatsappShareUrl = useMemo(
    () => `https://wa.me/?text=${encodeURIComponent(shareMessage)}`,
    [shareMessage],
  );
  const emailShareUrl = useMemo(
    () => `mailto:?subject=${encodeURIComponent(`Board Room Invite: ${activeRoom?.title || 'docrud'}`)}&body=${encodeURIComponent(shareMessage)}`,
    [activeRoom?.title, shareMessage],
  );
  const qrCodeUrl = useMemo(
    () => activeRoom?.shareUrl ? buildQrImageUrl(activeRoom.shareUrl, typeof window !== 'undefined' ? window.location.origin : undefined, 220) : '',
    [activeRoom?.shareUrl],
  );
  const boardRoomSigningPacket = useMemo(() => {
    if (!activeRoom) return '';
    const lines = [
      `Board Room: ${activeRoom.title}`,
      `Board Room Link: ${absoluteShareUrl}`,
      `Board Room Password: ${activeRoom.joinPassword}`,
      '',
      'Signing checklist:',
    ];

    if (!activeRoom.signDocuments.length) {
      lines.push('No signable documents added yet.');
    } else {
      activeRoom.signDocuments.forEach((document, index) => {
        lines.push(
          `${index + 1}. ${document.title}`,
          `   Link: ${buildAbsoluteAppUrl(document.shareUrl, typeof window !== 'undefined' ? window.location.origin : undefined)}`,
          `   Password: ${document.sharePassword}`,
          `   Status: ${document.status.replace(/_/g, ' ')}`,
          ...(document.requiredDocuments.length ? [`   Required docs before signing: ${document.requiredDocuments.join(', ')}`] : []),
        );
      });
    }

    lines.push('', 'Share the Board Room password and document passwords only with approved recipients.');
    return lines.join('\n');
  }, [absoluteShareUrl, activeRoom]);
  const boardRoomPacketWhatsappUrl = useMemo(
    () => `https://wa.me/?text=${encodeURIComponent(boardRoomSigningPacket)}`,
    [boardRoomSigningPacket],
  );
  const boardRoomPacketEmailUrl = useMemo(
    () => `mailto:?subject=${encodeURIComponent(`Board Room Signing Packet: ${activeRoom?.title || 'docrud'}`)}&body=${encodeURIComponent(boardRoomSigningPacket)}`,
    [activeRoom?.title, boardRoomSigningPacket],
  );

  const patchRoom = async (body: Record<string, unknown>, successMessage?: string) => {
    if (!activeRoom) return;
    try {
      setBusy(true);
      setError('');
      setSuccess('');
      const response = await fetch('/api/deal-rooms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: activeRoom.id, ...body }),
      });
      const nextPayload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(nextPayload?.error || 'Unable to update the board room.');
      if (successMessage) setSuccess(successMessage);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update the board room.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateRoom = async () => {
    try {
      setBusy(true);
      setError('');
      setSuccess('');
      const response = await fetch('/api/deal-rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createDraft),
      });
      const nextPayload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(nextPayload?.error || 'Unable to create board room.');
      setSuccess('Board room created. Share the room link and password when you are ready to bring people in.');
      setCreateDraft({ title: '', summary: '', counterpartyName: '', roomType: 'sales', targetCloseDate: '' });
      await load();
      setActiveRoomId(nextPayload.id);
      setViewTab('workspace');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create board room.');
    } finally {
      setBusy(false);
    }
  };

  const addParticipant = async () => {
    const selectedUser = payload?.participantOptions.find((entry) => entry.id === participantDraft.userId);
    const participant: Partial<DealRoomParticipant> =
      participantDraft.mode === 'internal' && selectedUser
        ? {
            userId: selectedUser.id,
            name: selectedUser.name,
            email: selectedUser.email,
            roleType: 'internal',
            accessLevel: participantDraft.accessLevel as 'viewer' | 'editor' | 'approver',
          }
        : {
            name: participantDraft.name.trim(),
            email: participantDraft.email.trim(),
            companyName: participantDraft.companyName.trim(),
            roleType: 'external',
            accessLevel: participantDraft.accessLevel as 'viewer' | 'editor' | 'approver',
          };

    await patchRoom({ action: 'add_participant', participant }, 'Participant added to the board room and notified through their workspace.');
    setParticipantDraft({ mode: 'internal', userId: '', name: '', email: '', companyName: '', accessLevel: 'editor' });
  };

  const createRoomUser = async () => {
    try {
      setBusy(true);
      setError('');
      setSuccess('');
      const response = await fetch('/api/deal-rooms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: activeRoom?.id,
          action: 'create_room_user',
          roomUser: roomUserDraft,
        }),
      });
      const nextPayload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(nextPayload?.error || 'Unable to create board room user.');
      setSuccess(`Board room login created. Username: ${nextPayload?.user?.loginId}. Password: ${nextPayload?.password}`);
      setRoomUserDraft({ name: '', loginId: '', password: '', accessLevel: 'viewer' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create board room user.');
    } finally {
      setBusy(false);
    }
  };

  const addLinkedAsset = async () => {
    if (!assetSelection) return;
    const asset = payload?.assetOptions.find((entry) => `${entry.assetType}:${entry.assetId}` === assetSelection);
    if (!asset) return;
    await patchRoom({ action: 'add_asset', asset }, 'Linked asset added to the board room.');
    setAssetSelection('');
  };

  const addTask = async () => {
    const owner = payload?.participantOptions.find((entry) => entry.id === taskDraft.ownerId);
    await patchRoom(
      {
        action: 'add_task',
        task: {
          title: taskDraft.title.trim(),
          description: taskDraft.description.trim(),
          dueAt: taskDraft.dueAt || undefined,
          ownerId: owner?.id,
          ownerName: owner?.name,
        },
      },
      'Task added and visible to the assigned board room participant.',
    );
    setTaskDraft({ title: '', description: '', dueAt: '', ownerId: '' });
  };

  const addMessage = async () => {
    await patchRoom(
      {
        action: 'add_message',
        message: messageDraft,
        visibility: messageVisibility,
      },
      messageVisibility === 'internal_only' ? 'Secure internal message sent.' : 'Board room message sent.',
    );
    setMessageDraft('');
    setMessageVisibility('all_participants');
  };

  const addSignDocument = async () => {
    try {
      setBusy(true);
      setError('');
      setSuccess('');
      const response = await fetch('/api/deal-rooms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: activeRoom?.id,
          action: 'add_sign_document',
          signDocument: {
            title: signDocumentDraft.title.trim(),
            fileName: signDocumentDraft.fileName,
            mimeType: signDocumentDraft.mimeType,
            dataUrl: signDocumentDraft.dataUrl,
            recipientName: signDocumentDraft.recipientName.trim() || undefined,
            recipientEmail: signDocumentDraft.recipientEmail.trim() || undefined,
            requiredDocuments: signDocumentDraft.requiredDocumentsText.split(',').map((item) => item.trim()).filter(Boolean),
            shareAccessPolicy: signDocumentDraft.shareAccessPolicy,
            expiryDays: signDocumentDraft.shareAccessPolicy === 'expiring' ? Number(signDocumentDraft.expiryDays || 7) : undefined,
            maxAccessCount: signDocumentDraft.shareAccessPolicy === 'one_time' ? Number(signDocumentDraft.maxAccessCount || 1) : undefined,
          },
        }),
      });
      const nextPayload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(nextPayload?.error || 'Unable to add a sign document.');
      setSuccess('Signable board room document added with protected sharing and signing flow.');
      setSignDocumentDraft({
        title: '',
        recipientName: '',
        recipientEmail: '',
        requiredDocumentsText: '',
        shareAccessPolicy: 'standard',
        expiryDays: '7',
        maxAccessCount: '1',
        fileName: '',
        mimeType: 'application/pdf',
        dataUrl: '',
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add a sign document.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignDocumentUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setSignDocumentDraft((prev) => ({
        ...prev,
        title: prev.title || file.name.replace(/\.pdf$/i, ''),
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
        dataUrl,
      }));
      setSuccess('Board room sign document uploaded and ready for checklist settings.');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to read the selected file.');
    } finally {
      event.target.value = '';
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setSuccess(`${label} copied.`);
    } catch {
      setError(`Unable to copy ${label.toLowerCase()} right now.`);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading board rooms...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={viewTab} onValueChange={setViewTab} className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/70 bg-white/75 shadow-[0_14px_30px_rgba(148,163,184,0.10)] backdrop-blur-xl">
              <BriefcaseBusiness className="h-5 w-5 text-slate-900" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-tight text-slate-950">Board Room</p>
              <p className="text-xs text-slate-500">{payload?.rooms.length || 0} rooms</p>
            </div>
          </div>

          <TabsList className="grid h-auto grid-cols-3 rounded-2xl border border-white/70 bg-white/75 p-1 shadow-[0_18px_44px_rgba(148,163,184,0.10)] backdrop-blur-xl sm:w-[420px]">
            <TabsTrigger value="pipeline" className="rounded-xl text-xs sm:text-sm">Pipeline</TabsTrigger>
            <TabsTrigger value="workspace" className="rounded-xl text-xs sm:text-sm">Active</TabsTrigger>
            <TabsTrigger value="create" className="rounded-xl text-xs sm:text-sm">Create</TabsTrigger>
          </TabsList>
        </div>

	        <TabsContent value="pipeline" className="space-y-5">
	          <Card className="border-white/60 bg-white/82 backdrop-blur">
	            <CardContent className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-7">
	              {stageOptions.map((stage) => (
	                <button
	                  key={stage.value}
	                  type="button"
                  onClick={() => {
                    const room = payload?.rooms.find((entry) => entry.stage === stage.value);
                    if (room) {
                      setActiveRoomId(room.id);
                      setViewTab('workspace');
                    }
                  }}
                  className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-slate-300 hover:bg-white"
	                >
	                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{stage.label}</p>
	                  <p className="mt-2 text-2xl font-semibold text-slate-950">
	                    {payload?.summary.stageDistribution.find((entry) => entry.stage === stage.value)?.count || 0}
	                  </p>
	                </button>
	              ))}
	            </CardContent>
	          </Card>

	          <Card className="border-white/60 bg-white/82 backdrop-blur">
	            <CardContent className="space-y-3 p-5">
	              {payload?.rooms.length ? payload.rooms.map((room) => {
	                const roomCountdown = getCountdownMeta(room.targetCloseDate);
	                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => {
                      setActiveRoomId(room.id);
                      setViewTab('workspace');
                    }}
                    className={`block w-full rounded-3xl border p-4 text-left transition ${activeRoom?.id === room.id ? 'border-slate-900 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold">{room.title}</p>
                        <p className={`mt-1 text-sm ${activeRoom?.id === room.id ? 'text-white/70' : 'text-slate-500'}`}>{room.counterpartyName}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] ${activeRoom?.id === room.id ? 'bg-white/10 text-white' : 'bg-white text-slate-600'}`}>
                          {room.stage.replace(/_/g, ' ')}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${activeRoom?.id === room.id ? 'border-white/20 text-white' : toneClasses(roomCountdown.tone)}`}>
                          {roomCountdown.label}
                        </span>
                      </div>
                    </div>
                    <div className={`mt-4 grid gap-2 text-xs ${activeRoom?.id === room.id ? 'text-white/70 md:grid-cols-4' : 'text-slate-500 md:grid-cols-4'}`}>
                      <span>{room.linkedAssets.length} assets</span>
                      <span>{room.tasks.filter((task) => task.status !== 'done').length} open tasks</span>
                      <span>{room.participants.length} participants</span>
                      <span>{room.accessRequests.filter((request) => request.status === 'pending').length} pending requests</span>
                    </div>
                  </button>
                );
              }) : <p className="text-sm text-slate-500">No board rooms yet. Create the first one to start a governed transaction workflow.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workspace" className="space-y-5">
          {activeRoom ? (
            <>
              <Card className="border-white/60 bg-white/82 backdrop-blur">
                <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle className="text-2xl font-medium">{activeRoom.title}</CardTitle>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{activeRoom.summary || 'Add a room summary so every participant understands the commercial and operational goal.'}</p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{activeRoom.counterpartyName}</span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{roomTypeOptions.find((entry) => entry.value === activeRoom.roomType)?.label || 'Board room'}</span>
                      <span className={`rounded-full border px-3 py-1 ${toneClasses(countdown.tone)}`}>{countdown.label}</span>
                    </div>
                  </div>
                  <div className="w-full max-w-[240px]">
                    <Select value={activeRoom.stage} onValueChange={(value) => void patchRoom({ action: 'update_stage', stage: value }, 'Board room stage updated.')}>
                      <SelectTrigger className="rounded-2xl border-slate-200 bg-white" disabled={!canManageRoom}>
                        <SelectValue placeholder="Update stage" />
                      </SelectTrigger>
                      <SelectContent>
                        {stageOptions.map((stage) => (
                          <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Participants</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">{activeRoom.participants.length}</p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Pending approvals</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">{activeRoom.accessRequests.filter((request) => request.status === 'pending').length}</p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Assigned tasks</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">{activeRoom.tasks.filter((task) => task.ownerId === payload?.currentUserId && task.status !== 'done').length}</p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{isRoomCreator ? 'Share status' : 'Access model'}</p>
                    <p className="mt-2 text-base font-semibold text-slate-950">{isRoomCreator ? 'Private invite controls ready' : 'Creator-managed access only'}</p>
                  </div>
                </CardContent>
              </Card>

              <Tabs value={roomTab} onValueChange={setRoomTab} className="space-y-5">
                <div className="premium-surface-soft rounded-[1.6rem] p-2">
                  <TabsList className="no-scrollbar flex w-full flex-nowrap gap-2 overflow-x-auto rounded-[1.25rem] bg-transparent p-0 sm:grid sm:grid-cols-6 sm:overflow-visible">
                    <TabsTrigger value="overview" className="rounded-[1rem] px-4 text-xs sm:text-sm">Overview</TabsTrigger>
                    <TabsTrigger value="people" className="rounded-[1rem] px-4 text-xs sm:text-sm">People</TabsTrigger>
                    <TabsTrigger value="signing" className="rounded-[1rem] px-4 text-xs sm:text-sm">Signing</TabsTrigger>
                    <TabsTrigger value="execution" className="rounded-[1rem] px-4 text-xs sm:text-sm">Execution</TabsTrigger>
                    <TabsTrigger value="discussion" className="rounded-[1rem] px-4 text-xs sm:text-sm">Discussion</TabsTrigger>
                    <TabsTrigger value="timeline" className="rounded-[1rem] px-4 text-xs sm:text-sm">Timeline</TabsTrigger>
                  </TabsList>
                </div>

	                <TabsContent value="overview" className="space-y-4">
	                  {isRoomCreator ? (
	                    <Card className="border-white/60 bg-white/82 backdrop-blur">
	                      <CardHeader>
	                        <CardTitle className="text-lg font-medium">Room access and share controls</CardTitle>
	                      </CardHeader>
	                      <CardContent className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-[1fr,1fr,auto]">
                          <Input value={absoluteShareUrl} readOnly />
                          <Input value={activeRoom.joinPassword} readOnly />
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => void copyText(absoluteShareUrl, 'Board room link')}>
                              <Copy className="mr-2 h-4 w-4" />
                              Link
                            </Button>
                            <Button variant="outline" onClick={() => void copyText(activeRoom.joinPassword, 'Board room password')}>
                              <KeyRound className="mr-2 h-4 w-4" />
                              Password
                            </Button>
                          </div>
                        </div>
                        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
                          <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                              <a href={whatsappShareUrl} target="_blank" rel="noreferrer">
                                <Button variant="outline">
                                  <MessageCircle className="mr-2 h-4 w-4" />
                                  Share on WhatsApp
                                </Button>
                              </a>
                              <a href={emailShareUrl}>
                                <Button variant="outline">
                                  <Mail className="mr-2 h-4 w-4" />
                                  Share by Email
                                </Button>
                              </a>
                              {activeRoom.signDocuments.length ? (
                                <>
                                  <Button variant="outline" onClick={() => void copyText(boardRoomSigningPacket, 'Board room signing packet')}>
                                    <Copy className="mr-2 h-4 w-4" />
                                    Copy full packet
                                  </Button>
                                  <a href={boardRoomPacketWhatsappUrl} target="_blank" rel="noreferrer">
                                    <Button variant="outline">
                                      <MessageCircle className="mr-2 h-4 w-4" />
                                      Share full packet
                                    </Button>
                                  </a>
                                  <a href={boardRoomPacketEmailUrl}>
                                    <Button variant="outline">
                                      <Mail className="mr-2 h-4 w-4" />
                                      Email full packet
                                    </Button>
                                  </a>
                                </>
                              ) : null}
	                            </div>
	                          </div>
	                          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-center">
	                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Invite QR</p>
                            {qrCodeUrl ? (
                              <Image
                                src={qrCodeUrl}
                                alt="Board room invite QR code"
                                width={160}
                                height={160}
                                unoptimized
                                className="mx-auto mt-4 h-40 w-40 rounded-2xl border border-slate-200 bg-white p-2"
                              />
                            ) : null}
                            <p className="mt-3 text-xs leading-5 text-slate-500">Scan to open the board room invite link, then enter the room password to request access.</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}

                  {canManageRoom ? (
                    <Card className="border-white/60 bg-white/82 backdrop-blur">
                      <CardHeader>
                        <CardTitle className="text-lg font-medium">Board room control center</CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">People setup</p>
                          <p className="mt-2 text-base font-semibold text-slate-950">Participants, room-only users, approvals</p>
                          <Button variant="outline" size="sm" className="mt-4" onClick={() => setRoomTab('people')}>Open People</Button>
                        </div>
                        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Signing flow</p>
                          <p className="mt-2 text-base font-semibold text-slate-950">Upload protected signing packets and checklist items</p>
                          <Button variant="outline" size="sm" className="mt-4" onClick={() => setRoomTab('signing')}>Open Signing</Button>
                        </div>
                        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Execution</p>
                          <p className="mt-2 text-base font-semibold text-slate-950">Tasks, linked assets, and next actions</p>
                          <Button variant="outline" size="sm" className="mt-4" onClick={() => setRoomTab('execution')}>Open Execution</Button>
                        </div>
                        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Discussion</p>
                          <p className="mt-2 text-base font-semibold text-slate-950">Secure messages and timeline updates</p>
                          <Button variant="outline" size="sm" className="mt-4" onClick={() => setRoomTab('discussion')}>Open Discussion</Button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                </TabsContent>

                <TabsContent value="people" className="space-y-4">
                  {canManageRoom ? (
                    <>
                      <Card className="border-white/60 bg-white/82 backdrop-blur">
                        <CardHeader>
                          <CardTitle className="text-lg font-medium">Add participants or create room-only users</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                          <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-sm font-medium text-slate-950">Add an existing workspace or external participant</p>
                            <div className="grid gap-3 md:grid-cols-[1fr,160px]">
                              <Select value={participantDraft.mode} onValueChange={(value) => setParticipantDraft((prev) => ({ ...prev, mode: value }))}>
                                <SelectTrigger className="rounded-2xl border-slate-200 bg-white">
                                  <SelectValue placeholder="Participant type" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="internal">Internal user</SelectItem>
                                  <SelectItem value="external">External contact</SelectItem>
                                </SelectContent>
                              </Select>
                              <Select value={participantDraft.accessLevel} onValueChange={(value) => setParticipantDraft((prev) => ({ ...prev, accessLevel: value }))}>
                                <SelectTrigger className="rounded-2xl border-slate-200 bg-white">
                                  <SelectValue placeholder="Access level" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="viewer">Viewer</SelectItem>
                                  <SelectItem value="editor">Editor</SelectItem>
                                  <SelectItem value="approver">Approver</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {participantDraft.mode === 'internal' ? (
                              <Select value={participantDraft.userId} onValueChange={(value) => setParticipantDraft((prev) => ({ ...prev, userId: value }))}>
                                <SelectTrigger className="rounded-2xl border-slate-200 bg-white">
                                  <SelectValue placeholder="Select workspace teammate" />
                                </SelectTrigger>
                                <SelectContent>
                                  {payload?.participantOptions.map((entry) => (
                                    <SelectItem key={entry.id} value={entry.id}>{entry.name} · {entry.role}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className="grid gap-3 md:grid-cols-3">
                                <Input value={participantDraft.name} onChange={(event) => setParticipantDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="Contact name" />
                                <Input value={participantDraft.email} onChange={(event) => setParticipantDraft((prev) => ({ ...prev, email: event.target.value }))} placeholder="Email" />
                                <Input value={participantDraft.companyName} onChange={(event) => setParticipantDraft((prev) => ({ ...prev, companyName: event.target.value }))} placeholder="Company" />
                              </div>
                            )}
                            <Button onClick={() => void addParticipant()} disabled={busy || (participantDraft.mode === 'internal' ? !participantDraft.userId : !participantDraft.name.trim())}>
                              <Plus className="mr-2 h-4 w-4" />
                              Add participant
                            </Button>
                          </div>

                          <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-sm font-medium text-slate-950">Create a board-room-only user</p>
                            <div className="grid gap-3 md:grid-cols-2">
                              <Input value={roomUserDraft.name} onChange={(event) => setRoomUserDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="User name" />
                              <Input value={roomUserDraft.loginId} onChange={(event) => setRoomUserDraft((prev) => ({ ...prev, loginId: event.target.value }))} placeholder="Username / login ID" />
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <Input value={roomUserDraft.password} onChange={(event) => setRoomUserDraft((prev) => ({ ...prev, password: event.target.value }))} placeholder="Password (optional)" />
                              <Select value={roomUserDraft.accessLevel} onValueChange={(value) => setRoomUserDraft((prev) => ({ ...prev, accessLevel: value }))}>
                                <SelectTrigger className="rounded-2xl border-slate-200 bg-white">
                                  <SelectValue placeholder="Access level" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="viewer">Viewer</SelectItem>
                                  <SelectItem value="editor">Editor</SelectItem>
                                  <SelectItem value="approver">Approver</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <Button onClick={() => void createRoomUser()} disabled={busy || !roomUserDraft.name.trim()}>
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              Create room-only login
                            </Button>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-white/60 bg-white/82 backdrop-blur">
                        <CardHeader>
                          <CardTitle className="text-lg font-medium">Access requests</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {activeRoom.accessRequests.filter((request) => request.status === 'pending').length ? activeRoom.accessRequests.filter((request) => request.status === 'pending').map((request) => (
                            <div key={request.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium text-slate-950">{request.userName}</p>
                                  <p className="text-sm text-slate-500">{request.userEmail}</p>
                                  <p className="mt-2 text-xs text-slate-500">Requested {request.requestedAccessLevel} access on {new Date(request.requestedAt).toLocaleString()}</p>
                                  {request.note ? <p className="mt-2 text-sm text-slate-600">{request.note}</p> : null}
                                </div>
                                <div className="flex gap-2">
                                  <Button variant="outline" onClick={() => void patchRoom({ action: 'respond_access_request', requestId: request.id, decision: 'rejected' }, 'Access request rejected.')}>Reject</Button>
                                  <Button onClick={() => void patchRoom({ action: 'respond_access_request', requestId: request.id, decision: 'approved' }, 'Access request approved and user added to the board room.')}>Approve</Button>
                                </div>
                              </div>
                            </div>
                          )) : <p className="text-sm text-slate-500">No pending access requests right now.</p>}
                        </CardContent>
                      </Card>
                    </>
                  ) : null}

                  <Card className="border-white/60 bg-white/82 backdrop-blur">
                    <CardHeader>
                      <CardTitle className="text-lg font-medium">Participants</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {activeRoom.participants.map((participant) => (
                        <div key={participant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                          <div>
                            <p className="font-medium text-slate-950">{participant.name}</p>
                            <p className="text-sm text-slate-500">{participant.email || participant.companyName || participant.roleType}</p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">{participant.accessLevel}</span>
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">{participant.source?.replace(/_/g, ' ') || participant.roleType}</span>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="signing" className="space-y-4">
                  {canManageRoom ? (
                    <Card className="border-white/60 bg-white/82 backdrop-blur">
                      <CardHeader>
                        <CardTitle className="text-lg font-medium">Add signable document checklist item</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <Input value={signDocumentDraft.title} onChange={(event) => setSignDocumentDraft((prev) => ({ ...prev, title: event.target.value }))} placeholder="Document title" />
                          <Input value={signDocumentDraft.recipientName} onChange={(event) => setSignDocumentDraft((prev) => ({ ...prev, recipientName: event.target.value }))} placeholder="Signer name" />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <Input value={signDocumentDraft.recipientEmail} onChange={(event) => setSignDocumentDraft((prev) => ({ ...prev, recipientEmail: event.target.value }))} placeholder="Signer email" />
                          <Input value={signDocumentDraft.requiredDocumentsText} onChange={(event) => setSignDocumentDraft((prev) => ({ ...prev, requiredDocumentsText: event.target.value }))} placeholder="Required docs before signing, comma separated" />
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                          <Select value={signDocumentDraft.shareAccessPolicy} onValueChange={(value) => setSignDocumentDraft((prev) => ({ ...prev, shareAccessPolicy: value }))}>
                            <SelectTrigger className="rounded-2xl border-slate-200 bg-white">
                              <SelectValue placeholder="Share policy" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="standard">Standard</SelectItem>
                              <SelectItem value="expiring">Expiring</SelectItem>
                              <SelectItem value="one_time">One-time</SelectItem>
                            </SelectContent>
                          </Select>
                          {signDocumentDraft.shareAccessPolicy === 'expiring' ? (
                            <Input value={signDocumentDraft.expiryDays} onChange={(event) => setSignDocumentDraft((prev) => ({ ...prev, expiryDays: event.target.value }))} placeholder="Expiry days" />
                          ) : <div />}
                          {signDocumentDraft.shareAccessPolicy === 'one_time' ? (
                            <Input value={signDocumentDraft.maxAccessCount} onChange={(event) => setSignDocumentDraft((prev) => ({ ...prev, maxAccessCount: event.target.value }))} placeholder="Allowed opens" />
                          ) : <div />}
                        </div>
                        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">
                          <Upload className="h-4 w-4 text-slate-500" />
                          <span>{signDocumentDraft.fileName ? `Uploaded: ${signDocumentDraft.fileName}` : 'Upload PDF to make it signable inside this board room'}</span>
                          <input type="file" accept="application/pdf" className="hidden" onChange={handleSignDocumentUpload} />
                        </label>
                        <Button onClick={() => void addSignDocument()} disabled={busy || !signDocumentDraft.title.trim() || !signDocumentDraft.dataUrl}>
                          <Plus className="mr-2 h-4 w-4" />
                          Add sign document
                        </Button>
                      </CardContent>
                    </Card>
                  ) : null}

                  <Card className="border-white/60 bg-white/82 backdrop-blur">
                    <CardHeader>
                      <CardTitle className="text-lg font-medium">Signing checklist</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {activeRoom.signDocuments.length ? activeRoom.signDocuments.map((document) => (
                        <div key={document.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-slate-950">{document.title}</p>
                              <p className="mt-1 text-sm text-slate-500">{document.fileName}</p>
                              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                                {document.recipientName ? <span>Signer: {document.recipientName}</span> : null}
                                {document.shareExpiresAt ? <span>Expires: {new Date(document.shareExpiresAt).toLocaleString()}</span> : null}
                                {document.signedAt ? <span>Signed: {new Date(document.signedAt).toLocaleString()}</span> : null}
                              </div>
                              {document.requiredDocuments.length ? (
                                <p className="mt-3 text-sm text-slate-600">Required before signing: {document.requiredDocuments.join(', ')}</p>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className={`rounded-full px-3 py-1 text-xs font-medium ${document.status === 'signed' ? 'border border-emerald-200 bg-emerald-50 text-emerald-900' : document.status === 'documents_pending' ? 'border border-amber-200 bg-amber-50 text-amber-900' : 'border border-slate-200 bg-white text-slate-600'}`}>
                                {document.status.replace(/_/g, ' ')}
                              </span>
                              <Button variant="outline" size="sm" onClick={() => void copyText(buildAbsoluteAppUrl(document.shareUrl, typeof window !== 'undefined' ? window.location.origin : undefined), `${document.title} link`)}>
                                <Copy className="mr-2 h-4 w-4" />
                                Link
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => void copyText(document.sharePassword, `${document.title} password`)}>
                                <KeyRound className="mr-2 h-4 w-4" />
                                Password
                              </Button>
                            </div>
                          </div>
                        </div>
                      )) : <p className="text-sm text-slate-500">No signable documents added yet. Upload board room documents here and send protected signing links from one checklist.</p>}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="execution" className="space-y-4">
                  {canEditRoom ? (
                    <Card className="border-white/60 bg-white/82 backdrop-blur">
                      <CardHeader>
                        <CardTitle className="text-lg font-medium">Tasks and linked work</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {canManageRoom ? (
                          <>
                            <div className="grid gap-3 md:grid-cols-2">
                              <Input value={taskDraft.title} onChange={(event) => setTaskDraft((prev) => ({ ...prev, title: event.target.value }))} placeholder="Task title" />
                              <Input value={taskDraft.dueAt} onChange={(event) => setTaskDraft((prev) => ({ ...prev, dueAt: event.target.value }))} placeholder="Due date (YYYY-MM-DD)" />
                            </div>
                            <textarea
                              value={taskDraft.description}
                              onChange={(event) => setTaskDraft((prev) => ({ ...prev, description: event.target.value }))}
                              placeholder="Describe the next action or blocker"
                              className="min-h-[90px] w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                            />
                            <Select value={taskDraft.ownerId} onValueChange={(value) => setTaskDraft((prev) => ({ ...prev, ownerId: value }))}>
                              <SelectTrigger className="rounded-2xl border-slate-200 bg-white">
                                <SelectValue placeholder="Assign to participant" />
                              </SelectTrigger>
                              <SelectContent>
                                {activeRoom.participants.filter((entry) => entry.userId).map((entry) => (
                                  <SelectItem key={entry.id} value={entry.userId!}>{entry.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button onClick={() => void addTask()} disabled={busy || !taskDraft.title.trim()}>
                              <Plus className="mr-2 h-4 w-4" />
                              Add task
                            </Button>

                            <Select value={assetSelection} onValueChange={setAssetSelection}>
                              <SelectTrigger className="rounded-2xl border-slate-200 bg-white">
                                <SelectValue placeholder="Link an existing document, file, or sheet" />
                              </SelectTrigger>
                              <SelectContent>
                                {payload?.assetOptions.map((entry) => (
                                  <SelectItem key={`${entry.assetType}:${entry.assetId}`} value={`${entry.assetType}:${entry.assetId}`}>
                                    {entry.title} · {entry.assetType}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button variant="outline" onClick={() => void addLinkedAsset()} disabled={busy || !assetSelection}>
                              <Plus className="mr-2 h-4 w-4" />
                              Link asset
                            </Button>
                          </>
                        ) : null}

                        <div className="space-y-3">
                          {activeRoom.tasks.length ? activeRoom.tasks.map((task) => (
                            <div key={task.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium text-slate-950">{task.title}</p>
                                  {task.description ? <p className="mt-1 text-sm text-slate-500">{task.description}</p> : null}
                                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                                    {task.ownerName ? <span>Owner: {task.ownerName}</span> : null}
                                    {task.dueAt ? <span>Due: {new Date(task.dueAt).toLocaleDateString()}</span> : null}
                                  </div>
                                </div>
                                {canManageRoom ? (
                                  <Select value={task.status} onValueChange={(value) => void patchRoom({ action: 'update_task', taskId: task.id, status: value }, 'Task status updated.')}>
                                    <SelectTrigger className="w-[160px] rounded-2xl border-slate-200 bg-white">
                                      <SelectValue placeholder="Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="open">Open</SelectItem>
                                      <SelectItem value="in_progress">In progress</SelectItem>
                                      <SelectItem value="blocked">Blocked</SelectItem>
                                      <SelectItem value="done">Done</SelectItem>
                                    </SelectContent>
                                  </Select>
                                ) : <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">{task.status.replace(/_/g, ' ')}</span>}
                              </div>
                            </div>
                          )) : <p className="text-sm text-slate-500">No tasks yet.</p>}
                        </div>

                        <div className="space-y-3">
                          {activeRoom.linkedAssets.length ? activeRoom.linkedAssets.map((asset) => (
                            <div key={asset.id} className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                              <div>
                                <p className="font-medium text-slate-950">{asset.title}</p>
                                <p className="text-sm text-slate-500">{asset.subtitle || asset.assetType}</p>
                              </div>
                              {asset.href ? <a href={asset.href} className="text-sm font-medium text-slate-900 underline underline-offset-4">Open</a> : null}
                            </div>
                          )) : <p className="text-sm text-slate-500">No linked assets yet.</p>}
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                </TabsContent>

                <TabsContent value="discussion" className="space-y-4">
                  <Card className="border-white/60 bg-white/82 backdrop-blur">
                    <CardHeader>
                      <CardTitle className="text-lg font-medium">Secure room discussion</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-[1fr,220px]">
                        <textarea
                          value={messageDraft}
                          onChange={(event) => setMessageDraft(event.target.value)}
                          placeholder={canEditRoom ? 'Share a room message, approval ask, or next-step update' : 'Secure room messages will appear here'}
                          className="min-h-[120px] w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                          disabled={!canEditRoom}
                        />
                        <div className="space-y-3">
                          <Select value={messageVisibility} onValueChange={(value: 'all_participants' | 'internal_only') => setMessageVisibility(value)}>
                            <SelectTrigger className="rounded-2xl border-slate-200 bg-white" disabled={!canEditRoom}>
                              <SelectValue placeholder="Message visibility" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all_participants">All participants</SelectItem>
                              {canSendInternalMessage ? <SelectItem value="internal_only">Internal only</SelectItem> : null}
                            </SelectContent>
                          </Select>
                          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                            {messageVisibility === 'internal_only'
                              ? 'Internal-only messages stay visible only to the creator and internal participants.'
                              : 'Shared messages are visible to everyone approved inside this board room.'}
                          </div>
                          {canEditRoom ? (
                            <Button onClick={() => void addMessage()} disabled={busy || !messageDraft.trim()}>
                              <MessageCircle className="mr-2 h-4 w-4" />
                              Send message
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      <div className="space-y-3">
                        {activeRoom.messages.length ? activeRoom.messages.map((message) => {
                          const mine = message.authorId === payload?.currentUserId;
                          return (
                            <div key={message.id} className={`rounded-3xl border p-4 ${mine ? 'border-slate-900 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-900'}`}>
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className={`font-medium ${mine ? 'text-white' : 'text-slate-950'}`}>{message.authorName}</p>
                                  <p className={`mt-1 text-xs uppercase tracking-[0.16em] ${mine ? 'text-slate-300' : 'text-slate-500'}`}>
                                    {message.visibility === 'internal_only' ? 'Internal only' : 'Shared with room'} · {new Date(message.createdAt).toLocaleString()}
                                  </p>
                                </div>
                                <span className={`rounded-full px-3 py-1 text-xs font-medium ${mine ? 'bg-white/10 text-white' : message.visibility === 'internal_only' ? 'border border-amber-200 bg-amber-50 text-amber-900' : 'border border-slate-200 bg-white text-slate-600'}`}>
                                  {message.visibility === 'internal_only' ? 'Secure' : 'Open to room'}
                                </span>
                              </div>
                              <p className={`mt-3 text-sm leading-7 ${mine ? 'text-slate-100' : 'text-slate-700'}`}>{message.body}</p>
                            </div>
                          );
                        }) : <p className="text-sm text-slate-500">No room messages yet. Use this discussion area for secure coordination inside the board room.</p>}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="timeline" className="space-y-4">
                  <Card className="border-white/60 bg-white/82 backdrop-blur">
                    <CardHeader>
                      <CardTitle className="text-lg font-medium">Room timeline</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <textarea
                        value={noteDraft}
                        onChange={(event) => setNoteDraft(event.target.value)}
                        placeholder={canEditRoom ? 'Add a room update, negotiation note, or decision context' : 'Board room updates will appear here'}
                        className="min-h-[110px] w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                        disabled={!canEditRoom}
                      />
                      {canEditRoom ? (
                        <Button onClick={() => void patchRoom({ action: 'add_note', note: noteDraft }, 'Board room update added.')} disabled={busy || !noteDraft.trim()}>
                          <Plus className="mr-2 h-4 w-4" />
                          Add update
                        </Button>
                      ) : null}
                      <div className="space-y-3">
                        {activeRoom.activity.slice(0, 12).map((activity) => (
                          <div key={activity.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-start gap-3">
                              <div className="mt-1 rounded-full bg-white p-2 text-slate-700">
                                {activity.type === 'stage_changed' ? <TimerReset className="h-4 w-4" /> : activity.type === 'participant_added' ? <Users className="h-4 w-4" /> : activity.type === 'task_created' || activity.type === 'task_updated' ? <CheckCircle2 className="h-4 w-4" /> : <CircleDot className="h-4 w-4" />}
                              </div>
                              <div>
                                <p className="font-medium text-slate-950">{activity.message}</p>
                                <p className="mt-1 text-xs text-slate-500">{new Date(activity.createdAt).toLocaleString()}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <Card className="border-white/60 bg-white/82 backdrop-blur">
              <CardContent className="p-6 text-sm text-slate-600">No board room selected yet. Create one or pick an existing room from the pipeline.</CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="create" className="space-y-5">
          <Card className="border-white/60 bg-white/82 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-lg font-medium">Create a new board room</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Input value={createDraft.title} onChange={(event) => setCreateDraft((prev) => ({ ...prev, title: event.target.value }))} placeholder="Board room title" />
                <Input value={createDraft.counterpartyName} onChange={(event) => setCreateDraft((prev) => ({ ...prev, counterpartyName: event.target.value }))} placeholder="Counterparty name" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Select value={createDraft.roomType} onValueChange={(value) => setCreateDraft((prev) => ({ ...prev, roomType: value }))}>
                  <SelectTrigger className="rounded-2xl border-slate-200 bg-white">
                    <SelectValue placeholder="Workflow type" />
                  </SelectTrigger>
                  <SelectContent>
                    {roomTypeOptions.map((entry) => (
                      <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={createDraft.targetCloseDate} onChange={(event) => setCreateDraft((prev) => ({ ...prev, targetCloseDate: event.target.value }))} placeholder="Target close date (YYYY-MM-DD)" />
              </div>
              <textarea
                value={createDraft.summary}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, summary: event.target.value }))}
                placeholder="Describe the transaction scope, participants, and what a successful close should look like"
                className="min-h-[120px] w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              />
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <CalendarClock className="mb-3 h-4 w-4 text-slate-900" />
                  Add a target close date so deadline flags and countdown logic can keep the room honest.
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <Clock3 className="mb-3 h-4 w-4 text-slate-900" />
                  Every board room gets a share link and password automatically when it is created.
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <ShieldCheck className="mb-3 h-4 w-4 text-slate-900" />
                  You can approve self-registered users or create board-room-only usernames for invited participants.
                </div>
              </div>
              <Button onClick={() => void handleCreateRoom()} disabled={busy || !createDraft.title.trim() || !createDraft.counterpartyName.trim()}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Create board room
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{success}</div> : null}
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
    </div>
  );
}
