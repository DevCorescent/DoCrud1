# Docrud Auto-Apply

Fills job application forms from a member's Docrud profile — on Greenhouse,
Lever, Workday, Ashby and anywhere else — and then gets out of the way so the
person can read it and press submit themselves.

## Why an extension exists at all

A page served from `docrud.com` cannot read or write a form on `greenhouse.io`.
That is the browser's same-origin policy, not a gap in a library, and nothing
written inside the Next.js app can work around it. An extension is the only way
to fill a form on a site we do not own. This is how Simplify, Teal and Jobscan
do it too.

## What lives where

The extension is deliberately the stupid half.

| | |
|---|---|
| `content.js` | Reads the form, writes the values, mounts the sidebar. Knows nothing about the member. |
| `confidence.js` | The score, as arithmetic over a list. Loaded here and by `npm run test:apply-confidence`. |
| `lang.js` | The sidebar in thirteen languages. |
| `panel.css` | The sidebar, loaded **inside a shadow root**. |
| `marks.css` | The outlines on the employer's own inputs — the only rules in the page's cascade. |
| `background.js` | Talks to Docrud, holds the cookie, and routes between frames. |
| `popup.js` | Sign-in state, which Docrud to talk to, and the manual trigger. |

All the judgement is server-side, in `lib/apply/field-map.ts` and
`app/api/apply/map/route.ts`. The content script sends a description of each
control — its label, name, type, options — and receives values for them. It
never holds the profile, never holds a credential, and decides nothing.

That split buys three things: one implementation of the matcher instead of a
copy here that drifts, the model can be used for the written answers because the
key stays on the server, and improving the matcher reaches every installed copy
without a store review.

## One tab, many frames, one sidebar

Most careers sites do not host their own application form — they embed an ATS
in an iframe. `druva.com` wrapping `job-boards.greenhouse.io` is the ordinary
case, not an edge one.

The content script runs in every frame, so there are two live copies of it, and
they used to both act:

> the iframe found the form, filled it correctly, and painted its panel inside
> an embed three thousand pixels tall — where `position: fixed` is pinned to the
> embed, far above the screen — while the top frame found no fields and painted
> **"No form fields on this page."** across the form that had just been filled.

Both were behaving correctly. Neither could see the other.

So each frame is now given a ROLE by the service worker, which is the only party
that can see them all:

| | |
|---|---|
| **host** | Exactly one per tab, the top frame wherever possible, because only the top frame's viewport is the window. Owns the sidebar and every decision. |
| **worker** | Every frame. Reads its own controls, writes its own values, paints nothing. |

They talk over a `chrome.runtime` **port**, not `postMessage`. `postMessage`
would work and is wrong: it would put the member's name, email and phone into a
message the embedding page can read, which is exactly the data this extension
shows a site none of. A port's sender is stamped by the browser, so the worker
can route between frames without either page seeing a byte of it — and without
any host permission, because a content script may always open a port to its own
extension.

Field ids are namespaced by frame (`3#f7`), the whole form goes to Docrud in one
request so the server sees an application rather than a fragment, and each frame
gets back only its own answers.

If the form is in an embed and the top frame has no script — an unlisted careers
site — nothing can host, because a sidebar inside the embed is unusable and we
have no permission to inject into the parent uninvited. The toolbar badge is the
honest signal; pressing the button injects into every frame.

## The confidence score

"11 of 12 fields filled" counts boxes. It says nothing about whether the answers
are any good, and it reads identically whether the twelfth box is a middle name
or the one about visa sponsorship. So the sidebar shows a number that answers
the only question the member has — *is this safe to send* — and it moves in real
time as they answer and edit, because a score shown once is a verdict rather
than a guide.

Three parts, and deliberately not more (`confidence.js`):

| | | |
|---|---|---|
| **Coverage** | 45% | Required fields with an answer. Dominates, because an employer's form will simply refuse an application missing one. |
| **Quality** | 35% | How sure the matcher was. An `autocomplete="email"` match is not a guess from a nearby heading. |
| **Settled** | 20% | Flagged answers the person has actually read. The review step, expressed as arithmetic. |

A field with nothing in it contributes nothing to quality rather than dragging
it down — nothing was written, so there is nothing to be unsure about — and a
form with nothing filled scores zero rather than the 20 that three weighted
terms would otherwise produce for an untouched page.

## Editing an answer

Every filled row can be edited, and the editor puts the form's **own dropdown**
in front of you along with the options the matcher nearly chose. Changing a
country on a Workday page means finding it in a list of two hundred; here it is
one press of a shortlist that was already computed (`rankOptions`). An answer
you typed yourself is the most reliable value on the form, so it scores 1 and
counts as read.

## Submitting

There is now a button that presses the employer's button. There is still no path
through this code where a form is sent without somebody pressing it.

The gate is `ready`, and it is deliberately **not** a score threshold: a form can
be 94% confident and still be missing a required field, and 94% is not
permission to send an incomplete application. Two things must be true — every
required field has an answer, and every flagged answer has been read. Until then
the button is disabled and the panel lists what is outstanding, each item a link
to the field.

That is the same promise as before, kept more usefully: the member still reviews
everything, and now the extension can prove they did.

## Languages

Two different things wear the word, and they live apart.

