import { NextRequest, NextResponse } from 'next/server';
import { generateAiText, getAiModelName, isAiConfigured, normalizeAiList, normalizeAiText, parseStructuredJson } from '@/lib/server/ai';
import { supportFaqs } from '@/lib/support-faqs';

export const dynamic = 'force-dynamic';

function buildFallbackAnswer(query: string) {
  const normalized = query.toLowerCase();
  const matches = supportFaqs.filter((faq) =>
    normalized.includes(faq.category.toLowerCase())
    || faq.question.toLowerCase().split(' ').some((word) => word.length > 4 && normalized.includes(word)),
  );
  const selected = matches[0] || supportFaqs[0];
  return {
    answer: selected.answer,
    bullets: selected.actions,
    suggestedActions: selected.actions,
    relatedFaqIds: supportFaqs
      .filter((faq) => faq.id !== selected.id && faq.category === selected.category)
      .slice(0, 3)
      .map((faq) => faq.id),
    confidenceLabel: isAiConfigured() ? 'Public support fallback' : 'FAQ-guided support',
  };
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as { query?: string };
    const query = payload.query?.trim();
    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    if (!isAiConfigured()) {
      const fallback = buildFallbackAnswer(query);
      return NextResponse.json({
        answer: fallback.answer,
        bullets: fallback.bullets,
        suggestedActions: fallback.suggestedActions,
        relatedFaqs: supportFaqs.filter((faq) => fallback.relatedFaqIds.includes(faq.id)),
        confidenceLabel: fallback.confidenceLabel,
        provider: 'Fallback',
      });
    }

    const answer = await generateAiText([
      {
        role: 'system',
        content:
          'You are Docrud public AI support. Answer only product questions about docrud features, plans, onboarding, billing, file transfers, DoXpert, Visualizer, DocSheet, and document workflows. Be concise, practical, and trustworthy. Do not invent account-specific details or claim access to private workspace data. Return strict JSON with keys: answer, bullets, suggestedActions, relatedFaqIds, confidenceLabel.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          query,
          productFaqs: supportFaqs,
        }),
      },
    ]);

    const parsed = parseStructuredJson<{
      answer?: unknown;
      bullets?: unknown;
      suggestedActions?: unknown;
      relatedFaqIds?: unknown;
      confidenceLabel?: unknown;
    }>(answer);

    const relatedFaqIds = normalizeAiList(parsed.relatedFaqIds, 4)
      .map((item) => item.toLowerCase())
      .filter(Boolean);

    return NextResponse.json({
      answer: normalizeAiText(parsed.answer) || buildFallbackAnswer(query).answer,
      bullets: normalizeAiList(parsed.bullets, 6),
      suggestedActions: normalizeAiList(parsed.suggestedActions, 5),
      relatedFaqs: supportFaqs.filter((faq) => relatedFaqIds.includes(faq.id.toLowerCase())).slice(0, 4),
      confidenceLabel: normalizeAiText(parsed.confidenceLabel) || 'AI support guidance',
      provider: 'Groq',
      model: getAiModelName(),
    });
  } catch (error) {
    console.error(error);
    const fallback = buildFallbackAnswer('general support');
    return NextResponse.json({
      answer: fallback.answer,
      bullets: fallback.bullets,
      suggestedActions: fallback.suggestedActions,
      relatedFaqs: supportFaqs.slice(0, 3),
      confidenceLabel: fallback.confidenceLabel,
      provider: 'Fallback',
    });
  }
}
