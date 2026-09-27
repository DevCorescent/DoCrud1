/**
 * The hands: read the form, write the answers, show what was written.
 *
 * This script knows nothing. It cannot tell a first name from a salary — it
 * describes each control to Docrud and receives values back. Everything it does
 * is visible on the page.
 *
 * ═══ ONE TAB, MANY FRAMES, ONE SIDEBAR ═══
 *
 * The same file runs in every frame of the page, so on a careers site that
 * embeds its ATS in an iframe there are two live copies of it. They must not
 * both draw a sidebar, and the one that draws it must be able to see what the
 * other one filled — otherwise you get what this used to do: the embed fills
 * the form perfectly and paints its panel off-screen inside a 3000px iframe,
 * while the top frame finds nothing and announces "No form fields on this page"
 * across the form that was just filled.
 *
 * So each frame takes a ROLE, assigned by the service worker, which is the only
 * party that can see them all (see background.js):
 *
 *   HOST    Exactly one per tab, the top frame wherever possible, because only
 *           the top frame's viewport is the window. It owns the sidebar and
 *           every decision. It collects no fields of its own except as a worker.
 *
 *   WORKER  Every frame. Reads its own controls, writes its own values, and
 *           never paints anything. Its field ids are namespaced by the host
 *           with its frame number, so `3#f7` is unambiguous across the tab.
 *
 * ═══ THE THREE HARD PARTS ═══
 *
 * 1. FINDING THE LABEL. A control's question can live in a `<label for>`, a
 *    wrapping `<label>`, `aria-labelledby`, a legend, or a plain `<div>` sitting
 *    above it with no relationship to it at all. All five are tried.
 *
 * 2. WRITING A VALUE REACT BELIEVES. Assigning `input.value` updates the DOM
 *    and not React's internal state, so the field looks filled, and submits
 *    empty. The value has to go through the native setter with an `input` event
 *    after it, which is what React listens for. Most autofill bugs on modern
 *    ATS pages are this one.
 *
 * 3. ATTACHING A FILE. A file input only accepts a `File`, and only through a
 *    `DataTransfer`. The bytes come from the service worker, which is the only
 *    part of the extension allowed to fetch them.
 */

