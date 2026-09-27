/**
 * The popup: sign-in state, where Docrud lives, and the manual trigger.
 *
 * The trigger is here rather than on `chrome.action.onClicked`, which never
 * fires while a popup is declared. Pressing it is also the only way this
 * extension ever reads a page it was not declared on: `activeTab` grants access
 * to one tab, on a user gesture, and nothing else.
 */

const $ = (id) => document.getElementById(id);

/** The status pill: a state class and a sentence, never one without the other. */
function setStatus(kind, text) {
  $('status').className = `status ${kind}`;
  $('statusText').textContent = text;
}

async function currentOrigin() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_ORIGIN' });
  return res?.origin || 'https://docrud.com';
}

(async () => {
  const origin = await currentOrigin();
  $('origin').value = origin;

  /* Are we signed in? The cheapest honest check is the endpoint the fill will
     use — asked with no fields, so it costs nothing and answers 400 when the
     session is good and 401 when it is not. */
  try {
    const res = await fetch(`${origin}/api/apply/map`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: [] }),
    });
    if (res.status === 401) setStatus('bad', 'Not signed in — open Docrud and sign in.');
    else setStatus('ok', 'Signed in and ready to fill.');
  } catch {
    setStatus('bad', `Cannot reach ${origin.replace(/^https?:\/\//, '')}.`);
  }
})();

$('origin').addEventListener('change', async (e) => {
  const value = e.target.value.trim().replace(/\/+$/, '');
  await chrome.storage.sync.set({ docrudOrigin: value });
  setStatus('wait', 'Saved — reopen this popup to re-check.');
});

$('open').addEventListener('click', async () => {
  chrome.tabs.create({ url: await currentOrigin() });
});

$('fill').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    /* Every frame, not just the top one. The form is frequently inside an
       embedded ATS iframe, and injecting only the top frame left the sidebar
       in a frame with no form while the form sat in one with no sidebar. */
    const target = { tabId: tab.id, allFrames: true };
    await chrome.scripting.insertCSS({ target, files: ['marks.css'] });
    await chrome.scripting.executeScript({ target, files: ['lang.js', 'confidence.js', 'content.js'] });
    await chrome.tabs.sendMessage(tab.id, { type: 'RUN_AUTOFILL' });
    window.close();
  } catch (err) {
    /* Say what actually went wrong. This used to report "a browser page or a
       PDF" for every failure, including the one where the extension asked
       Chrome to inject a stylesheet that had been renamed — the page was fine
       and the message sent people looking in the wrong place. */
    const why = String(err?.message || err);
    setStatus('bad', /cannot be scripted|chrome:\/\/|extension:\/\/|Cannot access/i.test(why)
      ? 'Chrome does not allow filling this page (a browser or store page).'
      : `Could not start: ${why.slice(0, 90)}`);
  }
});
