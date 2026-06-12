'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Globe, MapPin, Phone, Mail, ChevronRight, Check, Linkedin, Twitter } from 'lucide-react';
import InfinityUpgradeModal from '@/components/InfinityUpgradeModal';

const INDUSTRIES = [
  { value: 'technology', label: 'Technology', emoji: '💻' },
  { value: 'finance', label: 'Finance & Banking', emoji: '🏦' },
  { value: 'healthcare', label: 'Healthcare', emoji: '🏥' },
  { value: 'legal', label: 'Legal & Compliance', emoji: '⚖️' },
  { value: 'education', label: 'Education', emoji: '🎓' },
  { value: 'manufacturing', label: 'Manufacturing', emoji: '🏭' },
  { value: 'retail', label: 'Retail & E-commerce', emoji: '🛍️' },
  { value: 'real_estate', label: 'Real Estate', emoji: '🏢' },
  { value: 'media', label: 'Media & Entertainment', emoji: '🎬' },
  { value: 'logistics', label: 'Logistics & Supply Chain', emoji: '🚚' },
  { value: 'hospitality', label: 'Hospitality & Travel', emoji: '✈️' },
  { value: 'consulting', label: 'Consulting', emoji: '📊' },
  { value: 'ngo', label: 'NGO / Non-profit', emoji: '❤️' },
  { value: 'government', label: 'Government', emoji: '🏛️' },
  { value: 'other', label: 'Other', emoji: '🔷' },
];

const SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001+'];

interface FormData {
  name: string; tagline: string; description: string; industry: string;
  companySize: string; foundedYear: string; website: string;
  location: string; city: string; country: string; phone: string; email: string;
  linkedin: string; twitter: string;
}

