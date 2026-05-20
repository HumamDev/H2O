# Studio Architecture

Status: Active
Audience: Anyone writing or modifying code under `surfaces/studio/`.
Companion docs: `STUDIO_PORTABILITY_CONTRACT.md`, `STUDIO_PLATFORM_ADAPTER_GUIDE.md`, `STUDIO_STORAGE_CONTRACT.md`, `STUDIO_CAPTURE_BOUNDARY.md`, `STUDIO_DEVELOPMENT_RULES.md`.

## Purpose

Define what Studio is, what it owns, what it does not own, and the boundaries that must hold so Studio remains a portable workspace surface — currently hosted inside the Chrome/MV3 extension, intended to migrate later into a standalone desktop app (Tauri preferred) with a thin capture extension.

## Studio Identity

Studio is a **portable workspace application surface** for captured chats. It is *not* a chatgpt.com DOM decoration layer.

Studio's long-term role is closer to Notion / OneNote / Obsidian than to a userscript:

- a library of captured and imported chats
- a structured knowledge database (folders, projects, categories, labels, tags)
- a reader that re-renders chats with visual parity to ChatGPT but full Studio control over the DOM
- a workspace for activities over saved chats: MiniMap navigation, inline highlights, quote tracking, answer/question wash, timestamps, answer numbering, insights
- a host for future workflows over saved knowledge

Today Studio runs inside an MV3 extension page (`studio.html`). Tomorrow it should be able to run inside a Tauri WebView on macOS with no rewrite of feature code — only swaps in the platform/storage/capture adapters.

## Ownership Map

| Layer | Owns | Does NOT own |
|---|---|---|
| **Studio** | Workspace UI, library view, reader/replay, local operations over saved chats, knowledge workflows (MiniMap, Highlights, Wash, Quote Tracker, Answer Numbers, Timestamps, Title Bar), Library Workspace/Index/Insights/Sync, command bar plugins for library |  Capturing live ChatGPT chats. Native-host runtime. User auth/identity. Service-worker–only behaviors. |
| **Browser Capture Extension** (current native content scripts on chatgpt.com) | Observing chatgpt.com DOM. Snapshotting turns. Streaming new turns. Writing snapshots to the archive bridge. | Workspace UI. Knowledge organization. User-facing chat reader. |
| **Platform Adapter** (new layer, see `STUDIO_PLATFORM_ADAPTER_GUIDE.md`) | Storage, messaging, capture intake, file I/O, env detection, runtime URL resolution. | Domain logic. UI. |
| **Storage Adapter** (concrete implementation behind the StudioStore façade) | Persistence implementation: today IndexedDB + localStorage + `chrome.storage.local`; tomorrow SQLite via `tauri-plugin-sql`. | Schema definitions (those live in shared domain models). |
| **Shared Domain Models** (`@h2o-studio/types`, `@h2o-studio/core`) | Record shapes for chat, turn, snapshot, project, folder, label, tag, category, capture, import; normalizers and migrations. | Storage backend choice. UI components. |
| **Identity Surface** (`surfaces/identity/`) | Auth UI and token state. | Studio cannot perform auth directly; it consumes `H2O.Identity` state via events only. |

## What Studio Owns

Concretely, Studio owns these modules under `surfaces/studio/`:

- **Workspace runtime** — `S0F0a` Library Surface Host, `S0F1a` Library Core, `S0F1b` Library Workspace, `S0F1c` Library Index, `S0F1d` Library Insights, `S0F1e` Library Store, `S0F1f` Library Maintenance, `S0F1g` Chat Registry, `S0F1h` Library Sync.
- **Knowledge features** — `S0F2a` Projects, `S0F3a` Folders, `S0F4a` Categories, `S0F5a` Tags, `S0F6a` Labels.
- **Reader decorations** — `S1A1a–S1A1f` MiniMap, `S1A2a` Answer Wash, `S1A3a` Highlight Dots, `S2A1a` Question Wrapper, `S2B1a` Quote Tracker, `S2C1a` Question Wash, `S1C1a` Turn Title Bar, `S2Z1a`/`S1Z1a` Timestamps, `S1X1a` Answer Numbers, `S3H1a` Highlights Engine, `S9D1a` Auto Emoji Title.
- **Reader shell** — `studio.html`, `studio.js`, `studio.css`.
- **Studio-side bus & primitives** — `S0A1a` H2O Core (Studio variant), `S0A2a` Observer Hub (Studio variant).
- **Studio-side capture host** — `S0D3a` Transcript Archive Engine, `S0D3e` Transcript Studio Host.
- **Command palette** — `S0X1a` Command Bar, `S0X1b` Library Commands.
- **Sidebar** — `S0Z1f`/`S0Z1g`.

