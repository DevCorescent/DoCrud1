'use client';

import { useRef, useState, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, Camera, Phone, Mail, Check, ArrowLeft, Linkedin,
  Twitter, Save, Users, ChevronLeft, ChevronRight, Globe,
  Instagram, Youtube, Github, Facebook, MapPin, Briefcase,
  TrendingUp, Award, Heart, Zap, X as XIcon,
} from 'lucide-react';
import dynamic from 'next/dynamic';
const BusinessEmployeeManager = dynamic(() => import('@/components/BusinessEmployeeManager'), { ssr: false });

// ─── Constants ────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  { value: 'technology',   label: 'Technology',          emoji: '💻' },
  { value: 'finance',      label: 'Finance & Banking',   emoji: '🏦' },
  { value: 'healthcare',   label: 'Healthcare',          emoji: '🏥' },
  { value: 'legal',        label: 'Legal & Compliance',  emoji: '⚖️' },
  { value: 'education',    label: 'Education',           emoji: '🎓' },
  { value: 'manufacturing',label: 'Manufacturing',       emoji: '🏭' },
  { value: 'retail',       label: 'Retail & E-commerce', emoji: '🛍️' },
  { value: 'real_estate',  label: 'Real Estate',         emoji: '🏢' },
  { value: 'media',        label: 'Media & Entertainment',emoji: '🎬' },
  { value: 'logistics',    label: 'Logistics',           emoji: '🚚' },
  { value: 'hospitality',  label: 'Hospitality & Travel',emoji: '✈️' },
  { value: 'consulting',   label: 'Consulting',          emoji: '📊' },
  { value: 'ngo',          label: 'NGO / Non-profit',    emoji: '❤️' },
  { value: 'government',   label: 'Government',          emoji: '🏛️' },
  { value: 'other',        label: 'Other',               emoji: '🔷' },
];

const COMPANY_TYPES = ['Private Limited', 'Public Limited', 'LLP', 'Partnership', 'Sole Proprietorship', 'NGO / Trust', 'Government', 'Other'];
const SIZES         = ['1–10', '11–50', '51–200', '201–500', '501–1000', '1001–5000', '5000+'];
const REVENUE_RANGES= ['Pre-revenue', '< ₹10 L', '₹10 L – 1 Cr', '₹1 Cr – 10 Cr', '₹10 Cr – 100 Cr', '₹100 Cr – 500 Cr', '₹500 Cr+'];
const FUNDING_STAGES= ['Bootstrapped', 'Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C+', 'Growth / PE', 'IPO / Public', 'Acquired'];
const BIZ_MODELS    = ['B2B', 'B2C', 'B2B2C', 'SaaS', 'Marketplace', 'D2C', 'Enterprise', 'Franchise', 'Platform'];
const WORK_POLICIES = ['Remote-first', 'Hybrid', 'On-site', 'Flexible'];

const SECTIONS = [
  { id: 'media',    label: 'Logo & Cover',        short: 'Media' },
  { id: 'profile',  label: 'Company Profile',     short: 'Profile' },
  { id: 'bizdetail',label: 'Business Details',    short: 'Details' },
  { id: 'industry', label: 'Industry & Scale',    short: 'Industry' },
  { id: 'contact',  label: 'Contact & Location',  short: 'Contact' },
  { id: 'social',   label: 'Social & Web',        short: 'Social' },
  { id: 'culture',  label: 'Culture & Values',    short: 'Culture' },
  { id: 'team',     label: 'Team & Employees',    short: 'Team' },
];

// ─── Banner presets ────────────────────────────────────────────────────────────

interface BannerPreset {
  id: string; name: string; quote: string; author: string;
  css: string; textColor: string; subColor: string;
  stops: [number, string][]; glowColor: string; accentColor: string;
  gradDir: [number, number, number, number];
}

const BANNER_PRESETS: BannerPreset[] = [
  { id: 'nebula', name: 'Nebula', quote: 'Innovation distinguishes between a leader and a follower.', author: '— Steve Jobs', css: '#0a0616', textColor: 'rgba(210,185,255,0.95)', subColor: 'rgba(165,130,225,0.65)', stops: [[0,'#0d0821'],[0.35,'#1a0a3d'],[0.65,'#0d1a4a'],[1,'#050812']], glowColor: 'rgba(120,60,255,0.55)', accentColor: 'rgba(80,160,255,0.40)', gradDir: [0,0,1,1] },
  { id: 'aurora', name: 'Aurora', quote: 'The best way to predict the future is to create it.', author: '— Peter Drucker', css: '#001510', textColor: 'rgba(150,255,200,0.95)', subColor: 'rgba(90,210,155,0.65)', stops: [[0,'#001a12'],[0.3,'#003322'],[0.65,'#00261a'],[1,'#001410']], glowColor: 'rgba(0,220,120,0.50)', accentColor: 'rgba(100,255,180,0.35)', gradDir: [0,0,1,1] },
  { id: 'ember', name: 'Ember', quote: 'Great companies are built on great products.', author: '— Elon Musk', css: '#120300', textColor: 'rgba(255,195,120,0.95)', subColor: 'rgba(230,135,70,0.65)', stops: [[0,'#1a0500'],[0.3,'#3d1200'],[0.65,'#2a0800'],[1,'#0f0200']], glowColor: 'rgba(255,70,0,0.55)', accentColor: 'rgba(255,160,30,0.40)', gradDir: [0,0,1,1] },
  { id: 'ocean', name: 'Midnight Ocean', quote: 'Success is not final, failure is not fatal — it is the courage to continue.', author: '— Winston Churchill', css: '#000a14', textColor: 'rgba(120,195,255,0.95)', subColor: 'rgba(80,155,225,0.65)', stops: [[0,'#000d1a'],[0.35,'#001533'],[0.65,'#001a2e'],[1,'#00080f']], glowColor: 'rgba(0,90,220,0.55)', accentColor: 'rgba(40,160,255,0.38)', gradDir: [0,0,1,1] },
  { id: 'gold', name: 'Gilded', quote: 'Excellence is never an accident — it is always the result of high intention.', author: '— Aristotle', css: '#0a0700', textColor: 'rgba(255,215,100,0.97)', subColor: 'rgba(205,160,60,0.65)', stops: [[0,'#0d0a00'],[0.3,'#2a1e00'],[0.65,'#150e00'],[1,'#080500']], glowColor: 'rgba(230,155,0,0.55)', accentColor: 'rgba(255,200,50,0.35)', gradDir: [0,0,1,1] },
  { id: 'steel', name: 'Carbon', quote: 'Precision. Integrity. Excellence.', author: '— The cornerstone of every great organisation', css: '#08080f', textColor: 'rgba(195,215,255,0.95)', subColor: 'rgba(135,160,210,0.60)', stops: [[0,'#0a0a12'],[0.35,'#121220'],[0.65,'#0d1220'],[1,'#060810']], glowColor: 'rgba(70,110,230,0.50)', accentColor: 'rgba(130,175,255,0.32)', gradDir: [0,0,1,1] },
];

