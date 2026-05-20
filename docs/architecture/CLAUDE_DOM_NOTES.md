# Claude.ai DOM capture + selector verification (Phase 9A-2)

> **Status**: capture protocol ready. Live verification by operator pending.
> **Operator**: run each snippet in §3 inside your already-logged-in Claude.ai
> Chrome DevTools Console for the 8 scenarios listed in §2, paste outputs into
> §4 / §5 / §6, then mark each row in §7 as confirmed/rejected/needs-revision.
>
> **No production code changes in this phase.** This document drives Phase 9A-3
> (claude host-adapter scaffolding) once §7's selector table is filled in.

---

## 0. How to use this document

1. Open Claude.ai in Chrome with a fresh DevTools panel (Cmd+Opt+I).
2. For each scenario in §2, navigate to the indicated URL, then paste the
   matching snippet from §3 into the Console.
3. Each snippet emits a single `JSON.stringify(...)` block. Copy that JSON
   into the §4 raw-observations section under the right heading.
4. Compare what the snippets reported against the §6 selector candidate
   table. Mark each row's "Observed" + "Stability" + "Verdict" columns.
5. Write the §8 "MVP feasibility verdict" once the table is filled.
6. Stop. Do not implement features. Phase 9A-3 starts after this report is
   reviewed.

**Safety**: all snippets are read-only. They do not mutate the page, do not
send network requests, and do not touch storage. Two snippets (Snippet H —
streaming watcher; Snippet C — role classifier) install temporary
`window.__h2o*` globals; both clean themselves up.

---

## 1. URL pattern confirmation

| Pattern | Hypothesis | Operator confirms |
|---|---|---|
| `/new` | Empty composer; no `conversationId` | ☐ |
| `/chat/<uuid-v4>` | Active conversation, not under a project | ☐ |
| `/projects` | Project list page; no conversation | ☐ |
| `/projects/<projectId>` | Project landing page; project conversations listed | ☐ |
| `/projects/<projectId>/conversations/<uuid-v4>` | Conversation inside a project | ☐ |
| `/recents` | Recent conversations across projects | ☐ |
| `/settings/*` | Settings; out of scope for capture | n/a |

Regex used by the adapter (proposal):
```js
const CONV_PATH_RE = /\/(?:chat|conversations)\/([0-9a-f-]{36})/i;
const PROJ_PATH_RE = /\/projects\/([^/]+)/;
```

---

## 2. Scenario setup matrix

| # | Scenario | Setup | Snippet(s) to run |
|---|---|---|---|
| **S1** | New empty chat | Navigate to `claude.ai/new`. Do not type anything. | A |
| **S2** | Short normal chat | Open any existing conversation with ≤ 6 turns. | A, B, C (×2 — once with `$0` set to a user message, once with an assistant message), D, G |
| **S3** | Long chat | Open a conversation with ≥ 30 turns. Scroll to the very top of the message list, wait for any lazy-load to settle, then run capture. | A, B, then scroll back to bottom and run B again. Compare counts. |
| **S4** | Chat with code block | Open / create a conversation containing at least one `<pre>` code block (any language). | A, B, D |
| **S5** | Chat with attachment/image | Open a conversation where you previously attached a PDF or image. | A, B, E |
| **S6** | Chat with artifact | Open a conversation containing a Claude artifact (code, document, SVG, or markdown). Make sure the artifact panel is OPEN on the right. | A, B, F |
| **S7** | Project chat | Open a conversation inside a project. | A, B, G, plus eyeball: is there a project-name breadcrumb? |
| **S8** | Streaming | Open `claude.ai/new`. Run Snippet H ("watcher"). Then send a prompt that produces ≥ 5 sentences. Let it stream to completion. | H |

---

## 3. Capture snippets

> Each snippet is a paste-and-run IIFE. Output is a single `JSON.stringify(...)`
> log line. Copy it into §4 under the matching scenario heading.

### Snippet A — URL, landmarks, composer, send button