export default function BusinessPageCreator() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>({
    name: '', tagline: '', description: '', industry: '', companySize: '',
    foundedYear: '', website: '', location: '', city: '', country: 'India',
    phone: '', email: '', linkedin: '', twitter: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showInfinityModal, setShowInfinityModal] = useState(false);

  function set(key: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function canProceed() {
    if (step === 1) return form.name.trim().length >= 2;
    if (step === 2) return !!form.industry;
    return true;
  }

  async function submit() {
    if (!form.name || !form.industry) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/business-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          tagline: form.tagline.trim() || undefined,
          description: form.description.trim() || undefined,
          industry: form.industry,
          companySize: form.companySize || undefined,
          foundedYear: form.foundedYear ? parseInt(form.foundedYear) : undefined,
          website: form.website.trim() || undefined,
          location: form.location.trim() || undefined,
          city: form.city.trim() || undefined,
          country: form.country.trim() || undefined,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          socialLinks: {
            ...(form.linkedin ? { linkedin: form.linkedin } : {}),
            ...(form.twitter ? { twitter: form.twitter } : {}),
          },
        }),
      });
      const data = await res.json() as { page?: { slug: string }; error?: string; code?: string };
      if (res.status === 403 && data.code === 'INFINITY_REQUIRED') { setShowInfinityModal(true); return; }
      if (!res.ok || data.error) { setError(data.error || 'Something went wrong'); return; }
      if (data.page?.slug) router.push(`/businesses/${data.page.slug}`);
    } finally {
      setSubmitting(false);
    }
  }

  const INPUT = {
    width: '100%', boxSizing: 'border-box' as const, padding: '11px 14px', borderRadius: 11,
    border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.045)',
    color: 'rgba(255,255,255,0.85)', fontSize: 14, fontFamily: 'inherit',
    transition: 'border-color 0.14s ease',
  };

  const LABEL = { margin: '0 0 6px', fontSize: 11.5, fontWeight: 700 as const, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.05em', textTransform: 'uppercase' as const };

  return (
    <>
    {showInfinityModal && <InfinityUpgradeModal feature="business_page" onClose={() => setShowInfinityModal(false)} returnTo="/businesses/create" />}
    <div style={{ minHeight: '100vh', background: '#0a0a0e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <style>{`
        input:focus, textarea:focus, select:focus { outline: none; border-color: rgba(99,102,241,0.5) !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
        .industry-option:hover { border-color: rgba(99,102,241,0.35) !important; background: rgba(99,102,241,0.08) !important; }
        .industry-option.selected { border-color: rgba(99,102,241,0.55) !important; background: rgba(99,102,241,0.14) !important; }
        .size-chip:hover { border-color: rgba(255,255,255,0.25) !important; background: rgba(255,255,255,0.07) !important; }
        .size-chip.selected { border-color: rgba(99,102,241,0.5) !important; background: rgba(99,102,241,0.12) !important; color: rgba(167,139,250,0.9) !important; }
        @keyframes slideIn { from{opacity:0;transform:translateX(16px)} to{opacity:1;transform:none} }
      `}</style>

      <div style={{ width: '100%', maxWidth: 640 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg,rgba(99,102,241,0.25),rgba(167,139,250,0.20))', border: '1px solid rgba(99,102,241,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Building2 style={{ width: 22, height: 22, color: '#818cf8' }} />
          </div>
          <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: 'rgba(255,255,255,0.95)', letterSpacing: '-0.02em' }}>Create a Business Page</h1>
          <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>Showcase your company, share updates, and attract talent.</p>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 32 }}>
          {[1, 2, 3].map((s) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 800,
                background: s < step ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : s === step ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.05)',
                border: s === step ? '2px solid rgba(99,102,241,0.55)' : s < step ? 'none' : '1px solid rgba(255,255,255,0.08)',
                color: s === step ? '#a78bfa' : s < step ? '#fff' : 'rgba(255,255,255,0.25)',
              }}>
                {s < step ? <Check style={{ width: 12, height: 12 }} /> : s}
              </div>
              {s < 3 && <div style={{ width: 32, height: 2, borderRadius: 99, background: s < step ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.07)' }} />}
            </div>
          ))}
        </div>

        {/* Card */}
        <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 32 }}>

          {/* STEP 1 — Basic info */}
          {step === 1 && (
            <div style={{ animation: 'slideIn 0.2s ease both', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>Basic Information</h3>

              <div>
                <p style={LABEL}>Company Name *</p>
                <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Acme Technologies Pvt. Ltd." style={INPUT} autoFocus />
              </div>

              <div>
                <p style={LABEL}>Tagline</p>
                <input value={form.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="A short compelling description (max 80 chars)" maxLength={80} style={INPUT} />
              </div>

              <div>
                <p style={LABEL}>About the Company</p>
                <textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Describe what your company does, its mission, values, and what makes it unique…" rows={4}
                  style={{ ...INPUT, resize: 'vertical', lineHeight: 1.55 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <p style={LABEL}>Founded Year</p>
                  <input value={form.foundedYear} onChange={(e) => set('foundedYear', e.target.value)} placeholder="e.g. 2018" type="number" min={1800} max={new Date().getFullYear()} style={INPUT} />
                </div>
                <div>
                  <p style={LABEL}>Website</p>
                  <input value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://yourcompany.com" style={INPUT} />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2 — Industry + size */}
          {step === 2 && (
            <div style={{ animation: 'slideIn 0.2s ease both' }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>Industry & Company Size</h3>
              <p style={{ margin: '0 0 20px', fontSize: 13, color: 'rgba(255,255,255,0.30)' }}>Help people discover your company.</p>

              <p style={LABEL}>Industry *</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8, marginBottom: 24 }}>
                {INDUSTRIES.map((ind) => (
                  <button key={ind.value} type="button" onClick={() => set('industry', ind.value)}
                    className={`industry-option ${form.industry === ind.value ? 'selected' : ''}`}
                    style={{ padding: '10px 12px', borderRadius: 11, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.55)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.14s ease' }}
                  >
                    <span style={{ fontSize: 16 }}>{ind.emoji}</span>
                    {ind.label}
                  </button>
                ))}
              </div>

              <p style={LABEL}>Company Size</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {SIZES.map((s) => (
                  <button key={s} type="button" onClick={() => set('companySize', s)}
                    className={`size-chip ${form.companySize === s ? 'selected' : ''}`}
                    style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.48)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', transition: 'all 0.14s ease' }}
                  >
                    {s} employees
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3 — Contact + social */}
          {step === 3 && (
            <div style={{ animation: 'slideIn 0.2s ease both', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>Contact & Location</h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <p style={LABEL}>City</p>
                  <input value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="e.g. Bangalore" style={INPUT} />
                </div>
                <div>
                  <p style={LABEL}>Country</p>
                  <input value={form.country} onChange={(e) => set('country', e.target.value)} placeholder="India" style={INPUT} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <p style={LABEL}>Contact Email</p>
                  <div style={{ position: 'relative' }}>
                    <Mail style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'rgba(255,255,255,0.25)', pointerEvents: 'none' }} />
                    <input value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="hello@company.com" type="email" style={{ ...INPUT, paddingLeft: 34 }} />
                  </div>
                </div>
                <div>
                  <p style={LABEL}>Phone</p>
                  <div style={{ position: 'relative' }}>
                    <Phone style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'rgba(255,255,255,0.25)', pointerEvents: 'none' }} />
                    <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 98765 43210" style={{ ...INPUT, paddingLeft: 34 }} />
                  </div>
                </div>
              </div>

              <div>
                <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.40)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Social Links</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ position: 'relative' }}>
                    <Linkedin style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'rgba(255,255,255,0.25)', pointerEvents: 'none' }} />
                    <input value={form.linkedin} onChange={(e) => set('linkedin', e.target.value)} placeholder="https://linkedin.com/company/…" style={{ ...INPUT, paddingLeft: 34 }} />
                  </div>
                  <div style={{ position: 'relative' }}>
                    <Twitter style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'rgba(255,255,255,0.25)', pointerEvents: 'none' }} />
                    <input value={form.twitter} onChange={(e) => set('twitter', e.target.value)} placeholder="https://twitter.com/…" style={{ ...INPUT, paddingLeft: 34 }} />
                  </div>
                </div>
              </div>

              {error && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)', color: 'rgba(252,165,165,0.9)', fontSize: 13 }}>{error}</div>
              )}
            </div>
          )}

          {/* Nav buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, gap: 12 }}>
            <button
              onClick={() => step > 1 ? setStep((s) => s - 1) : router.back()}
              style={{ padding: '11px 20px', borderRadius: 11, border: '1px solid rgba(255,255,255,0.12)', background: 'none', color: 'rgba(255,255,255,0.50)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              ← Back
            </button>

            {step < 3 ? (
              <button onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 24px', borderRadius: 11, border: 'none', background: canProceed() ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(99,102,241,0.25)', color: canProceed() ? '#fff' : 'rgba(255,255,255,0.35)', fontSize: 13, fontWeight: 700, cursor: canProceed() ? 'pointer' : 'not-allowed' }}
              >
                Continue <ChevronRight style={{ width: 15, height: 15 }} />
              </button>
            ) : (
              <button onClick={submit} disabled={submitting || !form.name || !form.industry}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 28px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.75 : 1, boxShadow: '0 4px 20px rgba(99,102,241,0.35)' }}
              >
                {submitting ? 'Creating Page…' : <>Create Page <Check style={{ width: 14, height: 14 }} /></>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
