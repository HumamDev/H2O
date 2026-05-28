# F10.3 — Bridge v1: Desktop `latest.json` → Chrome Studio bundle-envelope preview

## Status

F10.3 is the first cross-platform bridge between Desktop Studio and
Chrome Studio under the F10.2 envelope contract. It is **evidence /
preview only**: no merge, no apply, no write-back, no proposal, no
remote apply.

This document is the bridge's contract. The implementation lives in
[`src-surfaces-base/studio/sync/bundle-envelope-preview.mv3.js`](../../../src-surfaces-base/studio/sync/bundle-envelope-preview.mv3.js).

## Scope

| In | Out |
|---|---|
| Chrome Studio reads the existing Desktop-exported `~/H2O Studio Sync/latest.json` | Chrome Studio modifying the bundle |
| Construction of a `kind: "bundle"` envelope per F10.2.0 §3.bundle | Construction of any other envelope kind |
| Operator-triggered one-shot diagnostic via `H2O.Studio.diagnostics.previewLatestBundleAsEnvelopes()` | Background polling, automatic refresh, daemon-like behavior |
| Real sha256 hashes computed via the browser's built-in `crypto.subtle.digest` over real inputs | Fake or placeholder hashes (e.g. `"0000…"`) |
| Returning a redacted diagnostic result object with the envelope + format-gate findings | Any chrome.storage write or chrome.runtime broadcast of bundle content |
| Reusing the IndexedDB sync-folder handle that R2C `folder-import.mv3.js` already maintains, **read-only** | Calling any function in `folder-import.mv3.js` or invoking the merge path |
| Detecting absence of source data and surfacing it as findings | Inferring missing data and filling it with placeholders |

## Public API

```ts
H2O.Studio.diagnostics.previewLatestBundleAsEnvelopes(options?): Promise<{
  schema: 'h2o.studio.sync.bundle-envelope-preview.v1';
  ok: boolean;
  redacted: true;
  envelope: CrossPlatformBundleEnvelope | null;
  sectionCounts: {
    chats: number;
    snapshots: number;
    folders: number;
    labels: number;
    tags: number;
    categories: number;
  };
  findings: { blockers: string[]; warnings: string[] };
  bundleBytes: number;
  bundleSchema: string;
}>

options?: {
  maxBytes?: number;   // override default 16 MB; clamped to 64 MB hard cap
  nowIso?: string;     // override createdAt for tests; bridge never reads
                        // Date.now() when this is provided
}
```

## Constructed envelope shape

The bridge produces a `bundle` envelope conforming to F10.2.0 §2 with
the following invariants:

| Field | Value |
|---|---|
| `schema` | `"h2o.crossPlatform.envelope.v1"` (literal) |
| `envelopeVersion` | `"v1"` (literal) |
| `envelopeKindVersion` | `"v1"` (literal) |
| `kind` | `"bundle"` (literal) |
| `id` | Freshly generated UUID v4 per call |
| `lineageId` | Freshly generated UUID v4 per call |
| `createdAt` | `options.nowIso` if provided, else `new Date().toISOString()` truncated to seconds |
| `sequence` | `null` (bridge is not a sequenced producer) |
| `exportSequence` | Bundle's `sequenceNumber` if present, else `null` |
| `sourcePlatform.platformId` | `"desktop-studio"` |
| `sourcePlatform.surfaceKind` | `"desktop-tauri"` |
| `sourcePlatform.sourcePeerEnvelope` | See "Source peer envelope" below |
| `declaredAuthority` | `"strong-local-authority"` |
| `effectiveAuthority` | `"strong-local-authority"` (preview only; not consumer-validated against an external manifest in F10.3) |
| `capabilityUsed` | `"export"` |
| `capabilitySnapshotHash` | sha256 of the opaque tag `"h2o.platform.capabilities.v1#f10.3-bridge-v1"` — identifies the manifest version this bridge was compiled against |
| `subjectType` | `"latest-json-bundle"` |
| `subjectId` | The bundle's sha256 hash (from `bundle.contentSha256` if present, else sha256 of the file bytes) |
| `operation` | `"desktop-latest-json-export"` |
| `redactionClass` | `"redacted"` |
| `dryRun` | `null` |
| `transactional` | `null` |
| `dedupeKey` | sha256 of the canonical dedupe-input object: `{schema, purpose: "dedupeKey", platformId, kind, subjectType, operation, bundleSequence, bundleHash}` |
| `payloadHash` | sha256 of the canonical `payload` |
| `eventDigest` | sha256 of the canonical envelope minus `warnings`, `blockers`, and `eventDigest` |
| `payload.envelopes` | `[]` — F10.3 does **not** recursively enumerate envelopes inside the bundle. F10.3.1+ scope. |
| `payload.bundleSequence` | Bundle's `sequenceNumber` if present, else `0` |
| `payload.bundleHash` | The bundle's content sha256 (see `subjectId` above) |
| `payload.sectionCounts` | Per-section row counts (chats / snapshots / folders / labels / tags / categories) |
| `payload.bundleSchema` | Bundle's `schema` field (typically `"h2o.studio.fullBundle.v2"`) |
| `payload.exportSchemaVersion` | Bundle's `exportSchemaVersion` field |
| `warnings`, `blockers` | Empty arrays on the constructed envelope (findings carried in the OUTER result.findings) |