(() => {
  /* The toolbar path injects this file again on a page that already has it. */
  if (window.__docrudAutoApply) return;
  window.__docrudAutoApply = true;

  const FIELD_ATTR = 'data-docrud-fid';
  const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'password', 'search']);
  const L = globalThis.DocrudLang;
  const C = globalThis.DocrudConfidence;

  /* ── Finding the question ─────────────────────────────────────────── */

  const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

  /**
   * The text of one option — a single radio or checkbox.
   *
   * This is NOT the question. For `<label><input type=radio> Yes</label>` the
   * wrapping label is the option; the question lives in the fieldset's legend.
   * Conflating the two made every relocation and sponsorship question on the
   * internet arrive at the server labelled "Yes", which matches nothing.
   */
  function optionLabel(el) {
    const wrapping = el.closest('label');
    if (wrapping) {
      const clone = wrapping.cloneNode(true);
      clone.querySelectorAll('input, select, textarea').forEach((n) => n.remove());
      const t = text(clone);
      if (t) return t;
    }
    if (el.id) {
      const bound = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (bound) return text(bound);
    }
    return el.getAttribute('aria-label') || el.value || '';
  }

  /** The question a group of radios is asking, rather than any one option. */
  function groupQuestion(el) {
    const group = el.closest('fieldset, [role="group"], [role="radiogroup"]');
    if (group) {
      const legend = group.querySelector('legend, .label, [class*="label"], h2, h3, h4');
      const t = text(legend);
      if (t) return t;
      const aria = group.getAttribute('aria-label');
      if (aria) return aria;
    }
    const describedBy = el.getAttribute('aria-labelledby');
    if (describedBy) {
      const joined = describedBy.split(/\s+/)
        .map((id) => text(document.getElementById(id))).filter(Boolean).join(' ');
      if (joined) return joined;
    }
    return '';
  }

  function labelFor(el) {
    /* A radio or a checkbox is one answer to a question asked elsewhere. Find
       the question first; the wrapping label is the answer, not the ask. */
    const type = (el.type || '').toLowerCase();
    if (type === 'radio' || type === 'checkbox') {
      const q = groupQuestion(el);
      if (q) return q;
    }
    /* Strongest first: the page told us explicitly. */
    if (el.id) {
      const bound = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (bound) return text(bound);
    }
    const wrapping = el.closest('label');
    if (wrapping) {
      /* The control's own value is inside the label for a radio; strip it. */
      const clone = wrapping.cloneNode(true);
      clone.querySelectorAll('input, select, textarea').forEach((n) => n.remove());
      const t = text(clone);
      if (t) return t;
    }
    const describedBy = el.getAttribute('aria-labelledby');
    if (describedBy) {
      const joined = describedBy.split(/\s+/)
        .map((id) => text(document.getElementById(id))).filter(Boolean).join(' ');
      if (joined) return joined;
    }
    /* A question rendered as a heading above a group of radios. */
    const group = el.closest('fieldset, [role="group"], [role="radiogroup"]');
    if (group) {
      const legend = group.querySelector('legend, .label, [class*="label"], h2, h3, h4');
      const t = text(legend);
      if (t) return t;
    }
    /* Last resort: the nearest preceding text in the control's own container.
       Hand-rolled forms do this constantly — a div with the question, then the
       input, with nothing tying them together. */
    let node = el.parentElement;
    for (let depth = 0; node && depth < 3; depth += 1, node = node.parentElement) {
      const clone = node.cloneNode(true);
      clone.querySelectorAll('input, select, textarea, button').forEach((n) => n.remove());
      const t = text(clone);
      if (t && t.length <= 160) return t;
    }
    return '';
  }

  /* ── Describing the form ──────────────────────────────────────────── */

  function optionsFor(el) {
    if (el.tagName === 'SELECT') {
      return Array.from(el.options).map((o) => o.textContent.trim())
        .filter((t) => t && !/^select|^choose|^--/i.test(t));
    }
    if (el.type === 'radio' && el.name) {
      const group = document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`);
      return Array.from(group).map((r) => optionLabel(r) || r.value).filter(Boolean);
    }
    return undefined;
  }

  let counter = 0;
  function collectFields() {
    const controls = Array.from(document.querySelectorAll('input, select, textarea'));
    const seenRadioGroups = new Set();
    const out = [];

    for (const el of controls) {
      const type = (el.type || '').toLowerCase();
      if (SKIP_TYPES.has(type)) continue;
      if (el.disabled || el.readOnly) continue;
      /* Invisible controls are either a different step of a wizard or a honeypot
         for bots. Neither should be filled. */
      const box = el.getBoundingClientRect();
      if (type !== 'file' && box.width === 0 && box.height === 0) continue;

      /* One descriptor per radio group, not per radio. */
      if (type === 'radio') {
        if (!el.name || seenRadioGroups.has(el.name)) continue;
        seenRadioGroups.add(el.name);
      }

      const id = el.getAttribute(FIELD_ATTR) || `f${(counter += 1)}`;
      el.setAttribute(FIELD_ATTR, id);

      out.push({
        id,
        name: el.name || undefined,
        domId: el.id || undefined,
        type: type || undefined,
        autocomplete: el.getAttribute('autocomplete') || undefined,
        placeholder: el.getAttribute('placeholder') || undefined,
        ariaLabel: el.getAttribute('aria-label') || undefined,
        label: labelFor(el) || undefined,
        required: el.required || el.getAttribute('aria-required') === 'true',
        options: optionsFor(el),
        multiline: el.tagName === 'TEXTAREA',
        maxLength: el.maxLength > 0 ? el.maxLength : undefined,
      });
    }
    return out;
  }

  /** Enough of a form to be worth offering. Two fillable controls is a search
      box and a newsletter signup; five is an application. */
  function looksLikeAnApplication(fields) {
    if (fields.length < 4) return false;
    const blob = fields.map((f) => `${f.label || ''} ${f.name || ''}`).join(' ').toLowerCase();
    return /resume|cv|cover letter|first name|last name|full name|apply|application|linkedin/.test(blob);
  }

  function jobContext() {
    const meta = (p) => document.querySelector(`meta[property="${p}"], meta[name="${p}"]`)?.content?.trim();
    const title = meta('og:title') || text(document.querySelector('h1')) || document.title;
    const company = meta('og:site_name')
      || location.hostname.replace(/^(www|boards|jobs|job-boards)\./, '').split('.')[0];
    /* A trimmed slice of the page, for the model to answer "why this role" from.
       Capped hard: the description is context, not the payload. */
    const body = text(document.querySelector('main, article, [class*="content"], body')).slice(0, 4000);
    return { title, company, location: meta('og:locality') || '', description: body, url: location.href };
  }

  /* ── Writing ──────────────────────────────────────────────────────── */

  /**
   * Set a value the page's framework will believe.
   *
   * React tracks the last value it wrote on the DOM node; assigning `.value`
   * directly leaves that tracker stale, React concludes nothing changed, and the
   * state behind the field stays empty however full it looks. Going through the
   * prototype's setter and then firing `input` is what makes React re-read it.
   */
  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function byId(id) {
    return document.querySelector(`[${FIELD_ATTR}="${CSS.escape(id)}"]`);
  }

  async function attachFile(el, file) {
    const res = await chrome.runtime.sendMessage({ type: 'FETCH_RESUME', url: file.url });
    if (!res?.ok) throw new Error(res?.error || 'Could not fetch the résumé');
    const blob = new Blob([new Uint8Array(res.bytes)], { type: file.mimeType });
    const dt = new DataTransfer();
    dt.items.add(new File([blob], file.fileName, { type: file.mimeType }));
    el.files = dt.files;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const flat = (t) => (t || '').replace(/\s+/g, ' ').trim().toLowerCase();

  /**
   * A dropdown that is not a `<select>`.
   *
   * ═══ WHY THIS IS THE BIGGEST ACCURACY GAP ═══
   *
   * Ashby, the current Greenhouse UI and Workday do not use `<select>`. They
   * render an `<input role="combobox">` with a listbox that only exists in the
   * DOM while it is open — so `optionsFor` sees no options, the server sends a
   * plain text value, and writing that text into the input leaves the widget's
   * own state empty. The field looks filled and submits blank, which is the
   * exact failure this whole file is careful about everywhere else.
   *
   * These are search-as-you-type, so the fix is to behave like a person: open
   * it, type, and press the option that comes back.
   */
  function comboOf(el) {
    if (el.tagName === 'SELECT') return null;
    const role = el.getAttribute('role');
    if (role === 'combobox') return el;
    if (el.getAttribute('aria-haspopup') === 'listbox') return el;
    const owned = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
    if (owned) {
      const list = document.getElementById(owned);
      if (list && (list.getAttribute('role') === 'listbox' || list.querySelector('[role="option"]'))) return el;
    }
    /* React-Select and its many forks: the real input is inside a container
       that carries the role, and the input itself carries nothing useful. */
    const shell = el.closest('[role="combobox"], [class*="select__control"], [class*="Select-control"]');
    if (shell && el.tagName === 'INPUT') return el;
    return null;
  }

  /** The listbox this combobox is driving, if it is open. */
  function openListbox(el) {
    const owned = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
    const byOwner = owned && document.getElementById(owned);
    if (byOwner && byOwner.querySelector('[role="option"]')) return byOwner;
    /* Otherwise the nearest open listbox. Scoped to a visible one so a closed
       menu elsewhere on the page cannot be mistaken for this one's. */
    const lists = Array.from(document.querySelectorAll('[role="listbox"]'))
      .filter((l) => visible(l) && l.querySelector('[role="option"]'));
    if (lists.length === 1) return lists[0];
    const near = el.closest('[class*="select"], [role="combobox"]')?.parentElement;
    return lists.find((l) => near?.contains(l)) || lists[0] || null;
  }

  async function applyCombo(el, value) {
    const want = flat(value);
    try {
      el.focus();
      el.click();
      /* Typed rather than assigned, so the widget filters its own list. */
      setNativeValue(el, value);
      el.dispatchEvent(new KeyboardEvent('keydown', { key: value.slice(-1), bubbles: true }));
      await frame();
      await sleep(180);

      const list = openListbox(el);
      const options = list ? Array.from(list.querySelectorAll('[role="option"]')) : [];
      const hit = options.find((o) => flat(text(o)) === want)
        || options.find((o) => flat(text(o)).startsWith(want))
        || options.find((o) => want.startsWith(flat(text(o))) && flat(text(o)).length > 2)
        || (options.length === 1 ? options[0] : null);

      if (hit) {
        hit.scrollIntoView({ block: 'nearest' });
        hit.click();
        await frame();
        return true;
      }

      /* Some commit on Enter with nothing selected; others do not, and leaving
         a menu hanging open over the form is worse than an empty field. */
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await sleep(80);
      if (flat(el.value) === want) return true;
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      el.blur();
      return false;
    } catch {
      try { el.blur(); } catch { /* detached */ }
      return false;
    }
  }

  async function applyOne(el, fill) {
    const combo = comboOf(el);
    if (combo) return applyCombo(combo, fill.option || fill.value || '');
    if (el.tagName === 'SELECT') {
      /* The server picks the option from the very list this script sent it, so
         an exact match is the normal case. The normalised comparison behind it
         is for the options whose text carries stray whitespace or a non-breaking
         space — common in hand-built selects, and invisible to the eye. */
      const want = flat(fill.option || fill.value);
      const opts = Array.from(el.options);
      const match = opts.find((o) => o.textContent.trim().toLowerCase() === want)
        || opts.find((o) => flat(o.textContent) === want)
        || opts.find((o) => flat(o.value) === want);
      if (!match) return false;
      el.value = match.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    if (el.type === 'radio') {
      const want = flat(fill.option || fill.value);
      const group = document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`);
      const match = Array.from(group).find((r) => flat(optionLabel(r) || r.value) === want)
        || Array.from(group).find((r) => flat(r.value) === want);
      if (!match) return false;
      match.click();
      return true;
    }
    if (el.type === 'checkbox') {
      const on = /^(yes|true|1)$/i.test(fill.value || '');
      if (el.checked !== on) el.click();
      return true;
    }
    setNativeValue(el, fill.value ?? '');
    return true;
  }

  /**
   * Outline a field that was just filled.
   *
   * ═══ THE SEQUENCE IS FREE NOW ═══
   *
   * Filling twenty fields in one frame reads as a glitch; a few tens of
   * milliseconds apart reads as the form being filled in. That sequence used
   * to come from AWAITING a sleep between fields, which on a thirty-field
   * Workday page was a second of nothing but waiting before the last value
   * went in.
   *
   * The values now all go in at once and only the OUTLINE is scheduled. The
   * form is finished before the first mark has finished flashing, and it still
   * looks like it is being filled in.
   *
   * It has to be a timer rather than a CSS `animation-delay`, because
   * `.docrud-filled` sets `outline` with `!important` — deliberately, so a
   * careers site cannot erase the only indication of what was filled — and an
   * `!important` declaration outranks a keyframe.
   */
  const marks = new Map();

  function mark(el, review, i) {
    const n = Math.min(i ?? 0, 22);
    clearTimeout(marks.get(el));
    marks.set(el, setTimeout(() => {
      marks.delete(el);
      el.classList.add('docrud-filled', 'docrud-pop');
      el.classList.toggle('docrud-review', !!review);
      setTimeout(() => el.classList.remove('docrud-pop'), 620);
    }, n * 26));
  }

  /** Take the mark back off — the value did not survive, so saying it was
      filled would be a lie told in outline form. */
  function unmark(el) {
    clearTimeout(marks.get(el));
    marks.delete(el);
    el.classList.remove('docrud-filled', 'docrud-review', 'docrud-pop');
  }

  /* ── The employer's own submit button ──────────────────────────────────
     Found, described, and pressed only when a person presses a button in the
     sidebar that says it will. Nothing on this page is ever clicked by a
     timer, a heuristic or a successful fill. */

  function visible(el) {
    if (!el) return false;
    const box = el.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && !el.disabled;
  }

  /** The form holding the most controls we described. A page can carry a search
      form and a newsletter form as well as the application. */
  function ownerForm() {
    const counts = new Map();
    for (const el of document.querySelectorAll(`[${FIELD_ATTR}]`)) {
      const form = el.form || el.closest('form');
      if (form) counts.set(form, (counts.get(form) || 0) + 1);
    }
    let best = null; let most = 0;
    counts.forEach((n, form) => { if (n > most) { most = n; best = form; } });
    return best;
  }

  /** Buttons that look like submission and are not. Getting this wrong throws
      away a half-finished application, so the list is generous. */
  const NOT_SUBMIT = /save|draft|cancel|back|previous|clear|reset|close|sign in|log in|register|upload|browse|add another|remove/i;
  const IS_SUBMIT = /^(submit|apply|send|submit application|apply now|send application|submit your application|finish|complete)$/i;

  function findSubmit() {
    const form = ownerForm();
    if (!form) return null;

    const direct = Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"]'))
      .filter((b) => visible(b) && !NOT_SUBMIT.test(text(b) || b.value || ''));
    if (direct.length) return direct[direct.length - 1];

    const buttons = Array.from(form.querySelectorAll('button, [role="button"], input[type="button"]'))
      .filter(visible)
      .filter((b) => !NOT_SUBMIT.test(text(b) || b.value || ''));
    return buttons.find((b) => IS_SUBMIT.test((text(b) || b.value || '').trim()))
      || buttons.find((b) => /submit|apply now|send application/i.test(text(b) || b.value || ''))
      || null;
  }

  /* ── Talking to the other frames ──────────────────────────────────────
     A port rather than `postMessage`: `postMessage` would put the member's name
     and email into a message the embedding page can read, and this extension
     shows a site nothing about the person using it. A port's sender is stamped
     by the browser, so the worker can route between frames without either page
     seeing a byte of it. */

  let port = null;
  let role = null;
  let myFrameId = 0;
  let peers = [];
  let roleResolvers = [];
  let ridSeq = 0;
  const pending = new Map();

  function connect() {
    try { port = chrome.runtime.connect({ name: 'docrud-frame' }); } catch { return; }
    port.onMessage.addListener(onFrameMessage);
    port.onDisconnect.addListener(() => { port = null; });
    hello();
  }

  let lastHello = -1;
  let helloTimer = null;

  /** Coalesced: `collectFields` walks every control on the page, and this is
      wired to a MutationObserver on a React app that mutates continuously. */
  function helloSoon() {
    if (helloTimer) return;
    helloTimer = setTimeout(() => { helloTimer = null; hello(); }, 220);
  }

  function hello() {
    if (!port) return;
    const fields = collectFields();
    if (fields.length === lastHello) return;
    lastHello = fields.length;
    try {
      port.postMessage({
        k: 'hello',
        fields: fields.length,
        app: looksLikeAnApplication(fields),
        url: location.href,
      });
    } catch { /* the worker went away; it will be woken by the next message */ }
  }

  function onFrameMessage(m) {
    if (m?.k === 'role') {
      const was = role;
      role = m.role;
      myFrameId = m.frameId;
      peers = m.peers || [];
      /* Demoted. Another frame is drawing the sidebar now, and two is worse
         than none — this is the exact failure that made a filled form report
         that it had no fields. */
      if (was === 'host' && role !== 'host') {
        /* Demoted, so stop offering as well as taking the panel down. Without
           the second half the idle poll below simply painted it again 700ms
           later and the tab was back to two sidebars — which is the whole bug
           this file is being changed to fix, reintroduced by the fix. */
        stopOffering();
        closePanel();
      }
      roleResolvers.splice(0).forEach((r) => r());
      return;
    }
    if (m?.k !== 'msg') return;
    const p = m.payload;
    if (!p) return;

    /* A reply to something the host asked. */
    if (p.t === 'reply') {
      const resolve = pending.get(p.rid);
      if (resolve) { pending.delete(p.rid); resolve(p.data); }
      return;
    }
    /* A request for this frame to do something to its own DOM. */
    Promise.resolve(handleWorker(p)).then((data) => {
      if (p.rid == null || !port) return;
      try { port.postMessage({ k: 'to-host', payload: { t: 'reply', rid: p.rid, data } }); } catch { /* gone */ }
    });
  }

  /** Wait until the worker has told us what we are. Falls back on the obvious
      answer, so a page where the service worker never replies still works. */
  function whenRoleKnown(ms = 350) {
    if (role) return Promise.resolve(role);
    return new Promise((resolve) => {
      roleResolvers.push(() => resolve(role));
      setTimeout(() => {
        if (!role) { role = window.top === window ? 'host' : 'worker'; }
        resolve(role);
      }, ms);
    });
  }

  function ask(frameId, payload, timeout = 8000) {
    if (frameId === myFrameId) return Promise.resolve(handleWorker(payload));
    if (!port) return Promise.resolve(null);
    const rid = (ridSeq += 1);
    return new Promise((resolve) => {
      pending.set(rid, resolve);
      setTimeout(() => { if (pending.delete(rid)) resolve(null); }, timeout);
      try { port.postMessage({ k: 'to-frame', frameId, payload: { ...payload, rid } }); } catch { resolve(null); }
    });
  }

  /* ── What a worker frame does ─────────────────────────────────────────
     Every one of these acts only on this frame's own DOM, and none of them
     paints. The host decides; these are the hands. */

  async function handleWorker(p) {
    if (p.t === 'SCAN') {
      return { fields: collectFields(), job: jobContext(), submit: describeSubmit() };
    }
    if (p.t === 'APPLY') {
      const out = [];
      let i = 0;
      for (const fill of p.fills) {
        const el = byId(fill.id);
        if (!el) { out.push({ id: fill.id, ok: false, reason: 'the field is no longer on the page' }); continue; }
        try {
          if (fill.file) await attachFile(el, fill.file);
          else if (!await applyOne(el, fill)) {
            out.push({ id: fill.id, ok: false, reason: 'none of the options matched' });
            continue;
          }
          mark(el, fill.review, i += 1);
          out.push({ id: fill.id, ok: true });
        } catch (e) {
          out.push({ id: fill.id, ok: false, reason: e.message });
        }
      }
      /* ── Did it stick? ──
         A value can go in and come straight back out: React re-renders from
         state that never heard about it, a widget resets its input on blur, a
         validator clears a field it did not like. Reporting "filled" for a box
         that is empty by the time anybody looks is the worst thing this
         extension could do, so every write is read back and retried once. */
      /* Long enough for the last scheduled mark to have landed, so `unmark`
         below cannot be undone by a timer that has not fired yet. */
      await sleep(Math.min(out.length, 22) * 26 + 140);
      const byFill = new Map(p.fills.map((f) => [f.id, f]));
      for (const r of out) {
        if (!r.ok) continue;
        const el = byId(r.id);
        const fill = byFill.get(r.id);
        if (!el || !fill || held(el, fill)) continue;
        try {
          if (fill.file) await attachFile(el, fill.file);
          else await applyOne(el, fill);
        } catch { /* the retry is best effort */ }
        await sleep(90);
        if (!held(el, fill)) {
          r.ok = false;
          r.reason = 'the page cleared it — fill this one yourself';
          unmark(el);
        }
      }
      return out;
    }
    if (p.t === 'APPLY_ONE') {
      const el = byId(p.id);
      if (!el) return { ok: false };
      const ok = await applyOne(el, { value: p.value, option: p.isOption ? p.value : undefined });
      if (ok) mark(el, p.review);
      el.classList.remove('docrud-asking');
      return { ok };
    }
    if (p.t === 'HIGHLIGHT') {
      document.querySelectorAll('.docrud-asking').forEach((e) => e.classList.remove('docrud-asking'));
      const el = byId(p.id);
      if (!el) return { ok: false };
      if (p.asking) el.classList.add('docrud-asking');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (!p.asking) {
        el.classList.add('docrud-flash');
        setTimeout(() => el.classList.remove('docrud-flash'), 1500);
        try { el.focus({ preventScroll: true }); } catch { /* selects refuse */ }
      }
      return { ok: true };
    }
    if (p.t === 'CLEAR_ASKING') {
      document.querySelectorAll('.docrud-asking').forEach((e) => e.classList.remove('docrud-asking'));
      return { ok: true };
    }
    if (p.t === 'READ') {
      const el = byId(p.id);
      return { value: el ? (el.type === 'checkbox' ? (el.checked ? 'Yes' : 'No') : el.value) : '' };
    }
    if (p.t === 'SUBMIT') {
      const button = findSubmit();
      if (!button) return { ok: false, error: 'The submit button could not be found.' };
      button.scrollIntoView({ behavior: 'smooth', block: 'center' });
      button.click();
      return { ok: true };
    }
    return null;
  }

  /** Whether the value the server sent is actually in the control now. */
  function held(el, fill) {
    if (fill.file) return el.files && el.files.length > 0;
    if (el.type === 'checkbox') return true;
    if (el.type === 'radio') {
      return !!el.name && !!document.querySelector(
        `input[type="radio"][name="${CSS.escape(el.name)}"]:checked`);
    }
    const want = flat(fill.option || fill.value);
    const got = flat(el.tagName === 'SELECT'
      ? (el.selectedOptions[0]?.textContent || el.value)
      : el.value);
    if (!got) return false;
    /* Not equality: a combobox frequently renders the chosen option with extra
       text around it ("India (IN)"), and a date input reformats what it was
       given. Non-empty and related is the honest test. */
    return got === want || got.includes(want) || want.includes(got);
  }

  function describeSubmit() {
    const button = findSubmit();
    if (!button) return null;
    return { label: (text(button) || button.value || 'Submit').slice(0, 40) };
  }

  /* ── The panel ────────────────────────────────────────────────────── */

  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /**
   * The sidebar's host, and its shadow root.
   *
   * The host carries its geometry as INLINE `!important` styles — the only
   * declaration a page cannot outrank — and everything else lives inside the
   * shadow, where the employer's stylesheet has no reach at all. Styled through
   * the page's cascade this panel was at the mercy of any site with an
   * `!important` on a structural property, and on some of them it rendered as a
   * long pill instead of a sidebar.
   */
  let shadow = null;

  function panel() {
    if (shadow) return shadow;
    const host = document.createElement('div');
    host.id = 'docrud-host';
    /* Every property a page could use to reshape this. Inline `!important` is
       the only declaration a stylesheet cannot outrank, and the list is
       exhaustive rather than minimal on purpose: the page that broke this was
       setting `border-radius: 999px !important` on every div, which reached the
       host and turned the sidebar into a pill. Anything left unpinned is
       something a future site gets to decide for us. */
    const fixed = {
      position: 'fixed', top: '0px', right: '0px', bottom: '0px', left: 'auto',
      width: '392px', 'max-width': '94vw', height: 'auto',
      'min-width': '0', 'min-height': '0', 'max-height': 'none',
      margin: '0', padding: '0', border: '0', 'border-radius': '0',
      transform: 'none', rotate: 'none', scale: 'none', opacity: '1',
      'z-index': '2147483000', 'pointer-events': 'auto', display: 'block',
      overflow: 'visible', visibility: 'visible', float: 'none', clear: 'none',
      background: 'transparent', 'box-shadow': 'none', filter: 'none',
      'clip-path': 'none', mask: 'none', 'mix-blend-mode': 'normal',
      'font-size': '16px', 'line-height': 'normal', 'text-align': 'left',
      'writing-mode': 'horizontal-tb', direction: 'ltr', 'box-sizing': 'border-box',
      contain: 'none', isolation: 'auto', zoom: '1',
    };
    for (const [k, v] of Object.entries(fixed)) host.style.setProperty(k, v, 'important');
    document.documentElement.appendChild(host);

    shadow = host.attachShadow({ mode: 'open' });
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = chrome.runtime.getURL('panel.css');
    shadow.appendChild(css);

    const box = document.createElement('div');
    box.className = 'docrud-panel';
    shadow.appendChild(box);
    return shadow;
  }

  function closePanel() {
    document.getElementById('docrud-host')?.remove();
    shadow = null;
  }

  function head(sub, opts = {}) {
    const langs = L.LANGUAGES.map(([code, name]) =>
      `<option value="${esc(code)}"${code === L.lang() ? ' selected' : ''}>${esc(name)}</option>`).join('');
    return '<div class="docrud-head">'
      + (opts.back ? '<button class="docrud-back" data-back aria-label="Back">‹</button>' : '<span class="docrud-spark"></span>')
      + '<span class="docrud-brand">Docrud</span>'
      + `<span class="docrud-sub-brand">${esc(sub)}</span>`
      + `<select class="docrud-lang" data-lang aria-label="${esc(L.t('langLabel'))}">${langs}</select>`
      + '<button class="docrud-x" data-close aria-label="Close">×</button>'
      + '</div>';
  }

  function paint(html) {
    const root = panel();
    const p = root.querySelector('.docrud-panel');
    p.innerHTML = html;
    p.querySelector('[data-close]')?.addEventListener('click', closePanel);
    p.querySelector('[data-lang]')?.addEventListener('change', (e) => {
      L.setLang(e.target.value);
      chrome.storage?.sync?.set({ docrudLang: L.lang() });
      rerender();
    });
    p.querySelectorAll('[data-goto]').forEach((b) => {
      b.addEventListener('click', (e) => {
        if (e.target.closest('[data-edit], [data-ack]')) return;
        const [frameId, local] = splitId(b.getAttribute('data-goto'));
        ask(frameId, { t: 'HIGHLIGHT', id: local, asking: false });
      });
    });
    return p;
  }

  /* ── The loader ────────────────────────────────────────────────────
     Named stages, not a spinner. The work genuinely has four phases and each
     one can be slow for a different reason — a big form, a slow network, a
     model writing three paragraphs — so saying which one is running is the
     difference between "wait" and "here is what is happening". */
  const STEPS = [['scan', 'stepScan'], ['map', 'stepMap'], ['write', 'stepWrite'], ['fill', 'stepFill']];
  let stepState = {};
  const stepNotes = {};

  function showSteps(current) {
    const rows = STEPS.map(([key, label]) => {
      const st = stepState[key] ?? (key === current ? 'doing' : 'todo');
      const note = stepNotes[key] ? `<span class="docrud-step-n">${esc(stepNotes[key])}</span>` : '';
      return `<div class="docrud-step" data-state="${st}"><span class="docrud-bullet"></span>`
        + `<span>${esc(L.t(label))}</span>${note}</div>`;
    }).join('');
    paint(head(L.t('filling'))
      + `<div class="docrud-body"><div class="docrud-steps">${rows}</div></div>`
      + `<div class="docrud-foot">${esc(L.t('nothingSubmitted'))}</div>`);
  }

  function step(key, note) {
    for (const [k] of STEPS) {
      if (k === key) { stepState[k] = 'doing'; break; }
      stepState[k] = 'done';
    }
    if (note) stepNotes[key] = note;
    showSteps(key);
  }

  /* ── What the host knows ──────────────────────────────────────────────
     One object, rebuilt only by the host, holding the whole form as it stands
     right now. Everything the sidebar shows is derived from this, which is
     what makes the confidence score move the moment anything changes rather
     than being a verdict delivered once. */

  const state = {
    view: 'idle',
    fields: new Map(),   // id → descriptor, ids namespaced "<frame>#<local>"
    fills: new Map(),    // id → { value, option, key, confidence, reason, review, acknowledged, file, label }
    questions: [],
    missing: [],
    counts: {},
    job: {},
    submit: null,        // { frameId, label }
    editing: null,
    lastScore: 0,
    error: '',
  };

  const splitId = (id) => {
    const cut = String(id).indexOf('#');
    return [Number(String(id).slice(0, cut)), String(id).slice(cut + 1)];
  };

  /**
   * The list the score is computed from.
   *
   * One row per control on the form across every frame, whether or not
   * anything was written into it — an empty required field has to be able to
   * pull the number down, and it cannot do that if it is not in the list.
   */
  function entries() {
    const out = [];
    for (const [id, f] of state.fields) {
      const fill = state.fills.get(id);
      out.push({
        required: !!f.required,
        confidence: fill ? fill.confidence : null,
        review: !!fill?.review,
        acknowledged: !!fill?.acknowledged,
      });
    }
    return out;
  }

  const scoreNow = () => C.score(entries());

  /* ── The confidence ring ─────────────────────────────────────────────
     Rendered at the score it was showing a moment ago and then moved, on the
     next frame, to the score it is showing now — so the number the member just
     changed visibly moves instead of appearing already changed. */

  const R = 26;
  const CIRC = 2 * Math.PI * R;

  function ringHtml(s) {
    const from = CIRC * (1 - state.lastScore / 100);
    return '<div class="docrud-conf" data-band="' + esc(s.band) + '">'
      + `<svg class="docrud-ring" viewBox="0 0 64 64" aria-hidden="true">`
      + `<circle class="docrud-ring-bg" cx="32" cy="32" r="${R}"></circle>`
      + `<circle class="docrud-ring-fg" cx="32" cy="32" r="${R}"`
      + ` stroke-dasharray="${CIRC.toFixed(2)}" stroke-dashoffset="${from.toFixed(2)}"></circle>`
      + '</svg>'
      + `<div class="docrud-conf-n"><b data-score>${s.value}</b><i>%</i></div>`
      + '<div class="docrud-conf-t">'
      + `<span class="docrud-conf-h">${esc(L.t('confTitle'))}</span>`
      + `<span class="docrud-conf-v">${esc(s.verdict)}</span>`
      + `<span class="docrud-conf-c">${esc(L.t('filledOf', { a: s.counts.filled, b: s.counts.seen }))}</span>`
      + '</div></div>';
  }

  /** Move the ring to the live score after the node exists. */
  function animateRing(p, s) {
    const fg = p.querySelector('.docrud-ring-fg');
    if (!fg) { state.lastScore = s.value; return; }
    requestAnimationFrame(() => {
      fg.style.strokeDashoffset = String(CIRC * (1 - s.value / 100));
      countUp(p.querySelector('[data-score]'), state.lastScore, s.value);
      state.lastScore = s.value;
    });
  }

  function countUp(node, from, to) {
    if (!node || from === to) { if (node) node.textContent = String(to); return; }
    const start = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - start) / 520);
      /* Ease out, so it settles rather than stopping. */
      node.textContent = String(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ── Rows ─────────────────────────────────────────────────────────────
     Every filled field is listed with the question as the page worded it and
     the value that went in, because "11 of 12 filled" tells you a number and
     this tells you what an employer is about to read. */

  const ANSWER_LABEL = {
    fullName: 'Full name', firstName: 'First name', lastName: 'Last name',
    email: 'Email', phone: 'Phone', location: 'Location', city: 'City',
    country: 'Country', linkedin: 'LinkedIn', github: 'GitHub',
    portfolio: 'Portfolio', website: 'Website', currentTitle: 'Current title',
    currentCompany: 'Current company', yearsExperience: 'Years of experience',
    resume: 'Résumé', coverLetter: 'Cover letter', freeText: 'Written answer',
    willRelocate: 'Will relocate', noticePeriod: 'Notice period',
    salaryExpectation: 'Expected salary', howDidYouHear: 'How you heard about us',
  };

  /**
   * One row: what the form asked, what went in, and what you can do about it.
   *
   * A row in edit mode renders the editor IN PLACE rather than replacing the
   * screen. Changing an answer used to cost two view transitions to get to a
   * single dropdown and two more to get back, with the list you were reading
   * gone for the duration. Now the row grows, you change it, and the row
   * shrinks — everything else stays where it was, including your scroll
   * position and the ring.
   */
  function rowFor(f, kind, i) {
    if (state.editing === f.id) return editorRow(f.id, i);

    const shown = f.file ? f.file.fileName : (f.value ?? '');
    const answer = shown.length > 74 ? `${shown.slice(0, 74)}…` : shown;
    const name = f.label || ANSWER_LABEL[f.key] || f.key;

    return `<div class="docrud-row" data-goto="${esc(f.id)}" data-k="${kind}"`
      + ` style="animation-delay:${Math.min(i * 22, 280)}ms">`
      + `<span class="docrud-dot" data-k="${f.acknowledged ? 'ok' : kind}"></span>`
      + '<span class="docrud-cell">'
      + `<span class="docrud-q">${esc(name)}</span>`
      + (answer ? `<span class="docrud-a">${esc(answer)}</span>` : '')
      /* The reason only where it earns its line. On a field you are being
         asked to check, "why did it think that" is the whole point; on twelve
         fields that are simply right it is a third line of noise on each. */
      + (f.reason && kind !== 'ok' ? `<span class="docrud-why">${esc(f.reason)}</span>` : '')
      + '</span>'
      + '<span class="docrud-acts">'
      + (f.file ? '' : `<button class="docrud-mini" data-edit="${esc(f.id)}">${esc(L.t('edit'))}</button>`)
      + (f.review
        ? `<button class="docrud-mini${f.acknowledged ? ' docrud-mini-on' : ''}" data-ack="${esc(f.id)}">`
          + `${esc(f.acknowledged ? L.t('checked') : L.t('looksRight'))}</button>`
        : '')
      + '</span></div>';
  }

  /**
   * The row, open for editing.
   *
   * Works for a field that was never filled as well as one that was — a
   * required box the matcher could not answer is listed with everything else
   * and answered from the same place, instead of sending somebody off to hunt
   * for it on the page.
   *
   * What it offers is the FORM'S OWN choices: its actual dropdown, plus the
   * options the matcher nearly picked. Changing a country on a Workday page
   * means finding it among two hundred; here it is one press of a shortlist
   * that was already computed.
   */
  function editorRow(id, i) {
    const field = state.fields.get(id) || {};
    const fill = state.fills.get(id);
    const options = field.options || [];
    const current = fill?.option ?? fill?.value ?? '';
    const alts = (fill?.alternatives || []).filter((a) => a && a !== current).slice(0, 3);
    const name = field.label || ANSWER_LABEL[fill?.key] || fill?.key || L.t('editH');

    const input = options.length
      ? '<select class="docrud-sel" data-in>'
        + `<option value=""${current ? '' : ' selected'}>—</option>`
        + options.map((o) =>
          `<option value="${esc(o)}"${o === current ? ' selected' : ''}>${esc(o)}</option>`).join('')
        + '</select>'
      : field.multiline
        ? `<textarea class="docrud-in" data-in rows="4">${esc(current)}</textarea>`
        : `<input class="docrud-in" data-in value="${esc(current)}" placeholder="${esc(L.t('askPlaceholder'))}">`;

    return `<div class="docrud-edit" data-editing="${esc(id)}"`
      + ` style="animation-delay:${Math.min(i * 22, 280)}ms">`
      + `<div class="docrud-edit-q">${esc(name)}</div>`
      + (fill?.reason ? `<div class="docrud-edit-why">${esc(fill.reason)}</div>` : '')
      + `<div class="docrud-ask-in">${input}</div>`
      + (alts.length
        ? `<div class="docrud-edit-alts"><span>${esc(L.t('suggestions'))}</span>`
          + alts.map((a) => `<button class="docrud-opt docrud-opt-sm" data-alt="${esc(a)}">${esc(a)}</button>`).join('')
          + '</div>'
        : '')
      + '<div class="docrud-two">'
      + `<button class="docrud-cta docrud-cta-sm" data-save>${esc(L.t('save'))}</button>`
      + `<button class="docrud-skip" data-cancel>${esc(L.t('cancel'))}</button>`
      + '</div></div>';
  }

  /* ── The result, which is also the review, which is also the send ─────
     ═══ WHY THIS IS ONE SCREEN ═══

     It was three: a result list, a separate editor, and a separate submit gate
     that re-listed everything the result screen had already shown. Checking an
     answer and then sending meant four navigations away from the list you were
     reading, and the blockers were described in one place while the things
     blocking were shown in another.

     There is one list now. Everything on the form is in it — filled, flagged,
     failed, and required-but-empty — every row edits in place, and the button
     that sends it is at the bottom of the same list, disabled until that list
     has nothing outstanding left in it. */

  function showResult() {
    state.view = 'result';
    const s = scoreNow();
    const all = [...state.fills.values()];
    const review = all.filter((f) => f.review && !f.failed);
    const ok = all.filter((f) => !f.review && !f.failed);
    const failed = all.filter((f) => f.failed);

    /* A required field nothing could answer belongs in the list too. It is the
       single most likely reason an employer rejects the form, and it used to
       appear nowhere at all. */
    const emptyRequired = [];
    for (const [id, f] of state.fields) {
      if (!f.required || state.fills.has(id)) continue;
      emptyRequired.push({
        id, key: 'freeText', label: f.label || f.name || id,
        reason: L.t('reqEmpty'), failed: true,
      });
    }
    const left = [...failed, ...emptyRequired];
    const toAsk = state.questions.length;

    const chips = [
      state.counts.byRules ? `<span class="docrud-chip" data-k="rules"><i></i>${state.counts.byRules} matched</span>` : '',
      state.counts.byReading ? `<span class="docrud-chip" data-k="read"><i></i>${state.counts.byReading} read from the page</span>` : '',
      state.counts.drafted ? `<span class="docrud-chip" data-k="drafted"><i></i>${state.counts.drafted} drafted</span>` : '',
      peers.length > 1 ? `<span class="docrud-chip" data-k="frame"><i></i>${esc(L.t('frameNote'))}</span>` : '',
    ].join('');

    let i = 0;
    const list = (rows, kind) => rows.length
      ? `<div class="docrud-list">${rows.map((f) => rowFor(f, kind, i++)).join('')}</div>` : '';
    const sub = (key, rows) => (rows.length ? `<div class="docrud-sub">${esc(L.t(key))}</div>` : '');

    const canSend = s.ready && !!state.submit;

    const p = paint(
      head(L.t('done'))
      + '<div class="docrud-body">'
      + ringHtml(s)
      + (chips ? `<div class="docrud-how">${chips}</div>` : '')
      /* First, because it is the only thing here that adds answers rather than
         checking them. */
      + (toAsk > 0
        ? `<button class="docrud-cta" data-chat>${esc(toAsk === 1 ? L.t('ctaQuestion') : L.t('ctaQuestions', { n: toAsk }))}</button>`
        : '')
      + sub('subLeft', left) + list(left, 'miss')
      + sub('subReview', review) + list(review, 'review')
      + sub('subFilled', ok) + list(ok, 'ok')
      + (state.missing?.length
        ? `<p class="docrud-hint">${esc(L.t('addProfile', { x: state.missing.slice(0, 3).join(', ') }))}</p>`
        : '')
      + (state.submit
        ? '<div class="docrud-gate">'
          + (s.blockers.length
            ? `<p class="docrud-gate-why">${esc(s.blockers.join(' · '))}</p>` : '')
          + `<button class="docrud-cta docrud-cta-go" data-go${canSend ? '' : ' disabled'}>`
          + `${esc(L.t('submitGo'))}${state.submit.label ? ` — “${esc(state.submit.label)}”` : ''}</button>`
          + `<p class="docrud-gate-warn">${esc(L.t('submitWarn'))}</p>`
          + '</div>'
        : '')
      + '</div>'
      + `<div class="docrud-foot"><b>${esc(L.t('nothingSubmitted'))}</b></div>`,
    );

    animateRing(p, s);
    wireResult(p);
  }

  function wireResult(p) {
    p.querySelector('[data-chat]')?.addEventListener('click', () => startChat());
    p.querySelector('[data-go]')?.addEventListener('click', send);

    p.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => beginEdit(b.getAttribute('data-edit'))));

    p.querySelectorAll('[data-ack]').forEach((b) =>
      b.addEventListener('click', () => {
        const f = state.fills.get(b.getAttribute('data-ack'));
        if (!f) return;
        f.acknowledged = !f.acknowledged;
        showResult();
      }));

    const editing = p.querySelector('[data-editing]');
    if (!editing) return;

    const id = editing.getAttribute('data-editing');
    const field = state.fields.get(id) || {};
    const input = editing.querySelector('[data-in]');
    /* Into view without moving the page: the ring and the rest of the list
       should stay where they were. */
    editing.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    input?.focus();
    if (input && input.tagName !== 'SELECT') input.select?.();

    editing.querySelector('[data-save]')?.addEventListener('click', () => saveEdit(id, input?.value));
    editing.querySelectorAll('[data-alt]').forEach((b) =>
      b.addEventListener('click', () => saveEdit(id, b.getAttribute('data-alt'))));
    editing.querySelector('[data-cancel]')?.addEventListener('click', () => endEdit());
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); endEdit(); }
      if (e.key === 'Enter' && !e.shiftKey && !field.multiline) {
        e.preventDefault(); saveEdit(id, input.value);
      }
    });
  }

  function beginEdit(id) {
    state.editing = id;
    const [frameId, local] = splitId(id);
    ask(frameId, { t: 'HIGHLIGHT', id: local, asking: true });
    showResult();
  }

  function endEdit() {
    if (state.editing) {
      const [frameId] = splitId(state.editing);
      ask(frameId, { t: 'CLEAR_ASKING' });
    }
    state.editing = null;
    showResult();
  }

  async function saveEdit(id, value) {
    const v = String(value ?? '').trim();
    const field = state.fields.get(id) || {};
    const [frameId, local] = splitId(id);

    if (v) {
      const res = await ask(frameId, {
        t: 'APPLY_ONE', id: local, value: v, isOption: !!field.options?.length, review: false,
      });
      if (res?.ok) {
        const existing = state.fills.get(id) || { id, key: 'freeText', label: field.label };
        state.fills.set(id, {
          ...existing,
          value: v,
          option: field.options?.length ? v : undefined,
          /* An answer somebody typed themselves is the most reliable value on
             the form, and it is settled by definition — they just read it. */
          confidence: 1,
          reason: L.t('youEdited'),
          review: false,
          acknowledged: true,
          failed: false,
        });
      }
    }
    endEdit();
  }

  /* ── Sending ──────────────────────────────────────────────────────────
     The button that presses the employer's button. There is no path through
     this file where a form is sent without somebody pressing it, and it is
     disabled until `ready` — which is deliberately not a score threshold,
     because a form can be 94% confident and still be missing a required box,
     and 94% is not permission to send an incomplete application. */

  async function send() {
    if (!scoreNow().ready || !state.submit) return;
    paint(head(L.t('submitting'))
      + '<div class="docrud-body">'
      + '<div class="docrud-sending"><span></span><span></span><span></span></div>'
      + `<p class="docrud-ready">${esc(L.t('submitting'))}</p></div>`);

    const res = await ask(state.submit.frameId, { t: 'SUBMIT' });
    paint(head(L.t('done'))
      + '<div class="docrud-body">'
      + (res?.ok
        ? `<div class="docrud-sent">✓</div><p class="docrud-ready">${esc(L.t('submitted'))}</p>`
        : `<p class="docrud-err">${esc(res?.error || L.t('submitFailed'))}</p>`)
      + '</div>'
      + `<div class="docrud-foot">${esc(L.t('nothingSubmitted'))}</div>`);
  }

  /* ── The chat ──────────────────────────────────────────────────────
     One question at a time, for the fields nothing could answer.

     The field being asked about is scrolled to and outlined while its question
     is up, so the person can see what they are answering rather than trusting a
     sentence in a panel. Every answer is written into the form immediately and
     sent to Docrud to be remembered — the next form that asks the same thing
     fills itself.

     Options are buttons, never a text box, whenever the form offers a list:
     picking cannot be mistyped, and it guarantees the value is one the form
     will actually accept. */

  let queue = [];
  let asked = 0;
  let answeredHere = 0;

  function askNext() {
    const q = queue[asked];
    if (!q) { finishChat(); return; }
    state.view = 'chat';

    const [frameId, local] = splitId(q.fieldId);
    ask(frameId, { t: 'HIGHLIGHT', id: local, asking: true });

    const total = queue.length;
    const pick = q.suggested?.value ?? q.recalled ?? '';
    const opts = q.options ?? [];
    /* Buttons up to six options; beyond that a real dropdown. A country list is
       two hundred entries, and rendering that as buttons is a worse experience
       than the form we are trying to save the person from. */
    const asList = opts.length > 6;

    const optionButtons = () => opts.map((o) => {
      const on = o === pick;
      return `<button class="docrud-opt${on ? ' docrud-opt-on' : ''}" data-val="${esc(o)}">`
        + `${esc(o)}${on ? '<span class="docrud-rec">★</span>' : ''}</button>`;
    }).join('');

    const optionSelect = () =>
      '<select class="docrud-sel" data-in>'
      + (pick ? '' : '<option value="">—</option>')
      + opts.map((o) => `<option value="${esc(o)}"${o === pick ? ' selected' : ''}>${esc(o)}</option>`).join('')
      + '</select>'
      + `<button class="docrud-send" data-send>${esc(L.t('askSend'))}</button>`;

    const body =
      `<div class="docrud-ask-n">${esc(L.t('askN', { i: asked + 1, n: total }))}</div>`
      + `<div class="docrud-ask-q">${esc(L.prompt(q.signature, q.prompt))}</div>`
      /* Never translated: this is the employer's own question, and it is the
         thing actually being answered. */
      + (q.sourceLabel && q.sourceLabel !== q.prompt
        ? `<div class="docrud-ask-src">${esc(L.t('askSrc', { x: q.sourceLabel }))}</div>` : '')
      + (q.suggested
        ? `<div class="docrud-recall"><b>${esc(q.suggested.value)}</b> — ${esc(q.suggested.why)}</div>`
        : q.recalled
          ? `<div class="docrud-recall">${esc(L.t('recall', { x: q.recalled }))}</div>` : '')
      + '<div class="docrud-ask-in">'
      + (opts.length
        ? (asList ? optionSelect() : `<div class="docrud-opts">${optionButtons()}</div>`)
        : q.kind === 'longtext'
          ? `<textarea class="docrud-in" data-in rows="3" placeholder="${esc(L.t('askPlaceholder'))}"></textarea>`
            + `<button class="docrud-send" data-send>${esc(L.t('askSend'))}</button>`
          : `<input class="docrud-in" data-in placeholder="${esc(L.t('askPlaceholder'))}">`
            + `<button class="docrud-send" data-send>${esc(L.t('askSend'))}</button>`)
      + '</div>'
      + `<button class="docrud-skip" data-skip>${esc(L.t('askSkip'))}</button>`;

    const p = paint(
      head(L.t('left', { n: total - asked }))
      + `<div class="docrud-body docrud-chat">${body}</div>`
      + `<div class="docrud-foot">${esc(L.t('savedProfile'))}</div>`,
    );

    const input = p.querySelector('.docrud-in');
    if (input) {
      if (pick) input.value = pick;
      input.focus();
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && q.kind !== 'longtext') {
          e.preventDefault(); answer(input.value);
        }
      });
    }
    const select = p.querySelector('.docrud-sel');
    if (select && pick) select.value = pick;
    p.querySelectorAll('.docrud-opt').forEach((b) =>
      b.addEventListener('click', () => answer(b.getAttribute('data-val'))));
    p.querySelector('[data-send]')?.addEventListener('click',
      () => answer(select ? select.value : (input?.value ?? '')));
    p.querySelector('[data-skip]')?.addEventListener('click', () => { asked += 1; askNext(); });
  }

  async function answer(raw) {
    const q = queue[asked];
    const value = String(raw ?? '').trim();
    if (!q || !value) return;

    const [frameId, local] = splitId(q.fieldId);
    const res = await ask(frameId, {
      t: 'APPLY_ONE', id: local, value, isOption: !!q.options, review: false,
    });

    if (res?.ok) {
      answeredHere += 1;
      /* It becomes part of the form, so it counts towards the score — and it
         counts at full confidence, because the member said it. */
      state.fills.set(q.fieldId, {
        id: q.fieldId, label: q.sourceLabel || q.prompt, key: 'freeText',
        value, option: q.options ? value : undefined,
        confidence: 1, reason: 'you answered this', review: false, acknowledged: true,
      });
    }

    /* Remembered without blocking the next question. A failure to save costs
       this answer being asked again next time, never the form being wrong. */
    void chrome.runtime.sendMessage({
      type: 'REMEMBER', signature: q.signature, value, prompt: q.prompt,
    }).catch(() => {});

    asked += 1;
    askNext();
  }

  function finishChat() {
    for (const p of peers) ask(p.frameId, { t: 'CLEAR_ASKING' });
    /* Questions that were answered are no longer questions. */
    state.questions = queue.filter((q) => !state.fills.has(q.fieldId));
    showResult();
  }

  function startChat() {
    queue = state.questions.slice();
    asked = 0;
    answeredHere = 0;
    askNext();
  }

  /* ── Re-rendering after a language change ─────────────────────────── */

  function rerender() {
    if (state.view === 'result') showResult();
    else if (state.view === 'chat') askNext();
    else if (state.view === 'error') showError(state.error);
    else offer();
  }

  function showError(message, hint) {
    state.view = 'error';
    state.error = message;
    paint(head('')
      + `<div class="docrud-body"><p class="docrud-err">${esc(message)}</p>`
      + (hint ? `<p class="docrud-hint">${esc(hint)}</p>` : '')
      + '</div>');
  }

  /* ── The run ──────────────────────────────────────────────────────────
     Host only. It asks every frame for its fields, sends the whole form to
     Docrud in one request — so the server sees the application rather than a
     fragment of it — and hands each frame back only its own answers. */

  let running = false;

  async function run() {
    if (role !== 'host' || running) return;
    running = true;
    stepState = {};

    try {
      step('scan');
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

      state.fields.clear();
      state.fills.clear();
      state.submit = null;
      const all = [];
      let mostFields = 0;

      /* Every frame at once. Sequentially this was one round trip per frame
         before the first field could even be described. */
      const scans = await Promise.all(peers.map(async (peer) => ({
        peer, res: await ask(peer.frameId, { t: 'SCAN' }),
      })));

      for (const { peer, res } of scans) {
        if (!res?.fields?.length) continue;
        for (const f of res.fields) {
          const id = `${peer.frameId}#${f.id}`;
          const namespaced = { ...f, id };
          state.fields.set(id, namespaced);
          all.push(namespaced);
        }
        /* Both of these come from the frame holding the FORM, not from whichever
           frame happened to answer last. On an embedded ATS the parent page is
           marketing copy with its own og:title and quite possibly its own
           unrelated submit button; the iframe is the actual posting. */
        if (res.fields.length > mostFields) {
          mostFields = res.fields.length;
          state.job = res.job;
          state.submit = res.submit ? { frameId: peer.frameId, label: res.submit.label } : null;
        }
      }

      if (all.length === 0) {
        showError(L.t('errNoFields'));
        return;
      }
      step('map', `${all.length} fields`);

      const res = await chrome.runtime.sendMessage({ type: 'MAP_FIELDS', job: state.job, fields: all });
      if (!res?.ok) {
        showError(res?.error || 'Something went wrong.',
          res?.status === 401 ? 'Open Docrud in a tab, sign in, then run this again.' : '');
        return;
      }

      const { fills, missing, counts, questions } = res.data;
      state.missing = missing || [];
      state.counts = counts || {};
      state.questions = questions || [];
      if (counts?.drafted) step('write', `${counts.drafted} written`);
      step('fill', `${fills.length} to fill`);

      /* Grouped by frame so each one writes its own in one pass — a round trip
         per field would make a twenty-field form twenty round trips. */
      const byFrame = new Map();
      for (const fill of fills) {
        const [frameId] = splitId(fill.id);
        if (!byFrame.has(frameId)) byFrame.set(frameId, []);
        byFrame.get(frameId).push({ ...fill, id: splitId(fill.id)[1] });
        state.fills.set(fill.id, { ...fill, acknowledged: false });
      }

      for (const [frameId, group] of byFrame) {
        const results = await ask(frameId, { t: 'APPLY', fills: group });
        for (const r of results || []) {
          const id = `${frameId}#${r.id}`;
          const fill = state.fills.get(id);
          if (!fill) continue;
          if (!r.ok) {
            /* It did not go in. It is not an answer, so it must not count
               towards the score as though it were. */
            fill.failed = true;
            fill.confidence = null;
            fill.reason = r.reason || fill.reason;
          }
        }
      }
      /* A fill that failed has no value on the form; drop its confidence so
         `entries()` reports the field as empty. */
      for (const [, f] of state.fills) if (f.failed) f.confidence = null;

      for (const [k] of STEPS) stepState[k] = 'done';

      /* Straight into the questions rather than stopping at a summary nobody
         can act on yet. The review list is the LAST screen, not an interlude:
         reading what was filled while three required boxes are still unanswered
         is reviewing a form that is not finished. One less press, and the
         presses that remain are all about the same thing. */
      if (state.questions.length) { startChat(); return; }
      showResult();
    } catch (e) {
      showError(e.message);
    } finally {
      running = false;
    }
  }

  /* ── Offering ─────────────────────────────────────────────────────
     The sidebar itself, in a resting state. There is no badge any more: a pill
     in the corner was a second surface with its own geometry to be reshaped by
     the page, and it is what some sites were turning into a long bar. One
     surface, always the same shape, and the first thing it does is say what it
     found rather than asking to be clicked blind. */

  function offer() {
    state.view = 'idle';
    const total = peers.reduce((n, p) => n + p.fields, 0) || lastHello;
    const p = paint(
      head(L.t('ready'))
      + '<div class="docrud-body">'
      + '<div class="docrud-idle">'
      + `<div class="docrud-idle-h">${esc(L.t('idleH'))}</div>`
      + `<p class="docrud-idle-p">${esc(L.t('idleP', { n: total }))}</p>`
      + `<button class="docrud-cta" data-fill>${esc(L.t('fill'))}</button>`
      + '</div></div>'
      + `<div class="docrud-foot"><b>${esc(L.t('nothingSubmitted'))}</b></div>`,
    );
    p.querySelector('[data-fill]')?.addEventListener('click', run);
  }

  /* Watching for the form to appear. These pages render it after their own
     JavaScript runs, so one check at load would miss it.

     The role is re-tested on every tick, not just at the start: a frame that
     was host when the page loaded can be demoted the moment the top frame gets
     the script, and a poll that does not re-check simply paints the sidebar
     back. */
  let offerTimer = null;
  function startOffering() {
    if (offerTimer) return;
    const tick = () => {
      if (role !== 'host') return;
      if (state.view !== 'idle' || shadow) return;
      if (peers.some((p) => p.app)) offer();
    };
    tick();
    offerTimer = setInterval(tick, 700);
    setTimeout(stopOffering, 15000);
  }
  function stopOffering() {
    if (offerTimer) { clearInterval(offerTimer); offerTimer = null; }
  }

  /* ── Starting up ──────────────────────────────────────────────────── */

  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg?.type === 'RUN_AUTOFILL') {
      /* Broadcast to every frame by `chrome.tabs.sendMessage`. Only the host
         acts on it; the workers stay quiet and wait to be asked. This one line
         is what stops two sidebars appearing. */
      whenRoleKnown().then(() => { if (role === 'host') run(); });
      reply?.({ ok: true });
    }
    return true;
  });

  (async () => {
    const { docrudLang } = await (chrome.storage?.sync?.get('docrudLang') ?? {});
    L.setLang(docrudLang || L.detect());

    connect();

    /* These pages render the form after their own JavaScript runs, so a single
       check at load would miss it — watch briefly, then stop rather than
       observing forever. */
    if (document.body) {
      const mo = new MutationObserver(helloSoon);
      mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => mo.disconnect(), 15000);
    }

    await whenRoleKnown();
    /* Unconditionally, even in a frame that is currently a worker: the poll
       re-tests the role on every tick, so a frame promoted later — the top
       frame getting the script after an embed already had it — starts offering
       without needing this to have guessed right. */
    startOffering();
  })();
})();
