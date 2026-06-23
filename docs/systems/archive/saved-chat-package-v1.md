# Saved Chat Package v1 Schema Spec

Status: Draft / Phase A architecture contract

Date: 2026-06-23

Related:

- [ADR-0009: Chat Saving Architecture - H2O Studio Archive Model](../../decisions/ADR-0009-chat-saving-architecture.md)
- [ADR-0005: Linked vs Saved Library Records](../../decisions/ADR-0005-linked-vs-saved-library-records.md)
- [Saved Chat Package Format — Versioned Umbrella Spec](saved-chat-package-format.md) — version matrix; v2 (asset-capable) design
- [Contract: Library](../library/contract.md)
- [Library Record Shapes](../library/record-shapes.md)

## Scope

This document defines the v1 saved-chat package shape for H2O Studio. It is a
schema and validation contract only. It does not implement package writing,
package importing, asset CAS, sync transport, or runtime behavior.

Source-of-truth rule:

- Desktop SQLite / H2O.Studio.store adapters are the only live mutation source of truth.
- Saved chat packages are generated preservation projections.
- Packages can rebuild/import into the DB only through explicit import/recovery flows.
- Packages must never become a second live mutable store.

Terminology:

- `chatId` in this package spec means the canonical Studio chat identity.
- The native ChatGPT conversation id, when available, lives under
  `source.nativeConversationId`.
- Imported/local saved-only chats may have no `source.nativeConversationId`.
- ADR-0005 uses `chatId` in the Library record model for the native/openable
  registry identity; this package spec narrows `chatId` to the canonical Studio
  package identity so saved packages can also represent imported/local chats.

V1 packages represent one saved snapshot for a chat, normally the current/latest
saved snapshot selected for export. Multi-snapshot package history is deferred.

## Package Folder Shape

A saved chat package is a directory with the `.h2ochat` suffix:

```text
<chatId>.h2ochat/
|-- manifest.json
|-- snapshot.json
|-- chat.md
|-- chat.html
`-- assets/
    |-- sha256-<hash>.png
    `-- sha256-<hash>.pdf
```

Rules:

- `<chatId>` is the canonical Studio chat identity from the Desktop store. For
  imported/local chats without a native ChatGPT conversation id, the importer
  must allocate a stable Studio chat identity before package materialization.
- Native ChatGPT conversation ids must be recorded in
  `source.nativeConversationId`, not overloaded into the package `chatId`.
- `assets/` is reserved in v1 and may be empty until asset CAS is implemented.
  When `manifest.assets` is empty, the physical `assets/` directory may be
  absent because ZIP/git workflows can drop empty directories.
- All package paths are relative to the package root.
- Paths must use `/` separators in manifest fields.
- Package readers must reject absolute paths, `..` segments, symlinks, and files
  outside the package root.

## `manifest.json` v1

`manifest.json` is the schema, version, hash, and provenance contract for the
package. It describes the package files and binds them to the preserved content.
It is not a mutable workspace record.

Required fields:

| Field | Type | Semantics |
|---|---|---|
| `schema` | string | Must be `h2o.savedChatPackage`. |
| `schemaVersion` | number | Must be `1` for this spec. |
| `packageId` | string | Package/export identifier; non-authoritative and not a live record id. |
| `chatId` | string | Canonical Studio chat identity; must match the package folder basename before `.h2ochat`. |
| `snapshotId` | string | Canonical saved snapshot identity from the Desktop store. |
| `createdAt` | string | ISO timestamp when the package identity was first created. |
| `generatedAt` | string | ISO timestamp for this package projection. |
| `generator` | object | H2O Studio generator provenance. |
| `source` | object | Host/source provenance for the original chat. |
| `store` | object | Desktop store provenance used to generate the package. |
| `files` | object | Required file paths and sha256 hashes. |
| `assets` | array | Future CAS asset descriptors; empty array when no assets are present. |
| `contentHash` | string | `sha256-<hex>` hash of canonical `snapshot.json` bytes in v1. |
| `provenance` | object | Save/import/export provenance and source-of-truth declaration. |

Recommended v1 shape:

