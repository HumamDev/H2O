# Studio Capture Boundary

Status: Active
Audience: Anyone touching the chatgpt.com capture pipeline, the archive bridge, or Studio's reader.
Companion: `STUDIO_PORTABILITY_CONTRACT.md`, `STUDIO_STORAGE_CONTRACT.md`. Cross-references: `docs/systems/archive/contract.md`, `docs/systems/archive/metadata-schema.md`, `docs/systems/archive/capture-flow.md` (drafts).

## Purpose

Separate **capture** (extracting chats from live host pages) from **Studio** (workspace, library, reader, knowledge activities). Capture is platform-specific and inherently coupled to ChatGPT/Claude page structure. Studio must be platform-agnostic and must not know about live page DOM. This boundary is what lets Studio later move to a Tauri WebView while a slim browser extension continues to do capture.

## The Rule

Studio consumes **normalized records** via the CaptureSource interface. Studio does not, and must not, query live host-page DOM (`chatgpt.com`, `claude.ai`, etc.) directly.

This is not a forward-looking aspiration. It is the load-bearing invariant that lets the same Studio code run inside the extension today and inside Tauri tomorrow.

## Boundary Diagram

### Today

```
chatgpt.com (web page)
  └─ Content script (src-surfaces-base/desk, loader.js)
       │  observes DOM mutations, scrapes turns
       ▼
  Archive bridge (service worker, bg.js)
       │  serializes snapshots, writes metadata
       ▼
  chrome.storage.local + IndexedDB (durable archive store)
       │
       │  chrome.storage.onChanged fires
       ▼
  Studio runtime (studio.html)
       └─ Transcript Archive Engine (S0D3a)
            │  receives normalized records via extension bridge
            ▼
          StudioStore / Library Index / Workspace / Reader
```

### Future (Tauri desktop app + slim capture extension)

```
chatgpt.com (web page)
  └─ Slim capture extension (chatgpt.com origin only)
       │  observes DOM mutations, normalizes records
       ▼
  Native messaging OR localhost endpoint
       │  posts normalized records
       ▼
  Tauri Rust side (capture-intake command)
       │  writes to SQLite
       ▼
  Tauri event channel ("capture:new")
       │
       ▼
  Studio runtime (Tauri WebView)
       └─ Transcript Studio Host (S0D3e)
            │  receives normalized records via platform.messaging
            ▼
          StudioStore / Library Index / Workspace / Reader
```

The shape of records crossing the boundary is identical in both pictures. The transport is different — that difference is absorbed by `H2O.Studio.platform.messaging` (see `STUDIO_PLATFORM_ADAPTER_GUIDE.md`).

## What Capture Owns

The capture pipeline is allowed to:

- Know ChatGPT's / Claude's DOM structure and data attributes (`data-message-author-role`, `data-message-id`, `data-testid="conversation-turn"`, etc.).
- Use `MutationObserver` against the live page.
- Read `__NEXT_DATA__` and other page-context state if needed.
- Detect navigation, conversation switches, message streaming.
- Decide capture cadence (debounce, batch, retry).
- Tag records with `origin` (`'chatgpt-live'`, `'chatgpt-import'`, `'manual'`).

Capture sends **normalized records** to Studio. Capture must not:

- Render UI that depends on Studio modules.
- Write directly to Studio's storage keys.
- Call into Studio entity stores.

Today, the components that fulfill the capture role are the live content scripts under `src-surfaces-base/desk/` plus the archive bridge in `bg.js`. Tomorrow, those become the slim capture extension. Either way, the records they produce conform to the schemas below.

## What Studio Owns

Studio is allowed to:

- Receive normalized records via the CaptureSource interface.
- Persist them through StudioStore.
- Re-render captured chats using ChatGPT-compatible data attributes for visual parity (the replay DOM).
- Run decoration engines (MiniMap, Highlights, Wash, etc.) against its own replay DOM.
- Operate over saved data (search, organize, label, archive, export).

Studio must not:

- Query, observe, or mutate the live chatgpt.com / claude.ai DOM.
- Use `MutationObserver` for anything outside `studio.html`'s own document.
- Import code from `src-surfaces-base/desk/` or content-script modules.
- Maintain its own selectors for live pages (the capture extension owns those).

## CaptureSource Interface

The interface Studio sees:

```ts
interface CaptureSource {
  // Push (Studio consumes a stream of capture events)
  onCaptureEvent(fn: (event: CaptureEvent) => void): Unsubscribe;

  // Pull (Studio asks for the latest record of a chat)
  fetchChat(id: string): Promise<ChatBundle | null>;
  fetchSnapshot(snapshotId: string): Promise<SnapshotBundle | null>;
  listKnownChats(query?: { limit?: number; updatedSince?: number }): Promise<ChatHeader[]>;

  // Health
  status(): Promise<CaptureStatus>;
}

type CaptureEvent =
  | { kind: 'chat:upserted'; chatHeader: ChatHeader }
  | { kind: 'snapshot:committed'; chatId: string; snapshotId: string; turnCount: number }
  | { kind: 'capture:failed'; chatId?: string; reason: string };

type ChatHeader = {
  id: string;                  // capture-side stable id (becomes ChatRecord.id)
  source: 'chatgpt' | 'claude' | 'import' | 'manual';
  externalId?: string;
  title: string;
  lastCapturedAt: number;
  messageCount: number;
  origin: 'live' | 'import' | 'manual';
};

type ChatBundle = {
  header: ChatHeader;
  latestSnapshotId: string;
};

type SnapshotBundle = {
  snapshotId: string;
  chatId: string;
  capturedAt: number;
  turns: NormalizedTurn[];
};

type NormalizedTurn = {
  id: string;                  // stable across snapshots (capture-side guarantee)
  index: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  contentHtml?: string;
  contentText: string;
  createTime?: number;
  metadata?: Record<string, unknown>;
};

type CaptureStatus =
  | { kind: 'ready'; transport: 'extension-bridge' | 'native-messaging' | 'localhost' | 'mock' }
  | { kind: 'unavailable'; reason: string };
```

