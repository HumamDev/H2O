# ADR-0011: Studio Reader & Notes Architecture Contract

Status: Accepted for MVP-A0 docs/contract foundation

Date: 2026-06-29

Related:

- [Studio Reader & Notes Architecture Contract v1.2](../systems/reader-notes/architecture-contract-v1.2.md)
- [ADR-0004: Library Index Source Model](ADR-0004-library-index-source-model.md)
- [ADR-0005: Linked vs Saved Library Records](ADR-0005-linked-vs-saved-library-records.md)
- [ADR-0007: Studio Canonical Organization State + Transport Adapter Strategy](ADR-0007-studio-canonical-organization-state-transport-adapters.md)
- [ADR-0009: Chat Saving Architecture - H2O Studio Archive Model](ADR-0009-chat-saving-architecture.md)
- [Library Record Shapes](../systems/library/record-shapes.md)
- [Studio Store](../../src-surfaces-base/studio/store/README.md)

## Context

Studio needs a reader and notes model that can present captured chats, annotations,
and future editable note documents without creating another identity authority,
another saved-chat store, or another sync lane.

Captured chats are evidence. They are saved and projected by the existing Chat
Saving, Capture/Saving, Library Index, and Chat Registry lanes. Reader & Notes
must consume those records read-only until a later phase is explicitly approved.

## Decision

Adopt the Studio Reader & Notes Architecture Contract v1.2 and use the Hybrid
Typed-Object Architecture as the target model:

- typed `LibraryItem` envelope
- per-kind content models
- source-preserved captured chats
- native editable notes later
- imported document models later
- converted-note provenance later
- one shared Annotation/Anchor contract
- renderer registry by item kind
- export/import adapters

MVP-A0 is docs/contract/validator-only. It introduces no runtime behavior
change and implements none of the future runtime phases.

## Locked A0 Decisions

- For `captured_chat`, `LibraryItem.id` is the existing Chat Registry identity /
  `chatId`.
- Reader & Notes does not own deduplication, recapture identity, merge ordering,
  cross-account scoping, or fork resolution. Those remain with Library Index,
  Chat Registry, Chat Saving, and Capture/Saving lanes.
- Highlight attribution follows a no-mis-attribution rule. If a highlight cannot
  be safely mapped to a `LibraryItem`, it is returned as `unattributed`; it must
  never be attributed to the wrong item.
- A2b sidecar enrichment is auxiliary/derived data. It is sidecar-only and not a
  second canonical annotation writer.
- New Reader & Notes stores must use `H2O.Studio.platform.storage`. New raw
  `chrome.*`, `localStorage`, or direct `indexedDB` persistence is forbidden in
  this lane.
- Future renderer registry work must fail closed to legacy `buildReaderDOM`; it
  must never produce a blank reader fallback.
- `category` and `labels` in the future `LibraryItem` typed view remain
  structured pass-through data, not flattened `string` or `string[]` values.

## Protected Lanes

This ADR does not modify and does not authorize modification of:

- Sync Architecture
- Chat Saving Architecture
- Capture/Saving Architecture
- Library Index / Chat Registry authority
- `src-surfaces-base/studio/sync/**`
- `src-surfaces-base/studio/ingestion/**`
- `src-runtime-base/**`
- `apps/studio/desktop/src-tauri/**`
- `src-surfaces-base/studio/studio.js`
- runtime stores

## Consequences

- MVP-A1 may be planned only after the v1.2 contract validator passes.
- MVP-A1 must be read-only: typed envelope view plus read-only annotation
  facade over current store-backed highlights, notes, and bookmarks only.
- MVP-A2a/A2b/A3/B remain future phases and require their own implementation
  prompts, validators, and feature flags.
- Runtime changes must be feature-flagged, default off, and ship-disabled until
  the relevant phase validators pass.

## Non-Goals

This ADR does not implement:

- typed `LibraryItem` runtime modules
- annotation facade
- anchor resolver
- sidecar storage
- renderer registry
- `native_note`
- sync, ingestion, saved-chat package, capture, or desktop Tauri changes

## Validation

MVP-A0 is validated by
`tools/validation/reader-notes/validate-reader-notes-architecture-contract-v1_2.mjs`.
The validator checks for the contract file, this ADR, the locked decisions above,
the protected-lane boundaries, and the explicit statement that A0 changes no
runtime behavior.
