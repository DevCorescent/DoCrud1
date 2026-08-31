/**
 * Search-crawler detection, defined once.
 *
 * The homepage is gated for signed-out visitors in TWO places — the middleware
 * cookie check and the server component itself — and a crawler carries no
 * cookie, so both sent every search engine to /onboarding, which robots.txt
 * disallows. The result was a search engine redirected to a page it is
 * forbidden to read, and a listing that said "No information is available for
 * this page". Verified against the live site.
 *
 * Both gates now consult this one predicate. Two copies of "what counts as a
 * crawler" would drift, and a crawler let through one gate only to be caught
 * by the other is the bug that already happened once.
 *
 * THIS IS A CRAWLABILITY HINT, NOT A SECURITY BOUNDARY, and it is safe to be
 * one: `/` is public marketing content, and the most a spoofed user-agent
 * gains is a page it could already reach by setting a guest cookie. Nothing
 * private sits behind this check — the email-verification gate and every API
 * guard are untouched and still apply.
 */

/* Search engines, plus the social and AI crawlers that fetch a page to build a
   link preview or an answer. All of them need the real page, not a redirect. */
const SEARCH_CRAWLER_RE =
  /(googlebot|google-extended|bingbot|slurp|duckduckbot|baiduspider|yandex(bot)?|applebot|sogou|exabot|facebot|facebookexternalhit|twitterbot|linkedinbot|pinterest|redditbot|whatsapp|telegrambot|discordbot|skypeuripreview|embedly|quora link preview|gptbot|oai-searchbot|chatgpt-user|perplexitybot|claudebot|anthropic-ai|ia_archiver)/i;

/** True when the user-agent belongs to a crawler that should see public pages. */
export function isSearchCrawlerUserAgent(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent) && SEARCH_CRAWLER_RE.test(userAgent as string);
}
