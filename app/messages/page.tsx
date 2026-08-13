'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Briefcase,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  CornerUpLeft,
  ExternalLink,
  File,
  Image as ImageIcon,
  Info,
  Link2,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Send,
  Star,
  Trash2,
  UserCheck,
  UserPlus,
  X,
  Users,
  ShieldCheck,
  Inbox,
  ArrowRight,
  Loader2,
  Tag,
  Palette,
  StickyNote,
  Pin,
  PinOff,
  Share2,
  Settings2,
  Store,
  Zap,
  BellOff,
  Bell,
  Timer,
  ToggleLeft,
  ToggleRight,
  PenLine,
  Handshake,
  Calendar,
  CreditCard,
  PhoneCall,
  ChevronUp as ChevronUpIcon,
} from 'lucide-react';
import InfinityUpgradeModal from '@/components/InfinityUpgradeModal';
import { PresenceBadge, PresenceDot } from '@/components/PresenceBadge';

/* ─── Types ─────────────────────────────────────────────── */
interface ChatMeta {
  label?: string;
  labelColor?: string;
  bgColor?: string;
  notes?: string;
  pinnedAt?: string;
}

const LABEL_PRESETS = [
  { label: 'Work', color: '#3b82f6' },
  { label: 'Client', color: '#8b5cf6' },
  { label: 'Personal', color: '#10b981' },
  { label: 'Important', color: '#f59e0b' },
  { label: 'Follow-up', color: '#f97316' },
  { label: 'Urgent', color: '#ef4444' },
];

interface QuickReply { id: string; title: string; content: string; }
interface AutoReplySettings { enabled: boolean; message: string; cooldownMinutes: number; }
interface BusinessTool { id: string; label: string; value: string; extra?: string; }
interface BusinessProfile { catalogues: BusinessTool[]; meetings: BusinessTool[]; payments: BusinessTool[]; contacts: BusinessTool[]; }

type BizCategory = keyof BusinessProfile;
const BIZ_CATEGORIES: { key: BizCategory; icon: React.ReactNode; label: string; color: string; border: string; placeholder: { label: string; value: string; extra: string }; suggestions: string[]; shareFormat: (t: BusinessTool) => string }[] = [
  {
    key: 'catalogues',
    icon: null, // filled below
    label: 'Catalogues',
    color: '#60a5fa',
    border: 'rgba(59,130,246,0.20)',
    placeholder: { label: 'e.g. Main Catalogue', value: 'https://yoursite.com/services', extra: 'Brief description (optional)' },
    suggestions: ['Main Catalogue', 'Product Catalogue', 'Service List', 'Portfolio'],
    shareFormat: (t) => `📦 ${t.label}\n${t.extra ? t.extra + '\n' : ''}${t.value}`,
  },
  {
    key: 'meetings',
    icon: null,
    label: 'Meeting Links',
    color: '#a78bfa',
    border: 'rgba(139,92,246,0.20)',
    placeholder: { label: 'e.g. Calendly', value: 'https://calendly.com/yourname', extra: 'Available Mon-Fri, 9am-6pm (optional)' },
    suggestions: ['Calendly', 'Google Meet', 'Zoom', 'Microsoft Teams', 'Skype'],
    shareFormat: (t) => `📅 Book a meeting with me!\n${t.label}: ${t.value}${t.extra ? '\n' + t.extra : ''}`,
  },
  {
    key: 'payments',
    icon: null,
    label: 'Payment Details',
    color: '#fbbf24',
    border: 'rgba(245,158,11,0.20)',
    placeholder: { label: 'e.g. UPI ID', value: 'yourname@upi', extra: 'Bank / Account name (optional)' },
    suggestions: ['UPI ID', 'PayPal', 'Stripe Link', 'Bank Transfer', 'Razorpay', 'GPay'],
    shareFormat: (t) => `💳 Payment Details\n${t.label}: ${t.value}${t.extra ? '\n' + t.extra : ''}`,
  },
  {
    key: 'contacts',
    icon: null,
    label: 'Contact Details',
    color: '#34d399',
    border: 'rgba(16,185,129,0.20)',
    placeholder: { label: 'e.g. WhatsApp', value: '+91 98765 43210', extra: 'Best time to call (optional)' },
    suggestions: ['WhatsApp', 'Phone', 'Email', 'Telegram', 'Signal'],
    shareFormat: (t) => `📞 ${t.label}: ${t.value}${t.extra ? '\n' + t.extra : ''}`,
  },
];

const BG_PRESETS: { key: string; label: string; value: string }[] = [
  { key: 'default', label: 'Default', value: '' },
  { key: 'navy', label: 'Navy', value: 'radial-gradient(ellipse at top,#0f1c3f 0%,#07080f 100%)' },
  { key: 'forest', label: 'Forest', value: 'radial-gradient(ellipse at top,#0b2218 0%,#060d0a 100%)' },
  { key: 'dusk', label: 'Dusk', value: 'radial-gradient(ellipse at top,#1a0d2e 0%,#07080f 100%)' },
  { key: 'crimson', label: 'Crimson', value: 'radial-gradient(ellipse at top,#2a0a0a 0%,#07080f 100%)' },
  { key: 'slate', label: 'Slate', value: 'radial-gradient(ellipse at top,#0e1520 0%,#060a10 100%)' },
  { key: 'warm', label: 'Warm', value: 'radial-gradient(ellipse at top,#1c1208 0%,#0a0905 100%)' },
];

interface ReplyTo {
  id: string;
  content: string;
  senderId: string;
  type: 'text' | 'image' | 'file';
  attachmentName?: string;
}
interface OtherUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
  docrudGo: boolean;
}
interface SearchUser extends OtherUser {
  iFollow: boolean;
  theyFollow: boolean;
  isMutual: boolean;
}
interface ConvLastMessage {
  content: string;
  senderId: string;
  sentAt: string;
  type: string;
}
interface Conversation {
  id: string;
  participants: string[];
  status: 'active' | 'request' | 'rejected';
  requestFrom?: string;
  source?: 'service';
  createdAt: string;
  updatedAt: string;
  lastMessage?: ConvLastMessage;
  unreadCount: Record<string, number>;
  otherUser: OtherUser;
}
interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'file';
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: number;
  attachmentMimeType?: string;
  sentAt: string;
  seenBy: string[];
  replyTo?: ReplyTo;
}
interface TypingUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/* ─── Helpers ─────────────────────────────────────────────── */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function fmtDateSep(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yday = new Date(today);
  yday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}
function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
}
function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
function groupByDate(msgs: Message[]) {
  const groups: { date: string; messages: Message[] }[] = [];
  let cur = '';
  for (const m of msgs) {
    const d = new Date(m.sentAt).toDateString();
    if (d !== cur) { cur = d; groups.push({ date: m.sentAt, messages: [m] }); }
    else groups[groups.length - 1].messages.push(m);
  }
  return groups;
}
const URL_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
function extractLinks(text: string): string[] {
  return Array.from(new Set(text.match(URL_REGEX) ?? []));
}
function urlDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

/* ─── Avatar ─────────────────────────────────────────────── */
function Avatar({ user, size = 9, ring = true }: { user: OtherUser | null; size?: number; ring?: boolean }) {
  const px = size * 4;
  const fs = size <= 7 ? 9 : size <= 9 ? 11 : size <= 11 ? 12 : 14;
  const cls = `rounded-full flex-shrink-0 ${ring ? 'ring-[1.5px] ring-white/[0.09]' : ''}`;
  if (!user) return <div className={cls} style={{ width: px, height: px, background: 'rgba(255,255,255,0.06)' }} />;
  if (user.avatarUrl)
    return (
      <div className={`${cls} overflow-hidden`} style={{ width: px, height: px }}>
        <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
      </div>
    );
  return (
    <div
      className={`${cls} flex items-center justify-center font-bold text-white/75`}
      style={{ width: px, height: px, fontSize: fs, background: 'linear-gradient(135deg,rgba(59,130,246,0.38),rgba(139,92,246,0.38))' }}
    >
      {initials(user.name)}
    </div>
  );
}

/* ─── Status Icon ─────────────────────────────────────────── */
function StatusIcon({ msg, isMine }: { msg: Message; isMine: boolean }) {
  if (!isMine) return null;
  if (msg.id.startsWith('temp_')) return <Clock className="flex-shrink-0" style={{ width: 10, height: 10, color: 'rgba(255,255,255,0.28)' }} />;
  if (msg.seenBy.length > 1) return <CheckCheck className="flex-shrink-0" style={{ width: 11, height: 11, color: '#93c5fd' }} />;
  return <Check className="flex-shrink-0" style={{ width: 10, height: 10, color: 'rgba(255,255,255,0.38)' }} />;
}

