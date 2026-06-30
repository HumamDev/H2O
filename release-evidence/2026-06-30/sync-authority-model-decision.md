# Sync Authority Model Decision

Status: SYNC AUTHORITY MODEL — v1 SINGLE-CANONICAL (design-only); lease/election reserved/deferred; productSyncReady:false

Date: 2026-06-30

## Scope

This note ratifies the v1 sync authority model for the metadata-envelope
pre-freeze line.

This is docs/evidence only. It does not implement authority runtime, lease or
election, multi-writer behavior, WebDAV, identity/key runtime, archive CAS L.2,
schema or migration changes, `fullBundle.v3`, or a `productSyncReady` flip.

## Investigation Summary

Current baseline:

- A8 metadata envelope pre-freeze projection stack closure:
  `2aec2ec docs(sync): close metadata envelope pre-freeze projection stack`
- A7.1 `tags.updated_at` guard:
  `17f640f test(sync): lock tags updated_at pre-freeze guard`
- Phase 38 WebDAV localhost smoke proof:
  `3a8e7c7 test(sync): prove webdav localhost smoke`

The current projection stack remains pre-freeze. `h2o.studio.fullBundle.v3` is
reserved but not minted, `productSyncReady` remains `false`, WebDAV product
transport remains deferred, identity/key/E2E runtime is absent, and archive
package CAS L.2 remains blocked.

## Decision

v1 sync authority is single-canonical.

- Exactly one canonical Desktop holds SQLite authority.
- Chrome is read-only plus request-only.
- Any second Desktop is also read-only plus request-only in v1.
- Non-canonical surfaces render the canonical projection and emit requests for
  the canonical Desktop to apply.
- This extends the proven Chrome request/receipt model to additional Desktops.

This decision chooses the lowest-risk authority model that matches the current
runtime topology and the existing request/receipt architecture.

## Canonical Establishment

- The canonical Desktop is identified by `installId`.
- The canonical may be user-designated or first-established.
- A non-canonical Desktop remains mirror/request-only until future lease or
  election support exists.
- No runtime authority switching is implemented in this slice.

In v1, the canonical Desktop remains the only writer of authoritative SQLite
state for the metadata projection.

## Reserved Future Model

Lease/election is reserved but deferred.

Multi-canonical merge is reserved but deferred.

A6 already reserves `authorityEpoch` for future authority epochs. The field can
support a later authority model without requiring this slice to implement
leasing, election, or multi-writer merge.

Do not build lease/election now.

Do not implement multi-writer now.

Future multi-writer requires:

- commutative semantics
- multi-writer LWW
- `tags.updated_at` migration and write-path population
- conflict harnesses

## Deferrals Confirmed

- `tags.updated_at` remains deferred to the future multi-writer LWW slice.
- WebDAV apply-over-transport remains deferred.
- WebDAV read-only projection transport remains the first safe WebDAV product
  step later.
- B8/B9 optimistic basis-check remains reserved/inert under single-canonical
  authority.
- `productSyncReady` remains `false`.

## Dependency Ordering

Recommended order from this decision:

1. Authority.0 decision now.
2. Operational.0 request/mutation readiness next:
   - `chat-label-unbind`
   - `chat-tag-unbind`
   - catalog CRUD request planning/apply proofs
   - soft-only destructive/reversal semantics
3. identity/key/E2E runtime planning can proceed in parallel.
4. f17/v13 migration drift cleanup must happen before any future v18
   `tags.updated_at` migration.
5. v3 mint comes later.
6. WebDAV metadata transport comes after v3 mint plus identity/key runtime.
7. Archive package CAS L.2 comes last.

## Risk Analysis

- Single-canonical v1 is low-risk and matches current topology.
- Lease/election now would be premature and high-risk.
- Operational request readiness before an authority decision could bake the
  wrong conflict model.
- WebDAV apply before authority, identity/key runtime, and transport gates is
  unsafe.
- Ignoring f17/v13 drift would make future migrations risky, especially any
  later v18 `tags.updated_at` migration.

## Boundaries

- docs/evidence only
- no authority runtime implementation
- no lease/election implementation
- no multi-writer implementation
- no schema or migration change
- no `h2o.studio.fullBundle.v3` mint
- no metadata envelope freeze
- no `productSyncReady` flip
- no WebDAV implementation
- no identity/key runtime
- no archive CAS L.2
- no f17 migration drift change
- no capability change
- no Chrome runtime/service-worker change
- no archive package CAS change
- no sync/appearance/ribbon dirty files touched
- `stash@{0}` untouched

## Validation

Commands:

```sh
git diff --check
git diff --cached --check
git diff --cached --name-only
```

Result:

- passed

## Files Changed

- `release-evidence/2026-06-30/sync-authority-model-decision.md`

## Recommended Next Step

Open Operational.0 request/mutation readiness before metadata-envelope freeze:
plan and prove label/tag unbind, catalog CRUD request semantics, and soft-only
destructive/reversal behavior under the single-canonical authority model.
