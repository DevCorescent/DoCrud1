'use client';

/**
 * §28 Reviews and Ratings — submission form.
 *
 * Standalone so any surface can mount it: pass the serviceId, handle onDone.
 * Eligibility is NOT decided here — the server refuses anything without a
 * completed engagement, and it is the server that stamps "Verified Service".
 */
import { useCallback, useRef, useState } from 'react';
import { Loader2, Star, X } from 'lucide-react';

export interface ServiceReviewFormProps {
  serviceId: string;
  serviceTitle?: string;
  onDone?: () => void;
  onCancel?: () => void;
}

type AspectKey = 'quality' | 'communication' | 'delivery';

const ASPECTS: Array<{ key: AspectKey; label: string }> = [
  { key: 'quality', label: 'Quality of work' },
  { key: 'communication', label: 'Communication' },
  { key: 'delivery', label: 'Delivery on time' },
];

const MAX_IMAGES = 6;

function Stars({ value, onChange, size = 'md' }: { value: number; onChange: (n: number) => void; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-3.5 w-3.5' : 'h-6 w-6';
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className="transition-transform hover:scale-110 active:scale-95"
        >
          <Star className={`${cls} ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-white/15'}`} />
        </button>
      ))}
    </div>
  );
}

export default function ServiceReviewForm({ serviceId, serviceTitle, onDone, onCancel }: ServiceReviewFormProps) {
  const [rating, setRating] = useState(5);
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [testimonial, setTestimonial] = useState('');
  const [aspects, setAspects] = useState<Partial<Record<AspectKey, number>>>({});
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) { setError(`You can attach up to ${MAX_IMAGES} images.`); return; }
    setUploading(true);
    setError('');
    try {
      const next: string[] = [];
      for (const file of Array.from(files).slice(0, room)) {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/messages/upload', { method: 'POST', body: form });
        const d = await res.json().catch(() => null) as { url?: string; error?: string } | null;
        if (!res.ok || !d?.url) { setError(d?.error || `Could not upload ${file.name}.`); break; }
        next.push(d.url);
      }
      if (next.length) setImages((prev) => [...prev, ...next].slice(0, MAX_IMAGES));
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [images.length]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!headline.trim()) { setError('Add a short headline.'); return; }
    if (!body.trim()) { setError('Write a few words about the service.'); return; }

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/services/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          serviceId,
          rating,
          headline: headline.trim(),
          body: body.trim(),
          ...(testimonial.trim() ? { testimonial: testimonial.trim() } : {}),
          ...(Object.keys(aspects).length ? { aspects } : {}),
          ...(images.length ? { images } : {}),
        }),
      });
      const d = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok) {
        /* 403 here means "no completed engagement" — the server's eligibility rule. */
        setError(d?.error || 'Could not submit your review.');
        return;
      }
      setDone(true);
      onDone?.();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-[16px] border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-5 text-center">
        <p className="text-[13.5px] font-bold text-emerald-200">Thanks for your review.</p>
        <p className="mt-1 text-[12px] text-white/45">It is published with a Verified Service badge.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <span className="block text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/40">
          Your rating{serviceTitle ? ` · ${serviceTitle}` : ''}
        </span>
        <div className="mt-2"><Stars value={rating} onChange={setRating} /></div>
      </div>

      <div>
        <label htmlFor="rv-headline" className="block text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/40 mb-1.5">Headline *</label>
        <input
          id="rv-headline" value={headline} maxLength={120} onChange={(e) => setHeadline(e.target.value)}
          placeholder="Sums up your experience"
          className="w-full rounded-[12px] border border-white/[0.09] bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-white placeholder-white/20 outline-none focus:border-violet-500/50"
        />
      </div>

      <div>
        <label htmlFor="rv-body" className="block text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/40 mb-1.5">Your review *</label>
        <textarea
          id="rv-body" rows={4} value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)}
          placeholder="What was delivered, how did it go?"
          className="w-full resize-none rounded-[12px] border border-white/[0.09] bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-white placeholder-white/20 outline-none focus:border-violet-500/50"
        />
      </div>

      {/* §28 service-specific feedback */}
      <div className="rounded-[14px] border border-white/[0.07] bg-white/[0.02] px-4 py-3">
        <span className="block text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/40">Service-specific feedback</span>
        <div className="mt-2.5 space-y-2">
          {ASPECTS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <span className="text-[12px] text-white/55">{label}</span>
              <Stars size="sm" value={aspects[key] ?? 0} onChange={(n) => setAspects((prev) => ({ ...prev, [key]: n }))} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-white/25">Optional — leave any row blank to skip it.</p>
      </div>

      {/* §28 optional images */}
      <div>
        <span className="block text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/40 mb-1.5">Photos (optional)</span>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
        <button
          type="button" onClick={() => fileRef.current?.click()} disabled={uploading || images.length >= MAX_IMAGES}
          className="rounded-[11px] border border-white/[0.09] bg-white/[0.04] px-3.5 py-2 text-[12px] font-semibold text-white/60 transition hover:text-white disabled:opacity-50"
        >
          {uploading ? <span className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</span> : 'Add photos'}
        </button>
        {images.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {images.map((url) => (
              <div key={url} className="relative h-16 w-16 overflow-hidden rounded-[10px] border border-white/[0.08]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Review attachment" className="h-full w-full object-cover" />
                <button
                  type="button" aria-label="Remove image"
                  onClick={() => setImages((prev) => prev.filter((u) => u !== url))}
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white/70 hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label htmlFor="rv-quote" className="block text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/40 mb-1.5">Public quote (optional)</label>
        <input
          id="rv-quote" value={testimonial} maxLength={200} onChange={(e) => setTestimonial(e.target.value)}
          placeholder="A line the provider may feature"
          className="w-full rounded-[12px] border border-white/[0.09] bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-white placeholder-white/20 outline-none focus:border-violet-500/50"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-[10px] border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-400">{error}</p>
      )}

      <div className="flex gap-3">
        {onCancel && (
          <button
            type="button" onClick={onCancel}
            className="h-11 flex-1 rounded-[13px] border border-white/[0.09] text-[13px] font-semibold text-white/55 transition hover:bg-white/[0.05] hover:text-white/80"
          >
            Cancel
          </button>
        )}
        <button
          type="submit" disabled={submitting || uploading}
          className="h-11 flex-1 rounded-[13px] text-[13px] font-black text-white transition active:scale-[0.98] disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.40)' }}
        >
          {submitting ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting…</span> : 'Submit review'}
        </button>
      </div>
    </form>
  );
}
