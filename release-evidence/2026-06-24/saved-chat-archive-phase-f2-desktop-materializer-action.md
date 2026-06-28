# Saved Chat Archive — Phase F.2 Desktop Materializer Operator Action

Date: 2026-06-28

Status: F.2 DESKTOP MATERIALIZER OPERATOR ACTION — PASSED

Lane: Chat Saving Architecture (Phase F — materialization trigger).

This slice adds the **first trigger** for the existing D.2C materializer: a
focused, Desktop-only **operator action** that invokes
`H2O.Studio.ingestion.materializeSavedChatArchiveRequestV1({ requestId })` for an
explicit, validated request — surfaced as a clearly-separated card beneath the
read-only Archive Health diagnostics, leaving that diagnostics surface read-only.

## Baseline

```text
5f267bd  docs(studio): close saved chat archive phase e
046089a  docs(studio): define archive materializer trigger contract   (F.0)
b8660f2  test(studio): validate archive materializer trigger boundary  (F.1)
```

## Investigation Summary

F.0/F.1 established that the materializer already exists (D.2C,
`saved-chat-archive-materializer.tauri.js`) and is Desktop/Tauri-only, idempotent,
eligibility-gated (`validated` → write; `written` → `already-written`; everything
else → `not-eligible`; absent → `not-found`), writer-bounded
(`writeSavedChatPackageV1({ snapshotId, overwrite:false })`, queue-table-only),
and free of Chrome/sync/watcher coupling — but **no caller invoked it**. F.2 is
therefore the *trigger*, not the writer.

Two existing Desktop-only, read-only surfaces were available to build on:

- `listSavedChatArchiveRequestsV1({ status, limit })`
  (`saved-chat-archive-requests.tauri.js`) — returns validated/other queue rows
  with `requestId`, `source.title`, and `desktopResolution.snapshotId`. Reused to
  populate the operator's **validated-row selection** (read-only, no new SQL).
- The read-only Archive Health card (`archive-health-ui.studio.js`,
  `renderArchiveHealthCard`) — has a natural post-`render()` append point. The C5
  diagnostics module and the health UI both forbid mutation, so the trigger had to
  be a **separate** wiring, not folded into diagnostics.

The F.0 contract decision **(a)** (DB row authoritative, no Chrome change in
F.1–F.3) is honored: this action updates only the queue row via the materializer
and writes no Chrome-visible receipt. Chrome badge semantics are untouched (that
is gated behind the conditional F.4).

## Implementation Summary

A new focused module owns the action; the read-only health card only delegates a
single sibling-mount call to it.

### New module — `saved-chat-archive-materializer-action.studio.js` (`0.1.0-phase-f-2`)

- **Namespace** `H2O.Studio.archiveMaterializerAction` (IIFE + `__installed`
  guard, `.studio.js` so it loads on all surfaces and gates the action at
  runtime — like the health UI).
- **Desktop gate** — `detectTauri()` (same `__TAURI_INTERNALS__` / `__TAURI__`
  check the materializer uses) **and** presence of
  `materializeSavedChatArchiveRequestV1`. `isDesktopCapable()` combines both. On
  Chrome the materializer is absent, so the card renders
  *"This operator action is available in Desktop Studio only."* and the buttons
  are disabled — it does **not** early-`return`, so the card is always visible.
- **Explicit input only** — a free-text `requestId` field (paste), plus a
  **"Load validated requests"** button that calls
  `listSavedChatArchiveRequestsV1({ status: 'validated', limit: 100 })` and
  populates a `<select>` of validated rows; choosing one fills the input. Only
  `validated` rows are ever offered — duplicates / rejected / needs-snapshot rows
  are never selectable; the materializer's own eligibility gate guards free-text.
- **The one trigger** — **"Materialize package"** invokes
  `ing.materializeSavedChatArchiveRequestV1({ requestId })`. `overwrite` is never
  passed (materializer default `false` stands). No scanner call, no automatic
  trigger, no `setInterval`/`setTimeout`/`MutationObserver`/`requestAnimationFrame`.