Studio does **not** own `surfaces/desk/` (live chatgpt.com decoration), `surfaces/identity/`, the service worker (`bg.js`), or content scripts (`loader.js`).

## Reader Visual-Parity Convention (load-bearing invariant)

Studio renders captured chats inside `studio.html` using the **same `data-*` attribute names ChatGPT uses on its live page**: `data-message-id`, `data-message-author-role`, `data-testid="conversation-turn"`, etc. This is intentional: it lets the decoration engines (MiniMap, Highlights, Wash, Timestamps, Answer Numbers) run unchanged on either chatgpt.com (native variant) or Studio's replay (Studio variant) by querying the same selectors.

Implication: **the decoration engines in `surfaces/studio/` query `studio.html`'s own DOM via `document.querySelector` — they do not, and cannot, reach chatgpt.com's DOM** (different origin, different context). The same selectors work because Studio's replay is shaped that way on purpose.

If ChatGPT ever renames its data attributes, two things move together: (a) the live capture extension's selectors, and (b) Studio's replay renderer must keep emitting the legacy attribute name (or both) so existing captures remain readable. Selector constants are documented in `STUDIO_CAPTURE_BOUNDARY.md` and must be centralized in one place — never sprinkled across decoration files.

## Runtime Today vs Future

```
TODAY (MV3 extension)
─────────────────────
chatgpt.com content scripts (capture)
  → service worker (bg.js) archive bridge
  → chrome.storage.local + IndexedDB
  → chrome.storage.onChanged
  → Library Sync (S0F1h) inside studio.html
  → Library Index/Workspace/Insights/Reader

FUTURE (Tauri desktop app + slim capture extension)
───────────────────────────────────────────────────
chatgpt.com content scripts (capture, in a slim browser extension)
  → native messaging / localhost endpoint
  → Tauri command (Rust side)
  → SQLite (tauri-plugin-sql)
  → Tauri event channel
  → Library Sync (Studio side) inside Tauri WebView
  → Library Index/Workspace/Insights/Reader
```

Studio feature code in both pictures is **the same code**. Only the adapters under it change.

## Boundaries That Must Hold

1. **Studio feature code must not call platform APIs directly.** No `chrome.*`, no `localStorage.*`, no `indexedDB.*`, no `fetch('/api/...')` for persistence, no `chrome.runtime.sendMessage` in feature files. All such access routes through the Platform Adapter and/or StudioStore. See `STUDIO_PLATFORM_ADAPTER_GUIDE.md`.
2. **Studio does not capture from ChatGPT.** Studio consumes normalized records from a CaptureSource interface. Today the capture pipeline lives in the live content scripts + archive bridge; tomorrow the same interface is fed by a slim browser extension via Tauri IPC. See `STUDIO_CAPTURE_BOUNDARY.md`.
3. **Storage goes through StudioStore.** No scattered storage calls in feature files. Records have versioned shapes that can be mapped to SQLite tables. See `STUDIO_STORAGE_CONTRACT.md`.
4. **Messaging inside Studio uses `H2O.events`.** Direct extension messaging (`chrome.runtime.sendMessage`) is allowed only inside the Platform Adapter, never in feature code. Cross-surface sync goes through the Library Sync façade, which is itself adapter-backed.
5. **Replay DOM uses ChatGPT-compatible data attributes.** Selectors are centralized; feature code uses named selector constants rather than literal CSS strings.
6. **The Tauri-readiness checklist (`STUDIO_DEVELOPMENT_RULES.md`) is consulted before adding any new feature.**

## Why This Matters Now (Not Later)

Porting Studio is cheap if the boundaries hold and expensive if they don't. Two years of "just call `chrome.storage.local.set` inline" is the difference between a weekend port and a multi-month rewrite. The contracts in the companion docs cost very little to follow today — one indirection per call site — and remove the largest categories of port-time work.

This document is the entry point. Read it once. Then read the companion docs for concrete rules.
