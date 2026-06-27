# Saved Chat Archive Request Package Proof — D.4 Runtime Smoke

Date: 2026-06-24

Status: EXECUTED - PASSED

Lane: Chat Saving Architecture (Phase D.4 — full package proof). This is a
docs/evidence-only note recording a real Desktop + Chrome runtime pass using
existing shipped APIs. It adds no runtime code, no validators, and no
Chrome/Desktop/capability changes.

## Proof Target

D.4 proves the full package path left open by D.3C:

```text
Chrome-delivered metadata-only request -> Desktop inbox -> D.2B queue validated ->
D.2C materializer -> package written -> package validation OK ->
archive diagnostics OK -> idempotency already-written
```

Proof script:

```text
f69d049 docs(studio): script saved chat archive package proof
```

## Runtime Values

- requestId: `a068fbe7-aee5-4edc-a761-4ccc82d4d05b`
- chatId: `d3b2_inbox_chat_1782391840992`
- snapshotId: `snap_d3b2_inbox_chat_1782391840992`
- title: `D.3B.2 archive request inbox smoke`
- dedupeKey: `sha256-50930abce086d47ef02f37c3d2f75405a9cb05abc4b826d53deff187f821a8d2`
- packagePath: `archive/packages/d3b2_inbox_chat_1782391840992.h2ochat`
- contentHash: `sha256-0fa2798b5b9adcf4ac1f589c72a2cdd5d7f8f9e6400d8fe17c83815a13808519`

## Fixture Selection

- Desktop fixture selected via `H2O.Studio.store.chats.getAll()` and
  `H2O.Studio.store.snapshots.listByChat(chatId)` (read-only selection; no store
  writes, no fixture creation).
- Selected fixture:
  - chatId: `d3b2_inbox_chat_1782391840992`
  - snapshotId: `snap_d3b2_inbox_chat_1782391840992`
  - snapshotCount: `1`

## Chrome Delivery

- Chrome delivered a metadata-only request using the D.3C delivery path.
- The request pointed to the real Desktop `studioChatId` and `snapshotId`.
- The request file was written to the Desktop-owned inbox.
- Chrome remained intent-only.
- No Chrome package / CAS / SQLite write happened.
- No Chrome `contentHash` computation happened.

## Desktop Intake

- `processSavedChatArchiveRequestInboxFileV1({ requestId, writeReceipt: true })`
  was used for single-file intake (the negative D.3B.2 fixtures were not
  processed).
- The intake re-run reported `duplicate` because the request was already queued.
  This is acceptable (idempotent dedupe by `dedupeKey`).
- The authoritative queue row showed `status: validated` before materialization.
- `desktopResolution.canMaterializeFromDesktopStore: true`
- `desktopResolution.studioChatId: d3b2_inbox_chat_1782391840992`
- `desktopResolution.snapshotId: snap_d3b2_inbox_chat_1782391840992`

## Materialization

`materializeSavedChatArchiveRequestV1({ requestId })` returned:

- status: `written`
- ok: `true`
- previousStatus: `validated`
- chromeRuntime: `false`
- syncTransport: `false`
- packageWriteDeferred: `false`

Package metadata:

- packagePath: `archive/packages/d3b2_inbox_chat_1782391840992.h2ochat`
- schemaVersion: `1`
- payloadVersion: `1`
- contentHash: `sha256-0fa2798b5b9adcf4ac1f589c72a2cdd5d7f8f9e6400d8fe17c83815a13808519`
- snapshotId: `snap_d3b2_inbox_chat_1782391840992`

## Queue After Materialization

- queue status became `written`.
- queue still references the Chrome source and Desktop resolution.
- queue resolution remained `validated`.

## Package Validation

`validateSavedChatPackageV1({ packagePath, includeCasChecks: true, includeRendererChecks: true, includeDbChecks: true })`
returned:

- ok: `true`
- status: `ok`
- blockers: `[]`
- warnings: `[]`
- manifestPresent: `true`
- snapshotPresent: `true`
- markdownPresent: `true`
- htmlPresent: `true`
- chatId: `d3b2_inbox_chat_1782391840992`
- snapshotId: `snap_d3b2_inbox_chat_1782391840992`
- schemaVersion: `1`
- hashChecks.snapshotShaOk: `true`
- hashChecks.contentHashOk: `true`
- hashChecks.expectedContentHash equals actualContentHash
- dbChecks.checked: `true`
- dbChecks.available: `true`
- dbChecks.chatExists: `true`
- dbChecks.snapshotExists: `true`

## Archive Diagnostics

`diagnoseSavedChatArchiveV1({ includeCasChecks: true, includeRendererChecks: true, includeDbChecks: true, limit: 500 })`
returned:

- ok: `true`
- status: `ok`
- blockers: `[]`
- warnings: `[]`
- packagesTotal: `16`
- packagesOk: `16`
- packagesWarning: `0`
- packagesBlocked: `0`
- assetChecks.passed: `16`
- assetChecks.warnings: `0`
- assetChecks.failed: `0`
- dbChecks.passed: `16`
- dbChecks.warnings: `0`
- dbChecks.failed: `0`

## Idempotency

Second call to `materializeSavedChatArchiveRequestV1({ requestId })` returned:

- status: `already-written`
- ok: `true`
- previousStatus: `written`
- same packagePath
- same contentHash
- chromeRuntime: `false`
- syncTransport: `false`
- packageWriteDeferred: `false`

## Pass Interpretation

D.4 closes the remaining proof gap left by D.3C:

- D.3C proved transport / receipt read-back ending at `needs-desktop-snapshot`.
- D.4 now proves a Chrome-delivered request can resolve to an existing Desktop
  snapshot, materialize into a deterministic saved-chat package, validate
  cleanly, and re-materialize idempotently as `already-written`.

## Preserved Boundaries

- Chrome remained intent-only.
- Desktop remained authoritative.
- No Chrome package writer.
- No Chrome CAS writer.
- No Chrome SQLite write.
- No Chrome `contentHash` computation.
- No package was built from Chrome transcript/content.
- No auto-materialization.
- No sync/WebDAV/cloud.
- No native messaging.
- No localhost relay.
- No Archive Health UI mutation.
- No import/recovery.
- No user-folder export/save-dialog.
- No main save-to-folder integration.

## Validation

```text
git diff --check
git diff --cached --check
```

Results:

- `git diff --check`: clean.
- `git diff --cached --check`: clean.

No docs/markdown lint/check script exists in `package.json` (confirmed); none was
run.

## Outcome

D.4 runtime smoke: EXECUTED - PASSED. The full Chrome-intent-to-Desktop-package
path is proven end-to-end on a real Chrome + Desktop setup — request delivered,
resolved `validated`, materialized `written`, validated with zero blockers,
diagnostics clean, and idempotent on re-materialization — with all
metadata-only / intent-only / Desktop-authoritative boundaries intact.
