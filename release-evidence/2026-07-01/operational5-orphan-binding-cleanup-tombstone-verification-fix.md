# Operational.5 - Orphan-Binding Cleanup Tombstone-Verification Fix

Verdict: **ROOT CAUSE FOUND - THE CLEANUP COMMAND'S STRICT TOMBSTONE VERIFICATION IS CORRECT AND SOURCE-GROUNDED; THE
EARLIER ROW-LEVEL DIAGNOSTIC USED BROAD MATCHING THAT PRODUCED FALSE POSITIVES. CONTROLLED APPLY REMAINS BLOCKED; BOTH
DANGLING ROWS REQUIRE MANUAL REVIEW. NO LIVE CLEANUP APPLY WAS RUN.**

The live dry-run of the reviewed cleanup command (`9fdf2dab`) reported `verifiedCount:0`. This is the SAFE and CORRECT
result: neither dangling row is fully strict-tombstone-backed. The mismatch with the earlier row-level diagnostic
("tombstone/receipt explained") is a diagnostic-side false positive, not a cleanup-command bug. This slice fixes the
diagnostic to the strict bar and documents why the cleanup command needs no change.

## Live dry-run recap (operator-run, Desktop Studio DevTools)

- `status:"dry-run-orphan-binding-cleanup-ready"`, `dryRun:true`, no writes, `productSyncReady:false`.
- `rawCanonicalBindingCountBefore:14`, `rawCanonicalBindingCountAfter:14`, `exportableBindingCount:12`.
- `candidateCount:2`, `verifiedCount:0`, `removedCount:0`, `skippedCount:2` (both `skipped-not-fully-tombstone-verified`).
- Candidate 1: `folderAbsentFromCanonical:true`, `safeShape:true`, `folderTombstonePresent:false`,
  `folderBindingTombstonePresent:false`, `verified:false`.
- Candidate 2: `folderAbsentFromCanonical:true`, `safeShape:true`, `folderTombstonePresent:false`,
  `folderBindingTombstonePresent:true`, `verified:false`.

## Root cause of `verifiedCount:0`

The cleanup command requires, per dangling row, the strict conjunction: safe desktop-canonical shape AND folder absent
from the current canonical folders AND an **exact active folder tombstone** AND an **exact active folderBinding
tombstone**. It resolves both tombstones through `store.tombstones.getTombstone(recordKind, recordId)`, whose SQL is:

```
SELECT * FROM <tombstones> WHERE record_kind = ? AND record_id = ? AND restored_at IS NULL LIMIT 1
```

i.e. exact `record_kind` + exact `record_id` + active (not restored). For the two dangling rows:

- Candidate 1: no active folder tombstone AND no active exact folderBinding tombstone -> not verified.
- Candidate 2: an active exact folderBinding tombstone exists, but NO active folder tombstone -> not verified.

So `verifiedCount:0` is the strict verifier correctly refusing to remove under-evidenced rows.

The earlier row-level diagnostic classified both rows as "tombstone/receipt explained" because it matched BROADLY:
`folderBindingTombstoneMatches` accepted a meta-only match (including `meta.oldFolderId`, i.e. move edges);
`receiptMatches` accepted the folderId appearing in ANY receipt field (`beforeFolderId` / `expectedCurrentFolderId` /
`targetFolderId` / `afterFolderId`); and its `alreadyExplained` test required only a binding-tombstone-OR-receipt and
did NOT require a folder tombstone at all. Those are false positives that never met the strict cleanup bar.

## Investigation answers

1. **Why the diagnostic matched but the command did not.** The diagnostic used broad meta/receipt/substring matching
   and a weaker OR rule (binding-tombstone OR receipt, folder tombstone not required); the command uses strict exact +
   active `getTombstone` for BOTH the folder and the folderBinding tombstone. Broad matches are false positives.
2. **Is the command using the wrong lookup helper / record-ID format?** No. It uses `getTombstone('folder',
   folderTombstoneRecordId(folderId))` and `getTombstone('folderBinding', 'folderBinding:'+encodeURIComponent(chatId)+
   ':'+encodeURIComponent(folderId))`. `folderTombstoneRecordId(folderId)` = `'folder:'+encodeURIComponent(folderId)`.
   Both formats are identical to the writers (below). The lookup is correct.