```json
{
  "schema": "h2o.savedChatPackage",
  "schemaVersion": 1,
  "packageId": "pkg_01H2OCHAT...",
  "chatId": "chat_01H2OCHAT...",
  "snapshotId": "snap_01H2OCHAT...",
  "createdAt": "2026-06-23T00:00:00.000Z",
  "generatedAt": "2026-06-23T00:00:00.000Z",
  "generator": {
    "surface": "desktop",
    "app": "H2O Studio",
    "appVersion": "",
    "buildId": "",
    "rendererVersion": "saved-chat-package-v1"
  },
  "source": {
    "host": "chatgpt.com",
    "nativeConversationId": "",
    "sourceHref": "",
    "accountHint": ""
  },
  "store": {
    "authority": "desktop-sqlite-store",
    "adapter": "H2O.Studio.store",
    "storeSchemaVersion": "",
    "recordVersion": "",
    "exportedFrom": "desktop"
  },
  "files": {
    "snapshot": {
      "path": "snapshot.json",
      "sha256": "sha256-0000000000000000000000000000000000000000000000000000000000000000",
      "byteLength": 0
    },
    "markdown": {
      "path": "chat.md",
      "sha256": "sha256-0000000000000000000000000000000000000000000000000000000000000000",
      "byteLength": 0,
      "derivedFrom": "snapshot.json"
    },
    "html": {
      "path": "chat.html",
      "sha256": "sha256-0000000000000000000000000000000000000000000000000000000000000000",
      "byteLength": 0,
      "derivedFrom": "snapshot.json"
    }
  },
  "assets": [],
  "contentHash": "sha256-0000000000000000000000000000000000000000000000000000000000000000",
  "provenance": {
    "createdBy": "save-to-folder",
    "sourceOfTruth": "desktop-sqlite-store",
    "projectionOnly": true
  }
}
```

`generator.surface` must be `desktop` for v1 package materialization. Chrome may
initiate or hand off a save request in a later phase, but Chrome does not own the
v1 package writer.

`provenance.projectionOnly` must be `true`. A validator must reject a package
that claims to be a live mutable store.

`packageId` is a package/export identifier only. It may be deterministic or
generated by the export flow, but import/recovery must reconcile through
`chatId`, `snapshotId`, and Desktop store rules rather than treating
`packageId` as a second source of truth.

## `snapshot.json` v1

`snapshot.json` is the canonical saved capture inside the package. It is the
source for rebuilding `chat.md`, `chat.html`, and future search/import
projections. It is still a package projection from Desktop store state, not the
active live database.

Required top-level fields:

| Field | Type | Semantics |
|---|---|---|
| `schema` | string | Must be `h2o.savedChatSnapshot`. |
| `schemaVersion` | number | Must be `1` for this spec. |
| `chatId` | string | Canonical Studio chat identity. |
| `snapshotId` | string | Canonical saved snapshot identity. |
| `capturedAt` | string | ISO timestamp for source transcript capture. |
| `savedAt` | string | ISO timestamp for Save to Folder persistence. |
| `title` | string | Best known saved title at capture time. |
| `source` | object | Original source metadata. |
| `library` | object | Library and organization metadata at capture time. |
| `messages` | array | Ordered visible transcript turns/messages. |
| `metadata` | object | Capture/runtime metadata that is not primary transcript content. |

Recommended v1 shape:

```json
{
  "schema": "h2o.savedChatSnapshot",
  "schemaVersion": 1,
  "chatId": "chat_01H2OCHAT...",
  "snapshotId": "snap_01H2OCHAT...",
  "capturedAt": "2026-06-23T00:00:00.000Z",
  "savedAt": "2026-06-23T00:00:00.000Z",
  "title": "Example chat",
  "source": {
    "host": "chatgpt.com",
    "nativeConversationId": "",
    "sourceHref": "",
    "accountHint": ""
  },
  "library": {
    "isLinked": true,
    "isSaved": true,
    "folderIdAtCapture": "",
    "categoryIdAtCapture": "",
    "projectIdAtCapture": "",
    "labelIdsAtCapture": [],
    "tagIdsAtCapture": [],
    "linkSourceHref": ""
  },
  "messages": [
    {
      "id": "msg_01H2OCHAT...",
      "role": "user",
      "author": "",
      "createdAt": "2026-06-23T00:00:00.000Z",
      "turnIndex": 0,
      "parentId": "",
      "contentText": "Message text",
      "contentHtml": "<p>Message text</p>",
      "content": [
        {
          "type": "text",
          "text": "Message text"
        },
        {
          "type": "html",
          "html": "<p>Message text</p>",
          "sanitized": true
        }
      ],
      "assetRefs": [],
      "metadata": {}
    }
  ],
  "metadata": {
    "captureSurface": "desktop",
    "captureAdapter": "",
    "model": "",
    "locale": "",
    "timezone": ""
  }
}
```

