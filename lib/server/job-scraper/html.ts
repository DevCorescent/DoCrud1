/**
 * Dependency-free HTML mini-parser.
 *
 * DoCrud ships no general HTML parser and we must not add one. JSON-LD (the
 * primary extraction strategy) needs no parser; this small tolerant parser
 * backs (a) HTML→clean text for descriptions and (b) the CSS-selector fallback
 * used only when a page has no JobPosting JSON-LD. It supports the limited
 * selector subset the source config uses: `tag`, `.class`, `#id`, compounds
 * (`a.job-card`), descendant chains (`.list li`), and a trailing `@attr`.
 */

export interface HtmlNode {
  tag: string;                       // '' for text nodes
  attrs: Record<string, string>;
  children: HtmlNode[];
  text?: string;
  parent?: HtmlNode;
}

const VOID = new Set(['br', 'img', 'input', 'meta', 'link', 'hr', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']);
const BLOCK = new Set(['p', 'div', 'br', 'li', 'ul', 'ol', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article']);
const SKIP = new Set(['script', 'style', 'noscript', 'template', 'head']);

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, ent) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[ent] ?? m;
  });
}

function parseAttrs(tagBody: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|[^\s"'>]+))?/g;
  let m: RegExpExecArray | null;
  // Skip the tag name itself.
  const body = tagBody.replace(/^[a-zA-Z][-a-zA-Z0-9]*/, '');
  while ((m = re.exec(body)) !== null) {
    const name = m[1].toLowerCase();
    const val = m[3] ?? m[4] ?? (m[2] ? m[2].replace(/^["']|["']$/g, '') : '');
    attrs[name] = decodeEntities(val);
  }
  return attrs;
}

export function parseHtml(html: string): HtmlNode {
  const root: HtmlNode = { tag: '', attrs: {}, children: [] };
  const stack: HtmlNode[] = [root];
  const top = () => stack[stack.length - 1];

  const re = /<!--[\s\S]*?-->|<[^>]*>|[^<]+/g;
  let token: RegExpExecArray | null;
  while ((token = re.exec(html)) !== null) {
    const t = token[0];
    if (t.startsWith('<!--')) continue;
    if (t[0] !== '<') {
      top().children.push({ tag: '', attrs: {}, children: [], text: decodeEntities(t), parent: top() });
      continue;
    }
    if (t.startsWith('<!') || t.startsWith('<?')) continue; // doctype / PI
    if (t[1] === '/') {
      const name = t.slice(2).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      // Pop to the matching open tag (tolerant of missing closes).
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === name) { stack.length = i; break; }
      }
      continue;
    }
    const nameMatch = t.slice(1).match(/^[a-zA-Z][-a-zA-Z0-9]*/);
    if (!nameMatch) continue;
    const name = nameMatch[0].toLowerCase();
    const node: HtmlNode = { tag: name, attrs: parseAttrs(t.slice(1, -1)), children: [], parent: top() };
    top().children.push(node);
    const selfClose = t.endsWith('/>') || VOID.has(name);
    if (!selfClose) stack.push(node);
  }
  return root;
}

// --------------------------------------------------------------------------- //
// Text extraction
// --------------------------------------------------------------------------- //
function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function textOf(node: HtmlNode): string {
  if (node.text !== undefined) return node.text;
  if (SKIP.has(node.tag)) return '';
  let out = '';
  for (const child of node.children) {
    if (child.tag === 'li') {
      out += '\n' + collapse(textOf(child));
    } else {
      out += textOf(child);
    }
  }
  if (BLOCK.has(node.tag)) out = '\n' + out + '\n';
  return out;
}

export function htmlToText(html: string): string {
  if (!html) return '';
  if (!html.includes('<')) return collapse(html);
  const lines = textOf(parseHtml(html)).split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim());
  return lines.filter(Boolean).join('\n').trim();
}

export function htmlToList(html: string): string[] {
  if (!html || !html.includes('<')) return [];
  const items: string[] = [];
  const walk = (n: HtmlNode) => {
    for (const c of n.children) {
      if (c.tag === 'li') {
        const t = collapse(textOf(c));
        if (t) items.push(t);
      } else {
        walk(c);
      }
    }
  };
  walk(parseHtml(html));
  return items;
}

// --------------------------------------------------------------------------- //
// Minimal CSS-ish selection (limited, config-controlled selectors only)
// --------------------------------------------------------------------------- //
interface Step { tag?: string; id?: string; classes: string[] }

function parseStep(raw: string): Step {
  const step: Step = { classes: [] };
  const m = raw.match(/^[a-zA-Z][-a-zA-Z0-9]*/);
  if (m) step.tag = m[0].toLowerCase();
  for (const cm of Array.from(raw.matchAll(/\.([-_a-zA-Z0-9]+)/g))) step.classes.push(cm[1]);
  const idm = raw.match(/#([-_a-zA-Z0-9]+)/);
  if (idm) step.id = idm[1];
  return step;
}

function matches(node: HtmlNode, step: Step): boolean {
  if (node.tag === '') return false;
  if (step.tag && node.tag !== step.tag) return false;
  if (step.id && node.attrs.id !== step.id) return false;
  if (step.classes.length) {
    const cls = (node.attrs.class || '').split(/\s+/);
    if (!step.classes.every((c) => cls.includes(c))) return false;
  }
  return true;
}

function ancestorsMatch(node: HtmlNode, steps: Step[]): boolean {
  // steps: ancestor chain (excluding the final step). Walk up loosely (descendant combinator).
  let i = steps.length - 1;
  let cur = node.parent;
  while (cur && i >= 0) {
    if (matches(cur, steps[i])) i--;
    cur = cur.parent;
  }
  return i < 0;
}

export function selectAll(root: HtmlNode, selector: string): HtmlNode[] {
  const sel = selector.split('@')[0].trim();
  if (!sel) return [];
  const parts = sel.split(/\s+/).map(parseStep);
  const last = parts[parts.length - 1];
  const anc = parts.slice(0, -1);
  const out: HtmlNode[] = [];
  const walk = (n: HtmlNode) => {
    if (n.tag && matches(n, last) && (anc.length === 0 || ancestorsMatch(n, anc))) out.push(n);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}

export function selectOne(root: HtmlNode, selector: string): HtmlNode | null {
  return selectAll(root, selector)[0] ?? null;
}

/** Read text of the first match, or an attribute when the selector ends with `@attr`. */
export function selectText(root: HtmlNode, selector: string): string {
  const attr = selector.includes('@') ? selector.split('@')[1].trim() : '';
  const node = selectOne(root, selector);
  if (!node) return '';
  if (attr) return decodeEntities(node.attrs[attr] || '').trim();
  return collapse(textOf(node));
}

export function selectTexts(root: HtmlNode, selector: string): string[] {
  return selectAll(root, selector).map((n) => collapse(textOf(n))).filter(Boolean);
}
