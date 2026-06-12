'use client';

import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';

interface InquiryFormProps {
  requestType: 'contact' | 'demo' | 'pricing';
  title: string;
  submitLabel: string;
  includeDemoFields?: boolean;
}

export default function InquiryForm({ requestType, title, submitLabel, includeDemoFields = false }: InquiryFormProps) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    organization: '',
    phone: '',
    message: '',
    preferredDate: '',
    teamSize: '',
    useCase: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const submitLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/contact-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, requestType }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to submit your request');
      }

      setForm({
        name: '',
        email: '',
        organization: '',
        phone: '',
        message: '',
        preferredDate: '',
        teamSize: '',
        useCase: '',
      });
      setFeedback({ type: 'success', message: 'Your request has been sent. Our team will contact you shortly.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to submit your request' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => void submitLead(event)}>
      <div className="md:col-span-2">
        <p className="text-sm font-medium text-slate-950">{title}</p>
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">Full Name</label>
        <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200" required />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">Work Email</label>
        <input type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200" required />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">Organization</label>
        <input value={form.organization} onChange={(event) => setForm((prev) => ({ ...prev, organization: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200" required />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">Phone</label>
        <input value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200" />
      </div>
      {includeDemoFields && (
        <>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Preferred Demo Date</label>
            <input type="date" value={form.preferredDate} onChange={(event) => setForm((prev) => ({ ...prev, preferredDate: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Team Size</label>
            <input value={form.teamSize} onChange={(event) => setForm((prev) => ({ ...prev, teamSize: event.target.value }))} placeholder="25 internal users" className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200" />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700">Primary Use Case</label>
            <input value={form.useCase} onChange={(event) => setForm((prev) => ({ ...prev, useCase: event.target.value }))} placeholder="HR onboarding, legal approvals, client documentation" className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200" />
          </div>
        </>
      )}
      <div className="md:col-span-2">
        <label className="mb-2 block text-sm font-medium text-slate-700">Message</label>
        <textarea value={form.message} onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))} className="min-h-[160px] w-full rounded-3xl border border-slate-200 bg-white/90 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200" required />
      </div>
      {feedback && (
        <div className={`md:col-span-2 rounded-2xl px-4 py-3 text-sm ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {feedback.message}
        </div>
      )}
      <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">We use these details to shape the right conversation and implementation scope.</p>
        <Button type="submit" className="rounded-full bg-slate-950 text-white hover:bg-slate-800" disabled={submitting}>
          {submitting ? 'Sending...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
