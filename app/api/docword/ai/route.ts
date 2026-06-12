import { NextRequest, NextResponse } from 'next/server';
import { generateAiText, isAiConfigured } from '@/lib/server/ai';

export const dynamic = 'force-dynamic';

function fallbackTransform(mode: string, text: string, title: string) {
  const normalized = text.trim();
  if (!normalized) return '';

  switch (mode) {
    case 'proofread':
      return [
        'Tighten the opening so the purpose is visible in the first two lines.',
        'Break longer paragraphs into smaller readable sections.',
        'Clarify the final ask, next action, or decision required from the reader.',
        'Replace generic wording with more concrete business language where possible.',
      ].join('\n');
    case 'summarize':
      return normalized.split(/(?<=[.!?])\s+/).slice(0, 3).join(' ');
    case 'shorten':
      return normalized.split(/\s+/).slice(0, Math.max(24, Math.floor(normalized.split(/\s+/).length * 0.55))).join(' ');
    case 'expand':
      return `${normalized}\n\nThis section can be expanded with clearer business context, expected outcomes, execution notes, and supporting detail.`;
    case 'hinglish_formal':
      return normalized
        .replace(/\bmujhe\b/gi, 'I would like to')
        .replace(/\bleave lena hai\b/gi, 'request leave')
        .replace(/\bkal\b/gi, 'tomorrow')
        .replace(/\bplease\b/gi, 'kindly')
        .trim();
    case 'translate_english':
      return normalized;
    case 'translate_hindi':
      return normalized;
    case 'reply':
      return `Subject: Re: ${title || 'Document'}\n\nThank you for sharing the details. Based on the document, here is a clear and professional response draft.\n\n${normalized}\n\nPlease let us know if you need any clarification from our side.\n\nRegards,\n${title || 'DocWord User'}`;
    case 'rewrite_formal':
      return normalized.replace(/\bcan't\b/gi, 'cannot').replace(/\bwon't\b/gi, 'will not');
    case 'rewrite_casual':
      return normalized.replace(/\btherefore\b/gi, 'so').replace(/\butilize\b/gi, 'use');
    case 'rewrite_concise':
      return normalized.replace(/\s+/g, ' ').trim();
    case 'fix':
      return normalized.replace(/\s+/g, ' ').replace(/\bi\b/g, 'I').trim();
    case 'generate':
      return `${title || 'Document'}\n\n${normalized}\n\nStart with a sharp opening, add the key points in clear sections, and finish with the next action or decision needed.`;
    default:
      return normalized;
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      mode?: string;
      text?: string;
      documentTitle?: string;
      fullText?: string;
      prompt?: string;
      reviewer?: string;
    };

    const mode = payload.mode?.trim() || 'fix';
    const text = payload.text?.trim() || '';
    const fullText = payload.fullText?.trim() || '';
    const documentTitle = payload.documentTitle?.trim() || 'Untitled document';
    const prompt = payload.prompt?.trim() || '';
    const reviewer = payload.reviewer?.trim() || '';
    const sourceText = text || fullText || prompt;

    if (!sourceText) {
      return NextResponse.json({ error: 'Text or prompt is required.' }, { status: 400 });
    }

    if (!isAiConfigured()) {
      return NextResponse.json({
        result: fallbackTransform(mode, sourceText, documentTitle),
        provider: 'Fallback',
      });
    }

    const modeInstruction =
      mode === 'summarize'
        ? 'Summarize the document into a crisp executive brief.'
        : mode === 'shorten'
          ? 'Shorten the writing while preserving the meaning, keeping it polished and readable.'
          : mode === 'expand'
            ? 'Expand the writing with stronger structure, better detail, and useful context.'
            : mode === 'hinglish_formal'
              ? 'Convert Hinglish or mixed Indian casual writing into formal, professional English while preserving the meaning and context.'
            : mode === 'translate_english'
              ? 'Translate the selected text into clear professional English. Return only the translated text.'
              : mode === 'translate_hindi'
                ? 'Translate the selected text into clear professional Hindi. Return only the translated text.'
                : mode === 'reply'
                  ? 'Draft a professional reply to the pasted message, notice, email, or document. Return only the reply text.'
            : mode === 'rewrite_formal'
              ? 'Rewrite the text in a formal, professional tone.'
              : mode === 'rewrite_casual'
                ? 'Rewrite the text in a clear, modern, conversational tone.'
                : mode === 'rewrite_concise'
                  ? 'Rewrite the text to be concise, sharp, and direct.'
                  : mode === 'generate'
                    ? 'Generate document content from the prompt and shape it like a polished draft.'
                    : mode === 'proofread'
                      ? 'Review the document like a sharp professional editor. Return concise bullet suggestions only, focused on improvements.'
                    : 'Fix grammar, improve clarity, and keep the meaning intact.';

    const result = await generateAiText([
      {
        role: 'system',
        content:
          'You are DocWord AI, an expert document writing assistant. Return only the improved text content. Do not wrap the answer in JSON or markdown fences.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          documentTitle,
          mode,
          reviewer,
          instruction: modeInstruction,
          prompt,
          sourceText,
          fullText,
        }),
      },
    ]);

    return NextResponse.json({ result: result.trim(), provider: 'Groq' });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to run DocWord AI.' }, { status: 500 });
  }
}