## Source peer envelope

The existing Desktop bundle does **not** carry an F2-shaped redacted
peer envelope with separate `physicalDeviceIdHash`, `installIdHash`,
and `syncPeerIdHash`. It only carries a single string field
`bundle.sourceSyncPeerId`. F10.3 handles this honestly:

| Field | Source in bundle | Bridge behavior |
|---|---|---|
| `syncPeerIdHash` | `bundle.sourceSyncPeerId` (string) | sha256 of the string — real data, real hash |
| `physicalDeviceIdHash` | **Absent** | Empty string. Bridge emits warning `source-peer-physical-device-id-absent-from-bundle`. Format gate correctly fails with `envelope-schema-too-new`. |
| `installIdHash` | **Absent** | Empty string. Bridge emits warning `source-peer-install-id-absent-from-bundle`. Format gate correctly fails. |
| `surfaceKind` | Inferred from bundle context | `"desktop-tauri"` |

**No fake placeholder hashes are written.** A consumer can recognize an
F10.3-constructed envelope by the empty-string fields plus the
explanatory warnings; both indicate the underlying bundle predates the
F10.2 peer-envelope shape. A future Desktop change that embeds the full
F2 redacted peer envelope into the bundle will let F10.3 emit `ok:
true` envelopes without code change to the bridge.

## Result-level findings

The outer result's `findings.warnings` may include:

| Warning code | Meaning |
|---|---|
| `web-crypto-unavailable` | `crypto.subtle.digest` is not present in this context; envelope cannot be constructed safely. |
| `no-sync-folder-handle` | No `FileSystemDirectoryHandle` persisted in IndexedDB. Operator must use the existing R2C folder-import setup first. |
| `sync-folder-permission-not-granted` | The persisted handle exists but the user has not granted read permission in this session. |
| `sync-folder-permission-check-failed` | `queryPermission` threw. The bridge proceeds and the read attempt may still fail. |
| `no-latest-json-in-folder` | The sync folder is reachable but does not contain `latest.json`. |
| `file-handle-read-failed` | `getFile()` threw. |
| `bundle-exceeds-byte-cap` | The bundle is larger than the cap. No envelope is produced. |
| `latest-json-decode-failed` | UTF-8 decode of the file bytes failed. |
| `latest-json-not-json` | `JSON.parse` threw. |
| `latest-json-not-object` | Bundle parsed but the top-level value is not a plain object. |
| `source-sync-peer-id-missing-from-bundle` | `bundle.sourceSyncPeerId` is absent or empty. |
| `source-peer-physical-device-id-absent-from-bundle` | The bundle does not carry F2 `physicalDeviceIdHash`. |
| `source-peer-install-id-absent-from-bundle` | The bundle does not carry F2 `installIdHash`. |
| `source-peer-sync-peer-id-not-sha256` | `sha256(bundle.sourceSyncPeerId)` did not yield a well-formed sha256 hex. |

The outer result's `findings.blockers` may include:

| Blocker code | Meaning |
|---|---|
| `envelope-schema-too-new` | A format gate on the constructed envelope failed. The peer-envelope absence triggers this until Desktop is extended. |
| `payload-contains-forever-no-field` | Defensive guard: a forever-no field name appeared inside the constructed payload. The bridge never copies content into the payload, so this should never fire in practice. |

Both code lists draw from the F10.2.0 `BLOCKER_CODES` set declared in
[`packages/cross-platform-envelope/src/constants.ts`](../../../packages/cross-platform-envelope/src/constants.ts).

## Safety invariants (enforced by the implementation and by F10.2.2 scans)

1. **No `@h2o/cross-platform-envelope` import at runtime.** The bridge
   inlines a minimal constants subset (`ENVELOPE_SCHEMA`,
   `'bundle'` kind literal, redaction class, format predicates). F10.2.2
   `scan-runtime-import-graph` (CP-10.1) verifies this; F10.2.2
   `scan-kind-literal-drift` verifies the inlined `kind: 'bundle'`
   matches `ENVELOPE_KINDS`.
