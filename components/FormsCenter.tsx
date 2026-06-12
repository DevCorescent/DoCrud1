'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  BarChart2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  X,
} from 'lucide-react';
import { buildAbsoluteAppUrl } from '@/lib/url';

/* ─── types ─────────────────────────────────────────────────────────────── */

type BuildStep = 'basics' | 'fields' | 'design' | 'publish' | 'done';
type FieldType = 'text' | 'textarea' | 'email' | 'number' | 'date' | 'select' | 'tel' | 'url' | 'checkbox' | 'radio' | 'image';

type FormField = { id: string; label: string; name: string; type: FieldType; placeholder: string; required: boolean; options: string };

type AppearanceDraft = {
  eyebrow: string; heroTitle: string; heroDescription: string; introNote: string;
  footerNote: string; submitLabel: string; successMessage: string;
  surfaceTone: 'slate' | 'amber' | 'emerald' | 'sky' | 'rose';
  cardStyle: 'soft' | 'outlined' | 'glass';
  buttonStyle: 'solid' | 'outline';
  accentColor: string; backgroundColor: string; textColor: string;
  showFieldTypes: boolean; showOptionChips: boolean;
  heroAlignment: 'left' | 'center'; fieldColumns: 1 | 2; submitButtonWidth: 'full' | 'fit';
  thankYouRedirectUrl: string;
};

type SavedForm = {
  id: string; name: string; description?: string; updatedAt?: string; createdAt?: string;
  fields: Array<{ id: string; label: string; name: string; type: FieldType; required: boolean; placeholder?: string; options?: string[] }>;
  shareUrl?: string; sharePassword?: string; requiresPassword: boolean;
  instructions?: string; accessMode: 'secure' | 'open';
  expiryAt?: string; maxResponses?: number;
  submissions: Array<{ id: string; submittedAt: string; submittedBy: string; data: Record<string, string> }>;
  latestSubmissionAt?: string;
  insights: { totalSubmissions: number; averageCompletionRate: number; responseVelocity?: string; recommendations: string[]; summary: string; strongestFields: Array<{ field: string; fillRate: number; sampleValues: string[] }>; weakestFields: Array<{ field: string; fillRate: number }> };
};

/* ─── constants ──────────────────────────────────────────────────────────── */

const STEPS: { id: BuildStep; n: number; label: string; sub: string }[] = [
  { id: 'basics',  n: 1, label: 'Basics',  sub: 'Title & access rules' },
  { id: 'fields',  n: 2, label: 'Fields',  sub: 'Add your questions' },
  { id: 'design',  n: 3, label: 'Design',  sub: 'Look & feel' },
  { id: 'publish', n: 4, label: 'Publish', sub: 'Review & go live' },
];

const FIELD_TYPES: FieldType[] = ['text', 'email', 'tel', 'number', 'textarea', 'date', 'select', 'radio', 'checkbox', 'url', 'image'];

const TONES = [
  { id: 'slate'   as const, label: 'Slate',   dot: '#334155' },
  { id: 'sky'     as const, label: 'Sky',     dot: '#0369a1' },
  { id: 'emerald' as const, label: 'Emerald', dot: '#065f46' },
  { id: 'amber'   as const, label: 'Amber',   dot: '#92400e' },
  { id: 'rose'    as const, label: 'Rose',    dot: '#881337' },
];

const DEFAULT_APP: AppearanceDraft = {
  eyebrow: 'Secure Form', heroTitle: '', heroDescription: '', introNote: '',
  footerNote: 'Responses are collected securely.', submitLabel: 'Submit Response',
  successMessage: 'Response submitted successfully.',
  surfaceTone: 'slate', cardStyle: 'soft', buttonStyle: 'solid',
  accentColor: '#0f172a', backgroundColor: '#ffffff', textColor: '#0f172a',
  showFieldTypes: true, showOptionChips: true, heroAlignment: 'left', fieldColumns: 2,
  submitButtonWidth: 'full', thankYouRedirectUrl: '',
};

/* ─── helpers ────────────────────────────────────────────────────────────── */

const slug = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const esc  = (v: string) => v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const ago  = (iso: string) => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
};
const mkField = (i: number): FormField => ({
  id: `ff-${Date.now()}-${i}-${Math.random().toString(36).slice(2,6)}`,
  label: `Field ${i + 1}`, name: `field_${i + 1}`,
  type: 'text', placeholder: '', required: false, options: '',
});

