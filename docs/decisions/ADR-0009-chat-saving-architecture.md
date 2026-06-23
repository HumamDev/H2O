# ADR-0009: Chat Saving Architecture - H2O Studio Archive Model

Status: Accepted

Date: 2026-06-23

Related:

- [ADR-0005: Linked vs Saved Library Records](ADR-0005-linked-vs-saved-library-records.md)
- [ADR-0007: Studio Canonical Organization State + Transport Adapter Strategy](ADR-0007-studio-canonical-organization-state-transport-adapters.md)
- [ADR-0008: Chrome Companion Surface + Desktop Professional Workspace Contract](ADR-0008-chrome-companion-desktop-professional-workspace-contract.md)
- [Contract: Library](../systems/library/contract.md)
- [Saved Chat Package v1 Schema Spec](../systems/archive/saved-chat-package-v1.md)

## Problem Statement

H2O Studio needs a durable model for saving, exporting, importing, and later
rebuilding ChatGPT chats without creating competing data authorities.

The product has two Studio surfaces:

- Chrome Studio: a light companion surface for capture, linking, and basic
  organization.
- Desktop Studio: the canonical professional workspace for durable archive,
  search, indexing, bulk workflows, backup, recovery, and operator diagnostics.

The main user workflows are:

- Save to Folder: create a full durable saved chat snapshot, transcript, and
  archive record.
- Add to Library: create a lightweight indexed chat link and metadata record.
- ChatGPT export ZIP import: support secondary migration and recovery only.

If package files, Chrome storage, import ZIPs, sync bundles, or derived renderers
become editable stores, H2O will have duplicate truth, inconsistent hashes,
unclear recovery semantics, and hard-to-debug Desktop/Chrome divergence.

## Decision

H2O Studio uses a hybrid saved-chat model:

- Desktop SQLite / H2O.Studio.store adapters are the only live mutation source of truth.
- Saved chat packages are generated preservation projections.
- Packages can rebuild/import into the DB only through explicit import/recovery flows.
- Packages must never become a second live mutable store.

Saved chat packages are deterministic, hash-bound exports generated from the
Desktop store. They preserve the captured chat and make it portable, readable,
and recoverable, but they do not own live edits, folder bindings, search index
state, sync conflict state, or operator workflow state.

The package contract is:

- `manifest.json` is the schema, version, hash, and provenance contract.
- `snapshot.json` is the canonical saved capture inside the package.
- `chat.md` and `chat.html` are derived readable and visual renderers.
- `assets/` is the future content-addressed binary preservation area.

## Source-of-Truth Rule

The live mutation source of truth is the Desktop store layer:

- Desktop SQLite tables hold canonical durable chat, snapshot, folder binding,
  library metadata, archive index, and recovery state.
- `H2O.Studio.store` adapters are the only approved live write boundary.
- Runtime reads may use indexed projections and caches, but those projections
  must be rebuildable from the store.

Saved chat packages are generated preservation projections:

- A package is emitted from a known store state.
- A package may be imported or used for recovery only through an explicit
  import/recovery flow that writes back through the store adapters.
- A package is not edited in place as the user's active workspace.
- A package does not accept live mutations from Chrome, sync transport, or
  derived renderer tools.

Packages must never become a second live mutable store.

## Surface Responsibilities

| Area | Chrome Studio | Desktop Studio |
|---|---|---|
| Primary role | Light companion surface | Full professional workspace |
| Capture | Quick capture/link/save request near ChatGPT context | Durable ingestion, validation, review, and archive ownership |
| Save to Folder | May initiate or hand off the action | Owns canonical saved snapshot and package materialization |
| Add to Library | May create or request lightweight link metadata | Owns canonical Library/store state and repair/index flows |
| Archive/index | Does not own heavy archive/search/index systems | Owns archive/index/search/rebuild/operator systems |
| Package writer | Must not own package materialization | Sole owner for saved-chat package generation |
| Bulk/recovery | Avoids heavy and destructive workflows | Owns bulk operations, import, recovery, and diagnostics |
| Sync | May transport approved store projections later | Defines canonical state exported into transport adapters later |

Chrome remains useful for quick capture and basic organization, but it should not
grow into a heavy archive database, package writer, search index, bulk operator
tool, or recovery console.

Desktop remains the canonical professional workspace and owns saved-chat package
materialization.

## Workflow Semantics

### Save to Folder

Save to Folder means the user wants a durable saved chat.

The action creates or updates canonical Desktop store state for:

- saved chat identity
- full captured transcript/snapshot
- folder binding and organization metadata
- Library state where `state.isSaved === true`
- link state where a native `chatId` is available, matching ADR-0005

Package generation is a projection step after store mutation. The package does
not become the editable source after it is written.

