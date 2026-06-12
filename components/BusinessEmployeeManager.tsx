'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

/* ─── Types ─────────────────────────────────────────────────────── */
interface Invite {
  id: string; token: string; label?: string;
  maxUses?: number | null; useCount: number;
  expiresAt?: string | null; isActive: boolean; createdAt: string;
}

interface Member {
  id: string; userId: string; role: string;
  title?: string; department?: string;
  name?: string; avatarUrl?: string; headline?: string; location?: string;
  profileSetupDone?: boolean; joinedAt: string;
}

interface Props { pageId: string; pageName: string; pageSlug: string; origin: string; }

/* ─── Helpers ────────────────────────────────────────────────────── */
const ago = (iso: string) => {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000) return 'just now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  if (d < 7 * 86400000) return `${Math.floor(d / 86400000)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

function Avatar({ name, url, size = 36 }: { name?: string; url?: string; size?: number }) {
  if (url) return <img src={url} alt={name || ''} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid rgba(255,255,255,0.10)' }} />;
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(135deg,#4f46e5,#818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 800, color: '#fff', border: '1.5px solid rgba(99,102,241,0.30)', flexShrink: 0 }}>
      {initials}
    </div>
  );
}

/* ─── Toast ─────────────────────────────────────────────────────── */
function useToast() {
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const toast = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3000);
  };
  return { msg, toast };
}