function previewHtml(title: string, desc: string, instr: string, mode: 'secure'|'open', fields: FormField[], a: AppearanceDraft) {
  const tm: Record<string, {hero:string;sh:string;bd:string;mu:string}> = {
    slate:   { hero:'linear-gradient(135deg,#0f172a,#1e293b)', sh:'#f8fafc', bd:'#e2e8f0', mu:'#64748b' },
    amber:   { hero:'linear-gradient(135deg,#422006,#92400e)', sh:'#fffbeb', bd:'#fcd34d', mu:'#92400e' },
    emerald: { hero:'linear-gradient(135deg,#064e3b,#065f46)', sh:'#ecfdf5', bd:'#a7f3d0', mu:'#047857' },
    sky:     { hero:'linear-gradient(135deg,#0f172a,#0c4a6e)', sh:'#f0f9ff', bd:'#bae6fd', mu:'#0369a1' },
    rose:    { hero:'linear-gradient(135deg,#4c0519,#881337)', sh:'#fff1f2', bd:'#fecdd3', mu:'#be123c' },
  };
  const t = tm[a.surfaceTone];
  const s = (v:string) => esc(v||'');
  const flds = fields.map((f,i) => {
    const lbl = s(f.label||`Field ${i+1}`);
    const ph  = s(f.placeholder||`Enter ${f.label?.toLowerCase()||'value'}`);
    const tag = a.showFieldTypes ? `<span class="mt">${s(f.type)}</span>` : '';
    const opts = (f.type==='select'||f.type==='radio') ? f.options.split(',').map(o=>o.trim()).filter(Boolean) : [];
    const chips = a.showOptionChips&&opts.length ? `<div class="ch">${opts.map(o=>`<span class="chip">${s(o)}</span>`).join('')}</div>` : '';
    let ctrl = `<input class="c" placeholder="${ph}" />`;
    if(f.type==='textarea') ctrl=`<textarea class="c ta" placeholder="${ph}"></textarea>`;
    else if(f.type==='select') ctrl=`<select class="c"><option>${ph}</option>${opts.map(o=>`<option>${s(o)}</option>`).join('')}</select>`;
    else if(f.type==='radio') ctrl=`<div class="st">${opts.map(o=>`<label class="rc"><input type="radio"/><span>${s(o)}</span></label>`).join('')||`<label class="rc"><input type="radio"/><span>Option 1</span></label>`}</div>`;
    else if(f.type==='checkbox') ctrl=`<label class="rc"><input type="checkbox"/><span>${ph}</span></label>`;
    else if(f.type==='image') ctrl=`<div class="ib">Tap to upload image</div>`;
    return `<div class="fc"><div class="fh"><label>${lbl}${f.required?' *':''}</label>${tag}</div>${ctrl}${chips}</div>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>
  *{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;background:${a.backgroundColor};color:${a.textColor}}
  .fr{padding:24px}.sh{max-width:720px;margin:0 auto;display:grid;gap:16px}
  .hero{border-radius:24px;padding:22px;background:${t.hero};color:#fff;text-align:${a.heroAlignment}}
  .ey{margin:0 0 8px;font-size:10px;letter-spacing:.26em;text-transform:uppercase;color:rgba(255,255,255,.6)}
  h1{margin:0;font-size:26px;line-height:1.15}.hero p{margin:10px 0 0;font-size:13px;line-height:1.7;color:rgba(255,255,255,.8)}
  .pr{display:flex;flex-wrap:wrap;gap:8px}.pill{border-radius:999px;padding:6px 10px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;background:${t.sh};color:${t.mu};border:1px solid ${t.bd}}
  .grid{display:grid;gap:12px;grid-template-columns:${a.fieldColumns===1?'1fr':'repeat(auto-fit,minmax(220px,1fr))'}}
  .fc{border-radius:18px;padding:14px;border:1px solid ${t.bd};background:${a.cardStyle==='glass'?'rgba(255,255,255,.72)':a.cardStyle==='outlined'?'transparent':'#fff'}}
  .fh{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}
  label{font-size:13px;font-weight:600;color:${a.textColor}}.mt{font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:${t.mu}}
  .c{width:100%;border:1px solid ${t.bd};background:#fff;color:${a.textColor};border-radius:12px;padding:10px 12px;font-size:13px;outline:none}
  .ta{min-height:90px;resize:none}.st{display:grid;gap:8px}.rc{display:flex;align-items:center;gap:8px;font-size:13px;color:${a.textColor}}
  .ib{min-height:100px;border-radius:14px;border:1px dashed ${t.bd};background:${t.sh};display:flex;align-items:center;justify-content:center;color:${t.mu};font-size:12px}
  .ch{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.chip{border-radius:999px;border:1px solid ${t.bd};background:${t.sh};color:${t.mu};font-size:11px;padding:4px 9px}
  .sub{width:${a.submitButtonWidth==='fit'?'auto':'100%'};border:0;border-radius:14px;padding:12px 16px;font-weight:700;font-size:13px;background:${a.accentColor};color:#fff}
  .ft{border-radius:14px;padding:12px;background:${t.sh};border:1px solid ${t.bd};color:${t.mu};font-size:12px;line-height:1.7}
  </style></head><body><div class="fr"><div class="sh">
  <div class="hero"><p class="ey">${s(a.eyebrow)}</p><h1>${s(a.heroTitle||title||'Untitled Form')}</h1><p>${s(a.heroDescription||desc||'Your respondents will see this form.')}</p></div>
  <div class="pr"><div class="pill">${mode==='open'?'Open':'Protected'}</div><div class="pill">${fields.length} fields</div><div class="pill">${s(a.submitLabel)}</div></div>
  ${instr.trim()?`<div class="ft">${s(instr)}</div>`:''}
  <div class="grid">${flds}</div>
  <button class="sub">${s(a.submitLabel)}</button>
  <div class="ft">${s(a.footerNote)}</div>
  </div></div></body></html>`;
}

function aiDraft(prompt: string): { title: string; description: string; instructions: string; accessMode: 'secure'|'open'; fields: FormField[] } {
  const p = prompt.trim().toLowerCase();
  const has = (v: string) => p.includes(v);
  const f = (id: string, label: string, name: string, type: FieldType, ph: string, req: boolean, opts = ''): FormField =>
    ({ id, label, name, type, placeholder: ph, required: req, options: opts });
  if (has('hiring')||has('application')||has('job')||has('candidate')) return {
    title: 'Hiring Application', description: 'Submit your application for review.', instructions: 'Fill all required fields.', accessMode: 'secure',
    fields: [f('a0','Full Name','full_name','text','Your full name',true),f('a1','Email','email_address','email','name@company.com',true),f('a2','Phone','phone','tel','+91 98765 43210',true),f('a3','Role','role','text','Position applying for',true),f('a4','Experience (years)','experience','number','e.g. 4',true),f('a5','Resume / Portfolio','resume','image','Upload image of your resume',false)],
  };
  if (has('lead')||has('sales')||has('contact')||has('inquiry')) return {
    title: 'Lead Capture Form', description: 'Tell us about your needs.', instructions: '', accessMode: 'open',
    fields: [f('a0','Name','name','text','Your full name',true),f('a1','Work Email','email','email','name@company.com',true),f('a2','Company','company','text','Company name',true),f('a3','Interest','interest','select','What are you exploring?',true,'Documents,Forms,Board Room,Enterprise Suite'),f('a4','Message','message','textarea','Tell us what you need',true)],
  };
  if (has('feedback')||has('survey')||has('review')||has('rating')) return {
    title: 'Feedback Survey', description: 'Share your experience.', instructions: 'All responses are confidential.', accessMode: 'open',
    fields: [f('a0','Overall Rating','rating','select','Select rating',true,'Excellent,Good,Average,Poor'),f('a1','What worked well?','liked','textarea','Share what stood out',false),f('a2','What can improve?','improve','textarea','Your honest feedback',false),f('a3','Recommend us?','recommend','radio','',true,'Yes, definitely,Probably,Unlikely')],
  };
  if (has('event')||has('registration')||has('register')||has('workshop')) return {
    title: 'Event Registration', description: 'Register your seat.', instructions: 'Seats are limited.', accessMode: 'secure',
    fields: [f('a0','Full Name','name','text','Your full name',true),f('a1','Email','email','email','name@company.com',true),f('a2','Phone','phone','tel','+91 98765 43210',false),f('a3','Organisation','org','text','Company / Institution',false),f('a4','Session','session','select','Choose session',true,'Morning 9am–12pm,Afternoon 1pm–4pm,Evening 5pm–8pm')],
  };
  return {
    title: prompt.trim().slice(0,60)||'Custom Form', description: 'Complete the form below.', instructions: '', accessMode: 'secure',
    fields: [f('a0','Full Name','name','text','Your full name',true),f('a1','Email','email','email','name@company.com',true),f('a2','Message','message','textarea','Your message',false)],
  };
}

/* ─── design tokens ──────────────────────────────────────────────────────── */

const t = {
  // surfaces
  bg:       '#0D0D0F',
  surface:  'rgba(255,255,255,0.04)',
  surfaceHover: 'rgba(255,255,255,0.065)',
  border:   'rgba(255,255,255,0.08)',
  borderMid:'rgba(255,255,255,0.12)',
  // text
  hi:   'rgba(255,255,255,0.92)',
  med:  'rgba(255,255,255,0.60)',
  low:  'rgba(255,255,255,0.35)',
  xlow: 'rgba(255,255,255,0.20)',
  // accent
  green: 'rgb(52,211,153)',
  greenBg: 'rgba(16,185,129,0.12)',
  greenBd: 'rgba(16,185,129,0.25)',
  gold:  'rgb(251,191,36)',
  goldBg:'rgba(251,191,36,0.10)',
  goldBd:'rgba(251,191,36,0.20)',
  red:   'rgba(252,165,165,0.9)',
  redBg: 'rgba(239,68,68,0.10)',
  redBd: 'rgba(239,68,68,0.18)',
} as const;

const inp: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', border: `1px solid ${t.border}`,
  borderRadius: 10, color: t.hi, fontSize: 13, padding: '9px 12px',
  width: '100%', outline: 'none', fontFamily: 'inherit',
};
const inpTA: React.CSSProperties = { ...inp, resize: 'vertical' };

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 20px',
  borderRadius: 10, background: '#fff', color: '#0D0D0F',
  fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none',
  letterSpacing: '-0.01em', transition: 'opacity 0.15s', whiteSpace: 'nowrap',
};
const btnGhost: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px',
  borderRadius: 10, background: t.surface, color: t.med,
  fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${t.border}`,
  letterSpacing: '-0.01em', transition: 'background 0.15s', whiteSpace: 'nowrap',
};
const btnDanger: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px',
  borderRadius: 10, background: t.redBg, color: t.red,
  fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${t.redBd}`,
  letterSpacing: '-0.01em', transition: 'background 0.15s', whiteSpace: 'nowrap',
};

