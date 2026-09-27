/**
 * The service worker: everything that talks to Docrud.
 *
 * ═══ WHY THE NETWORK CALLS LIVE HERE ═══
 *
 * A content script runs in the employer's page. Anything it can reach, that
 * page can reach too. So it is given no origin, no cookie and no answer it did
 * not ask for: it sends a description of the form and receives values for that
 * form. The session cookie is only ever attached here, in the worker, where
 * greenhouse.io cannot see it.
 *
 * The worker is also where `host_permissions` applies, which is what lets these
 * requests carry credentials cross-origin without the API having to open CORS
 * to the whole internet.
 */

/* Where Docrud is. Overridable so the extension can be pointed at a dev server
   without a rebuild — see the popup. */
const DEFAULT_ORIGIN = 'https://docrud.com';

async function origin() {
  const { docrudOrigin } = await chrome.storage.sync.get('docrudOrigin');
  return (docrudOrigin || DEFAULT_ORIGIN).replace(/\/+$/, '');
}

async function api(path, init = {}) {
  const base = await origin();
  const res = await fetch(`${base}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!res.ok) {
    const err = new Error((body && body.error) || explain(res.status, base, !!body));
    err.status = res.status;
    throw err;
  }
  return body;
}

/**
 * What went wrong, in words that say what to do about it.
 *
 * ═══ WHY THIS IS NOT JUST THE STATUS CODE ═══
 *
 * This used to read "Docrud returned 404", which is true and useless. The 404
 * it reports is almost never the API saying no — the API answers with a JSON
 * `error` and that is used instead. A bare 404 means the request reached
 * something that is not Docrud at all: the address in the popup points at a
 * port nothing is serving, or at a dev server that has not finished starting,
 * or at one that has wedged and is returning its own error page.
 *
 * Saying so, with the address it actually tried, turns a dead end into a
 * one-step fix.
 */
function explain(status, base, hadJson) {
  if (status === 404 && !hadJson) {
    return `No Docrud at ${base} — check the address in the extension popup, `
      + 'or wait for the app to finish starting.';
  }
  if (status === 401 || status === 403) {
    return 'Not signed in to Docrud.';
  }
  if (status >= 500) {
    return `Docrud had a problem (${status}). Check the app's console.`;
  }
  return `Docrud returned ${status} from ${base}.`;
}

/**
 * The résumé, as bytes the page can attach.
 *
 * A file input cannot be filled with a URL — it needs a File. The worker
 * fetches it (it has the permission and the cookie; the content script has
 * neither) and hands the content script an array of bytes to rebuild from.
 * Base64 would be a third larger and has to be decoded twice.
 */
async function fetchResume(url) {
  const base = await origin();
  const absolute = /^https?:\/\//i.test(url) ? url : `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  const res = await fetch(absolute, { credentials: 'include' });
  if (!res.ok) throw new Error(`Could not download your résumé (${res.status})`);
  const buf = await res.arrayBuffer();
  return Array.from(new Uint8Array(buf));
}

/* ── Which frame owns the form ─────────────────────────────────────────
   ═══ THE BUG THIS EXISTS FOR ═══

   The content script runs in EVERY frame (`all_frames: true`), and
   `chrome.tabs.sendMessage(tabId, …)` broadcasts to every frame. On a careers
   page that embeds its ATS — druva.com wrapping a job-boards.greenhouse.io
   iframe, which is how a large share of the internet's application forms are
   served — that produced two live instances:

     · the IFRAME found the form, filled it correctly, and painted its panel
       inside an embed thousands of pixels tall, where `position: fixed` put it
       far off the top of the screen;
     · the TOP FRAME found no fields at all and painted "No form fields on this
       page." across the very form that had just been filled in.

   Both were behaving correctly. Neither could see the other.

   ═══ WHY THE WORKER ARBITRATES ═══

   Frames on different origins cannot talk to each other, and their content
   scripts have no reference to each other either. `postMessage` would work and
   is wrong: it puts the member's name, email and phone into a message the
   EMBEDDING PAGE can read, which is precisely the data this extension is
   careful never to expose to a site.

   The service worker already sees every frame — a port carries its sender's
   tab and frame id, unforgeably, from the browser rather than from the page.
   So it holds the roster and relays between them. Nothing crosses a frame
   boundary in the page's view, and no host permission is needed for any of it,
   because a content script may always open a port to its own extension. */

const tabs = new Map();

function roster(tab) {
  return [...tab.frames.entries()].map(([frameId, f]) => ({
    frameId, fields: f.fields, app: f.app, url: f.url,
  }));
}

/**
 * Decide which frame draws the sidebar, and tell everyone.
 *
 * The top frame wins whenever it is present, because it is the only one whose
 * viewport is the window — a sidebar pinned inside an embed is pinned to the
 * embed. Otherwise the frame with the most fields hosts, which is the case
 * where the member opened the ATS iframe's URL directly and the top frame IS
 * the form.
 */