function drawBannerCanvas(preset: BannerPreset): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const W = 1200, H = 375;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject(new Error('no canvas'));
    const grad = ctx.createLinearGradient(0, 0, W, H);
    preset.stops.forEach(([pos, color]) => grad.addColorStop(pos, color));
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W*.5, H*.45, 0, W*.5, H*.45, W*.55);
    glow.addColorStop(0, preset.glowColor); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.025)'; ctx.lineWidth = 1;
    for (let i = -H; i < W + H; i += 40) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i+H,H); ctx.stroke(); }
    ctx.restore();
    const acc1 = ctx.createRadialGradient(0,0,0,0,0,200);
    acc1.addColorStop(0, preset.accentColor); acc1.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle = acc1; ctx.fillRect(0,0,W,H);
    ctx.textAlign = 'center';
    const maxW = 900;
    ctx.font = `italic 600 40px Georgia, serif`;
    const words = preset.quote.split(' '); let line = '', lines: string[] = [];
    for (const w of words) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    const lineH = 52; let y = (H - (lines.length * lineH + 38)) / 2 + lineH;
    ctx.fillStyle = preset.textColor;
    lines.forEach(l => { ctx.fillText(l, W/2, y); y += lineH; });
    ctx.font = `400 20px -apple-system, sans-serif`; ctx.fillStyle = preset.subColor;
    ctx.fillText(preset.author, W/2, y+8);
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('blob')), 'image/jpeg', 0.94);
  });
}

// ─── TagInput ──────────────────────────────────────────────────────────────────