```js
(() => {
  const url = location.href;
  const path = location.pathname;
  const conv = path.match(/\/(?:chat|conversations)\/([0-9a-f-]{36})/i);
  const proj = path.match(/\/projects\/([^/]+)/);
  const landmarks = Array.from(document.querySelectorAll(
    '[role="main"],[role="region"],[role="complementary"],[role="navigation"],main,aside,nav'
  )).map(el => ({
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role'),
    ariaLabel: el.getAttribute('aria-label'),
    childCount: el.children.length,
  }));
  const composer = document.querySelector('[contenteditable="true"]');
  const composerCtx = composer && {
    tag: composer.tagName.toLowerCase(),
    placeholder: composer.getAttribute('data-placeholder')
      || composer.getAttribute('aria-label') || null,
    parentAria: composer.parentElement?.getAttribute('aria-label') || null,
  };
  const sendBtn = Array.from(document.querySelectorAll('button')).find(b => {
    const a = (b.getAttribute('aria-label') || '').toLowerCase();
    return /send/.test(a) && !/cancel/.test(a);
  });
  console.log(JSON.stringify({
    snippet: 'A',
    url, path,
    conversationId: conv?.[1] ?? null,
    projectId: proj?.[1] ?? null,
    landmarks,
    composerCtx,
    sendBtn: sendBtn && {
      aria: sendBtn.getAttribute('aria-label'),
      text: sendBtn.textContent?.trim().slice(0, 30),
      disabled: sendBtn.disabled,
    },
  }, null, 2));
})();
```

### Snippet B — turn enumeration probes (multi-strategy)

```js
(() => {
  const probes = {
    role_article: document.querySelectorAll('[role="article"]'),
    data_turn_like: document.querySelectorAll(
      '[data-turn-id],[data-message-id],[data-testid*="message" i],[data-testid*="turn" i]'
    ),
    main_grandchildren: document.querySelectorAll('main > div > div > div'),
    avatar_parents: Array.from(document.querySelectorAll(
      'img[alt*="avatar" i],svg[aria-label*="avatar" i]'
    )).map(a => a.closest('div')).filter(Boolean),
    user_avatar_initials: Array.from(document.querySelectorAll('div'))
      .filter(d => /^[A-Z]{1,2}$/.test((d.textContent || '').trim())
        && d.children.length === 0)
      .map(d => d.closest('div[class]')),
  };
  const summary = {};
  for (const [k, list] of Object.entries(probes)) {
    summary[k] = {
      count: list.length,
      first3: Array.from(list).slice(0, 3).map(el => ({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        aria: el.getAttribute('aria-label'),
        firstClass: (el.className || '').toString().split(/\s+/).filter(Boolean)[0],
        textPreview: (el.textContent || '').slice(0, 60).replace(/\s+/g, ' '),
      })),
    };
  }
  console.log(JSON.stringify({ snippet: 'B', strategies: summary }, null, 2));
})();
```

### Snippet C — role classification ancestry probe

Run **twice** per S2: once after right-clicking a user message and selecting
"Inspect" (which sets `$0` to that element), then again on an assistant
message. The snippet walks 8 ancestors and records role/aria/class
distinguishers.

```js
(() => {
  let node = $0;
  if (!node) { console.log('Set $0 first: right-click → Inspect on a message.'); return; }
  const ancestry = [];
  for (let i = 0; i < 8 && node; i++) {
    ancestry.push({
      depth: i,
      tag: node.tagName?.toLowerCase(),
      role: node.getAttribute?.('role'),
      aria: node.getAttribute?.('aria-label'),
      classes: (node.className || '').toString().split(/\s+/).slice(0, 4),
      hasAvatar: !!node.querySelector?.('img[alt*="avatar" i],svg[aria-label*="avatar" i]'),
      hasPre: !!node.querySelector?.('pre'),
      hasInitialsCircle: !!Array.from(node.querySelectorAll?.('div') || [])
        .find(d => /^[A-Z]{1,2}$/.test((d.textContent || '').trim()) && d.children.length === 0),
    });
    node = node.parentElement;
  }
  console.log(JSON.stringify({ snippet: 'C', clicked: ($0.tagName + (($0.getAttribute('role') || '') ? ` role=${$0.getAttribute('role')}` : '')), ancestry }, null, 2));
})();
```

### Snippet D — code block + composer + send/stop controls

