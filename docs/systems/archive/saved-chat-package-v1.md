# Saved Chat Package v1 Schema Spec

Status: Draft / Phase A architecture contract

Date: 2026-06-23

Related:

- [ADR-0009: Chat Saving Architecture - H2O Studio Archive Model](../../decisions/ADR-0009-chat-saving-architecture.md)
- [ADR-0005: Linked vs Saved Library Records](../../decisions/ADR-0005-linked-vs-saved-library-records.md)
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
- `assets/` is reserved in v1 and may be empty until asset CAS is implemented.
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
| `packageId` | string | Stable package identity from the Desktop store or export flow. |
| `chatId` | string | Canonical Studio chat identity; must match the package folder basename before `.h2ochat`. |
| `snapshotId` | string | Canonical saved snapshot identity from the Desktop store. |
| `createdAt` | string | ISO timestamp when the package identity was first created. |
| `generatedAt` | string | ISO timestamp for this package projection. |
| `generator` | object | H2O Studio generator provenance. |
| `source` | object | Host/source provenance for the original chat. |
| `store` | object | Desktop store provenance used to generate the package. |
| `files` | object | Required file paths and sha256 hashes. |
| `assets` | array | Future CAS asset descriptors; empty array when no assets are present. |
| `contentHash` | string | `sha256-<hex>` hash for the canonical preservation payload. |
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
| `messages` | array | Ordered transcript turns/messages. |
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
    "folderIds": [],
    "labelIds": [],
    "categoryIds": [],
    "tagIds": [],
    "projectIds": [],
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
      "text": "Message text",
      "content": [
        {
          "type": "text",
          "text": "Message text"
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

Message rules:

- `messages` must be ordered by `turnIndex`, then stable message id.
- `role` should be one of `system`, `user`, `assistant`, `tool`, or `unknown`.
- `text` is the normalized readable text for the message.
- `content` is the structured content array used for richer renderers and future
  asset references.
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
2. Ordered future asset descriptors and raw asset hashes when assets are present.

`manifest.contentHash` is the SHA-256 hash of that canonical preservation
payload. It excludes `manifest.json` to avoid circular hashing and excludes
`chat.md` and `chat.html` because they are derived renderers.

`manifest.files.snapshot.sha256` must equal the hash of the canonical
`snapshot.json` bytes.

`manifest.files.markdown.sha256` and `manifest.files.html.sha256` bind the
generated renderer files for tamper detection, but those renderer hashes do not
define the preserved chat identity.

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
- `manifest.json`, `snapshot.json`, `chat.md`, `chat.html`, and `assets/` exist.
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
- `manifest.contentHash` matches the canonical preservation payload.
- `chat.md` and `chat.html` file hashes match the manifest when present.
- Every `snapshot.messages[*].assetRefs[*]` has a matching manifest asset when
  assets are present.
- Every manifest asset path is package-local and its raw bytes match its hash.
- No package path is absolute, contains `..`, resolves outside the package root,
  or depends on symlink traversal.

Renderer hash failure means the package fails full integrity validation, but a
recovery flow may rebuild renderers if `manifest.json`, `snapshot.json`, and
referenced assets are otherwise valid.

## Non-Goals for Phase A/B

Phase A and Phase B do not include:

- runtime package writer implementation
- runtime package importer implementation
- asset CAS implementation
- live package editing
- Desktop archive index implementation
- Chrome package materialization
- sync bridge changes
- WebDAV, cloud, or relay transport
- ChatGPT export ZIP parser implementation
- public backup/restore UI
- full-text search index generation
