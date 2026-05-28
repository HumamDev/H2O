# F10.5 — Bridge v2: Native ChatGPT Extension capture-store → Chrome Studio evidence preview

## Status

F10.5 is the second cross-platform bridge between native-extension data
and Chrome Studio under the F10.2 envelope contract. It is **evidence
only**: no merge, no apply, no write-back, no proposal, no remote apply,
no broadcast.

This document is the bridge's contract. The implementation lives in
[`src-surfaces-base/studio/sync/capture-evidence-preview.mv3.js`](../../../src-surfaces-base/studio/sync/capture-evidence-preview.mv3.js).

## Scope

| In | Out |
|---|---|
| Chrome Studio observes the native ChatGPT extension's existing capture-store data by reading the same backend the native Capture Engine (3X1a) writes — `localStorage` (primary) and `chrome.storage.local` (secondary native↔Studio wire) — strictly read-only. | Chrome Studio modifying any native-extension data. |
| Aggregates counts + structural metadata into a `kind: "evidence"` envelope per F10.2.0 §3.evidence. | Constructing any other envelope kind (no `proposal`, `applyEvent`, `conflictCandidate`, `bundle`, `preview`, `cacheMetadata`). |
| Operator-triggered one-shot diagnostic via `H2O.Studio.diagnostics.previewNativeCaptureAsEvidence()`. | Background polling, automatic refresh, daemon-like behavior. |
| Enumerates + reads native runtime's per-chat capture-store keys read-only from `localStorage` (where 3X1a persists them) and `chrome.storage.local`, merged by chatId. | Any `localStorage` write. Any `chrome.storage.local.set` / `.remove` call. Any write to native runtime state. |
| Real sha256 hashes computed via the browser's built-in `crypto.subtle.digest`. | Fake / placeholder hashes. |
| Returns a redacted diagnostic result containing the envelope + format-gate findings. | Any chrome.runtime broadcast of envelope content. Any new `MSG_*` chrome.runtime message type. |
| Reads the same verbatim key + backend as the read-only `H2O.Studio.store.capture` facade, but directly (the facade's `getStore()` is lazy/async — `null` on first synchronous call, unusable for a one-shot). | Modifying the facade. Any facade or native write method. |

## Public API

```ts
H2O.Studio.diagnostics.previewNativeCaptureAsEvidence(options?): Promise<{
  schema: 'h2o.studio.sync.native-capture-evidence-preview.v1';
  ok: boolean;
  redacted: true;
  envelope: CrossPlatformEvidenceEnvelope | null;
  observation: {
    chatsObservedCount: number;
    totalItemCount: number;
  };
  findings: { blockers: string[]; warnings: string[] };
  observedAtIso: string;
}>

options?: {
  nowIso?: string;             // override observedAt for tests; bridge
                                // never reads Date.now() when this is
                                // provided.
  chatIds?: string[];          // optional explicit chat-id list (restricts
                                // the localStorage / chrome.storage scan;
                                // useful for tests / scoped observation).
  maxChats?: number;           // override default 5000; clamped to 5000
                                // hard cap.
}
```

## Read path & cross-context note

The native Capture Engine (`src-runtime-base/3X1a`) runs in the
chatgpt.com **page world** (injected by `loader.js`) and persists each
per-chat store to `localStorage` under
`h2o:prm:cgx:capture:store:v1:<chatId>` (3X1a `saveStore` → `lsSet` →
`localStorage.setItem`). There is currently **no mirror of capture data
into `chrome.storage.local`** — unlike Library state, which uses a
`chrome.storage.local` broadcast wire (`S0F1h Library Sync`).

This bridge therefore reads `localStorage` first (the authoritative
backend the native engine writes and the `H2O.Studio.store.capture`
facade reads), all strictly read-only. When Studio runs in-page on
chatgpt.com it shares that origin and observes capture data directly
(`observationSource: "page-localStorage"`).

When Studio runs as a standalone packaged extension page
(`chrome-extension://…`, a *different* origin than chatgpt.com), its
`localStorage` does not contain the native capture keys. **F10.5.3
closes that gap** with a count-safe mirror (see below); the bridge then
reads the mirror digest from `chrome.storage.local`
(`observationSource: "native-mirror"`). Only if neither a page-localStorage
store nor a mirror digest is present does it warn `no-capture-stores-found`.

## F10.5.3 — Native capture mirror (implemented)

The standalone-Studio origin gap is bridged by a count-safe mirror that
reuses the same native↔Studio + cross-extension pipeline as `0F1h Library
Sync`.

**Pipeline (page → content bridge → prod storage → launcher → Studio):**

1. **`src-runtime-base/3X1c` Capture Mirror** (page world, loads after
   3X1a; `dependsOn` it in `config/loader-deps.json`). Subscribes to
   `W.H2O.Capture.onChange` (+ the `h2o:capture:changed` event); on boot
   and on debounced change (≈750 ms trailing, ≈5 s max-wait, skips a
   byte-identical digest) it enumerates `localStorage`
   `h2o:prm:cgx:capture:store:v1:*`, reads **only** `status / pinned /
   kind / createdAt / updatedAt`, SHA-256-hashes each chatId, builds the
   count-safe digest, runs a forever-no key guard, and emits it via the
   `h2o-ext-cs:v1:write` bridge (`window.postMessage` + the
   `h2o-ext-cs:write` document CustomEvent).
2. **`loader.js` content script** (`chrome-live-loader.mjs`) WATCHes the
   mirror key, persists it to **prod `chrome.storage.local`** (read by the
   prod extension's own Studio page) and **forwards** it cross-extension
   to the Studio Launcher (`forwardNativeCaptureMirrorToStudioLauncher` →
   `chrome.runtime.sendMessage(STUDIO_LAUNCHER_EXTENSION_ID, …)`).
3. **`bg.js`** (`chrome-live-background.mjs`) of the Studio Launcher
   receives `MSG_NATIVE_CAPTURE_MIRROR` via `onMessageExternal`
   (`handleExternalNativeCaptureMirrorMessage`) and writes the digest
   **verbatim** to the Launcher's own `chrome.storage.local`.
4. **F10.5 bridge** reads `chrome.storage.local["h2o:prm:cgx:capture:mirror:v1"]`,
   validates `schema === "h2o.prm.cgx.capture.mirror.v1"`, sanitizes every
   count/range, and builds the evidence payload from it.

**Mirror key:** `h2o:prm:cgx:capture:mirror:v1` (single key, overwritten
each change — no growth, atomic, trivial cleanup).

**Mirror digest shape (counts + hashes only):**

| Field | Type |
|---|---|
| `schema` | `"h2o.prm.cgx.capture.mirror.v1"` |
| `mirrorVersion` | integer (1) |
| `captureStoreVersion` | integer |
| `updatedAtIso` | ISO seconds UTC (mirror write time) |
| `chatsObservedCount` | integer |
| `totalItemCount` | integer |
| `itemsByStatus` | `{ new, reviewed, archived, converted, dismissed, other }` |
| `pinnedCount` | integer |
| `itemsByKindBucket` | `{ captureSnippetKind, otherKind }` |
| `timestampRangeIso` | `{ earliestCreatedAtIso, latestUpdatedAtIso }` |
| `chatsObservedHash` | sha256 hex over the sorted sha256(chatId) list |

**Privacy:** the mirror carries **counts and hashes only**. It never
mirrors `item.text / title / tags / routeSuggestion / source.role /
source.msgId / source.url / source.selectionText / convertedTo`, raw
`item.id`, or raw `chatId` (chatId is SHA-256 hashed; itemId is never
included, even hashed). 3X1c runs a forever-no key guard before every
emit; the F10.5 bridge runs its forever-no payload scan before emission.

**Rollback:** all additive and independently revertible — unregister
3X1c from `config/dev-order.tsv` + `loader-deps.json`; revert the
`chrome-live-loader.mjs` WATCHED/forward additions; revert the
`chrome-live-background.mjs` receiver; revert the bridge's mirror path
(it then falls back to localStorage-only). Optional one-time cleanup:
`chrome.storage.local.remove("h2o:prm:cgx:capture:mirror:v1")` in both
extensions.

**Runtime proof checklist:**

1. On chatgpt.com, capture one item.
2. In an extension context, `chrome.storage.local.get("h2o:prm:cgx:capture:mirror:v1")`
   → a count-safe digest; assert no `text`/`title`/`tags`/raw `chatId`.
3. In standalone Studio: `await H2O.Studio.diagnostics.previewNativeCaptureAsEvidence()`
   → `kind:"evidence"`, `chats>=1`, `items>=1`,
   `observationSource:"native-mirror"`, no raw/free-text payload keys.

## Constructed envelope shape

The bridge produces an `evidence` envelope conforming to F10.2.0 §2:

| Field | Value |
|---|---|
| `schema` | `"h2o.crossPlatform.envelope.v1"` (literal) |
| `envelopeVersion` | `"v1"` |
| `envelopeKindVersion` | `"v1"` |
| `kind` | `"evidence"` (literal) |
| `id` | Freshly generated UUID v4 per call |
| `lineageId` | Freshly generated UUID v4 per call |
| `createdAt` | `options.nowIso` if provided, else `new Date().toISOString()` truncated to seconds |
| `sequence` | `null` |
| `exportSequence` | `null` |
| `sourcePlatform.platformId` | `"chrome-studio"` — chrome-studio IS the envelope producer (honest attribution per F10.5 plan §3). The native extension is the SUBJECT of observation, not the producer. |
| `sourcePlatform.surfaceKind` | `"browser-studio"` |
| `sourcePlatform.sourcePeerEnvelope` | Empty-hash F2 shape; chrome-studio does not currently carry its own F2 redacted peer envelope. Format gate will surface this as `envelope-schema-too-new` until a future phase enriches chrome-studio's identity — same posture as F10.3 had pre-F10.3d. |
| `declaredAuthority` | `"preview-coordinator"` (chrome-studio's normal authority per F10.1) |
| `effectiveAuthority` | `"preview-coordinator"` (no downgrade) |
| `capabilityUsed` | `"produceEvidence"` (allowed for chrome-studio per F10.1 capability allowlist) |
| `capabilitySnapshotHash` | sha256 of `"h2o.platform.capabilities.v1#f10.5-bridge-v1"` |
| `subjectType` | `"native-extension.capture.observation"` |
| `subjectId` | The `chatsObservedHash` (a sha256 over the sorted sha256s of observed chat ids) |
| `operation` | `"native-extension-capture-observation"` |
| `redactionClass` | `"redacted"` |
| `dryRun` | `null` |
| `transactional` | `null` |
| `dedupeKey` | sha256 of canonical `{schema, purpose, platformId, kind, subjectType, operation, chatsObservedHash, totalItemCount, captureStoreVersion}` |
| `payloadHash` | sha256 of canonical `payload` |
| `eventDigest` | sha256 of canonical envelope minus `warnings`, `blockers`, `eventDigest` |
| `payload` | See [Allowed payload](#allowed-payload) |
| `warnings`, `blockers` | Empty arrays on the envelope (findings carried in the OUTER result.findings) |

### Allowed payload

The payload carries **counts and structural metadata only**. No
free-text fields. No raw chat IDs. No raw item IDs.

| Payload key | Type | Source |
|---|---|---|
| `observationKind` | string literal | `"native-extension.capture-state"` |
| `observedAtIso` | string (ISO seconds UTC) | call time or `options.nowIso` |
| `captureStoreVersion` | integer | `store.version` from the first observed store (currently 1 per Phase 1g) |
| `chatsObservedCount` | integer | Count of chats whose store was successfully read |
| `totalItemCount` | integer | Sum of `store.items.length` across observed chats |
| `itemsByStatus` | `{ new, reviewed, archived, converted, dismissed, other: number }` | Per-status counts (unknown statuses → `other`) |
| `pinnedCount` | integer | Count of `item.pinned === true` |
| `itemsByKindBucket` | `{ captureSnippetKind, otherKind: number }` | Coarse bucket. The native kind `"text"` (default) is counted as `captureSnippetKind`; everything else as `otherKind`. The key name `captureSnippetKind` is deliberate — the literal `text` is never used as a payload key name per the F10.2.0 §5.3 forever-no deny list. |
| `timestampRangeIso` | `{ earliestCreatedAtIso, latestUpdatedAtIso: string \| null }` | Min `createdAt` and max `updatedAt` across observed items, converted to ISO seconds UTC. `null` for empty observation. |
| `chatsObservedHash` | string (sha256 hex) | sha256 of the canonical-sorted list of sha256(chatId). Lets a consumer detect "same set of chats observed" without seeing raw chat IDs. |
| `observationSource` | string | `"page-localStorage"` (read directly from page-origin localStorage) or `"native-mirror"` (read from the F10.5.3 count-safe mirror digest in `chrome.storage.local`). |
| `warningsObserved` | string[] | Code strings from a fixed allowlist (e.g. `no-capture-stores-found`, `capture-store-read-errors`). |

## Forbidden payload data

The bridge **never** copies any of the following capture-item fields
into the envelope payload, under any path. The first defense is the
bridge's per-item aggregation function that only reads `status`,
`pinned`, `kind`, `createdAt`, and `updatedAt`. The second defense is
the defensive forever-no key-name scan run on the constructed payload
before emission.

| Forbidden field on capture items | Why |
|---|---|
| `item.text` | Captured chat-snippet text — IS user content. F10.2.0 forever-no list rejects key name `text` regardless. |
| `item.title` | User-edited capture title — can contain content excerpts. |
| `item.tags` | User-typed tags — free text. |
| `item.routeSuggestion` | User-typed or model-generated routing hint — free text. |
| `item.source.role` / `item.source.msgId` | Per-message attribution / leakage vector. |
| `item.convertedTo` | Reference to a converted artifact — could include link/path. |
| `item.id` (raw) | Capture item ID. |
| `chatId` (raw) | Chat ID — only the sha256 aggregate `chatsObservedHash` is emitted. |

The defensive payload scan additionally refuses any object key matching
the F10.2.0 forever-no list (`content`, `body`, `text`, `messages`,
`attachments`, `url`, `path`, `password`, `apiKey`) or any key ending
in `Token` other than literally `previewToken`. If any such key
surfaces, the bridge sets `findings.blockers: ["payload-contains-forever-no-field"]`,
returns `envelope: null`, and emits no envelope at all — defense in
depth against any future regression.

## Result-level findings

The outer result's `findings.warnings` may include:

| Warning code | Meaning |
|---|---|
| `web-crypto-unavailable` | `crypto.subtle.digest` is not present in this context. |
| `capture-storage-unavailable` | Neither `localStorage` nor `chrome.storage.local` is reachable in this context. |
| `capture-store-enumeration-failed` | A `localStorage` key scan or `chrome.storage.local.get(null, ...)` threw / returned an unusable value. |
| `no-capture-stores-found` | No capture-store keys were found in either backend. Empty observation. Envelope is still emitted with zero counts. (In the standalone-extension-page topology this is expected — see [Read path & cross-context note](#read-path--cross-context-note).) |
| `capture-store-read-errors` | One or more per-chat store values failed to read / JSON-parse. Counted, not surfaced verbatim (no value text in the envelope). |

The outer result's `findings.blockers` may include:

| Blocker code | Meaning |
|---|---|
| `envelope-schema-too-new` | A format gate on the constructed envelope failed. Chrome-studio's empty `sourcePeerEnvelope` triggers this until a future phase enriches the producer's F2 identity. |
| `payload-contains-forever-no-field` | Defensive guard: a forever-no field name appeared inside the constructed payload. The bridge never copies content into the payload, so this should never fire in practice. If it does, the envelope is suppressed entirely (`envelope: null`). |

Both code lists draw from the F10.2.0 `BLOCKER_CODES` set declared in
[`packages/cross-platform-envelope/src/constants.ts`](../../../packages/cross-platform-envelope/src/constants.ts).

## Safety invariants (enforced by the implementation and by F10.2.2 scans)

1. **No `@h2o/cross-platform-envelope` import at runtime.** The bridge
   inlines a minimal constants subset. F10.2.2 `scan-runtime-import-graph`
   (CP-10.1) verifies; `scan-kind-literal-drift` verifies the inlined
   `kind: 'evidence'` matches `ENVELOPE_KINDS`.
2. **No write of any kind.** No `chrome.storage.local.set` /
   `.remove`. No file write. No `chrome.runtime.sendMessage`. No native
   extension code path invoked.
3. **No new chrome.runtime message type.** No `MSG_*` constant
   introduced anywhere.
4. **No fake hashes.** All sha256 strings via `crypto.subtle.digest`
   over real inputs. Empty values for absent inputs (no placeholder
   hashes).
5. **No polling.** Operator-triggered diagnostic only. No
   `setInterval`. No long-lived event listeners.
6. **No raw text in payload.** The bridge's aggregation function only
   reads `status`, `pinned`, `kind`, `createdAt`, `updatedAt`. A
   defensive payload scan provides backstop coverage.
7. **No raw chat IDs in payload.** Only the aggregate
   `chatsObservedHash` (a sha256 over sorted sha256s).
8. **Idempotent install.** Declares
   `H2O.Studio.diagnostics.__nativeCaptureEvidencePreviewInstalled` and
   no-ops on duplicate load.

## What this bridge is not

- **Not a merge.** Native-extension capture data is never written into
  Studio's library or vice versa.
- **Not a producer of `proposal` / `applyEvent` / `conflictCandidate` /
  `bundle` / `preview` / `cacheMetadata` envelopes.** `evidence` only.
- **Not a bidirectional channel.** Native ext → Chrome Studio
  observation only.
- **Not a UI surface.** F10.5 ships the diagnostic accessor; F10.5.1
  (deferred, separately authorized) may add a Settings card later.
- **Not a CI integration.** No new CI YAML or git hook.
- **Not a native-extension change.** The native extension's `bg.js`,
  `loader.js`, `pilot-observer-page.js`, `folder-bridge-page.js`, and
  `manifest.json` are untouched.
- **Not a content-script injection.** No DOM observer of chatgpt.com
  pages.

## Rollback

F10.5 is structurally trivial to roll back:

1. The bridge is a single new JS file invoked only by operator
   diagnostic call. Deletion removes the diagnostic; no downstream
   reference.
2. No native-extension code change. Nothing to revert in `bg.js`.
3. No `chrome.storage` writes. Nothing to clean.
4. No `chrome.runtime` broadcasts. No mailbox to drain.
5. No build pipeline change. `pack-studio.mjs` modifications are
   additive and easily reverted.

```bash
git revert <F10.5-commit-sha>
# OR:
git rm src-surfaces-base/studio/sync/capture-evidence-preview.mv3.js
git rm docs/systems/cross-platform/bridge-v2-native-ext-capture-evidence.md
# Revert the studio.html and pack-studio.mjs hunks (one script tag + two manifest entries).
node tools/validation/cross-platform/run-cross-platform-repo-scan.mjs
node tools/validation/cross-platform/validate-cross-platform-envelope.mjs
```

Triggers warranting rollback:

- Bridge causes any `chrome.storage` write — **rollback immediately**.
- Bridge originates any `chrome.runtime.sendMessage` — **rollback immediately**.
- Bridge constructs any envelope kind other than `evidence` — **rollback immediately**.
- Bridge's payload contains chat text, message bodies, URLs, file paths, or any forever-no field name — **rollback immediately**.
- Bridge writes to `localStorage` or `chrome.storage`, or invokes any native-extension code path — **rollback immediately**.

## Deferred follow-ups

- **F10.5.1 — Settings card for the native-capture evidence diagnostic.**
  Analogous to F10.4's read-only card for the F10.3 bridge. Not yet
  authorized. Would mount a sibling card under Settings → Local Sync
  exposing the diagnostic via a Run preview check button.
- **F10.5.2 — Per-chat evidence aggregation.** Optional later enrichment
  that surfaces per-chat counts under hashed chat-id buckets while still
  not emitting any raw chat ID or text. Not yet authorized.
- **F10.5.3 — Native capture → `chrome.storage.local` mirror. Implemented.**
  See [F10.5.3 — Native capture mirror](#f1053--native-capture-mirror-implemented)
  above. A count-safe digest is mirrored from the chatgpt.com page world
  into `chrome.storage.local` (and cross-extension-forwarded to the Studio
  Launcher), so the standalone Studio's F10.5 bridge returns real capture
  counts (`observationSource: "native-mirror"`).

All deferrals respect the same hard boundaries: evidence only, no
write-back, no native-extension code change, no new `MSG_*` types.

## Phase status

| Phase | Status |
|---|---|
| F10.0 — cross-platform architecture | Accepted |
| F10.1 — platform capability manifest | Complete (`3bf253f`) |
| F10.2.0 — envelope spec | Complete (`febd731`, `92d3eb3`) |
| F10.2.1 — static helper | Complete (`a3fb7ac`) |
| F10.2.2 — repo validation scan | Complete (`7093801`) |
| F10.3 — bridge v1: Desktop bundle → Chrome envelope preview | Proven |
| F10.4 — operator UI for the bundle preview | Proven |
| **F10.5 — bridge v2: native-ext capture → Chrome evidence preview** | **Current** |
| F10.5.1 — Settings card for the capture-evidence diagnostic | Not authorized |
| F10.5.2 — per-chat evidence aggregation | Not authorized |
| **F10.5.3 — native capture → `chrome.storage.local` mirror** | **Implemented** |
| F10.6 — proposal flow | Not authorized |
| F10.7 — remote apply / write-back | Forbidden until separate safety model |