```js
(() => {
  const pres = document.querySelectorAll('pre');
  const codeSamples = Array.from(pres).slice(0, 3).map(p => ({
    codeTagClass: p.querySelector('code')?.className || null,
    langDataAttr: p.getAttribute('data-language'),
    hasCopyBtn: !!Array.from(p.querySelectorAll('button'))
      .find(b => /copy/i.test(b.getAttribute('aria-label') || '') || /copy/i.test(b.textContent || '')),
    firstLine: (p.querySelector('code')?.textContent || '').slice(0, 80),
  }));
  const buttons = Array.from(document.querySelectorAll('button')).filter(b => {
    const a = (b.getAttribute('aria-label') || '').toLowerCase();
    const t = (b.textContent || '').toLowerCase().slice(0, 30);
    return /\b(send|stop|generating|cancel)\b/.test(a) || /\b(send|stop|generating|cancel)\b/.test(t);
  }).map(b => ({
    aria: b.getAttribute('aria-label'),
    text: b.textContent?.trim().slice(0, 30),
    disabled: b.disabled,
  }));
  console.log(JSON.stringify({
    snippet: 'D',
    preCount: pres.length,
    codeSamples,
    controlButtons: buttons,
  }, null, 2));
})();
```

### Snippet E — attachments / images

```js
(() => {
  const main = document.querySelector('main') || document.body;
  const imgs = main.querySelectorAll('img:not([alt*="avatar" i])');
  const fileRefs = main.querySelectorAll(
    'a[href*=".pdf" i],[aria-label*="attachment" i],[aria-label*="file" i],[role="figure"]'
  );
  console.log(JSON.stringify({
    snippet: 'E',
    imageCount: imgs.length,
    imgSamples: Array.from(imgs).slice(0, 3).map(i => ({
      alt: i.alt,
      src: (i.currentSrc || i.src || '').slice(0, 80),
      parent: i.parentElement?.tagName.toLowerCase(),
      parentAria: i.parentElement?.getAttribute('aria-label'),
    })),
    fileRefCount: fileRefs.length,
    fileRefSamples: Array.from(fileRefs).slice(0, 3).map(f => ({
      tag: f.tagName.toLowerCase(),
      href: f.getAttribute('href'),
      aria: f.getAttribute('aria-label'),
    })),
  }, null, 2));
})();
```

### Snippet F — artifact panel

```js
(() => {
  const ariaArtifact = document.querySelectorAll('[aria-label*="artifact" i]');
  const complementary = document.querySelectorAll('[role="complementary"]');
  const asides = document.querySelectorAll('aside');
  const openArtifactBtns = Array.from(document.querySelectorAll('button'))
    .filter(b => /artifact|open in|preview/i.test(b.getAttribute('aria-label') || b.textContent || ''))
    .slice(0, 5);
  console.log(JSON.stringify({
    snippet: 'F',
    ariaArtifactCount: ariaArtifact.length,
    complementaryCount: complementary.length,
    asideCount: asides.length,
    openArtifactBtns: openArtifactBtns.map(b => ({
      aria: b.getAttribute('aria-label'),
      text: b.textContent?.trim().slice(0, 30),
    })),
    asideSamples: Array.from(asides).slice(0, 3).map(a => ({
      role: a.getAttribute('role'),
      aria: a.getAttribute('aria-label'),
      hasHeader: !!a.querySelector('h1,h2,h3'),
      childCount: a.children.length,
    })),
  }, null, 2));
})();
```

### Snippet G — sidebar enumeration

```js
(() => {
  const nav = document.querySelector('nav,[role="navigation"]');
  const links = nav
    ? nav.querySelectorAll('a[href*="/chat/"], a[href*="/conversations/"]')
    : [];
  const projectLinks = nav
    ? nav.querySelectorAll('a[href*="/projects/"]')
    : [];
  console.log(JSON.stringify({
    snippet: 'G',
    navFound: !!nav,
    navAria: nav?.getAttribute('aria-label') || null,
    sidebarConvLinkCount: links.length,
    convLinkSamples: Array.from(links).slice(0, 5).map(a => ({
      href: a.getAttribute('href'),
      text: (a.textContent || '').trim().slice(0, 60),
      hasIcon: !!a.querySelector('svg,img'),
    })),
    sidebarProjectLinkCount: projectLinks.length,
    projectLinkSamples: Array.from(projectLinks).slice(0, 3).map(a => ({
      href: a.getAttribute('href'),
      text: (a.textContent || '').trim().slice(0, 60),
    })),
  }, null, 2));
})();
```

