'use client';

/**
 * The desktop feed layout.
 *
 * ═══ WHAT IT DOES ═══
 *
 * Below `lg` it is not a grid at all: it renders its children in exactly the
 * stack they were already in, with the class name it is handed. A phone gets
 * the single full-bleed column it already had, untouched.
 *
 * From `lg` up the same cards are laid into as many columns as the container
 * can hold, each ONE AS TALL AS WHAT IS IN IT — a post with a photo is as tall
 * as that photo, a one-line note is one line tall — and each tucked directly
 * under the shortest column so far.
 *
 * ═══ WHY THE PLACEMENT IS COMPUTED HERE ═══
 *
 * Left to CSS grid's own auto-placement this would be close, but not exact:
 * the placement cursor only ever moves forward, so a card can sail past a gap
 * it would have fitted into. Every card's column and row is therefore worked
 * out here — shortest column wins, in reading order — and written as explicit
 * grid coordinates. Nothing is left to be guessed, so nothing is left over.
 *
 * ═══ FULL-WIDTH BANDS, AND WHERE THEY LAND ═══
 *
 * A child marked `data-feed-span="full"` runs the whole width, which forces a
 * clean break: every column has to reach the band's top edge, so a column that
 * is running short leaves a hole above it.
 *
 * So a band WAITS. When one comes up, cards keep being placed until the
 * columns are within LEVEL_TOLERANCE of each other — level enough that the
 * break reads as deliberate — or until MAX_DEFER cards have gone by, whichever
 * comes first. Then the band is laid across and every column restarts beneath
 * it. Posts keep their order relative to each other; only the module slides a
 * little, and it was never at an exact position to begin with.
 *
 * ═══ MEASURE, THEN PLACE ═══
 *
 * Heights come from the DOM, so the first render is a plain grid — ordinary
 * equal columns, every card its own height — which is exactly the state that
 * measures correctly at the right width. Measuring and switching to computed
 * placement both happen in a layout effect, before the browser paints, so that
 * first state is never seen. A ResizeObserver on each card repeats it when a
 * photo finishes loading or a comment panel opens.
 */

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

/** Gutter, both axes. Matches the stack's `sm:space-y-6`. */
const GAP = 24;

/**
 * The narrowest a card may become before it stops working.
 *
 * A feed card carries an avatar row, a title, body text and a row of actions.
 * 380px is a little wider than a phone, which is the width these cards were
 * designed against — below it the action row starts to crowd.
 */
const MIN_COL = 380;

/**
 * Three columns, and no more, however wide the monitor.
 *
 * A fourth column on a 27" display fills more pixels but makes the feed read as
 * a search-results wall rather than as something people posted.
 */
const MAX_COLS = 3;

/** Desktop only, matching the `lg:` breakpoint the rest of the page uses. */
const DESKTOP_QUERY = '(min-width: 1024px)';

/** How level the columns must be before a full-width band may cut across. */
const LEVEL_TOLERANCE = 120;

/** …and how many cards a band will wait through before going in regardless. */
const MAX_DEFER = 8;

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

type Cell = { child: ReactNode; index: number; band: boolean };
type Placement = { column: number; span: number; top: number; height: number };

/**
 * Shortest column first, in reading order, with bands held back until the
 * columns are level. Pure, and driven entirely by the measured heights.
 */
function place(cells: Cell[], heights: number[], cols: number): Placement[] {
  const bottoms = new Array<number>(cols).fill(0);
  const out: Placement[] = [];
  const waiting: Cell[] = [];
  let deferred = 0;

  const spread = () => Math.max(...bottoms) - Math.min(...bottoms);

  const layBand = (cell: Cell) => {
    const top = Math.max(...bottoms);
    const height = Math.max(1, heights[cell.index] || 1);
    out[cell.index] = { column: 0, span: cols, top, height };
    bottoms.fill(top + height + GAP);
    deferred = 0;
  };

  for (const cell of cells) {
    if (cell.band) { waiting.push(cell); continue; }

    const column = bottoms.indexOf(Math.min(...bottoms));
    const height = Math.max(1, heights[cell.index] || 1);
    out[cell.index] = { column, span: 1, top: bottoms[column], height };
    bottoms[column] += height + GAP;

    if (waiting.length) {
      deferred += 1;
      if (spread() <= LEVEL_TOLERANCE || deferred >= MAX_DEFER) {
        while (waiting.length) layBand(waiting.shift()!);
      }
    }
  }
  /* Anything still held: the feed ran out before the columns levelled. */
  while (waiting.length) layBand(waiting.shift()!);
  return out;
}