- **Result display** — a pure `formatMaterializeResult(result)` maps the
  materializer result to a status pill + note + detail rows. On `written` /
  `already-written` it shows `packagePath`, `contentHash`, `snapshotId`,
  `schemaVersion`, `writtenAt`; on `failed` it shows the `error`. Statuses
  covered: `written`, `already-written`, `failed`, `needs-desktop-snapshot`,
  `db-unavailable`, `not-eligible`, `not-found`, plus the local pre-call states
  `desktop-only` and `invalid-state`.
- **Mount** — `mountArchiveMaterializerActionCard(healthContainer)` inserts the
  action card as a **sibling** *after* the health container (not a child — the
  health card's `render()` does `innerHTML = …` and would otherwise wipe it).
  Idempotent (reuses an existing `[data-archive-materializer-action-mount]`
  sibling).

### Read-only-preserving delegation — `archive-health-ui.studio.js`

One try/wrapped block added immediately after the health card's `render()` (and
after the existing `typeof document === 'undefined'` guard), delegating to
`H2O.Studio.archiveMaterializerAction.mountArchiveMaterializerActionCard(container)`.
The health card performs **no** mutation and still never references the
materializer or the package writer; it only mounts the separate operator card as
a sibling. (Confirmed: the health-UI validator's banned-token and "no action
label / no package action button" scans stay green — the delegation uses only
`mount…`/`actionApi` tokens, none of which are banned.)

### Wiring — `studio.html` + `pack-studio.mjs`

- `studio.html`: one `<script src="./ingestion/saved-chat-archive-materializer-action.studio.js">`
  added in the archive-ingestion block (loaded before the health card renders).
- `pack-studio.mjs`: the module added to **both** packed file lists.

### UI / action location & Desktop gate (recap)

| Aspect | Value |
|---|---|
| Location | Settings → Diagnostics, **sibling card directly below** the read-only "Saved Chat Archive Health" card |
| Heading | "Materialize Saved Chat Archive Request" · eyebrow "Operator action · Desktop only" |
| Desktop gate | `detectTauri()` **and** materializer fn present; non-Desktop shows a disabled "Desktop Studio only" card |
| Input | free-text `requestId` + "Load validated requests" → `<select>` of `validated` rows |
| Trigger | "Materialize package" → `materializeSavedChatArchiveRequestV1({ requestId })` |
| No global button | ✓ — the card only exists inside the Diagnostics panel |
| No automatic trigger | ✓ — action requires an explicit click; no scanner call, no timers/watchers |

## Validator Changes

`validate-saved-chat-archive-materializer-trigger-v1.mjs` — the F.1
point-in-time gate was **flipped**:

- **Removed** the `[F.1-GATE]` "no operator trigger wired yet: Archive Health UI
  does not call the materializer" check.
- **Added** 8 `[F.2]` checks asserting the bounded operator action:
  module exists / registers `archiveMaterializerAction` / is loaded + packed;
  invokes `materializeSavedChatArchiveRequestV1({ requestId … })` with **no**
  `overwrite:true`; is Desktop/Tauri capability-gated; does **not** call the
  scanner (`scanSavedChatArchiveRequestInboxV1`) and only lists `validated` rows;
  has **no** `setInterval`/`setTimeout`/`MutationObserver`/`requestAnimationFrame`
  watcher/poller; surfaces the full result vocabulary + `invalid-state`; has no
  writer/Chrome/sync/webdav/native coupling; and that the Archive Health UI
  **delegates** (`mountArchiveMaterializerActionCard`) yet still calls neither the
  materializer nor the writer.
- **Relabeled** the diagnostics-read-only and S0F0j/S0F1j-unwired gates from
  `[F.1-GATE]` to `[INVARIANT]` (they are now permanent boundaries — the action
  lives in its own module, not in diagnostics or the mega-files).
- All permanent `[INVARIANT]` boundaries from F.1 are preserved unchanged.

## Files Changed

- `src-surfaces-base/studio/ingestion/saved-chat-archive-materializer-action.studio.js` (new — operator action module)
- `src-surfaces-base/studio/ingestion/archive-health-ui.studio.js` (one sibling-mount delegation block; read-only boundary preserved)
- `src-surfaces-base/studio/studio.html` (one `<script>` loader in the archive-ingestion block)
- `tools/product/studio/pack-studio.mjs` (module added to both packed file lists)
- `tools/validation/studio/validate-saved-chat-archive-materializer-trigger-v1.mjs` (F.1 gate flipped to F.2 bounded-action assertions)
- `release-evidence/2026-06-24/saved-chat-archive-phase-f2-desktop-materializer-action.md` (this note)