/* ─── Main Component ─────────────────────────────────────────────── */
export default function BusinessEmployeeManager({ pageId, pageName, pageSlug, origin }: Props) {
  const [tab, setTab] = useState<'members' | 'invites'>('members');
  const [invites, setInvites] = useState<Invite[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const { msg, toast } = useToast();

  // Invite creation state
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newMaxUses, setNewMaxUses] = useState('');
  const [newExpiry, setNewExpiry] = useState('never');
  const [showCreate, setShowCreate] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Member edit state
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDept, setEditDept] = useState('');
  const [editRole, setEditRole] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [invRes, memRes] = await Promise.all([
      fetch(`/api/business-pages/${pageId}/invites`).then(r => r.json()).catch(() => ({ invites: [] })),
      fetch(`/api/business-pages/${pageId}/members`).then(r => r.json()).catch(() => ({ members: [] })),
    ]);
    setInvites(invRes.invites ?? []);
    setMembers(memRes.members ?? []);
    setLoading(false);
  }, [pageId]);

  useEffect(() => { load(); }, [load]);

  async function createInvite() {
    setCreating(true);
    try {
      const expiresIn = newExpiry === '7' ? 7 : newExpiry === '30' ? 30 : null;
      const res = await fetch(`/api/business-pages/${pageId}/invites`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newLabel.trim() || undefined,
          maxUses: newMaxUses ? parseInt(newMaxUses) : null,
          expiresIn,
        }),
      });
      const d = await res.json() as { invite?: Invite; error?: string };
      if (!res.ok) { toast(d.error || 'Failed to create invite', 'error'); return; }
      setInvites(prev => [d.invite!, ...prev]);
      setShowCreate(false); setNewLabel(''); setNewMaxUses(''); setNewExpiry('never');
      toast('Invite link created');
    } finally { setCreating(false); }
  }

  async function handleInviteAction(inviteId: string, action: 'revoke' | 'delete') {
    const res = await fetch(`/api/business-pages/${pageId}/invites`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId, action }),
    });
    if (!res.ok) { toast('Action failed', 'error'); return; }
    await load();
    toast(action === 'revoke' ? 'Invite revoked' : 'Invite deleted');
  }

  async function saveEdit(userId: string) {
    setSavingEdit(true);
    const res = await fetch(`/api/business-pages/${pageId}/members`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action: 'update', role: editRole, title: editTitle, department: editDept }),
    });
    setSavingEdit(false);
    if (!res.ok) { toast('Failed to update', 'error'); return; }
    setEditingMember(null);
    await load();
    toast('Member updated');
  }

  async function removeMember(userId: string, name?: string) {
    if (!confirm(`Remove ${name || 'this member'} from ${pageName}?`)) return;
    setRemovingId(userId);
    const res = await fetch(`/api/business-pages/${pageId}/members`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action: 'remove' }),
    });
    setRemovingId(null);
    if (!res.ok) { toast('Failed to remove', 'error'); return; }
    setMembers(prev => prev.filter(m => m.userId !== userId));
    toast('Member removed');
  }

  function copyLink(token: string) {
    const url = `${origin}/invite/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const INP = {
    width: '100%', height: 36, borderRadius: 9, border: '1px solid rgba(255,255,255,0.09)',
    background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.82)',
    fontSize: 12.5, padding: '0 12px', fontFamily: 'inherit', outline: 'none',
  };
  const SEL = { ...INP, cursor: 'pointer', appearance: 'none' as const };

  return (
    <div style={{ background: '#0a0a0f', borderRadius: 20, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden', fontFamily: 'system-ui,-apple-system,sans-serif', color: '#fff' }}>

      {/* Toast */}
      {msg && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999, padding: '10px 16px', borderRadius: 12, fontSize: 13, fontWeight: 600, animation: 'fadein .2s',
          ...(msg.type === 'success' ? { background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#34d399' } : { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }) }}>
          {msg.text}
        </div>
      )}
      <style>{`@keyframes fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Header */}
      <div style={{ padding: '20px 24px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-0.03em', color: 'rgba(255,255,255,0.90)' }}>Team &amp; Employees</h2>
            <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'rgba(255,255,255,0.30)' }}>
              {members.length} member{members.length !== 1 ? 's' : ''} · {invites.filter(i => i.isActive).length} active invite{invites.filter(i => i.isActive).length !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={() => { setShowCreate(true); setTab('invites'); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(79,70,229,0.30)' }}>
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
            Invite employees
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0 }}>
          {(['members', 'invites'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '9px 16px', fontSize: 12.5, fontWeight: 700, border: 'none', cursor: 'pointer', background: 'transparent', letterSpacing: '-0.01em', transition: 'color .15s',
                color: tab === t ? 'rgba(165,180,252,0.90)' : 'rgba(255,255,255,0.30)',
                borderBottom: tab === t ? '2px solid rgba(99,102,241,0.70)' : '2px solid transparent',
              }}>
              {t === 'members' ? `Members (${members.length})` : `Invite Links (${invites.length})`}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 24 }}>

        {/* ── MEMBERS TAB ── */}
        {tab === 'members' && (
          loading ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.22)', fontSize: 12.5 }}>Loading members…</div>
          ) : members.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
              <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>No employees yet</p>
              <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'rgba(255,255,255,0.25)' }}>Share an invite link so your team members can join the page.</p>
              <button onClick={() => { setShowCreate(true); setTab('invites'); }}
                style={{ padding: '8px 18px', borderRadius: 10, border: '1px solid rgba(99,102,241,0.30)', background: 'rgba(99,102,241,0.10)', color: 'rgba(165,180,252,0.80)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                Create invite link →
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {members.map(m => (
                <div key={m.userId} style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', padding: '14px 16px' }}>
                  {editingMember === m.userId ? (
                    /* ── Edit row ── */
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <Avatar name={m.name} url={m.avatarUrl} size={36} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.82)' }}>{m.name}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', marginBottom: 5 }}>Job Title</label>
                          <input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="e.g. Senior Engineer" style={INP} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', marginBottom: 5 }}>Department</label>
                          <input value={editDept} onChange={e => setEditDept(e.target.value)} placeholder="e.g. Engineering" style={INP} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', marginBottom: 5 }}>Role</label>
                          <select value={editRole} onChange={e => setEditRole(e.target.value)} style={SEL}>
                            <option value="employee">Employee</option>
                            <option value="manager">Manager</option>
                            <option value="lead">Team Lead</option>
                            <option value="intern">Intern</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => saveEdit(m.userId)} disabled={savingEdit}
                          style={{ padding: '7px 16px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: savingEdit ? 0.6 : 1 }}>
                          {savingEdit ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => setEditingMember(null)}
                          style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── Display row ── */
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Link href={`/u/${m.userId}`} target="_blank" style={{ textDecoration: 'none', flexShrink: 0 }}>
                        <Avatar name={m.name} url={m.avatarUrl} size={38} />
                      </Link>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <Link href={`/u/${m.userId}`} target="_blank" style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.85)', textDecoration: 'none' }}>{m.name || 'Unknown'}</Link>
                          {!m.profileSetupDone && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '1.5px 6px', borderRadius: 999, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.22)', color: 'rgba(251,191,36,0.70)' }}>Profile pending</span>}
                          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '1.5px 6px', borderRadius: 999, background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.20)', color: 'rgba(165,180,252,0.65)' }}>{m.role}</span>
                        </div>
                        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.30)', marginTop: 2 }}>
                          {[m.title, m.department].filter(Boolean).join(' · ') || m.headline || 'No title set'}
                          <span style={{ marginLeft: 8, opacity: 0.5 }}>· Joined {ago(m.joinedAt)}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => { setEditingMember(m.userId); setEditTitle(m.title || ''); setEditDept(m.department || ''); setEditRole(m.role || 'employee'); }}
                          style={{ padding: '5px 11px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.45)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                          Edit
                        </button>
                        <button onClick={() => removeMember(m.userId, m.name)} disabled={removingId === m.userId}
                          style={{ padding: '5px 11px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.20)', background: 'rgba(239,68,68,0.07)', color: 'rgba(248,113,113,0.70)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', opacity: removingId === m.userId ? 0.5 : 1 }}>
                          {removingId === m.userId ? '…' : 'Remove'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {/* ── INVITES TAB ── */}
        {tab === 'invites' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Create form */}
            {showCreate && (
              <div style={{ borderRadius: 14, border: '1px solid rgba(99,102,241,0.25)', background: 'rgba(99,102,241,0.06)', padding: 18 }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 800, color: 'rgba(165,180,252,0.85)', letterSpacing: '-0.02em' }}>New Invite Link</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', marginBottom: 5 }}>Label (optional)</label>
                    <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Engineering team" style={INP} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', marginBottom: 5 }}>Max uses</label>
                    <input type="number" min="1" value={newMaxUses} onChange={e => setNewMaxUses(e.target.value)} placeholder="Unlimited" style={INP} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', marginBottom: 5 }}>Expires in</label>
                    <select value={newExpiry} onChange={e => setNewExpiry(e.target.value)} style={SEL}>
                      <option value="never">Never</option>
                      <option value="7">7 days</option>
                      <option value="30">30 days</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={createInvite} disabled={creating}
                    style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: creating ? 0.6 : 1, boxShadow: '0 4px 16px rgba(79,70,229,0.28)' }}>
                    {creating ? 'Creating…' : 'Generate link'}
                  </button>
                  <button onClick={() => setShowCreate(false)}
                    style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.40)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Invite list */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.22)', fontSize: 12.5 }}>Loading…</div>
            ) : invites.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 0' }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>🔗</div>
                <p style={{ margin: '0 0 6px', fontSize: 13.5, fontWeight: 700, color: 'rgba(255,255,255,0.50)' }}>No invite links yet</p>
                <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.22)' }}>Create a link and share it with your employees.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {invites.map(inv => {
                  const expired = inv.expiresAt ? new Date(inv.expiresAt) < new Date() : false;
                  const maxed   = inv.maxUses !== null ? inv.useCount >= inv.maxUses! : false;
                  const status  = !inv.isActive ? 'revoked' : expired ? 'expired' : maxed ? 'maxed' : 'active';
                  const url     = `${origin}/invite/${inv.token}`;
                  return (
                    <div key={inv.id} style={{ borderRadius: 13, border: `1px solid ${status === 'active' ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)'}`, background: `rgba(255,255,255,${status === 'active' ? '0.025' : '0.015'})`, padding: '13px 16px', opacity: status === 'active' ? 1 : 0.55 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.80)' }}>{inv.label || 'Employee invite'}</span>
                            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '1.5px 6px', borderRadius: 999,
                              ...(status === 'active' ? { background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.20)', color: 'rgba(52,211,153,0.75)' } :
                                  { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', color: 'rgba(248,113,113,0.65)' }) }}>
                              {status}
                            </span>
                          </div>
                          {/* Link */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(165,180,252,0.55)', background: 'rgba(99,102,241,0.07)', padding: '2px 8px', borderRadius: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{url}</span>
                            {status === 'active' && (
                              <button onClick={() => copyLink(inv.token)}
                                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 7, border: '1px solid rgba(99,102,241,0.25)', background: copied === inv.token ? 'rgba(16,185,129,0.10)' : 'rgba(99,102,241,0.08)', color: copied === inv.token ? 'rgba(52,211,153,0.80)' : 'rgba(165,180,252,0.70)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                {copied === inv.token ? (
                                  <><svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>Copied</>
                                ) : (
                                  <><svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><rect x="9" y="9" width="13" height="13" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy</>
                                )}
                              </button>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.26)' }}>
                            {inv.useCount} use{inv.useCount !== 1 ? 's' : ''}
                            {inv.maxUses !== null && ` of ${inv.maxUses}`}
                            {inv.expiresAt && ` · Expires ${new Date(inv.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                            <span style={{ opacity: 0.6 }}> · Created {ago(inv.createdAt)}</span>
                          </div>
                        </div>
                        {status === 'active' && (
                          <button onClick={() => handleInviteAction(inv.id, 'revoke')}
                            style={{ flexShrink: 0, padding: '5px 11px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.18)', background: 'rgba(239,68,68,0.07)', color: 'rgba(248,113,113,0.70)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                            Revoke
                          </button>
                        )}
                        <button onClick={() => handleInviteAction(inv.id, 'delete')}
                          style={{ flexShrink: 0, padding: '5px 11px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.28)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
