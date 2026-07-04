# Operational.5 - Orphan-Binding Strict Evidence Receipt Implementation

Verdict: **OPERATIONAL.5 ORPHAN-BINDING STRICT EVIDENCE RECEIPT PATH IMPLEMENTED - CLEANUP STILL BLOCKED**.

This implementation adds a scoped strict-evidence receipt path for `row:fdd2456fc8a2` only. It does not
run cleanup apply, does not remove any binding row, does not mutate folders/chats/bindings/tombstones,
does not flip `productSyncReady`, does not start WebDAV/cloud/relay/`fullBundle.v3`, does not touch
Chat Saving WebDAV/cloud/archive CAS, does not add fallback, and does not weaken strict tombstone
verification.

## Context

- Strict evidence receipt design: `e2b804c487973f4cf8efb5058a8df91378cb13c4`.
- Live provenance diagnostic prep: `da77730465dd2db272a6e392640c55c682655a9d`.
- Read-only provenance search: `2ecfbd81eddbef72b6f3c626ce503b33939291c4`.
- Manual-review packet: `b344120ac4462b6e91f7ac6bfb4cff507cab0a68`.
- Cleanup command implementation: `9fdf2dab`.
- Tombstone verification fix: `221d91b6`.
- Manual-review blocker decision: `9dd82fdf`.

## Source Change

Product source changed:

- `src-surfaces-base/studio/store/folders.tauri.js`

New API:

- `H2O.Studio.store.folders.operational5OrphanBindingStrictEvidenceReceipt(opts)`

Storage location:

- `chrome.storage.local` / Desktop SQLite-backed KV key:
  `h2o:studio:operational5:orphan-binding-strict-evidence-receipts:v1`

Schemas and gate:

- receipt schema: `h2o.studio.operational5.orphan-binding-strict-evidence-receipt.v1`
- result schema: `h2o.studio.operational5.orphan-binding-strict-evidence-receipt-result.v1`
- ledger schema: `h2o.studio.operational5.orphan-binding-strict-evidence-receipt-ledger.v1`
- write gate: `operational5-orphan-binding-strict-evidence-receipt-record`

## Behavior

Default behavior is dry-run/read-only. Persistent receipt write requires:

- `write:true` or `record:true`;
- `gate:"operational5-orphan-binding-strict-evidence-receipt-record"`;
- target token contract:
  - `rowToken:"row:fdd2456fc8a2"`;
  - `chatToken:"r:2f29d39a6c4f"`;
  - `folderToken:"r:2d5469848470"`;
- exactly one live dangling canonical binding row matching those redacted tokens;
- live chat present;
- folder absent from canonical folders;
- exact active folderBinding tombstone present;
- exact active folder tombstone absent;
- approved desktop-canonical active row safe shape.

The persisted receipt records only redacted/hash-only fields:

- row token;
- chat token;
- folder token;
- exact folder record token checked;
- exact folderBinding record token checked;
- exact folder tombstone absent;
- exact folderBinding tombstone present;
- chat live;
- folder absent from canonical folders;
- row safe shape;
- raw/exportable count summary;
- no cleanup authorization;
- no tombstone substitute;
- manual approval prerequisite only;
- product/readiness and transport/CAS boundary flags.

## Rejections / Idempotency

- `row:a950a44b859f` is explicitly rejected as documented debt and remains outside the receipt path.
- target token mismatch is rejected.
- non-unique target-row resolution is rejected.
- missing live chat, folder present, unsafe row shape, folder tombstone already present, or missing
  folderBinding tombstone is rejected.
- write without the receipt gate is rejected with no persistent receipt.
- duplicate write with the same receipt hash is zero-write/idempotent.
- duplicate write with a conflicting receipt hash is blocked.

## Boundaries

- The receipt is **not** cleanup authorization.
- The receipt is **not** a tombstone substitute.
- Cleanup apply remains blocked.
- `operational5OrphanBindingCleanup` still requires both exact active folder and folderBinding tombstones.
- No folder/chat/binding/tombstone deletion.
- No tombstone create/update/delete.
- No sync consumed-ledger mutation.
- No import/export state mutation.
- No render-mirror write.
- No `productSyncReady` flip.
- No WebDAV/cloud/relay/`fullBundle.v3`.
- No Chat Saving WebDAV/cloud/archive CAS.
- No fallback.

## Next Step

If approved by an operator, run the receipt API in Desktop Studio first as dry-run, then under the
receipt gate only to persist the strict evidence receipt for `row:fdd2456fc8a2`. Cleanup apply must
remain blocked until a separate reviewed manual-approval override or cleanup slice is explicitly
authorized.
