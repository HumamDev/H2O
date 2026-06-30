# Studio Reader & Notes Architecture Contract v1.2

Status: Accepted for MVP-A0 docs/contract/validator foundation

Date: 2026-06-29

Scope: MVP-A0 only. This document introduces no runtime behavior change. It does
not implement MVP-A1, MVP-A2a, MVP-A2b, MVP-A3, or MVP-B.

Related:

- [ADR-0011: Studio Reader & Notes Architecture Contract](../../decisions/ADR-0011-studio-reader-notes-architecture.md)
- [ADR-0004: Library Index Source Model](../../decisions/ADR-0004-library-index-source-model.md)
- [ADR-0005: Linked vs Saved Library Records](../../decisions/ADR-0005-linked-vs-saved-library-records.md)
- [ADR-0007: Studio Canonical Organization State + Transport Adapter Strategy](../../decisions/ADR-0007-studio-canonical-organization-state-transport-adapters.md)
- [ADR-0009: Chat Saving Architecture - H2O Studio Archive Model](../../decisions/ADR-0009-chat-saving-architecture.md)
- [Library Record Shapes](../library/record-shapes.md)
- [Highlights Contract](../highlights/contract.md)
- [Command Bar Contract](../command-bar/contract.md)
- [Side Actions Panel Contract](../side-actions-panel/contract.md)
- [Studio Store](../../../src-surfaces-base/studio/store/README.md)
- [Studio Storage Contract](../../../src-surfaces-base/studio/STUDIO_STORAGE_CONTRACT.md)
- [Studio Portability Contract](../../../src-surfaces-base/studio/STUDIO_PORTABILITY_CONTRACT.md)

## Architecture

Reader & Notes uses the Hybrid Typed-Object Architecture:

- typed `LibraryItem` envelope
- per-kind content models
- source-preserved captured chats
- native editable notes later
- imported document models later
- converted-note provenance later
- one shared Annotation/Anchor contract
- renderer registry by item kind
- export/import adapters

The architecture is additive over existing Library, Chat Registry, saved-chat,
capture, and annotation stores. It does not replace those authorities in MVP-A0.

## Core Invariants

1. Captured chats are evidence and must not be destructively edited.
2. Native notes are editable-first, but `native_note` is not part of MVP-A.
3. Sticky notes, highlights, comments, and bookmarks are annotations, not
   top-level notes.
4. Library equality does not mean internal equality.
5. Derived surfaces remain one-way.
6. Command Bar is system/debug/recovery; Side Actions/Dock is user feature
   workflow.
7. MVP-A and MVP-B must not modify sync kernels or saved-chat package semantics.
8. Runtime changes must be feature-flagged, default off, and ship-disabled until
   validators pass.
9. A1/A2a read-only modules expose no write API and fail closed.
10. New Studio-local stores route through `H2O.Studio.platform.storage`, not raw
    `chrome.*`, `localStorage`, or direct `indexedDB`.

## Protected Lanes

Reader & Notes may cite but must not redefine or modify these lanes in MVP-A0:

- Sync Architecture
- Chat Saving Architecture
- Capture/Saving Architecture
- Library Index / Chat Registry identity authority

MVP-A0 and later MVP-A phases must not touch these runtime areas unless a later
approved phase explicitly changes this contract:

- `src-surfaces-base/studio/sync/**`
- `src-surfaces-base/studio/ingestion/**`
- `src-runtime-base/**`
- `apps/studio/desktop/src-tauri/**`
- `src-surfaces-base/studio/studio.js`
- runtime stores

## D10 - Captured-Chat LibraryItem Identity

For `captured_chat`, `LibraryItem.id` is the existing Chat Registry identity /
`chatId`.

Reader & Notes consumes captured-chat identity read-only. It does not own
deduplication, recapture identity, merge ordering, cross-account scoping, or fork
resolution. Those decisions are owned by Library Index, Chat Registry, Chat
Saving, and Capture/Saving lanes.

Cross-account scoping remains deferred to the existing identity lane where it is
currently deferred. Reader & Notes must not solve it locally by adding a parallel
identity key.

## D11 - Highlight-to-Item Attribution