2. **No write of any kind.** No `chrome.storage.local.set`, no file
   write, no `chrome.runtime.sendMessage` with bundle content, no
   call into `folder-import.mv3.js` merge.
3. **No fake hashes.** All sha256 strings are computed via
   `crypto.subtle.digest` over real inputs. Fields whose source data
   is absent from the bundle are left as empty strings.
4. **No polling.** Operator-triggered diagnostic only. No
   `setInterval`, no `addEventListener` on long-running events.
5. **No envelope enumeration.** `payload.envelopes: []` is the
   F10.3 contract. Recursive enumeration is F10.3.1+ scope.
6. **No content fields.** Chat / message / snapshot / attachment /
   URL / file-path / credential fields are never copied into the
   constructed envelope payload. A defensive scan on the payload
   guards against future regressions.
7. **Byte cap.** Default 16 MB, hard cap 64 MB. Larger bundles yield
   a warning and no envelope.
8. **Idempotent install.** The bridge declares
   `H2O.Studio.diagnostics.__bundleEnvelopePreviewInstalled` and
   no-ops on duplicate load.

## What this bridge is not

- **Not a merge.** The existing `folder-import.mv3.js` flow is the
  merge path; F10.3 does not call it.
- **Not a producer of `proposal` / `applyEvent` / `conflictCandidate`
  envelopes.** Chrome Studio's authority level is
  `preview-coordinator`; producing those kinds is forbidden by F10.1.
- **Not a bidirectional channel.** Chrome → Desktop is out of scope.
- **Not a UI surface.** F10.3 ships the diagnostic accessor; no UI
  changes.
- **Not a CI integration.** No new CI YAML or git hook.
- **Not a Desktop change.** The Desktop producer is untouched.
- **Not a mobile change.** Mobile is forever-no for write-back.
- **Not a native-extension change.** The native runtime tree is
  untouched.

## Runtime proof — 2026-05-27

The bridge has been proven end-to-end in live Chrome Studio against a
real Desktop-exported `~/H2O Studio Sync/latest.json`.

### Console result summary

```js
await H2O.Studio.diagnostics.previewLatestBundleAsEnvelopes()
// {
//   ok: true,
//   redacted: true,
//   envelope: { kind: "bundle", ... },
//   findings: { blockers: [], warnings: [] },
//   bundleBytes: <integer>,
//   bundleSchema: "h2o.studio.fullBundle.v2"
// }
```

The constructed envelope's `sourcePlatform.sourcePeerEnvelope` carried
all three sha256-hex hashes populated:

```js
envelope.sourcePlatform.sourcePeerEnvelope
// {
//   physicalDeviceIdHash: "<64-char lowercase sha256 hex>",
//   installIdHash:        "<64-char lowercase sha256 hex>",
//   syncPeerIdHash:       "<64-char lowercase sha256 hex>",
//   surfaceKind:          "desktop-tauri"
// }
```

### Exact meaning

The Desktop-side `latest.json` produced by
[`src-surfaces-base/studio/ingestion/export-bundle.tauri.js`](../../../src-surfaces-base/studio/ingestion/export-bundle.tauri.js)
is reachable from Chrome Studio's operator-triggered diagnostic, can
be wrapped as a valid F10.2.0 cross-platform `bundle` envelope, and
passes every format gate the bridge enforces. The F2 redacted peer
envelope round-trips correctly: Desktop hashes the raw F2 identity
fields at export time, Chrome reads the pre-computed hashes back, and
the envelope's `sourcePeerEnvelope` shape matches the F10.2.0
`RedactedPeerEnvelope` contract.

### Commits proving the chain

