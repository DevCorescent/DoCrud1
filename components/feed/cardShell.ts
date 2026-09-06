/**
 * The feed card shell — ONE definition, for every feed in the product.
 *
 * The published page, the homepage and a profile's published tab all render the
 * same kind of thing: something a person posted. They had three different
 * treatments of it, and "make the homepage look like the published page" is the
 * kind of request that keeps recurring until the styling has a single home.
 * This is that home.
 *
 * ═══ WHAT IT IS ═══
 *
 * Glass rather than a flat panel: a translucent surface over the page's ambient
 * glows, a hairline border, and a lift on hover.
 *
 * ═══ WHY IT CHANGES SHAPE ON A PHONE ═══
 *
 * Below `sm` the card spans the screen — no side borders, no corner radius —
 * so the media inside it can run bezel to bezel. A rounded edge a pixel from
 * the bezel reads as a rendering mistake rather than as a card, and an inset
 * photo on a 390px screen wastes the only dimension a phone is short of. Top
 * and bottom rules still separate one post from the next.
 *
 * From `sm` up there is room for the card to float, so it does.
 *
 * ═══ A NOTE ON SPACING ═══
 *
 * These cards must be laid out in a `space-y-*` stack, never a `divide-y` list.
 * `divide-y` sets its children flush against each other, so a gap set on an
 * ancestor measures zero and bounded cards touch — which is exactly what
 * happened when the feeds kept the divider wrappers they had used for bare
 * rows. A divider is redundant once each item has an edge of its own.
 */

export const FEED_CARD = [
  /* No `backdrop-blur` here on purpose. A backdrop filter makes the compositor
     re-sample everything behind the element on every frame it moves, and a feed
     is a column of these elements that moves constantly — with ~30 cards on
     screen it cost 11ms at the 95th percentile of scroll frames. The glass
     reading comes from the translucent surface, the hairline and the shadow,
     all of which are free; the blur was sampling a nearly flat backdrop. */
  'group relative overflow-hidden bg-white/[0.045] transition duration-200',
  /* Phone: full-bleed, separated by rules. */
  'border-y border-white/[0.07] px-3.5 py-3.5',
  /* `sm` and up: a floating card. */
  'sm:rounded-[18px] sm:border sm:p-4 sm:shadow-[0_1px_2px_rgba(0,0,0,0.28)]',
  'hover:border-white/[0.13] hover:bg-white/[0.05] sm:hover:shadow-[0_10px_34px_rgba(0,0,0,0.34)]',
].join(' ');

/**
 * The media wrapper.
 *
 * `-mx-3.5` cancels the card's phone padding EXACTLY, so an image reaches both
 * bezels; from `sm` the card floats and the media sits inside it, rounded.
 * Keep the two in step: change the card's phone padding and this must follow.
 */
export const FEED_CARD_MEDIA =
  /* Nothing here bounds the picture's height. A card is as tall as what is in
     it, so a photo is shown at its own proportions at the card's width and the
     card grows to match — which is why the grid is a masonry and not rows. */
  '-mx-3.5 overflow-hidden border-y border-white/[0.06] sm:mx-0 sm:rounded-[13px] sm:border';

/** The vertical rhythm between cards. A stack, never a divided list. */
export const FEED_STACK = 'space-y-5 sm:space-y-6';
