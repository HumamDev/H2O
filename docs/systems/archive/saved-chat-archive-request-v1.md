# Saved Chat Archive Request v1

Status: Draft / Phase D.1 contract (docs only)

Date: 2026-06-24

Lane: Chat Saving Architecture (separate from the Sync Architecture / RC smoke bridge lane)

Related:

- [ADR-0009: Chat Saving Architecture - H2O Studio Archive Model](../../decisions/ADR-0009-chat-saving-architecture.md)
- [ADR-0010: Saved Chat Asset CAS + Capability Gate](../../decisions/ADR-0010-saved-chat-asset-cas.md)
- [Saved Chat Package Format - Versioned Umbrella Spec](saved-chat-package-format.md)
- [Saved Chat Archive Health UI - C6 Closure](../../../release-evidence/2026-06-24/saved-chat-archive-health-ui-c6-closure.md)

## Objective

Phase D adds the Chrome-to-Desktop handoff contract for saved-chat archive
requests.

Chrome Studio may express "please save/archive this chat" intent near the ChatGPT
context. Desktop Studio remains the only authority that validates the request,
resolves Desktop SQLite / `H2O.Studio.store` state, materializes saved-chat
packages, owns CAS, and diagnoses durable archive state.

D.1 is a contract only. It implements no runtime queue, no Chrome service-worker
route, no Desktop intake handler, no package writer behavior, and no sync
transport.

## Ownership Rules

Chrome owns request intent only:

- Chrome may create a request envelope.
- Chrome may track request status once a later approved transport exposes one.
- Chrome may include lightweight source metadata and target hints.
- Chrome must treat any local capture evidence as untrusted handoff input.

Desktop owns all durable archive authority:

- Desktop owns request validation.
- Desktop owns DB/store resolution through `H2O.Studio.store` adapters.
- Desktop owns saved-chat package materialization.
- Desktop owns live CAS and package asset copies.
- Desktop owns archive diagnostics and durable package state.

Chrome must never:

- write `archive/packages`
- write Desktop SQLite
- build `manifest.json`
- build `snapshot.json`
- build `chat.md`
- build `chat.html`
- build package `assets/`
- write or own CAS
- compute authoritative package `contentHash`

Packages remain generated Desktop preservation projections. A request is not a
package, not a store mutation, and not a second source of truth.

## Request Envelope

Schema name:

```text
h2o.savedChatArchiveRequest.v1
```

Minimal envelope:

```json
{
  "schema": "h2o.savedChatArchiveRequest.v1",
  "requestId": "01J...",
  "dedupeKey": "sha256-...",
  "createdAt": "2026-06-24T00:00:00.000Z",
  "source": {
    "surface": "chrome-studio",
    "nativeConversationId": "chatgpt-native-conversation-id-or-null",
    "href": "https://chatgpt.com/c/example",
    "title": "Visible chat title",
    "capturedAt": "2026-06-24T00:00:00.000Z",
    "captureDigest": "sha256-optional-visible-capture-digest",
    "messageCount": 12
  },
  "desktopResolution": {
    "studioChatId": "optional-desktop-studio-chat-id",
    "snapshotId": "optional-desktop-snapshot-id",
    "requireExistingDesktopSnapshot": true
  },
  "intent": {
    "kind": "save-to-folder",
    "target": {
      "folderIdAtRequest": "optional-folder-id",
      "categoryIdAtRequest": "optional-category-id",
      "projectIdAtRequest": "optional-project-id",
      "labelIdsAtRequest": [],
      "tagIdsAtRequest": []
    }
  },
  "payloadPolicy": {
    "containsSnapshotContent": false,
    "containsAssets": false
  }
}
```

Field contract:

