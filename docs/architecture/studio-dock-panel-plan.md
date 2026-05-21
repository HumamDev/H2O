# Studio Dock Panel — Plan

Status: Phase 0A landed (this document). Subsequent phases not started.
Audience: anyone planning, reviewing, or implementing the Dock Panel port to Studio.
Companion docs:
- `src-surfaces-base/studio/STUDIO_DOCK_PANEL_CONTRACT.md` — source-of-truth ownership, per-feature conflict rules, UI-state-never-syncs rule, Capture/Smart-Highlight V1 stance.
- `docs/contracts/studio-dock-tab-registration.md` — Studio-local `H2O.Studio.dock.registerTab` contract (mirrors observed native shape; **not** a shared cross-surface contract yet).
- `src-surfaces-base/studio/dock/README.md` — placeholder for the (not-yet-created) `dock/` runtime modules, with the Phase 0B coding pattern.
- `src-surfaces-base/studio/STUDIO_STORAGE_CONTRACT.md` — entity store contracts; cross-references this plan in its companion-doc section.

## Goal

Give Studio the same user-facing Dock Panel feature set as the native chatgpt.com extension surface — Highlights, Bookmarks, Notes, Attachments, Navigator, Context, Capture, Finder — without copy-pasting native UI logic and without breaking the existing native surface. The Command Bar remains the system/diagnostic surface; the Dock Panel remains the user-feature surface; they do not duplicate each other.

## Non-goals (V1)

- No live capture from chatgpt.com inside Studio (Studio reads snapshots; the live capture extension remains the only writer of new turns).
- No mutation of snapshot turn records from Studio. Feature state (highlights, notes, bookmarks, …) attaches to the **chat record** by canonical chat id (`ChatRecord.externalId`), never to the snapshot itself.
- No shared cross-surface `H2O.Feature.dock.register` contract yet. Studio builds its own `H2O.Studio.dock.registerTab` that mirrors the observed native shape; native is untouched.
- No fullBundle.v2 schema extension for feature state in early phases. Bundle extension is deferred to Phase 5.
- No Studio Capture writes in V1. The Capture tab is shown but inert.
- No Smart Highlight re-scoring in Studio V1. Existing runs render as read-only restore inside the Highlights tab.

## Evidence audit (Phase 0A baseline)

All claims about file paths, storage keys, and APIs are grounded in `rg` evidence captured at the time this doc landed. Future phases must re-verify before touching a file.

### Confirmed via grep

