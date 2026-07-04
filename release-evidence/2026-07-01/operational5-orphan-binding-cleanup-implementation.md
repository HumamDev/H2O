# Operational.5 - Reviewed Orphan-Binding Cleanup Command (Implementation)

Verdict: **OPERATIONAL.5 REVIEWED ORPHAN-BINDING CLEANUP COMMAND IMPLEMENTED (SOURCE + VALIDATOR + EVIDENCE ONLY; NO
LIVE APPLY RUN)**.

This slice implements the dedicated reviewed Operational.5 orphan-binding cleanup command designed in the cleanup
design preflight (`14293ea7`). It removes ONLY the dangling raw canonical `folder_bindings` rows that are tombstone-
explained, under an explicit reviewed apply gate, dry-run first, exact-row and tombstone verified, receipt-backed, and
idempotent. No live cleanup apply was run; the live proof must start with dry-run in a separate operator-controlled
step. No `productSyncReady` flip, no WebDAV/cloud/relay, no Chat Saving CAS, no fallback, no F11 render-mirror writer.

## Commit Chain

- Operational.5 dangling-binding cleanup design preflight: `14293ea7`.
- Row-level diagnostic: 2 dangling rows (`row:a950a44b859f`, `row:fdd2456fc8a2`), both tombstone/receipt explained.
- Aggregate: raw canonical `folder_bindings` = 14; exportable canonical bindings = 12; fullBundle.v2 projection = 12.

## Source Change (`src-surfaces-base/studio/store/folders.tauri.js` only)

New reviewed command `operational5OrphanBindingCleanup(opts)` (exposed on `store.folders`), plus constants:

- Gate: `OPERATIONAL5_ORPHAN_BINDING_CLEANUP_APPLY_GATE = 'operational5-orphan-binding-cleanup-apply'`.
- Result schema: `h2o.studio.folder-sync.operational5-orphan-binding-cleanup.v1`.
- Receipt schema: `h2o.studio.folder-sync.operational5-orphan-binding-cleanup-receipt.v1`.

### Dry-run / apply / gate

- `dryRun = !(opts.apply === true && opts.gate === 'operational5-orphan-binding-cleanup-apply')`.
- Default (no `apply`) -> dry-run (`dry-run-orphan-binding-cleanup-ready`), zero writes.
- `apply:true` without the gate -> `blocked-apply-gate-required` (`ok:false`), zero writes.
- `apply:true` + gate -> controlled apply (scoped exact-row DELETE only).

### Exact-row verification (per dangling row)

The command re-reads current canonical folders (`listFolders`) and raw bindings (`listCanonicalChatFolderBindings`),
then for each raw row whose `folderId` is ABSENT from the current canonical folder list it verifies:

- exact `chatId` + `folderId` re-read from canonical (not caller-supplied ids);
- safe desktop-canonical shape: `source === 'desktop-canonical-folder-bindings-sqlite'`,
  `sourceSurface === 'desktop-studio'`, `authority === 'desktop'`, `status === 'active'`, `state === 'active'`,
  `noHardDelete`/`noPurge`/`noChatDelete === true`;
- folder is missing from current canonical folders;
- folder tombstone present: `getTombstone('folder', folderTombstoneRecordId(folderId))`;
- folderBinding tombstone present:
  `getTombstone('folderBinding', 'folderBinding:' + encodeURIComponent(chatId) + ':' + encodeURIComponent(folderId))`.

Only rows passing ALL checks are `verified`; anything else is `skipped-not-fully-tombstone-verified` (never removed).
Exportable rows (folder present in canonical) are counted and NEVER considered for removal.

### Tombstone-backed, receipt-backed, non-destructive

- Tombstone-backed: both the folder tombstone and the folderBinding tombstone must already exist. The command only
  READS tombstones - it never creates or mutates a tombstone (`noTombstoneMutation:true`, `noTombstoneCreate:true`).
- Receipt-backed: a cleanup receipt (`...operational5-orphan-binding-cleanup-receipt.v1`) is emitted with `verifiedCount`,
  `removedCount`, `exportableBindingCount`, and `noFolderDelete`/`noChatDelete`/`noTombstoneMutation`/`noHardDelete`/
  `noPurge`/`productSyncReady:false`, before/with any controlled apply.
- Non-destructive: it never deletes folders, chats, tombstones, ledgers, receipts, import/export state, or the render
  mirror. The only mutation is a scoped exact-row `DELETE FROM folder_bindings WHERE chat_id = ? AND folder_id = ?` for
  verified rows under the gate - there is no bare/delete-all `folder_bindings` SQL.

### Idempotency and counts

- Dry-run: zero writes; `rawCanonicalBindingCountAfter === rawCanonicalBindingCountBefore` (14).
- Controlled apply: removes exactly the verified dangling rows; raw canonical count drops 14 -> 12.
- Duplicate apply: each verified row is re-checked via `listCanonicalChatFolderBindingsForChat`; if the row is gone it
  is `already-removed-idempotent` (zero write). Once the 2 dangling rows are gone, no dangling candidates remain, so a
  duplicate apply is zero-write.
- Exportable canonical count stays 12 (only folder-absent dangling rows are candidates; exportable rows are never
  removed), and the fullBundle.v2 read-only projection (built from exportable bindings) stays 12.

## Redaction / privacy

The result is redacted/hash-only: candidates expose `chatToken`/`folderToken` (sha256-derived) plus booleans/status;
exact raw ids are held internally only for the scoped delete and are never surfaced in the result or receipt.

## Boundaries Held

- No live cleanup apply was run in this slice; the live proof starts with dry-run in a separate operator step.
- `productSyncReady` remains `false` (not flipped).
- No WebDAV/cloud/relay/`fullBundle.v3`; no Chat Saving WebDAV/cloud/archive CAS.
- No fallback (`allowF7Fallback`/`f15AllowF7Fallback`/`explicitF7Fallback`); no bare `moveCanonicalChatFolderBinding`.
- Durable/hash gates, conflict runtime, `requireContext`, restart convergence, the reviewed request path, and the F11
  render-mirror no-write boundary are unchanged.

## Verdict

The reviewed Operational.5 orphan-binding cleanup command is implemented: gated dry-run/apply, exact-row + tombstone-
backed verification, receipt-backed, scoped exact-row delete only, idempotent, exportable/fullBundle parity preserved
at 12, raw count dropping 14 -> 12 only after a gated apply. Recommended next: a separate operator-controlled live
dry-run (zero write) proof, then the reviewed controlled apply - not started here.