Inline highlights are structurally hard to attribute perfectly because the
existing highlight store is a global blob keyed by answer id, with only optional
conversation provenance on highlight items.

MVP-A1 uses a no-mis-attribution rule:

- If a highlight can be safely mapped to a `LibraryItem`, return it with that
  attribution.
- If a highlight cannot be safely mapped to a `LibraryItem`, return it as
  `unattributed`.
- Never attribute a highlight to the wrong `LibraryItem`.

A1 may surface highlights at answer, conversation, or `unattributed` granularity
until a safer index exists. The safe minimum is exact-match attribution only:
when existing provenance proves the current `chatId`/conversation identity, the
facade may attribute; otherwise it must return `unattributed`.

## Annotation Canonical Data

Annotation canonical data means existing native annotation blobs such as:

- highlights
- notes
- bookmarks

A2b sidecar data is auxiliary/derived data. It is not annotation canonical data,
not a second canonical writer, and not a new annotation silo.

## MVP-A1 Annotation Facade Scope

MVP-A1 annotation facade covers only current Studio store-backed annotation
kinds:

- highlights
- notes
- bookmarks

Sticky, margin, ink, and quote are future kinds to be ported later through the
shared contract. MVP-A1 exposes no write APIs, performs no lazy enrichment,
performs no storage mutation, and fails closed.

Fail-closed examples:

- unknown annotation kind -> omit or return unsupported metadata, not a write
  surface
- unsafe highlight attribution -> `unattributed`
- unavailable backing store -> empty read result with diagnostics, not fallback
  mutation

## A2a Shared Anchor Resolver Policy

MVP-A2a extracts a read-only resolver from the existing robust 3H1a highlight
anchor behavior. The resolver generalizes quote, position, and XPath resolution
without changing persisted highlight blobs.

A2a writes nothing, mutates no native `h2o:prm:cgx:*` keys, and fails closed
when an anchor cannot be resolved. A3 must add anchor/highlight resolution parity
before and after any renderer carve-out.

## A2b Sidecar Policy

A2b sidecar enrichment is auxiliary/derived data, not annotation canonical data.
It is sidecar-only.

Sidecar identity must be globally unique and composed. The required shape is a
stable composition such as:

```text
{itemId}:{answerId}:{highlightId}
```

The sidecar may store additive selector or resolution hints only. It must merge
additively at resolve time with the A2a resolver inputs. It must not overwrite,
replace, delete, or mutate native highlight data.

If the sidecar is absent, deleted, or feature-flag-off, resolver behavior must
be byte-identical to A2a.

A2b sidecar storage must write only through `H2O.Studio.platform.storage`.
It must never write native `h2o:prm:cgx:*` keys and must never write native
highlight blobs.

## Storage-Routing Policy

New Studio-local stores, including the future A2b sidecar and MVP-B note-doc
store, must route through `H2O.Studio.platform.storage`.

Raw persistence APIs are forbidden for new Reader & Notes stores:

- raw `chrome.*`
- `localStorage`
- direct `indexedDB`

Existing legacy/native highlight raw-`chrome` behavior is grandfathered only
because highlights already share a native annotation blob. It is not a pattern
to copy for Reader & Notes sidecar or note-doc modules.

## Structured Metadata Policy

`category` maps to the existing structured `CategoryRecord` or is treated as an
opaque structured pass-through of the existing category record.

`labels` maps to the existing structured `LabelAssignments` representation or is
treated as an opaque structured pass-through of the existing structured label
assignment data.

Reader & Notes must not flatten structured metadata to `string` or `string[]`.
If only IDs are available in a source record, the future `LibraryItem` view must
carry that fact as structured/opaque data instead of manufacturing lossy display
strings.

## Renderer Fallback Policy

Future MVP-A3 renderer registry work is limited to reader-DOM-build only. The
captured-chat renderer is a wrapper around the existing legacy `buildReaderDOM`
path.

The renderer registry must fail closed to legacy `buildReaderDOM`. It must never
render a blank reader as fallback.

A3 must not alter:

- RibbonBridge
- export bridges
- overlay wiring

Golden DOM lifecycle points for A3 validators:

- post-build / pre-decoration: the reader root and turn DOM exist before
  annotation, overlay, or highlight decoration is applied