### Snippet H — streaming finalization watcher

```js
(() => {
  if (window.__h2oStreamWatch) {
    window.__h2oStreamWatch.stop();
    window.__h2oStreamWatch = null;
  }
  const start = Date.now();
  const events = [];
  let lastMut = start;
  let stopSeenAt = null;

  const findStopBtn = () => Array.from(document.querySelectorAll('button')).find(b => {
    const a = (b.getAttribute('aria-label') || '').toLowerCase();
    return /\bstop\b/.test(a) && !b.disabled;
  });

  const obs = new MutationObserver(muts => {
    lastMut = Date.now();
    if (events.length < 6 || events.length % 60 === 0) {
      events.push({
        tMs: lastMut - start,
        mutCount: muts.length,
        mainTextLen: document.querySelector('main')?.textContent?.length || 0,
      });
    }
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });

  const iv = setInterval(() => {
    const stop = findStopBtn();
    if (stop && stopSeenAt === null) stopSeenAt = Date.now();
    const idleMs = Date.now() - lastMut;
    const stopGoneFor = stopSeenAt && !stop ? Date.now() - lastMut : 0;
    if (stopSeenAt && !stop && idleMs > 1500) {
      console.log(JSON.stringify({
        snippet: 'H',
        status: 'finalized',
        totalMs: Date.now() - start,
        stopFirstSeenAtMs: stopSeenAt - start,
        idleMsAtFinalize: idleMs,
        events,
      }, null, 2));
      clearInterval(iv);
      obs.disconnect();
      window.__h2oStreamWatch = null;
    }
  }, 250);

  window.__h2oStreamWatch = {
    stop: () => { clearInterval(iv); obs.disconnect(); window.__h2oStreamWatch = null; },
  };
  console.log('[Snippet H] Watcher armed. Send a prompt now. Will log on idle (stop button disappears + DOM idle > 1.5s).');
})();
```

---

## 4. Raw observations (operator fills)

### S1 — new empty chat
```json
(paste Snippet A output)
```

### S2 — short normal chat
```json
(paste Snippet A output)
```
```json
(paste Snippet B output)
```
```json
(paste Snippet C output for USER message)
```
```json
(paste Snippet C output for ASSISTANT message)
```
```json
(paste Snippet D output)
```
```json
(paste Snippet G output)
```

### S3 — long chat
```json
(paste Snippet A output)
```
```json
(paste Snippet B at top-of-scroll)
```
```json
(paste Snippet B at bottom-of-scroll)
```
Observation: turn count delta between top vs bottom (lazy-load / virtualization):
> _operator fills_

### S4 — code block chat
```json
(paste Snippet A, B, D outputs)
```

### S5 — attachment chat
```json
(paste Snippet A, B, E outputs)
```

### S6 — artifact chat
```json
(paste Snippet A, B, F outputs)
```

### S7 — project chat
```json
(paste Snippet A, B, G outputs)
```
Project-name breadcrumb visible? `☐ yes / ☐ no` — operator confirms.

### S8 — streaming
```json
(paste Snippet H output once finalized)
```

---

## 5. Notable findings (operator narrative)

> Free-form notes the operator records while running the snippets. Examples to
> capture: shadow-DOM presence on any panel, Tailwind class-fragment patterns,
> any element with a `data-testid` attribute (rare but worth noting), any
> obfuscation patterns, surprising landmarks.

- _operator fills_

---

## 6. Selector candidate table

Columns: **Concept** / **Candidate selector** / **Hypothesis** / **Observed
count (S2 / S3 / S6)** / **Stability** (Stable / Volatile / Missing) /
**Verdict** (✅ adopt / ⚠️ adopt-with-fallback / ❌ reject) / **Fallback**.