/* ─── Typing indicator ────────────────────────────────────── */
function TypingIndicator({ users }: { users: TypingUser[] }) {
  if (!users.length) return null;
  const u = users[0];
  return (
    <div className="flex items-end gap-2 px-3 pb-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <Avatar user={{ id: u.id, name: u.name, avatarUrl: u.avatarUrl, headline: null, docrudGo: false }} size={7} />
      <div>
        <div className="flex items-center gap-1 rounded-[16px] rounded-bl-[4px] px-3.5 py-2.5" style={{ background: 'rgba(28,30,46,0.80)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="typing-dot" /><span className="typing-dot" style={{ animationDelay: '.15s' }} /><span className="typing-dot" style={{ animationDelay: '.3s' }} />
        </div>
        <p className="text-[9.5px] mt-0.5 pl-0.5" style={{ color: 'rgba(255,255,255,0.22)' }}>{u.name.split(' ')[0]} is typing…</p>
      </div>
    </div>
  );
}

/* ─── Message Bubble ─────────────────────────────────────── */
function MessageBubble({
  msg, isMine, isLast, isIndexed, onDelete, onToggleIndex, onReply, onScrollToReply, msgRef, currentUserId, otherUserName,
}: {
  msg: Message; isMine: boolean;
  isLast: boolean; isIndexed: boolean;
  onDelete: (id: string) => void; onToggleIndex: (id: string) => void;
  onReply: (msg: Message) => void; onScrollToReply: (id: string) => void;
  msgRef: (el: HTMLDivElement | null) => void;
  currentUserId: string; otherUserName: string;
}) {
  const [lightbox, setLightbox] = useState(false);
  const [menu, setMenu] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const lpRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const sentR = isLast ? 'rounded-[17px] rounded-br-[4px]' : 'rounded-[17px]';
  const recvR = isLast ? 'rounded-[17px] rounded-bl-[4px]' : 'rounded-[17px]';
  const br = isMine ? sentR : recvR;
  const recvBg = 'rgba(28,30,46,0.82)';

  const replyPreview = msg.replyTo ? (
    <button
      onClick={() => onScrollToReply(msg.replyTo!.id)}
      className="w-full text-left rounded-[10px] mb-1.5 overflow-hidden transition-opacity hover:opacity-80"
      style={{
        borderLeft: `2.5px solid ${isMine ? 'rgba(255,255,255,0.40)' : 'rgba(96,165,250,0.65)'}`,
        background: isMine ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.06)',
        padding: '5px 8px',
      }}
    >
      <p style={{ fontSize: 10, fontWeight: 700, color: isMine ? 'rgba(255,255,255,0.55)' : '#60a5fa', marginBottom: 1 }}>
        {msg.replyTo.senderId === currentUserId ? 'You' : otherUserName.split(' ')[0]}
      </p>
      <p className="truncate" style={{ fontSize: 11, color: isMine ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.50)' }}>
        {msg.replyTo.type === 'image' ? '📷 Photo' : msg.replyTo.type === 'file' ? `📎 ${msg.replyTo.attachmentName ?? 'File'}` : msg.replyTo.content}
      </p>
    </button>
  ) : null;

  return (
    <>
      {/* Portalled to <body>: the chat column is a transformed/animated
          ancestor, which would otherwise become the containing block for
          these fixed overlays and clip them to the column. */}
      {mounted && lightbox && msg.attachmentUrl && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(24px)' }} onClick={() => setLightbox(false)}>
          <button className="absolute h-9 w-9 rounded-full flex items-center justify-center transition-colors" style={{ top: 'max(16px, env(safe-area-inset-top))', right: 16, background: 'rgba(255,255,255,0.09)' }}><X style={{ width: 16, height: 16, color: '#fff' }} /></button>
          <img src={msg.attachmentUrl} alt="" className="rounded-xl object-contain" style={{ maxHeight: 'min(88dvh, 100%)', maxWidth: '100%' }} />
        </div>,
        document.body
      )}

      <div
        ref={msgRef}
        id={`msg-${msg.id}`}
        className="group flex items-end w-full overflow-hidden"
        style={{ marginBottom: 2, justifyContent: isMine ? 'flex-end' : 'flex-start' }}
        onTouchStart={() => { lpRef.current = setTimeout(() => setMenu(true), 520); }}
        onTouchEnd={() => { if (lpRef.current) clearTimeout(lpRef.current); }}
        onTouchCancel={() => { if (lpRef.current) clearTimeout(lpRef.current); }}
      >
        {/* Bubble + inline action */}
        <div
          className={`msg-bubble relative flex items-end ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
          style={{ gap: 4 }}
        >
          {/* Context menu trigger — only visible on hover/long-press */}
          <div ref={menuRef} className="relative flex-shrink-0 self-end" style={{ marginBottom: 3 }}>
            <button
              onClick={() => setMenu(v => !v)}
              className="h-6 w-6 rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 active:scale-90 sm:flex hidden"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <MoreHorizontal style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.50)' }} />
            </button>
            {menu && (
              <div
                className={`absolute bottom-8 ${isMine ? 'right-0' : 'left-0'} rounded-[16px] overflow-hidden animate-in fade-in zoom-in-95 duration-150`}
                style={{ width: 180, background: 'rgba(14,15,24,0.96)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 64px rgba(0,0,0,0.85)', zIndex: 50 }}
              >
                <div className="px-3.5 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', fontWeight: 600, letterSpacing: '0.03em' }}>{fmtTime(msg.sentAt)}</p>
                </div>
                {[
                  { icon: <CornerUpLeft style={{ width: 13, height: 13 }} />, label: 'Reply', onClick: () => { setMenu(false); onReply(msg); }, color: 'rgba(255,255,255,0.68)' },
                  { icon: isIndexed ? <BookmarkCheck style={{ width: 13, height: 13 }} /> : <Bookmark style={{ width: 13, height: 13 }} />, label: isIndexed ? 'Remove bookmark' : 'Bookmark', onClick: () => { setMenu(false); onToggleIndex(msg.id); }, color: isIndexed ? '#fbbf24' : 'rgba(255,255,255,0.68)' },
                  ...(isMine ? [{ icon: <Trash2 style={{ width: 13, height: 13 }} />, label: 'Delete', onClick: () => { setMenu(false); onDelete(msg.id); }, color: '#f87171' }] : []),
                ].map((item, i) => (
                  <button
                    key={i}
                    onClick={item.onClick}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 transition-colors"
                    style={{ color: item.color, fontSize: 13, fontWeight: 500 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    {item.icon}{item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mobile long-press menu — portalled for the same reason */}
          {mounted && menu && createPortal(
            <div className="sm:hidden fixed inset-0 z-[60] flex flex-col justify-end" onClick={() => setMenu(false)}>
              <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(6px)' }} />
              <div className="relative rounded-t-[24px] overflow-hidden" style={{ background: 'rgba(12,13,22,0.98)', border: '1px solid rgba(255,255,255,0.09)' }} onClick={e => e.stopPropagation()}>
                <div className="flex justify-center pt-3 pb-1"><div style={{ width: 36, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.15)' }} /></div>
                <div className="px-4 pt-1 pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="truncate" style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontWeight: 500 }}>
                    {msg.type === 'image' ? '📷 Image' : msg.type === 'file' ? `📎 ${msg.attachmentName}` : msg.content.slice(0, 60) + (msg.content.length > 60 ? '…' : '')}
                  </p>
                </div>
                {[
                  { icon: <CornerUpLeft style={{ width: 16, height: 16 }} />, label: 'Reply', onClick: () => { setMenu(false); onReply(msg); } },
                  { icon: isIndexed ? <BookmarkCheck style={{ width: 16, height: 16 }} /> : <Bookmark style={{ width: 16, height: 16 }} />, label: isIndexed ? 'Remove Bookmark' : 'Bookmark', onClick: () => { setMenu(false); onToggleIndex(msg.id); } },
                  ...(isMine ? [{ icon: <Trash2 style={{ width: 16, height: 16 }} />, label: 'Delete Message', onClick: () => { setMenu(false); onDelete(msg.id); }, danger: true }] : []),
                ].map((item, i) => (
                  <button
                    key={i}
                    onClick={item.onClick}
                    className="w-full flex items-center gap-3.5 px-5 active:bg-white/5"
                    style={{ height: 52, color: (item as { danger?: boolean }).danger ? '#f87171' : 'rgba(255,255,255,0.80)', fontSize: 15, fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <span style={{ color: (item as { danger?: boolean }).danger ? '#f87171' : 'rgba(255,255,255,0.40)' }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
                <div style={{ height: 'max(16px, env(safe-area-inset-bottom))' }} />
              </div>
            </div>,
            document.body
          )}

          {/* Bookmark pip */}
          {isIndexed && (
            <div className="flex-shrink-0 self-end" style={{ marginBottom: 5 }}>
              <BookmarkCheck style={{ width: 9, height: 9, color: '#fbbf24' }} />
            </div>
          )}

          {/* Bubble */}
          {msg.type === 'image' && msg.attachmentUrl ? (
            <div className="msg-img-bubble flex flex-col overflow-hidden">
              {replyPreview && <div style={{ padding: '6px 6px 0 6px' }}>{replyPreview}</div>}
              <div className={`relative cursor-pointer overflow-hidden ${br}`} onClick={() => setLightbox(true)} style={isMine ? { boxShadow: '0 4px 20px rgba(59,130,246,0.28)' } : {}}>
                <img src={msg.attachmentUrl} alt="" className="block object-cover rounded-[inherit]" style={{ maxHeight: 'min(220px, 34dvh)', maxWidth: '100%', width: 'auto' }} loading="lazy" />
                <div className="absolute bottom-1.5 right-2 flex items-center gap-1 rounded-full px-1.5 py-0.5" style={{ background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(8px)' }}>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.82)' }}>{fmtTime(msg.sentAt)}</span>
                  <StatusIcon msg={msg} isMine={isMine} />
                </div>
              </div>
            </div>
          ) : msg.type === 'file' ? (
            <div className={`msg-file-bubble ${br} overflow-hidden`} style={{ padding: '10px 12px', maxWidth: '100%', background: isMine ? 'linear-gradient(135deg,#3b82f6,#1d4ed8)' : recvBg, border: isMine ? 'none' : '1px solid rgba(255,255,255,0.09)', boxShadow: isMine ? '0 4px 20px rgba(59,130,246,0.28)' : 'none', color: '#fff' }}>
              {replyPreview}
              <a href={msg.attachmentUrl} download={msg.attachmentName} target="_blank" rel="noreferrer" className="flex items-center gap-2.5">
                <div className="flex-shrink-0 rounded-[10px] flex items-center justify-center" style={{ width: 34, height: 34, background: isMine ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)' }}>
                  <File style={{ width: 14, height: 14 }} />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="truncate font-semibold" style={{ fontSize: 12 }}>{msg.attachmentName}</p>
                  {msg.attachmentSize && <p style={{ fontSize: 10, color: isMine ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.35)', marginTop: 1 }}>{fmtBytes(msg.attachmentSize)}</p>}
                </div>
              </a>
              <div className="flex items-center justify-end gap-1 mt-1.5">
                <span style={{ fontSize: 9, color: isMine ? 'rgba(255,255,255,0.50)' : 'rgba(255,255,255,0.30)' }}>{fmtTime(msg.sentAt)}</span>
                <StatusIcon msg={msg} isMine={isMine} />
              </div>
            </div>
          ) : (
            <div
              className={`${br} overflow-hidden`}
              style={{
                padding: '9px 13px',
                maxWidth: '100%',
                background: isMine ? 'linear-gradient(135deg,#3b82f6,#1d4ed8)' : recvBg,
                backdropFilter: isMine ? undefined : 'blur(14px)',
                WebkitBackdropFilter: isMine ? undefined : 'blur(14px)',
                border: isMine ? 'none' : '1px solid rgba(255,255,255,0.09)',
                boxShadow: isMine ? '0 4px 20px rgba(59,130,246,0.28)' : 'none',
                color: '#fff',
              }}
            >
              {replyPreview}
              <p style={{
                fontSize: 14.5,
                lineHeight: '1.55',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
                color: isMine ? '#fff' : 'rgba(255,255,255,0.92)',
                letterSpacing: '-0.01em',
              }}>
                {msg.content}
              </p>
              <div className="flex items-center justify-end gap-[3px]" style={{ marginTop: 4 }}>
                <span style={{ fontSize: 9.5, color: isMine ? 'rgba(255,255,255,0.48)' : 'rgba(255,255,255,0.28)' }}>{fmtTime(msg.sentAt)}</span>
                <StatusIcon msg={msg} isMine={isMine} />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Chat Settings Panel ────────────────────────────────── */
function ChatSettingsPanel({
  convId, meta, onSave, saving, onClose, onShareCatalogue,
  quickReplies, autoReplySettings, onQuickRepliesChange, onAutoReplyChange,
  businessProfile, onBusinessProfileChange, onInsertText,
}: {
  convId: string; meta: ChatMeta;
  onSave: (patch: Partial<ChatMeta>) => Promise<void>;
  saving: boolean; onClose: () => void;
  onShareCatalogue: () => void;
  quickReplies: QuickReply[];
  autoReplySettings: AutoReplySettings | null;
  onQuickRepliesChange: (replies: QuickReply[]) => void;
  onAutoReplyChange: (settings: AutoReplySettings) => void;
  businessProfile: BusinessProfile;
  onBusinessProfileChange: (p: BusinessProfile) => void;
  onInsertText: (text: string) => void;
}) {
  const [notes, setNotes] = useState(meta.notes ?? '');
  const [notesTimer, setNotesTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  // Auto-reply local state
  const [arEnabled, setArEnabled] = useState(autoReplySettings?.enabled ?? false);
  const [arMessage, setArMessage] = useState(autoReplySettings?.message ?? '');
  const [arCooldown, setArCooldown] = useState(autoReplySettings?.cooldownMinutes ?? 60);
  const [arSaving, setArSaving] = useState(false);
  // Quick replies local state
  const [newQrTitle, setNewQrTitle] = useState('');
  const [newQrContent, setNewQrContent] = useState('');
  const [addingQr, setAddingQr] = useState(false);
  const [showAddQr, setShowAddQr] = useState(false);
  // Business tools local state
  const [openBizCat, setOpenBizCat] = useState<BizCategory | null>(null);
  const [bizForm, setBizForm] = useState<{ label: string; value: string; extra: string }>({ label: '', value: '', extra: '' });
  const [bizSaving, setBizSaving] = useState(false);
  const [editingBizId, setEditingBizId] = useState<string | null>(null);

  // Sync notes + AR when meta/settings change
  useEffect(() => { setNotes(meta.notes ?? ''); }, [meta.notes]);
  useEffect(() => {
    if (autoReplySettings) {
      setArEnabled(autoReplySettings.enabled);
      setArMessage(autoReplySettings.message);
      setArCooldown(autoReplySettings.cooldownMinutes);
    }
  }, [autoReplySettings]);

  function handleNotesChange(val: string) {
    setNotes(val);
    if (notesTimer) clearTimeout(notesTimer);
    setNotesTimer(setTimeout(() => onSave({ notes: val }), 900));
  }

  function togglePin() {
    onSave({ pinnedAt: meta.pinnedAt ? '' : new Date().toISOString() });
  }

  function setLabel(label: string, color: string) {
    if (meta.label === label) { onSave({ label: '', labelColor: '' }); }
    else { onSave({ label, labelColor: color }); }
  }

  function setBg(key: string) {
    onSave({ bgColor: key === 'default' ? '' : key });
  }

  async function saveAutoReply() {
    setArSaving(true);
    try {
      const r = await fetch('/api/messages/auto-reply', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: arEnabled, message: arMessage, cooldownMinutes: arCooldown }),
      });
      if (r.ok) {
        const d = await r.json() as { settings: AutoReplySettings };
        onAutoReplyChange(d.settings);
      }
    } catch { /* silent */ } finally { setArSaving(false); }
  }

  async function addBizTool(cat: BizCategory) {
    if (!bizForm.label.trim() || !bizForm.value.trim()) return;
    setBizSaving(true);
    try {
      const r = await fetch('/api/messages/business-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', category: cat, item: bizForm }),
      });
      if (r.ok) { const d = await r.json() as { profile: BusinessProfile }; onBusinessProfileChange(d.profile); setBizForm({ label: '', value: '', extra: '' }); setOpenBizCat(null); }
    } catch { /* silent */ } finally { setBizSaving(false); }
  }

  async function updateBizTool(cat: BizCategory, id: string) {
    if (!bizForm.label.trim() || !bizForm.value.trim()) return;
    setBizSaving(true);
    try {
      const r = await fetch('/api/messages/business-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', category: cat, id, item: bizForm }),
      });
      if (r.ok) { const d = await r.json() as { profile: BusinessProfile }; onBusinessProfileChange(d.profile); setEditingBizId(null); setBizForm({ label: '', value: '', extra: '' }); }
    } catch { /* silent */ } finally { setBizSaving(false); }
  }

  async function deleteBizTool(cat: BizCategory, id: string) {
    try {
      const r = await fetch('/api/messages/business-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', category: cat, id }),
      });
      if (r.ok) { const d = await r.json() as { profile: BusinessProfile }; onBusinessProfileChange(d.profile); }
    } catch { /* silent */ }
  }

  function startEditBiz(tool: BusinessTool) {
    setEditingBizId(tool.id);
    setBizForm({ label: tool.label, value: tool.value, extra: tool.extra ?? '' });
  }

  async function addQuickReply() {
    if (!newQrTitle.trim() || !newQrContent.trim()) return;
    setAddingQr(true);
    try {
      const r = await fetch('/api/messages/quick-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newQrTitle.trim(), content: newQrContent.trim() }),
      });
      if (r.ok) {
        const d = await r.json() as { reply: QuickReply };
        onQuickRepliesChange([...quickReplies, d.reply]);
        setNewQrTitle(''); setNewQrContent(''); setShowAddQr(false);
      }
    } catch { /* silent */ } finally { setAddingQr(false); }
  }

  async function deleteQuickReply(id: string) {
    try {
      await fetch(`/api/messages/quick-replies?id=${id}`, { method: 'DELETE' });
      onQuickRepliesChange(quickReplies.filter(q => q.id !== id));
    } catch { /* silent */ }
  }

  const SectionHeader = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
    <div className="flex items-center gap-1.5 mb-2">
      <span style={{ color: 'rgba(255,255,255,0.30)' }}>{icon}</span>
      <p style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>{label}</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full" style={{ background: '#0D0D0F', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 shrink-0" style={{ height: 50, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <Settings2 style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.55)' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>Chat Settings</span>
        </div>
        <button onClick={onClose} className="h-6 w-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <X style={{ width: 11, height: 11, color: 'rgba(255,255,255,0.45)' }} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto cs">
        {/* Quick actions */}
        <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <SectionHeader icon={<Zap style={{ width: 10, height: 10 }} />} label="Quick Actions" />
          <div className="flex flex-col gap-1.5">
            <button
              onClick={onShareCatalogue}
              className="w-full flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 transition-all active:scale-[0.98]"
              style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.18)', color: '#60a5fa' }}
            >
              <Store style={{ width: 13, height: 13, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>Share My Catalogue</span>
            </button>
            <button
              onClick={togglePin}
              className="w-full flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 transition-all active:scale-[0.98]"
              style={{ background: meta.pinnedAt ? 'rgba(245,158,11,0.07)' : 'rgba(255,255,255,0.04)', border: `1px solid ${meta.pinnedAt ? 'rgba(245,158,11,0.22)' : 'rgba(255,255,255,0.08)'}`, color: meta.pinnedAt ? '#fbbf24' : 'rgba(255,255,255,0.50)' }}
            >
              {meta.pinnedAt ? <PinOff style={{ width: 13, height: 13, flexShrink: 0 }} /> : <Pin style={{ width: 13, height: 13, flexShrink: 0 }} />}
              <span style={{ fontSize: 12, fontWeight: 600 }}>{meta.pinnedAt ? 'Unpin Chat' : 'Pin Chat'}</span>
            </button>
          </div>
        </div>

        {/* Business Tools */}
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="px-4 pt-3 pb-2">
            <SectionHeader icon={<Briefcase style={{ width: 10, height: 10 }} />} label="Business Tools" />
          </div>
          {BIZ_CATEGORIES.map(cat => {
            const items = businessProfile[cat.key] as BusinessTool[];
            const isOpen = openBizCat === cat.key;
            const catIcons: Record<BizCategory, React.ReactNode> = {
              catalogues: <Store style={{ width: 12, height: 12 }} />,
              meetings: <Calendar style={{ width: 12, height: 12 }} />,
              payments: <CreditCard style={{ width: 12, height: 12 }} />,
              contacts: <PhoneCall style={{ width: 12, height: 12 }} />,
            };
            return (
              <div key={cat.key} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                {/* Category header */}
                <button
                  onClick={() => { setOpenBizCat(isOpen ? null : cat.key); setBizForm({ label: '', value: '', extra: '' }); setEditingBizId(null); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 transition-all active:opacity-70"
                >
                  <span style={{ color: cat.color }}>{catIcons[cat.key]}</span>
                  <span className="flex-1 text-left font-semibold" style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{cat.label}</span>
                  {items.length > 0 && (
                    <span className="rounded-full font-bold" style={{ fontSize: 9, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', background: `${cat.color}20`, color: cat.color }}>{items.length}</span>
                  )}
                  <ChevronDown style={{ width: 11, height: 11, color: 'rgba(255,255,255,0.25)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>

                {isOpen && (
                  <div className="px-3 pb-3 animate-in fade-in duration-150">
                    {/* Saved items */}
                    {items.length > 0 && (
                      <div className="flex flex-col gap-1.5 mb-2">
                        {items.map(tool => (
                          <div key={tool.id}>
                            {editingBizId === tool.id ? (
                              /* Inline edit form */
                              <div className="rounded-[11px] p-2.5" style={{ background: `${cat.color}08`, border: `1px solid ${cat.border}` }}>
                                {cat.suggestions.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mb-2">
                                    {cat.suggestions.map(s => (
                                      <button key={s} onClick={() => setBizForm(f => ({ ...f, label: s }))}
                                        className="rounded-full px-2 py-0.5 text-[9.5px] font-semibold transition-all active:scale-95"
                                        style={{ background: bizForm.label === s ? `${cat.color}25` : 'rgba(255,255,255,0.04)', border: `1px solid ${bizForm.label === s ? cat.color + '50' : 'rgba(255,255,255,0.07)'}`, color: bizForm.label === s ? cat.color : 'rgba(255,255,255,0.35)' }}>
                                        {s}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <input value={bizForm.label} onChange={e => setBizForm(f => ({ ...f, label: e.target.value }))} placeholder={cat.placeholder.label}
                                  className="w-full outline-none rounded-[7px] placeholder:text-white/15 mb-1.5"
                                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#fff', fontSize: 16, padding: '6px 9px', boxSizing: 'border-box' }} />
                                <input value={bizForm.value} onChange={e => setBizForm(f => ({ ...f, value: e.target.value }))} placeholder={cat.placeholder.value}
                                  className="w-full outline-none rounded-[7px] placeholder:text-white/15 mb-1.5"
                                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#fff', fontSize: 16, padding: '6px 9px', boxSizing: 'border-box' }} />
                                <input value={bizForm.extra} onChange={e => setBizForm(f => ({ ...f, extra: e.target.value }))} placeholder={cat.placeholder.extra}
                                  className="w-full outline-none rounded-[7px] placeholder:text-white/15 mb-2"
                                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#fff', fontSize: 16, padding: '6px 9px', boxSizing: 'border-box' }} />
                                <div className="flex gap-1.5">
                                  <button onClick={() => updateBizTool(cat.key, tool.id)} disabled={bizSaving || !bizForm.label.trim() || !bizForm.value.trim()}
                                    className="flex-1 flex items-center justify-center gap-1 rounded-[7px] py-1.5 transition-all active:scale-95 disabled:opacity-50"
                                    style={{ background: `${cat.color}15`, border: `1px solid ${cat.color}35`, fontSize: 11, fontWeight: 600, color: cat.color }}>
                                    {bizSaving ? <div style={{ width: 9, height: 9, borderRadius: '50%', border: `1.5px solid ${cat.color}40`, borderTopColor: cat.color }} className="animate-spin" /> : <Check style={{ width: 10, height: 10 }} />}Save
                                  </button>
                                  <button onClick={() => { setEditingBizId(null); setBizForm({ label: '', value: '', extra: '' }); }}
                                    className="h-7 w-7 flex items-center justify-center rounded-[7px]"
                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                    <X style={{ width: 10, height: 10, color: 'rgba(255,255,255,0.35)' }} />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* Display row */
                              <div className="flex items-center gap-2 rounded-[10px] px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <div className="flex-1 min-w-0">
                                  <p style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.70)' }}>{tool.label}</p>
                                  <p className="truncate" style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.28)', marginTop: 1 }}>{tool.value}</p>
                                  {tool.extra && <p className="truncate" style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.18)', marginTop: 0.5 }}>{tool.extra}</p>}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {/* Share */}
                                  <button
                                    onClick={() => { onInsertText(cat.shareFormat(tool)); onClose(); }}
                                    className="flex items-center gap-1 rounded-[7px] px-2 py-1.5 transition-all active:scale-90"
                                    style={{ background: `${cat.color}15`, border: `1px solid ${cat.color}30`, fontSize: 10, fontWeight: 700, color: cat.color }}
                                  >
                                    <Share2 style={{ width: 9, height: 9 }} />Share
                                  </button>
                                  {/* Edit */}
                                  <button onClick={() => startEditBiz(tool)}
                                    className="h-7 w-7 flex items-center justify-center rounded-[7px] transition-all active:scale-90"
                                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                                    <PenLine style={{ width: 9, height: 9, color: 'rgba(255,255,255,0.40)' }} />
                                  </button>
                                  {/* Delete */}
                                  <button onClick={() => deleteBizTool(cat.key, tool.id)}
                                    className="h-7 w-7 flex items-center justify-center rounded-[7px] transition-all active:scale-90"
                                    style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.14)' }}>
                                    <Trash2 style={{ width: 9, height: 9, color: '#f87171' }} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add new form */}
                    {editingBizId === null && (
                      <div className="rounded-[11px] p-2.5 animate-in fade-in duration-100" style={{ background: `${cat.color}06`, border: `1px solid ${cat.border}` }}>
                        <p style={{ fontSize: 9.5, fontWeight: 700, color: cat.color, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Add {items.length > 0 ? 'Another' : 'New'}</p>
                        {/* Quick-label suggestion chips */}
                        <div className="flex flex-wrap gap-1 mb-2">
                          {cat.suggestions.map(s => (
                            <button key={s} onClick={() => setBizForm(f => ({ ...f, label: s }))}
                              className="rounded-full px-2 py-0.5 text-[9.5px] font-semibold transition-all active:scale-95"
                              style={{ background: bizForm.label === s ? `${cat.color}25` : 'rgba(255,255,255,0.04)', border: `1px solid ${bizForm.label === s ? cat.color + '50' : 'rgba(255,255,255,0.07)'}`, color: bizForm.label === s ? cat.color : 'rgba(255,255,255,0.35)' }}>
                              {s}
                            </button>
                          ))}
                        </div>
                        <input value={bizForm.label} onChange={e => setBizForm(f => ({ ...f, label: e.target.value }))} placeholder={cat.placeholder.label}
                          className="w-full outline-none rounded-[7px] placeholder:text-white/15 mb-1.5"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#fff', fontSize: 16, padding: '6px 9px', boxSizing: 'border-box' }} />
                        <input value={bizForm.value} onChange={e => setBizForm(f => ({ ...f, value: e.target.value }))} placeholder={cat.placeholder.value}
                          className="w-full outline-none rounded-[7px] placeholder:text-white/15 mb-1.5"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#fff', fontSize: 16, padding: '6px 9px', boxSizing: 'border-box' }} />
                        <input value={bizForm.extra} onChange={e => setBizForm(f => ({ ...f, extra: e.target.value }))} placeholder={cat.placeholder.extra}
                          className="w-full outline-none rounded-[7px] placeholder:text-white/15 mb-2"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#fff', fontSize: 16, padding: '6px 9px', boxSizing: 'border-box' }} />
                        <button onClick={() => addBizTool(cat.key)} disabled={bizSaving || !bizForm.label.trim() || !bizForm.value.trim()}
                          className="w-full flex items-center justify-center gap-1.5 rounded-[8px] py-1.5 transition-all active:scale-[0.98] disabled:opacity-50"
                          style={{ background: `${cat.color}15`, border: `1px solid ${cat.color}35`, fontSize: 12, fontWeight: 600, color: cat.color }}>
                          {bizSaving ? <div style={{ width: 10, height: 10, borderRadius: '50%', border: `1.5px solid ${cat.color}30`, borderTopColor: cat.color }} className="animate-spin" /> : <Plus style={{ width: 11, height: 11 }} />}
                          Save &amp; Add
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Labels */}
        <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <SectionHeader icon={<Tag style={{ width: 10, height: 10 }} />} label="Label" />
          <div className="flex flex-wrap gap-1.5">
            {LABEL_PRESETS.map(({ label, color }) => {
              const active = meta.label === label;
              return (
                <button
                  key={label}
                  onClick={() => setLabel(label, color)}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 transition-all active:scale-95"
                  style={{
                    fontSize: 11, fontWeight: 600,
                    background: active ? `${color}22` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${active ? color + '55' : 'rgba(255,255,255,0.08)'}`,
                    color: active ? color : 'rgba(255,255,255,0.45)',
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Background */}
        <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <SectionHeader icon={<Palette style={{ width: 10, height: 10 }} />} label="Chat Background" />
          <div className="grid grid-cols-4 gap-1.5">
            {BG_PRESETS.map(({ key, label, value }) => {
              const active = (meta.bgColor ?? '') === (key === 'default' ? '' : key);
              return (
                <button
                  key={key}
                  onClick={() => setBg(key)}
                  className="flex flex-col items-center gap-1 rounded-[10px] py-2 px-1 transition-all active:scale-95"
                  style={{
                    background: active ? 'rgba(139,92,246,0.14)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${active ? 'rgba(139,92,246,0.40)' : 'rgba(255,255,255,0.07)'}`,
                  }}
                >
                  <div className="rounded-[6px] overflow-hidden" style={{ width: 32, height: 22, background: value || 'rgba(7,8,14,1)', flexShrink: 0 }} />
                  <span style={{ fontSize: 9, fontWeight: 600, color: active ? '#a78bfa' : 'rgba(255,255,255,0.35)', lineHeight: 1 }}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Auto-Reply */}
        <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <SectionHeader icon={<Bell style={{ width: 10, height: 10 }} />} label="Auto-Reply" />
          {/* Toggle */}
          <div className="flex items-center justify-between mb-2.5">
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>Enable Auto-Reply</p>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>Auto-reply to incoming messages</p>
            </div>
            <button
              onClick={() => setArEnabled(v => !v)}
              className="transition-all active:scale-90"
            >
              {arEnabled
                ? <ToggleRight style={{ width: 28, height: 28, color: '#34d399' }} />
                : <ToggleLeft style={{ width: 28, height: 28, color: 'rgba(255,255,255,0.20)' }} />}
            </button>
          </div>
          {/* Message */}
          <div className="mb-2">
            <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.30)', marginBottom: 4 }}>Auto-Reply Message</p>
            <textarea
              value={arMessage}
              onChange={e => setArMessage(e.target.value)}
              placeholder="Hi! I'm currently unavailable, I'll get back to you shortly."
              rows={3}
              className="w-full resize-none outline-none rounded-[10px] placeholder:text-white/15"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.70)', fontSize: 16, lineHeight: '1.55', padding: '8px 11px', boxSizing: 'border-box' }}
            />
          </div>
          {/* Cooldown */}
          <div className="flex items-center gap-2 mb-2.5">
            <Timer style={{ width: 10, height: 10, color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
            <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.30)', flexShrink: 0 }}>Cooldown</p>
            <select
              value={arCooldown}
              onChange={e => setArCooldown(Number(e.target.value))}
              className="flex-1 outline-none rounded-[8px] appearance-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.60)', fontSize: 16, padding: '5px 10px', boxSizing: 'border-box' }}
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={120}>2 hours</option>
              <option value={240}>4 hours</option>
              <option value={1440}>24 hours</option>
            </select>
          </div>
          <button
            onClick={saveAutoReply}
            disabled={arSaving}
            className="w-full flex items-center justify-center gap-1.5 rounded-[10px] py-2 transition-all active:scale-[0.98] disabled:opacity-60"
            style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.20)', fontSize: 12, fontWeight: 600, color: '#34d399' }}
          >
            {arSaving ? <div style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid rgba(52,211,153,0.30)', borderTopColor: '#34d399' }} className="animate-spin" /> : <Check style={{ width: 11, height: 11 }} />}
            Save Auto-Reply
          </button>
        </div>

        {/* Quick Replies */}
        <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center justify-between mb-2">
            <SectionHeader icon={<Zap style={{ width: 10, height: 10 }} />} label="Quick Replies" />
            <button
              onClick={() => setShowAddQr(v => !v)}
              className="h-5 w-5 rounded-full flex items-center justify-center transition-all"
              style={{ background: showAddQr ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.07)', border: `1px solid ${showAddQr ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.08)'}` }}
            >
              {showAddQr ? <X style={{ width: 9, height: 9, color: '#60a5fa' }} /> : <Plus style={{ width: 9, height: 9, color: 'rgba(255,255,255,0.45)' }} />}
            </button>
          </div>
          {showAddQr && (
            <div className="mb-2 rounded-[11px] p-2.5 animate-in fade-in duration-150" style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.12)' }}>
              <input
                value={newQrTitle}
                onChange={e => setNewQrTitle(e.target.value)}
                placeholder="Title (e.g. Greeting)"
                className="w-full outline-none rounded-[8px] placeholder:text-white/20 mb-1.5"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#fff', fontSize: 16, padding: '7px 10px', boxSizing: 'border-box' }}
              />
              <textarea
                value={newQrContent}
                onChange={e => setNewQrContent(e.target.value)}
                placeholder="Reply text…"
                rows={2}
                className="w-full resize-none outline-none rounded-[8px] placeholder:text-white/20 mb-2"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#fff', fontSize: 16, lineHeight: '1.5', padding: '7px 10px', boxSizing: 'border-box' }}
              />
              <button
                onClick={addQuickReply}
                disabled={addingQr || !newQrTitle.trim() || !newQrContent.trim()}
                className="w-full flex items-center justify-center gap-1.5 rounded-[8px] py-1.5 transition-all active:scale-[0.98] disabled:opacity-50"
                style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', fontSize: 11.5, fontWeight: 600, color: '#60a5fa' }}
              >
                {addingQr ? <div style={{ width: 9, height: 9, borderRadius: '50%', border: '1.5px solid rgba(96,165,250,0.30)', borderTopColor: '#60a5fa' }} className="animate-spin" /> : <Plus style={{ width: 10, height: 10 }} />}
                Add Reply
              </button>
            </div>
          )}
          {quickReplies.length === 0 && !showAddQr && (
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.20)', textAlign: 'center', padding: '8px 0' }}>No quick replies yet. Tap + to add one.</p>
          )}
          <div className="flex flex-col gap-1">
            {quickReplies.map(qr => (
              <div key={qr.id} className="flex items-start gap-2 rounded-[10px] px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>{qr.title}</p>
                  <p className="truncate" style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{qr.content}</p>
                </div>
                <button
                  onClick={() => deleteQuickReply(qr.id)}
                  className="flex-shrink-0 h-5 w-5 rounded-full flex items-center justify-center transition-all"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.16)' }}
                >
                  <Trash2 style={{ width: 8, height: 8, color: '#f87171' }} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="px-4 py-3">
          <SectionHeader icon={<StickyNote style={{ width: 10, height: 10 }} />} label="Private Notes" />
          <textarea
            value={notes}
            onChange={e => handleNotesChange(e.target.value)}
            placeholder="Add private notes about this conversation…"
            rows={4}
            className="w-full resize-none outline-none rounded-[11px] placeholder:text-white/20 box-border"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.70)', fontSize: 16, lineHeight: '1.6', padding: '10px 12px', maxWidth: '100%', boxSizing: 'border-box' }}
          />
          <p style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.16)', marginTop: 4 }}>Only visible to you. Saves automatically.</p>
        </div>
      </div>

      {saving && (
        <div className="shrink-0 flex items-center justify-center gap-1.5 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ width: 9, height: 9, borderRadius: '50%', border: '1.5px solid rgba(167,139,250,0.35)', borderTopColor: '#a78bfa' }} className="animate-spin" />
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)' }}>Saving…</span>
        </div>
      )}
    </div>
  );
}

/* ─── Info Panel (right sidebar) ─────────────────────────── */
interface PanelService {
  id: string; title: string; tagline?: string; category: string;
  pricingModel: string; basePrice: number; currency: string;
  rating: number; reviewCount: number; bookingCount: number; isActive: boolean;
}

function InfoPanel({
  messages, indexedIds, currentUserId, onScrollTo, onToggleIndex,
  otherUser, onClose,
}: {
  messages: Message[]; indexedIds: string[]; currentUserId: string;
  onScrollTo: (id: string) => void; onToggleIndex: (id: string) => void;
  otherUser: OtherUser | null; onClose: () => void;
}) {
  const [openSection, setOpenSection] = useState<'index' | 'media' | 'files' | 'links' | null>('index');
  const [panelTab, setPanelTab] = useState<'info' | 'services'>('info');
  const [panelServices, setPanelServices] = useState<PanelService[]>([]);
  const [servicesLoaded, setServicesLoaded] = useState(false);
  const [servicesLoading, setServicesLoading] = useState(false);

  // Eagerly fetch services whenever the other user changes so we know whether
  // to show the Services tab at all (condition: ≥1 active service).
  useEffect(() => {
    if (!otherUser?.id) return;
    setPanelServices([]); setServicesLoaded(false); setPanelTab('info');
    setServicesLoading(true);
    fetch(`/api/services/public?userId=${otherUser.id}`)
      .then(r => r.ok ? r.json() : { services: [] })
      .then((d: { services?: PanelService[] }) => {
        setPanelServices((d.services ?? []).filter(s => s.isActive));
        setServicesLoaded(true);
      })
      .catch(() => { setPanelServices([]); setServicesLoaded(true); })
      .finally(() => setServicesLoading(false));
  }, [otherUser?.id]);

  const indexed = indexedIds
    .map(id => messages.find(m => m.id === id))
    .filter(Boolean) as Message[];
  const media = messages.filter(m => m.type === 'image' && m.attachmentUrl);
  const files = messages.filter(m => m.type === 'file' && m.attachmentName);
  const links: { url: string; msgId: string; sentAt: string }[] = [];
  for (const m of messages) {
    if (m.type === 'text') {
      for (const url of extractLinks(m.content)) {
        links.push({ url, msgId: m.id, sentAt: m.sentAt });
      }
    }
  }

  function Section({ id, label, count, icon, children }: {
    id: 'index' | 'media' | 'files' | 'links'; label: string; count: number;
    icon: React.ReactNode; children: React.ReactNode;
  }) {

    const open = openSection === id;
    return (
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <button
          className="w-full flex items-center gap-2.5 px-4 py-3 transition-colors"
          style={{ background: open ? 'rgba(255,255,255,0.03)' : 'transparent' }}
          onClick={() => setOpenSection(open ? null : id)}
          onMouseEnter={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'; }}
          onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.background = ''; }}
        >
          <span style={{ color: 'rgba(255,255,255,0.40)' }}>{icon}</span>
          <span className="flex-1 text-left font-semibold" style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)' }}>{label}</span>
          {count > 0 && (
            <span className="rounded-full flex items-center justify-center font-bold" style={{ fontSize: 9, minWidth: 16, height: 16, padding: '0 4px', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.40)' }}>{count}</span>
          )}
          {open
            ? <ChevronDown style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.30)' }} />
            : <ChevronRight style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.20)' }} />}
        </button>
        {open && <div className="animate-in fade-in duration-150">{children}</div>}
      </div>
    );
  }

  const hasServices = servicesLoaded && panelServices.length > 0;

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: '#0D0D0F', borderLeft: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 shrink-0" style={{ height: 50, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <Info style={{ width: 13, height: 13, color: 'rgba(255,255,255,0.55)' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>Chat Info</span>
        </div>
        <button
          onClick={onClose}
          className="h-6 w-6 rounded-full flex items-center justify-center transition-colors"
          style={{ background: 'rgba(255,255,255,0.06)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.11)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
        >
          <X style={{ width: 11, height: 11, color: 'rgba(255,255,255,0.50)' }} />
        </button>
      </div>

      {/* User mini-card */}
      {otherUser && (
        <div className="flex flex-col items-center gap-2 px-4 py-5 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.052)' }}>
          <Avatar user={otherUser} size={12} />
          <div className="text-center">
            <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{otherUser.name}</p>
            <div className="mt-1 flex justify-center"><PresenceBadge userId={otherUser.id} /></div>
            {otherUser.headline && <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.30)', marginTop: 2 }}>{otherUser.headline}</p>}
          </div>
          <Link
            href={`/u/${otherUser.id}`}
            className="flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 transition-colors"
            style={{ fontSize: 11, fontWeight: 600, color: '#60a5fa', background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.22)' }}
          >
            View profile <ExternalLink style={{ width: 10, height: 10 }} />
          </Link>
        </div>
      )}

      {/* Tab bar — Services tab only shown when ≥1 active service exists */}
      {hasServices && (
        <div className="flex shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {([
            { id: 'info' as const, label: 'Chat Info', icon: <Info style={{ width: 11, height: 11 }} /> },
            { id: 'services' as const, label: 'Services', icon: <Briefcase style={{ width: 11, height: 11 }} />, count: panelServices.length },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setPanelTab(t.id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 transition-colors relative"
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: panelTab === t.id ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.30)',
                borderBottom: panelTab === t.id ? '2px solid #3b82f6' : '2px solid transparent',
                background: panelTab === t.id ? 'rgba(59,130,246,0.04)' : 'transparent',
                marginBottom: -1,
              }}
            >
              <span style={{ color: panelTab === t.id ? '#60a5fa' : 'rgba(255,255,255,0.28)' }}>{t.icon}</span>
              {t.label}
              {'count' in t && (t as { count: number }).count > 0 && (
                <span className="rounded-full flex items-center justify-center font-bold"
                  style={{ fontSize: 8.5, minWidth: 15, height: 15, padding: '0 3.5px', background: 'rgba(59,130,246,0.20)', color: '#60a5fa' }}>
                  {(t as { count: number }).count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Services tab panel */}
      {panelTab === 'services' && (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5" style={{ scrollbarWidth: 'none' }}>
          {servicesLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 style={{ width: 18, height: 18, color: 'rgba(255,255,255,0.25)' }} className="animate-spin" />
            </div>
          ) : panelServices.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10">
              <Briefcase style={{ width: 22, height: 22, color: 'rgba(255,255,255,0.15)' }} />
              <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.25)' }}>No services listed</p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', textTransform: 'uppercase', paddingLeft: 4, paddingBottom: 2 }}>
                {panelServices.length} service{panelServices.length !== 1 ? 's' : ''} offered
              </p>
              {panelServices.map(svc => {
                const sym = svc.currency === 'INR' ? '₹' : svc.currency === 'EUR' ? '€' : svc.currency === 'GBP' ? '£' : '$';
                const priceLabel = svc.pricingModel === 'contact' ? 'Contact' : `${svc.pricingModel === 'starting_from' ? 'From ' : ''}${sym}${svc.basePrice.toLocaleString()}${svc.pricingModel === 'hourly' ? '/hr' : ''}`;
                return (
                  <Link
                    key={svc.id}
                    href={`/services/${otherUser?.id}`}
                    className="block rounded-[13px] p-3 transition-all"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.12)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'; }}
                  >
                    {/* Title + price */}
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-semibold leading-snug flex-1" style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)' }}>{svc.title}</p>
                      <span className="shrink-0 font-bold" style={{ fontSize: 11.5, color: '#60a5fa' }}>{priceLabel}</span>
                    </div>
                    {/* Tagline */}
                    {svc.tagline && (
                      <p className="mb-2 leading-snug" style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{svc.tagline}</p>
                    )}
                    {/* Rating + bookings */}
                    <div className="flex items-center gap-3">
                      {svc.rating > 0 && (
                        <span className="flex items-center gap-1">
                          <Star style={{ width: 9, height: 9, fill: '#fbbf24', color: '#fbbf24' }} />
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>{svc.rating.toFixed(1)}</span>
                          {svc.reviewCount > 0 && <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.22)' }}>({svc.reviewCount})</span>}
                        </span>
                      )}
                      {svc.bookingCount > 0 && (
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{svc.bookingCount} booked</span>
                      )}
                      <span className="ml-auto" style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.22)' }}>View →</span>
                    </div>
                  </Link>
                );
              })}
              {/* View full catalogue link */}
              <Link
                href={`/services/${otherUser?.id}`}
                className="flex items-center justify-center gap-1.5 rounded-[11px] py-2.5 mt-1 transition-colors"
                style={{ fontSize: 11.5, fontWeight: 600, color: '#60a5fa', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.18)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.14)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.08)'; }}
              >
                <ExternalLink style={{ width: 11, height: 11 }} /> View all services
              </Link>
            </>
          )}
        </div>
      )}

      {/* Sections — Chat Info tab */}
      {panelTab === 'info' && (
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {/* Bookmarks */}
        <Section id="index" label="Bookmarks" count={indexed.length}
          icon={<Bookmark style={{ width: 12, height: 12 }} />}>
          {indexed.length === 0 ? (
            <div className="px-4 py-4 text-center">
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)' }}>Hover a message → ··· → Bookmark</p>
            </div>
          ) : (
            <div className="px-3 pb-3 flex flex-col gap-1">
              {indexed.map(m => (
                <button
                  key={m.id}
                  onClick={() => onScrollTo(m.id)}
                  className="w-full text-left rounded-[10px] px-3 py-2.5 transition-colors group/idx"
                  style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.035)')}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <p className="flex-1 truncate leading-relaxed" style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.75)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', whiteSpace: 'normal' }}>
                      {m.type === 'image' ? '📷 Photo' : m.type === 'file' ? `📎 ${m.attachmentName}` : m.content}
                    </p>
                    <button
                      onClick={e => { e.stopPropagation(); onToggleIndex(m.id); }}
                      className="flex-shrink-0 opacity-0 group-hover/idx:opacity-100 transition-opacity"
                    >
                      <X style={{ width: 10, height: 10, color: 'rgba(255,255,255,0.30)' }} />
                    </button>
                  </div>
                  <p style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.22)', marginTop: 2 }}>
                    {m.senderId === currentUserId ? 'You' : otherUser?.name.split(' ')[0]} · {fmtTime(m.sentAt)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </Section>

        {/* Media */}
        <Section id="media" label="Photos" count={media.length}
          icon={<ImageIcon style={{ width: 12, height: 12 }} />}>
          {media.length === 0 ? (
            <p className="px-4 pb-4 text-center" style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)' }}>No photos shared yet</p>
          ) : (
            <div className="px-3 pb-3 grid grid-cols-3 gap-1">
              {media.map(m => (
                <button
                  key={m.id}
                  onClick={() => onScrollTo(m.id)}
                  className="overflow-hidden rounded-[8px] aspect-square"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  <img src={m.attachmentUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </Section>

        {/* Files */}
        <Section id="files" label="Files" count={files.length}
          icon={<File style={{ width: 12, height: 12 }} />}>
          {files.length === 0 ? (
            <p className="px-4 pb-4 text-center" style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)' }}>No files shared yet</p>
          ) : (
            <div className="px-3 pb-3 flex flex-col gap-1">
              {files.map(m => (
                <a
                  key={m.id}
                  href={m.attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                  download={m.attachmentName}
                  className="flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.035)')}
                >
                  <div className="rounded-[8px] flex items-center justify-center flex-shrink-0" style={{ width: 28, height: 28, background: 'rgba(255,255,255,0.07)' }}>
                    <File style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.50)' }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.75)' }}>{m.attachmentName}</p>
                    {m.attachmentSize && <p style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.28)', marginTop: 1 }}>{fmtBytes(m.attachmentSize)}</p>}
                  </div>
                </a>
              ))}
            </div>
          )}
        </Section>

        {/* Links */}
        <Section id="links" label="Links" count={links.length}
          icon={<Link2 style={{ width: 12, height: 12 }} />}>
          {links.length === 0 ? (
            <p className="px-4 pb-4 text-center" style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)' }}>No links shared yet</p>
          ) : (
            <div className="px-3 pb-3 flex flex-col gap-1">
              {links.map((l, i) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.035)')}
                >
                  <div className="rounded-[8px] flex items-center justify-center flex-shrink-0" style={{ width: 28, height: 28, background: 'rgba(59,130,246,0.12)' }}>
                    <ExternalLink style={{ width: 11, height: 11, color: '#60a5fa' }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" style={{ fontSize: 11.5, color: '#60a5fa' }}>{urlDomain(l.url)}</p>
                    <p className="truncate" style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{l.url}</p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </Section>
      </div>
      )}
    </div>
  );
}

/* ─── New Chat Modal ──────────────────────────────────────── */
function NewChatModal({ onClose, onStart }: { onClose: () => void; onStart: (u: SearchUser) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SearchUser | null>(null);
  const [following, setFollowing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); doSearch(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function doSearch(q: string) {
    setLoading(true);
    try {
      const r = await fetch(`/api/messages/search-users?q=${encodeURIComponent(q)}`);
      if (r.ok) setResults(((await r.json()) as { users: SearchUser[] }).users ?? []);
    } catch { /* silent */ } finally { setLoading(false); }
  }
  useEffect(() => { const t = setTimeout(() => doSearch(query), query ? 220 : 0); return () => clearTimeout(t); }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  async function followAndOpen() {
    if (!selected) return;
    setFollowing(true);
    try {
      await fetch('/api/profile/follow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUserId: selected.id, action: 'follow' }) });
      onStart({ ...selected, iFollow: true });
    } catch { /* silent */ } finally { setFollowing(false); }
  }

  if (selected) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(20px)' }} onClick={onClose} />
      <div className="relative w-full max-w-sm my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-200" style={{ maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', borderRadius: 26, border: '1px solid rgba(255,255,255,0.09)', background: '#0e0f16', boxShadow: '0 32px 96px rgba(0,0,0,0.95)' }}>
        <div className="absolute inset-x-0 top-0 h-24 pointer-events-none" style={{ background: 'linear-gradient(to bottom,rgba(59,130,246,0.07),transparent)' }} />
        <div className="flex items-center gap-2 px-5 pt-5 pb-4">
          <button onClick={() => setSelected(null)} className="h-7 w-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}><ArrowLeft style={{ width: 13, height: 13, color: 'rgba(255,255,255,0.55)' }} /></button>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.50)' }}>Start conversation</span>
        </div>
        <div className="px-5 pb-6 flex flex-col items-center text-center gap-3">
          <div className="relative">
            <Avatar user={selected} size={19} />
            {selected.isMutual && <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full flex items-center justify-center" style={{ background: '#10b981', border: '2px solid #0e0f16', boxShadow: '0 2px 8px rgba(16,185,129,0.5)' }}><UserCheck style={{ width: 11, height: 11, color: '#fff' }} /></span>}
          </div>
          <div>
            <p style={{ fontSize: 15.5, fontWeight: 700, color: '#fff' }}>{selected.name}</p>
            {selected.headline && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>{selected.headline}</p>}
          </div>
          <div className="w-full h-px my-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
          {selected.isMutual ? (
            <button onClick={() => onStart(selected)} className="w-full flex items-center justify-center gap-2 h-11 font-bold text-white transition-all active:scale-[0.97]" style={{ borderRadius: 13, background: '#3b82f6', fontSize: 13.5, boxShadow: '0 4px 20px rgba(59,130,246,0.40)' }}>
              <MessageSquare style={{ width: 15, height: 15 }} />Open Chat<ArrowRight style={{ width: 14, height: 14 }} />
            </button>
          ) : (
            <div className="w-full flex flex-col gap-2">
              {!selected.iFollow && (
                <button onClick={followAndOpen} disabled={following} className="w-full flex items-center justify-center gap-2 h-11 font-bold text-white transition-all active:scale-[0.97] disabled:opacity-60" style={{ borderRadius: 13, background: 'linear-gradient(135deg,#3b82f6,#7c3aed)', fontSize: 13, boxShadow: '0 4px 20px rgba(99,102,241,0.35)' }}>
                  {following ? <Loader2 style={{ width: 15, height: 15 }} className="animate-spin" /> : <UserPlus style={{ width: 15, height: 15 }} />}Follow & Send Request
                </button>
              )}
              <button onClick={() => onStart(selected)} className="w-full flex items-center justify-center gap-2 h-10 font-semibold transition-all active:scale-[0.97]" style={{ borderRadius: 13, background: selected.iFollow ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${selected.iFollow ? 'rgba(59,130,246,0.28)' : 'rgba(255,255,255,0.09)'}`, fontSize: 12.5, color: selected.iFollow ? '#60a5fa' : 'rgba(255,255,255,0.50)' }}>
                <MessageSquare style={{ width: 13, height: 13 }} />{selected.iFollow ? 'Send Message Request' : 'Request only'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const mutual = results.filter(u => u.isMutual);
  const fwList = results.filter(u => u.iFollow && !u.isMutual);
  const others = results.filter(u => !u.iFollow && !u.isMutual);

  function URow({ u }: { u: SearchUser }) {
    return (
      <button onClick={() => setSelected(u)} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left group transition-colors" onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
        <div className="relative flex-shrink-0">
          <Avatar user={u} size={9} />
          {u.isMutual && <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full flex items-center justify-center" style={{ background: '#10b981', border: '1.5px solid #0e0f16' }}><Check style={{ width: 8, height: 8, color: '#fff' }} /></span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold" style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{u.name}</p>
          <p className="truncate" style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)' }}>{u.isMutual ? '● Connected' : u.iFollow ? 'Following' : u.theyFollow ? 'Follows you' : u.headline ?? ''}</p>
        </div>
        <ArrowRight style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.20)', flexShrink: 0 }} />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(20px)' }} onClick={onClose} />
      <div className="relative w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200" style={{ maxHeight: 'calc(100dvh - 32px)', borderRadius: 22, border: '1px solid rgba(255,255,255,0.09)', background: '#0e0f16', boxShadow: '0 24px 80px rgba(0,0,0,0.95)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 style={{ fontSize: 14.5, fontWeight: 700, color: '#fff' }}>New Message</h2>
          <button onClick={onClose} className="h-7 w-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}><X style={{ width: 13, height: 13, color: 'rgba(255,255,255,0.55)' }} /></button>
        </div>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.055)' }}>
          <div className="flex items-center gap-2 rounded-[11px] px-3 py-2.5 transition-all" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}>
            {loading ? <Loader2 style={{ width: 13, height: 13, color: 'rgba(255,255,255,0.28)' }} className="animate-spin flex-shrink-0" /> : <Search style={{ width: 13, height: 13, color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />}
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search people by name…" style={{ flex: 1, minWidth: 0, background: 'transparent', fontSize: 16, color: '#fff', outline: 'none' }} className="placeholder:text-white/25" />
            {query && <button onClick={() => setQuery('')}><X style={{ width: 11, height: 11, color: 'rgba(255,255,255,0.28)' }} /></button>}
          </div>
        </div>
        <div style={{ flex: '1 1 auto', minHeight: 0, maxHeight: 320, overflowY: 'auto', scrollbarWidth: 'none' }}>
          {!loading && !results.length && query && <div className="flex flex-col items-center gap-2 py-10" style={{ color: 'rgba(255,255,255,0.25)' }}><Users style={{ width: 30, height: 30 }} /><p style={{ fontSize: 12 }}>No users found</p></div>}
          {!loading && !results.length && !query && <div className="flex flex-col items-center gap-2 py-10" style={{ color: 'rgba(255,255,255,0.20)' }}><Search style={{ width: 30, height: 30 }} /><p style={{ fontSize: 12 }}>Search to find people</p></div>}
          {!loading && results.length > 0 && (
            <>
              {mutual.length > 0 && <><div className="px-4 pt-3.5 pb-1"><span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(52,211,153,0.55)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>Connected</span></div>{mutual.map(u => <URow key={u.id} u={u} />)}</>}
              {fwList.length > 0 && <><div className="px-4 pt-3 pb-1"><span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(96,165,250,0.50)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>Following</span></div>{fwList.map(u => <URow key={u.id} u={u} />)}</>}
              {others.length > 0 && <><div className="px-4 pt-3 pb-1"><span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.20)', textTransform: 'uppercase', letterSpacing: '0.10em' }}>{mutual.length + fwList.length > 0 ? 'Others' : 'People'}</span></div>{others.map(u => <URow key={u.id} u={u} />)}</>}
              <div style={{ height: 8 }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────── */
function MessagesPageInner() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [requests, setRequests] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [indexedIds, setIndexedIds] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [activeTab, setActiveTab] = useState<'messages' | 'requests' | 'services'>('messages');
  const [serviceConvs, setServiceConvs] = useState<Conversation[]>([]);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);

  /* Keep the app box glued to the *visual* viewport so the composer stays
     above the mobile keyboard and above browser chrome. Writes a CSS var
     instead of state, so resizing never re-renders the message list. */
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const apply = () => {
      const h = vv ? vv.height : window.innerHeight;
      root.style.setProperty('--msg-vh', `${Math.round(h)}px`);
    };
    apply();
    vv?.addEventListener('resize', apply);
    vv?.addEventListener('scroll', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      vv?.removeEventListener('resize', apply);
      vv?.removeEventListener('scroll', apply);
      window.removeEventListener('orientationchange', apply);
      root.style.removeProperty('--msg-vh');
    };
  }, []);
  const [chatMetaMap, setChatMetaMap] = useState<Record<string, ChatMeta>>({});
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [autoReplySettings, setAutoReplySettings] = useState<AutoReplySettings | null>(null);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [activeBizPicker, setActiveBizPicker] = useState<BizCategory | null>(null);
  const [showInfinityModal, setShowInfinityModal] = useState(false);
  const EMPTY_BIZ_PROFILE: BusinessProfile = { catalogues: [], meetings: [], payments: [], contacts: [] };
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile>(EMPTY_BIZ_PROFILE);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastMsgTimeRef = useRef<number>(0);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const activeConvIdRef = useRef<string | null>(null);
  const pollAbortRef = useRef<AbortController | null>(null);
  const isPageVisibleRef = useRef(true);
  // Map from message ID → DOM node for scroll-to
  const msgNodesRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const currentUserId = session?.user?.id ?? '';
  const activeConv = [...conversations, ...requests, ...serviceConvs].find(c => c.id === activeConvId) ?? null;
  const otherUser = activeConv?.otherUser ?? null;
  const activeMeta: ChatMeta = activeConvId ? (chatMetaMap[activeConvId] ?? {}) : {};
  const activeBgStyle = activeMeta.bgColor
    ? BG_PRESETS.find(b => b.key === activeMeta.bgColor)?.value ?? ''
    : '';
  // Sort: pinned first, then by updatedAt
  const sortedConvs = [...conversations].sort((a, b) => {
    const aPinned = chatMetaMap[a.id]?.pinnedAt ? 1 : 0;
    const bPinned = chatMetaMap[b.id]?.pinnedAt ? 1 : 0;
    if (bPinned !== aPinned) return bPinned - aPinned;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  const filteredConvs = sortedConvs.filter(c => c.otherUser.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredServiceConvs = serviceConvs.filter(c => c.otherUser.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const r = await fetch('/api/messages');
      if (r.status === 403) { const d = await r.json().catch(() => ({})); if ((d as {code?:string}).code === 'INFINITY_REQUIRED') { setShowInfinityModal(true); return; } }
      if (!r.ok) return;
      const d = await r.json() as { conversations: Conversation[]; requests: Conversation[] };
      const allActive = d.conversations ?? [];
      const allRequests = d.requests ?? [];
      // Service convs: any active or request conv tagged source='service'
      const svcConvs = [...allActive, ...allRequests].filter(c => c.source === 'service');
      setServiceConvs(svcConvs);
      // Keep service convs OUT of messages/requests lists to avoid duplication
      setConversations(allActive.filter(c => c.source !== 'service'));
      setRequests(allRequests.filter(c => c.source !== 'service'));
    } catch { /* silent */ }
  }, []);

  const loadMessages = useCallback(async (convId: string) => {
    setLoadingMsgs(true);
    try {
      const r = await fetch(`/api/messages/${convId}`);
      if (!r.ok) return;
      const d = await r.json() as { messages: Message[] };
      setMessages(d.messages ?? []);
      const last = d.messages[d.messages.length - 1];
      if (last) lastMsgTimeRef.current = new Date(last.sentAt).getTime();
      setTimeout(() => scrollToBottom(false), 50);
    } catch { /* silent */ } finally { setLoadingMsgs(false); }
  }, [scrollToBottom]);

  const loadIndex = useCallback(async (convId: string) => {
    try {
      const r = await fetch(`/api/messages/${convId}/index`);
      if (r.ok) {
        const d = await r.json() as { indexedIds: string[] };
        setIndexedIds(d.indexedIds ?? []);
      }
    } catch { /* silent */ }
  }, []);

  const markRead = useCallback(async (convId: string) => {
    try {
      await fetch(`/api/messages/${convId}/read`, { method: 'POST' });
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, unreadCount: { ...c.unreadCount, [currentUserId]: 0 } } : c));
    } catch { /* silent */ }
  }, [currentUserId]);

  useEffect(() => { activeConvIdRef.current = activeConvId; }, [activeConvId]);

  /* ── Visibility tracking ── */
  useEffect(() => {
    const onVis = () => { isPageVisibleRef.current = document.visibilityState === 'visible'; };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);


  /* ── Global poll ── */
  useEffect(() => {
    if (status !== 'authenticated') return;
    let timeoutId: ReturnType<typeof setTimeout>;

    async function poll() {
      // Don't hammer when tab is hidden
      if (!isPageVisibleRef.current) {
        timeoutId = setTimeout(poll, 3000);
        return;
      }
      // Cancel any in-flight request from prior tick
      if (pollAbortRef.current) pollAbortRef.current.abort();
      const ctrl = new AbortController();
      pollAbortRef.current = ctrl;

      try {
        const convId = activeConvIdRef.current ?? '';
        const since = lastMsgTimeRef.current;
        const r = await fetch(
          `/api/messages/poll?since=${since}&conv=${encodeURIComponent(convId)}`,
          { signal: ctrl.signal }
        );
        if (!r.ok) { timeoutId = setTimeout(poll, 1500); return; }
        const d = await r.json() as {
          newMessages: Message[];
          typingUsers: TypingUser[];
          conversations: Conversation[];
          deletedMessageIds: string[];
          chatMeta?: Record<string, ChatMeta>;
        };

        // Sync chatMeta from server
        if (d.chatMeta) setChatMetaMap(d.chatMeta);

        if (Array.isArray(d.conversations)) {
          const allActive = d.conversations.filter(c => c.status === 'active');
          const allReqs = d.conversations.filter(c => c.status === 'request');
          // Preserve service/non-service split
          setServiceConvs(prev => {
            const svcIds = new Set(prev.map(c => c.id));
            const fromServer = [...allActive, ...allReqs].filter(c => c.source === 'service');
            // merge: keep any that were already service convs, update their data
            const merged = fromServer.length > 0 ? fromServer : prev.filter(c => {
              const serverVer = d.conversations.find(sc => sc.id === c.id);
              return serverVer ? serverVer.source === 'service' : svcIds.has(c.id);
            });
            return merged;
          });
          setConversations(allActive.filter(c => c.source !== 'service'));
          setRequests(allReqs.filter(c => c.source !== 'service'));
        }

        if (convId) {
          if (d.deletedMessageIds?.length) {
            setMessages(prev => prev.filter(m => !d.deletedMessageIds.includes(m.id)));
          }
          const incoming = d.newMessages ?? [];
          if (incoming.length > 0) {
            setMessages(prev => {
              const existingIds = new Set(prev.map(m => m.id));
              const fresh = incoming.filter(m => !existingIds.has(m.id));
              const patched = prev.map(m => {
                const updated = incoming.find(nm => nm.id === m.id);
                return updated ? { ...m, seenBy: updated.seenBy } : m;
              });
              if (!fresh.length) return patched;
              const combined = [...patched, ...fresh];
              lastMsgTimeRef.current = new Date(combined[combined.length - 1].sentAt).getTime();
              return combined;
            });
            setTimeout(() => scrollToBottom(true), 40);
            markRead(convId);
          }
          setTypingUsers(d.typingUsers ?? []);
        } else {
          setTypingUsers([]);
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return; // cancelled — don't reschedule
      }
      // Adaptive: 500ms when active conv open, 1200ms when just browsing list
      const delay = activeConvIdRef.current ? 500 : 1200;
      timeoutId = setTimeout(poll, delay);
    }

    poll();
    return () => {
      clearTimeout(timeoutId);
      if (pollAbortRef.current) pollAbortRef.current.abort();
    };
  }, [status, scrollToBottom, markRead]);

  const sendTyping = useCallback(async (convId: string, typing: boolean) => {
    try {
      await fetch(`/api/messages/${convId}/typing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ typing }) });
    } catch { /* silent */ }
  }, []);

  function handleInputChange(val: string) {
    setInput(val);
    const convId = activeConvIdRef.current;
    if (!convId) return;
    if (!isTypingRef.current) { isTypingRef.current = true; sendTyping(convId, true); }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      const cid = activeConvIdRef.current;
      if (cid) sendTyping(cid, false);
    }, 2500);
  }

  function selectConv(conv: Conversation) {
    setActiveConvId(conv.id);
    activeConvIdRef.current = conv.id;
    setMessages([]);
    setIndexedIds([]);
    msgNodesRef.current.clear();
    setTypingUsers([]);
    setReplyingTo(null);
    setShowChatSettings(false);
    setShowQuickReplies(false);
    setActiveBizPicker(null);
    lastMsgTimeRef.current = 0;
    setShowMobileChat(true);
    loadMessages(conv.id);
    loadIndex(conv.id);
    markRead(conv.id);
    if (conv.source === 'service') setActiveTab('services');
    else if (conv.status === 'request') setActiveTab('requests');
    else setActiveTab('messages');
  }

  async function shareCatalogue() {
    if (!activeConvId || !currentUserId) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/services/${currentUserId}`;
    const text = `📦 My Services Catalogue\nCheck out my services here: ${url}`;
    setInput(text);
    textareaRef.current?.focus();
  }

  async function handleSend() {
    if (!activeConvId || (!input.trim() && !uploadingFile) || sending) return;
    const content = input.trim();
    const replySnap = replyingTo;
    setInput('');
    setReplyingTo(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setSending(true);
    isTypingRef.current = false;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    sendTyping(activeConvId, false);

    const replyTo: ReplyTo | undefined = replySnap ? {
      id: replySnap.id,
      content: replySnap.content,
      senderId: replySnap.senderId,
      type: replySnap.type,
      attachmentName: replySnap.attachmentName,
    } : undefined;

    const tempId = `temp_${Date.now()}`;
    const opt: Message = { id: tempId, conversationId: activeConvId, senderId: currentUserId, content, type: 'text', sentAt: new Date().toISOString(), seenBy: [currentUserId], replyTo };
    setMessages(prev => [...prev, opt]);
    setTimeout(() => scrollToBottom(true), 30);

    try {
      const body: Record<string, unknown> = { content, type: 'text' };
      if (replyTo) body.replyTo = replyTo;
      const r = await fetch(`/api/messages/${activeConvId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) {
        const d = await r.json() as { message: Message };
        setMessages(prev => prev.map(m => m.id === tempId ? d.message : m));
        lastMsgTimeRef.current = new Date(d.message.sentAt).getTime();
        setConversations(prev => prev.map(c => c.id === activeConvId ? { ...c, lastMessage: { content, senderId: currentUserId, sentAt: d.message.sentAt, type: 'text' }, updatedAt: d.message.sentAt } : c));
      }
    } catch { /* silent */ } finally { setSending(false); }
  }

  async function handleFileUpload(file: File) {
    if (!activeConvId) return;
    setUploadingFile(true);
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
    const tempId = `temp_${Date.now()}`;
    const isImg = file.type.startsWith('image/');
    const opt: Message = { id: tempId, conversationId: activeConvId, senderId: currentUserId, content: isImg ? '' : file.name, type: isImg ? 'image' : 'file', attachmentUrl: previewUrl, attachmentName: file.name, attachmentSize: file.size, sentAt: new Date().toISOString(), seenBy: [currentUserId] };
    setMessages(prev => [...prev, opt]);
    setTimeout(() => scrollToBottom(true), 30);
    try {
      const fd = new FormData(); fd.append('file', file);
      const ur = await fetch('/api/messages/upload', { method: 'POST', body: fd });
      if (!ur.ok) { setMessages(prev => prev.filter(m => m.id !== tempId)); return; }
      const upload = await ur.json() as { url: string; name: string; size: number; mimeType: string; type: 'image' | 'file' };
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const r = await fetch(`/api/messages/${activeConvId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: upload.type === 'image' ? '' : upload.name, type: upload.type, attachmentUrl: upload.url, attachmentName: upload.name, attachmentSize: upload.size, attachmentMimeType: upload.mimeType }) });
      if (r.ok) { const d = await r.json() as { message: Message }; setMessages(prev => prev.map(m => m.id === tempId ? d.message : m)); lastMsgTimeRef.current = new Date(d.message.sentAt).getTime(); }
    } catch { /* silent */ } finally { setUploadingFile(false); }
  }

  async function saveChatMeta(convId: string, patch: Partial<ChatMeta>) {
    setSavingMeta(true);
    try {
      const r = await fetch(`/api/messages/${convId}/meta`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      if (r.ok) {
        const d = await r.json() as { meta: ChatMeta };
        setChatMetaMap(prev => ({ ...prev, [convId]: d.meta }));
      }
    } catch { /* silent */ } finally { setSavingMeta(false); }
  }

  const loadQuickReplies = useCallback(async () => {
    try {
      const r = await fetch('/api/messages/quick-replies');
      if (r.ok) { const d = await r.json() as { replies: QuickReply[] }; setQuickReplies(d.replies ?? []); }
    } catch { /* silent */ }
  }, []);

  const loadAutoReply = useCallback(async () => {
    try {
      const r = await fetch('/api/messages/auto-reply');
      if (r.ok) { const d = await r.json() as { settings: AutoReplySettings }; setAutoReplySettings(d.settings); }
    } catch { /* silent */ }
  }, []);

  const loadBusinessProfile = useCallback(async () => {
    try {
      const r = await fetch('/api/messages/business-profile');
      if (r.ok) { const d = await r.json() as { profile: BusinessProfile }; setBusinessProfile(d.profile); }
    } catch { /* silent */ }
  }, []);

  async function handleDelete(msgId: string) {
    if (!activeConvId || msgId.startsWith('temp_')) return;
    setMessages(prev => prev.filter(m => m.id !== msgId));
    // Also remove from index if bookmarked
    setIndexedIds(prev => prev.filter(id => id !== msgId));
    try {
      await fetch(`/api/messages/${activeConvId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: msgId }) });
    } catch { /* silent */ }
  }

  async function handleToggleIndex(msgId: string) {
    if (!activeConvId || msgId.startsWith('temp_')) return;
    const wasIndexed = indexedIds.includes(msgId);
    setIndexedIds(prev => wasIndexed ? prev.filter(id => id !== msgId) : [...prev, msgId]);
    try {
      await fetch(`/api/messages/${activeConvId}/index`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: msgId }) });
    } catch { /* silent */ }
  }

  function scrollToMsg(msgId: string) {
    const el = msgNodesRef.current.get(msgId) ?? document.getElementById(`msg-${msgId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Highlight flash
    el.style.transition = 'background 0.3s';
    el.style.borderRadius = '12px';
    el.style.background = 'rgba(59,130,246,0.12)';
    setTimeout(() => { el.style.background = ''; }, 1400);
  }

  async function handleRequest(convId: string, action: 'accept' | 'reject') {
    try {
      await fetch(`/api/messages/request/${convId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      await loadConversations();
      if (action === 'accept' && activeConvId === convId) { setConversations(prev => prev.map(c => c.id === convId ? { ...c, status: 'active' } : c)); setActiveTab('messages'); }
      else if (action === 'reject') { setActiveConvId(null); setShowMobileChat(false); }
    } catch { /* silent */ }
  }

  async function handleNewChat(user: SearchUser | OtherUser, source?: 'service') {
    setShowNewChat(false);
    try {
      const r = await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toUserId: user.id, ...(source ? { source } : {}) }) });
      if (r.status === 403) { const d = await r.json().catch(() => ({})); if ((d as {code?:string}).code === 'INFINITY_REQUIRED') { setShowInfinityModal(true); return; } }
      if (!r.ok) return;
      const d = await r.json() as { conversation: Conversation & { otherUser?: OtherUser } };
      const conv = d.conversation;
      const ou: OtherUser = d.conversation.otherUser ?? { id: user.id, name: user.name, avatarUrl: user.avatarUrl, headline: user.headline, docrudGo: user.docrudGo };
      const enriched: Conversation = { ...conv, otherUser: ou };
      if (source === 'service' || conv.source === 'service') {
        setServiceConvs(prev => prev.find(c => c.id === conv.id) ? prev.map(c => c.id === conv.id ? enriched : c) : [enriched, ...prev]);
        setActiveTab('services');
      } else if (conv.status === 'active') {
        setConversations(prev => prev.find(c => c.id === conv.id) ? prev : [enriched, ...prev]);
        setActiveTab('messages');
      } else {
        setRequests(prev => prev.find(c => c.id === conv.id) ? prev : [enriched, ...prev]);
        setActiveTab('requests');
      }
      setActiveConvId(conv.id); activeConvIdRef.current = conv.id;
      setShowMobileChat(true); setMessages([]); setIndexedIds([]); setTypingUsers([]); lastMsgTimeRef.current = 0;
      loadMessages(conv.id); loadIndex(conv.id);
    } catch { /* silent */ }
  }

  async function handleNewChatByUserId(userId: string, source?: 'service') {
    return handleNewChat({ id: userId, name: '', avatarUrl: null, headline: null, docrudGo: false }, source);
  }

  useEffect(() => {
    if (status !== 'authenticated') return;
    loadConversations();
    loadQuickReplies();
    loadAutoReply();
    loadBusinessProfile();
    const u = searchParams?.get('user');
    const initMsg = searchParams?.get('init');
    if (u) {
      // If an init message is present, this came from the service catalogue — tag as 'service'
      handleNewChatByUserId(u, initMsg ? 'service' : undefined).then(() => {
        if (initMsg) {
          // Small delay to let the conversation open before sending
          setTimeout(() => {
            setInput(initMsg);
            // Auto-send after another tick so state settles
            setTimeout(() => {
              const convId = activeConvIdRef.current;
              if (!convId) return;
              fetch(`/api/messages/${convId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: initMsg }),
              }).then(async r => {
                if (!r.ok) return;
                const d = await r.json() as { message: Message };
                setMessages(prev => [...prev, d.message]);
                setInput('');
              }).catch(() => {});
            }, 300);
          }, 600);
        }
      });
    }
    const c = searchParams?.get('conv');
    if (c) { setActiveConvId(c); activeConvIdRef.current = c; setShowMobileChat(true); loadMessages(c); loadIndex(c); }
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    const cid = activeConvIdRef.current;
    if (cid && isTypingRef.current) sendTyping(cid, false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }
  function onTextareaInput() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    // Match the CSS cap: min(120px, 30dvh) — a short landscape phone must not
    // let the composer eat the message list.
    const cap = Math.min(120, Math.max(48, Math.round(window.innerHeight * 0.3)));
    ta.style.height = `${Math.min(ta.scrollHeight, cap)}px`;
  }

  /* ── Auth states ── */
  if (status === 'loading') return (
    <div style={{ minHeight: '100vh', background: '#0D0D0F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.10)', borderTopColor: 'rgba(255,255,255,0.55)' }} className="animate-spin" />
    </div>
  );
  if (status === 'unauthenticated') return (
    <div style={{ minHeight: '100vh', background: '#0D0D0F', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{ width: 56, height: 56, borderRadius: 18, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <MessageSquare style={{ width: 24, height: 24, color: 'rgba(255,255,255,0.55)' }} />
      </div>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)' }}>Please sign in to use Messages</p>
      <Link href="/login" style={{ padding: '10px 24px', borderRadius: 11, background: '#fff', color: '#0D0D0F', fontSize: 13.5, fontWeight: 700 }}>Sign in</Link>
    </div>
  );

  const totalReqUnread = requests.length;
  const totalUnread = conversations.reduce((s, c) => s + (c.unreadCount[currentUserId] ?? 0), 0);
  const groups = groupByDate(messages);
  const isRequest = activeConv?.status === 'request';
  const isMyReq = isRequest && activeConv?.requestFrom === currentUserId;
  const isTheirReq = isRequest && activeConv?.requestFrom !== currentUserId;
  const canSend = activeConv && (activeConv.status === 'active' || isMyReq);

  // Info panel open on desktop if showInfoPanel, on mobile as overlay
  const desktopInfoOpen = showInfoPanel && !!activeConvId;

  return (
    <>
      {showInfinityModal && <InfinityUpgradeModal feature="chat" onClose={() => setShowInfinityModal(false)} returnTo="/messages" />}
      <style>{`
        /* ══════════════════════════════════════════════════════════════
           Messages — responsive system.
           Three intentional breakpoints, fluid sizing inside each:
             mobile  < 640px   list ⇄ chat as two screens
             tablet  640–1023  two panes, side panels overlay
             desktop ≥ 1024px  two panes + docked side panels
           Every rule below is scoped to .msgs-root so nothing leaks into
           portals, modals or other routes.
           ══════════════════════════════════════════════════════════════ */
        body { overflow: hidden; overscroll-behavior: none; }

        /* --msg-vh tracks the *visual* viewport, so the composer stays put
           when the mobile keyboard opens. Falls back to dvh, then vh. */
        .msgs-root { height: 100vh; height: 100dvh; height: var(--msg-vh, 100dvh);
                     width: 100%; max-width: 100%; overflow-x: hidden; position: relative; z-index: 1; }

        /* iOS refuses to zoom a focused field only at >=16px */
        .msgs-root input:not([type=range]), .msgs-root textarea { font-size: max(16px, 1em); max-width: 100%; }
        /* Media never widens its container */
        .msgs-root img, .msgs-root video { max-width: 100%; height: auto; }
        /* Long words/URLs wrap instead of pushing the page sideways */
        .msgs-root p, .msgs-root span { overflow-wrap: anywhere; }
        .msgs-root .truncate { overflow-wrap: normal; }

        .msg-header { min-height: calc(52px + env(safe-area-inset-top)); padding-top: env(safe-area-inset-top);
                      z-index: 30; }

        /* A global app rule styles .dark main / .dark header / .dark aside with
           position:relative and z-index:1. It outranks the utility classes on
           these two panes (0,1,1 vs 0,1,0), which dropped them out of their
           intended overlay stack — below 640px they laid out side by side and
           the chat pane sat entirely off-screen, leaving a blank chat view.
           These two-class selectors restore the intended positioning. */
        @media (max-width:639px){
          .msgs-root .sidebar-panel,
          .msgs-root .chat-main { position: absolute; inset: 0; z-index: 10; }
        }
        @media (min-width:640px){
          .msgs-root .sidebar-panel,
          .msgs-root .chat-main { position: relative; inset: auto; }
        }

        .msg-sidebar { width: 100%; }
        @media (min-width:640px)  { .msg-sidebar { width: clamp(224px, 30vw, 268px); } }
        @media (min-width:1024px) { .msg-sidebar { width: clamp(260px, 23vw, 320px); } }

        /* Bubbles: wide enough to read, capped so ultra-wide stays legible */
        .msg-bubble { max-width: min(78%, 620px); min-width: 0; }
        @media (max-width:400px) { .msg-bubble { max-width: 86%; } }
        .msg-img-bubble { max-width: min(240px, 100%); }
        .msg-file-bubble { min-width: min(160px, 100%); }

        .msg-ta { max-height: min(120px, 30dvh); }

        .typing-dot { display:inline-block; width:4.5px; height:4.5px; border-radius:50%; background:rgba(255,255,255,0.42); animation:tdot 1.3s infinite ease-in-out; }
        @keyframes tdot { 0%,60%,100%{transform:translateY(0);opacity:.32;} 30%{transform:translateY(-5px);opacity:1;} }
        .msg-in { animation: msgIn .18s cubic-bezier(0.22,1,0.36,1) both; }
        @keyframes msgIn { from{opacity:0;transform:translateY(7px) scale(0.97);} to{opacity:1;transform:none;} }
        .conv-in { animation: convIn .15s ease both; }
        @keyframes convIn { from{opacity:0;transform:translateX(-5px);} to{opacity:1;transform:none;} }
        .cs { -webkit-overflow-scrolling:touch; overscroll-behavior:contain; }
        .cs::-webkit-scrollbar,[data-ns]::-webkit-scrollbar { display:none; }
        .cs,[data-ns] { scrollbar-width:none; }
        /* Slide transition is mobile-only; will-change stays scoped there too,
           since it would otherwise trap fixed-position descendants. */
        .pslide { transition:transform .28s cubic-bezier(0.32,0.72,0,1); }
        @media (max-width:639px) { .pslide { will-change:transform; } }
        @media (min-width:640px) { .sidebar-panel { transform:none !important; } .chat-main { transform:none !important; } }
        .chat-bg { background-color:transparent; background-image:radial-gradient(rgba(255,255,255,0.018) 1px,transparent 1px); background-size:24px 24px; }
        .info-slide { transition:width .25s cubic-bezier(0.32,0.72,0,1); overflow:hidden; }
        /* Mobile drawer */
        .drawer-enter { animation: drawerUp .28s cubic-bezier(0.32,0.72,0,1) both; }
        @keyframes drawerUp { from{transform:translateY(100%);} to{transform:translateY(0);} }
      `}</style>

      {/* ── Solid black backdrop (matches homepage) ── */}
      <div style={{ position:'fixed', inset:0, zIndex:0, pointerEvents:'none', background:'#0D0D0F' }} />

      <div className="msgs-root flex flex-col overflow-hidden">

        {/* ── Top header ── */}
        <header className="msg-header shrink-0 flex items-center gap-2 z-30"
          style={{ paddingLeft: 12, paddingRight: 12, paddingBottom: 0, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>

          <Link href="/" className={`h-9 w-9 rounded-full flex items-center justify-center transition-all active:scale-90 ${showMobileChat ? 'hidden sm:flex' : 'flex'}`} style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)' }}>
            <ArrowLeft style={{ width: 15, height: 15, color: 'rgba(255,255,255,0.50)' }} />
          </Link>
          <button onClick={() => { setShowMobileChat(false); activeConvIdRef.current = null; setActiveConvId(null); setTypingUsers([]); }} className={`h-9 w-9 rounded-full flex items-center justify-center transition-all active:scale-90 sm:hidden ${showMobileChat ? 'flex' : 'hidden'}`} style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)' }}>
            <ChevronLeft style={{ width: 17, height: 17, color: 'rgba(255,255,255,0.50)' }} />
          </button>

          <div className="flex-1 min-w-0 flex items-center gap-2">
            {showMobileChat && otherUser ? (
              <Link href={`/u/${otherUser.id}`} className="flex items-center gap-2 min-w-0">
                <div className="relative flex-shrink-0">
                  <Avatar user={otherUser} size={7} />
                  <span className="absolute -bottom-0.5 -right-0.5">
                    <PresenceDot userId={otherUser.id} size="sm" />
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate font-semibold" style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.90)' }}>{otherUser.name}</p>
                    {otherUser.docrudGo && <span style={{ fontSize: 7.5, fontWeight: 900, color: 'rgba(251,191,36,0.70)', border: '1px solid rgba(245,158,11,0.22)', borderRadius: 99, padding: '1px 5px', flexShrink: 0 }}>GO</span>}
                  </div>
                  {otherUser.headline && <p className="truncate" style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.28)' }}>{otherUser.headline}</p>}
                </div>
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <div className="rounded-[9px] flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}>
                  <MessageSquare style={{ width: 13, height: 13, color: 'rgba(255,255,255,0.75)' }} />
                </div>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.005em' }}>Messages</span>
                {totalUnread > 0 && (
                  <span className="flex items-center justify-center font-black text-white rounded-full" style={{ minWidth: 18, height: 18, padding: '0 5px', fontSize: 9, background: 'rgba(255,255,255,0.92)', color: '#0D0D0F' }}>
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Mobile: Chats drawer toggle — visible when chat is open on mobile */}
          {showMobileChat && (
            <button
              onClick={() => setShowMobileDrawer(true)}
              className="sm:hidden h-9 rounded-full flex items-center justify-center gap-1 px-2.5 transition-all active:scale-90 relative"
              style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}
            >
              <MessageSquare style={{ width: 13, height: 13 }} />
              <span>Chats</span>
              {totalUnread > 0 && <span className="absolute -top-1 -right-1 flex items-center justify-center font-black text-white rounded-full" style={{ minWidth: 15, height: 15, padding: '0 3px', fontSize: 8, background: '#3b82f6' }}>{totalUnread > 9 ? '9+' : totalUnread}</span>}
            </button>
          )}

          {/* Info panel toggle — visible when chat is open */}
          {activeConvId && (
            <button
              onClick={() => { setShowInfoPanel(v => !v); setShowChatSettings(false); }}
              className={`h-9 w-9 rounded-full flex items-center justify-center transition-all active:scale-90 ${showMobileChat ? 'flex' : 'hidden sm:flex'}`}
              style={{ border: `1px solid ${showInfoPanel && !showChatSettings ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.08)'}`, background: showInfoPanel && !showChatSettings ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.04)' }}
            >
              <Info style={{ width: 14, height: 14, color: showInfoPanel && !showChatSettings ? '#60a5fa' : 'rgba(255,255,255,0.45)' }} />
            </button>
          )}
          {/* Chat Settings toggle for mobile — visible when chat open */}
          {activeConvId && showMobileChat && (
            <button
              onClick={() => { setShowChatSettings(v => !v); setShowInfoPanel(false); }}
              className="sm:hidden h-9 w-9 rounded-full flex items-center justify-center transition-all active:scale-90"
              style={{ border: `1px solid ${showChatSettings ? 'rgba(139,92,246,0.40)' : 'rgba(255,255,255,0.08)'}`, background: showChatSettings ? 'rgba(139,92,246,0.14)' : 'rgba(255,255,255,0.04)' }}
            >
              <Settings2 style={{ width: 14, height: 14, color: showChatSettings ? '#a78bfa' : 'rgba(255,255,255,0.45)' }} />
            </button>
          )}

          <button
            onClick={() => setShowNewChat(true)}
            className={`h-9 rounded-full sm:rounded-[9px] flex items-center justify-center gap-1.5 transition-all active:scale-95 shrink-0 ${showMobileChat ? 'hidden sm:flex' : 'flex'}`}
            style={{ width: showMobileChat ? undefined : 36, padding: '0 10px', border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.05)', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.60)' }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            <span className="hidden sm:inline">New</span>
          </button>
        </header>

        {/* ── Body ── */}
        <div className="flex-1 flex overflow-hidden relative" style={{ width: '100%' }}>

          {/* Left sidebar */}
          <aside
            className="msg-sidebar sidebar-panel pslide flex flex-col absolute inset-0 z-10 w-full sm:relative sm:inset-auto sm:translate-x-0 sm:z-auto"
            style={{
              transform: showMobileChat ? 'translateX(-100%)' : 'translateX(0)',
              width: undefined,
              background: '#0D0D0F',
              borderRight: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {/* Search */}
            <div className="shrink-0 px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.048)' }}>
              <div className="flex items-center gap-2 rounded-[10px] px-2.5 py-2 transition-all" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}>
                <Search style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.22)', flexShrink: 0 }} />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search…"
                  className="flex-1 placeholder:text-white/20 outline-none"
                  style={{ background: 'transparent', fontSize: 16, color: '#fff' }} />
                {searchQuery && <button onClick={() => setSearchQuery('')}><X style={{ width: 10, height: 10, color: 'rgba(255,255,255,0.28)' }} /></button>}
              </div>
            </div>

            {/* Tabs */}
            <div className="shrink-0 flex px-1 pt-0.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.048)' }}>
              {([
                { id: 'messages' as const, label: 'Messages', count: totalUnread, color: '#60a5fa', bg: 'rgba(59,130,246,0.20)', border: '#3b82f6' },
                { id: 'requests' as const, label: 'Requests', count: totalReqUnread, color: '#fbbf24', bg: 'rgba(245,158,11,0.20)', border: 'rgba(245,158,11,0.70)' },
                ...(serviceConvs.length > 0 ? [{ id: 'services' as const, label: 'Services', count: serviceConvs.reduce((s, c) => s + (c.unreadCount[currentUserId] ?? 0), 0), color: '#a78bfa', bg: 'rgba(139,92,246,0.22)', border: '#8b5cf6' }] : []),
              ]).map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className="flex-1 flex items-center justify-center gap-1 py-2.5 border-b-2 transition-all"
                  style={{
                    fontSize: 11, fontWeight: 600, borderBottomColor: activeTab === tab.id ? tab.border : 'transparent',
                    color: activeTab === tab.id ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.30)',
                    background: activeTab === tab.id ? 'rgba(255,255,255,0.025)' : 'transparent',
                    letterSpacing: '0.01em',
                  }}>
                  {tab.label}
                  {tab.count > 0 && (
                    <span className="rounded-full flex items-center justify-center font-black" style={{ minWidth: 15, height: 15, padding: '0 3px', fontSize: 8, background: tab.bg, color: tab.color }}>{tab.count > 9 ? '9+' : tab.count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto cs">
              {activeTab === 'messages' && (
                filteredConvs.length === 0
                  ? (
                    <div className="flex flex-col items-center gap-2.5 py-12 px-4 text-center">
                      <div className="rounded-[18px] flex items-center justify-center" style={{ width: 52, height: 52, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <MessageSquare style={{ width: 22, height: 22, color: 'rgba(255,255,255,0.16)' }} />
                      </div>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.38)' }}>No conversations yet</p>
                      <button onClick={() => setShowNewChat(true)} className="flex items-center gap-1.5 active:scale-95 transition-all" style={{ height: 34, padding: '0 14px', borderRadius: 9, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.20)', fontSize: 12, fontWeight: 600, color: '#60a5fa' }}>
                        <Plus style={{ width: 13, height: 13 }} />New message
                      </button>
                    </div>
                  )
                  : filteredConvs.map((conv, i) => {
                    const unread = conv.unreadCount[currentUserId] ?? 0;
                    const isAct = activeConvId === conv.id;
                    const lm = conv.lastMessage;
                    const meta = chatMetaMap[conv.id] ?? {};
                    const isPinned = !!meta.pinnedAt;
                    return (
                      <button key={conv.id} onClick={() => selectConv(conv)}
                        className="conv-in w-full flex items-center gap-2.5 px-3 py-3 sm:py-2.5 text-left transition-colors border-l-[2.5px] active:opacity-80"
                        style={{ animationDelay: `${i * 18}ms`, background: isAct ? 'rgba(59,130,246,0.07)' : '', borderLeftColor: isAct ? '#3b82f6' : 'transparent', minHeight: 64 }}>
                        <div className="relative flex-shrink-0">
                          <Avatar user={conv.otherUser} size={10} />
                          <span className="absolute -bottom-0.5 -right-0.5">
                            <PresenceDot userId={conv.otherUser.id} size="sm" />
                          </span>
                          {unread > 0 && <span className="absolute -top-0.5 -right-0.5 rounded-full border-[2px]" style={{ width: 11, height: 11, background: '#3b82f6', borderColor: '#0D0D0F', boxShadow: '0 0 7px rgba(59,130,246,0.65)' }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="truncate font-semibold" style={{ fontSize: 13, color: unread > 0 ? '#fff' : 'rgba(255,255,255,0.76)' }}>{conv.otherUser.name}</span>
                              {isPinned && <Pin style={{ width: 9, height: 9, color: 'rgba(255,255,255,0.28)', flexShrink: 0 }} />}
                              {meta.label && <span style={{ fontSize: 8.5, fontWeight: 700, color: meta.labelColor ?? '#60a5fa', background: `${meta.labelColor ?? '#60a5fa'}18`, border: `1px solid ${meta.labelColor ?? '#60a5fa'}35`, borderRadius: 99, padding: '0px 5px', flexShrink: 0, lineHeight: '16px' }}>{meta.label}</span>}
                            </div>
                            {lm && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', flexShrink: 0 }}>{timeAgo(lm.sentAt)}</span>}
                          </div>
                          <div className="flex items-center justify-between gap-1">
                            <p className="truncate" style={{ fontSize: 11.5, color: unread > 0 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.24)' }}>
                              {lm ? (lm.senderId === currentUserId ? 'You: ' : '') + (lm.type === 'image' ? '📷 Photo' : lm.type === 'file' ? '📎 File' : lm.content) : 'Start a conversation'}
                            </p>
                            {unread > 0 && <span className="flex-shrink-0 flex items-center justify-center font-black text-white rounded-full" style={{ minWidth: 18, height: 18, padding: '0 5px', fontSize: 9, background: '#3b82f6' }}>{unread > 9 ? '9+' : unread}</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })
              )}

              {activeTab === 'requests' && (
                requests.length === 0
                  ? (
                    <div className="flex flex-col items-center gap-2.5 py-12 px-4 text-center">
                      <div className="rounded-[18px] flex items-center justify-center" style={{ width: 52, height: 52, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <Inbox style={{ width: 22, height: 22, color: 'rgba(255,255,255,0.16)' }} />
                      </div>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.38)' }}>No message requests</p>
                    </div>
                  )
                  : requests.map((req, i) => {
                    const isAct = activeConvId === req.id;
                    return (
                      <button key={req.id} onClick={() => selectConv(req)}
                        className="conv-in w-full flex items-center gap-2.5 px-3 py-3 sm:py-2.5 text-left transition-colors border-l-[2.5px] active:opacity-80"
                        style={{ animationDelay: `${i * 18}ms`, background: isAct ? 'rgba(245,158,11,0.05)' : '', borderLeftColor: isAct ? 'rgba(245,158,11,0.50)' : 'transparent', minHeight: 64 }}>
                        <Avatar user={req.otherUser} size={10} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="truncate font-semibold" style={{ fontSize: 13, color: 'rgba(255,255,255,0.76)' }}>{req.otherUser.name}</span>
                            <span className="font-semibold flex-shrink-0" style={{ fontSize: 9.5, color: 'rgba(251,191,36,0.60)', border: '1px solid rgba(245,158,11,0.20)', borderRadius: 99, padding: '1px 7px', background: 'rgba(245,158,11,0.07)' }}>Request</span>
                          </div>
                          <p className="truncate" style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.26)' }}>{req.lastMessage?.content ?? 'Wants to connect'}</p>
                        </div>
                      </button>
                    );
                  })
              )}
              {activeTab === 'services' && (
                filteredServiceConvs.length === 0
                  ? (
                    <div className="flex flex-col items-center gap-2.5 py-12 px-4 text-center">
                      <div className="rounded-[18px] flex items-center justify-center" style={{ width: 52, height: 52, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <Briefcase style={{ width: 22, height: 22, color: 'rgba(255,255,255,0.16)' }} />
                      </div>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.38)' }}>No service conversations</p>
                    </div>
                  )
                  : filteredServiceConvs.map((conv, i) => {
                    const unread = conv.unreadCount[currentUserId] ?? 0;
                    const isAct = activeConvId === conv.id;
                    const lm = conv.lastMessage;
                    return (
                      <button key={conv.id} onClick={() => selectConv(conv)}
                        className="conv-in w-full flex items-center gap-2.5 px-3 py-3 sm:py-2.5 text-left transition-colors border-l-[2.5px] active:opacity-80"
                        style={{ animationDelay: `${i * 18}ms`, background: isAct ? 'rgba(139,92,246,0.07)' : '', borderLeftColor: isAct ? '#8b5cf6' : 'transparent', minHeight: 64 }}>
                        <div className="relative flex-shrink-0">
                          <Avatar user={conv.otherUser} size={10} />
                          {unread > 0 && <span className="absolute -top-0.5 -right-0.5 rounded-full border-[2px]" style={{ width: 11, height: 11, background: '#8b5cf6', borderColor: '#0D0D0F', boxShadow: '0 0 7px rgba(139,92,246,0.65)' }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="truncate font-semibold" style={{ fontSize: 13, color: unread > 0 ? '#fff' : 'rgba(255,255,255,0.76)' }}>{conv.otherUser.name}</span>
                            <span className="font-semibold flex-shrink-0" style={{ fontSize: 9, color: 'rgba(167,139,250,0.70)', border: '1px solid rgba(139,92,246,0.22)', borderRadius: 99, padding: '1px 6px', background: 'rgba(139,92,246,0.08)' }}>Service</span>
                          </div>
                          <div className="flex items-center justify-between gap-1">
                            <p className="truncate" style={{ fontSize: 11.5, color: unread > 0 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.24)' }}>
                              {lm ? (lm.senderId === currentUserId ? 'You: ' : '') + (lm.type === 'image' ? '📷 Photo' : lm.type === 'file' ? '📎 File' : lm.content) : 'Start a conversation'}
                            </p>
                            {lm && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', flexShrink: 0 }}>{timeAgo(lm.sentAt)}</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })
              )}

              <div style={{ height: 'env(safe-area-inset-bottom)' }} />
            </div>
          </aside>

          {/* Chat panel */}
          <main
            className="chat-main pslide flex flex-col min-w-0 overflow-hidden absolute inset-0 z-10 w-full sm:relative sm:inset-auto sm:z-auto chat-bg"
            style={{ transform: showMobileChat ? 'translateX(0)' : 'translateX(100%)', flex: 1, minWidth: 0, ...(activeBgStyle ? { backgroundImage: activeBgStyle, backgroundSize: 'cover' } : {}) }}
          >
            {!activeConvId ? (
              <div className="hidden sm:flex flex-1 flex-col items-center justify-center gap-4 text-center px-6">
                <div className="rounded-[24px] flex items-center justify-center" style={{ width: 72, height: 72, background: 'linear-gradient(135deg,rgba(59,130,246,0.12),rgba(139,92,246,0.12))', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <MessageSquare style={{ width: 32, height: 32, color: 'rgba(96,165,250,0.55)' }} />
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.50)' }}>Select a conversation</p>
                  <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.22)', marginTop: 4 }}>Choose from your messages, or start a new one.</p>
                </div>
                <button onClick={() => setShowNewChat(true)} className="flex items-center gap-2 transition-colors" style={{ height: 34, padding: '0 16px', borderRadius: 10, background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.24)', fontSize: 12.5, fontWeight: 600, color: '#60a5fa' }}>
                  <Plus style={{ width: 14, height: 14 }} />New Message
                </button>
              </div>
            ) : (
              <div className="flex flex-col flex-1 min-h-0">
                {/* Desktop chat sub-header */}
                <div className="hidden sm:flex shrink-0 items-center px-4 gap-3 z-10" style={{ height: 54, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {otherUser && (
                    <Link href={`/u/${otherUser.id}`} className="flex items-center gap-2.5 flex-1 min-w-0 group">
                      <Avatar user={otherUser} size={8} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate font-semibold" style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.88)' }}>{otherUser.name}</p>
                          {otherUser.docrudGo && <span style={{ fontSize: 7.5, fontWeight: 900, color: 'rgba(251,191,36,0.65)', border: '1px solid rgba(245,158,11,0.22)', borderRadius: 99, padding: '1px 5px' }}>GO</span>}
                          {activeMeta.label && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: activeMeta.labelColor ?? '#60a5fa', border: `1px solid ${activeMeta.labelColor ?? '#60a5fa'}40`, borderRadius: 99, padding: '1px 6px', background: `${activeMeta.labelColor ?? '#60a5fa'}18`, flexShrink: 0 }}>
                              {activeMeta.label}
                            </span>
                          )}
                          {activeMeta.pinnedAt && <Pin style={{ width: 10, height: 10, color: 'rgba(255,255,255,0.30)', flexShrink: 0 }} />}
                        </div>
                        {otherUser.headline && <p className="truncate" style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.28)' }}>{otherUser.headline}</p>}
                      </div>
                    </Link>
                  )}
                  {isRequest && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(251,191,36,0.60)', border: '1px solid rgba(245,158,11,0.20)', borderRadius: 99, padding: '3px 10px', background: 'rgba(245,158,11,0.07)', flexShrink: 0 }}>
                      {isMyReq ? 'Request sent' : 'Message request'}
                    </span>
                  )}
                  {/* Chat settings button */}
                  <button
                    onClick={() => setShowChatSettings(v => !v)}
                    className="flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center transition-all"
                    style={{ background: showChatSettings ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.05)', border: showChatSettings ? '1px solid rgba(139,92,246,0.35)' : '1px solid rgba(255,255,255,0.07)' }}
                    title="Chat settings"
                  >
                    <Settings2 style={{ width: 12, height: 12, color: showChatSettings ? '#a78bfa' : 'rgba(255,255,255,0.38)' }} />
                  </button>
                </div>

                {/* Request banner */}
                {isTheirReq && (
                  <div className="shrink-0 mx-3 mt-3 flex flex-col sm:flex-row sm:items-center gap-3 rounded-[14px] p-3" style={{ border: '1px solid rgba(245,158,11,0.18)', background: 'rgba(245,158,11,0.05)' }}>
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ width: 34, height: 34, background: 'rgba(245,158,11,0.09)', border: '1px solid rgba(245,158,11,0.18)' }}>
                        <ShieldCheck style={{ width: 15, height: 15, color: '#fbbf24' }} />
                      </div>
                      <div>
                        <p style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.78)' }}>Message Request</p>
                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.36)' }}><span style={{ color: 'rgba(255,255,255,0.58)' }}>{otherUser?.name}</span> wants to send you a message</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => handleRequest(activeConvId, 'accept')} className="flex items-center gap-1.5 active:scale-95 transition-all" style={{ height: 34, padding: '0 14px', borderRadius: 9, background: 'rgba(16,185,129,0.09)', border: '1px solid rgba(16,185,129,0.22)', fontSize: 12, fontWeight: 600, color: '#34d399' }}>
                        <UserCheck style={{ width: 13, height: 13 }} />Accept
                      </button>
                      <button onClick={() => handleRequest(activeConvId, 'reject')} className="flex items-center gap-1.5 active:scale-95 transition-all" style={{ height: 34, padding: '0 14px', borderRadius: 9, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', fontSize: 12, fontWeight: 600, color: 'rgba(252,165,165,0.72)' }}>
                        <X style={{ width: 13, height: 13 }} />Decline
                      </button>
                    </div>
                  </div>
                )}

                {/* Messages scroll area */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden cs px-3 sm:px-4 py-3" data-ns style={{ overflowX: 'hidden' }}>
                  {loadingMsgs && (
                    <div className="flex items-center justify-center py-16">
                      <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.12)', borderTopColor: 'rgba(59,130,246,0.60)' }} className="animate-spin" />
                    </div>
                  )}

                  {!loadingMsgs && !messages.length && (
                    <div className="flex flex-col items-center gap-3 py-10 text-center">
                      {otherUser && <Avatar user={otherUser} size={14} />}
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>{otherUser?.name}</p>
                        {otherUser?.headline && <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.24)', marginTop: 2 }}>{otherUser.headline}</p>}
                      </div>
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.20)', maxWidth: 240, lineHeight: '1.6' }}>
                        {isMyReq ? `Request sent. Once ${otherUser?.name?.split(' ')[0]} accepts, you can chat freely.` : `Start of your conversation with ${otherUser?.name?.split(' ')[0]}.`}
                      </p>
                    </div>
                  )}

                  {!loadingMsgs && groups.map(group => (
                    <div key={group.date}>
                      <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.042)' }} />
                        <span className="rounded-full font-semibold" style={{ fontSize: 10, padding: '3px 10px', color: 'rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.058)' }}>{fmtDateSep(group.date)}</span>
                        <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.042)' }} />
                      </div>
                      {group.messages.map((m, idx) => {
                        const isMine = m.senderId === currentUserId;
                        const next = group.messages[idx + 1];
                        const isLast = !next || next.senderId !== m.senderId;
                        return (
                          <div key={m.id} className="msg-in">
                            <MessageBubble
                              msg={m} isMine={isMine}
                              isLast={isLast} isIndexed={indexedIds.includes(m.id)}
                              onDelete={handleDelete} onToggleIndex={handleToggleIndex}
                              onReply={setReplyingTo}
                              onScrollToReply={scrollToMsg}
                              msgRef={el => { if (el) msgNodesRef.current.set(m.id, el); else msgNodesRef.current.delete(m.id); }}
                              currentUserId={currentUserId}
                              otherUserName={otherUser?.name ?? ''}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  <TypingIndicator users={typingUsers} />
                  <div ref={messagesEndRef} />
                </div>

                {/* Input bar */}
                {canSend ? (
                  <div
                    className="shrink-0 w-full"
                    style={{
                      paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
                      paddingTop: 10, paddingLeft: 12, paddingRight: 12,
                      background: 'rgba(13,13,15,0.72)',
                      backdropFilter: 'blur(56px) saturate(1.8)', WebkitBackdropFilter: 'blur(56px) saturate(1.8)',
                      borderTop: '1px solid rgba(255,255,255,0.09)',
                      boxShadow: '0 -20px 60px rgba(0,0,0,0.80), 0 -4px 16px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.06)',
                      boxSizing: 'border-box',
                    }}
                  >
                    {/* Reply preview */}
                    {replyingTo && (
                      <div className="flex items-center gap-2 rounded-[12px] mb-2 px-3 py-2 animate-in fade-in slide-in-from-bottom-1 duration-150" style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.16)' }}>
                        <CornerUpLeft style={{ width: 11, height: 11, color: '#60a5fa', flexShrink: 0 }} />
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <p style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', marginBottom: 1 }}>
                            Replying to {replyingTo.senderId === currentUserId ? 'yourself' : otherUser?.name.split(' ')[0]}
                          </p>
                          <p className="truncate" style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.42)' }}>
                            {replyingTo.type === 'image' ? '📷 Photo' : replyingTo.type === 'file' ? `📎 ${replyingTo.attachmentName ?? 'File'}` : replyingTo.content}
                          </p>
                        </div>
                        <button onClick={() => setReplyingTo(null)} className="flex-shrink-0 h-5 w-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.07)' }}>
                          <X style={{ width: 9, height: 9, color: 'rgba(255,255,255,0.40)' }} />
                        </button>
                      </div>
                    )}

                    {/* ── Business tool picker panel ── */}
                    {activeBizPicker && (() => {
                      const cat = BIZ_CATEGORIES.find(c => c.key === activeBizPicker)!;
                      const items = businessProfile[activeBizPicker] as BusinessTool[];
                      const catIconsMap: Record<BizCategory, React.ReactNode> = {
                        catalogues: <Store style={{ width: 11, height: 11 }} />,
                        meetings: <Calendar style={{ width: 11, height: 11 }} />,
                        payments: <CreditCard style={{ width: 11, height: 11 }} />,
                        contacts: <PhoneCall style={{ width: 11, height: 11 }} />,
                      };
                      return (
                        <div className="mb-2 rounded-[16px] overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150" style={{ background: '#111113', border: `1px solid ${cat.border}`, backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)', boxShadow: `0 -8px 40px rgba(0,0,0,0.55)` }}>
                          {/* Header */}
                          <div className="flex items-center justify-between px-3.5 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <div className="flex items-center gap-2">
                              <span style={{ color: cat.color }}>{catIconsMap[activeBizPicker]}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{cat.label}</span>
                            </div>
                            <button onClick={() => setActiveBizPicker(null)} className="h-6 w-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
                              <X style={{ width: 10, height: 10, color: 'rgba(255,255,255,0.35)' }} />
                            </button>
                          </div>
                          {/* Items list */}
                          {items.length === 0 ? (
                            <div className="px-4 py-5 flex flex-col items-center gap-2 text-center">
                              <span style={{ color: cat.color, opacity: 0.4 }}>{catIconsMap[activeBizPicker]}</span>
                              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)' }}>No {cat.label.toLowerCase()} saved yet</p>
                              <button
                                onClick={() => { setActiveBizPicker(null); setShowChatSettings(true); }}
                                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all active:scale-95"
                                style={{ background: `${cat.color}12`, border: `1px solid ${cat.border}`, fontSize: 11.5, fontWeight: 600, color: cat.color }}
                              >
                                <Plus style={{ width: 10, height: 10 }} />Add in Settings
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col max-h-52 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                              {items.map((tool, idx) => (
                                <button
                                  key={tool.id}
                                  onClick={() => { setInput(cat.shareFormat(tool)); setActiveBizPicker(null); textareaRef.current?.focus(); }}
                                  className="w-full text-left px-3.5 py-3 transition-all active:opacity-60"
                                  style={{ borderBottom: idx < items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = `${cat.color}08`)}
                                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.82)' }}>{tool.label}</p>
                                      <p className="truncate" style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)', marginTop: 2 }}>{tool.value}</p>
                                      {tool.extra && <p className="truncate" style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.20)', marginTop: 1 }}>{tool.extra}</p>}
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                      <span style={{ fontSize: 10, fontWeight: 700, color: cat.color, background: `${cat.color}18`, border: `1px solid ${cat.border}`, borderRadius: 99, padding: '2px 8px' }}>Share</span>
                                      <Share2 style={{ width: 11, height: 11, color: cat.color, opacity: 0.7 }} />
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                          {/* Footer hint */}
                          <div className="px-3.5 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                            <p style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.18)' }}>Tap any item to insert into message</p>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Quick Replies picker ── */}
                    {showQuickReplies && quickReplies.length > 0 && (
                      <div className="mb-2 rounded-[16px] overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150" style={{ background: '#111113', border: '1px solid rgba(245,158,11,0.20)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)', boxShadow: '0 -8px 40px rgba(0,0,0,0.55)' }}>
                        <div className="flex items-center justify-between px-3.5 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <div className="flex items-center gap-2">
                            <Zap style={{ width: 11, height: 11, color: '#fbbf24' }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Quick Replies</span>
                          </div>
                          <button onClick={() => setShowQuickReplies(false)} className="h-6 w-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <X style={{ width: 10, height: 10, color: 'rgba(255,255,255,0.35)' }} />
                          </button>
                        </div>
                        <div className="flex flex-col max-h-52 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                          {quickReplies.map((qr, idx) => (
                            <button
                              key={qr.id}
                              onClick={() => { setInput(qr.content); setShowQuickReplies(false); textareaRef.current?.focus(); }}
                              className="text-left px-3.5 py-3 transition-all active:opacity-60"
                              style={{ borderBottom: idx < quickReplies.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.05)')}
                              onMouseLeave={e => (e.currentTarget.style.background = '')}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.82)' }}>{qr.title}</p>
                                  <p className="truncate" style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)', marginTop: 2 }}>{qr.content}</p>
                                </div>
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 99, padding: '2px 8px', flexShrink: 0 }}>Use</span>
                              </div>
                            </button>
                          ))}
                        </div>
                        <div className="px-3.5 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                          <p style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.18)' }}>Tap any reply to insert into message</p>
                        </div>
                      </div>
                    )}

                    {/* ── Unified Quick Actions strip (all screens) ── */}
                    <div className="flex items-center gap-1.5 mb-2 overflow-x-auto" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                      {/* Business tool category chips */}
                      {BIZ_CATEGORIES.map(cat => {
                        const items = (businessProfile[cat.key] as BusinessTool[]);
                        const isActive = activeBizPicker === cat.key;
                        const catIconsInline: Record<BizCategory, React.ReactNode> = {
                          catalogues: <Store style={{ width: 10, height: 10, flexShrink: 0 }} />,
                          meetings: <Calendar style={{ width: 10, height: 10, flexShrink: 0 }} />,
                          payments: <CreditCard style={{ width: 10, height: 10, flexShrink: 0 }} />,
                          contacts: <PhoneCall style={{ width: 10, height: 10, flexShrink: 0 }} />,
                        };
                        return (
                          <button
                            key={cat.key}
                            onClick={() => { setActiveBizPicker(isActive ? null : cat.key); setShowQuickReplies(false); }}
                            className="flex items-center gap-1.5 rounded-full transition-all active:scale-95 flex-shrink-0"
                            style={{
                              padding: '5px 10px',
                              background: isActive ? `${cat.color}18` : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${isActive ? cat.color + '45' : 'rgba(255,255,255,0.08)'}`,
                              fontSize: 11, fontWeight: 600,
                              color: isActive ? cat.color : 'rgba(255,255,255,0.38)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span style={{ color: isActive ? cat.color : 'rgba(255,255,255,0.32)' }}>{catIconsInline[cat.key]}</span>
                            <span>{cat.label.replace(' Links', '').replace(' Details', '')}</span>
                            {items.length > 0 && (
                              <span className="rounded-full flex items-center justify-center font-black" style={{ minWidth: 14, height: 14, padding: '0 3px', fontSize: 8, background: isActive ? cat.color : `${cat.color}28`, color: isActive ? '#fff' : cat.color }}>{items.length}</span>
                            )}
                          </button>
                        );
                      })}

                      {/* Divider */}
                      <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

                      {/* Quick replies chip */}
                      {quickReplies.length > 0 && (
                        <button
                          onClick={() => { setShowQuickReplies(v => !v); setActiveBizPicker(null); }}
                          className="flex items-center gap-1.5 rounded-full transition-all active:scale-95 flex-shrink-0"
                          style={{
                            padding: '5px 10px',
                            background: showQuickReplies ? 'rgba(245,158,11,0.14)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${showQuickReplies ? 'rgba(245,158,11,0.40)' : 'rgba(255,255,255,0.08)'}`,
                            fontSize: 11, fontWeight: 600,
                            color: showQuickReplies ? '#fbbf24' : 'rgba(255,255,255,0.38)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Zap style={{ width: 10, height: 10, flexShrink: 0, color: showQuickReplies ? '#fbbf24' : 'rgba(255,255,255,0.32)' }} />
                          <span>Quick</span>
                          <span className="rounded-full flex items-center justify-center font-black" style={{ minWidth: 14, height: 14, padding: '0 3px', fontSize: 8, background: showQuickReplies ? '#fbbf24' : 'rgba(245,158,11,0.25)', color: showQuickReplies ? '#000' : '#fbbf24' }}>{quickReplies.length}</span>
                        </button>
                      )}
                    </div>

                    {/* ── Main input row ── */}
                    <div className="flex items-end gap-2 w-full" style={{ boxSizing: 'border-box' }}>
                      {/* Attach button */}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingFile}
                        className="rounded-full flex items-center justify-center disabled:opacity-40 active:scale-90 transition-all flex-shrink-0 self-end"
                        style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 1 }}
                        title="Attach file"
                      >
                        {uploadingFile
                          ? <div style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.20)', borderTopColor: '#60a5fa' }} className="animate-spin" />
                          : <Paperclip style={{ width: 13, height: 13, color: 'rgba(255,255,255,0.40)' }} />}
                      </button>

                      <input ref={fileInputRef} type="file" className="hidden" accept="image/*,application/pdf,.doc,.docx,.txt,.zip" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }} />

                      {/* Textarea pill */}
                      <div
                        className="flex-1 min-w-0 flex items-end rounded-[20px] overflow-hidden transition-all"
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.09)',
                          paddingLeft: 14, paddingRight: 14, paddingTop: 9, paddingBottom: 9,
                          boxSizing: 'border-box',
                        }}
                        onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59,130,246,0.35)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 3px rgba(59,130,246,0.07)'; }}
                        onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.09)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; } }}
                      >
                        <textarea
                          ref={textareaRef} rows={1} value={input}
                          onChange={e => { handleInputChange(e.target.value); onTextareaInput(); }}
                          onKeyDown={onKeyDown}
                          onFocus={() => setTimeout(() => scrollToBottom(true), 350)}
                          placeholder="Message…"
                          className="msg-ta w-full min-w-0 placeholder:text-white/20 outline-none resize-none"
                          style={{ background: 'transparent', fontSize: 16, color: '#fff', lineHeight: '1.5', minHeight: 22, display: 'block', boxSizing: 'border-box' }}
                          disabled={sending}
                        />
                      </div>

                      {/* Send button */}
                      <button
                        onClick={handleSend}
                        disabled={!input.trim() || sending}
                        className="flex-shrink-0 rounded-full flex items-center justify-center self-end transition-all active:scale-90"
                        style={{
                          width: 38, height: 38,
                          background: (input.trim() && !sending) ? 'linear-gradient(135deg,#3b82f6,#1d4ed8)' : 'rgba(255,255,255,0.05)',
                          border: (input.trim() && !sending) ? 'none' : '1px solid rgba(255,255,255,0.08)',
                          boxShadow: (input.trim() && !sending) ? '0 4px 16px rgba(59,130,246,0.45)' : 'none',
                          cursor: (!input.trim() || sending) ? 'not-allowed' : 'pointer',
                          flexShrink: 0,
                          marginBottom: 1,
                        }}
                      >
                        {sending
                          ? <div style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.25)', borderTopColor: '#fff' }} className="animate-spin" />
                          : <Send style={{ width: 13, height: 13, color: (input.trim() && !sending) ? '#fff' : 'rgba(255,255,255,0.20)' }} />}
                      </button>
                    </div>

                    <p className="hidden sm:block mt-1.5" style={{ fontSize: 9, color: 'rgba(255,255,255,0.10)', paddingLeft: 2 }}>Enter to send · Shift+Enter new line</p>
                  </div>
                ) : activeConv?.status === 'rejected' ? (
                  <div className="shrink-0 text-center px-4 py-3.5" style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))', borderTop: '1px solid rgba(255,255,255,0.052)' }}>
                    <p style={{ fontSize: 12.5, color: 'rgba(239,68,68,0.48)' }}>This message request was declined.</p>
                  </div>
                ) : isTheirReq ? (
                  <div className="shrink-0 text-center px-4 py-3.5" style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))', borderTop: '1px solid rgba(255,255,255,0.052)' }}>
                    <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.25)' }}>Accept the request above to start chatting.</p>
                  </div>
                ) : null}
              </div>
            )}
          </main>

          {/* Chat Settings Panel (desktop slide-in) */}
          <div
            className="info-slide hidden lg:flex flex-col flex-shrink-0 overflow-hidden"
            style={{ width: showChatSettings && activeConvId ? 'clamp(232px, 22vw, 288px)' : 0, transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)' }}
          >
            {showChatSettings && activeConvId && (
              <ChatSettingsPanel
                convId={activeConvId}
                meta={activeMeta}
                onSave={(patch) => saveChatMeta(activeConvId, patch)}
                saving={savingMeta}
                onClose={() => setShowChatSettings(false)}
                onShareCatalogue={shareCatalogue}
                quickReplies={quickReplies}
                autoReplySettings={autoReplySettings}
                onQuickRepliesChange={setQuickReplies}
                onAutoReplyChange={setAutoReplySettings}
                businessProfile={businessProfile}
                onBusinessProfileChange={setBusinessProfile}
                onInsertText={(text) => { setInput(text); textareaRef.current?.focus(); }}
              />
            )}
          </div>

          {/* Right info panel */}
          {/* Desktop: slides open as a fixed-width column */}
          <div
            className="info-slide hidden lg:flex flex-col flex-shrink-0"
            style={{ width: desktopInfoOpen && !showChatSettings ? 'clamp(212px, 19vw, 264px)' : 0 }}
          >
            {desktopInfoOpen && !showChatSettings && (
              <InfoPanel
                messages={messages} indexedIds={indexedIds} currentUserId={currentUserId}
                onScrollTo={scrollToMsg} onToggleIndex={handleToggleIndex}
                otherUser={otherUser} onClose={() => setShowInfoPanel(false)}
              />
            )}
          </div>

          {/* Mobile: overlay from right */}
          {showInfoPanel && activeConvId && !showChatSettings && (
            <div className="lg:hidden absolute inset-0 z-20 flex" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={() => setShowInfoPanel(false)}>
              <div className="ml-auto h-full" style={{ width: 'min(82%, 320px)' }} onClick={e => e.stopPropagation()}>
                <InfoPanel
                  messages={messages} indexedIds={indexedIds} currentUserId={currentUserId}
                  onScrollTo={(id) => { setShowInfoPanel(false); setTimeout(() => scrollToMsg(id), 200); }}
                  onToggleIndex={handleToggleIndex} otherUser={otherUser} onClose={() => setShowInfoPanel(false)}
                />
              </div>
            </div>
          )}
          {/* Mobile chat settings overlay */}
          {showChatSettings && activeConvId && (
            <div className="lg:hidden absolute inset-0 z-20 flex" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={() => setShowChatSettings(false)}>
              <div className="ml-auto h-full" style={{ width: 'min(92%, 360px)' }} onClick={e => e.stopPropagation()}>
                <ChatSettingsPanel
                  convId={activeConvId}
                  meta={activeMeta}
                  onSave={(patch) => saveChatMeta(activeConvId, patch)}
                  saving={savingMeta}
                  onClose={() => setShowChatSettings(false)}
                  onShareCatalogue={shareCatalogue}
                  quickReplies={quickReplies}
                  autoReplySettings={autoReplySettings}
                  onQuickRepliesChange={setQuickReplies}
                  onAutoReplyChange={setAutoReplySettings}
                  businessProfile={businessProfile}
                  onBusinessProfileChange={setBusinessProfile}
                  onInsertText={(text) => { setInput(text); textareaRef.current?.focus(); setShowChatSettings(false); }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile bottom drawer — chats list */}
      {showMobileDrawer && (
        <div className="sm:hidden fixed inset-0 z-[60] flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.68)', backdropFilter: 'blur(6px)' }}
            onClick={() => setShowMobileDrawer(false)}
          />
          {/* Sheet */}
          <div
            className="drawer-enter relative flex flex-col overflow-hidden"
            style={{ maxHeight: '74vh', borderRadius: '24px 24px 0 0', background: '#111113', borderTop: '1px solid rgba(255,255,255,0.08)' }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-2.5 pb-1 shrink-0">
              <div style={{ width: 36, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.14)' }} />
            </div>
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-4 pb-3">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.88)' }}>All Chats</span>
                {totalUnread > 0 && (
                  <span className="flex items-center justify-center font-black text-white rounded-full" style={{ minWidth: 18, height: 18, padding: '0 5px', fontSize: 9, background: '#3b82f6' }}>{totalUnread > 99 ? '99+' : totalUnread}</span>
                )}
              </div>
              <button onClick={() => setShowMobileDrawer(false)} className="h-7 w-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <X style={{ width: 13, height: 13, color: 'rgba(255,255,255,0.50)' }} />
              </button>
            </div>
            {/* Search */}
            <div className="shrink-0 px-3 pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2 rounded-[10px] px-2.5 py-2" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}>
                <Search style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.22)', flexShrink: 0 }} />
                <input
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search conversations…"
                  className="flex-1 placeholder:text-white/20 outline-none"
                  style={{ background: 'transparent', fontSize: 16, color: '#fff', minWidth: 0 }}
                />
                {searchQuery && <button onClick={() => setSearchQuery('')}><X style={{ width: 10, height: 10, color: 'rgba(255,255,255,0.28)' }} /></button>}
              </div>
            </div>
            {/* Tabs */}
            <div className="shrink-0 flex px-1 pt-0.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.055)' }}>
              {([
                { id: 'messages' as const, label: 'Messages', count: totalUnread, color: '#60a5fa', bg: 'rgba(59,130,246,0.20)', border: '#3b82f6' },
                { id: 'requests' as const, label: 'Requests', count: totalReqUnread, color: '#fbbf24', bg: 'rgba(245,158,11,0.20)', border: 'rgba(245,158,11,0.70)' },
                ...(serviceConvs.length > 0 ? [{ id: 'services' as const, label: 'Services', count: serviceConvs.reduce((s, c) => s + (c.unreadCount[currentUserId] ?? 0), 0), color: '#a78bfa', bg: 'rgba(139,92,246,0.22)', border: '#8b5cf6' }] : []),
              ]).map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className="flex-1 flex items-center justify-center gap-1 py-2.5 border-b-2 transition-all"
                  style={{ fontSize: 11, fontWeight: 600, borderBottomColor: activeTab === tab.id ? tab.border : 'transparent', color: activeTab === tab.id ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.30)', background: activeTab === tab.id ? 'rgba(255,255,255,0.025)' : 'transparent', letterSpacing: '0.01em' }}>
                  {tab.label}
                  {tab.count > 0 && (
                    <span className="rounded-full flex items-center justify-center font-black" style={{ minWidth: 15, height: 15, padding: '0 3px', fontSize: 8, background: tab.bg, color: tab.color }}>{tab.count > 9 ? '9+' : tab.count}</span>
                  )}
                </button>
              ))}
            </div>
            {/* List */}
            <div className="flex-1 overflow-y-auto cs">
              {activeTab === 'messages' && (
                filteredConvs.length === 0
                  ? <div className="flex flex-col items-center gap-2 py-10 text-center"><MessageSquare style={{ width: 28, height: 28, color: 'rgba(255,255,255,0.14)' }} /><p style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)' }}>No conversations yet</p></div>
                  : filteredConvs.map((conv, i) => {
                    const unread = conv.unreadCount[currentUserId] ?? 0;
                    const isAct = activeConvId === conv.id;
                    const lm = conv.lastMessage;
                    const meta = chatMetaMap[conv.id] ?? {};
                    return (
                      <button key={conv.id} onClick={() => { selectConv(conv); setShowMobileDrawer(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-3 text-left transition-colors border-l-[2.5px] active:opacity-80"
                        style={{ background: isAct ? 'rgba(59,130,246,0.07)' : '', borderLeftColor: isAct ? '#3b82f6' : 'transparent', animationDelay: `${i * 15}ms` }}>
                        <div className="relative flex-shrink-0">
                          <Avatar user={conv.otherUser} size={10} />
                          {unread > 0 && <span className="absolute -top-0.5 -right-0.5 rounded-full border-[2px]" style={{ width: 11, height: 11, background: '#3b82f6', borderColor: '#0D0D0F' }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="truncate font-semibold" style={{ fontSize: 13, color: unread > 0 ? '#fff' : 'rgba(255,255,255,0.76)' }}>{conv.otherUser.name}</span>
                              {meta.pinnedAt && <Pin style={{ width: 9, height: 9, color: 'rgba(255,255,255,0.28)', flexShrink: 0 }} />}
                              {meta.label && <span style={{ fontSize: 8.5, fontWeight: 700, color: meta.labelColor ?? '#60a5fa', background: `${meta.labelColor ?? '#60a5fa'}18`, border: `1px solid ${meta.labelColor ?? '#60a5fa'}35`, borderRadius: 99, padding: '0px 5px', flexShrink: 0, lineHeight: '16px' }}>{meta.label}</span>}
                            </div>
                            {lm && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', flexShrink: 0 }}>{timeAgo(lm.sentAt)}</span>}
                          </div>
                          <p className="truncate" style={{ fontSize: 11.5, color: unread > 0 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.24)' }}>
                            {lm ? (lm.senderId === currentUserId ? 'You: ' : '') + (lm.type === 'image' ? '📷 Photo' : lm.type === 'file' ? '📎 File' : lm.content) : 'Start a conversation'}
                          </p>
                        </div>
                        {unread > 0 && <span className="flex-shrink-0 flex items-center justify-center font-black text-white rounded-full" style={{ minWidth: 18, height: 18, padding: '0 5px', fontSize: 9, background: '#3b82f6' }}>{unread > 9 ? '9+' : unread}</span>}
                      </button>
                    );
                  })
              )}
              {activeTab === 'requests' && (
                requests.length === 0
                  ? <div className="flex flex-col items-center gap-2 py-10 text-center"><Inbox style={{ width: 28, height: 28, color: 'rgba(255,255,255,0.14)' }} /><p style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)' }}>No message requests</p></div>
                  : requests.map(req => {
                    const isAct = activeConvId === req.id;
                    return (
                      <button key={req.id} onClick={() => { selectConv(req); setShowMobileDrawer(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-3 text-left transition-colors border-l-[2.5px] active:opacity-80"
                        style={{ background: isAct ? 'rgba(245,158,11,0.05)' : '', borderLeftColor: isAct ? 'rgba(245,158,11,0.50)' : 'transparent' }}>
                        <Avatar user={req.otherUser} size={10} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="truncate font-semibold" style={{ fontSize: 13, color: 'rgba(255,255,255,0.76)' }}>{req.otherUser.name}</span>
                            <span className="font-semibold flex-shrink-0" style={{ fontSize: 9.5, color: 'rgba(251,191,36,0.60)', border: '1px solid rgba(245,158,11,0.20)', borderRadius: 99, padding: '1px 7px', background: 'rgba(245,158,11,0.07)' }}>Request</span>
                          </div>
                          <p className="truncate" style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.26)' }}>{req.lastMessage?.content ?? 'Wants to connect'}</p>
                        </div>
                      </button>
                    );
                  })
              )}
              {activeTab === 'services' && (
                filteredServiceConvs.length === 0
                  ? <div className="flex flex-col items-center gap-2 py-10 text-center"><Briefcase style={{ width: 28, height: 28, color: 'rgba(255,255,255,0.14)' }} /><p style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)' }}>No service conversations</p></div>
                  : filteredServiceConvs.map((conv, i) => {
                    const unread = conv.unreadCount[currentUserId] ?? 0;
                    const isAct = activeConvId === conv.id;
                    const lm = conv.lastMessage;
                    return (
                      <button key={conv.id} onClick={() => { selectConv(conv); setShowMobileDrawer(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-3 text-left transition-colors border-l-[2.5px] active:opacity-80"
                        style={{ animationDelay: `${i * 15}ms`, background: isAct ? 'rgba(139,92,246,0.07)' : '', borderLeftColor: isAct ? '#8b5cf6' : 'transparent', minHeight: 64 }}>
                        <div className="relative flex-shrink-0">
                          <Avatar user={conv.otherUser} size={10} />
                          {unread > 0 && <span className="absolute -top-0.5 -right-0.5 rounded-full border-[2px]" style={{ width: 11, height: 11, background: '#8b5cf6', borderColor: '#0D0D0F' }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="truncate font-semibold" style={{ fontSize: 13, color: unread > 0 ? '#fff' : 'rgba(255,255,255,0.76)' }}>{conv.otherUser.name}</span>
                            <span className="font-semibold flex-shrink-0" style={{ fontSize: 9, color: 'rgba(167,139,250,0.70)', border: '1px solid rgba(139,92,246,0.22)', borderRadius: 99, padding: '1px 6px', background: 'rgba(139,92,246,0.08)' }}>Service</span>
                          </div>
                          <p className="truncate" style={{ fontSize: 11.5, color: unread > 0 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.24)' }}>
                            {lm ? (lm.senderId === currentUserId ? 'You: ' : '') + (lm.type === 'image' ? '📷 Photo' : lm.type === 'file' ? '📎 File' : lm.content) : 'Start a conversation'}
                          </p>
                        </div>
                        {unread > 0 && <span className="flex-shrink-0 flex items-center justify-center font-black text-white rounded-full" style={{ minWidth: 18, height: 18, padding: '0 5px', fontSize: 9, background: '#8b5cf6' }}>{unread > 9 ? '9+' : unread}</span>}
                      </button>
                    );
                  })
              )}
              <div style={{ height: 'max(16px, env(safe-area-inset-bottom))' }} />
            </div>
          </div>
        </div>
      )}

      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} onStart={handleNewChat} />}
    </>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#09090f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.12)', borderTopColor: 'rgba(59,130,246,0.65)' }} className="animate-spin" />
      </div>
    }>
      <MessagesPageInner />
    </Suspense>
  );
}
