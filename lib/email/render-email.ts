/**
 * THE canonical email rendering pipeline.
 *
 * Every surface that shows, tests or sends an email goes through this module:
 * Compose, Drafts, Templates, Campaigns and System Emails, for preview, test
 * send and production send alike. That is the entire point of it.
 *
 * Before this existed the codebase had four rendering paths — a server preview
 * route, two different client-side `{{variable}}` substitutions written inline
 * in React components, and the system-email resolver — plus a fifth variable
 * implementation in the recipient engine. Four of the five agreed by accident.
 * An admin could approve one thing in a preview and mail another.
 *
 *   sanitize → validate variables → resolve variables → chrome → plain text
 *
 * ORDER IS LOAD-BEARING:
 *
 * 1. Sanitizing FIRST means the security boundary sees the author's markup.
 * 2. Resolving SECOND, with HTML-escaped values, means a substituted value can
 *    never introduce markup. A recipient's own display name is attacker-
 *    controlled data; the previous per-recipient renderer interpolated it raw,
 *    so a user named `<img onerror=...>` wrote markup into everyone's email.
 * 3. Plain text is derived from the FINAL html, so the two alternatives of the
 *    same message can never describe different content.
 */
import { sanitizeEmailHtml } from '@/lib/security/email-html-sanitizer';
import { emailHtmlToText } from '@/lib/email/html-to-text';
import { buildEmailChrome } from '@/lib/server/email-chrome';

/** The one pattern. `{{name}}`, tolerant of inner whitespace. */
export const EMAIL_VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function freshPattern() {
  return new RegExp(EMAIL_VARIABLE_PATTERN.source, 'g');
}

/** Every variable the content references, in order of first appearance. */
export function extractEmailVariables(content: string | null | undefined): string[] {
  const found: string[] = [];
  if (!content) return found;
  const re = freshPattern();
  /* exec-loop rather than matchAll: the project's compile target does not
     allow iterating the matchAll result. */
  let m: RegExpExecArray | null = re.exec(content);
  while (m !== null) {
    if (!found.includes(m[1])) found.push(m[1]);
    m = re.exec(content);
  }
  return found;
}

/**
 * Variables the content uses that its contract does not offer.
 *
 * A non-empty result must block publishing and test sending. The alternative
 * is a literal `{{city}}` arriving in someone's inbox.
 */
export function unsupportedEmailVariables(
  content: string | null | undefined, supported: readonly string[],
): string[] {
  return extractEmailVariables(content).filter((v) => !supported.includes(v));
}

/**
 * Supported variables the content uses for which no value was supplied.
 *
 * Distinct from unsupported: the contract allows it, but this particular
 * render has nothing to put there. Worth showing an admin; not fatal, because
 * an empty optional field (a user with no company) is legitimate.
 */
export function missingEmailVariables(
  content: string | null | undefined,
  supported: readonly string[],
  values: Record<string, string>,
): string[] {
  return extractEmailVariables(content).filter(
    (v) => supported.includes(v) && !Object.prototype.hasOwnProperty.call(values, v),
  );
}

/**
 * Escape a substituted value for HTML.
 *
 * Quotes included, because a variable is allowed to sit inside an attribute
 * (`<a href="{{link}}">`) where escaping only `<` and `>` would still let a
 * value break out of the attribute.
 */
export function escapeVariableValue(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Substitute values into content.
 *
 * An unresolved placeholder is left INTACT rather than blanked, so it stays
 * visible to whoever is looking at it instead of silently becoming an empty
 * space that nobody notices until it has been mailed.
 */
export function resolveEmailVariables(
  content: string, values: Record<string, string>, opts: { escape?: boolean } = {},
): string {
  const escape = opts.escape !== false;
  return String(content ?? '').replace(freshPattern(), (whole, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) return whole;
    const value = values[name] ?? '';
    return escape ? escapeVariableValue(value) : value;
  });
}

export interface RenderEmailInput {
  subject: string;
  html: string;
  /** The variable contract for THIS email. Never a global list. */
  supported: readonly string[];
  /** Values to substitute. Sample data for a preview, real data for a send. */
  values?: Record<string, string>;
  preheader?: string;
  /** Required when `wrapInChrome` is set — the chrome links back to the app. */
  origin?: string;
  /**
   * Wrap in the branded frame that `sendTrackedMail` applies.
   *
   * Preview sets this so an admin sees the real message rather than a bare
   * fragment that looks nothing like what arrives.
   */
  wrapInChrome?: boolean;
}

export interface RenderedEmail {
  /** Resolved. Plain text — never HTML-escaped, it is a header. */
  subject: string;
  /** Sanitized and resolved, without the frame. */
  bodyHtml: string;
  /** What is actually sent: `bodyHtml`, framed if requested. */
  html: string;
  /** Derived from `html`, so the two alternatives always agree. */
  text: string;
  used: string[];
  supported: string[];
  unsupported: string[];
  missing: string[];
  /** True when the sanitizer removed or rewrote something. */
  sanitizerChanged: boolean;
}

export function renderEmail(input: RenderEmailInput): RenderedEmail {
  const rawSubject = String(input.subject ?? '');
  const rawHtml = String(input.html ?? '');
  const supported = Array.from(input.supported);
  const values = input.values ?? {};

  /* 1. Sanitize. The security boundary sees the author's markup, before any
        value is folded in. */
  const cleanHtml = sanitizeEmailHtml(rawHtml);

  /* 2. Validate against the contract — over subject AND body, because a
        placeholder in a subject line is just as unresolvable. */
  const scope = `${rawSubject} ${cleanHtml}`;
  const used = extractEmailVariables(scope);
  const unsupported = unsupportedEmailVariables(scope, supported);
  const missing = missingEmailVariables(scope, supported, values);

  /* 3. Resolve. The subject is a header, not markup, so it is substituted
        without escaping; the body escapes every value. */
  const subject = resolveEmailVariables(rawSubject, values, { escape: false });
  const bodyHtml = resolveEmailVariables(cleanHtml, values);

  /* 4. Frame. */
  const html = input.wrapInChrome
    ? buildEmailChrome({
        origin: String(input.origin ?? ''),
        subject,
        preheader: input.preheader,
        bodyHtml,
      })
    : bodyHtml;

  /* 5. Plain text from the FINAL html. */
  return {
    subject,
    bodyHtml,
    html,
    text: emailHtmlToText(html),
    used,
    supported,
    unsupported,
    missing,
    sanitizerChanged: cleanHtml !== rawHtml,
  };
}
