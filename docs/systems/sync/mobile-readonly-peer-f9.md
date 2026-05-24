# F9 Mobile Read-Only Peer Model

## Executive Summary

F9 starts as a mobile read-only peer. Mobile consumes existing sync bundle
evidence, renders library state safely, and must not write back or mutate
Desktop, Chrome, mobile source data, or any sync lifecycle state.

The F9 model is:

```txt
read bundle -> validate -> cache/display -> no mutation
```

## Recommended Data Source

The first mobile input source should be a copied or exported `latest.json`
bundle from the existing sync folder.

Later phases may inspect the per-peer mirror under
`devices/<peer>/latest.json`, but F9.0-F9.2 do not require a cloud relay,
WebDAV, or any other transport. Cloud/WebDAV is future transport, not part of
the initial mobile peer model.

Mobile is not authoritative over Desktop or Chrome state.

## Mobile Peer Identity And Capabilities

A read-only mobile peer may still have identity for diagnostics, display, and
future compatibility:

```js
{
  surfaceKind: "mobile",
  appKind: "h2o-mobile",
  storeKind: "bundle-cache",
  capabilities: ["read-only"]
}
```

This identity does not imply write authority. It must not authorize tombstones,
conflict ingestion, apply, export authority, or remote mutation.

## Read-Only Data Scope

Initial mobile read scope:

- Indexed chats.
- Saved snapshots.
- Folder metadata.
- Folder memberships as exported evidence.
- Labels and categories if already present in the bundle.
- Export envelope and sync diagnostics.
- F5 tombstone/review counts read-only.
- F6 conflict counts and read-only status.
- F7 apply audit evidence read-only.
- F8 `syncApplyEvents` read-only.

Avoid in F9:

- Folder metadata editing.
- FolderBinding or membership updates.
- Folder creation or deletion.
- Chat or snapshot deletion/restoration.
- Conflict decisions.
- Candidate ingestion.
- Mobile annotations or write-back.
- Remote apply propagation.

## Safety Rules

Mobile must never:

- Create tombstones.
- Ingest conflict candidates.
- Mark F6 decisions.
- Run F7 folder color apply.
- Produce authoritative exports.
- Write Chrome or Desktop state.
- Mutate folders, folderBindings, chats, snapshots, labels, categories,
  tombstones, conflicts, audits, or apply events.

Any mobile cache is local and non-authoritative. It may exist to support
offline reading, but it is not sync source data.

## UI And Read Model

Mobile may show:

- Library and chat list.
- Saved snapshot reader.
- Folder browser.
- Label/category filters if present.
- Sync status and export freshness.
- Read-only tombstone/conflict indicators.
- Persistent read-only badge.
- Clear copy near risky surfaces, such as: "This device cannot edit or sync
  changes."

F9 must not expose edit controls.

## F5/F6/F7/F8 Integration

- F5 evidence is visible read-only only.
- F6 queue state is visible read-only only.
- F7 apply audit evidence is visible read-only only.
- F8 apply-event evidence is visible read-only only.
- F9 must not call mutation APIs from F5, F6, F7, or F8.

## Validation Model

Future implementation must prove:

- Loading a bundle does not mutate the source bundle.
- Any mobile cache is local and non-authoritative only.
- No write APIs are exposed.
- Malformed bundles fail safely.
- Missing bundle sections degrade gracefully.
- Redaction is preserved.
- Offline use from cached/imported bundle works.
- Conflict, tombstone, and apply evidence remain display-only.
- No Chrome/Desktop/F5/F6/F7/F8 mutation calls exist.

## Roadmap

- F9.0: Docs-only mobile read-only peer model.
- F9.1: Mobile bundle reader scaffold, validate `latest.json`, no writes
  except optional local cache.
- F9.2: Library/folder/snapshot read-only display.
- F9.3: Conflict/tombstone/apply-event read-only status.
- F9.4: Offline cache validation and redaction checks.
- F10: Mobile write-back much later, only after full safety model.

## Recommendation

The next phase after F9.0 should be F9.1 bundle reader scaffold. Do not
introduce write-back, cloud relay, conflict resolution, or mutation APIs in F9.