| Claim | Evidence (file:line) |
|---|---|
| Native Dock Panel exposes `H2O.Dock` / `H2O.PanelSide` legacy bridge | `src-runtime-base/3A1a.🟧🎖️ Dock Panel 🎖️.js:337-338` — `H2O.Dock = H2O.Dock \|\| H2O.PanelSide \|\| {}; H2O.PanelSide = H2O.Dock;` |
| Native tabs register via `Dock.registerTab` (resolved through legacy bridge) | `src-runtime-base/3B2a.🟠⭐ Bookmarks Tab ⭐.js:1500`, `src-runtime-base/3V2a.🟠🧭 Navigator Tab 🧭.js:251`, `src-runtime-base/3N2a.🟠🗒️ Notes Tab 🗒️.js:1926` — each does `const Dock = H2O.Dock \|\| H2O.PanelSide \|\| null;` then `Dock.registerTab(...)`. |
| Dock Panel state key constant (template-constructed) | `src-runtime-base/3A1a.🟧🎖️ Dock Panel 🎖️.js:33,72` — `PID = 'dckpnl'`; `KEY_DPANEL_STATE_PANEL_V1 = ${NS_DISK}:state:panel:v1` resolves to `h2o:prm:cgx:dckpnl:state:panel:v1`. |
| Legacy Dock Panel key + migration marker | `src-runtime-base/3A1a.🟧🎖️ Dock Panel 🎖️.js:73` `ho_hl_panel_state_v1`; `:74` `h2o:prm:cgx:dckpnl:migrate:panel_state:v1`; migration block `:303-316`. |
| Highlights canonical key (shared by native + Studio) | `src-runtime-base/3H1a.🟧🖌️ Highlights Engine 🖌️.js:75`; `src-surfaces-base/studio/S3H1a. 🎬 Highlights Engine - Studio.js:75`; `src-surfaces-base/studio/store/highlights.js:50` — resolves to `h2o:prm:cgx:nlnhghlghtr:state:inline_highlights:v3`. |
| Bookmarks key | `src-runtime-base/3B1a.🟧🌟 Bookmarks Engine 🌟.js:26,42,145` — PID `bkmrksngne`; per-chat key `${NS_DISK}:state:bookmarks_${id}:v1` resolves to `h2o:prm:cgx:bkmrksngne:state:bookmarks_${chatId}:v1`. |
| Notes + scratch keys | `src-runtime-base/3N1a.🟧🖋️Notes Engine🖋️.js:80-81,177-178` — `h2o:prm:cgx:ntsngn:store:notes:v1:${chatId}` and `h2o:prm:cgx:ntsngn:store:scratch:v1:${chatId}`. |
| Navigator key | `src-runtime-base/3V1a.🟧🧭 Navigator Engine 🧭.js:22,27,84` — PID `nvgngn`; key `h2o:prm:cgx:nvgngn:state:navigator:v1:${chatId}`. |
| Context keys | `src-runtime-base/3W1a.🟧🧠 Context Engine 🧠.js:37-40` — meta `h2o:prm:cgx:ctxeng:meta:v1`; items / ui / history per-chat. |
| Capture root namespace + migration marker | `src-runtime-base/3X1a.🟧🧷 Capture Engine 🧷.js:20` (NS `h2o:prm:cgx:capture`); `src-runtime-base/3X2a.🟠🧷 Capture Tab 🧷.js:28` (`…:migrate:slot8-to-slot7:v1`). |
| Finder UI key | `src-runtime-base/3Y2a.🟠🔎 Finder 🔎.js:59` — `h2o:prm:cgx:finder:ui:v1:${chatId\|default}`. |
| Studio side already has `H2O.Studio.store.highlights` | `src-surfaces-base/studio/store/highlights.js` (full module); loaded via `src-surfaces-base/studio/studio.html:200`. README at `src-surfaces-base/studio/store/README.md:53-100` documents the API. |
| `H2O.Studio.dock` not yet defined | `rg "H2O\.Studio\.dock"` returns zero matches. |
| studio.html has no Dock container | `rg "wbDock\|studioDock"` returns zero matches. |

### Corrections to earlier scoping

1. **`h2o:prm:cgx:dckpnl:state:panel:v1` is real**, but **template-constructed** at runtime. Future verification must grep constant names (`KEY_DPANEL_STATE_PANEL_V1`) or PIDs (`'dckpnl'`) in addition to literal strings.
2. **`keyDockBgMode / AfterSaveMode / ImportantOnly / InfoOpen` are not in 3A1a Dock Panel.** They live in `src-runtime-base/0D3a.⬛️🗄️ Transcript Archive Engine 🗂️🗄️.js:1663-1681` (and Studio twin `S0D3a:878-896`). They describe the Archive Engine's dock-like Command-Bar mirroring, not the Dock Panel shell. **No Phase 0/1 work touches them.**
3. **`H2O.Dock.registerTab` interface is observable but not declared**: it is a runtime-added property on the legacy bridge (`3A1a:337`), called by tab files. The Studio-local API must mirror the observed call sites only — see `docs/contracts/studio-dock-tab-registration.md`.

### Still unverified (re-verify at the start of the relevant phase)

- Smart Highlight key names (`h2o.sh.runs`, `h2o.sh.overrides`) and the read path.
- Bookmarks engine's snapshot-text capture (cap, polling).
- Capture Engine internal key shape.
- Attachments Tab DOM dependencies.
- Whether any engine calls `chrome.*` / `GM_*` / `fetch` directly.

## Constraints applied (revision)

1. Phase 0 split: 0A docs-only (this PR); 0B constants-only, in a new Studio-local file (not in 3A1a).
2. No native runtime edits in any Phase 0 PR; in particular, no edits to `src-runtime-base/3A1a.🟧🎖️ Dock Panel 🎖️.js`.
3. All file/key/event claims grep-verified before code change; future phases re-verify per-feature.
4. Studio-local `H2O.Studio.dock.registerTab` is the first dock API — **no shared cross-surface contract yet**.
5. Notes body and scratchpad use **preserve-both with conflict flag**, not pure LWW. See conflict rules in the contract doc.
6. fullBundle.v2 feature-state extension is deferred to Phase 5.
7. Capture stays disabled and Smart Highlight stays read-only in Studio V1.

## Phased plan

### Phase 0A — Docs and inventory only (this PR)