| # | Concept | Candidate selector | Hypothesis | Observed (S2/S3/S6) | Stability | Verdict | Fallback |
|---|---|---|---|---|---|---|---|
| 1 | Conversation root | `main` | One per page; wraps all turns | / / | | | `[role="main"]` |
| 2 | Conversation ID | URL regex `\/(?:chat|conversations)\/([0-9a-f-]{36})/i` | Captures 36-char UUID | n/a | URL-stable | | — (no DOM fallback) |
| 3 | Project context | URL regex `\/projects\/([^/]+)` + breadcrumb visible | Conversation under project carries id in URL | n/a | URL-stable | | breadcrumb anchor `nav[aria-label*="breadcrumb" i]` |
| 4 | Turn boundary (primary) | `[role="article"]` | One per user-or-assistant message | / / | | | Snippet B's `avatar_parents` |
| 5 | Turn boundary (fallback) | `main > div > div > div > div[class]` | Structural — main's nth-level child | / / | | | per-class regex of common fragments |
| 6 | User turn discriminator | Has `div` child whose text is 1–2 uppercase initials AND no children | Avatar initials block | n/a | | | check for absence of Claude assistant icon |
| 7 | Assistant turn discriminator | Has `svg[aria-label*="claude" i]` OR Anthropic-logo class | Claude bot avatar | n/a | | | absence of user-initials |
| 8 | Turn text container | `[role="article"] > div:last-of-type` or first `div` containing `<p>` | Where rendered markdown lives | / / | | | `getInnerText` polyfill on whole turn |
| 9 | Code block | `pre > code[class*="language-"]` | Highlighted code | / / | | | bare `pre > code` |
| 10 | Code block copy button | `pre button[aria-label*="copy" i]` | Per-block UI affordance | / / | | | walk siblings |
| 11 | Composer | `[contenteditable="true"]` | ProseMirror root | n/a | likely Stable | | `form [contenteditable]` |
| 12 | Send button | `button[aria-label*="send" i]:not([aria-label*="cancel" i])` | Submit affordance | n/a | | | nearest button to composer |
| 13 | Stop button (streaming) | `button[aria-label*="stop" i]` | Visible during generation only | n/a | | | mutation-rate threshold |
| 14 | Sidebar conversation links | `nav a[href^="/chat/"], nav a[href*="/conversations/"]` | List of conversation links | n/a | | | walk all `a[href*="/chat/"]` |
| 15 | Sidebar projects | `nav a[href^="/projects/"]` | List of project links | n/a | | | — |
| 16 | Artifact panel | `[role="complementary"]` containing artifact header text | Right-rail | / / | | | `aside` with non-nav role |
| 17 | Artifact open trigger | Button inside a turn with `aria-label` containing "open" / "artifact" | In-message ref | / / | | | structural |
| 18 | Attachment image | `main img:not([alt*="avatar" i])` | User-attached or assistant-emitted image | / / | | | full src match |
| 19 | PDF attachment | `a[href*=".pdf" i]` OR `[aria-label*="file" i]` | File attachment chip | / / | | | structural search |
| 20 | Citation/web-search source | Container with multiple `<a target="_blank">` under an assistant turn footer | Sources block | / / | | | — |

---

## 7. Selector decision matrix (operator fills after §6)

After completing §6, list the **5–8 selectors the Claude adapter will rely on
for MVP**, in priority order:

| Rank | Concept | Final selector | Why this won | Risk |
|---|---|---|---|---|
| 1 | Conversation ID | URL regex | _operator fills_ | _operator fills_ |
| 2 | Turn boundary | _operator fills_ | _operator fills_ | _operator fills_ |
| 3 | … | | | |

And the **rejected candidates** (explicit "do not use"):

| # | Rejected selector | Reason |
|---|---|---|
| | | |

---

## 8. Best turn-boundary strategy (proposed; operator validates)

The Claude adapter's `enumerateTurns()` should use a **layered predicate**
rather than a single CSS selector, because no `data-message-author-role`
analog exists on claude.ai (per §6 row 4-7 verdicts).

Proposed layered predicate (in priority order):

1. **Primary**: every element matching `[role="article"]` under `main`.
2. **If primary count is 0 or implausibly low for the visible conversation**:
   fall back to "elements that contain an avatar marker (user-initials block
   OR Claude SVG) AND a non-empty text region of ≥ 8 characters".