function TagInput({ tags, onChange, placeholder, color = 'rgba(255,255,255,0.12)' }: {
  tags: string[]; onChange: (t: string[]) => void; placeholder?: string; color?: string;
}) {
  const [val, setVal] = useState('');
  function add() {
    const cleaned = val.trim().replace(/,+$/, '');
    if (!cleaned || tags.includes(cleaned)) { setVal(''); return; }
    onChange([...tags, cleaned]); setVal('');
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
    if (e.key === 'Backspace' && !val && tags.length) onChange(tags.slice(0,-1));
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.04)', minHeight: 40, alignItems: 'center' }}>
      {tags.map(t => (
        <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, background: color, fontSize: 11.5, color: 'rgba(255,255,255,0.80)', fontWeight: 600, border: '1px solid rgba(255,255,255,0.12)' }}>
          {t}
          <button type="button" onClick={() => onChange(tags.filter(x => x !== t))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', padding: 0, display: 'flex', lineHeight: 1 }}>
            <XIcon style={{ width: 10, height: 10 }} />
          </button>
        </span>
      ))}
      <input value={val} onChange={e => setVal(e.target.value)} onKeyDown={onKey} onBlur={add}
        placeholder={tags.length === 0 ? (placeholder ?? 'Type and press Enter…') : ''}
        style={{ flex: 1, minWidth: 80, background: 'none', border: 'none', outline: 'none', color: 'rgba(255,255,255,0.80)', fontSize: 13, fontFamily: 'inherit', padding: 0 }} />
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function ChipGroup({ options, value, onChange, multi = false }: {
  options: string[]; value: string | string[]; onChange: (v: string | string[]) => void; multi?: boolean;
}) {
  function isSelected(o: string) { return multi ? (value as string[]).includes(o) : value === o; }
  function toggle(o: string) {
    if (!multi) { onChange(isSelected(o) ? '' : o); return; }
    const arr = value as string[];
    onChange(isSelected(o) ? arr.filter(x => x !== o) : [...arr, o]);
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
      {options.map(o => (
        <button key={o} type="button" onClick={() => toggle(o)}
          className={`sz-btn ${isSelected(o) ? 'sel' : ''}`}
          style={{ padding: '6px 13px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.38)', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.13s' }}>
          {o}
        </button>
      ))}
    </div>
  );
}

// ─── Page data interface ───────────────────────────────────────────────────────

interface PageData {
  id: string; slug: string; name: string; tagline?: string; description?: string;
  industry: string; companySize?: string; foundedYear?: number; website?: string;
  logoUrl?: string; coverUrl?: string; location?: string; city?: string; country?: string;
  phone?: string; email?: string; socialLinks: Record<string, string>;
  companyType?: string; registrationNumber?: string; gstNumber?: string;
  revenueRange?: string; fundingStage?: string; businessModels?: string[];
  missionStatement?: string; visionStatement?: string;
  specializations?: string[]; techStack?: string[];
  state?: string; pinCode?: string; fullAddress?: string; supportEmail?: string; whatsapp?: string;
  workPolicy?: string; companyValues?: string[]; perks?: string[]; certifications?: string[];
  numberOfOffices?: string;
}

// ─── Editor ───────────────────────────────────────────────────────────────────

export default function BusinessPageEditor({ page }: { page: PageData }) {
  const router = useRouter();
  const [activeIdx, setActiveIdx] = useState(0);

  const [form, setForm] = useState({
    name:               page.name || '',
    tagline:            page.tagline || '',
    description:        page.description || '',
    missionStatement:   page.missionStatement || '',
    visionStatement:    page.visionStatement || '',
    companyType:        page.companyType || '',
    industry:           page.industry || '',
    companySize:        page.companySize || '',
    revenueRange:       page.revenueRange || '',
    fundingStage:       page.fundingStage || '',
    businessModels:     page.businessModels || [] as string[],
    workPolicy:         page.workPolicy || '',
    foundedYear:        page.foundedYear ? String(page.foundedYear) : '',
    registrationNumber: page.registrationNumber || '',
    gstNumber:          page.gstNumber || '',
    numberOfOffices:    page.numberOfOffices || '',
    website:            page.website || '',
    fullAddress:        page.fullAddress || '',
    city:               page.city || '',
    state:              page.state || '',
    country:            page.country || 'India',
    pinCode:            page.pinCode || '',
    email:              page.email || '',
    supportEmail:       page.supportEmail || '',
    phone:              page.phone || '',
    whatsapp:           page.whatsapp || '',
    linkedin:           page.socialLinks?.linkedin || '',
    twitter:            page.socialLinks?.twitter || '',
    instagram:          page.socialLinks?.instagram || '',
    youtube:            page.socialLinks?.youtube || '',
    github:             page.socialLinks?.github || '',
    facebook:           page.socialLinks?.facebook || '',
  });

  const [specializations, setSpecializations] = useState<string[]>(page.specializations || []);
  const [techStack,       setTechStack]       = useState<string[]>(page.techStack || []);
  const [companyValues,   setCompanyValues]   = useState<string[]>(page.companyValues || []);
  const [perks,           setPerks]           = useState<string[]>(page.perks || []);
  const [certifications,  setCertifications]  = useState<string[]>(page.certifications || []);

  const [saving, setSaving]               = useState(false);
  const [saved,  setSaved]                = useState(false);
  const [error,  setError]                = useState('');
  const [logoUrl,    setLogoUrl]          = useState(page.logoUrl || '');
  const [coverUrl,   setCoverUrl]         = useState(page.coverUrl || '');
  const [logoUploading,  setLogoUploading]  = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [presetApplying, setPresetApplying] = useState<string | null>(null);
  const logoRef  = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  async function uploadImage(file: File, type: 'logo' | 'cover') {
    const fd = new FormData();
    fd.append('file', file); fd.append('type', type); fd.append('pageId', page.id);
    const res  = await fetch('/api/business-pages/upload-image', { method: 'POST', body: fd });
    const data = await res.json() as { url?: string; error?: string };
    if (!data.url) throw new Error(data.error ?? 'Upload failed');
    return data.url;
  }

  async function applyPreset(preset: BannerPreset) {
    setPresetApplying(preset.id);
    try {
      const blob = await drawBannerCanvas(preset);
      const file = new File([blob], `banner-${preset.id}.jpg`, { type: 'image/jpeg' });
      const fd = new FormData();
      fd.append('file', file); fd.append('type', 'cover'); fd.append('pageId', page.id);
      const res  = await fetch('/api/business-pages/upload-image', { method: 'POST', body: fd });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) { setCoverUrl(data.url); setSaved(false); }
      else setError(data.error ?? 'Preset upload failed');
    } catch { setError('Failed to apply preset'); }
    finally { setPresetApplying(null); }
  }

  function set(key: keyof typeof form, value: string | string[]) {
    setForm(f => ({ ...f, [key]: value })); setSaved(false);
  }

  async function save() {
    if (!form.name.trim() || !form.industry) { setError('Company name and industry are required.'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/business-pages/${page.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(), tagline: form.tagline.trim() || undefined,
          description: form.description.trim() || undefined,
          missionStatement: form.missionStatement.trim() || undefined,
          visionStatement:  form.visionStatement.trim() || undefined,
          companyType: form.companyType || undefined,
          industry: form.industry, companySize: form.companySize || undefined,
          revenueRange: form.revenueRange || undefined,
          fundingStage: form.fundingStage || undefined,
          businessModels: form.businessModels.length ? form.businessModels : undefined,
          workPolicy: form.workPolicy || undefined,
          foundedYear: form.foundedYear ? parseInt(form.foundedYear) : undefined,
          registrationNumber: form.registrationNumber.trim() || undefined,
          gstNumber: form.gstNumber.trim() || undefined,
          numberOfOffices: form.numberOfOffices || undefined,
          website: form.website.trim() || undefined,
          fullAddress: form.fullAddress.trim() || undefined,
          city: form.city.trim() || undefined,
          state: form.state.trim() || undefined,
          country: form.country.trim() || undefined,
          pinCode: form.pinCode.trim() || undefined,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          supportEmail: form.supportEmail.trim() || undefined,
          whatsapp: form.whatsapp.trim() || undefined,
          logoUrl: logoUrl || undefined,
          coverUrl: coverUrl || undefined,
          specializations: specializations.length ? specializations : undefined,
          techStack: techStack.length ? techStack : undefined,
          companyValues: companyValues.length ? companyValues : undefined,
          perks: perks.length ? perks : undefined,
          certifications: certifications.length ? certifications : undefined,
          socialLinks: {
            ...(form.linkedin  ? { linkedin:  form.linkedin  } : {}),
            ...(form.twitter   ? { twitter:   form.twitter   } : {}),
            ...(form.instagram ? { instagram: form.instagram } : {}),
            ...(form.youtube   ? { youtube:   form.youtube   } : {}),
            ...(form.github    ? { github:    form.github    } : {}),
            ...(form.facebook  ? { facebook:  form.facebook  } : {}),
          },
        }),
      });
      const data = await res.json() as { page?: PageData; error?: string };
      if (!res.ok || data.error) { setError(data.error || 'Failed to save'); return; }
      setSaved(true);
    } finally { setSaving(false); }
  }

  // ─── Style tokens ──────────────────────────────────────────────────────────

  const INPUT: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9,
    border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: 'inherit', transition: 'border-color 0.14s',
  };
  const LABEL: React.CSSProperties = {
    margin: '0 0 5px', fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.30)',
    letterSpacing: '0.07em', textTransform: 'uppercase',
  };
  const GB: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px',
    borderRadius: 9, border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)', color: 'rgba(255,255,255,0.58)',
    fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const,
    boxShadow: '0 2px 8px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07)',
    transition: 'all 0.15s',
  };
  const SAVE: React.CSSProperties = saved
    ? { ...GB, background: 'rgba(52,211,153,0.14)', border: '1px solid rgba(52,211,153,0.28)', color: '#34d399' }
    : { ...GB, background: 'rgba(10,10,10,0.80)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.10)' };

  const ROW2: React.CSSProperties  = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
  const ROW3: React.CSSProperties  = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 };
  const CARD: React.CSSProperties  = { borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', padding: '14px 16px' };
  const SEC_TITLE: React.CSSProperties = { margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.50)', textTransform: 'uppercase', letterSpacing: '0.07em' };
  const SEC_SUB: React.CSSProperties  = { margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.22)', lineHeight: 1.5 };

  const ICON_INPUT = (icon: React.ReactNode, field: keyof typeof form, placeholder: string, type = 'text') => (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.22)', pointerEvents: 'none', display: 'flex' }}>{icon}</span>
      <input value={form[field] as string} onChange={e => set(field, e.target.value)} placeholder={placeholder} type={type}
        style={{ ...INPUT, paddingLeft: 30 }} />
    </div>
  );

  const activeId = SECTIONS[activeIdx].id;

  return (
    <div className="bpe-root">
      <style>{`
        @keyframes spin      { to { transform: rotate(360deg); } }
        @keyframes floatY    { 0%,100%{transform:translateY(0) scale(1);}    50%{transform:translateY(-8px) scale(1.06);} }
        @keyframes floatY2   { 0%,100%{transform:translateY(0) scale(1);}    50%{transform:translateY(7px)  scale(0.94);} }
        @keyframes floatX    { 0%,100%{transform:translateX(0) scale(1);}    50%{transform:translateX(10px) scale(1.08);} }
        @keyframes pulseO    { 0%,100%{opacity:0.55;transform:scale(1);}     50%{opacity:1;transform:scale(1.12);} }
        @keyframes shimmer   { 0%{transform:translateX(-120%);} 100%{transform:translateX(320%);} }
        @keyframes textFloat { 0%,100%{transform:translateY(0);opacity:.92;} 50%{transform:translateY(-3px);opacity:1;} }

        .bpe-root{height:100dvh;display:flex;flex-direction:column;background:#090910;color:#fff;overflow:hidden;font-family:inherit;}
        input:focus,textarea:focus{outline:none;border-color:rgba(255,255,255,0.22)!important;}
        .gb:hover{background:rgba(255,255,255,0.07)!important;border-color:rgba(255,255,255,0.18)!important;color:rgba(255,255,255,0.85)!important;}
        .sz-btn:hover{border-color:rgba(255,255,255,0.18)!important;background:rgba(255,255,255,0.06)!important;}
        .sz-btn.sel{border-color:rgba(255,255,255,0.28)!important;background:rgba(255,255,255,0.10)!important;color:rgba(255,255,255,0.90)!important;}
        .ind-btn:hover{border-color:rgba(255,255,255,0.18)!important;background:rgba(255,255,255,0.06)!important;}
        .ind-btn.sel{border-color:rgba(255,255,255,0.28)!important;background:rgba(255,255,255,0.10)!important;color:rgba(255,255,255,0.90)!important;}
        .nav-btn{width:100%;text-align:left;padding:8px 12px;border-radius:9px;border:1px solid transparent;background:transparent;color:rgba(255,255,255,0.38);font-size:13px;font-weight:500;cursor:pointer;transition:all 0.14s;}
        .nav-btn:hover{background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.70);}
        .nav-btn.active{background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.12);color:#fff;font-weight:600;}
        .tab-btn{flex:1;min-width:0;padding:7px 4px 5px;border:none;background:transparent;color:rgba(255,255,255,0.32);font-size:9.5px;font-weight:600;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;transition:color 0.14s;letter-spacing:0.04em;text-transform:uppercase;}
        .tab-btn.active{color:#fff;}
        .tab-dot{width:4px;height:4px;border-radius:50%;background:currentColor;opacity:0;transition:opacity 0.14s;}
        .tab-btn.active .tab-dot{opacity:1;}
        .bpe-body{flex:1;display:flex;overflow:hidden;}
        .bpe-sidebar{width:188px;flex-shrink:0;border-right:1px solid rgba(255,255,255,0.06);padding:16px 10px;display:flex;flex-direction:column;gap:2px;overflow-y:auto;}
        .bpe-content{flex:1;display:flex;align-items:stretch;padding:20px 28px;overflow:hidden;}
        .bpe-mobile-tabs{display:none;}
        .preset-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
        .preset-card{position:relative;border-radius:11px;overflow:hidden;cursor:pointer;border:1.5px solid rgba(255,255,255,0.10);transition:transform 0.20s ease,border-color 0.20s ease,box-shadow 0.20s ease;}
        .preset-card:hover{transform:translateY(-3px) scale(1.025);border-color:rgba(255,255,255,0.30)!important;box-shadow:0 12px 36px rgba(0,0,0,0.7);}
        .preset-card:hover .pshimmer{animation:shimmer 1s ease forwards;}
        .pshimmer{position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,0.10) 50%,transparent 65%);transform:translateX(-120%);pointer-events:none;z-index:6;border-radius:11px;}
        .preset-card.applying{border-color:rgba(255,255,255,0.45)!important;box-shadow:0 0 0 2px rgba(255,255,255,0.18),0 10px 32px rgba(0,0,0,0.6);}
        .porb{position:absolute;border-radius:50%;pointer-events:none;filter:blur(18px);}
        .porb1{width:65%;height:120%;top:-20%;left:-15%;animation:floatX 5s ease-in-out infinite;}
        .porb2{width:55%;height:110%;bottom:-25%;right:-10%;animation:floatY2 6s ease-in-out infinite;animation-delay:-2s;}
        .porb3{width:40%;height:80%;top:10%;left:35%;animation:pulseO 4s ease-in-out infinite;animation-delay:-1s;}
        .ptext{animation:textFloat 4s ease-in-out infinite;}
        .ind-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;}
        .section-scroll{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:14px;padding-right:4px;}
        @media (max-width:640px){
          .bpe-sidebar{display:none;}
          .bpe-content{padding:12px 14px;}
          .bpe-mobile-tabs{display:flex;border-top:1px solid rgba(255,255,255,0.07);background:rgba(9,9,16,0.97);flex-shrink:0;overflow-x:auto;}
          .bpe-topbar-name{display:none;}
          .preset-grid{grid-template-columns:repeat(2,1fr);gap:8px;}
          .ind-grid{grid-template-columns:repeat(3,1fr)!important;}
          .row2m{grid-template-columns:1fr!important;}
          .row3m{grid-template-columns:1fr 1fr!important;}
        }
        @media (min-width:641px) and (max-width:900px){
          .bpe-sidebar{width:150px;}
          .bpe-content{padding:16px 20px;}
          .ind-grid{grid-template-columns:repeat(4,1fr)!important;}
        }
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.10);border-radius:4px;}
      `}</style>

      {/* Hidden inputs */}
      <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display:'none' }}
        onChange={async e => { const f=e.target.files?.[0]; if(!f) return; setLogoUploading(true); try{ setLogoUrl(await uploadImage(f,'logo')); setSaved(false); } catch{ setError('Logo upload failed'); } finally{ setLogoUploading(false); if(logoRef.current) logoRef.current.value=''; }}} />
      <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display:'none' }}
        onChange={async e => { const f=e.target.files?.[0]; if(!f) return; setCoverUploading(true); try{ setCoverUrl(await uploadImage(f,'cover')); setSaved(false); } catch{ setError('Cover upload failed'); } finally{ setCoverUploading(false); if(coverRef.current) coverRef.current.value=''; }}} />

      {/* ── Top bar ── */}
      <div style={{ flexShrink:0, height:52, borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', gap:10, padding:'0 16px', background:'rgba(9,9,16,0.97)', backdropFilter:'blur(20px)' }}>
        <button className="gb" onClick={() => router.push(`/businesses/${page.slug}`)} style={GB}>
          <ArrowLeft style={{ width:12, height:12 }} /> Back
        </button>
        <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, minWidth:0 }}>
          <div style={{ width:26, height:26, borderRadius:7, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.09)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Building2 style={{ width:12, height:12, color:'rgba(255,255,255,0.45)' }} />
          </div>
          <span style={{ fontSize:13.5, fontWeight:700, color:'rgba(255,255,255,0.88)', letterSpacing:'-0.01em', whiteSpace:'nowrap' }}>Edit Business Page</span>
          <span className="bpe-topbar-name" style={{ fontSize:12, color:'rgba(255,255,255,0.26)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{page.name}</span>
        </div>
        {error && <span style={{ fontSize:11.5, color:'rgba(252,165,165,0.9)', padding:'3px 9px', borderRadius:6, background:'rgba(239,68,68,0.09)', border:'1px solid rgba(239,68,68,0.18)', whiteSpace:'nowrap', flexShrink:0 }}>{error}</span>}
        <button className="gb" onClick={() => router.push(`/businesses/${page.slug}`)} style={GB}>Cancel</button>
        <button className="gb" onClick={save} disabled={saving} style={{ ...SAVE, cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saved ? <><Check style={{ width:12, height:12 }}/> Saved</> : saving ? 'Saving…' : <><Save style={{ width:12, height:12 }}/> Save</>}
        </button>
      </div>

      {/* ── Body ── */}
      <div className="bpe-body">
        {/* Sidebar */}
        <div className="bpe-sidebar">
          <p style={{ margin:'0 0 8px 8px', fontSize:9.5, fontWeight:700, color:'rgba(255,255,255,0.20)', letterSpacing:'0.09em', textTransform:'uppercase' }}>Sections</p>
          {SECTIONS.map((s,i) => (
            <button key={s.id} className={`nav-btn ${activeIdx===i?'active':''}`} onClick={() => setActiveIdx(i)}>{s.label}</button>
          ))}
        </div>

        {/* Content */}
        <div className="bpe-content">
          <div style={{ width:'100%', maxWidth:680, margin:'0 auto', height:'100%', display:'flex', flexDirection:'column' }}>

            {/* Section header */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14, flexShrink:0 }}>
              <div style={{ flex:1 }}>
                <p style={{ margin:0, fontSize:16, fontWeight:700, color:'rgba(255,255,255,0.88)', letterSpacing:'-0.02em' }}>{SECTIONS[activeIdx].label}</p>
              </div>
              <button className="gb" onClick={() => setActiveIdx(i => Math.max(0,i-1))} disabled={activeIdx===0} style={{ ...GB, padding:'6px 10px', opacity:activeIdx===0?.35:1 }}><ChevronLeft style={{ width:13, height:13 }}/></button>
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.28)', fontWeight:600 }}>{activeIdx+1}/{SECTIONS.length}</span>
              <button className="gb" onClick={() => setActiveIdx(i => Math.min(SECTIONS.length-1,i+1))} disabled={activeIdx===SECTIONS.length-1} style={{ ...GB, padding:'6px 10px', opacity:activeIdx===SECTIONS.length-1?.35:1 }}><ChevronRight style={{ width:13, height:13 }}/></button>
            </div>

            {/* Card */}
            <div style={{ flex:1, background:'rgba(255,255,255,0.022)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:'18px 20px', overflow:'hidden', display:'flex', flexDirection:'column' }}>

              {/* ── 1. MEDIA ── */}
              {activeId==='media' && (
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:13 }}>
                  <div style={{ flexShrink:0 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                      <p style={LABEL}>Banner Presets</p>
                      <p style={{ margin:0, fontSize:10, color:'rgba(255,255,255,0.18)' }}>Click to apply</p>
                    </div>
                    <div className="preset-grid">
                      {BANNER_PRESETS.map(preset => {
                        const isApplying = presetApplying===preset.id;
                        return (
                          <button key={preset.id} type="button" onClick={() => !presetApplying && applyPreset(preset)} disabled={!!presetApplying}
                            className={`preset-card ${isApplying?'applying':''}`} style={{ display:'block', width:'100%', textAlign:'left', padding:0, cursor:presetApplying?'not-allowed':'pointer' }}>
                            <div style={{ position:'relative', paddingTop:'42%', background:preset.css, overflow:'hidden' }}>
                              <div className="porb porb1" style={{ background:`radial-gradient(circle,${preset.glowColor} 0%,transparent 70%)` }}/>
                              <div className="porb porb2" style={{ background:`radial-gradient(circle,${preset.accentColor} 0%,transparent 70%)` }}/>
                              <div className="porb porb3" style={{ background:`radial-gradient(circle,${preset.glowColor} 0%,transparent 65%)`, opacity:0.5 }}/>
                              <div className="pshimmer"/>
                              {[0,1,2,3].map(i=>(
                                <div key={i} style={{ position:'absolute', borderRadius:'50%', pointerEvents:'none', width:3, height:3, background:preset.textColor, opacity:0.5, left:`${15+i*22}%`, top:`${25+(i%2)*35}%`, animation:`${i%2===0?'floatY':'floatY2'} ${3+i*0.7}s ease-in-out infinite`, animationDelay:`${-i*0.8}s`, filter:'blur(0.5px)' }}/>
                              ))}
                              <div className="ptext" style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'6px 12px', gap:4, zIndex:4 }}>
                                <p style={{ margin:0, fontSize:9, fontStyle:'italic', fontWeight:700, color:preset.textColor, textAlign:'center', lineHeight:1.45, textShadow:'0 1px 8px rgba(0,0,0,0.8)', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{preset.quote}</p>
                                <p style={{ margin:0, fontSize:7.5, color:preset.subColor, textAlign:'center', fontWeight:500 }}>{preset.author}</p>
                              </div>
                              {isApplying && <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.60)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10 }}><div style={{ width:18, height:18, borderRadius:'50%', border:'2.5px solid rgba(255,255,255,0.2)', borderTopColor:'#fff', animation:'spin 0.7s linear infinite' }}/></div>}
                            </div>
                            <div style={{ padding:'5px 9px 6px', background:'rgba(0,0,0,0.40)' }}>
                              <p style={{ margin:0, fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.60)', letterSpacing:'0.05em', textTransform:'uppercase' }}>{preset.name}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
                    <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.06)' }}/>
                    <p style={{ margin:0, fontSize:10, color:'rgba(255,255,255,0.20)', fontWeight:600 }}>OR UPLOAD YOUR OWN</p>
                    <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.06)' }}/>
                  </div>

                  <div style={{ position:'relative', flexShrink:0 }}>
                    <div style={{ paddingTop:'28%' }}/>
                    <div onClick={() => coverRef.current?.click()} style={{ position:'absolute', inset:0, borderRadius:11, background:coverUrl?`url(${coverUrl}) center/cover no-repeat`:'rgba(255,255,255,0.03)', border:'1.5px dashed rgba(255,255,255,0.12)', cursor:'pointer', overflow:'hidden' }}>
                      {!coverUrl && <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:5 }}><Camera style={{ width:18, height:18, color:'rgba(255,255,255,0.20)' }}/><p style={{ margin:0, fontSize:11, color:'rgba(255,255,255,0.25)' }}>Upload custom cover</p></div>}
                      <button type="button" onClick={e => { e.stopPropagation(); coverRef.current?.click(); }} style={{ position:'absolute', top:8, right:8, ...GB, fontSize:11, padding:'4px 10px', zIndex:2 }}>
                        {coverUploading?<div style={{ width:9, height:9, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.2)', borderTopColor:'#fff', animation:'spin 0.7s linear infinite' }}/>:<Camera style={{ width:10, height:10 }}/>}
                        {coverUploading?'Uploading…':coverUrl?'Change':'Upload'}
                      </button>
                    </div>
                  </div>

                  <div style={{ flexShrink:0, borderRadius:11, border:'1px solid rgba(255,255,255,0.07)', background:'rgba(255,255,255,0.025)', padding:'12px 14px', display:'flex', alignItems:'center', gap:14 }}>
                    <div style={{ position:'relative', flexShrink:0 }}>
                      <div onClick={() => logoRef.current?.click()} style={{ width:52, height:52, borderRadius:11, border:'2px solid rgba(255,255,255,0.10)', background:logoUrl?`url(${logoUrl}) center/cover no-repeat`:'rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:800, color:'rgba(255,255,255,0.50)', cursor:'pointer' }}>
                        {!logoUrl && page.name.charAt(0).toUpperCase()}
                      </div>
                      <button type="button" onClick={() => logoRef.current?.click()} disabled={logoUploading} style={{ position:'absolute', bottom:-2, right:-2, width:19, height:19, borderRadius:'50%', border:'2px solid rgba(9,9,16,1)', background:'rgba(0,0,0,0.85)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                        {logoUploading?<div style={{ width:7, height:7, borderRadius:'50%', border:'1.5px solid rgba(255,255,255,0.2)', borderTopColor:'#fff', animation:'spin 0.7s linear infinite' }}/>:<Camera style={{ width:8, height:8, color:'rgba(255,255,255,0.65)' }}/>}
                      </button>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ margin:0, fontSize:13, fontWeight:700, color:'rgba(255,255,255,0.70)' }}>Company Logo</p>
                      <p style={{ margin:'2px 0 0', fontSize:11, color:'rgba(255,255,255,0.25)' }}>400×400 px · JPEG, PNG, WebP · Max 8 MB</p>
                    </div>
                    <button className="gb" onClick={() => logoRef.current?.click()} style={{ ...GB, flexShrink:0 }}><Camera style={{ width:10, height:10 }}/> Upload</button>
                  </div>
                </div>
              )}

              {/* ── 2. COMPANY PROFILE ── */}
              {activeId==='profile' && (
                <div className="section-scroll">
                  <div style={ROW2} className="row2m">
                    <div><p style={LABEL}>Company Name *</p><input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="Legal company name" style={INPUT}/></div>
                    <div>
                      <p style={LABEL}>Company Type</p>
                      <ChipGroup options={COMPANY_TYPES} value={form.companyType} onChange={v=>set('companyType',v as string)}/>
                    </div>
                  </div>
                  <div><p style={LABEL}>Tagline</p><input value={form.tagline} onChange={e=>set('tagline',e.target.value)} placeholder="A one-line description of what you do" maxLength={100} style={INPUT}/></div>
                  <div><p style={LABEL}>About / Description</p><textarea value={form.description} onChange={e=>set('description',e.target.value)} placeholder="Describe your company, what it does, and who it serves…" rows={3} style={{ ...INPUT, resize:'none', lineHeight:1.6 }}/></div>
                  <div style={ROW2} className="row2m">
                    <div><p style={LABEL}>Mission Statement</p><textarea value={form.missionStatement} onChange={e=>set('missionStatement',e.target.value)} placeholder="Why does your company exist?" rows={2} style={{ ...INPUT, resize:'none', lineHeight:1.6 }}/></div>
                    <div><p style={LABEL}>Vision Statement</p><textarea value={form.visionStatement} onChange={e=>set('visionStatement',e.target.value)} placeholder="Where are you headed?" rows={2} style={{ ...INPUT, resize:'none', lineHeight:1.6 }}/></div>
                  </div>
                </div>
              )}

              {/* ── 3. BUSINESS DETAILS ── */}
              {activeId==='bizdetail' && (
                <div className="section-scroll">
                  <div style={ROW3} className="row3m">
                    <div><p style={LABEL}>Founded Year</p><input value={form.foundedYear} onChange={e=>set('foundedYear',e.target.value)} placeholder="2015" type="number" style={INPUT}/></div>
                    <div><p style={LABEL}>No. of Offices</p><input value={form.numberOfOffices} onChange={e=>set('numberOfOffices',e.target.value)} placeholder="e.g. 3" style={INPUT}/></div>
                    <div><p style={LABEL}>Website</p>{ICON_INPUT(<Globe style={{ width:12, height:12 }}/>, 'website', 'https://company.com')}</div>
                  </div>
                  <div style={ROW2} className="row2m">
                    <div><p style={LABEL}>CIN / Reg. Number</p><input value={form.registrationNumber} onChange={e=>set('registrationNumber',e.target.value)} placeholder="U12345KA2020PTC123456" style={INPUT}/></div>
                    <div><p style={LABEL}>GST / Tax ID</p><input value={form.gstNumber} onChange={e=>set('gstNumber',e.target.value)} placeholder="29AABCU9603R1ZX" style={INPUT}/></div>
                  </div>
                  <div><p style={LABEL}>Annual Revenue Range</p><ChipGroup options={REVENUE_RANGES} value={form.revenueRange} onChange={v=>set('revenueRange',v as string)}/></div>
                  <div><p style={LABEL}>Funding Stage</p><ChipGroup options={FUNDING_STAGES} value={form.fundingStage} onChange={v=>set('fundingStage',v as string)}/></div>
                  <div><p style={LABEL}>Business Model <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0 }}>(select all that apply)</span></p><ChipGroup options={BIZ_MODELS} value={form.businessModels} onChange={v=>set('businessModels',v as string[])} multi/></div>
                </div>
              )}

              {/* ── 4. INDUSTRY & SCALE ── */}
              {activeId==='industry' && (
                <div className="section-scroll">
                  <div>
                    <p style={{ ...LABEL, marginBottom:8 }}>Industry *</p>
                    <div className="ind-grid">
                      {INDUSTRIES.map(ind=>(
                        <button key={ind.value} type="button" onClick={()=>set('industry',ind.value)}
                          className={`ind-btn ${form.industry===ind.value?'sel':''}`}
                          style={{ padding:'8px 6px', borderRadius:9, border:'1px solid rgba(255,255,255,0.07)', background:'rgba(255,255,255,0.025)', color:'rgba(255,255,255,0.42)', fontSize:11, fontWeight:600, cursor:'pointer', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:4, transition:'all 0.13s', lineHeight:1.25 }}>
                          <span style={{ fontSize:16 }}>{ind.emoji}</span><span>{ind.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div><p style={{ ...LABEL, marginBottom:8 }}>Company Size</p><ChipGroup options={SIZES} value={form.companySize} onChange={v=>set('companySize',v as string)}/></div>
                  <div>
                    <p style={LABEL}>Specializations / Core Competencies</p>
                    <p style={{ ...SEC_SUB, marginBottom:6 }}>Add keywords that describe what your company specialises in</p>
                    <TagInput tags={specializations} onChange={setSpecializations} placeholder="e.g. Cloud Infrastructure, DevOps, AI/ML…"/>
                  </div>
                  <div>
                    <p style={LABEL}>Tech Stack / Technologies</p>
                    <p style={{ ...SEC_SUB, marginBottom:6 }}>Tools, frameworks and platforms your team uses</p>
                    <TagInput tags={techStack} onChange={setTechStack} placeholder="e.g. React, Node.js, AWS, Postgres…" color="rgba(99,102,241,0.18)"/>
                  </div>
                </div>
              )}

              {/* ── 5. CONTACT & LOCATION ── */}
              {activeId==='contact' && (
                <div className="section-scroll">
                  <div><p style={LABEL}>Registered / HQ Address</p><input value={form.fullAddress} onChange={e=>set('fullAddress',e.target.value)} placeholder="Street, Building, Floor" style={INPUT}/></div>
                  <div style={ROW3} className="row3m">
                    <div><p style={LABEL}>City</p><input value={form.city} onChange={e=>set('city',e.target.value)} placeholder="Bengaluru" style={INPUT}/></div>
                    <div><p style={LABEL}>State</p><input value={form.state} onChange={e=>set('state',e.target.value)} placeholder="Karnataka" style={INPUT}/></div>
                    <div><p style={LABEL}>PIN / ZIP</p><input value={form.pinCode} onChange={e=>set('pinCode',e.target.value)} placeholder="560001" style={INPUT}/></div>
                  </div>
                  <div><p style={LABEL}>Country</p><input value={form.country} onChange={e=>set('country',e.target.value)} placeholder="India" style={INPUT}/></div>
                  <div style={ROW2} className="row2m">
                    <div><p style={LABEL}>Primary Email</p>{ICON_INPUT(<Mail style={{ width:12, height:12 }}/>, 'email', 'hello@company.com','email')}</div>
                    <div><p style={LABEL}>Support Email</p>{ICON_INPUT(<Mail style={{ width:12, height:12 }}/>, 'supportEmail', 'support@company.com','email')}</div>
                  </div>
                  <div style={ROW2} className="row2m">
                    <div><p style={LABEL}>Phone</p>{ICON_INPUT(<Phone style={{ width:12, height:12 }}/>, 'phone', '+91 98765 43210')}</div>
                    <div><p style={LABEL}>WhatsApp</p>{ICON_INPUT(<Phone style={{ width:12, height:12 }}/>, 'whatsapp', '+91 98765 43210')}</div>
                  </div>
                </div>
              )}

              {/* ── 6. SOCIAL & WEB ── */}
              {activeId==='social' && (
                <div className="section-scroll">
                  <div style={ROW2} className="row2m">
                    <div><p style={LABEL}>Website</p>{ICON_INPUT(<Globe style={{ width:12, height:12 }}/>, 'website', 'https://company.com')}</div>
                    <div><p style={LABEL}>LinkedIn</p>{ICON_INPUT(<Linkedin style={{ width:12, height:12 }}/>, 'linkedin', 'https://linkedin.com/company/…')}</div>
                  </div>
                  <div style={ROW2} className="row2m">
                    <div><p style={LABEL}>Twitter / X</p>{ICON_INPUT(<Twitter style={{ width:12, height:12 }}/>, 'twitter', 'https://twitter.com/…')}</div>
                    <div><p style={LABEL}>Instagram</p>{ICON_INPUT(<Instagram style={{ width:12, height:12 }}/>, 'instagram', 'https://instagram.com/…')}</div>
                  </div>
                  <div style={ROW2} className="row2m">
                    <div><p style={LABEL}>YouTube</p>{ICON_INPUT(<Youtube style={{ width:12, height:12 }}/>, 'youtube', 'https://youtube.com/…')}</div>
                    <div><p style={LABEL}>GitHub</p>{ICON_INPUT(<Github style={{ width:12, height:12 }}/>, 'github', 'https://github.com/…')}</div>
                  </div>
                  <div><p style={LABEL}>Facebook</p>{ICON_INPUT(<Facebook style={{ width:12, height:12 }}/>, 'facebook', 'https://facebook.com/…')}</div>
                </div>
              )}

              {/* ── 7. CULTURE & VALUES ── */}
              {activeId==='culture' && (
                <div className="section-scroll">
                  <div>
                    <p style={LABEL}>Work Policy</p>
                    <ChipGroup options={WORK_POLICIES} value={form.workPolicy} onChange={v=>set('workPolicy',v as string)}/>
                  </div>
                  <div>
                    <p style={LABEL}>Company Values</p>
                    <p style={{ ...SEC_SUB, marginBottom:6 }}>Core principles that guide your organisation</p>
                    <TagInput tags={companyValues} onChange={setCompanyValues} placeholder="e.g. Integrity, Innovation, Customer-first…" color="rgba(168,85,247,0.18)"/>
                  </div>
                  <div>
                    <p style={LABEL}>Perks & Benefits</p>
                    <p style={{ ...SEC_SUB, marginBottom:6 }}>What makes working here great</p>
                    <TagInput tags={perks} onChange={setPerks} placeholder="e.g. Health Insurance, Flexible Hours, ESOPs…" color="rgba(34,197,94,0.18)"/>
                  </div>
                  <div>
                    <p style={LABEL}>Certifications & Awards</p>
                    <p style={{ ...SEC_SUB, marginBottom:6 }}>ISO certifications, industry awards, recognitions</p>
                    <TagInput tags={certifications} onChange={setCertifications} placeholder="e.g. ISO 27001, Great Place to Work, Forbes 30…" color="rgba(245,158,11,0.18)"/>
                  </div>
                </div>
              )}

              {/* ── 8. TEAM ── */}
              {activeId==='team' && (
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:0, overflow:'hidden' }}>
                  <p style={{ margin:'0 0 12px', fontSize:12.5, color:'rgba(255,255,255,0.28)', lineHeight:1.55 }}>
                    Invite employees via a link. They must have a Docrud profile to appear on your company page.
                  </p>
                  <div style={{ flex:1, overflow:'hidden' }}>
                    <BusinessEmployeeManager pageId={page.id} pageName={page.name} pageSlug={page.slug} origin={typeof window!=='undefined'?window.location.origin:''} />
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile bottom tabs ── */}
      <div className="bpe-mobile-tabs">
        {SECTIONS.map((s,i) => (
          <button key={s.id} className={`tab-btn ${activeIdx===i?'active':''}`} onClick={() => setActiveIdx(i)}>
            <span>{s.short}</span>
            <div className="tab-dot"/>
          </button>
        ))}
      </div>
    </div>
  );
}
