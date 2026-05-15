# ADR-0005: Linked vs Saved Library Records

Status: Accepted

Date: 2026-05-12

## Context

The Studio Library should be the central hub for two distinct kinds of records:

1. **Linked records** — lightweight pointers to a native ChatGPT chat, capturing identity + metadata + URL but **no transcript**. Created by the planned **Add to Library** action.
2. **Saved records** — full transcript snapshots captured into `0D3a` archive, optionally folder-bound. Created by today's existing capture flow (currently surfaced as "Add to Folder"; planned visible rename to **Save to Folder**).

The same native chat may transition from linked-only to linked+saved over time. Two separate records per chat are unacceptable: it would split metadata, fork folder bindings, and confuse open-behavior. A single canonical record per `chatId` is required.

A separate edge case exists: imported/local transcripts have no source URL and therefore no parsable `chatId`. They can only ever be saved — never linked.

## Decision

A single Chat Registry record (`0F1g`) per identity, with two independent boolean state flags:

- `state.isLinked` — set on explicit user intent (Add to Library, Save to Folder, or backfill).
- `state.isSaved` — set when a transcript snapshot exists in `0D3a`.

The merge enforces a single invariant:

```
chatId is parsable AND state.isSaved === true   ⟹   state.isLinked === true
```

This makes "saved-only with chatId" impossible, and reserves the saved-only shape exclusively for imported/local transcripts where `chatId` is empty.

Three additive top-level fields capture link provenance:

- `linkedAt` (first-write wins; never overwritten)
- `linkedFrom` (incoming patch wins, else existing, else `'backfill:saved'`)
- `linkSourceHref` (incoming patch wins, else existing, else record `href`)

A one-shot `H2O.ChatRegistry.repairLinkedFlag()` runs on Chat Registry boot to backfill the invariant on any pre-existing records, then exits cleanly. The repair is idempotent and emits a single `repair-linked` change event covering all touched chatIds.

## Consequences

- Library Index (`0F1c`) and Library Workspace (`0F1b`) require **no merge-order or dedup changes**. The existing `chatMap` keyed by `chatId` and sticky-on-true state merge already handle Linked, Saved, and Linked+Saved as one row.
- The visible "Add to Folder" rename to "Save to Folder", the new "Add to Library" menu item, the Studio row chips, and the row secondary action ("Open original ChatGPT chat") all land in later phases against this stable data contract.
- Existing saved-transcript records gain `state.isLinked = true` on first boot after the change (via the backfill), without any storage migration or schema bump.
- `H2O.LibraryActions` (planned, Phase 2) is the single namespace that will own the high-level write paths — `addToLibrary`, `saveToFolder`, `openLinkedChat`, `removeFromLibrary`. `0F3a` Folders becomes a thin DOM-injection caller, not a business-logic owner.

## Validation

- `H2O.ChatRegistry.repairLinkedFlag()` returns `{ scanned, updated }`. After it runs, `listRecords().filter(r => r.chatId && r.state?.isSaved && !r.state?.isLinked).length === 0`.
- An `upsertRecord({ chatId, state: { isSaved: true } })` returns a record with both `state.isSaved` and `state.isLinked` true, plus non-empty `linkedAt`.
- An `upsertRecord({ state: { isSaved: true } })` (no chatId; imported-only) returns a record with `state.isSaved === true && state.isLinked === false && linkedAt === ''`.
- Existing methods continue to work: `selfCheck()`, `getStats()`, `verifyHealth()`, `repairIndex()`, `subscribe()`.

## Out of scope (deferred phases)

- The visible string rename "Add to Folder" → "Save to Folder" (Phase 4).
- The new "Add to Library" native menu item and click handler (Phase 3).
- The `H2O.LibraryActions` module (Phase 2).
- Studio row chips ("Linked" / "Saved") and the row secondary action (Phase 5).
- Liveness check on linked URLs (deferred to polish).
- Cross-account scoping of `chatId` (deferred to long-term).
