'use client';

/**
 * ATS report renderer.
 *
 * Presentation only. Every number here is read from the API response; the sole
 * arithmetic is Math.round for display and score x weight for the "contributes"
 * line, both over values the server produced. No scoring happens in the browser.
 *
 * All resume and job-description text is rendered as ordinary React text.
 * dangerouslySetInnerHTML appears nowhere in this file: evidence quotes come
 * from an uploaded document and are untrusted input.
 */
import { useState } from 'react';
import {
  auditRows, displayScore, filterCount, filterKeywords, gaps, KEYWORD_FILTERS,
  scoreTone, STATUS_META, strengths, TONE_CLASSES, TONE_LABEL,
  type AtsApiResponse, type KeywordFilter,
} from './ats-view-model';

const PANEL = 'rounded-2xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-white/[0.03]';
const LABEL = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-white/40';
const MUTED = 'text-slate-600 dark:text-white/45';



/** The score ring. Presentation only — the number is the API's. */
function ScoreRing({ score }: { score: number }) {
  const tone = scoreTone(score);
  const size = 132;
  const stroke = 11;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img"
        aria-label={`ATS match score ${displayScore(score)} out of 100`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke}
          className="stroke-slate-200 dark:stroke-white/[0.08]" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circumference}
          strokeDashoffset={circumference - (pct / 100) * circumference}
          className={TONE_CLASSES[tone].ring} />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-[34px] font-bold leading-none tracking-[-0.02em] ${TONE_CLASSES[tone].text}`}>
          {displayScore(score)}<span className="text-[16px]">%</span>
        </span>
      </span>
    </div>
  );
}

/** A labelled sub-score bar. The word beside it carries the status, not the hue. */
function ModuleBar({ label, score, weight }: { label: string; score: number; weight: number }) {
  const tone = scoreTone(score);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-semibold">{label}</span>
        <span className="text-[12px] tabular-nums">
          <span className={TONE_CLASSES[tone].text}>{score}</span>
          <span className={MUTED}> / 100 · {TONE_LABEL[tone]}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/[0.08]">
        <div className={`h-full rounded-full ${TONE_CLASSES[tone].ring.replace('stroke-', 'bg-')}`}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
      <p className={`mt-1 text-[11px] ${MUTED}`}>
        Weight {weight}% · contributes {(score * weight / 100).toFixed(1)} points
      </p>
    </div>
  );
}

/**
 * The rendered report.
 *
 * Shared by /ats/evaluate and /ats/history so a saved report and a fresh one
 * cannot drift apart — there is one renderer, not two that must be kept in
 * step. The filter and expansion state live here rather than in a parent,
 * because they are properties of viewing a report, not of the page around it.
 */
export function AtsResults({ result }: { result: AtsApiResponse }) {
  const [filter, setFilter] = useState<KeywordFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const { breakdown, parsing, impact, alignment } = result;
  const rows = filterKeywords(result.keywords, filter);
  const strong = strengths(result);
  const weak = gaps(result);

  return (
    <div className="mt-6 space-y-4">

      {/* ── Score header ── */}
      <section className={`${PANEL} p-5 sm:p-6`}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <ScoreRing score={result.score} />

          <div className="min-w-0 flex-1">
            <p className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11.5px] font-bold ${TONE_CLASSES[scoreTone(result.score)].chip}`}>
              {result.label}
            </p>
            <p className="mt-2.5 text-[13.5px] leading-relaxed">{result.summary}</p>
            <p className={`mt-2 text-[12px] ${MUTED}`}>
              Resume Quality: <span className="font-semibold tabular-nums">{result.resumeQuality.score}</span> / 100
              <span className="ml-1">— a separate measure of how well the resume is written, whichever job it is sent to.</span>
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          <ModuleBar label="Keyword Match" score={breakdown.keyword.score} weight={breakdown.keyword.weight} />
          <ModuleBar label="Experience & Impact" score={breakdown.experience.score} weight={breakdown.experience.weight} />
          <ModuleBar label="Title & Education" score={breakdown.alignment.score} weight={breakdown.alignment.weight} />
        </div>

        <p className={`mt-4 border-t border-slate-200 pt-3 text-[11.5px] tabular-nums dark:border-white/[0.07] ${MUTED}`}>
          {breakdown.keyword.weightedScore} + {breakdown.experience.weightedScore} + {breakdown.alignment.weightedScore} = {breakdown.parsingCap.rawScore}
          {breakdown.parsingCap.applied ? '' : ` — your ATS match score`}
        </p>

        {/* A cap is never hidden. */}
        {breakdown.parsingCap.applied && (
          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-[12.5px] font-bold text-amber-700 dark:text-amber-300">
              Score capped because of resume structure
            </p>
            <p className={`mt-1 text-[12px] tabular-nums ${MUTED}`}>
              Raw score {breakdown.parsingCap.rawScore} · cap {breakdown.parsingCap.cap} · final score {result.score}.
              The document could not be parsed cleanly ({parsing.parserQuality}), so the score is limited until it is fixed.
            </p>
          </div>
        )}
      </section>

      {/* ── Summary + gaps ── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className={`${PANEL} p-5`}>
          <h2 className={LABEL}>Why this job matches you</h2>
          {strong.length ? (
            <ul className="mt-3 space-y-2">
              {strong.map((row) => (
                <li key={row.requirement} className="flex items-start gap-2 text-[13px]">
                  <span aria-hidden className="mt-[2px] text-emerald-600 dark:text-emerald-300">✓</span>
                  <span><span className="font-semibold">{row.requirement}</span>
                    <span className={MUTED}> — {STATUS_META[row.status].label.toLowerCase()} match, proven in your experience</span></span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={`mt-3 text-[13px] ${MUTED}`}>No requirement is both matched and demonstrated in your experience yet.</p>
          )}
        </div>

        <div className={`${PANEL} p-5`}>
          <h2 className={LABEL}>What is holding your score back</h2>
          {weak.length ? (
            <ul className="mt-3 space-y-2">
              {weak.map((row) => (
                <li key={row.requirement} className="flex items-start gap-2 text-[13px]">
                  <span aria-hidden className={`mt-[2px] ${TONE_CLASSES[STATUS_META[row.status].tone].text}`}>
                    {STATUS_META[row.status].glyph}
                  </span>
                  <span><span className="font-semibold">{row.requirement}</span>
                    <span className={MUTED}> — {STATUS_META[row.status].label.toLowerCase()}
                      {!row.contextualProof && row.status !== 'missing' ? ', no supporting experience' : ''}
                      {row.importance === 'must' ? ' (stated as required)' : ''}</span></span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={`mt-3 text-[13px] ${MUTED}`}>No significant gaps were found against this posting.</p>
          )}
        </div>
      </section>

      {/* ── 1. Parsing audit ── */}
      <section className={`${PANEL} p-5`}>
        <h2 className="text-[15px] font-bold">1. Parsing &amp; structural audit</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {auditRows(parsing).map((row) => (
            <div key={row.label} className="flex items-center gap-2 text-[13px]">
              <span aria-hidden className={row.state === 'ok' ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-400 dark:text-white/30'}>
                {row.state === 'ok' ? '✓' : '✕'}
              </span>
              <span className={row.state === 'ok' ? '' : MUTED}>{row.label}</span>
              <span className="sr-only">{row.state === 'ok' ? 'present' : 'missing'}</span>
            </div>
          ))}
        </div>

        {parsing.criticalMissingElements.length > 0 && (
          <div className="mt-4">
            <h3 className={LABEL}>Critical missing elements</h3>
            <p className="mt-1.5 text-[13px]">{parsing.criticalMissingElements.join(', ')}</p>
          </div>
        )}
        {parsing.redFlags.length > 0 && (
          <div className="mt-4">
            <h3 className={LABEL}>Red flags</h3>
            <ul className="mt-1.5 space-y-1">
              {parsing.redFlags.map((flag) => (
                <li key={flag} className="text-[13px]">• {flag}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── 2. Keyword match ── */}
      <section className={`${PANEL} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-bold">2. Keyword match <span className={`font-normal ${MUTED}`}>(45% of score)</span></h2>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter requirements">
            {KEYWORD_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                  filter === f.id
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-[#020617]'
                    : 'border-slate-300 hover:bg-slate-100 dark:border-white/[0.12] dark:hover:bg-white/[0.06]'
                }`}
              >
                {f.label} <span className="tabular-nums opacity-60">{filterCount(result.keywords, f.id)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Scrolls inside itself on a narrow screen — the page never scrolls sideways. */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className={`border-b border-slate-200 dark:border-white/[0.08] ${LABEL}`}>
                <th scope="col" className="py-2 pr-3 font-semibold">JD requirement</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Match status</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Contextual proof</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Credit</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={4} className={`py-4 text-[13px] ${MUTED}`}>No requirements in this filter.</td></tr>
              )}
              {rows.map((row) => {
                const meta = STATUS_META[row.status];
                const isOpen = expanded === row.requirement;
                const canExpand = Boolean(row.proofQuote || row.matchedAs);
                return (
                  <tr key={row.requirement} className="border-b border-slate-100 align-top dark:border-white/[0.05]">
                    <td className="py-2.5 pr-3 text-[13px] font-semibold">
                      {row.requirement}
                      {row.importance === 'must' && (
                        <span className={`ml-1.5 text-[10px] font-bold uppercase tracking-wide ${MUTED}`}>required</span>
                      )}
                      {canExpand && (
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : row.requirement)}
                          aria-expanded={isOpen}
                          className="ml-2 text-[11px] font-semibold text-sky-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-300"
                        >
                          {isOpen ? 'Hide evidence' : 'Evidence'}
                        </button>
                      )}
                      {isOpen && (
                        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                          {row.matchedAs && (
                            <p className={`text-[11.5px] ${MUTED}`}>Matched in your resume as “{row.matchedAs}”</p>
                          )}
                          {/* Rendered as text. Never as HTML — this came from an uploaded file. */}
                          {row.proofQuote && <p className="mt-1 text-[12.5px] italic">“{row.proofQuote}”</p>}
                        </div>
                      )}
                    </td>
                    <td className={`py-2.5 pr-3 text-[13px] ${TONE_CLASSES[meta.tone].text}`}>
                      <span aria-hidden>{meta.glyph}</span> {meta.label}
                    </td>
                    <td className={`py-2.5 pr-3 text-[13px] ${row.contextualProof ? '' : MUTED}`}>
                      {row.contextualProof ? 'Yes' : row.evidence === 'listed' ? 'No — skills list only' : 'No'}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-[13px] tabular-nums">{row.credit.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 3. Experience & impact ── */}
      <section className={`${PANEL} p-5`}>
        <h2 className="text-[15px] font-bold">3. Experience &amp; impact <span className={`font-normal ${MUTED}`}>(35% of score)</span></h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Action verb score" value={`${Math.round(impact.actionVerbScore)}`} suffix="/ 100" tone />
          <Stat label="Quantification rate" value={`${Math.round(impact.quantificationRate)}%`}
            note={`${impact.quantifiedBullets} of ${impact.totalBullets} bullets`} />
          <Stat label="Relevant experience" value={`${Math.round(impact.relevanceScore)}`} suffix="/ 100" tone />
          <Stat label="Years"
            value={impact.candidateYears === null ? '—' : `${impact.candidateYears}`}
            note={impact.requiredYears ? `${impact.requiredYears}+ required` : 'none stated'} />
        </div>

        {impact.weakestBullet && (
          <div className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-white/[0.08]">
            <h3 className={LABEL}>Weakest bullet</h3>
            <p className="mt-2 text-[13px]"><span className={MUTED}>Original: </span>“{impact.weakestBullet.original}”</p>
            <p className="mt-2 text-[13px]"><span className={MUTED}>Why it fails: </span>{impact.weakestBullet.whyItFails}</p>
            <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/[0.07] p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-700 dark:text-sky-300">
                Suggested rewrite — not currently in your resume
              </p>
              <p className="mt-1.5 text-[13px]">“{impact.weakestBullet.rewrite}”</p>
              <p className={`mt-2 text-[11.5px] ${MUTED}`}>
                This is a suggestion built from your own wording. Any figure shown as a placeholder must be filled in
                with a real result — nothing here is invented for you.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── 4. Alignment ── */}
      <section className={`${PANEL} p-5`}>
        <h2 className="text-[15px] font-bold">4. Alignment &amp; progression <span className={`font-normal ${MUTED}`}>(20% of score)</span></h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AlignCard title="Title alignment" state={alignment.titleScore >= 75 ? 'ok' : alignment.titleScore >= 45 ? 'partial' : 'missing'}
            detail={alignment.bestResumeTitle ? `Closest: ${alignment.bestResumeTitle}` : 'No comparable title found'} />
          <AlignCard title="Seniority" state={alignment.seniorityMismatch ? 'missing' : 'ok'}
            detail={alignment.seniorityMismatch
              ? `Role targets ${alignment.jdSeniority ?? 'a higher level'}${alignment.resumeSeniority ? `; resume reads as ${alignment.resumeSeniority}` : ''}`
              : 'Consistent with the role'} />
          <AlignCard title="Education" state={alignment.educationMet ? 'ok' : 'missing'}
            detail={alignment.requiredEducation ? `Required: ${alignment.requiredEducation}` : 'No degree requirement stated'} />
          <AlignCard title="Certifications" state={alignment.missingCertifications.length ? 'missing' : 'ok'}
            detail={alignment.missingCertifications.length
              ? `Missing: ${alignment.missingCertifications.join(', ')}`
              : 'No required certification is missing'} />
        </div>
      </section>

      {/* ── 5. Action plan ── */}
      <section className={`${PANEL} p-5`}>
        <h2 className="text-[15px] font-bold">5. Action plan</h2>
        <p className={`mt-1 text-[12px] ${MUTED}`}>The highest-impact changes for this posting, most valuable first.</p>
        <ol className="mt-4 space-y-3">
          {result.actionPlan.map((step, index) => (
            <li key={step} className="flex gap-3 text-[13px] leading-relaxed">
              <span className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[11px] font-bold tabular-nums dark:border-white/[0.14]">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <p className={`px-1 pb-4 text-[11.5px] ${MUTED}`}>
        This score measures compatibility between this resume and this job description. It is not a probability of
        being hired, and it is computed by fixed rules — the same resume and posting always produce the same score.
      </p>
    </div>
  );
}

function Stat({ label, value, suffix, note, tone }: {
  label: string; value: string; suffix?: string; note?: string; tone?: boolean;
}) {
  const numeric = Number(value.replace('%', ''));
  const toneClass = tone && Number.isFinite(numeric) ? TONE_CLASSES[scoreTone(numeric)].text : '';
  return (
    <div className="rounded-xl border border-slate-200 p-3.5 dark:border-white/[0.08]">
      <p className={LABEL}>{label}</p>
      <p className={`mt-1.5 text-[22px] font-bold leading-none tabular-nums ${toneClass}`}>
        {value}{suffix ? <span className={`ml-1 text-[12px] font-semibold ${MUTED}`}>{suffix}</span> : null}
      </p>
      {note && <p className={`mt-1.5 text-[11.5px] ${MUTED}`}>{note}</p>}
    </div>
  );
}

function AlignCard({ title, state, detail }: {
  title: string; state: 'ok' | 'partial' | 'missing'; detail: string;
}) {
  const meta = {
    ok: { glyph: '✓', word: 'Meets', cls: 'text-emerald-600 dark:text-emerald-300' },
    partial: { glyph: '⚠', word: 'Partial', cls: 'text-amber-600 dark:text-amber-300' },
    missing: { glyph: '✕', word: 'Gap', cls: 'text-rose-600 dark:text-rose-300' },
  }[state];
  return (
    <div className="rounded-xl border border-slate-200 p-3.5 dark:border-white/[0.08]">
      <p className={LABEL}>{title}</p>
      <p className={`mt-1.5 text-[14px] font-bold ${meta.cls}`}>
        <span aria-hidden>{meta.glyph}</span> {meta.word}
      </p>
      <p className={`mt-1.5 text-[11.5px] leading-relaxed ${MUTED}`}>{detail}</p>
    </div>
  );
}