3. **How folder tombstones are stored.** `record_kind:'folder'`, `record_id:'folder:'+encodeURIComponent(folderId)`,
   active = `restored_at IS NULL`. Written by `store/folders.tauri.js buildFolderTombstone`, by
   `sync/delete-reviewed-apply.tauri.js buildTombstoneRecord`, and by `store/folders.tauri.js:3530`
   (`folderTombstoneRecordId(id)`). NOT under a raw id, NOT under a recovery-snapshot id, NOT under a purge id. (The
   `folder-sync.tauri.js` / `tombstone-reviews.tauri.js` `folderDeleteRequestRecordId` / `folderRestoreRequestRecordId`
   entries are delete/restore REQUEST envelopes - `classification:'delete-request'`/`'restore-request'` - not applied
   folder-delete tombstones, and correctly do not count as proof-of-delete.)
4. **How folderBinding tombstones are stored.** `record_kind:'folderBinding'`,
   `record_id:'folderBinding:'+encodeURIComponent(chatId)+':'+encodeURIComponent(folderId)`, active =
   `restored_at IS NULL`, `meta.chatId`/`meta.folderId` retained. Written by `store/folders.tauri.js
   buildFolderBindingTombstone`. The reviewed path in `store/tombstone-reviews.tauri.js` uses `encodeRecordPart`, which
   is `encodeURIComponent` (identical), so there is no encoding divergence. The command's lookup matches exactly (it
   found candidate 2's binding tombstone).
5. **Did broad matching create a false positive?** Yes. The move-edge meta match (`meta.oldFolderId`), the any-field
   receipt match, and the folder-tombstone-not-required OR rule each can mark a row "explained" without a strict
   folder-delete + binding-delete pair.
6/7. **Safest, source-grounded verification.** Exact `getTombstone(recordKind, recordId)` (exact `record_kind` + exact
   `record_id` + active-only), which is what the command already does, for BOTH the folder and the folderBinding
   tombstone. Row-scanning for substrings, meta-only matches, and receipt-field matches must NOT be accepted as cleanup
   proof. (A meta `chatId`/`folderId` cross-check may be added as defense-in-depth, but is not required for safety and
   would not change the current outcome; it is intentionally NOT added here to avoid altering the correct command.)
8. **Should the diagnostic use the same strict verification?** Yes - done in this slice. The row-level diagnostic
   snippet now scores evidence ONLY on strict exact + active folder AND folderBinding tombstones; loose meta / receipt
   / substring matches are retained as clearly-labeled non-authoritative context and never drive "explained".
9. **Is cleanup still safe after correcting verification?** Yes - and it correctly finds NOTHING to remove. Both rows
   are NOT approvable and require manual review: candidate 1 has no strict tombstone evidence at all;
   candidate 2 has a strict binding tombstone but NO folder tombstone. Controlled apply remains BLOCKED.

## What changed in this slice

- **Row-level diagnostic snippet** (`operational5-dangling-binding-row-level-diagnostic.md`): added
  `folderTombstoneRecordId`, `tombstoneRestored`, `strictActiveFolderTombstoneMatch`,
  `strictActiveFolderBindingTombstoneMatch`, and a non-authoritative `looseFolderBindingMetaMatch`; the "explained"
  verdict is now gated on `strictTombstoneBacked` (strict folder AND strict binding tombstone); a new
  `binding-tombstone-present-folder-tombstone-missing-needs-manual-review` classification covers candidate 2; loose
  meta/receipt matches are emitted only as non-authoritative counts. Added a "Correction (2026-07-04)" section.
- **Row-level diagnostic validator** (`validate-operational5-dangling-binding-row-level-diagnostic.mjs`): asserts the
  strict predicates, that the old broad OR-match no longer drives the verdict, and the correction section.
- **No change to the cleanup command source.** `operational5OrphanBindingCleanup` in `store/folders.tauri.js` already
  verifies strictly via `getTombstone` and correctly produced `verifiedCount:0`. Changing it is unnecessary and would
  risk regressing a correct, strict verifier, so it is intentionally left as-is (`9fdf2dab`).

## Strict re-verification DevTools snippet (read-only, operator-controlled)

Confirms per-row, using the SAME exact + active `getTombstone` bar as the command, why each candidate fails strict
verification. Read-only: no apply, no gate, no write, no mutation.