**The form's language** is a matching problem, handled on the server in
`lib/apply/i18n-labels.ts`. `normalize()` strips everything outside
`[a-zA-Z0-9+ ]`, which turned a label reading "पहला नाम" into the *empty string* —
so every form in an Indic script matched nothing at all, silently. Labels and
options are now translated to English before they are normalised, so the rules,
the synonyms and the option chooser all go on working in one language. Hindi,
Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Spanish,
French, German and Portuguese. `npm run test:apply-i18n` asserts that a label in
each reaches the same `AnswerKey` an English form would, that every English
label comes through untouched, and that no translation lands on a phrase the
matcher does not know.

**The sidebar's language** is `lang.js` — our half of the conversation, in
thirteen languages, chosen from the browser and changeable in the header. A
question in our taxonomy carries a key (`key:workAuthorization`), so it can be
asked in the member's language however the employer worded theirs.

The employer's own wording is **never** translated. It is shown underneath,
verbatim: it is the thing actually being answered, and a machine translation of
a legal question about visa status is not something to put in front of someone
as if the employer had asked it.

## When it cannot answer something, it asks

Work authorisation, notice period, expected salary, "how did you hear about us" —
a profile does not hold these, and nothing should invent them. So after filling
what it can, the panel offers *"Answer 3 quick questions"* and becomes a short
conversation: one question at a time, in plain language, with the field it fills
outlined on the page so you can see what you are answering.

Where the form offers a list, the answers are buttons rather than a text box.
Picking cannot be mistyped and guarantees a value the form will accept.

### And it only asks once

Every answer is filed under a SIGNATURE — see `lib/apply/question.ts`. For
anything in our taxonomy the signature is the KEY, not the wording, so:

> "Are you legally authorized to work in the United States?"
> "Do you have the right to work in the UK?"
> "Work authorisation status"

are one question with one remembered answer, on any employer's form. Questions we
cannot classify fall back to their own normalised wording, which only recognises
itself — because two questions we cannot read might mean anything, and answering
one with the other's answer would be a guess made in your name.

What is stored is the answer in your words ("Yes", "30 days"), never an option
index: the next form will word and order its choices differently, and
`chooseOption` maps a remembered answer onto whatever that one offers.

Prose answers are never remembered. Reusing "why do you want to work here" would
send a letter about one company to another.

You can read back or delete anything remembered:
`GET` / `DELETE /api/apply/answer`.

## Why the UI is in a shadow root

The sidebar used to be a plain `<div>` styled through the page's own cascade,
and the page kept winning. A careers site with `div { border-radius: 999px
!important }` reshaped it — on some pages it rendered as a long pill rather than
a sidebar.

It now lives in a shadow root, where no employer stylesheet can reach it. The
host element carries its geometry as inline `!important` declarations, which is
the only thing a page cannot outrank, and that list is exhaustive rather than
minimal: anything left unpinned is something a future site gets to decide for
us. Only `marks.css` stays in the page, because it styles the page's own inputs.

There is no corner badge any more. A pill was a second surface with its own
geometry to be reshaped, and it is what was breaking. One surface, always the
same shape: the sidebar opens in a resting state saying what it found, and
everything happens in it.

## It never submits on its own

Nothing is sent until a person presses a button that says it will send it, and
that button is disabled until every required field has an answer and every
flagged answer has been read. See **Submitting** above.

Two things are flagged rather than filled quietly: anything the matcher was less
than sure about, and anything in `REVIEW_KEYS` — cover letters, salary, and every
written answer — whatever the confidence. An AI-drafted sentence is always read
by the person whose name is on it before an employer sees it.

Work authorisation, visa sponsorship and salary are only ever answered from what
the member explicitly stored. They are not inferred from a location or a job
title, because that would assert something about a person's legal status or
their pay that they never said.

## Installing it during development

1. Start the app: `npm run dev`.
2. Open `chrome://extensions`, turn on **Developer mode**.
3. **Load unpacked** → choose this `extension/` folder.
4. Open the extension's popup and set **Docrud address** to
   `http://localhost:3000`.
5. Sign in to Docrud in a normal tab — the extension uses that session.

Then open any job application form. On the ATS hosts listed in
`manifest.json` a badge appears in the corner by itself; anywhere else, press the
extension's toolbar button and then **Fill this application**.

## Permissions, and why each one

| Permission | Why |
|---|---|
| `storage` | Remembers which Docrud to talk to. |
| `activeTab` + `scripting` | The toolbar button, for sites not in the list. Grants one tab, on a click, and nothing else. |
| `host_permissions: docrud.com` | Lets the service worker call the API with the member's session. This is why the API does not have to open CORS to the internet. |
| content script hosts | The named ATS domains, so the badge can appear without being asked. No `<all_urls>`. |

## Tests

The two parts that can be tested without a browser are, and they are the two
that decide what an employer receives:

```
npm run test:apply-map         # the matcher, against real ATS field names
npm run test:apply-answers     # profile → answers, including what must NOT be invented
npm run test:apply-question    # signatures, prompts, and what is remembered
npm run test:apply-i18n        # a form in Hindi, Tamil, German or Spanish reaches the same key
npm run test:apply-confidence  # the score, against extension/confidence.js itself
```

The DOM half — label resolution, React-safe writing, select and radio groups,
file attachment — is exercised against a mock ATS form; see the note in
`content.js` about why writing `input.value` directly is the single most common
cause of an autofill that looks filled and submits empty.
