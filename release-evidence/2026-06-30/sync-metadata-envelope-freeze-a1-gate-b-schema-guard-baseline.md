# Sync Metadata Envelope Freeze A1 - Phase 28 Gate B Schema / Guard Baseline

SYNC METADATA ENVELOPE FREEZE A1 - PHASE 28 GATE B SCHEMA / GUARD BASELINE - NOT READY FOR FREEZE

## Investigation Summary

The Phase 28 WebDAV Gate B schema/guard specification exists at:

- `release-evidence/2026-06-25/labels-tags-categories-phase28-webdav-gate-b-schema-guard-spec.md`

It is already tracked in git and is suitable as a design/specification baseline for the labels/tags/
categories WebDAV Gate B lane. It does not conflict with A0 or the WebDAV/cloud relay memo because it
keeps WebDAV design-only, keeps product metadata sync `NOT READY globally`, carries existing
`latest.json` / `chrome-latest.json` envelopes unchanged, and blocks implementation unless guards and
dev-only gates are satisfied.

This A1 note does not replace that Phase 28 artifact. It records how that Gate B baseline fits into
the broader metadata-envelope freeze path and keeps the freeze verdict as not ready.

## Gate B Purpose

Gate B establishes the schema/guard baseline required before a later metadata-envelope freeze. It does
not freeze the final envelope.

Gate B also does not implement:

- WebDAV
- identity/key runtime
- archive package CAS
- a frozen `fullBundle.v3` or equivalent
- a product-ready metadata sync claim

## Guard Requirements

A later freeze path must preserve these guards:

- Explicit metadata-only envelope boundary.
- Package/archive bodies excluded from metadata sync.
- `productSyncReady:false` remains until a dedicated closure phase changes it.
- Unknown-major rejection is required before freeze.
- Frozen-major/minor compatibility policy is required before freeze.
- No auto-apply from transport.
- Read-only, flag-gated WebDAV metadata transport comes later.
- Desktop authority remains explicit until a multi-Desktop authority decision is made.
- Multi-Desktop authority decision is required before cloud transport can become product-grade.
- Identity/key/E2E runtime is required before cloud transport.
- Chrome remains request/read-back only and has no package-body authority.

## Current Status

- `h2o.studio.fullBundle.v2` remains the current local sync wire.
- `latest.json` and `chrome-latest.json` remain local sync-folder artifacts.
- No frozen `h2o.studio.fullBundle.v3` or equivalent transport-grade metadata envelope is committed.
- Four request types are proven:
  - `chat-category-assign`
  - `chat-category-clear`
  - `chat-label-bind`
  - `chat-tag-bind`
- Broader metadata surface remains deferred:
  - label/tag clear/remove/unbind
  - catalog create/rename/delete
  - classification expansion
  - destructive/reversal semantics
- WebDAV relay code exists, but product WebDAV metadata transport is not closed.
- Identity/key/E2E is closed as design-only, not runtime implementation.
- Archive package cloud sync remains blocked by L.0/L.1.

## Required Validators Before Freeze

Before any metadata envelope freeze is accepted, the repo needs validators for:

- Metadata envelope freeze contract.
- Unknown-major / frozen-major policy.
- Package-body exclusion.
- `productSyncReady` gate.
- WebDAV read-only flag gate.
- Identity/key runtime prerequisite, once implemented.
- Multi-Desktop authority validator or documented gate.
- No auto-apply from transport.
- Chrome request/read-back-only authority.

## Freeze Blockers Still Active

- Product metadata sync remains `NOT READY globally`.
- The metadata model is not globally closed.
- Only four applied metadata request types are proven.
- Frozen envelope major/minor policy is not committed.
- Unknown-major rejection is not enforced as a dedicated frozen-envelope policy.
- Multi-Desktop authority is unresolved.
- Identity/key/E2E runtime is absent.
- Read-only flag-gated WebDAV metadata transport is not closed.
- Archive package CAS sync L.2 remains blocked.

## Recommended Next Step

Because the Phase 28 Gate B spec is present and suitable as a baseline input, the next metadata-freeze
step should be:

- Sync Metadata Envelope Freeze A2 - Metadata Envelope Freeze Contract

A2 should remain docs/validator-only and should not implement WebDAV. It should define the future
frozen envelope version, the unknown-major policy, the package-body exclusion invariant, and the
validator list required before freeze can move from `NOT READY` to a candidate state.

If maintainers decide Phase 26 is not fully closed for the metadata model, then finish/close that
model first and defer A2.

## Boundary Confirmation

- No runtime code changed.
- No validators changed.
- No WebDAV implementation added.
- No metadata envelope frozen.
- No identity/key/E2E runtime implemented.
- No archive package CAS transport implemented.
- No archive restore/relink/import/export/inspector runtime changed.
- No Chrome runtime/service-worker code changed.
- No scanner/materializer/writer code changed.
