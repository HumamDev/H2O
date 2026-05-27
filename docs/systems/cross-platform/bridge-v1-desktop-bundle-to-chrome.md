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

## Phase status

| Phase | Status |
|---|---|
| F10.0 — cross-platform architecture | Accepted |
| F10.1 — platform capability manifest | Complete (`3bf253f`) |
| F10.2.0 — envelope spec | Complete (`febd731`, `92d3eb3`) |
| F10.2.1 — static helper | Complete (`a3fb7ac`) |
| F10.2.2 — repo validation scan | Complete (`7093801`) |
| **F10.3 — bridge v1: Desktop bundle → Chrome envelope preview** | **Current** |
| F10.3.1 — recursive envelope enumeration | Not authorized |
| F10.4 — operator UI for the preview | Not authorized |
| F10.5 — native-extension evidence bridge | Not authorized |
| F10.6 — proposal flow | Not authorized |
| F10.7 — remote apply / write-back | Forbidden until separate safety model |
