'use client';

/**
 * TYRAI — "Tell Your Requirements".
 *
 * ═══ WHAT IT IS ═══
 *
 * A full-screen surface that replaces the homepage with one question. You
 * describe what you need in your own words; it returns the best matches across
 * everything the product knows about — people, businesses, jobs, gigs, posts —
 * each with how well it matched and why.
 *
 * ═══ IT INVENTS NO RANKING ═══
 *
 * The matching is /api/search in `mode=intelligent`, which already does the
 * natural-language understanding, the hybrid lexical + concept scoring, the
 * grouping and the location constraints. Nothing about relevance is
 * reimplemented here — this file asks the question and renders the answer.
 * `matchPercent` and `why` are the server's own; a card never computes a score
 * or writes a reason of its own, because a number the ranking did not produce
 * is a number that will eventually disagree with it.
 *
 * ═══ WHY IT IS ONE FIELD ═══
 *
 * The whole point is that a requirement is a sentence, not a filter set. The
 * page is deliberately empty until you have typed one: no categories, no
 * suggestions competing for the first decision. Once there are results, the
 * field moves to the top rather than being replaced, so the sentence that
 * produced them is still on screen and still editable.
 */

import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Search, Sparkles } from 'lucide-react';
import AiPersonCard from '@/components/ai-mode/AiPersonCard';
import ProfileReadiness from '@/components/ai-mode/ProfileReadiness';
import TyraiMark from '@/components/ai-mode/TyraiMark';
import TyraiBrief from '@/components/ai-mode/TyraiBrief';
import FeedJobCard, { FeedJobCardStyles } from '@/components/feed/FeedJobCard';
import { FEED_CARD } from '@/components/feed/cardShell';
import {
  narrow, nextQuestion, rank, refineQuery, summarise,
  type Answers, type FacetId, type Question, type ResultFacts,
} from '@/lib/ai-mode/followups';
import './ai-mode.css';

type EntityType =
  | 'person' | 'service' | 'business' | 'job' | 'gig' | 'post' | 'file' | 'feature' | 'product' | 'event';

interface ResultItem {
  id: string;
  type: EntityType;
  title: string;
  subtitle: string;
  description: string;
  image: string | null;
  location: string | null;
  matchPercent: number;
  why: string;
  url: string;
  badge?: string;
  meta?: {
    userId?: string;
    jobId?: string;
    organizationName?: string;
    employmentType?: string;
    workMode?: string;
    hiringUrgency?: string;
    headline?: string;
    openToWork?: boolean;
    skills?: string[];
  };
}

interface Understanding {
  intent?: string;
  roles: string[];
  skills: string[];
  locations: string[];
  locationConstraint: boolean;
  experience?: string | null;
  entityTypes?: string[];
}

interface Payload {
  results: ResultItem[];
  understanding: Understanding;
  relaxed: boolean;
  total: number;
  tookMs: number;
}

/* The measuring effect must run before the browser paints, or the field is
   seen at its fallback position for one frame and then jumps. */
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const TYPE_LABEL: Record<EntityType, string> = {
  person: 'Person', service: 'Service', business: 'Business', job: 'Job',
  gig: 'Gig', post: 'Post', file: 'File', feature: 'Feature',
  product: 'Product', event: 'Event',
};

/** Enough of a prompt to be useful, short enough not to be a form. */
const EXAMPLES = [
  'A React developer in Bengaluru who has shipped design systems',
  'Someone to write case studies for a fintech product',
  'Remote backend roles using Go and Postgres',
];

