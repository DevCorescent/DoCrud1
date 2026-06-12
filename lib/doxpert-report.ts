import { DoxpertAnalysisReport } from '@/types/document';

export const DOXPERT_DISCLAIMER =
  'DoXpert AI provides automated document analysis to improve clarity, visibility, and decision support. It is not a law firm, not legal counsel, and not a substitute for human review, commercial judgment, or professional advice. Final decisions should not be taken solely on the basis of this report.';

export function buildDoxpertReportHtml(report: DoxpertAnalysisReport, generatedFor?: string) {
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const renderList = (title: string, items: string[]) => `
    <section class="card">
      <h3>${escapeHtml(title)}</h3>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </section>
  `;

  const generatedAt = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(report.title)} - DoXpert Report</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 32px; }
        .page { max-width: 1080px; margin: 0 auto; background: white; border-radius: 28px; overflow: hidden; box-shadow: 0 25px 70px rgba(15,23,42,0.08); }
        .hero { background: linear-gradient(135deg, #0f172a 0%, #1e293b 48%, #2563eb 100%); color: white; padding: 36px; }
        .eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 0.28em; opacity: 0.7; }
        h1 { margin: 16px 0 12px; font-size: 38px; line-height: 1.02; font-weight: 600; }
        .hero p { max-width: 760px; font-size: 15px; line-height: 1.8; color: rgba(255,255,255,0.82); }
        .meta { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 16px; margin-top: 28px; }
        .meta-card { background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; padding: 16px; }
        .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.18em; opacity: 0.72; }
        .meta-value { margin-top: 8px; font-size: 24px; font-weight: 600; letter-spacing: -0.03em; }
        .content { padding: 32px; display: grid; gap: 18px; }
        .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 22px; padding: 22px; }
        .card h2, .card h3 { margin: 0 0 12px; font-size: 20px; font-weight: 600; letter-spacing: -0.02em; }
        .card p, .card li { font-size: 14px; line-height: 1.8; color: #475569; }
        .grid-two { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 18px; }
        .score-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; }
        .score-card { border-radius: 18px; background: #f8fafc; padding: 16px; border: 1px solid #e2e8f0; }
        .score-card strong { display: block; margin-top: 6px; font-size: 28px; color: #0f172a; letter-spacing: -0.03em; }
        ul { margin: 0; padding-left: 18px; }
        .notice { background: #fff7ed; border: 1px solid #fdba74; color: #9a3412; }
        .footer { padding: 22px 32px 32px; color: #64748b; font-size: 12px; line-height: 1.7; }
        .copyright { margin-top: 16px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.16em; }
        @media print { body { background: white; padding: 0; } .page { box-shadow: none; border-radius: 0; } }
      </style>
    </head>
    <body>
      <div class="page">
        <section class="hero">
          <div class="eyebrow">docrud · DoXpert AI analysis report</div>
          <h1>${escapeHtml(report.title || 'Untitled document')}</h1>
          <p>${escapeHtml(report.summary)}</p>
          <div class="meta">
            <div class="meta-card"><div class="meta-label">Trust score</div><div class="meta-value">${report.trustScore}</div></div>
            <div class="meta-card"><div class="meta-label">Tone</div><div class="meta-value" style="font-size:18px">${escapeHtml(report.tone)}</div></div>
            <div class="meta-card"><div class="meta-label">Sentiment</div><div class="meta-value" style="font-size:18px">${escapeHtml(report.sentiment)}</div></div>
            <div class="meta-card"><div class="meta-label">Generated</div><div class="meta-value" style="font-size:18px">${escapeHtml(generatedAt)}</div></div>
          </div>
        </section>
        <div class="content">
          <section class="card notice">
            <h2>Important advisory notice</h2>
            <p>${escapeHtml(DOXPERT_DISCLAIMER)}</p>
            <p>${escapeHtml(report.trustNote)}</p>
          </section>
          <section class="card">
            <h2>Scoring overview</h2>
            <div class="score-grid">
              <div class="score-card"><span>Overall</span><strong>${report.score.overall}</strong></div>
              <div class="score-card"><span>Clarity</span><strong>${report.score.clarity}</strong></div>
              <div class="score-card"><span>Compliance</span><strong>${report.score.compliance}</strong></div>
              <div class="score-card"><span>Completeness</span><strong>${report.score.completeness}</strong></div>
              <div class="score-card"><span>Professionalism</span><strong>${report.score.professionalism}</strong></div>
              <div class="score-card"><span>Risk Exposure</span><strong>${report.score.riskExposure}</strong></div>
            </div>
            <p style="margin-top: 14px;">${escapeHtml(report.score.rationale)}</p>
          </section>
          <div class="grid-two">
            ${renderList('Risk warnings', report.risks)}
            ${renderList('Risk mitigation', report.mitigations)}
          </div>
          <div class="grid-two">
            ${renderList('Recommended additions', report.recommendedAdditions)}
            ${renderList('Reply-back suggestions', report.replySuggestions)}
          </div>
          ${renderList('Evidence signals', report.evidenceSignals)}
          ${renderList('Low-score areas', report.lowScoreAreas.map((item) => `${item.area} (${item.score}): ${item.why}`))}
          ${renderList('Harm warnings', report.harmWarnings.length ? report.harmWarnings : ['No major harm warnings were detected from the analyzed text.'])}
          ${report.obligations?.length ? renderList('Obligations identified', report.obligations) : ''}
        </div>
        <div class="footer">
          <div>Generated for ${escapeHtml(generatedFor || 'docrud user')} using DoXpert AI.</div>
          <div>Provider: ${escapeHtml(report.provider)} · Model: ${escapeHtml(report.model)} · Characters analyzed: ${report.extractedCharacterCount.toLocaleString()}</div>
          <div class="copyright">Copyright © docrud · DoXpert AI. All rights reserved.</div>
        </div>
      </div>
    </body>
  </html>`;
}
