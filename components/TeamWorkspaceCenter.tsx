'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Lock, Pencil, Search, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { TeamWorkspaceSummary } from '@/types/document';

const internalWorkspaceAccessOptions = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'generate_documents', label: 'Generate' },
  { id: 'document_summary', label: 'Summary' },
  { id: 'history', label: 'History' },
  { id: 'docsheet', label: 'DocSheet' },
  { id: 'visualizer', label: 'Visualizer' },
  { id: 'deal_room', label: 'Board Room' },
  { id: 'internal_mailbox', label: 'Mailbox' },
  { id: 'file_transfers', label: 'File Transfers' },
  { id: 'support', label: 'AI Support' },
  { id: 'profile', label: 'Profile' },
];

export default function TeamWorkspaceCenter() {
  const [summary, setSummary] = useState<TeamWorkspaceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<'members' | 'create' | 'activity'>('members');
  const [memberQuery, setMemberQuery] = useState('');
  const [memberFilter, setMemberFilter] = useState<'all' | 'active' | 'disabled'>('active');
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [memberBusyId, setMemberBusyId] = useState<string | null>(null);
  const [inviteName, setInviteName] = useState('');
  const [inviteLoginId, setInviteLoginId] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [invitePermissions, setInvitePermissions] = useState<string[]>([
    'dashboard',
    'generate_documents',
    'document_summary',
    'history',
    'docsheet',
    'visualizer',
    'deal_room',
    'internal_mailbox',
    'support',
    'profile',
  ]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/team-workspace', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to load team workspace.');
      setSummary(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load team workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const members = summary?.members || [];
  const filteredMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    return members.filter((member) => {
      if (memberFilter === 'active' && !member.isActive) return false;
      if (memberFilter === 'disabled' && member.isActive) return false;
      if (!query) return true;
      return (
        member.name.toLowerCase().includes(query)
        || (member.loginId || '').toLowerCase().includes(query)
        || (member.email || '').toLowerCase().includes(query)
      );
    });
  }, [memberFilter, memberQuery, members]);

  const inviteMember = async () => {
    try {
      setBusy(true);
      setError('');
      setSuccess('');
      const response = await fetch('/api/team-workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: inviteName, loginId: inviteLoginId, password: invitePassword, permissions: invitePermissions }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to invite teammate.');
      setSuccess(`Internal user created. Login ID: ${payload.member?.loginId || inviteLoginId}. Password: ${payload.temporaryPassword}`);
      setInviteName('');
      setInviteLoginId('');
      setInvitePassword('');
      setInvitePermissions([
        'dashboard',
        'generate_documents',
        'document_summary',
        'history',
        'docsheet',
        'visualizer',
        'deal_room',
        'internal_mailbox',
        'support',
        'profile',
      ]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to invite teammate.');
    } finally {
      setBusy(false);
    }
  };

  const beginEditMember = useCallback((memberId: string) => {
    const member = members.find((entry) => entry.id === memberId);
    if (!member) return;
    setEditingMemberId(memberId);
    setEditPermissions(Array.isArray(member.permissions) ? member.permissions : []);
    setError('');
    setSuccess('');
  }, [members]);

  const cancelEditMember = useCallback(() => {
    setEditingMemberId(null);
    setEditPermissions([]);
  }, []);

  const updateMember = useCallback(async (payload: { memberId: string; permissions?: string[]; isActive?: boolean; inviteStatus?: 'pending' | 'active' | 'disabled' }) => {
    try {
      setMemberBusyId(payload.memberId);
      setError('');
      setSuccess('');
      const response = await fetch('/api/team-workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error || 'Unable to update teammate.');
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update teammate.');
      return false;
    } finally {
      setMemberBusyId(null);
    }
  }, [load]);

  const saveMemberAccess = useCallback(async () => {
    if (!editingMemberId) return;
    const ok = await updateMember({ memberId: editingMemberId, permissions: editPermissions });
    if (ok) {
      setSuccess('Access updated.');
      cancelEditMember();
    }
  }, [cancelEditMember, editPermissions, editingMemberId, updateMember]);

  const toggleMemberActive = useCallback(async (memberId: string, nextActive: boolean) => {
    await updateMember({
      memberId,
      isActive: nextActive,
      inviteStatus: nextActive ? 'active' : 'disabled',
    });
  }, [updateMember]);

  if (loading) {
    return (
      <Card className="cloud-panel">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading team workspace...
        </CardContent>
      </Card>
    );
  }

  if (error && !summary) {
    return (
      <Card className="cloud-panel">
        <CardContent className="space-y-4 p-6">
          <p className="text-sm text-rose-700">{error}</p>
          <Button variant="outline" onClick={() => void load()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="cloud-panel">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-950">
              <Users className="h-5 w-5 text-slate-900" />
              Team Workspace
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 backdrop-blur">
                {summary?.planName}
              </span>
              <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 backdrop-blur">
                Seats {summary?.usedMembers}/{summary?.maxMembers}
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium backdrop-blur ${summary?.canInvite ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800' : 'border-amber-200 bg-amber-50/70 text-amber-800'}`}>
                {summary?.canInvite ? 'Invites on' : 'Limit reached'}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <TabsList className="w-full justify-start rounded-2xl bg-white/60 p-1 backdrop-blur sm:w-auto">
                <TabsTrigger value="members" className="rounded-xl">Members</TabsTrigger>
                <TabsTrigger value="create" className="rounded-xl">Create user</TabsTrigger>
                <TabsTrigger value="activity" className="rounded-xl">Activity</TabsTrigger>
              </TabsList>

              {activeTab === 'members' ? (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                  <div className="relative w-full sm:w-[280px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={memberQuery}
                      onChange={(event) => setMemberQuery(event.target.value)}
                      placeholder="Search members"
                      className="pl-9"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMemberFilter('active')}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${memberFilter === 'active' ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white/70 text-slate-700'}`}
                    >
                      Active
                    </button>
                    <button
                      type="button"
                      onClick={() => setMemberFilter('disabled')}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${memberFilter === 'disabled' ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white/70 text-slate-700'}`}
                    >
                      Disabled
                    </button>
                    <button
                      type="button"
                      onClick={() => setMemberFilter('all')}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${memberFilter === 'all' ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white/70 text-slate-700'}`}
                    >
                      All
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4">
              {success ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900 backdrop-blur">{success}</div> : null}
              {error ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-800 backdrop-blur">{error}</div> : null}
            </div>

            <TabsContent value="members" className="mt-0 space-y-3">
              {filteredMembers.length ? filteredMembers.map((member) => {
                const isEditing = editingMemberId === member.id;
                const isBusy = memberBusyId === member.id;
                const statusLabel = member.isActive ? 'Active' : 'Disabled';
                return (
                  <div key={member.id} className="cloud-panel rounded-2xl p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-950">{member.name}</p>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${member.isActive ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800' : 'border-slate-200 bg-slate-50/80 text-slate-600'}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-600">Login ID: {member.loginId || member.email}</p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                          <span>{member.generatedDocuments} actions</span>
                          {member.recentActivityLabel ? <span>{member.recentActivityLabel}</span> : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => (isEditing ? cancelEditMember() : beginEditMember(member.id))}
                          disabled={isBusy}
                          className="gap-2"
                        >
                          <Pencil className="h-4 w-4" />
                          {isEditing ? 'Close' : 'Edit access'}
                        </Button>
                        <Button
                          variant={member.isActive ? 'outline' : 'default'}
                          size="sm"
                          onClick={() => void toggleMemberActive(member.id, !member.isActive)}
                          disabled={isBusy}
                          className="gap-2"
                        >
                          <Lock className="h-4 w-4" />
                          {member.isActive ? 'Disable' : 'Enable'}
                        </Button>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-white/70 p-4 backdrop-blur">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Access</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {internalWorkspaceAccessOptions.map((option) => {
                            const selected = editPermissions.includes(option.id);
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => setEditPermissions((current) => selected ? current.filter((permission) => permission !== option.id) : [...current, option.id])}
                                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${selected ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white/80 text-slate-700'}`}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <Button onClick={() => void saveMemberAccess()} disabled={isBusy || editPermissions.length === 0} className="gap-2">
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            Save access
                          </Button>
                          <Button variant="outline" onClick={cancelEditMember} disabled={isBusy}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {!isEditing && member.permissions?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {member.permissions.slice(0, 10).map((permission) => (
                          <span
                            key={permission}
                            className="rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-slate-700 backdrop-blur"
                          >
                            {permission.replace(/_/g, ' ')}
                          </span>
                        ))}
                        {member.permissions.length > 10 ? (
                          <span className="rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-slate-600 backdrop-blur">
                            +{member.permissions.length - 10} more
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              }) : (
                <div className="cloud-panel rounded-2xl p-6">
                  <p className="text-sm font-medium text-slate-900">No teammates yet</p>
                  <p className="mt-1 text-sm text-slate-600">Create an internal user to start collaborating.</p>
                  <Button className="mt-4" onClick={() => setActiveTab('create')}>Create user</Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="create" className="mt-0">
              <div className="cloud-panel rounded-2xl p-5">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold text-slate-950">Create internal user</p>
                  <p className="text-sm text-slate-600">Login-based teammates for your workspace.</p>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Input value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Teammate name" />
                  <Input value={inviteLoginId} onChange={(event) => setInviteLoginId(event.target.value)} placeholder="Login ID" />
                  <Input value={invitePassword} onChange={(event) => setInvitePassword(event.target.value)} placeholder="Password (optional)" />
                </div>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white/70 p-4 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Feature access</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {internalWorkspaceAccessOptions.map((option) => {
                      const selected = invitePermissions.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setInvitePermissions((current) => selected ? current.filter((permission) => permission !== option.id) : [...current, option.id])}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${selected ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white/80 text-slate-700'}`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button onClick={() => void inviteMember()} disabled={busy || !inviteName.trim() || !inviteLoginId.trim() || invitePermissions.length === 0 || !summary?.canInvite} className="gap-2">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                    Create user
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setInviteName('');
                    setInviteLoginId('');
                    setInvitePassword('');
                  }}>
                    Reset
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="activity" className="mt-0 space-y-3">
              {summary?.recentActivity?.length ? summary.recentActivity.map((event) => (
                <div key={event.id} className="cloud-panel rounded-2xl p-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-semibold text-slate-950">{event.actorName}</p>
                    <p className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()}</p>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{event.action.replace(/_/g, ' ')}</p>
                  {event.reference ? <p className="mt-1 text-xs text-slate-500">Ref: {event.reference}</p> : null}
                </div>
              )) : (
                <div className="cloud-panel rounded-2xl p-6">
                  <p className="text-sm font-medium text-slate-900">No activity yet</p>
                  <p className="mt-1 text-sm text-slate-600">Member activity will show up here as the workspace is used.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