### Add to Library

Add to Library means the user wants a lightweight indexed chat link and metadata
record.

The action creates or updates canonical Library/store metadata for:

- native chat identity
- source URL
- title and display metadata
- link provenance
- Library state where `state.isLinked === true`

Add to Library does not capture a full transcript and does not require a saved
chat package. A later Save to Folder action may promote the same canonical chat
record to linked plus saved.

### ChatGPT Export ZIP Import

ChatGPT export ZIP import is a secondary migration/recovery path.

ZIP import may map exported conversations into canonical Desktop store records
through an explicit import flow. It is not the core product path, not the package
format, and not a live source of truth.

## Package-as-Projection Rule

Saved chat packages are deterministic preservation projections from the Desktop
store.

A package must be reproducible from the same canonical store snapshot, package
schema version, renderer version, and asset set. Hashes in `manifest.json` bind
the projection to its preserved content.

The package may be copied, backed up, inspected, imported, or rebuilt, but all
live changes after import happen in Desktop SQLite through `H2O.Studio.store`
adapters. If package contents are edited externally, the edited files are treated
as untrusted import input, not as an accepted live mutation.

## Relation to Sync Architecture

This ADR is separate from the current Sync Architecture / RC smoke bridge lane.

Sync is a later transport concern. It must not define archive ownership,
package mutation, package materialization, or live saved-chat authority.

Future sync work may transport:

- canonical store records
- generated package bytes or package references
- package hash/provenance metadata
- import/recovery status

Future sync work must not:

- make packages an editable live sync database
- let Chrome own package materialization
- introduce a second mutation authority beside Desktop SQLite / store adapters
- merge WebDAV/cloud/relay transport semantics into the archive ownership model

ADR-0007 remains the organization-state transport authority. ADR-0008 remains
the Chrome companion / Desktop professional workspace boundary. This ADR adds
the saved-chat archive/package boundary.

## Non-Goals

This ADR does not implement:

- runtime behavior
- package writer code
- package importer code
- CAS asset storage
- sync bridge changes
- WebDAV, cloud, or relay transport
- Desktop SQLite schema changes
- Chrome package materialization
- full-text search/index implementation
- bulk archive workflows
- ChatGPT export ZIP parser behavior
- UI label or menu behavior changes

## Risks

| Risk | Mitigation |
|---|---|
| Packages become an alternate editable database | Keep package files projection-only and require explicit import/recovery flows back through store adapters. |
| Chrome grows heavy archive responsibilities | Keep Chrome scoped to capture/link/basic organization and hand off durable package work to Desktop. |
| Derived `chat.md` or `chat.html` diverge from the canonical capture | Treat `snapshot.json` as the package capture authority and make renderers rebuildable. |
| Hashes become non-deterministic | Define canonical serialization, stable file ordering, and hash inputs in the v1 schema spec. |
| ChatGPT export ZIP becomes the product path | Keep ZIP import secondary and map it into store records before package generation. |
| Sync work accidentally redefines archive ownership | Keep sync as later transport only and route all live mutations through Desktop store adapters. |
| Asset preservation expands too early | Reserve `assets/` and CAS references now; implement binary preservation in a later phase. |

## Phased Roadmap

| Phase | Scope | Status |
|---|---|---|
| Phase A - ADR / architecture contract | Define ownership, source-of-truth, package projection, and sync boundary. | This document |
| Phase B - MVP saved package format | Implement minimal deterministic `manifest.json`, `snapshot.json`, `chat.md`, and `chat.html` projection from Desktop store. | Future |
| Phase C - Desktop archive/index + asset CAS | Add Desktop archive/index workflows and content-addressed binary preservation. | Future |
| Phase D - Chrome capture/link/save handoff | Keep Chrome light while supporting capture/link/save requests into Desktop-owned workflows. | Future |
| Phase E - import/export compatibility | Add explicit package import/recovery and ChatGPT export ZIP migration support. | Future |
| Phase F - sync integration later | Transport canonical store/package projections after ownership and package contracts are stable. | Future |

## Wrong Turns to Avoid

- Do not make `<chatId>.h2ochat/` a live workspace database.
- Do not let `manifest.json` or `snapshot.json` be patched directly as the
  normal save path.
- Do not treat `chat.md` or `chat.html` as canonical transcript sources.
- Do not make Chrome own archive indexing, package writing, CAS, bulk recovery,
  or heavy diagnostics.
- Do not couple the package format to the current local sync bridge or RC smoke
  bridge lane.
- Do not make WebDAV/cloud/relay decisions in this archive ownership phase.
- Do not treat ChatGPT export ZIP import as the primary save model.
- Do not create one package database for Desktop and another package database for
  Chrome.
- Do not add runtime behavior under this Phase A contract.