3. **If both fail**: log a structured error to a localStorage-backed
   `H2O.claude.adapterFailures` ring buffer and surface a one-click "Report
   broken DOM" UI affordance. **Do not crash the page.**

The fallback array's existence is intentional: claude.ai redesigns more
frequently than chatgpt.com (per the 9A-1 audit risk R1/R2), and a hard
dependency on a single selector would be a release-blocker on the day Anthropic
ships a UI refresh.

---

## 9. Streaming finalization strategy

Three independent signals; finalize when ≥ 2 agree:

| # | Signal | Source | Latency |
|---|---|---|---|
| **F1** | "Stop" button vanished | DOM (button enumeration; see Snippet H) | ~immediate |
| **F2** | DOM mutation idle ≥ 1500 ms | MutationObserver on `document.body` | 1.5s |
| **F3** | URL transitioned from `/new` to `/chat/<uuid>` | History API + popstate listener | ~immediate after first response |

For MVP, **F1 ∧ F2** is sufficient (matches Snippet H's behavior). F3 is a
useful sanity check but not load-bearing.

Edge cases to handle in 9A-3 implementation:
- **Regenerate**: user clicks a "regenerate" button → stop button reappears →
  reset finalization timer.
- **Stop mid-stream**: user clicks stop → button vanishes immediately but
  DOM is partial. Treat as "partial turn"; snapshot anyway with a
  `meta.truncatedAt = "user-stopped"` marker.
- **Edit-and-resend**: user edits a previous user message → assistant turn
  is replaced. Treat as a NEW turn for snapshotting (turn order is what
  matters, not turn identity).

---

## 10. Claude adapter contract (proposed TS interface)

> Lands in `packages/host-adapters/claude/index.ts` in Phase 9A-3. Pure logic;
> no chrome.* / extension APIs. Caller passes `document` in (so the adapter
> is testable against fixtures captured by §3 snippets).

```ts
export interface ClaudeContext {
  isClaudeAi: boolean;
  isConversation: boolean;
  conversationId: string | null;        // UUID v4 from URL
  projectId: string | null;             // string from /projects/<id> if present
  orgId: string | null;                 // best-effort from session; null acceptable
}

export interface ClaudeTurn {
  index: number;                        // 0-based, document order
  role: 'user' | 'assistant' | 'unknown';
  text: string;                         // plain-text serialization
  markdown: string;                     // markdown serialization (best-effort)
  html: string;                         // raw outerHTML of the turn container
  hasCode: boolean;
  hasAttachment: boolean;
  hasArtifactRef: boolean;
  meta: {
    artifactRefs?: string[];            // opaque IDs; ingestion deferred
    citationCount?: number;
    truncated?: boolean;                // user clicked stop
  };
}

export interface ClaudeSidebarChat {
  href: string;                          // "/chat/<uuid>" or "/conversations/<uuid>"
  conversationId: string;
  title: string;
  projectId: string | null;
}

export interface ClaudeProjectContext {
  projectId: string;
  projectName: string | null;            // null if not parseable from DOM
}

export interface ClaudeAdapter {
  detectContext(doc?: Document): ClaudeContext;
  enumerateTurns(doc?: Document): ClaudeTurn[];
  classifyRole(turnEl: Element): 'user' | 'assistant' | 'unknown';
  extractTurnText(turnEl: Element): { text: string; markdown: string; html: string };
  isStreaming(doc?: Document): boolean;
  getSidebarChats(doc?: Document): ClaudeSidebarChat[];
  getProjectContext(doc?: Document): ClaudeProjectContext | null;
}
```

**Notes on the contract:**

- All methods accept an optional `doc` argument to support testing against
  fixtures (HTML strings captured by Snippet B, parsed via DOMParser).
- `enumerateTurns` returns turns in document order. The caller (content
  script) is responsible for snapshot construction.
- `classifyRole` returning `'unknown'` is acceptable for MVP — the
  Studio schema's `role` column is free-text per the 9A-1 data-model
  audit. The adapter should not crash on unrecognized turns.
- `extractTurnText` returns all three representations because we don't
  yet know which form Studio will ingest cleanly. Ship all three; pick
  one for storage in 9A-5.
- `getSidebarChats` is **deferred to 9A-6** (sidebar indexing). Stub it
  with an empty array for the MVP content-script implementation.

---

## 11. MVP feasibility verdict (operator fills after §4–§7)

> Pick exactly one verdict and write a 2–3 sentence justification.

- ☐ **GREEN** — selectors are stable enough, turn-boundary predicate works
  reliably, streaming finalization detectable. Proceed to 9A-3.
- ☐ **YELLOW** — selectors require fallback strategies; turn boundary
  needs the layered predicate; some scenarios (e.g. artifacts) need
  Claude-specific code beyond what 9A-3 anticipates. Proceed to 9A-3
  with adjusted scope.
- ☐ **RED** — selectors are too volatile; turn-boundary predicate fails
  on > 1 of the 8 scenarios; or streaming finalization cannot be
  detected reliably. **Stop. Revisit strategy.**

**Operator justification:**
> _operator fills_

---

## 12. Risks (refined from 9A-1; operator marks each as confirmed/refuted)

| # | Risk | 9A-1 severity | Confirmed by §3 captures? | Notes |
|---|---|---|---|---|
| R1 | Claude redesign breaks selectors | High / High | ☐ confirmed / ☐ refuted | |
| R2 | No `data-testid` equivalent → fragile turn boundary | High / High | ☐ / ☐ | |
| R3 | Streaming edge cases (regenerate, stop, edit-resend) | Med / High | ☐ / ☐ | |
| R4 | Per-org URL structure complicates enumeration | Med / Med | ☐ / ☐ | |
| R5 | Artifacts out-of-MVP but visible to users | Med / High | ☐ / ☐ | |
| R6 | Studio schema migration v6 — DB risk | High / Low | n/a (pre-impl) | |
| R7 | Two extensions installed → IndexedDB collision | Med / High | ☐ / ☐ | |
| R8 | CSP differences on claude.ai vs chatgpt.com | Low / Low | ☐ / ☐ | |
| R9 | Performance on large Claude conversations | Med / Med | ☐ / ☐ — check Snippet B count on S3 | |
| R10 | Identity/login state observation differs | Low / Med | n/a | |
| **R11** (new) | Shadow DOM on artifact panel breaks DOM walking | TBD | ☐ confirmed / ☐ refuted | check Snippet F |
| **R12** (new) | Composer is ProseMirror → can't shim with simple form submission | Low / High | ☐ / ☐ | not MVP-critical (we don't inject text) |