The example values above are illustrative. `library.isLinked` and
`library.isSaved` mirror canonical record state rather than package constants:

- A linked native chat can have `isLinked: true`.
- A full saved snapshot has `isSaved: true`.
- An imported/local saved-only transcript may have `isSaved: true` and
  `isLinked: false`, matching ADR-0005 because it has no native chat identity to
  open.

The capture-time organization fields must be read through canonical store
adapters or resolved canonical values, not raw stale mirrors. V1 uses the
existing point-in-time snapshot names and cardinality:

- `folderIdAtCapture`
- `categoryIdAtCapture`
- `projectIdAtCapture`
- `labelIdsAtCapture`
- `tagIdsAtCapture`

Message rules:

- `messages` correspond to the visible linear thread captured from internal
  turns / `TurnRecord` / `snapshot_turns`. Full branch/tree preservation is
  deferred.
- `messages` must be ordered by `turnIndex`, then stable message id.
- `role` should be one of `system`, `user`, `assistant`, `tool`, or `unknown`.
- `contentText` is the normalized readable text for search, fallback rendering,
  and recovery. Package-generated v1 messages must include it; importers may
  normalize legacy `text` fields into `contentText`.
- `contentHtml` is an optional sanitized HTML fidelity payload for replay and
  visual rendering. It is normalized from existing `outer_html`, `outerHTML`,
  `outerHtml`, `html`, or `contentHtml` store/capture fields when present.
- `content` is a structured content array. Phase B only needs the minimal
  `text` and sanitized `html` entries shown above; richer code, image, tool,
  citation, and multimodal mapping is deferred.
- `assetRefs` contains future `sha256-<hash>` ids for binary assets in `assets/`.
- Unknown metadata may be preserved under `metadata`, but importers must not
  require unknown metadata for core transcript recovery.

## Derived Files

### `chat.md`

`chat.md` is a readable Markdown renderer derived from `snapshot.json`.

Rules:

- It is not canonical transcript storage.
- It may include title, capture metadata, source link, and ordered messages.
- It must be rebuildable from `snapshot.json` and available assets.
- Edits to `chat.md` do not mutate the saved chat unless an explicit importer
  chooses to parse them as untrusted input in a future phase.

### `chat.html`

`chat.html` is a visual renderer derived from `snapshot.json`.

Rules:

- It is not canonical transcript storage.
- It must not define live mutation behavior.
- It derives from `contentHtml` when a sanitized HTML payload is present.
- It falls back to `contentText` and minimal `content` rendering when HTML
  fidelity payloads are absent.
- It may reference package-local assets by relative path only.
- It must be rebuildable from `snapshot.json`, package renderer version, and
  available assets.

## Future `assets/` CAS References

Binary preservation is reserved for a later phase. The v1 package shape reserves
`assets/` and the manifest `assets` array so future packages can preserve images,
PDFs, and other binary artifacts without changing the root folder contract.

Asset rules:

- Asset file names must use `sha256-<hex>.<ext>`.
- The hash is over the raw asset bytes.
- `manifest.assets[*].sha256` must match the filename hash.
- `snapshot.json` message `assetRefs` must refer to `sha256-<hex>` ids, not
  mutable file names.
- Assets are immutable content-addressed objects once written.
- Missing assets must not invalidate the transcript snapshot hash, but they must
  fail full package integrity validation when referenced by the snapshot.

Recommended future asset descriptor:

```json
{
  "assetId": "sha256-0000000000000000000000000000000000000000000000000000000000000000",
  "path": "assets/sha256-0000000000000000000000000000000000000000000000000000000000000000.png",
  "sha256": "sha256-0000000000000000000000000000000000000000000000000000000000000000",
  "mimeType": "image/png",
  "byteLength": 0,
  "sourceMessageId": "msg_01H2OCHAT..."
}
```

## Content Hash Contract

All hashes use SHA-256 and lowercase hex with the `sha256-` prefix.

The canonical preservation payload for v1 is:

1. Canonical `snapshot.json` bytes.

`manifest.contentHash` is the SHA-256 hash of canonical `snapshot.json` bytes.
With no assets, `manifest.contentHash === manifest.files.snapshot.sha256`.