export default function AiMode({
  open,
  onClose,
  /**
   * What was already typed in the keyword field when TYRAI was reached for.
   *
   * Run as-is on opening rather than left sitting in the box: pressing the
   * TYRAI button with a sentence already typed is the ask, and making somebody
   * press Search again to repeat it would be asking twice.
   */
  seed = '',
}: {
  open: boolean;
  onClose: () => void;
  seed?: string;
}) {
  const [value, setValue] = useState('');
  const [asked, setAsked] = useState('');
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const runId = useRef(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  /* ── Where the middle actually is ──
     The field sits at the centre of the overlay until there is something to
     show, and it gets there on a transform so the move to the top is one
     continuous motion rather than a re-layout.
     
     The distance is MEASURED, not assumed. `50vh` is not half of this overlay
     on a phone whose address bar collapses, and being twenty pixels off centre
     is the kind of thing that reads as sloppy without anyone being able to say
     why. The observer catches the keyboard opening, a rotation and the field
     growing on a narrow screen. */
  useIsomorphicLayoutEffect(() => {
    if (!open || !mounted) return;
    const stage = stageRef.current;
    const head = headRef.current;
    if (!stage || !head) return;

    const measure = () => {
      /* Where the field has to END UP is (overlay - field) / 2. What is being
         set is how far it travels from where the flow already put it, which is
         one padding down from the top — so that padding comes off the total,
         once. Halving the padded box instead centres the field in the space
         BELOW the padding, which is a few pixels low. */
      const pad = parseFloat(getComputedStyle(stage).paddingTop) || 0;
      const gap = (stage.getBoundingClientRect().height
        - head.getBoundingClientRect().height) / 2 - pad;
      stage.style.setProperty('--aim-center', `${Math.max(0, Math.round(gap))}px`);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    observer.observe(head);
    return () => observer.disconnect();
  }, [open, mounted]);

  /* Only on the transition into being open, and only when there is something
     to carry: reopening TYRAI later must not re-run an old search, and a seed
     must never wipe out results already on screen. */
  const wasOpen = useRef(false);
  useEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    if (!opening) return;
    const text = seed.trim();
    if (text.length < 2 || text === asked) return;
    setValue(text);
    setAnswered(new Set());
    setAppends([]);
    setTypeFilter([]);
    setCheckable({});
    setTurns([]);
    void ask(text);
    /* `ask` and `asked` are read, not depended on: this fires on the opening
       edge alone, and listing them would re-run it whenever a search lands. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seed]);

  /* Focus the field on open, and give the page back its scroll on close. */
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 120);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.clearTimeout(t); document.body.style.overflow = prev; };
  }, [open]);

  /* ── One step back ──
     From an answer, back is TYRAI's own first screen: the results and the
     conversation go, the field returns to the middle. From that screen there
     is nothing left to go back through, so back leaves TYRAI altogether.
     One control, one meaning, and the same meaning as the Escape key.

     What was TYPED stays. Somebody who wrote a sentence and stepped back
     wants to change it, not write it again — and the examples reappear
     underneath it either way. */
  const goBack = useCallback(() => {
    if (!(data || busy || error)) { onClose(); return; }
    runId.current += 1;               // any search in flight lands on nothing
    setData(null);
    setBusy(false);
    setError('');
    setAsked('');
    setAnswered(new Set());
    setAppends([]);
    setTypeFilter([]);
    setCheckable({});
    setTurns([]);
    inputRef.current?.focus();
  }, [data, busy, error, onClose]);

  /* Registered only while open, so it cannot swallow the key from anything
     else on the page. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') goBack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, goBack]);

  /* The conversation so far. `answered` records which facets are settled — by
     the person answering, or by the original sentence having said so — and
     `appends` are the words those answers added to the query. */
  const [answered, setAnswered] = useState<Set<FacetId>>(new Set());
  const [appends, setAppends] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<Array<'person' | 'job' | 'post'>>([]);
  /* The answers that can be CHECKED against a result, as opposed to the ones
     that only steer ranking. See narrow() in lib/ai-mode/followups. */
  const [checkable, setCheckable] = useState<Answers>({});
  const [turns, setTurns] = useState<Array<{ q: string; a: string }>>([]);

  const ask = useCallback(async (
    raw: string,
    opts: { extra?: string[]; types?: Array<'person' | 'job' | 'post'> } = {},
  ) => {
    const base = raw.trim();
    if (base.length < 2) return;
    const q = refineQuery(base, opts.extra ?? []);
    const types = (opts.types && opts.types.length ? opts.types : ['person', 'job', 'post']).join(',');
    /* Every run gets a number; a response is only accepted if it belongs to the
       newest one. Without this, a slow first query can land after a fast second
       and overwrite the results the person is actually looking at. */
    const mine = ++runId.current;
    setBusy(true);
    setError('');
    setAsked(base);
    try {
      const res = await fetch(
        /* Scoped. Left open, the engine also answers with files, features and
           product pages — true matches, but not what "tell your requirements"
           is asking about. Three types, requested explicitly, so each one is
           searched properly rather than crowded out. */
        `/api/search?mode=intelligent&ai=1&limit=36&type=${types}&q=${encodeURIComponent(q)}`,
        { cache: 'no-store' },
      );
      const body = await res.json().catch(() => null);
      if (mine !== runId.current) return;
      if (!res.ok || !body) throw new Error('Search is unavailable right now.');
      setData(body as Payload);
    } catch (e) {
      if (mine !== runId.current) return;
      setError(e instanceof Error ? e.message : 'Search is unavailable right now.');
      setData(null);
    } finally {
      if (mine === runId.current) setBusy(false);
    }
  }, []);

  /* Follow, through the endpoint the People page and the feed already use.
     A person card that cannot be followed is a screenshot of a person card. */
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [pendingFollow, setPendingFollow] = useState<Set<string>>(new Set());
  const followInFlight = useRef<Set<string>>(new Set());

  const toggleFollow = useCallback(async (targetUserId: string) => {
    if (followInFlight.current.has(targetUserId)) return;
    followInFlight.current.add(targetUserId);
    const already = following.has(targetUserId);
    setPendingFollow((p) => new Set(p).add(targetUserId));
    setFollowing((prev) => { const n = new Set(prev); if (already) n.delete(targetUserId); else n.add(targetUserId); return n; });
    try {
      const res = await fetch('/api/profile/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId, action: already ? 'unfollow' : 'follow' }),
      });
      if (!res.ok) throw new Error('failed');
    } catch {
      setFollowing((prev) => { const n = new Set(prev); if (already) n.add(targetUserId); else n.delete(targetUserId); return n; });
    } finally {
      followInFlight.current.delete(targetUserId);
      setPendingFollow((p) => { const n = new Set(p); n.delete(targetUserId); return n; });
    }
  }, [following]);

  const phase = data || busy || error ? 'answer' : 'ask';

  /* What is actually shown: the engine's ranking, narrowed by the answers.
     Everything below — the counts, the sections, the next question's options —
     reads THIS, so the summary can never describe a different set from the one
     on screen. */
  const shown = useMemo(
    () => narrow(data?.results ?? [], checkable),
    [data, checkable],
  );

  /* What the results actually contain — the raw material every follow-up
     option is drawn from, so nothing is ever offered that leads nowhere. */
  const facts: ResultFacts = useMemo(() => {
    const rows = shown;
    return {
      locations: rank(rows.map((r) => r.location ?? '').filter(Boolean)),
      skills: rank(rows.flatMap((r) => r.meta?.skills ?? []), 6),
      counts: {
        person: rows.filter((r) => r.type === 'person').length,
        job: rows.filter((r) => r.type === 'job').length,
        post: rows.filter((r) => r.type === 'post').length,
      },
    };
  }, [shown]);

  const question: Question | null = useMemo(
    () => (data && !busy ? nextQuestion(data.understanding, facts, answered) : null),
    [data, busy, facts, answered],
  );

  /* Answering re-runs the SAME requirement with one more thing known about it,
     so the thread reads as a narrowing conversation rather than a new search
     each time. Skipping settles the facet without adding words — the question
     goes away and is not asked again. */
  const answer = useCallback((q: Question, option: { label: string; append: string; types?: Array<'person' | 'job' | 'post'> } | null) => {
    setAnswered((prev) => new Set(prev).add(q.id));
    setTurns((prev) => [...prev, { q: q.prompt, a: option?.label ?? q.skipLabel }]);
    const extra = option?.append ? [...appends, option.append] : appends;
    if (option && (q.id === 'location' || q.id === 'skill')) {
      const value = q.id === 'location' ? option.label : option.append;
      setCheckable((prev) => ({ ...prev, [q.id]: value }));
    }
    const types = option?.types ?? typeFilter;
    setAppends(extra);
    setTypeFilter(types);
    void ask(asked, { extra, types });
  }, [appends, typeFilter, asked, ask]);

  /* Split into the three things that were asked for, in a fixed order — people
     first, because "tell your requirements" is most often a request for
     someone. A section with nothing in it is not rendered rather than shown
     empty, and the counts are the real ones. */
  const sections = useMemo(() => {
    const rows = shown;
    return ([
      { key: 'person', title: 'People', items: rows.filter((r) => r.type === 'person') },
      { key: 'job', title: 'Jobs', items: rows.filter((r) => r.type === 'job') },
      { key: 'post', title: 'Posts', items: rows.filter((r) => r.type === 'post') },
    ] as const).filter((sec) => sec.items.length > 0);
  }, [shown]);

  /* The skills the QUERY asked for, for the cards to light up on a person who
     has them. Taken from the engine's reading of the sentence — including the
     terms it expanded to — so a lit chip is one the ranking actually scored. */
  const wanted = useMemo(() => {
    const u = data?.understanding;
    return new Set([...(u?.skills ?? []), ...(u?.roles ?? [])].map((x) => x.toLowerCase()));
  }, [data]);

  const chips = useMemo(() => {
    if (!data) return [];
    const u = data.understanding;
    return [
      ...u.roles.slice(0, 2).map((r) => ({ k: `r-${r}`, label: r })),
      ...u.skills.slice(0, 3).map((s) => ({ k: `s-${s}`, label: s })),
      ...u.locations.slice(0, 1).map((l) => ({ k: `l-${l}`, label: l })),
    ];
    /* These describe how the QUERY was read, not what survived narrowing, so
       they follow `data` rather than `shown`. */
  }, [data]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="aim-root" role="dialog" aria-modal="true" aria-label="TYRAI">
      {/* Once, for the job cards rendered below. */}
      <FeedJobCardStyles />
      {/* The corner controls. Fixed rather than in the flow, so they do not
          move when the stage shifts from centred to top-aligned. */}
      {/* Back, on the left, where back goes. What it goes back TO depends on
          where you are, which is what the label says out loud. */}
      <button
        type="button"
        onClick={goBack}
        aria-label={phase === 'answer' ? 'Back to TYRAI' : 'Leave TYRAI'}
        className="aim-back"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
        <span className="aim-back-t">Back</span>
      </button>

      <div className="aim-corner">
        {/* Your own standing in the thing you are watching run. */}
        <ProfileReadiness open={open} />
      </div>

      <div className="aim-stage" data-phase={phase} ref={stageRef}>
        <div className="aim-head" ref={headRef}>
          {/* Absolutely placed, all of it, so the HEAD is exactly the field:
              centring the head centres the field itself rather than the block
              of text around it, and nothing above it shifts the field as it
              goes. The brief joins the title inside one bottom-anchored group,
              anchored at the BOTTOM so collapsing the brief closes the space
              ABOVE the title instead of moving the title away from the field
              it belongs to. */}
          <div className="aim-crown">
            {phase === 'ask' && <TyraiBrief open={open} />}
            <div className="aim-title">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.05] px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/70">
              <TyraiMark className="h-3.5 w-3.5" /> TYRAI
            </span>
            <h1 className="mt-4 text-[26px] font-semibold tracking-[-0.02em] text-white sm:text-[32px]">
              Tell Your Requirements
            </h1>
            <p className="mx-auto mt-2 max-w-[440px] text-[13px] leading-relaxed text-white/55">
              Describe what you need in a sentence. You get the closest matches
              across people, businesses, jobs and work — with why each one fits.
            </p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              /* A new sentence is a new requirement: the previous answers were
                 about the previous one and would silently skew this. */
              setAnswered(new Set());
              setAppends([]);
              setTypeFilter([]);
              setCheckable({});
              setTurns([]);
              ask(value);
            }}
            className="aim-field"
          >
            {/* The magnifier IS the submit control now, at the end of the
                field rather than decorating the start of it. One glyph doing
                one job: it used to sit on the left saying "this is a search
                box" while a separate labelled button did the searching, which
                is two controls' worth of width for one action. The whole gain
                goes to the input.

                It keeps a real label for anyone not looking at it — an icon
                button with no accessible name is an unnamed button. */}
            <input
              ref={inputRef}
              className="aim-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Tell Your Requirements"
              aria-label="Tell your requirements"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
            />
            <button
              type="submit"
              className="aim-go"
              disabled={busy || value.trim().length < 2}
              aria-label={busy ? 'Searching' : 'Search'}
            >
              <Search className="h-4 w-4 shrink-0" aria-hidden />
            </button>
          </form>

          {/* Everything under the field, in one out-of-flow column.
              One block rather than two absolutely-placed layers at two guessed
              offsets: the examples wrap to two rows on a laptop and three on a
              narrow window, and a brief pinned 92px under the field lands on
              top of them the moment they do. */}
          <div className="aim-below">
            {/* Examples, only before the first search — afterwards they would be
                three more things competing with the answer. Kept mounted and
                faded out rather than unmounted, so they fade with the move
                instead of blinking out of existence at the start of it. */}
            <div className="aim-examples" aria-hidden={phase === 'answer'}>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  tabIndex={phase === 'answer' ? -1 : 0}
                  onClick={() => { setValue(ex); setAnswered(new Set()); setAppends([]); setTypeFilter([]); setCheckable({}); setTurns([]); ask(ex); }}
                  className="rounded-full border border-white/[0.09] bg-white/[0.035] px-3 py-1.5 text-[11.5px] text-white/60 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white/90"
                >
                  {ex}
                </button>
              ))}
            </div>

          </div>

          {/* What the engine understood. Shown because a result set that has
              been narrowed by a location the person only implied is otherwise
              inexplicable. */}
          {phase === 'answer' && chips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-white/55">Reading this as</span>
              {chips.map((c) => (
                <span key={c.k} className="rounded-full border border-white/[0.10] bg-white/[0.05] px-2 py-0.5 text-[11px] text-white/72">
                  {c.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {phase === 'answer' && (
          <div className="aim-results">
            {busy && (
              <div className="aim-grid" aria-hidden>
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="aim-skel" />)}
              </div>
            )}

            {!busy && error && (
              <p className="py-16 text-center text-[13px] text-white/60">{error}</p>
            )}

            {!busy && !error && data && shown.length === 0 && (
              <div className="py-16 text-center">
                <p className="text-[14px] font-semibold text-white/80">Nothing matched that yet</p>
                <p className="mx-auto mt-1.5 max-w-[380px] text-[12.5px] leading-relaxed text-white/50">
                  Try describing the outcome rather than the job title — “someone
                  to rebuild our onboarding” finds more than “developer”.
                </p>
              </div>
            )}

            {!busy && !error && data && shown.length > 0 && (
              <>
                {/* ── The answer, then how it was reached ──
                    The count leads. What was asked and answered follows it as
                    a quiet row, because it is a record of the conversation
                    rather than a thing to read: repeating each question in
                    full above the result pushed the only sentence that matters
                    down the screen, and on a phone off it. */}
                {/* One block, so whatever follows it — a question, or the
                    first section of results — is the same distance away. */}
                <div className="aim-lede">
                  <p className="aim-sum">{summarise(facts.counts, shown.length)}</p>
                  <p className="aim-meta">
                    for “{asked}”
                    {data.relaxed && <span> · closest available</span>}
                    {typeof data.tookMs === 'number' && <span> · {data.tookMs} ms</span>}
                  </p>

                  {turns.length > 0 && (
                    <div className="aim-turns">
                      <span className="aim-turns-l">Narrowed by</span>
                      {turns.map((t, i) => (
                        /* The question is the chip's title rather than its
                           neighbour: "Senior" is the answer, and the wording of
                           what was asked is only needed if somebody wonders. */
                        <span key={i} className="aim-turn" title={t.q}>{t.a}</span>
                      ))}
                    </div>
                  )}
                </div>

                {question && (
                  <div className="aim-ask mb-5">
                    <p className="text-[13px] leading-relaxed text-white/88">{question.prompt}</p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {question.options.map((o) => (
                        <button
                          key={o.label}
                          type="button"
                          onClick={() => answer(question, o)}
                          className="rounded-full border border-white/[0.14] bg-white/[0.07] px-3 py-1.5 text-[12px] font-medium text-white/88 transition hover:border-white/30 hover:bg-white/[0.13] hover:text-white active:scale-[0.97]"
                        >
                          {o.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => answer(question, null)}
                        className="rounded-full px-3 py-1.5 text-[12px] text-white/55 transition hover:text-white/85"
                      >
                        {question.skipLabel}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── The platform's own cards ──
                    A person here is the same card the feed and the People strip
                    render, a job is the same card the feed renders. Reusing
                    them is not only consistency: those cards already know how
                    to follow someone, how to show an urgency, what to truncate
                    and how to behave on a phone, and a second set of cards
                    written for search would have to learn all of it again and
                    would drift the first time either changed. */}
                {sections.map((sec) => (
                  <section key={sec.key} className="mb-7 last:mb-0">
                    <h2 className="mb-2.5 flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/58">
                      {sec.title}
                      <span className="text-[11px] font-medium tracking-normal text-white/58 tabular-nums">
                        {sec.items.length}
                      </span>
                    </h2>

                    <div className={sec.key === 'person' ? 'aim-grid aim-grid-wide' : 'aim-grid'}>
                      {sec.items.map((r, i) => {
                        const delay = { animationDelay: `${Math.min(i, 8) * 26}ms` };

                        if (sec.key === 'person') {
                          const userId = r.meta?.userId ?? r.id.replace(/^person-/, '');
                          return (
                            <div key={r.id} className="aim-in" style={delay}>
                              <AiPersonCard
                                person={{
                                  userId,
                                  name: r.title,
                                  avatar: r.image,
                                  headline: r.meta?.headline || r.subtitle || '',
                                  bio: r.description || '',
                                  location: r.location,
                                  skills: r.meta?.skills ?? [],
                                  openToWork: !!r.meta?.openToWork,
                                }}
                                matchPercent={r.matchPercent}
                                /* The ranking's own sentence, not a reason
                                   this file made up to go with the number. */
                                why={r.why}
                                url={r.url}
                                highlight={wanted}
                                following={following.has(userId)}
                                pending={pendingFollow.has(userId)}
                                onToggle={toggleFollow}
                              />
                            </div>
                          );
                        }

                        if (sec.key === 'job') {
                          return (
                            <div key={r.id} className="aim-in" style={delay}>
                              <FeedJobCard
                                job={{
                                  id: r.meta?.jobId ?? r.id.replace(/^job-/, ''),
                                  title: r.title,
                                  organizationName: r.meta?.organizationName,
                                  location: r.location ?? undefined,
                                  employmentType: r.meta?.employmentType,
                                  workMode: r.meta?.workMode,
                                  hiringUrgency: r.meta?.hiringUrgency,
                                }}
                              />
                            </div>
                          );
                        }

                        /* A post. The same card shell every feed in the product
                           uses, so it sits in the same material — but only the
                           fields search actually returns. A post card faked up
                           with an author and a like count the search never sent
                           would be a card that lies. */
                        return (
                          <a key={r.id} href={r.url} className={`aim-in ${FEED_CARD} !p-4`} style={delay}>
                            <span className="flex items-center gap-2">
                              <span className="rounded-full border border-white/[0.10] bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/62">
                                Post
                              </span>
                              <span className="ml-auto shrink-0 text-[11px] font-bold tabular-nums text-white/72">
                                {r.matchPercent}%
                              </span>
                            </span>
                            <span className="mt-2.5 block text-[14px] font-semibold leading-snug tracking-[-0.01em] text-white/92 line-clamp-2">
                              {r.title}
                            </span>
                            {r.description && (
                              <span className="mt-1.5 block text-[12px] leading-relaxed text-white/58 line-clamp-2">
                                {r.description}
                              </span>
                            )}
                            {r.why && (
                              <span className="mt-2.5 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-white/62">
                                <Sparkles className="mt-[2px] h-3 w-3 shrink-0 opacity-70" aria-hidden />
                                <span className="line-clamp-2">{r.why}</span>
                              </span>
                            )}
                          </a>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