---

## 13. Recommended Phase 9A-3 entry conditions

Before opening Phase 9A-3 (Claude host-adapter scaffolding), the following
must be true:

1. §6 selector table has ≥ 16 of 20 rows marked ✅ adopt or ⚠️ adopt-with-fallback.
2. §7 lists at least 5 confirmed selectors with risk ratings.
3. §8 (turn boundary) is confirmed working on scenarios S2/S3/S4/S6.
4. §11 verdict is GREEN or YELLOW (not RED).
5. §12 risk matrix has no NEW (R11+) High/High risk.

If any of those fails, this document gets a 9A-2 revision pass before 9A-3 starts.

---

## 14. What was NOT captured in this protocol

Out-of-scope for 9A-2 (deferred):

- **Network/SSE inspection**: backend `/api/organizations/.../chat_conversations/...`
  request/response schema. Useful for 9B+ (direct API ingestion as an
  alternative to DOM scraping). Out of MVP scope.
- **localStorage / IndexedDB enumeration** on claude.ai. Useful for understanding
  Claude's own caching but irrelevant to H2O's content-script flow.
- **Performance benchmarking** (FPS, layout time, memory). Defer until we
  have a real adapter to measure.
- **Cross-browser**: this protocol is Chrome-only. Firefox audit is its own
  future phase (after `src/extensions/claude/firefox/` graduates from stub).
- **Mobile / Claude apps**: only `https://claude.ai/` (web) is in scope.

---

## 15. Document version

| Phase | Date | Author | What changed |
|---|---|---|---|
| 9A-2 v1 | 2026-05-20 | (initial scaffolding) | Created capture protocol; §4–§7 await operator runs. |