No materializer / scanner / package writer / projector / CAS / store / Chrome /
capabilities / sync code was modified. No `studio.js` / `S0F0j` / `S0F1j` edits.

## Validation Results

```text
node --check (action module, health-ui, trigger validator, pack-studio)   all OK
validate-saved-chat-archive-materializer-trigger-v1.mjs   PASS 24 checks (16 [INVARIANT] + 8 [F.2])
validate-studio-archive-health-ui.mjs                     all 19 checks passed
validate-saved-chat-archive-status-v1.mjs                 PASS 19 checks
validate-saved-chat-archive-status-badge-v1.mjs           PASS 30 checks
validate-saved-chat-archive-request-inbox-v1.mjs          all 20 checks passed
validate-saved-chat-archive-materializer-v1.mjs (regress) all 14 checks passed
git diff --check / --cached --check                       clean (exit 0)
```

## Runtime Smoke — DEFERRED to F.3

The operator action is Desktop/Tauri-gated and invokes the Desktop-only
materializer, which performs a **real package write**. This environment can only
drive the Chrome extension (CDP port 9247); the Tauri WKWebView exposes no remote
debugging port, so the action cannot be executed from here, and a real write
would mutate the live Desktop archive store. Static + behavioral VM validation
(24 + 14 checks) covers the logic and boundaries; the live `validated → written →
already-written` proof is **F.3**, run by the operator in Desktop Studio DevTools:

```js
// Desktop Studio DevTools (Tauri). Pick a validated requestId, then:
const api = H2O.Studio.archiveMaterializerAction;
api.isDesktopCapable();                                   // expect true on Desktop
const list = await api.loadValidatedRequests({ limit: 5 });
const id = list[0].requestId;                             // an enqueued validated row
api.formatMaterializeResult(await api.materializeRequest({ requestId: id }));
// expect status:"written", package.packagePath + package.contentHash present;
// re-run the same id -> status:"already-written" (idempotent, nothing re-written).
```

## Boundaries Held

- **Archive Health diagnostics stays read-only** — the operator action is a
  separate module mounted as a sibling; the diagnostics/health surfaces perform no
  mutation and never reference the materializer or writer (validator-enforced).
- **No automatic materialization** — explicit click only; no scanner trigger, no
  watcher/poller/daemon/timer. Scanner stays enqueue-only.
- **No Chrome authority drift** — no Chrome runtime/service-worker change; Chrome
  performs no package/CAS/SQLite writes; badge semantics unchanged.
- **No forced overwrite** — the action passes only `{ requestId }`; the
  materializer default `overwrite:false` stands. Selection is restricted to
  `validated` rows; ineligible rows are routed through the materializer's own
  gate, never special-cased in the UI.
- **No sync / WebDAV / cloud / native messaging / localhost relay.**
- **No `studio.js` / `S0F0j` / `S0F1j` edits.** Action wired via the health-UI
  module delegation, not a `studio.js` mount call.
- **No unrelated files staged** — the in-progress sync-lane edit to `studio.html`
  was stashed before editing so only the F.2 `<script>` line is committed; the
  sync-lane change is restored to the working tree afterward.

## Verdict

**F.2 DESKTOP MATERIALIZER OPERATOR ACTION — PASSED.** The first materializer
trigger is a bounded, Desktop-only operator action that routes an explicit
validated `requestId` to the existing D.2C materializer and surfaces every result
status, while the Archive Health diagnostics surface remains read-only and no
automatic/scanner/watcher trigger exists.

## Recommended Next Step

Proceed to **F.3** runtime smoke: in Desktop Studio, drive a `validated` request
to `written` via this operator action, confirm the written package passes Archive
Health hash/asset validation and appears in the inventory, and re-run to prove
`already-written` idempotency (no duplicate `*.h2ochat`). The conditional Chrome
`queued-on-desktop` vs `package-written` distinction remains **F.4**, behind its
own contract amendment.