/* ─── sub-components ─────────────────────────────────────────────────────── */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 10.5, fontWeight: 700, color: t.low, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>
      {children}
    </p>
  );
}

function SectionCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: 18, ...style }}>
      {children}
    </div>
  );
}

function Badge({ children, variant = 'neutral' }: { children: React.ReactNode; variant?: 'green' | 'gold' | 'neutral' | 'red' }) {
  const map = {
    green:   { bg: t.greenBg, color: t.green, bd: t.greenBd },
    gold:    { bg: t.goldBg,  color: t.gold,  bd: t.goldBd  },
    neutral: { bg: t.surface, color: t.med,   bd: t.border  },
    red:     { bg: t.redBg,   color: t.red,   bd: t.redBd   },
  };
  const m = map[variant];
  return (
    <span style={{ background: m.bg, color: m.color, border: `1px solid ${m.bd}`, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
      {children}
    </span>
  );
}

/* ─── stepper ─────────────────────────────────────────────────────────────��� */

function StepBar({ current, isMobile }: { current: BuildStep; isMobile: boolean }) {
  const idx = STEPS.findIndex(s => s.id === current);
  const sz = isMobile ? 28 : 34;
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: isMobile ? 20 : 32 }}>
      {STEPS.map((s, i) => {
        const done = idx > i;
        const active = idx === i;
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : undefined }}>
            {/* Circle */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isMobile ? 4 : 6, flexShrink: 0 }}>
              <div style={{
                width: sz, height: sz, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? t.greenBg : active ? '#fff' : t.surface,
                border: `1.5px solid ${done ? t.greenBd : active ? 'rgba(255,255,255,0.60)' : t.border}`,
                transition: 'all 0.2s',
              }}>
                {done
                  ? <Check style={{ width: isMobile ? 11 : 14, height: isMobile ? 11 : 14, color: t.green }} />
                  : <span style={{ fontSize: isMobile ? 11 : 13, fontWeight: 700, color: active ? '#0D0D0F' : t.low }}>{s.n}</span>
                }
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: isMobile ? 9.5 : 11, fontWeight: 700, color: active ? t.hi : done ? t.green : t.low, letterSpacing: '-0.01em', margin: 0 }}>{s.label}</p>
                {!isMobile && <p style={{ fontSize: 10, color: t.xlow, margin: 0, marginTop: 1 }}>{s.sub}</p>}
              </div>
            </div>
            {/* Connector */}
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 1.5, background: done ? t.greenBd : t.border, margin: `0 ${isMobile ? 6 : 10}px`, marginBottom: isMobile ? 20 : 28, transition: 'background 0.2s' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── live preview pane ──────────────────────────────────────────────────── */

function PreviewPane({
  html, viewport, setViewport,
}: {
  html: string; viewport: 'desktop'|'tablet'|'mobile'; setViewport: (v:'desktop'|'tablet'|'mobile') => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16, overflow: 'hidden' }}>
      {/* Preview header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: t.low, letterSpacing: '0.06em', margin: 0 }}>LIVE PREVIEW</p>
        <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 3 }}>
          {([['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone]] as const).map(([id, Icon]) => (
            <button key={id} type="button" onClick={() => setViewport(id)} style={{
              padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: viewport === id ? 'rgba(255,255,255,0.12)' : 'transparent',
              color: viewport === id ? t.hi : t.xlow,
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon style={{ width: 12, height: 12 }} />
            </button>
          ))}
        </div>
      </div>
      {/* iframe */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12, background: 'rgba(0,0,0,0.20)' }}>
        <div style={{
          margin: '0 auto', transition: 'max-width 0.25s cubic-bezier(0.4,0,0.2,1)',
          maxWidth: viewport === 'mobile' ? 320 : viewport === 'tablet' ? 560 : '100%',
          borderRadius: 12, overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.40)',
        }}>
          <iframe
            title="form preview"
            srcDoc={html}
            style={{ width: '100%', border: 'none', height: viewport === 'mobile' ? 580 : 520, display: 'block', background: '#fff' }}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── main component ─────────────────────────────────────────────────────── */