function elect(tabId) {
  const tab = tabs.get(tabId);
  if (!tab) return;

  const top = tab.frames.get(0);
  let host = top ? 0 : null;
  if (host === null) {
    let best = -1;
    for (const [frameId, f] of tab.frames) {
      if (f.fields > best) { best = f.fields; host = frameId; }
    }
  }

  const peers = roster(tab);
  const total = peers.reduce((n, p) => n + p.fields, 0);

  for (const [frameId, f] of tab.frames) {
    const role = frameId === host ? 'host' : 'worker';
    /* Re-sent on every election rather than only on change: a frame that was
       host and is being demoted has to hear about it so it can take its panel
       down, and a frame whose peer list grew needs the new roster. */
    try { f.port.postMessage({ k: 'role', role, frameId, peers, total }); } catch { /* gone */ }
  }
  tab.host = host;

  /* When the form lives in an embed and the top frame has no script — an
     unlisted careers site — nothing can host, because the sidebar would be
     unusable inside the embed and we have no permission to inject into the
     parent uninvited. The badge is the honest signal: there is a form here,
     press the button and the popup will inject into every frame. */
  const needsClick = peers.some((p) => p.app) && !tab.frames.has(0);
  try {
    chrome.action.setBadgeText({ tabId, text: needsClick ? '●' : '' });
    if (needsClick) chrome.action.setBadgeBackgroundColor({ tabId, color: '#6366f1' });
  } catch { /* the tab closed */ }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'docrud-frame') return;
  const tabId = port.sender?.tab?.id;
  const frameId = port.sender?.frameId ?? 0;
  if (tabId === undefined) return;

  let tab = tabs.get(tabId);
  if (!tab) { tab = { frames: new Map(), host: null }; tabs.set(tabId, tab); }
  tab.frames.set(frameId, {
    port, fields: 0, app: false, url: port.sender?.url || '', top: frameId === 0,
  });

  port.onDisconnect.addListener(() => {
    const t = tabs.get(tabId);
    if (!t) return;
    /* Only if it is still OUR port: a frame that navigated has already
       replaced its entry, and deleting it here would drop the live one. */
    if (t.frames.get(frameId)?.port === port) t.frames.delete(frameId);
    if (t.frames.size === 0) {
      tabs.delete(tabId);
      try { chrome.action.setBadgeText({ tabId, text: '' }); } catch { /* closed */ }
    } else elect(tabId);
  });

  port.onMessage.addListener((m) => {
    const t = tabs.get(tabId);
    if (!t) return;
    const self = t.frames.get(frameId);
    if (!self) return;

    if (m?.k === 'hello') {
      self.fields = Number(m.fields) || 0;
      self.app = !!m.app;
      self.url = m.url || self.url;
      elect(tabId);
      return;
    }
    if (m?.k === 'to-host') {
      const host = t.host === null ? null : t.frames.get(t.host);
      if (host && host.port !== port) {
        try { host.port.postMessage({ k: 'msg', from: frameId, payload: m.payload }); } catch { /* gone */ }
      }
      return;
    }
    if (m?.k === 'to-frame') {
      const target = t.frames.get(m.frameId);
      if (target) {
        try { target.port.postMessage({ k: 'msg', from: frameId, payload: m.payload }); } catch { /* gone */ }
      }
      return;
    }
    if (m?.k === 'broadcast') {
      for (const [id, f] of t.frames) {
        if (id === frameId) continue;
        try { f.port.postMessage({ k: 'msg', from: frameId, payload: m.payload }); } catch { /* gone */ }
      }
    }
  });
});

/* A navigation replaces the page's frames; the roster must not outlive them.
   The port disconnect above covers most of it, but a tab discarded by Chrome
   never fires one. */
chrome.tabs?.onRemoved?.addListener((tabId) => tabs.delete(tabId));

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    try {
      if (msg.type === 'MAP_FIELDS') {
        reply({ ok: true, data: await api('/api/apply/map', {
          method: 'POST',
          body: JSON.stringify({ job: msg.job, fields: msg.fields }),
        }) });
        return;
      }
      if (msg.type === 'REMEMBER') {
        /* The answer is already in the form by the time this runs — this is
           only so the same question is not asked on the next employer's. */
        reply({ ok: true, data: await api('/api/apply/answer', {
          method: 'POST',
          body: JSON.stringify({ signature: msg.signature, value: msg.value, prompt: msg.prompt }),
        }) });
        return;
      }
      if (msg.type === 'FETCH_RESUME') {
        reply({ ok: true, bytes: await fetchResume(msg.url) });
        return;
      }
      if (msg.type === 'GET_ORIGIN') {
        reply({ ok: true, origin: await origin() });
        return;
      }
      reply({ ok: false, error: `Unknown message ${msg.type}` });
    } catch (e) {
      reply({ ok: false, error: e.message || String(e), status: e.status });
    }
  })();
  /* Keeps the message channel open for the async reply above. Without this the
     content script's callback fires with undefined the moment this returns. */
  return true;
});

/* There is no `chrome.action.onClicked` handler here on purpose: a declared
   `default_popup` swallows that event, so a listener would be dead code. The
   popup's own button does the injection instead — see popup.js — which also
   means the one place that can read an undeclared page is a button a person
   pressed, under `activeTab`. */