These shapes are subsets/projections of `STUDIO_STORAGE_CONTRACT.md` records (specifically `ChatRecord`, `SnapshotRecord`, `TurnRecord`). The capture side does not need to know all StudioStore fields; it provides what it can measure on the host page.

## Implementation Mapping

### Today (MV3 extension)

- **Transport** — `chrome.runtime.sendMessage` to `bg.js`; `chrome.storage.onChanged` for upserts. Wrapped behind `platform.messaging` and `platform.broadcast`.
- **Producer** — content scripts under `src-surfaces-base/desk/` plus `bg.js` archive routines.
- **Consumer** — `S0D3a` Transcript Archive Engine receives the events; `S0D3e` Transcript Studio Host orchestrates rendering.
- **Local fallback** — `S0D3a` lines around 755–780 read legacy folder vault keys (`h2o:prm:cgx:fldrs:state:data:v1`, `h2o:folders:v1`) if the bridge is unavailable. This fallback remains until the slim capture extension exists; it goes away in the Tauri picture.

### Future (Tauri desktop + slim capture extension)

- **Transport** — native messaging or localhost HTTP/WS. The Tauri side defines commands `capture_event_subscribe`, `capture_fetch_chat`, etc.
- **Producer** — the slim capture extension (one tiny job: ship records to the desktop app). It can be a stripped-down version of today's content scripts.
- **Consumer** — same `S0D3a`/`S0D3e` code, now calling `H2O.Studio.platform.messaging.subscribe('capture', ...)` instead of bridging through `chrome.storage`.

## Visual Parity, Not DOM Coupling

Studio's reader (`studio.js` + reader decorations) renders captured chats inside `studio.html` using **ChatGPT-compatible data attributes**: `data-message-author-role`, `data-message-id`, `data-testid="conversation-turn"`, etc. This is intentional and serves two purposes:

1. **Visual parity** — chats look like they did in ChatGPT.
2. **Selector reuse** — decoration engines (`S1A1*` MiniMap, `S1A2a` Wash, `S3H1a` Highlights Engine, etc.) query the same selectors they'd use on chatgpt.com. The same decoration code can run on either DOM.

This is **not** a backdoor coupling to chatgpt.com — the decoration code is querying Studio's own document. The coupling is to the **attribute convention**, not the live page.

The attribute convention is captured in `selectors.contract.js` (to be created under `src-surfaces-base/studio/platform/`). All selectors used by Studio reader and decorations come from there. Concrete consequence: if ChatGPT renames `data-message-author-role` to something else, the change is made once in `selectors.contract.js` and Studio's reader keeps emitting the old name (for archive compatibility) plus optionally the new name.

## Anti-Patterns

- **Studio file with `https://chatgpt.com` in a fetch URL.** Studio doesn't reach chatgpt.com.
- **Studio file with `MutationObserver` watching anything outside `studio.html`'s document.** Studio's observers watch its own DOM (e.g., the reader's replay), not live pages.
- **Studio file that imports from `src-surfaces-base/desk/`.** The desk surface is capture-side; the import direction is forbidden.
- **A "shortcut" that lets Studio scrape ChatGPT directly because the capture pipeline is slow today.** Fix the capture pipeline; don't dissolve the boundary.
- **Capture-side code that writes directly to a StudioStore entity store.** Capture writes via the capture intake path; Studio decides what becomes StudioStore content.

## What Happens When the Boundary Is Crossed

If a Studio feature needs information the capture pipeline doesn't currently provide:

1. **Identify the data.** Is it page-state (origin URL, page version) or chat content (turns, metadata)?
2. **Extend the capture record shape, not Studio.** Add a field to `NormalizedTurn` or `ChatHeader`. Bump the field's schema version.
3. **Update capture to populate it.** The capture extension (today: content scripts) gains code; Studio receives the normalized field.
4. **Update StudioStore entity shape** if persistence is needed (per `STUDIO_STORAGE_CONTRACT.md`).

This loop is intentionally slower than "let Studio just scrape the DOM" — that's the point. It keeps the boundary intact.

## What This Contract Does Not Forbid

- `studio.js` reading capture-produced data through `S0D3a` / `S0D3e`. That is the boundary in action.
- Studio decoration engines reading attributes inside Studio's own rendered DOM. That is reuse of attribute conventions, not boundary crossing.
- A capture extension that uses the same `@h2o-studio/core` parsers as Studio (e.g., HTML sanitization, role normalization). Shared parsers are fine; the boundary is about what each side observes and writes.