| Field | Required | Semantics |
|---|---:|---|
| `schema` | yes | Must be `h2o.savedChatArchiveRequest.v1`. |
| `requestId` | yes | Tracks one user action or one generated request envelope. |
| `dedupeKey` | yes | Stable key used by Desktop to collapse repeated delivery of the same request intent. |
| `createdAt` | yes | Request creation timestamp from the sending surface. |
| `source.surface` | yes | Expected first value: `chrome-studio`. |
| `source.nativeConversationId` | no | Native ChatGPT conversation ID when known. This is not the package `chatId`. |
| `source.href` | no | Source URL or normalized conversation URL when available. |
| `source.title` | no | Display title hint only. Desktop may replace this from store state. |
| `source.capturedAt` | no | Timestamp for the Chrome-observed capture metadata. |
| `source.captureDigest` | no | Digest of Chrome-observed capture evidence, if available. Not a package `contentHash`. |
| `source.messageCount` | no | Chrome-observed visible message count hint. |
| `desktopResolution.studioChatId` | no | Desktop canonical Studio chat identity when Chrome already knows it. |
| `desktopResolution.snapshotId` | no | Desktop snapshot identity when Chrome already knows it. |
| `desktopResolution.requireExistingDesktopSnapshot` | yes | D.1 requires Desktop to package only an existing Desktop snapshot. |
| `intent.kind` | yes | Initial allowed value: `save-to-folder`. Future values require a contract update. |
| `intent.target.folderIdAtRequest` | no | Target folder hint at request time. Desktop resolves through store state. |
| `intent.target.categoryIdAtRequest` | no | Target category hint at request time. Desktop resolves through store state. |
| `intent.target.projectIdAtRequest` | no | Target project hint at request time. Desktop resolves through store state. |
| `intent.target.labelIdsAtRequest` | no | Target label hints at request time. Desktop resolves through store state. |
| `intent.target.tagIdsAtRequest` | no | Target tag hints at request time. Desktop resolves through store state. |
| `payloadPolicy.containsSnapshotContent` | yes | Must be `false` in D.1. |
| `payloadPolicy.containsAssets` | yes | Must be `false` in D.1. |

## Lifecycle States

| State | Meaning |
|---|---|
| `draft` | Chrome-side local intent exists, not handed to Desktop or transport. |
| `queued` | Request has been handed to a later transport/relay and is waiting for Desktop. |
| `received` | Desktop observed the request envelope. |
| `validated` | Desktop accepted the request schema and basic trust boundary checks. |
| `needs-desktop-snapshot` | Desktop cannot resolve an existing Desktop snapshot to package. |
| `accepted` | Desktop can satisfy the request from Desktop store state. |
| `writing` | Desktop is materializing a package with the Desktop package writer. |
| `written` | Desktop wrote the package under the app-owned archive. |
| `duplicate` | Desktop deduped the request to an existing request or result. |
| `rejected` | Desktop rejected malformed, unsupported, or unsafe input. |
| `failed` | Desktop attempted accepted work and it failed. |

State is request status, not package status. Archive package validity remains the
responsibility of the package validator and Archive Health diagnostics.

## Dedupe Policy

- `requestId` tracks one user action or one generated request envelope.
- `dedupeKey` collapses repeated requests for the same native
  conversation/snapshot/target intent.
- Duplicate delivery must be idempotent.
- A duplicate request must not create duplicate packages, duplicate DB writes, or
  duplicate CAS writes.
- Desktop should return or expose the original request status when a request is
  classified as `duplicate`.

The exact `dedupeKey` construction is a D.2/D.3 implementation detail, but it
should be derived from stable request intent fields such as native conversation
identity, Desktop snapshot identity when present, normalized source URL, target
folder/category/project/labels/tags, and request kind. Volatile fields such as
delivery time should not make an otherwise identical request unique.

## Desktop Resolution Rules

Desktop should prefer existing store state:

1. Desktop validates the envelope schema.
2. Desktop reads candidate identity fields from `desktopResolution` and `source`.
3. Desktop resolves canonical `chatId` and `snapshotId` through Desktop
   `H2O.Studio.store` adapters.
4. If `desktopResolution.snapshotId` exists, Desktop checks the snapshot through
   the store before accepting it.
5. If only a chat identity or native conversation identity is available, Desktop
   may resolve the latest matching Desktop snapshot through the store.