`manifest.files.snapshot.sha256` must equal the hash of the canonical
`snapshot.json` bytes.

`manifest.files.markdown.sha256` and `manifest.files.html.sha256` bind the
generated renderer files for tamper detection, but those renderer hashes do not
define the preserved chat identity.

Asset-inclusive payload hashing is deferred to the CAS/assets phase and may
require a schema or hash-contract bump. V1 must not claim future asset hashes as
part of `contentHash` before assets exist.

Canonical JSON requirements:

- UTF-8 bytes.
- No byte order mark.
- LF line endings.
- Object keys sorted recursively.
- Stable array order as defined by each field.
- No insignificant whitespace outside the canonical serializer's output.
- Empty optional collections emitted as empty arrays or empty objects when the
  field is required by this spec.

## Import and Rebuild Expectations

Package rebuild:

- Rebuild `chat.md` and `chat.html` from `snapshot.json`, renderer version, and
  package-local assets.
- Recompute file hashes and `contentHash`.
- Do not infer live mutations from derived renderer edits.

Package import/recovery:

- Must be explicit operator/user action.
- Must validate `manifest.json` and `snapshot.json` before writing.
- Must write through Desktop SQLite / `H2O.Studio.store` adapters.
- Must not patch package files as a substitute for store writes.
- After import, Desktop store state becomes the live source of truth.
- A fresh package may be generated from imported store state.

ChatGPT export ZIP import:

- Is a secondary migration path.
- Must map ZIP data into canonical Desktop store records before package
  generation.
- Must not become the saved-chat package format.

## Validation Rules

A v1 validator must check:

- Package root name ends in `.h2ochat`.
- Package root basename before `.h2ochat` matches `manifest.chatId`.
- `manifest.json`, `snapshot.json`, `chat.md`, and `chat.html` exist.
- `assets/` exists when `manifest.assets` is non-empty; it may be absent when
  `manifest.assets` is empty.
- `manifest.schema === "h2o.savedChatPackage"`.
- `manifest.schemaVersion === 1`.
- `snapshot.schema === "h2o.savedChatSnapshot"`.
- `snapshot.schemaVersion === 1`.
- `manifest.chatId === snapshot.chatId`.
- `manifest.snapshotId === snapshot.snapshotId`.
- `manifest.store.authority === "desktop-sqlite-store"`.
- `manifest.provenance.sourceOfTruth === "desktop-sqlite-store"`.
- `manifest.provenance.projectionOnly === true`.
- Every hash matches `sha256-[0-9a-f]{64}`.
- `manifest.files.snapshot.sha256` matches canonical `snapshot.json` bytes.
- `manifest.contentHash` matches canonical `snapshot.json` bytes.
- `manifest.contentHash === manifest.files.snapshot.sha256` when no assets are
  present.
- `chat.md` and `chat.html` file hashes match the manifest when present.
- Every package-generated message has `contentText`; importers may normalize
  legacy `text` before validation.
- Every `contentHtml`, `html`, `outerHTML`, `outerHtml`, or `outer_html`
  fidelity payload accepted by import/recovery is sanitized before package
  emission as `contentHtml`.
- Every `snapshot.messages[*].assetRefs[*]` has a matching manifest asset when
  assets are present.
- Every manifest asset path is package-local and its raw bytes match its hash.
- No package path is absolute, contains `..`, resolves outside the package root,
  or depends on symlink traversal.

Renderer hash failure means the package fails full integrity validation, but a
recovery flow may rebuild renderers if `manifest.json`, `snapshot.json`, and
referenced assets are otherwise valid.

## Non-Goals for Phase A/B

Phase B includes a private Desktop-only package projector/writer
(`H2O.Studio.ingestion.buildSavedChatPackageV1` and
`writeSavedChatPackageV1`): an explicitly-invoked, read-through-store,
projection-only materializer that writes package files to an explicit target
folder. That private writer is in scope.

The following remain out of scope for Phase A/B:

- UI-wired writer or any Save-to-Folder menu/button/UI wiring
- automatic, background, or triggered package materialization (no watchers,
  no sync-driven or event-driven writes)
- package importer / recovery flow
- asset CAS implementation
- live package editing (packages remain projection-only, never a live store)
- Desktop archive index implementation
- Chrome package materialization
- sync bridge changes
- WebDAV, cloud, or relay transport
- ChatGPT export ZIP parser implementation
- public backup/restore UI
- full-text search index generation
