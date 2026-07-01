# OPERATIONAL.5 productSyncReady FLIP-GATE - NOT FLIPPED (productSyncReady stays false)

## Readiness Verdict

Do not flip productSyncReady.

Six-type request readiness is proven but not sufficient. Operational.2,
Operational.3, and Operational.4 close the request/mutation readiness slice for:

- `chat-category-assign`
- `chat-category-clear`
- `chat-label-bind`
- `chat-tag-bind`
- `chat-label-unbind`
- `chat-tag-unbind`

The broader local model is not yet release-grade. Folder-sync source-of-truth
reconciliation remains outstanding, and canonical count parity must still be
proven before any dedicated productSyncReady flip slice.

Current verdict:

- `productSyncReady` stays false.
- `fullBundle.v3` is not minted.
- WebDAV apply remains deferred.
- Cloud readiness is not claimed.

## Scope Decision

productSyncReady = v1 single-canonical local metadata sync model is release-grade.

The local model scope is:

- `fullBundle.v2`
- `latest.json`
- `chrome-latest.json`
- Chrome ↔ Desktop
- device-folder publication
- six-type request readiness
- folder sync source-of-truth reconciled
- canonical count parity

Excluded from productSyncReady:

- `fullBundle.v3`
- WebDAV/cloud transport
- identity/key/E2E runtime
- archive package CAS L.2

Cloud readiness is separate future `cloudSyncReady`:

- `fullBundle.v3`
- WebDAV
- identity/key/E2E
- archive CAS L.2

Operational.5 makes no cloud readiness claim.

## Gate Checklist

Before a future productSyncReady flip, all local-model gates must be true:

- six-type request readiness green
- folder-sync source-of-truth reconciled and release-grade
- A0-A8 projection coherence green
- canonical count parity proven
- single-canonical authority respected
- basis reserved/inert
- catalog Desktop-managed accepted
- productSyncReady stays false until explicit dedicated flip slice
- rollback-safe:
  - one revertible flag
  - every sync leg individually OFF-by-default even after future flip
- UI shows synced only on confirmed canonical/parity state, not optimistic success
- no cloud claim

## Current Blockers

Folder-sync source-of-truth reconciliation remains outstanding.

Grounding:

- `release-evidence/2026-06-25/folder-sync-f1-source-of-truth-reconciliation.md`
  records the source-of-truth split and says folder sync readiness is **NOT READY**.
- `release-evidence/2026-06-25/folder-sync-f2-source-of-truth-drift-detector.md`
  records a diagnostic-only drift detector and says the split is detectable but
  not yet repaired.

Canonical count parity also remains required before a flip:

- local projection counts must agree across canonical Desktop state and mirror
  import/export paths
- UI must not report synced from optimistic request success alone
- receipts plus canonical projection must be the basis for user-visible readiness

## What Does Not Block Local productSyncReady

The following do not block the local v1 productSyncReady flip once the local
gates above are closed:

- catalog CRUD
- `fullBundle.v3` mint
- WebDAV metadata transport
- archive package CAS L.2
- multi-writer
- `tags.updated_at` migration

Rationale:

- In v1, the canonical Desktop manages catalog entities.
- Mirrors can request bind/unbind against pre-existing catalog entities.
- Catalog CRUD can land later as an additive operational slice.
- `fullBundle.v3`, WebDAV, identity/key/E2E runtime, and archive CAS belong to
  future cloudSyncReady work.
- `tags.updated_at` belongs to future multi-writer authority work, not the
  current single-canonical v1 local gate.

## Static Validator

Operational.5 adds:

- `tools/validation/studio/validate-sync-productsyncready-flip-gate-v1.mjs`

The validator asserts:

- this evidence exists and says `NOT FLIPPED`
- `productSyncReady` stays false in runtime gate/diagnostic sources
- no `productSyncReady:true` runtime flip exists
- Operational.4 six-type readiness closure exists
- Operational.3 harness evidence exists
- Operational.2 implementation evidence exists
- folder-sync source-of-truth blocker is recorded as outstanding / not release-grade
- A0-A8 projection/pre-freeze closure exists
- no `fullBundle.v3` mint
- no WebDAV apply
- no multi-writer / lease / election implementation
- catalog CRUD remains outside the applied readiness allowlist
- cloud readiness is not claimed
- Archive package CAS remains deferred
- validation remains static, with no live DB/runtime mutation

## Boundaries Preserved

- Contract/evidence plus validator only.
- No `productSyncReady` flip.
- No `fullBundle.v3` mint.
- No WebDAV implementation.
- No WebDAV apply implementation.
- No catalog CRUD implementation.
- No multi-writer implementation.
- No runtime source change.
- No `tags.updated_at` migration.
- No f17 migration drift change.
- No capability change.
- No Chrome runtime/service-worker change.
- No archive package CAS change.
- Existing sync/appearance/ribbon dirty files untouched.
- Existing staged folder-sync files untouched.
- `stash@{0}` untouched.

## Validation Results

Executed:

- `node --check tools/validation/studio/validate-sync-productsyncready-flip-gate-v1.mjs` — passed
- `node tools/validation/studio/validate-sync-productsyncready-flip-gate-v1.mjs` — passed
- `node tools/validation/studio/validate-sync-operational-request-readiness-v1.mjs` — passed
- `node tools/validation/studio/validate-sync-operational-label-tag-unbind-harness-v1.mjs` — passed
- `node tools/validation/studio/validate-sync-metadata-envelope-pre-freeze-guards-v1.mjs` — passed
- `git diff --check` — passed
- `git diff --cached --check` — passed
- `git diff --cached --name-only` — confirmed only the two Operational.5 paths were staged before commit

## Files Changed

- `release-evidence/2026-06-30/sync-operational-5-productsyncready-flip-gate.md`
- `tools/validation/studio/validate-sync-productsyncready-flip-gate-v1.mjs`

## Recommended Next Step

Continue the folder-sync source-of-truth reconciliation lane until the mirror is
release-grade as a derived projection of canonical SQLite, then add canonical
count parity proof. Open a dedicated productSyncReady flip slice only after
those gates are green.