- Land four `.md` files (this plan, `docs/contracts/studio-dock-tab-registration.md`, `src-surfaces-base/studio/dock/README.md`, `src-surfaces-base/studio/STUDIO_DOCK_PANEL_CONTRACT.md`).
- Append a cross-reference section to `src-surfaces-base/studio/STUDIO_STORAGE_CONTRACT.md`.
- Zero `.js` edits, zero `studio.html` edits, zero native edits, zero edits to `3A1a`.
- Validation: `git diff --name-only | grep -v '\.md$'` must be empty.

### Phase 0B — Constants-only refactor in a new Studio-local file

- New file: `src-surfaces-base/studio/dock/dock-keys.js`.
- IIFE that attaches `H2O.Studio.dock = H2O.Studio.dock || {}` and `H2O.Studio.dock.keys = Object.freeze({...})` plus `H2O.Studio.dock.events = Object.freeze({...})`. **No `export const`** — studio.html loads plain script tags, not modules (see Phase 0B coding pattern in `src-surfaces-base/studio/dock/README.md`).
- All constants are duplicate string literals of native values (template assemblies resolved), each with a paired `rg` evidence cite in the PR body.
- One script-tag line added to `studio.html` after `platform/*.js` and before `store/*.js`. (This is the only `studio.html` edit in Phase 0B.)
- No edits to `3A1a` or any other native file. No edits to existing Studio engines.

### Phase 1 — Studio-local Dock namespace + per-feature read-only stores

- **1a**: `H2O.Studio.dock` namespace (`dock-shell.studio.js`), with `registerTab / getTab / tabs / mount / unmount / open / close / toggle / setView / state / events`. `mount/open/close` are no-ops in 1a; the API just exists.
- **1b**: `store/prefs.js` for Studio Dock UI state (open / view / width). Keys prefixed `h2o:studio:dock:*` — distinct from native panel state.
- **1c–1f**: Per-feature read-only entity stores under `store/` (Context, Bookmarks, Notes, Navigator), modeled on `store/highlights.js`. Read-only; cross-context sync via `platform.broadcast.onAnyChange`.
- Finder is intentionally **not** a store; it composes other stores (built as tab UI in Phase 2).

### Phase 2 — Studio Dock Panel UI (read-only mirror)

- New container in `studio.html`: `aside id="studioDock"` inside a new `.wbStageBody` flex wrapper around `.wbMain`.
- CSS for Dock, rail, tab head, tab body.
- Tab files in `src-surfaces-base/studio/dock/tabs/`: highlights, bookmarks, notes, attachments, navigator, context, finder, capture (inert placeholder).
- Reader-route gating: Dock only meaningful when route is `#/read/<snapshotId>`.
- Boot self-check that surfaces missing modules in console + Command Bar.

### Phase 3 — Selected write-back (one feature at a time, behind flags)

- 3a Bookmarks (LWW on existence; `snapText` write-once).
- 3b Highlights write paths from the tab (shared key already works; just wires UI).
- 3c Context (LWW per item; history append-only).
- 3d Navigator (LWW per node-id per field).
- 3e Notes (**preserve-both with conflict flag** for body and scratchpad; LWW for tags / pinned; anchor immutable).

### Phase 4 — Hardening

- Monotonic clock helper replaces `Date.now()` in merge paths.
- `_meta.source` on every cross-surface blob write.
- Soft-delete + tombstone audit.
- Orphan-anchor UX.
- Conflict diagnostics surfaced in Studio Command Bar.

### Phase 5 — fullBundle.v2 feature-state extension (deferred per constraint 6)

- Optional fields in v2 schema per entity. Round-trip CI tests. Backwards-compat additive merge.

### Phase 6 — Cleanup

- Migrate `editOverrideText` legacy `(snapshotId, turnIdx)` key onto `TurnRecord.editOverrideText`.
- Smart Highlight V2 decision.
- Capture re-enable for live-linked chats only, with documented policy.
- Earliest consideration of a shared cross-surface dock contract.

## Files this plan introduces

In this Phase 0A PR:
- `docs/architecture/studio-dock-panel-plan.md` (this file).
- `docs/contracts/studio-dock-tab-registration.md`.
- `src-surfaces-base/studio/dock/README.md`.
- `src-surfaces-base/studio/STUDIO_DOCK_PANEL_CONTRACT.md`.
- Appended section in `src-surfaces-base/studio/STUDIO_STORAGE_CONTRACT.md` (cross-reference only).

Not in this PR:
- Any `.js` file.
- `studio.html`.
- Any `src-runtime-base/*` file, including `3A1a`.
