# Contract: Highlights

Status: Draft / constrained by Reader & Notes Architecture Contract v1.2

Purpose:
Defines the Reader & Notes boundary for existing highlight data without changing
runtime behavior in MVP-A0.

Related:

- [Studio Reader & Notes Architecture Contract v1.2](../reader-notes/architecture-contract-v1.2.md)
- [Studio Store](../../../src-surfaces-base/studio/store/README.md)

## MVP-A0 Boundary

MVP-A0 is docs/contract/validator-only. It does not change highlight runtime
code, persisted blobs, native keys, storage behavior, or rendering behavior.

Existing highlight blobs remain annotation canonical data. Future A2b sidecar
data is auxiliary/derived and is not a second canonical writer.

## Attribution Rule

Inline highlights are structurally hard to attribute perfectly because the
existing store is a global blob keyed by answer id. Reader & Notes therefore uses
the no-mis-attribution rule:

- safely mapped highlights may be attributed to a `LibraryItem`
- unsafe or ambiguous highlights must be returned as `unattributed`
- highlights must never be attributed to the wrong `LibraryItem`

## Future Scope

MVP-A1 may expose a read-only annotation facade over highlights, notes, and
bookmarks only. It exposes no write APIs and fails closed.

MVP-A2a may extract a read-only anchor resolver from existing 3H1a behavior.
MVP-A2b may add sidecar-only auxiliary selectors, keyed by a globally unique
composition such as `{itemId}:{answerId}:{highlightId}` and stored only through
`H2O.Studio.platform.storage`.