6. If no Desktop snapshot exists, the request becomes `needs-desktop-snapshot`.
7. Desktop materializes a package only from Desktop store data.

Desktop must not package Chrome-provided content as the authoritative package
source in D.1. Chrome metadata can help Desktop find a chat or explain why a
request is pending, but it does not replace Desktop store state.

## Trust Boundary

Chrome request metadata is untrusted archive input.

The D.1 request envelope intentionally carries intent and lookup metadata, not
the package payload. In D.1:

- `payloadPolicy.containsSnapshotContent` must be `false`.
- `payloadPolicy.containsAssets` must be `false`.
- `source.captureDigest` is only evidence metadata, not `contentHash`.
- `source.title`, `source.href`, and target IDs are hints until Desktop resolves
  them through canonical store adapters.

If future phases allow Chrome to send full transcript text, HTML, images, files,
or other asset bytes, that must become a separate Desktop intake/import flow with:

- explicit size and type limits
- sanitizer and normalizer behavior
- store-adapter writes through Desktop only
- CAS materialization through Desktop only
- package re-projection from Desktop store state
- separate evidence proving Chrome content was never packaged directly as
  authoritative source

## Failure Modes

| Condition | Result |
|---|---|
| Malformed request | `rejected` |
| Unsupported `schema` | `rejected` |
| Desktop unavailable | Remains `queued` or Chrome-side pending. |
| Desktop chat missing | `needs-desktop-snapshot` unless a later intake flow exists. |
| Desktop snapshot missing | `needs-desktop-snapshot`. |
| Duplicate request | `duplicate`; must be idempotent. |
| Package already exists | Fail closed unless a future explicit overwrite policy exists. |
| Package writer failure | `failed`. |
| Stale Chrome capture vs Desktop snapshot | Warning or future `needs-newer-desktop-snapshot`. |
| Transport replay or out-of-order delivery | Idempotent dedupe by `dedupeKey`. |

Failure modes do not grant Chrome write authority. They produce request status
only.

## Explicit Non-Goals

D.1 does not implement or authorize:

- Chrome package writer
- direct Chrome archive write
- direct Chrome SQLite write
- Chrome writes to `archive/packages`
- Chrome construction of `manifest.json`, `snapshot.json`, `chat.md`,
  `chat.html`, package `assets/`, CAS, or package `contentHash`
- sync transport mutation
- import/recovery
- repair/delete/overwrite
- WebDAV/cloud
- user-folder export/save dialog
- CAS write-back
- CAS garbage collection
- CAS refcount repair
- C5.4B/C5.5 DB-centric inventory
- broad Chrome Studio redesign
- Desktop request queue runtime
- Desktop intake runtime
- package writer changes
- Archive Health UI changes

## Phase D Subphase Roadmap

| Subphase | Scope | Status |
|---|---|---|
| D.1 request contract | Define the Chrome-to-Desktop request envelope, ownership rules, lifecycle, trust boundary, and non-goals. | This document |
| D.2 Desktop intake/approval boundary | Add a Desktop-only validator/intake surface that resolves requests through store state and rejects unsafe payloads. | Future |
| D.3 request queue/status model | Add Desktop-owned durable request status and idempotent duplicate handling. | Future |
| D.4 minimal runtime proof | Prove a request referencing an existing Desktop snapshot can trigger Desktop package materialization, and a missing snapshot returns `needs-desktop-snapshot`. | Future |
| D.5 evidence/closure | Record runtime evidence and close the Phase D handoff milestone. | Future |

## Wrong Turns To Avoid

- Do not treat a Chrome request as a package.
- Do not make Chrome an archive package writer.
- Do not let Chrome write Desktop SQLite or CAS.
- Do not package Chrome transcript/HTML/assets directly as authoritative saved
  chat content.
- Do not redefine sync transport as archive ownership.
- Do not add import/recovery semantics under the request contract.
- Do not add user-folder export behavior to the handoff contract.
- Do not make request status a replacement for Archive Health package
  diagnostics.
