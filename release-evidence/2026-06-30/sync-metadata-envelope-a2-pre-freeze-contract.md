# Sync Metadata Envelope A2 - Pre-Freeze Contract

A2 METADATA ENVELOPE - PRE-FREEZE (NOT A FREEZE); productSyncReady:false; WebDAV deferred

## Decision

A2 is a pre-freeze contract. It is not a metadata-envelope freeze.

Product metadata sync remains `NOT READY globally`. Freezing now would harden the wrong envelope
because the current local wire is proven for local sync lanes but is not yet a transport-grade,
identity/key-aware, multi-Desktop-ready metadata envelope.

A2 does not:

- mint `h2o.studio.fullBundle.v3`
- flip `productSyncReady`
- enable WebDAV
- implement validators
- change runtime envelope/schema behavior

## Current Grounded State

The current local wire remains:

- `h2o.studio.fullBundle.v2`
- `latest.json`
- `chrome-latest.json`

Gate B carries v2 unchanged. Gate B preserves `productSyncReady:false`. Gate B/WebDAV remains
deferred.

Four applied request types are proven:

- `chat-category-assign`
- `chat-category-clear`
- `chat-label-bind`
- `chat-tag-bind`

Identity/key/E2E is closed as design-only, with no runtime implementation. Multi-Desktop authority
remains undecided. Archive package CAS remains deferred, and package bodies are excluded from metadata
sync.

## Ratified Stable Request Core

A2 ratifies the four request types as a stable, maintainer-reviewed request-core candidate:

- `chat-category-assign`
- `chat-category-clear`
- `chat-label-bind`
- `chat-tag-bind`

This ratification covers only the request-subschema core. It is not a full transport-envelope freeze.

Pending projection/entity surfaces still block full freeze:

- label/tag clear/remove/unbind
- catalog create/rename/delete
- classification expansion
- destructive/reversal semantics
- broader folder/metadata projection completeness
- multi-surface parity where not closed

## Reserved Future Envelope

A2 reserves:

- `h2o.studio.fullBundle.v3`

`h2o.studio.fullBundle.v3` is the future frozen transport-grade metadata envelope. A v3 major bump
means:

- schema is complete
- transport identity/clock/integrity fields are added
- immutable-major policy is activated

`h2o.studio.fullBundle.v2` remains the current unfrozen local-drop wire.

A2 does not mint v3 and does not change v2.

## Major / Minor Policy

Future freeze must enforce `reject-unknown-major`:

- receivers reject and quarantine major versions greater than supported
- receivers never silently parse or apply unknown major versions
- lower major versions are rejected unless an explicit migration exists

Future freeze should allow `tolerate-unknown-minor`:

- unknown additive minor fields are ignored
- consumers preserve safety and authority checks before using known fields

Within a frozen major:

- additive-minor-only changes are allowed
- breaking, removed, or retyped fields require a new major plus migration

`h2o.studio.fullBundle.v2` remains mutable until the actual freeze.

## Freeze Gate

Before v3 may be minted and `productSyncReady` may flip, all of the following must be true:

- broader projection schema is closed
- metadata model is globally ready
- identity/key/E2E runtime has landed, not only design
- multi-Desktop authority is decided
- package-body exclusion invariant is held
- WebDAV metadata transport remains read-only/flag-gated until proven
- required-before-freeze validators are green

## Required-Before-Freeze Validators

A2 specifies, but does not implement, these validators:

- `envelope-schema-guard`
- `freeze-gate-readiness-guard`
- `package-body-exclusion-guard`
- `envelope-drift-guard`
- reused or extended `no-new-applied-type-guard`

These validators must prove that v3 is complete, v2/v3 drift is intentional, package bodies are
excluded, product readiness gates are satisfied, and the applied request core does not silently
broaden.

## Cross-Cutting References

- Package bodies remain excluded. Archive package CAS is deferred and boundary-locked at
  `c7e5384 test(studio): lock archive package cloud sync boundary`.
- WebDAV remains deferred. A2 adds no WebDAV implementation.
- Identity/key/E2E design is closed, but runtime is absent:
  - `81038e8 docs(sync): define identity key e2e model`
  - `37b646e test(sync): lock identity key e2e boundary`
  - `cf68533 docs(sync): close identity key e2e design slice`
- Multi-Desktop authority remains an open gate item.
- Transport remains non-authoritative:
  - no auto-apply
  - no package body
  - no direct `libraryIndex` writes

## Boundaries

- Docs/evidence only.
- No metadata envelope freeze.
- No v3 minting.
- No `productSyncReady` flip.
- No WebDAV implementation.
- No validator implementation.
- No envelope/schema/runtime mutation.
- No capability changes.
- No Chrome runtime/service-worker changes.
- No archive package CAS changes.
- No archive restore/relink/import/export/inspector runtime changes.
- No sync/appearance/ribbon dirty-file changes.
- No `stash@{0}` changes.
- No f17 migration drift changes.

## Recommended Next Step

Create an A3 validator-planning slice for the required-before-freeze validators, or return to the
metadata model closure gate if maintainers decide the broader projection/entity surface must close
before validator planning begins.
