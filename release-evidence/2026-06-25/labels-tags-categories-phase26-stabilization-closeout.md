# Labels / Tags / Categories / Classification Metadata Sync

## Phase 26 Stabilization / Closeout Hardening (four-type loop)

Date: 2026-06-29

## Scope

Audit / closeout / hardening only. No new request types, no runtime behavior change, no UI, no
WebDAV/cloud/relay transport. This phase produces a maintainer-closeout checklist for the four proven
applied types, locks the deferred/negative gates, records one controlled maintenance verification
run, and defines the clean handoff point for a later WebDAV/cloud/relay design audit.

## Context

- Phase 25 maintainer readiness decision committed: `a1690ec`
  (`release-evidence/2026-06-25/labels-tags-categories-phase25-maintainer-readiness-decision.md`,
  `tools/validation/sync/validate-labels-tags-categories-phase25-maintainer-readiness-decision.mjs`).
- Phase 25 verdict: four-type loop READY FOR MAINTAINER REVIEW; product metadata sync NOT READY
  globally; recommended next slice was stabilization/closeout, not fifth-type implementation.

## Live-Proven Applied Request Types (exactly four)

- `chat-category-assign`
- `chat-category-clear`
- `chat-label-bind`
- `chat-tag-bind`

Enforced as an exact set in `src-surfaces-base/studio/sync/folder-sync.tauri.js`:

```
var APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS = {
  'chat-category-assign': true,
  'chat-category-clear': true,
  'chat-label-bind': true,
  'chat-tag-bind': true
};
```

## Maintainer-Closeout Checklist

- [x] Applied allowlist is exactly the four proven types (source drift guard, this validator).
- [x] Each type proven end to end: request-only export → Desktop validate/apply → canonical
      post-write verification → receipt export → Chrome read-only receipt import/resolution →
      projection count/hash update → replay `skipped_duplicate`.
- [x] Deterministic validators green for all four (phase7/9/13/14f/17/22).
- [x] Live proofs green for all four (phase14g/14h/18/23a).
- [x] Chrome remains request-only (`requestOnly: true`, `desktopApply: false`, `noLocalApply: true`).
- [x] Chrome remains read-only over canonical metadata (`readOnlyProjection: true`,
      `chromeReadOnlyCanonical: true`).
- [x] Desktop remains canonical authority (apply only via `categories.assignChat` /
      `categories.clearChat` / `labels.bindChat` / `tags.bindChat`).
- [x] No Chrome canonical mutation (`noChromeCanonicalMutation: true` throughout).
- [x] No destructive behavior; destructive guard `/(delete|remove|unbind|clear|purge|hard-delete)/i`
      intact; only carve-out is `NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear'])`.
- [x] All no-delete flags preserved (`noHardDelete`/`noPurge`/`noChatDelete`/`noSnapshotDelete`/
      `noAssetDelete`/`noLabelDelete`/`noTagDelete`/`noCategoryDelete`/`noMetadataDelete`).
- [x] Privacy: receipts/requests/projection are hash/status/count only; no raw chat titles/content,
      no raw label/tag/category names, no account-linked metadata.
- [x] `chat-tag-bind` live proof's proof/dev-only fixture (seeded via `tags.upsert`) is documented
      with limits; no product behavior change; no `tag-create` sync; no Chrome tag catalog mutation.
- [x] WebDAV/cloud/relay is NOT implemented as a metadata transport (`webdav: 'deferred'` in source).
- [x] Product metadata sync remains globally NOT READY (`productSyncReady: false`).

## Deferred / Negative Gates (locked)

The following remain blocked/deferred and are NOT on the applied allowlist:

- `chat-label-clear`
- `chat-label-remove`
- `chat-label-unbind`
- `chat-tag-clear`
- `chat-tag-remove`
- `chat-tag-unbind`
- catalog create/rename/delete
- classification expansion
- destructive clear/delete/remove/unbind/purge/hard-delete
- WebDAV/cloud/relay transport

## Controlled Maintenance Verification Run

One controlled verification run executed the full metadata-sync validator suite (Phases 11–25,
F19 sync hardening, F15 cutover) plus the Phase 11 and Phase 19 `--run-suite` closeout gates. Result:
all green. This confirms the transport/projection/readiness invariants hold at closeout:

- transport: local sync-folder JSON only (`chrome-latest.json` Chrome→Desktop, `latest.json`
  Desktop→Chrome); no WebDAV/cloud/relay transport is wired.
- projection: `desktopCanonicalLibraryMetadata` count/hash advances only on a Desktop apply of one of
  the four allowed types; Chrome imports it read-only.
- readiness: the four-type loop is ready-for-review; the broader surface is deferred;
  `productSyncReady` stays `false`.

## Invariant Confirmations

- **Chrome request-only / read-only canonical** — confirmed: Chrome shapes/export requests only and
  imports the Desktop projection + receipts read-only; it never applies or mutates canonical metadata.
- **Desktop canonical authority** — confirmed: only Desktop applies, and only via the four canonical
  store paths, gated by `APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS`.
- **No Chrome canonical mutation** — confirmed: `noChromeCanonicalMutation: true` across request,
  receipt import, and status paths.
- **No destructive behavior** — confirmed: clear is a NULL-set reassignment; binds are additive
  `INSERT OR IGNORE`; no delete/purge path exists; the destructive guard is intact.
- **No product-wide readiness claim** — confirmed: this closeout asserts review-readiness for the four
  types only and keeps product metadata sync globally NOT READY.

## Clean Handoff Point for a Later WebDAV/Cloud/Relay Design Audit

WebDAV/cloud/relay transport is explicitly out of scope here and is marked `webdav: 'deferred'` in
source. The clean handoff point for a future Phase 27 design-only audit is:

- Start from this four-type closeout as the stable, review-ready baseline (local sync-folder JSON
  transport only).
- A Phase 27 WebDAV/cloud/relay audit must be DESIGN-ONLY (no transport implementation), evaluate the
  existing memo `e377f91d598934ca9f6d5a6e5c0dfb2597902a02`, and specify: the transport boundary (it
  must carry the SAME request/receipt/projection envelopes unchanged, not new applied types), the
  authority model (Desktop stays canonical; Chrome stays request-only/read-only), the
  privacy/at-rest/in-transit redaction requirements, and the conflict/idempotency model — before any
  implementation.
- WebDAV/cloud/relay must NOT broaden the applied allowlist, add destructive actions, or move canonical
  authority off Desktop. It is a transport concern only, gated behind its own Gate A/B/C.

## Stabilization / Closeout Verdict

Four-type safe metadata sync loop: STABILIZED AND CLOSED FOR MAINTAINER REVIEW. The applied allowlist
is locked at exactly four types, the deferred/negative gates are locked, the controlled verification
run is green, and all boundary invariants hold. No fifth type and no transport expansion were
introduced.

## Product Metadata Sync Verdict

Product metadata sync: NOT READY globally. Only the four applied types are runtime-proven and applied;
the deferred surface remains out of scope and `productSyncReady` stays `false`.

## Recommended Next Phase

Phase 27: a DESIGN-ONLY WebDAV/cloud/relay transport audit per the handoff above — no transport
implementation, no new applied types, no change to the Desktop-canonical / Chrome-request-only model.
Any transport work proceeds only behind its own design gate.