- fully-settled post-decoration: the reader has completed existing decoration
  passes and is ready for parity assertions

A3 must prove anchor/highlight resolution parity before and after the renderer
carve-out.

## MVP-B Native Note Boundary

MVP-B is the first minimal local-only `native_note` item kind. It is not part of
MVP-A0, MVP-A1, MVP-A2a, MVP-A2b, or MVP-A3.

MVP-B is local/Desktop-only unless Sync Architecture explicitly adopts it later.
It requires a new isolated native note store namespace routed through
`H2O.Studio.platform.storage`.

MVP-B must not:

- reuse chat-scoped `store/notes.js`
- write native notes to chat, package, or projection keys
- wire native notes into fullBundle export/import unless later approved
- modify sync kernels
- add tables, calculations, canvas, handwriting, imported documents, media
  embeds, CRDT, or a block DB

## Phase Sequence

| Phase | Scope | A0 status |
|---|---|---|
| MVP-A0 | Contract/docs/validator only | Implemented by this docs foundation |
| MVP-A1 | Typed envelope view plus read-only annotation facade | Not implemented by A0 |
| MVP-A2a | Read-only shared anchor resolver | Not implemented by A0 |
| MVP-A2b | Additive sidecar enrichment | Not implemented by A0 |
| MVP-A3 | Renderer registry / reader DOM carve-out | Not implemented by A0 |
| MVP-B | Minimal local-only `native_note` | Not implemented by A0 |

## Feature Flags Required Later

MVP-A0 adds no runtime feature flags because it adds no runtime code. Later
runtime phases require flags that are default off and ship-disabled until their
validators pass:

- `studio.readerNotes.libraryItemView.enabled`
- `studio.readerNotes.annotationFacade.enabled`
- `studio.readerNotes.anchorResolver.enabled`
- `studio.readerNotes.anchorSidecar.enabled`
- `studio.readerNotes.rendererRegistry.enabled`
- `studio.readerNotes.nativeNote.enabled`

## Required Validators By Phase

MVP-A0:

- contract presence and consistency validator
- `git diff --check`
- `node --check` on the validator

MVP-A1:

- read-only API validator proving no write methods are exported
- structured category/labels validator proving metadata is not flattened
- no-mis-attribution validator proving unsafe highlights return
  `unattributed`
- no storage mutation validator
- fail-closed backing-store validator

MVP-A2a:

- resolver extraction parity validator against existing 3H1a anchor behavior
- no write-back/static mutation validator
- fail-closed unresolved-anchor validator

MVP-A2b:

- sidecar key uniqueness validator for `{itemId}:{answerId}:{highlightId}`
- storage-routing static gate for `H2O.Studio.platform.storage`
- sidecar absent/deleted/flag-off byte-identical-to-A2a validator
- no native `h2o:prm:cgx:*` or native highlight blob write validator

MVP-A3:

- renderer registry flag-off parity validator
- fallback-to-legacy-`buildReaderDOM` validator
- no blank reader fallback validator
- post-build / pre-decoration DOM lifecycle validator
- fully-settled post-decoration DOM lifecycle validator
- anchor/highlight resolution parity validator
- static gate proving RibbonBridge, export bridges, and overlay wiring were not
  modified

MVP-B:

- local/Desktop-only gate
- isolated note-doc namespace validator
- storage-routing static gate for `H2O.Studio.platform.storage`
- CRUD validator for minimal native note documents
- export/import leakage validator proving fullBundle is unchanged unless later
  approved
- sync leakage validator proving sync kernels are unchanged

## Rollback Paths

MVP-A0 rollback is deleting or reverting only this contract foundation and its
validator. No runtime rollback is needed because A0 changes no runtime behavior.

Later runtime rollback requirements:

- A1: turn off the LibraryItem and annotation facade flags; legacy readers and
  stores remain authoritative.
- A2a: turn off the resolver flag; existing highlight behavior remains the
  active path.
- A2b: turn off or delete the sidecar; resolver behavior returns byte-identical
  to A2a.
- A3: turn off the renderer registry flag; fallback calls legacy `buildReaderDOM`
  and never blanks the reader.
- MVP-B: turn off the native-note flag; the isolated local note-doc namespace is
  ignored and does not leak into sync/export.