export default function FormsCenter() {
  const [tab, setTab] = useState<'create'|'history'>('create');
  const [step, setStep] = useState<BuildStep>('basics');

  // form state
  const [title, setTitle] = useState('');
  const [desc, setDesc]   = useState('');
  const [instr, setInstr] = useState('');
  const [mode, setMode]   = useState<'secure'|'open'>('secure');
  const [pw, setPw]       = useState('');
  const [expiry, setExpiry]     = useState('7');
  const [maxResp, setMaxResp]   = useState('');
  const [fields, setFields]     = useState<FormField[]>([
    { id:'ff0', label:'Full Name',     name:'full_name',     type:'text',  placeholder:'Enter your full name',   required:true,  options:'' },
    { id:'ff1', label:'Email Address', name:'email_address', type:'email', placeholder:'name@company.com',        required:true,  options:'' },
  ]);
  const [app, setApp] = useState<AppearanceDraft>({ ...DEFAULT_APP });

  // ai
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // result
  const [result, setResult] = useState<{ shareUrl?: string; sharePassword?: string } | null>(null);

  // history
  const [forms, setForms]         = useState<SavedForm[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [search, setSearch]       = useState('');
  const [pg, setPg]               = useState(1);
  const [expandedId, setExpandedId] = useState('');
  const [showSubs, setShowSubs]   = useState(false);

  // ui
  const [viewport, setViewport]       = useState<'desktop'|'tablet'|'mobile'>('desktop');
  const [fullscreen, setFullscreen]   = useState(false);
  const [isMounted, setIsMounted]     = useState(false);
  const [toast, setToast]             = useState<{msg:string;ok:boolean}|null>(null);
  const [copied, setCopied]           = useState('');
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  useEffect(() => { setIsMounted(true); }, []);
  useEffect(() => {
    const h = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3200);
  };

  /* data */
  const loadForms = useCallback(async () => {
    try { setLoading(true); const r = await fetch('/api/forms'); const p = await r.json().catch(()=>null); if(!r.ok) throw new Error(p?.error||'Failed'); setForms(Array.isArray(p)?p:[]); }
    catch(e) { showToast(e instanceof Error?e.message:'Failed', false); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadForms(); }, [loadForms]);
  useEffect(() => { setPg(1); }, [search]);

  /* create */
  const publish = async () => {
    if (!title.trim()) { showToast('Form title is required.', false); return; }
    if (fields.length === 0) { showToast('Add at least one field.', false); return; }
    try {
      setSaving(true);
      const r = await fetch('/api/forms', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
        title, description:desc, instructions:instr, accessMode:mode,
        customPassword: pw||undefined, expiryDays: expiry?Number(expiry):undefined,
        maxResponses: maxResp?Number(maxResp):undefined,
        fields: fields.map((f,i) => ({ ...f, order:i+1, options: f.options?f.options.split(',').map(o=>o.trim()).filter(Boolean):undefined })),
        appearance: app,
      })});
      const p = await r.json().catch(()=>null);
      if (!r.ok) throw new Error(p?.error||'Failed');
      setResult({ shareUrl: p.shareUrl, sharePassword: p.sharePassword });
      setForms(c => [{ ...p.form, shareUrl:p.shareUrl, sharePassword:p.sharePassword, requiresPassword:p.requiresPassword, insights:{ totalSubmissions:0, averageCompletionRate:0, strongestFields:[], weakestFields:[], recommendations:[], summary:'No submissions yet.' }, submissions:[], accessMode:mode }, ...c]);
      setStep('done');
    } catch(e) { showToast(e instanceof Error?e.message:'Failed', false); }
    finally { setSaving(false); }
  };

  const deleteForm = async (id: string) => {
    const r = await fetch(`/api/forms?id=${encodeURIComponent(id)}`, { method:'DELETE' });
    const p = await r.json().catch(()=>null);
    if (r.ok) { setForms(c=>c.filter(f=>f.id!==id)); if(expandedId===id) setExpandedId(''); showToast('Form deleted.'); return; }
    showToast(p?.error||'Could not delete.', false);
  };

  const reset = () => {
    setTitle(''); setDesc(''); setInstr(''); setMode('secure'); setPw(''); setExpiry('7'); setMaxResp('');
    setFields([
      { id:`ff0-${Date.now()}`, label:'Full Name',     name:'full_name',     type:'text',  placeholder:'Enter your full name', required:true,  options:'' },
      { id:`ff1-${Date.now()}`, label:'Email Address', name:'email_address', type:'email', placeholder:'name@company.com',     required:true,  options:'' },
    ]);
    setApp({ ...DEFAULT_APP }); setAiPrompt(''); setResult(null); setStep('basics');
  };

  const copyText = async (val: string, key: string) => {
    await navigator.clipboard.writeText(val);
    setCopied(key); showToast('Copied.'); setTimeout(()=>setCopied(''), 2000);
  };

  /* fields */
  const addField = () => setFields(c => [...c, mkField(c.length)]);
  const updField = (id: string, up: Partial<FormField>) =>
    setFields(c => c.map(f => f.id===id ? { ...f, ...up, name: up.label!==undefined ? slug(up.label)||f.name : (up.name??f.name) } : f));
  const delField = (id: string) => setFields(c => c.filter(f => f.id!==id));

  /* derived */
  const filteredForms = useMemo(() => forms.filter(f => { const q=search.trim().toLowerCase(); return q?[f.name,f.description].filter(Boolean).some(v=>String(v).toLowerCase().includes(q)):true; }), [forms, search]);
  const PAGE = 8, pageCount = Math.max(1, Math.ceil(filteredForms.length / PAGE)), paged = filteredForms.slice((pg-1)*PAGE, pg*PAGE);
  const liveHtml = useMemo(() => previewHtml(title, desc, instr, mode, fields, app), [title, desc, instr, mode, fields, app]);
  const buildUrl = (path: string) => buildAbsoluteAppUrl(path, typeof window!=='undefined'?window.location.origin:undefined);

  /* ─── RENDER ─────────────────────────────────────────────────────────── */

  const isMobile = windowWidth < 680;

  const content = (
    <div style={{ fontFamily: 'inherit', color: t.hi, position: 'relative', minHeight: 0 }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position:'fixed', top:20, left:'50%', transform:'translateX(-50%)',
          zIndex:99999, padding:'10px 20px', borderRadius:12,
          background: toast.ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
          border:`1px solid ${toast.ok?t.greenBd:t.redBd}`,
          color: toast.ok ? t.green : t.red,
          fontSize:13, fontWeight:600, backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
          boxShadow:'0 12px 40px rgba(0,0,0,0.50)', pointerEvents:'none', whiteSpace:'nowrap',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Saving overlay */}
      {saving && (
        <div style={{ position:'absolute', inset:0, zIndex:50, borderRadius:16, background:'rgba(13,13,15,0.75)', display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)' }}>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
            <Loader2 style={{ width:22, height:22, color:'rgba(255,255,255,0.60)', animation:'spin 1s linear infinite' }} />
            <p style={{ fontSize:13, fontWeight:600, color:t.med }}>Publishing your form…</p>
          </div>
        </div>
      )}

      {/* ── Top tab bar ─────────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', marginBottom:isMobile?16:24, gap:6, borderBottom:`1px solid ${t.border}`, paddingBottom:isMobile?12:16, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:2, background:'rgba(255,255,255,0.04)', borderRadius:10, padding:3 }}>
          {([['create','Create Form'],['history','My Forms']] as const).map(([id, lbl]) => (
            <button key={id} type="button" onClick={() => setTab(id)} style={{
              padding: isMobile ? '6px 12px' : '7px 16px', borderRadius:8, fontSize: isMobile ? 11 : 12, fontWeight:700, cursor:'pointer', border:'none', letterSpacing:'-0.01em', transition:'all 0.15s',
              background: tab===id ? '#fff' : 'transparent',
              color:       tab===id ? '#0D0D0F' : t.low,
            }}>
              {lbl}
            </button>
          ))}
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          <button type="button" onClick={() => void loadForms()} style={{ ...btnGhost, padding:'7px 11px' }} title="Refresh">
            <RefreshCw style={{ width:13, height:13 }} />
          </button>
          <button type="button" onClick={() => setFullscreen(v=>!v)} style={{ ...btnGhost, padding:'7px 11px' }} title={fullscreen?'Exit fullscreen':'Fullscreen'}>
            {fullscreen ? <Minimize2 style={{ width:13, height:13 }} /> : <Maximize2 style={{ width:13, height:13 }} />}
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          CREATE TAB
      ═══════════════════════════════════════════════════════════════════ */}
      {tab === 'create' && (
        <>
          {/* ── SUCCESS / DONE state ── */}
          {step === 'done' && result && (() => {
            const url = result.shareUrl ? buildUrl(result.shareUrl) : '';
            return (
              <div style={{ maxWidth: 560, margin: '0 auto', padding: '8px 0 24px' }}>
                {/* Success icon */}
                <div style={{ textAlign:'center', marginBottom:28 }}>
                  <div style={{ width:60, height:60, borderRadius:20, margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center', background:t.greenBg, border:`1px solid ${t.greenBd}` }}>
                    <CheckCircle2 style={{ width:28, height:28, color:t.green }} />
                  </div>
                  <p style={{ fontSize:20, fontWeight:700, color:t.hi, letterSpacing:'-0.03em', margin:0 }}>Form is live</p>
                  <p style={{ fontSize:13, color:t.low, marginTop:6 }}>{title}</p>
                </div>

                <div style={{ display:'grid', gap:10 }}>
                  {url && (
                    <SectionCard>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                        <div>
                          <p style={{ fontSize:12, fontWeight:700, color:t.med, margin:0 }}>Form Link</p>
                          <p style={{ fontSize:11, color:t.xlow, margin:'2px 0 0' }}>Share this with respondents</p>
                        </div>
                        <div style={{ display:'flex', gap:6 }}>
                          <button type="button" onClick={() => void copyText(url,'link')} style={{ ...btnGhost, padding:'6px 12px', fontSize:12 }}>
                            {copied==='link' ? <Check style={{width:11,height:11}}/> : <Copy style={{width:11,height:11}}/>}
                            {copied==='link' ? 'Copied' : 'Copy'}
                          </button>
                          <button type="button" onClick={() => window.open(url,'_blank','noopener')} style={{ ...btnGhost, padding:'6px 12px', fontSize:12 }}>
                            <ExternalLink style={{width:11,height:11}}/> Open
                          </button>
                        </div>
                      </div>
                      <p style={{ fontFamily:'ui-monospace,monospace', fontSize:11, color:t.xlow, wordBreak:'break-all', lineHeight:1.5, margin:0 }}>{url}</p>
                    </SectionCard>
                  )}

                  {result.sharePassword && (
                    <SectionCard>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div>
                          <p style={{ fontSize:12, fontWeight:700, color:t.med, margin:0 }}>Access Password</p>
                          <p style={{ fontSize:11, color:t.xlow, margin:'2px 0 0' }}>Share separately from the link</p>
                        </div>
                        <button type="button" onClick={() => void copyText(result.sharePassword||'','pw')} style={{ ...btnGhost, padding:'6px 12px', fontSize:12 }}>
                          {copied==='pw' ? <Check style={{width:11,height:11}}/> : <Copy style={{width:11,height:11}}/>}
                          {copied==='pw' ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <p style={{ fontFamily:'ui-monospace,monospace', fontSize:18, fontWeight:700, color:t.hi, letterSpacing:'0.12em', marginTop:10, marginBottom:0 }}>{result.sharePassword}</p>
                    </SectionCard>
                  )}

                  {/* Summary pills */}
                  <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap:8 }}>
                    {[['Fields', String(fields.length)], ['Access', mode], ['Expiry', expiry?`${expiry}d`:'None']].map(([l,v]) => (
                      <SectionCard key={l} style={{ padding:'12px 14px', textAlign:'center' }}>
                        <p style={{ fontSize:10, fontWeight:700, color:t.xlow, letterSpacing:'0.16em', textTransform:'uppercase', margin:'0 0 6px' }}>{l}</p>
                        <p style={{ fontSize:15, fontWeight:700, color:t.hi, textTransform:'capitalize', margin:0 }}>{v}</p>
                      </SectionCard>
                    ))}
                  </div>

                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
                    <button type="button" onClick={() => setTab('history')} style={btnGhost}>View My Forms</button>
                    <button type="button" onClick={reset} style={btnPrimary}><Plus style={{width:13,height:13}}/> New Form</button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── STEP FLOW ── */}
          {step !== 'done' && (
            <div>
              <StepBar current={step} isMobile={isMobile} />

              {/* Two-column layout: left = controls, right = live preview */}
              <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 400px', gap:20, alignItems:'start' }}>

                {/* ─── LEFT PANEL ─────────────────────────────────────────── */}
                <div>

                  {/* ── STEP 1: BASICS ── */}
                  {step === 'basics' && (
                    <div style={{ display:'grid', gap:16 }}>

                      {/* AI Generator */}
                      <SectionCard style={{ background: t.goldBg, borderColor: t.goldBd }}>
                        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
                          <div>
                            <p style={{ fontSize:13, fontWeight:700, color:t.hi, margin:'0 0 4px' }}>AI Form Generator</p>
                            <p style={{ fontSize:12, color:t.low, margin:0 }}>Describe what you need — AI drafts title, fields & settings.</p>
                          </div>
                          <Badge variant="gold">AI</Badge>
                        </div>
                        <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder={`e.g. "Create a hiring application form for a sales manager role"`} rows={3} style={inpTA} />
                        <div style={{ display:'flex', flexWrap:'wrap', gap:6, margin:'10px 0' }}>
                          {['Hiring application','Sales lead capture','Customer feedback','Event registration'].map(p => (
                            <button key={p} type="button" onClick={() => setAiPrompt(p)} style={{ ...btnGhost, padding:'4px 11px', fontSize:11 }}>{p}</button>
                          ))}
                        </div>
                        <div style={{ display:'flex', gap:8 }}>
                          <button type="button" disabled={aiLoading} onClick={() => {
                            if (!aiPrompt.trim()) { showToast('Describe the form first.', false); return; }
                            setAiLoading(true);
                            const d = aiDraft(aiPrompt);
                            setTitle(d.title); setDesc(d.description); setInstr(d.instructions); setMode(d.accessMode); setFields(d.fields);
                            setApp(a => ({ ...a, heroTitle: d.title, heroDescription: d.description }));
                            setTimeout(() => { setAiLoading(false); showToast('AI draft ready — review and continue.'); }, 300);
                          }} style={{ ...btnPrimary, opacity: aiLoading?0.7:1 }}>
                            {aiLoading ? <Loader2 style={{width:13,height:13,animation:'spin 1s linear infinite'}}/> : <Sparkles style={{width:13,height:13}}/>}
                            Generate
                          </button>
                          <button type="button" onClick={() => setAiPrompt('')} style={btnGhost}>Clear</button>
                        </div>
                      </SectionCard>

                      {/* Title + description */}
                      <SectionCard>
                        <p style={{ fontSize:13, fontWeight:700, color:t.hi, margin:'0 0 14px' }}>Form Details</p>
                        <div style={{ display:'grid', gap:12 }}>
                          <div>
                            <Label>Form Title <span style={{ color:'rgba(252,165,165,0.7)' }}>*</span></Label>
                            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Hiring Application Form" style={inp} />
                          </div>
                          <div>
                            <Label>Short Description</Label>
                            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="One line for respondents" style={inp} />
                          </div>
                          <div>
                            <Label>Instructions (optional)</Label>
                            <textarea value={instr} onChange={e => setInstr(e.target.value)} placeholder="Shown above the fields, e.g. 'Fill all required fields before submitting.'" rows={2} style={inpTA} />
                          </div>
                        </div>
                      </SectionCard>

                      {/* Access control */}
                      <SectionCard>
                        <p style={{ fontSize:13, fontWeight:700, color:t.hi, margin:'0 0 14px' }}>Access Control</p>
                        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:8, marginBottom: mode==='secure' ? 14 : 0 }}>
                          {([['secure','Password Protected','Viewer must enter a password to open'],['open','Open Access','Anyone with the link can fill the form']] as const).map(([v,lbl,sub]) => (
                            <button key={v} type="button" onClick={() => setMode(v)} style={{
                              padding:'12px 14px', borderRadius:12, textAlign:'left', cursor:'pointer',
                              background: mode===v ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                              border:`1.5px solid ${mode===v?t.borderMid:t.border}`,
                              transition:'all 0.15s',
                            }}>
                              <p style={{ fontSize:12, fontWeight:700, color:mode===v?t.hi:t.low, margin:'0 0 3px' }}>{lbl}</p>
                              <p style={{ fontSize:11, color:t.xlow, margin:0, lineHeight:1.5 }}>{sub}</p>
                            </button>
                          ))}
                        </div>
                        {mode==='secure' && (
                          <div>
                            <Label>Custom Password <span style={{ color:t.xlow, fontWeight:400, letterSpacing:0, textTransform:'none', fontSize:10 }}>— leave blank for auto</span></Label>
                            <input value={pw} onChange={e => setPw(e.target.value.toUpperCase())} placeholder="e.g. LAUNCH2024" style={inp} />
                          </div>
                        )}
                      </SectionCard>

                      {/* Limits */}
                      <SectionCard>
                        <p style={{ fontSize:13, fontWeight:700, color:t.hi, margin:'0 0 14px' }}>Limits</p>
                        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:12 }}>
                          <div><Label>Expires after (days)</Label><input value={expiry} onChange={e => setExpiry(e.target.value)} placeholder="7" style={inp} /></div>
                          <div><Label>Max responses</Label><input value={maxResp} onChange={e => setMaxResp(e.target.value)} placeholder="Unlimited" style={inp} /></div>
                        </div>
                      </SectionCard>

                      <div style={{ display:'flex', justifyContent:'flex-end' }}>
                        <button type="button" onClick={() => { if(!title.trim()){showToast('Add a title first.',false);return;} setStep('fields'); }} style={btnPrimary}>
                          Continue <ArrowRight style={{width:13,height:13}}/>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── STEP 2: FIELDS ── */}
                  {step === 'fields' && (
                    <div style={{ display:'grid', gap:14 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div>
                          <p style={{ fontSize:15, fontWeight:700, color:t.hi, margin:'0 0 3px', letterSpacing:'-0.02em' }}>Form Fields</p>
                          <p style={{ fontSize:12, color:t.low, margin:0 }}>{fields.length} field{fields.length!==1?'s':''} added</p>
                        </div>
                        <button type="button" onClick={addField} style={btnPrimary}><Plus style={{width:13,height:13}}/> Add Field</button>
                      </div>

                      {fields.length === 0 && (
                        <SectionCard style={{ padding:'36px 20px', textAlign:'center' }}>
                          <FileSpreadsheet style={{ width:24, height:24, color:t.xlow, margin:'0 auto 10px', display:'block' }} />
                          <p style={{ fontSize:13, color:t.low, margin:0 }}>No fields yet. Click Add Field above.</p>
                        </SectionCard>
                      )}

                      {fields.map((f, i) => (
                        <SectionCard key={f.id} style={{ padding:0, overflow:'hidden' }}>
                          {/* Field header */}
                          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom:`1px solid ${t.border}`, background:'rgba(255,255,255,0.02)' }}>
                            <span style={{ fontSize:10, fontWeight:700, color:t.xlow, letterSpacing:'0.14em', textTransform:'uppercase' }}>Field {i+1}</span>
                            <Badge variant={f.required?'green':'neutral'}>{f.required?'Required':'Optional'}</Badge>
                            <Badge variant="neutral">{f.type}</Badge>
                            <div style={{ flex:1 }} />
                            <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:11, color:t.low }}>
                              <input type="checkbox" checked={f.required} onChange={e => updField(f.id,{required:e.target.checked})} style={{accentColor:'#fff'}} />
                              Required
                            </label>
                            <button type="button" onClick={() => delField(f.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(239,68,68,0.50)', padding:4, display:'flex' }}>
                              <X style={{width:13,height:13}}/>
                            </button>
                          </div>
                          {/* Field body */}
                          <div style={{ padding:14, display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:10 }}>
                            <div>
                              <Label>Label</Label>
                              <input value={f.label} onChange={e => updField(f.id,{label:e.target.value})} placeholder="Field label" style={inp} />
                            </div>
                            <div>
                              <Label>Type</Label>
                              <select value={f.type} onChange={e => updField(f.id,{type:e.target.value as FieldType})} style={inp}>
                                {FIELD_TYPES.map(ty => <option key={ty} value={ty}>{ty}</option>)}
                              </select>
                            </div>
                            <div>
                              <Label>Placeholder</Label>
                              <input value={f.placeholder} onChange={e => updField(f.id,{placeholder:e.target.value})} placeholder="Hint text" style={inp} />
                            </div>
                            {(f.type==='select'||f.type==='radio') && (
                              <div>
                                <Label>Options (comma separated)</Label>
                                <input value={f.options} onChange={e => updField(f.id,{options:e.target.value})} placeholder="Option A, Option B, Option C" style={inp} />
                              </div>
                            )}
                          </div>
                        </SectionCard>
                      ))}

                      <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
                        <button type="button" onClick={() => setStep('basics')} style={btnGhost}><ArrowLeft style={{width:13,height:13}}/> Back</button>
                        <button type="button" onClick={() => { if(fields.length===0){showToast('Add at least one field.',false);return;} setStep('design'); }} style={btnPrimary}>
                          Continue <ArrowRight style={{width:13,height:13}}/>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── STEP 3: DESIGN ── */}
                  {step === 'design' && (
                    <div style={{ display:'grid', gap:14 }}>
                      <SectionCard>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                          <p style={{ fontSize:13, fontWeight:700, color:t.hi, margin:0 }}>Colour Theme</p>
                          <button type="button" onClick={() => setApp({...DEFAULT_APP})} style={{ ...btnGhost, padding:'4px 10px', fontSize:11 }}>Reset</button>
                        </div>
                        <div style={{ display:'flex', gap:8 }}>
                          {TONES.map(tone => (
                            <button key={tone.id} type="button" onClick={() => setApp(a=>({...a,surfaceTone:tone.id}))} style={{
                              flex:1, padding:'10px 4px', borderRadius:10, cursor:'pointer', border:`1.5px solid ${app.surfaceTone===tone.id?t.borderMid:t.border}`,
                              background: app.surfaceTone===tone.id?'rgba(255,255,255,0.08)':'rgba(255,255,255,0.02)', transition:'all 0.15s', textAlign:'center',
                            }}>
                              <div style={{ width:16, height:16, borderRadius:'50%', background:tone.dot, margin:'0 auto 6px' }} />
                              <p style={{ fontSize:10, fontWeight:700, color:app.surfaceTone===tone.id?t.hi:t.low, margin:0 }}>{tone.label}</p>
                            </button>
                          ))}
                        </div>
                      </SectionCard>

                      <SectionCard>
                        <p style={{ fontSize:13, fontWeight:700, color:t.hi, margin:'0 0 14px' }}>Page Copy</p>
                        <div style={{ display:'grid', gap:10 }}>
                          <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:10 }}>
                            <div><Label>Hero title</Label><input value={app.heroTitle} onChange={e => setApp(a=>({...a,heroTitle:e.target.value}))} placeholder={title||'Hero title'} style={inp}/></div>
                            <div><Label>Eyebrow label</Label><input value={app.eyebrow} onChange={e => setApp(a=>({...a,eyebrow:e.target.value}))} placeholder="Secure Form" style={inp}/></div>
                            <div><Label>Submit button</Label><input value={app.submitLabel} onChange={e => setApp(a=>({...a,submitLabel:e.target.value}))} placeholder="Submit Response" style={inp}/></div>
                            <div><Label>Success message</Label><input value={app.successMessage} onChange={e => setApp(a=>({...a,successMessage:e.target.value}))} placeholder="Response submitted." style={inp}/></div>
                          </div>
                          <div><Label>Hero description</Label><textarea value={app.heroDescription} onChange={e => setApp(a=>({...a,heroDescription:e.target.value}))} rows={2} style={inpTA} placeholder="Shown in the hero banner"/></div>
                        </div>
                      </SectionCard>

                      <SectionCard>
                        <p style={{ fontSize:13, fontWeight:700, color:t.hi, margin:'0 0 14px' }}>Layout</p>
                        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3,1fr)', gap:10 }}>
                          {([
                            ['Card style','cardStyle',[['soft','Soft'],['outlined','Outlined'],['glass','Glass']]],
                            ['Button style','buttonStyle',[['solid','Solid'],['outline','Outline']]],
                            ['Hero align','heroAlignment',[['left','Left'],['center','Center']]],
                          ] as const).map(([lbl,key,opts]) => (
                            <div key={key}>
                              <Label>{lbl}</Label>
                              <select value={String(app[key])} onChange={e => setApp(a=>({...a,[key]:e.target.value as never}))} style={inp}>
                                {(opts as ReadonlyArray<readonly [string,string]>).map(([v,tx]) => <option key={v} value={v}>{tx}</option>)}
                              </select>
                            </div>
                          ))}
                          <div>
                            <Label>Columns</Label>
                            <select value={String(app.fieldColumns)} onChange={e => setApp(a=>({...a,fieldColumns:Number(e.target.value) as 1|2}))} style={inp}>
                              <option value="2">Two columns</option><option value="1">One column</option>
                            </select>
                          </div>
                          <div>
                            <Label>Accent colour</Label>
                            <input type="color" value={app.accentColor} onChange={e => setApp(a=>({...a,accentColor:e.target.value}))} style={{ ...inp, padding:4, height:38, cursor:'pointer' }}/>
                          </div>
                        </div>
                      </SectionCard>

                      <div style={{ display:'flex', justifyContent:'space-between' }}>
                        <button type="button" onClick={() => setStep('fields')} style={btnGhost}><ArrowLeft style={{width:13,height:13}}/> Back</button>
                        <button type="button" onClick={() => setStep('publish')} style={btnPrimary}>Continue <ArrowRight style={{width:13,height:13}}/></button>
                      </div>
                    </div>
                  )}

                  {/* ── STEP 4: PUBLISH ── */}
                  {step === 'publish' && (
                    <div style={{ display:'grid', gap:14 }}>
                      <SectionCard>
                        <p style={{ fontSize:13, fontWeight:700, color:t.hi, margin:'0 0 16px' }}>Summary</p>
                        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3,1fr)', gap:12 }}>
                          {[['Title',title||'—'],['Fields',String(fields.length)],['Access',mode],['Expiry',expiry?`${expiry} days`:'None'],['Max responses',maxResp||'Unlimited'],['Theme',app.surfaceTone]].map(([l,v]) => (
                            <div key={l}>
                              <p style={{ fontSize:10, fontWeight:700, color:t.xlow, letterSpacing:'0.16em', textTransform:'uppercase', margin:'0 0 4px' }}>{l}</p>
                              <p style={{ fontSize:13, fontWeight:600, color:t.hi, textTransform:'capitalize', margin:0 }}>{v}</p>
                            </div>
                          ))}
                        </div>
                      </SectionCard>

                      <SectionCard style={{ background:'rgba(16,185,129,0.04)', borderColor:'rgba(16,185,129,0.14)' }}>
                        <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                          <CheckCircle2 style={{ width:16, height:16, color:t.green, flexShrink:0, marginTop:1 }} />
                          <p style={{ fontSize:12, color:t.med, lineHeight:1.6, margin:0 }}>
                            Once published this form will be accessible via a secure link{mode!=='open'?' protected by a password':''}.
                            Responses are collected in real time and visible in the My Forms tab.
                          </p>
                        </div>
                      </SectionCard>

                      <div style={{ display:'flex', justifyContent:'space-between' }}>
                        <button type="button" onClick={() => setStep('design')} style={btnGhost}><ArrowLeft style={{width:13,height:13}}/> Back</button>
                        <button type="button" onClick={() => void publish()} disabled={saving} style={{ ...btnPrimary, opacity:saving?0.6:1 }}>
                          {saving ? <Loader2 style={{width:13,height:13,animation:'spin 1s linear infinite'}}/> : <CheckCircle2 style={{width:13,height:13}}/>}
                          Publish Form
                        </button>
                      </div>
                    </div>
                  )}

                </div>

                {/* ─── RIGHT PANEL: LIVE PREVIEW ────────────────────────── */}
                {isMobile ? (
                  <div>
                    <button type="button" onClick={() => setShowMobilePreview(v=>!v)} style={{ ...btnGhost, width:'100%', justifyContent:'space-between', marginBottom: showMobilePreview ? 10 : 0 }}>
                      <span style={{ display:'flex', alignItems:'center', gap:6 }}><Monitor style={{width:12,height:12}}/> Live Preview</span>
                      <span style={{ fontSize:10, color:t.xlow }}>{showMobilePreview ? 'Hide ↑' : 'Show ↓'}</span>
                    </button>
                    {showMobilePreview && (
                      <div style={{ height: 400 }}>
                        <PreviewPane html={liveHtml} viewport={viewport} setViewport={setViewport} />
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ position:'sticky', top:0, height:'calc(100vh - 200px)', minHeight:480 }}>
                    <PreviewPane html={liveHtml} viewport={viewport} setViewport={setViewport} />
                  </div>
                )}

              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          HISTORY TAB
      ═══════════════════════════════════════════════════════════════════ */}
      {tab === 'history' && (
        <div style={{ display:'grid', gap:16 }}>
          {/* Toolbar */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <div style={{ flex:1, minWidth:220, position:'relative' }}>
              <Search style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', width:13, height:13, color:t.xlow }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search forms…" style={{ ...inp, paddingLeft:32 }} />
            </div>
            <button type="button" onClick={() => { reset(); setTab('create'); }} style={btnPrimary}><Plus style={{width:13,height:13}}/> New Form</button>
          </div>

          {/* Stats row */}
          <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap:10 }}>
            {[
              { l:'Total Forms', v:String(forms.length) },
              { l:'Total Responses', v:String(forms.reduce((a,f)=>a+(f.insights?.totalSubmissions||0),0)) },
              { l:'Active', v:String(forms.filter(f=>!f.expiryAt||new Date(f.expiryAt)>new Date()).length) },
            ].map(m => (
              <SectionCard key={m.l} style={{ padding:'14px 16px' }}>
                <p style={{ fontSize:10, fontWeight:700, color:t.xlow, letterSpacing:'0.16em', textTransform:'uppercase', margin:'0 0 6px' }}>{m.l}</p>
                <p style={{ fontSize:22, fontWeight:800, color:t.hi, letterSpacing:'-0.04em', margin:0 }}>{m.v}</p>
              </SectionCard>
            ))}
          </div>

          {/* List */}
          {loading ? (
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'40px 0', justifyContent:'center', color:t.xlow }}>
              <Loader2 style={{width:18,height:18,animation:'spin 1s linear infinite'}}/>
              <span style={{fontSize:13}}>Loading forms…</span>
            </div>
          ) : paged.length === 0 ? (
            <SectionCard style={{ padding:'48px 24px', textAlign:'center' }}>
              <FileSpreadsheet style={{width:28,height:28,color:t.xlow,margin:'0 auto 12px',display:'block'}}/>
              <p style={{fontSize:14,color:t.low,margin:'0 0 4px'}}>No forms yet.</p>
              <p style={{fontSize:12,color:t.xlow,margin:0}}>Create your first form using the Create Form tab.</p>
            </SectionCard>
          ) : (
            <div style={{ display:'grid', gap:8 }}>
              {paged.map(form => {
                const isOpen = expandedId === form.id;
                const expired = form.expiryAt ? new Date(form.expiryAt) < new Date() : false;
                const url = form.shareUrl ? buildUrl(form.shareUrl) : '';
                return (
                  <div key={form.id} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, overflow:'hidden', transition:'background 0.15s' }}>
                    {/* Row */}
                    <div style={{ display:'flex', alignItems:'center', gap: isMobile ? 8 : 12, padding: isMobile ? '11px 12px' : '13px 16px' }}>
                      <div style={{ width:38, height:38, borderRadius:10, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,255,255,0.05)', border:`1px solid ${t.border}` }}>
                        <FileSpreadsheet style={{width:15,height:15,color:t.low}}/>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
                          <p style={{ fontSize:13, fontWeight:700, color:t.hi, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', margin:0 }}>{form.name}</p>
                          <Badge variant={expired?'neutral':'green'}>{expired?'expired':'active'}</Badge>
                          <Badge variant="neutral">{form.accessMode}</Badge>
                        </div>
                        <div style={{ display:'flex', gap:12, marginTop:4, flexWrap:'wrap' }}>
                          <span style={{fontSize:11,color:t.xlow}}>{form.fields?.length||0} fields</span>
                          <span style={{fontSize:11,color:t.xlow}}>{form.insights?.totalSubmissions||0} responses</span>
                          {form.latestSubmissionAt && <span style={{fontSize:11,color:t.xlow}}>Last {ago(form.latestSubmissionAt)}</span>}
                          {form.createdAt && <span style={{fontSize:11,color:t.xlow}}>Created {ago(form.createdAt)}</span>}
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                        {url && <>
                          <button type="button" onClick={() => void copyText(url,`l${form.id}`)} style={{ ...btnGhost, padding:'5px 9px' }} title="Copy link">
                            {copied===`l${form.id}`?<Check style={{width:12,height:12}}/>:<Copy style={{width:12,height:12}}/>}
                          </button>
                          <button type="button" onClick={() => window.open(url,'_blank','noopener')} style={{ ...btnGhost, padding:'5px 9px' }} title="Open">
                            <ExternalLink style={{width:12,height:12}}/>
                          </button>
                        </>}
                        <button type="button" onClick={() => { setExpandedId(isOpen?'':form.id); setShowSubs(false); }} style={{ ...btnGhost, padding:'5px 9px' }}>
                          {isOpen ? <ChevronUp style={{width:12,height:12}}/> : <ChevronDown style={{width:12,height:12}}/>}
                        </button>
                      </div>
                    </div>

                    {/* Expanded */}
                    {isOpen && (
                      <>
                        <div style={{ height:1, background:t.border }} />
                        <div style={{ padding:16 }}>
                          {/* Stat tiles */}
                          <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap:8, marginBottom:14 }}>
                            {[
                              { l:'Responses', v:String(form.insights?.totalSubmissions??0) },
                              { l:'Completion', v:`${form.insights?.averageCompletionRate??0}%` },
                              { l:'Velocity',   v:form.insights?.responseVelocity||'—' },
                              { l:'Access',     v:form.accessMode },
                            ].map(m => (
                              <div key={m.l} style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${t.border}`, borderRadius:10, padding:'10px 12px' }}>
                                <p style={{ fontSize:9.5, fontWeight:700, color:t.xlow, letterSpacing:'0.14em', textTransform:'uppercase', margin:'0 0 5px' }}>{m.l}</p>
                                <p style={{ fontSize:13, fontWeight:700, color:t.hi, textTransform:'capitalize', margin:0 }}>{m.v}</p>
                              </div>
                            ))}
                          </div>

                          {/* AI summary */}
                          {form.insights?.summary && (
                            <div style={{ background:t.goldBg, border:`1px solid ${t.goldBd}`, borderRadius:10, padding:'12px 14px', marginBottom:12 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                                <BarChart2 style={{width:11,height:11,color:t.gold}}/>
                                <span style={{ fontSize:9.5, fontWeight:700, color:t.gold, letterSpacing:'0.14em', textTransform:'uppercase' }}>AI Summary</span>
                              </div>
                              <p style={{ fontSize:12, color:t.med, lineHeight:1.65, margin:0 }}>{form.insights.summary}</p>
                              {(form.insights.recommendations||[]).slice(0,2).map((r,i) => (
                                <p key={i} style={{ fontSize:11, color:t.low, lineHeight:1.6, margin:'6px 0 0' }}>• {r}</p>
                              ))}
                            </div>
                          )}

                          {/* Share link */}
                          {url && (
                            <div style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${t.border}`, borderRadius:10, padding:'12px 14px', marginBottom:12 }}>
                              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
                                <p style={{ fontSize:11, fontWeight:700, color:t.med, margin:0 }}>Share Link</p>
                                <div style={{ display:'flex', gap:5 }}>
                                  <button type="button" onClick={() => void copyText(url,`exp${form.id}`)} style={{ ...btnGhost, padding:'4px 8px', fontSize:11 }}>
                                    {copied===`exp${form.id}`?<Check style={{width:10,height:10}}/>:<Copy style={{width:10,height:10}}/>}
                                  </button>
                                  <button type="button" onClick={() => window.open(url,'_blank','noopener')} style={{ ...btnGhost, padding:'4px 8px', fontSize:11 }}>
                                    <ExternalLink style={{width:10,height:10}}/>
                                  </button>
                                </div>
                              </div>
                              <p style={{ fontFamily:'ui-monospace,monospace', fontSize:10, color:t.xlow, wordBreak:'break-all', lineHeight:1.5, margin:0 }}>{url}</p>
                              {form.sharePassword && (
                                <p style={{ marginTop:8, borderTop:`1px solid ${t.border}`, paddingTop:8, margin:'8px 0 0' }}>
                                  <span style={{ fontSize:10, color:t.xlow }}>Password: </span>
                                  <span style={{ fontFamily:'ui-monospace,monospace', fontSize:12, fontWeight:700, color:t.hi }}>{form.sharePassword}</span>
                                </p>
                              )}
                            </div>
                          )}

                          {/* Responses accordion */}
                          {(form.submissions?.length||0) > 0 && (
                            <div style={{ marginBottom:12 }}>
                              <button type="button" onClick={() => setShowSubs(v=>!v)} style={{ ...btnGhost, width:'100%', justifyContent:'space-between' }}>
                                <span>{form.submissions.length} Response{form.submissions.length!==1?'s':''}</span>
                                {showSubs ? <ChevronUp style={{width:12,height:12}}/> : <ChevronDown style={{width:12,height:12}}/>}
                              </button>
                              {showSubs && (
                                <div style={{ marginTop:8, display:'grid', gap:6 }}>
                                  {form.submissions.slice(0,5).map((sub,si) => (
                                    <div key={sub.id||si} style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${t.border}`, borderRadius:10, padding:'10px 12px' }}>
                                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                                        <span style={{ fontSize:11, fontWeight:700, color:t.med }}>{sub.submittedBy||'Anonymous'}</span>
                                        <span style={{ fontSize:10, color:t.xlow }}>{ago(sub.submittedAt)}</span>
                                      </div>
                                      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:4 }}>
                                        {Object.entries(sub.data||{}).slice(0,6).map(([k,v]) => (
                                          <p key={k} style={{ fontSize:11, margin:0, color:t.low }}>
                                            <span style={{ color:t.xlow, fontSize:9.5, textTransform:'uppercase', letterSpacing:'0.1em' }}>{k.replace(/_/g,' ')}: </span>{v||'—'}
                                          </p>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                  {form.submissions.length > 5 && <p style={{ fontSize:11, color:t.xlow, textAlign:'center', margin:0 }}>+{form.submissions.length-5} more</p>}
                                </div>
                              )}
                            </div>
                          )}

                          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                            <button type="button" onClick={() => setExpandedId('')} style={btnGhost}>Close</button>
                            <button type="button" onClick={() => void deleteForm(form.id)} style={btnDanger}><Trash2 style={{width:12,height:12}}/> Delete</button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {pageCount > 1 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
              <button type="button" disabled={pg===1} onClick={() => setPg(p=>Math.max(1,p-1))} style={{ ...btnGhost, padding:'7px 14px', opacity:pg===1?0.4:1 }}>
                <ArrowLeft style={{width:12,height:12}}/>
              </button>
              <span style={{ fontSize:12, color:t.low }}>{pg} / {pageCount}</span>
              <button type="button" disabled={pg===pageCount} onClick={() => setPg(p=>Math.min(pageCount,p+1))} style={{ ...btnGhost, padding:'7px 14px', opacity:pg===pageCount?0.4:1 }}>
                <ArrowRight style={{width:12,height:12}}/>
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  /* fullscreen portal */
  if (fullscreen && isMounted) {
    return createPortal(
      <div style={{ position:'fixed', inset:0, zIndex:99999, background:'#0D0D0F', overflow:'auto' }}>
        <div style={{ padding: isMobile ? '16px 14px' : '28px 36px' }}>{content}</div>
      </div>,
      document.body,
    );
  }

  return content;
}
