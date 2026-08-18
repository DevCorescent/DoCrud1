'use client';

/**
 * §18 Enquiry Success.
 *
 * Rendered by ServiceEnquiryModal after a successful submit, but exported on its
 * own so any other surface (service detail page, catalogue, provider profile)
 * can reuse the exact same confirmation.
 */
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, FileText, MessageSquare } from 'lucide-react';

export interface EnquirySuccessEnquiry {
  id: string;
  serviceTitle?: string;
  requirement?: string;
  contactMethod?: 'docrud_chat' | 'email' | 'phone';
  budget?: { min?: number; max?: number; currency: string };
  timeline?: { startDate?: string; completionDate?: string };
  attachments?: Array<{ url: string; name: string }>;
  companyInfo?: string;
  createdAt?: string;
}

export interface EnquirySuccessProvider {
  id: string;
  name: string;
  avatarUrl?: string;
  headline?: string;
  href: string;
}

export interface EnquirySuccessConversation {
  id: string;
  href: string;
}

export interface ServiceEnquirySuccessProps {
  provider: EnquirySuccessProvider;
  enquiryId: string;
  conversation?: EnquirySuccessConversation | null;
  /** Submitted enquiry — powers the built-in "View Enquiry" summary. */
  enquiry?: EnquirySuccessEnquiry;
  /** True when the API recognised this as a repeat of an enquiry already sent. */
  duplicate?: boolean;
  /**
   * Optional host override for "View Enquiry" (e.g. route to a dedicated page).
   * Without it the action expands an inline summary of what was just sent, so
   * §18 always offers all three actions.
   */
  onViewEnquiry?: (enquiryId: string) => void;
  /** Fired by "Continue Browsing" — usually just closes the modal. */
  onContinue?: () => void;
}

const CONTACT_LABELS: Record<string, string> = {
  docrud_chat: 'Docrud chat',
  email: 'Email',
  phone: 'Phone',
};

function formatBudget(budget?: EnquirySuccessEnquiry['budget']) {
  if (!budget || (budget.min == null && budget.max == null)) return null;
  const c = budget.currency;
  if (budget.min != null && budget.max != null) return `${c} ${budget.min.toLocaleString()} – ${budget.max.toLocaleString()}`;
  if (budget.min != null) return `${c} ${budget.min.toLocaleString()}+`;
  return `Up to ${c} ${budget.max!.toLocaleString()}`;
}

export default function ServiceEnquirySuccess({
  provider,
  enquiryId,
  conversation,
  enquiry,
  duplicate = false,
  onViewEnquiry,
  onContinue,
}: ServiceEnquirySuccessProps) {
  const [showDetails, setShowDetails] = useState(false);
  const budgetLabel = formatBudget(enquiry?.budget);
  const timeline = [
    enquiry?.timeline?.startDate ? `from ${enquiry.timeline.startDate}` : '',
    enquiry?.timeline?.completionDate ? `by ${enquiry.timeline.completionDate}` : '',
  ].filter(Boolean).join(' · ');

  const rows: Array<[string, string]> = [
    ['Service', enquiry?.serviceTitle ?? ''],
    ['Provider', provider.name],
    ['Contact via', enquiry?.contactMethod ? CONTACT_LABELS[enquiry.contactMethod] ?? enquiry.contactMethod : ''],
    ['Budget', budgetLabel ?? ''],
    ['Timeline', timeline],
    ['Company', enquiry?.companyInfo ?? ''],
    ['Attachments', enquiry?.attachments?.length ? `${enquiry.attachments.length} file${enquiry.attachments.length === 1 ? '' : 's'}` : ''],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <div className="py-8 text-center">
      <div
        className="h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-5 shadow-[0_0_30px_rgba(16,185,129,0.35)]"
        style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}
      >
        <Check className="h-8 w-8 text-white" />
      </div>

      <p className="font-black text-white text-[17px] leading-tight px-4">
        {duplicate ? 'Enquiry already sent' : `Your enquiry has been sent to ${provider.name}.`}
      </p>
      <p className="text-[12.5px] text-white/40 mt-2 px-6 leading-relaxed">
        {duplicate
          ? `${provider.name} already has this enquiry. Continue the discussion in your conversation.`
          : 'They will respond through Docrud. You can track the discussion in Messages.'}
      </p>

      <div className="mt-6 flex flex-col gap-2.5 px-2">
        {conversation && (
          <Link
            href={conversation.href}
            className="flex items-center justify-center gap-2 h-11 rounded-[13px] font-bold text-[13px] text-white transition-all active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.35)' }}
          >
            <MessageSquare className="h-4 w-4" />
            View Conversation
          </Link>
        )}

        <button
          type="button"
          onClick={() => (onViewEnquiry ? onViewEnquiry(enquiryId) : setShowDetails((v) => !v))}
          aria-expanded={onViewEnquiry ? undefined : showDetails}
          className="flex items-center justify-center gap-2 h-11 rounded-[13px] border border-white/[0.10] bg-white/[0.05] text-[13px] font-semibold text-white/70 hover:text-white hover:bg-white/[0.09] transition-all"
        >
          <FileText className="h-4 w-4" />
          View Enquiry
        </button>

        {!onViewEnquiry && showDetails && (
          <div className="rounded-[14px] border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-left">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3 py-1">
                <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-[0.12em] text-white/30">{label}</span>
                <span className="text-right text-[12px] text-white/65 break-words">{value}</span>
              </div>
            ))}
            {enquiry?.requirement && (
              <p className="mt-2 border-t border-white/[0.06] pt-2 text-[12px] leading-relaxed text-white/55 whitespace-pre-wrap">
                {enquiry.requirement}
              </p>
            )}
            <p className="mt-2 text-[10px] text-white/25">Reference: {enquiryId}</p>
          </div>
        )}

        <button
          type="button"
          onClick={onContinue}
          className="flex items-center justify-center gap-2 h-11 rounded-[13px] text-[13px] font-semibold text-white/45 hover:text-white/75 transition-all"
        >
          Continue Browsing
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