export default function FeedBento({
  children,
  /** The classes to use below `lg`, where this renders a plain stack. */
  stackClassName = '',
}: {
  children: ReactNode;
  stackClassName?: string;
}) {
  const items = Children.toArray(children);
  const cells: Cell[] = items.map((child, index) => ({
    child,
    index,
    band: isValidElement(child)
      && (child.props as Record<string, unknown>)['data-feed-span'] === 'full',
  }));

  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  itemRefs.current.length = items.length;
  /* Read inside the measuring callback, which must not be rebuilt on every
     render or the ResizeObserver below would be torn down and re-attached. */
  const cellsRef = useRef(cells);
  cellsRef.current = cells;

  /* 1 means "not a grid" — the stack, unchanged. */
  const [cols, setCols] = useState(1);
  const [placed, setPlaced] = useState<Placement[] | null>(null);

  /* ── How many columns fit ──
     Measured from the CONTAINER, not the viewport: this feed sits inside a
     padded frame, so viewport breakpoints would be guessing at the width that
     actually matters. */
  useIsomorphicLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const media = window.matchMedia(DESKTOP_QUERY);
    const recount = () => {
      const width = el.getBoundingClientRect().width;
      const fits = Math.floor((width + GAP) / (MIN_COL + GAP));
      const next = media.matches ? Math.min(MAX_COLS, Math.max(1, fits)) : 1;
      setCols((current) => (current === next ? current : next));
    };

    recount();
    const observer = new ResizeObserver(recount);
    observer.observe(el);
    media.addEventListener('change', recount);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', recount);
    };
  }, []);

  const remeasure = useCallback((columns: number) => {
    const heights = itemRefs.current.map((el) =>
      el ? Math.ceil(el.getBoundingClientRect().height) : 0);
    /* A zero means something has not been laid out yet; placing on that would
       stack cards on top of each other. Wait for the next observation. */
    if (heights.length === 0 || heights.some((h) => h === 0)) return;
    const next = place(cellsRef.current, heights, columns);
    setPlaced((prev) => {
      /* Bail out when nothing moved, or the ResizeObserver re-enters itself. */
      if (prev && prev.length === next.length && prev.every((p, i) =>
        p && next[i] && p.column === next[i].column && p.span === next[i].span
        && p.top === next[i].top && p.height === next[i].height)) return prev;
      return next;
    });
  }, []);

  /* Before paint, so the un-placed grid is never shown. */
  useIsomorphicLayoutEffect(() => {
    if (cols < 2) { setPlaced((p) => (p === null ? p : null)); return; }
    remeasure(cols);
  }, [cols, items.length, remeasure]);

  /* After paint: photos, embeds and comment panels all change height late. */
  useEffect(() => {
    if (cols < 2) return;
    const observer = new ResizeObserver(() => remeasure(cols));
    for (const el of itemRefs.current) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [cols, items.length, remeasure]);

  if (cols < 2) {
    return <div ref={containerRef} className={stackClassName}>{items}</div>;
  }

  /* Un-placed: a plain equal-column grid. It exists for one layout pass, to be
     measured in, and it is what the server renders. */
  const base: CSSProperties = placed
    ? {
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        columnGap: GAP,
        /* The vertical gutter is carried in each card's own row span, so this
           stays 0 and a card is never stretched to fill a taller row. */
        rowGap: 0,
        gridAutoRows: '1px',
        alignItems: 'start',
      }
    : {
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: GAP,
        alignItems: 'start',
      };

  return (
    <div ref={containerRef} data-feed-bento="" className="w-full" style={base}>
      {cells.map(({ child, index }) => {
        const p = placed?.[index];
        return (
          <div
            /* The child's OWN key, not the index. Sorting the feed or
               refreshing it reorders these; keying by position would remount
               every card below the first change and restart its animation. */
            key={(child as { key?: string | null }).key ?? index}
            ref={(el) => { itemRefs.current[index] = el; }}
            style={p
              ? {
                  gridColumn: `${p.column + 1} / span ${p.span}`,
                  gridRow: `${p.top + 1} / span ${Math.max(1, p.height)}`,
                  minWidth: 0,
                }
              : { minWidth: 0 }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