| Commit | What it proved |
|---|---|
| [`94c59f3`](#) | Bridge logic — operator-triggered, preview-only, no folder-import call, no chrome.storage write, no chrome.runtime broadcast, sha256 via `crypto.subtle.digest`. |
| [`b26884e`](#) | Bridge loaded into Chrome Studio via `<script>` tag in `studio.html` and `pack-studio.mjs` manifest entries (both arrays). |
| [`85502de`](#) | Folder-handle lookup unwrap fix — bridge correctly reads the FileSystemDirectoryHandle from the wrapped IDB row, matching `folder-import.mv3.js`'s pattern. |
| [`f88d496`](#) | Desktop exporter emits `bundle.sourcePeerEnvelope` with sha256 hashes of F2 identity fields; raw `installId` / `physicalDeviceId` UUIDs never written to disk. |

### What this proof does NOT establish

The bridge remains **preview / evidence only**. Specifically, this
proof does not authorize, demonstrate, or enable:

- **No proposal envelope.** Chrome Studio's authority level
  (`preview-coordinator`) does not include `propose` per F10.1.
- **No `applyEvent` construction or dispatch.** Chrome cannot
  produce `applyEvent` envelopes; consumers do not act on incoming
  `applyEvent` envelopes as commands.
- **No remote apply, no write-back.** No path from envelope receipt
  to a row write exists anywhere in the system.
- **No merge / import execution.** The existing `folder-import.mv3.js`
  merge path is untouched and is **not** invoked by F10.3.
- **No chrome.storage writes from the bridge.**
- **No chrome.runtime broadcast of bundle content.**
- **No background polling / automatic refresh / daemon-like
  behavior.** The diagnostic is one-shot, operator-triggered.
- **No mobile write-back.** Forever-no per F10.1 and the dogfood
  readiness checklist.
- **No WebDAV / cloud relay.**
- **No native durable peer work.**
- **No recursive envelope enumeration inside `payload.envelopes`.**
  F10.3 ships the `bundle`-envelope wrap only; enumerating inner
  envelopes is F10.3.1+ scope and remains unauthorized.

### Next allowed phase

**F10.4 — operator UI for the preview — planning only.** With the
end-to-end runtime path now proven, the next authorized step is to
plan (not implement) a minimal operator UI that surfaces this
diagnostic's result. F10.4 planning must respect the same hard
boundaries: no merge, no apply, no write-back, no proposal. F10.3.1
(recursive envelope enumeration), F10.5 (native-extension evidence
bridge), F10.6 (proposal flow), and F10.7 (remote apply / write-back)
remain unauthorized.

## Runtime proof — F10.4 — 2026-05-28

The read-only Settings card for the proven F10.3 bridge has been
landed, hardened, and validated in live Chrome Studio against a real
Desktop-exported `latest.json`.

### Card appearance

The **Bundle Envelope Preview** card mounts under
`Settings → Local Sync`, immediately after the existing Chrome Sync
Folder card. The card carries:

- A status badge (`— Not yet checked` / `✅ ok` / `⚠️ ok with warnings`
  / `❌ blocked` / `❌ error`).
- A single **Run preview check** button.
- A last-checked ISO timestamp + bridge-loaded indicator.
- Result fields: envelope kind, `ok`, `bundleBytes` (with KiB
  formatting), `bundleSchema`, blocker count + readable-label list,
  warning count + readable-label list, peer hash presence rows
  (`physicalDeviceIdHash`, `installIdHash`, `syncPeerIdHash` — each
  shown as `✓ present` / `(absent)` by default, with an opt-in
  "Show raw peer hashes" toggle that reveals the 64-char hex strings
  for the current session only), and section counts (chats, snapshots,
  folders, labels, tags, categories).

### Run preview check works

Clicking the button invokes
`H2O.Studio.diagnostics.previewLatestBundleAsEnvelopes()` exactly
once, disables and relabels the button to `Running…`, populates the
card from the result, and re-enables. Confirmed end-to-end against
the F10.3d-enriched Desktop bundle:

- `ok: true`
- `envelope.kind === "bundle"`
- `bundleBytes > 0` (~332 KiB on the proving bundle)
- `blockers: []`
- `warnings: []` (no `source-peer-*-absent-from-bundle` entries,
  confirming the F10.3d peer-envelope enrichment round-trips)
- All three peer hashes populated as 64-char lowercase sha256 hex.

### Card survives rerenders

After the initial mount-hardening commit (`81a82eb`), the card
vanished after `Run preview check` because `studio.js`'s
`renderSettingsRoute` was rebuilding the Settings panel via
`panel.innerHTML = ""` and the MutationObserver had been
disconnected after first mount. The follow-up fix (`18c7131`)
removed the disconnect-after-mount step; the observer now stays
armed for the page lifetime, the duplicate-guard in `tryMount()`
keeps per-mutation cost effectively zero, and cached results
(`state.lastResult`) replay into freshly-inserted cards transparently.

Verified live: clicking `Run preview check` no longer makes the
card disappear; the same result remains visible across navigation
away from and back to `#/settings`; repeated clicks do not produce
duplicate cards. The operator self-test confirms:

```js
H2O.Studio.diagnostics.__bundleEnvelopePreviewCardSelfTest()
// {
//   installed: true,
//   moduleVersion: 'F10.4-1.0.2-survives-rerenders',
//   bridgeLoaded: true,
//   anchorPresent: true,
//   cardMounted: true,
//   observerActive: true,     // <-- permanent (was the fix)
//   ...
// }
```

### Sidebar All folders / Settings fixes validated

Two sidebar bugs surfaced during F10.4 operator testing and were
fixed in commit `d7b5341`:

- **All folders sidebar row disappeared after click.** Root cause:
  `studio.js`'s `collectFolderSidebarItems()` (independent of
  S0Z1g's `renderFolders()`) wrote the same `#folderList` host
  without including the "All folders" entry, so its last-writer-wins
  rebuild dropped the row on every Studio state change. Fix: added
  an "All folders" utility item alongside "Unfiled" in
  `collectFolderSidebarItems`, an `item.href` override path through
  `renderFolderSidebarRow`, and a `location.hash === "#/library/folders"`
  active-state branch in `setActiveFolder`. The row now persists
  across navigations and shows `.active` when on the catalog route.

- **Settings nav button looked clipped at the end of the
  scrollable sidebar.** Root cause: `.wbSidebarSection--settings`
  had no dedicated CSS and sat flush against the sidebar's 14px
  bottom edge. Fix: added a `margin-top:6px; padding-top:8px;
  padding-bottom:6px; border-top:1px solid var(--wb-border)` rule.
  Settings now has a visible separator above and a stable padding
  gap below.

### Still read-only

F10.4 does not introduce any write path. The card calls exactly
one Studio API (`previewLatestBundleAsEnvelopes`); it does not call
`H2O.Studio.sync.folder.syncNow` / `connectFolder` / `folderImport.*`;
it never writes to `chrome.storage`; it never broadcasts via
`chrome.runtime`; it never adds a proposal / applyEvent / remote
apply / merge / write-back surface. Raw peer hashes stay hidden by
default. The operator's "Show raw peer hashes" toggle is session-only
and does not persist. No new chrome.storage key was added. No new
`chrome.runtime` message type was added. No
`@h2o/cross-platform-envelope` import landed in any runtime code
path (F10.2.2 CP-10.1 still reports 0 findings).

### Commits proving the F10.4 chain

| Commit | What it proved |
|---|---|
| [`3b1b4ac`](#) | Initial F10.4 card mount under Settings → Local Sync. |
| [`81a82eb`](#) | Mount hardening: try/catch, hashchange fallback, operator self-test helper. |
| [`18c7131`](#) | Removed disconnect-after-mount so the card survives Settings rerenders triggered by `Run preview check`. |
| [`d7b5341`](#) | Sidebar follow-ups: "All folders" row stops disappearing; Settings nav has visible breathing room at end-of-scroll; active state highlights the All folders catalog route. |

### Next allowed phase

**F10.5 — native-extension evidence bridge — planning only.** With
the Desktop → Chrome `bundle` envelope path proven end-to-end and
surfaced via a read-only Settings card, the next authorized step
is to plan (not implement) an evidence-emission path from the
Native ChatGPT Extension into Chrome Studio under the same F10.2
envelope contract. F10.5 planning must respect the same hard
boundaries as F10.3 and F10.4: no merge, no apply, no write-back,
no proposal. F10.3.1 (recursive envelope enumeration inside
`payload.envelopes`), F10.6 (proposal flow), and F10.7 (remote
apply / write-back) remain unauthorized. Mobile write-back,
WebDAV / cloud relay, and native durable peer work remain
forbidden until separate safety models authorize them.

## Phase status

| Phase | Status |
|---|---|
| F10.0 — cross-platform architecture | Accepted |
| F10.1 — platform capability manifest | Complete (`3bf253f`) |
| F10.2.0 — envelope spec | Complete (`febd731`, `92d3eb3`) |
| F10.2.1 — static helper | Complete (`a3fb7ac`) |
| F10.2.2 — repo validation scan | Complete (`7093801`) |
| F10.3 — bridge v1: Desktop bundle → Chrome envelope preview | Proven (`94c59f3`, `b26884e`, `85502de`, `f88d496`) — runtime verified 2026-05-27 |
| F10.3.1 — recursive envelope enumeration | Not authorized |
| **F10.4 — operator UI for the preview** | **Proven (`3b1b4ac`, `81a82eb`, `18c7131`, `d7b5341`) — runtime verified 2026-05-28** |
| F10.5 — native-extension evidence bridge | Planning only (next allowed step) |
| F10.6 — proposal flow | Not authorized |
| F10.7 — remote apply / write-back | Forbidden until separate safety model |