```js
(async function operational5StrictTombstoneReverify() {
  const SCHEMA = 'h2o.studio.operational5.orphan-binding-strict-tombstone-reverify.v1';
  const safety = { readOnly: true, mutationAttempted: false, calledApply: false, calledGate: false, wroteSqlite: false,
    wroteTombstone: false, productSyncReady: false, webdavCloudRelay: 'blocked', fullBundleV3: 'not-started',
    chatSavingWebdavCloudArchiveCas: 'blocked' };
  const clean = (v) => String(v == null ? '' : v).trim();
  const enc = (v) => encodeURIComponent(clean(v));
  const folders = globalThis.H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.folders;
  const tombstones = globalThis.H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.tombstones;
  const arr = (v) => Array.isArray(v) ? v : [];
  const canonicalFolders = folders && folders.getAll ? arr(await folders.getAll()) : [];
  const rawBindings = folders && folders.listCanonicalChatFolderBindings ? arr(await folders.listCanonicalChatFolderBindings()) : [];
  const folderIdOf = (r) => clean(r && (r.folderId || r.folder_id || r.id));
  const chatIdOf = (r) => clean(r && (r.chatId || r.chat_id || r.conversationId));
  const canonicalFolderIds = new Set(canonicalFolders.map(folderIdOf).filter(Boolean));
  async function token(kind, raw) {
    if (globalThis.crypto && crypto.subtle && typeof TextEncoder !== 'undefined') {
      const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(kind + ' ' + clean(raw)));
      return 'sha256:' + Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    }
    return 'sha256:unavailable';
  }
  const rows = [];
  for (const row of rawBindings) {
    const chatId = chatIdOf(row); const folderId = folderIdOf(row);
    if (!chatId || !folderId) continue;
    if (canonicalFolderIds.has(folderId)) continue; // exportable - never a candidate
    const folderTomb = tombstones && tombstones.getTombstone ? await tombstones.getTombstone('folder', 'folder:' + enc(folderId)) : null;
    const bindingTomb = tombstones && tombstones.getTombstone ? await tombstones.getTombstone('folderBinding', 'folderBinding:' + enc(chatId) + ':' + enc(folderId)) : null;
    const strictFolderTombstonePresent = !!folderTomb;
    const strictFolderBindingTombstonePresent = !!bindingTomb;
    const strictTombstoneBacked = strictFolderTombstonePresent && strictFolderBindingTombstonePresent;
    rows.push({
      chatToken: await token('chat', chatId), folderToken: await token('folder', folderId),
      folderAbsentFromCanonical: true, strictFolderTombstonePresent, strictFolderBindingTombstonePresent,
      strictTombstoneBacked, cleanupEligible: strictTombstoneBacked,
      classification: strictTombstoneBacked ? 'strict-tombstone-backed'
        : (strictFolderBindingTombstonePresent ? 'binding-tombstone-present-folder-tombstone-missing-needs-manual-review'
        : 'no-strict-tombstone-evidence-needs-manual-review')
    });
  }
  const result = { schema: SCHEMA, readOnly: true, safety, rawCanonicalBindingCount: rawBindings.length,
    exportableFolderPresentCount: rawBindings.filter((r) => canonicalFolderIds.has(folderIdOf(r))).length,
    danglingCandidateCount: rows.length, strictTombstoneBackedCount: rows.filter((r) => r.strictTombstoneBacked).length,
    cleanupEligibleCount: rows.filter((r) => r.cleanupEligible).length, rows, cleanupApproved: false,
    productSyncReady: false, webdavCloudRelay: 'blocked', fullBundleV3: 'not-started',
    chatSavingWebdavCloudArchiveCas: 'blocked' };
  console.log(JSON.stringify(result, null, 2));
  return result;
})().catch((e) => console.error('operational5-orphan-binding-strict-tombstone-reverify-failed', String((e && e.message) || e)));
```

Expected for the current DB: `danglingCandidateCount:2`, `strictTombstoneBackedCount:0`, `cleanupEligibleCount:0`;
candidate 1 `no-strict-tombstone-evidence-needs-manual-review`; candidate 2
`binding-tombstone-present-folder-tombstone-missing-needs-manual-review`.

## Decisions

- **Live dry-run rerun:** not required to re-confirm the mismatch (the recorded run is already conclusive). The
  operator MAY run the strict re-verify snippet above (read-only) to see the per-row strict classification.
- **Controlled apply:** remains BLOCKED. `verifiedCount` is 0 under strict verification; the gate must not be used.
- **Both rows:** require MANUAL REVIEW (candidate 1: no strict evidence; candidate 2: binding tombstone but no folder
  tombstone). No auto-cleanup.

## Boundaries Held

- No controlled cleanup apply run; no folder/chat/binding/tombstone/ledger/receipt/render-mirror/import-export mutation.
- `productSyncReady` remains `false`; no WebDAV/cloud/relay/`fullBundle.v3`; no Chat Saving CAS; no fallback.
- Verification was STRENGTHENED (diagnostic tightened to the strict bar), never weakened. Broad text matching is not
  accepted as cleanup proof. Exact-row verification, tombstone-backed verification, and dry-run-first behavior kept.
- Durable/hash gates, conflict runtime, `requireContext`, restart convergence, the reviewed request path, and the F11
  render-mirror no-write boundary are unchanged.
