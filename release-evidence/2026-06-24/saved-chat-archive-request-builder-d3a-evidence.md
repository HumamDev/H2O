# Saved Chat Archive Request Builder D.3A Evidence

Date: 2026-06-24

Status: EXECUTED - PASSED

Lane: Chat Saving Architecture (Phase D.3A). This is a docs/evidence-only
note. It adds no runtime code, no validators, no Chrome transport, no Desktop
request queue/materializer/package writer/CAS/store/sync/import/recovery/UI
changes, and no user-facing behavior.

## Scope

D.3A added a Chrome/MV3-safe metadata-only request-envelope builder:

```text
H2O.Studio.ingestion.buildSavedChatArchiveRequestV1(options)
```

The builder expresses Chrome-side save/archive intent only. It does not
transport the request, call Desktop intake/queue APIs, or materialize packages.

Implementation commit:

```text
2872f3b feat(studio): add chrome saved chat archive request builder
```

## Files Changed

- `src-surfaces-base/studio/ingestion/saved-chat-archive-request-builder.mv3.js`
- `tools/validation/studio/validate-saved-chat-archive-request-builder-v1.mjs`
- `tools/product/studio/pack-studio.mjs`
- `src-surfaces-base/studio/studio.html`

## Proven Behavior

D.3A proves the builder:

- builds `h2o.savedChatArchiveRequest.v1`.
- generates `requestId` when absent.
- preserves caller-provided `requestId`.
- generates `dedupeKey` when absent.
- preserves caller-provided `dedupeKey`.
- defaults `source.surface` to `chrome-studio`.
- defaults `desktopResolution.requireExistingDesktopSnapshot` to `true`.
- includes target hints:
  - `folderIdAtRequest`
  - `categoryIdAtRequest`
  - `projectIdAtRequest`
  - `labelIdsAtRequest`
  - `tagIdsAtRequest`
- forces `payloadPolicy.containsSnapshotContent=false`.
- forces `payloadPolicy.containsAssets=false`.
- drops and warns on authoritative payload-like inputs.
- emits no transcript, messages, HTML, assets, package fields, or `contentHash`.
- produces an envelope accepted by the existing D.2A request validator in a
  mock/VM environment.

## Explicit Non-Goals

D.3A intentionally adds none of the following:

- no transport.
- no Desktop queue call.
- no materializer call.
- no package writer call.
- no CAS call.
- no native messaging.
- no localhost/network relay.
- no File System Access API.
- no sync/WebDAV/cloud.
- no Desktop runtime changes.

The following remain deferred:

- D.3B Desktop inbox / transport intake.
- D.3C Chrome FSA delivery + receipt read-back.
- native messaging.
- localhost relay.
- sync adapter.
- deep link / URL scheme.

## Validation

Validation passed for:

```text
node --check src-surfaces-base/studio/ingestion/saved-chat-archive-request-builder.mv3.js
node --check tools/validation/studio/validate-saved-chat-archive-request-builder-v1.mjs
node tools/validation/studio/validate-saved-chat-archive-request-builder-v1.mjs
node tools/validation/studio/validate-saved-chat-archive-request-contract.mjs
node tools/validation/studio/validate-saved-chat-archive-request-intake.mjs
node tools/validation/studio/validate-saved-chat-archive-materializer-v1.mjs
node --check tools/product/studio/pack-studio.mjs
git diff --check
git diff --cached --check
```

## Boundary Confirmation

D.3A keeps Chrome intent separate from Desktop archive authority:

- Chrome builds only a metadata request envelope.
- Desktop remains the owner of validation, queue/status persistence,
  package materialization, CAS, archive diagnostics, and durable archive state.
- Chrome does not write `archive/packages`.
- Chrome does not write Desktop SQLite.
- Chrome does not build `manifest.json`, `snapshot.json`, `chat.md`,
  `chat.html`, `assets/`, or package `contentHash`.
