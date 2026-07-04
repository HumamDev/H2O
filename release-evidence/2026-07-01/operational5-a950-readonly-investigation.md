# Operational.5 - a950 Read-Only Investigation

Verdict: **`row:a950a44b859f` REMAINS DOCUMENTED, QUARANTINED DEBT - NO NEW STRICT EVIDENCE EXISTS (NEITHER AN EXACT
ACTIVE FOLDER TOMBSTONE NOR AN EXACT ACTIVE FOLDERBINDING TOMBSTONE), FUTURE CLEANUP REMAINS BLOCKED AND SOURCE-
ENFORCED, AND THIS INVESTIGATION IS READ-ONLY AND AUTHORIZES NO CLEANUP OR MUTATION.**

This is a read-only investigation evidence/validator slice. It does not clean or mutate `row:a950a44b859f`, does not
delete or mutate folders/chats/bindings/tombstones/ledgers/receipts/approvals/import-export/render-mirror, does not
introduce cleanup authority, does not flip `productSyncReady`, does not start WebDAV/cloud/relay/`fullBundle.v3`, does
not touch Chat Saving CAS, and does not weaken strict tombstone verification. It respects the final Operational.5 rollup
`16853425`.

## Reference State (unchanged)

- Final Operational.5 rollup: `16853425`.
- localExportableSyncReady live closeout: `82cf4aba`.
- localExportableSyncReady implementation: `9d317664111a8c18e61d237f7aba8a96b86cb723`.
- a950 documented-debt readiness policy: `684ea497522b1804beb04fc3de0f5672b6901356`.
- fdd cleanup closeout: `bfbbd04302f9330d3e0e140d33e17ed5a2ed471f`.
- raw canonical `13`, exportable `12`, `fullBundle.v2` `12`, undocumented dangling `0`, exportable dangling `0`.
- `localExportableSyncReady:true`, global `productSyncReady:false`, WebDAV/cloud/relay/`fullBundle.v3` blocked,
  Chat Saving CAS blocked/deferred.

## Investigation

### 1. Current live/source status of `row:a950a44b859f`

It is the single remaining raw canonical dangling `folder_bindings` row (raw `13` vs exportable `12`), kept as
documented, quarantined debt. In source it is the `OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN =
'row:a950a44b859f'` constant. The latest live read-only proof (`82cf4aba`) reported
`documentedDebtRowTokens:["row:a950a44b859f"]`, `remainingRawCanonicalDebtCount:1`, `documentedDebtQuarantined:true`,
`rawCanonicalDebtVisible:true`, `exportableParityClean:true`.

### 2. Exact chat token, folder token, and row-token derivation

- chat token: `r:650c3cb39924` = `operational5RedactToken(chatId)` = `'r:' + sha256Hex(String(chatId)).slice(0, 12)`.
- folder token: `r:0226fecaed5b` = `operational5RedactToken(folderId)` = `'r:' + sha256Hex(String(folderId)).slice(0, 12)`.
- row token: `row:a950a44b859f` = `OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN` (redacted/hash-only debt row
  identity). Raw chat/folder ids are never exposed; all identifiers are hash-only.

These are distinct from the strict-evidence cleanup TARGET tokens (which were fdd, not a950):
`OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_TARGET_ROW_TOKEN = 'row:fdd2456fc8a2'` /
`...CHAT_TOKEN = 'r:2f29d39a6c4f'` / `...FOLDER_TOKEN = 'r:2d5469848470'`.

### 3. Is the chat live or absent?

Chat liveness is a live-only read (`H2O.Studio.store.chats.get(chatId)`), reported as a boolean by the read-only
snippet below. It is NOT authoritative for the debt decision: a950's debt status is driven by the absence of the two
strict active tombstones (below), not by chat liveness. No prior slice recorded an authoritative live-chat verdict for
a950, and this investigation does not resolve it destructively - it only surfaces it read-only.

### 4. Is the folder absent from canonical folders?

Yes. The row is dangling precisely because its `folderId` is absent from the current canonical folder list (that is the
definition of the remaining raw canonical debt: `remainingRawCanonicalDebtCount` counts rows whose `folderId` is not in
`canonicalFolderIds`). Folder-absent alone is not cleanup proof - a strict active folder tombstone is still required.

### 5. Exact strict folder tombstone evidence

**Not found.** The strict authority is `store.tombstones.getTombstone('folder', 'folder:<encodeURIComponent(folderId)>')`
matching `record_kind = 'folder' AND record_id = ? AND restored_at IS NULL`. The provenance search
(`operational5-orphan-binding-provenance-search.md`) and the last live strict dry-run both report the a950 exact active
folder tombstone as **not found** (`folderTombstonePresent:false`).

### 6. Exact strict folder-binding tombstone evidence

**Not found.** The strict authority is `store.tombstones.getTombstone('folderBinding',
'folderBinding:<encodeURIComponent(chatId)>:<encodeURIComponent(folderId)>')` with `restored_at IS NULL`. For a950 this
is **not found** (`folderBindingTombstonePresent:false`) - which is exactly why a950 differs from fdd: fdd had the strict
folderBinding tombstone (and was later cleaned via the reviewed strict-evidence + manual-approval path), while a950 has
neither tombstone.

### 7. Broad text matching is rejected as proof

Broad text matching, loose metadata matching (including `meta.oldFolderId`), receipt-field/substring matching, row-token
correlation, historical narrative, export filtering, and F15/ledger provenance are NOT accepted as cleanup proof. Only
the exact active `getTombstone(recordKind, recordId)` authority counts. This investigation does not relax that bar.

### 8. Any receipt, approval, or cleanup record for a950?

**None that grants cleanup.** The source itself enforces a950 as documented debt:

- the strict-evidence-receipt path rejects a950:
  `rowToken === OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN` ->
  `status:'rejected-documented-debt-row-not-eligible-for-strict-evidence-receipt'` with blocker
  `operational5-orphan-binding-strict-evidence-receipt-row-a950-documented-debt`;
- the manual-approval cleanup override records a950 as `excludedRowToken` / `rejectedRowTokenShouldRemainDebt`.

The one strict-evidence receipt + manual-approval cleanup that was honored applied to the TARGET row `row:fdd2456fc8a2`,
not a950. a950 has no approval, no receipt, and no cleanup record.

### 9. Decision: permanent documented debt, migration repair, or new strict evidence?

**a950 remains documented, quarantined debt.** No new strict evidence exists in source or in the last live proof
(neither the exact active folder tombstone nor the exact active folderBinding tombstone is present). Future cleanup
remains BLOCKED and is source-enforced (a950 is explicitly excluded from both the strict-evidence-receipt and the
manual-approval cleanup override). This investigation does NOT reclassify a950 as migration-repair: a folder-restore /
migration path could only be opened by a SEPARATE reviewed lane that finds legitimate recovery evidence (e.g. a real
folder restore making the binding legitimate), which is not present. A future reviewed cleanup path could open only if a
live read-only re-verification finds BOTH exact active tombstones legitimately minted (never fabricated) - currently
absent.

### 10. Readiness preserved

`localExportableSyncReady:true` and global `productSyncReady:false` are preserved and unchanged. This investigation is
read-only and authorizes nothing.

## Read-Only Strict Re-Verification Snippet (operator-controlled)

Confirms, live, whether any NEW strict evidence has appeared for a950 since the last proof. Read-only: no apply, no gate,
no write, no mutation. It reports booleans only and keeps ids redacted.

```js
(async function operational5A950StrictReverify() {
  const SCHEMA = 'h2o.studio.operational5.a950-readonly-strict-reverify.v1';
  const A950_CHAT_TOKEN = 'r:650c3cb39924';
  const A950_FOLDER_TOKEN = 'r:0226fecaed5b';
  const A950_ROW_TOKEN = 'row:a950a44b859f';
  const safety = { readOnly: true, mutationAttempted: false, calledApply: false, calledGate: false, wroteSqlite: false,
    wroteTombstone: false, noCleanupAuthority: true, productSyncReady: false, localExportableSyncReady: true,
    webdavCloudRelay: 'blocked', fullBundleV3: 'not-started', chatSavingWebdavCloudArchiveCas: 'blocked' };
  const clean = (v) => String(v == null ? '' : v).trim();
  const enc = (v) => encodeURIComponent(clean(v));
  const arr = (v) => Array.isArray(v) ? v : [];
  const folders = globalThis.H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.folders;
  const chats = globalThis.H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.chats;
  const tombstones = globalThis.H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.tombstones;
  async function token(id) {
    if (globalThis.crypto && crypto.subtle && typeof TextEncoder !== 'undefined') {
      const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean(id)));
      return 'r:' + Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
    }
    return 'r:unavailable';
  }
  const canonicalFolders = folders && folders.getAll ? arr(await folders.getAll()) : [];
  const rawBindings = folders && folders.listCanonicalChatFolderBindings ? arr(await folders.listCanonicalChatFolderBindings()) : [];
  const folderIdOf = (r) => clean(r && (r.folderId || r.folder_id || r.id));
  const chatIdOf = (r) => clean(r && (r.chatId || r.chat_id || r.conversationId));
  const canonicalFolderIds = new Set(canonicalFolders.map(folderIdOf).filter(Boolean));
  let match = null;
  for (const row of rawBindings) {
    const chatId = chatIdOf(row); const folderId = folderIdOf(row);
    if (!chatId || !folderId) continue;
    if (canonicalFolderIds.has(folderId)) continue; // exportable, never dangling debt
    if ((await token(chatId)) !== A950_CHAT_TOKEN || (await token(folderId)) !== A950_FOLDER_TOKEN) continue;
    const folderTomb = tombstones && tombstones.getTombstone ? await tombstones.getTombstone('folder', 'folder:' + enc(folderId)) : null;
    const bindingTomb = tombstones && tombstones.getTombstone ? await tombstones.getTombstone('folderBinding', 'folderBinding:' + enc(chatId) + ':' + enc(folderId)) : null;
    const chatRow = chats && chats.get ? await chats.get(chatId).catch(() => null) : null;
    match = {
      rowToken: A950_ROW_TOKEN, chatToken: A950_CHAT_TOKEN, folderToken: A950_FOLDER_TOKEN,
      folderAbsentFromCanonical: true, chatLive: !!chatRow,
      strictActiveFolderTombstonePresent: !!folderTomb,
      strictActiveFolderBindingTombstonePresent: !!bindingTomb,
      strictTombstoneBacked: !!folderTomb && !!bindingTomb,
      newStrictEvidence: (!!folderTomb && !!bindingTomb),
      cleanupEligible: false, remainsDocumentedDebt: !(!!folderTomb && !!bindingTomb),
    };
    break;
  }
  const result = { schema: SCHEMA, readOnly: true, safety, rawCanonicalBindingCount: rawBindings.length,
    a950Found: !!match, a950: match, cleanupApproved: false, noCleanupAuthority: true,
    productSyncReady: false, localExportableSyncReady: true, webdavCloudRelay: 'blocked',
    fullBundleV3: 'not-started', chatSavingWebdavCloudArchiveCas: 'blocked' };
  console.log(JSON.stringify(result, null, 2));
  return result;
})().catch((e) => console.error('operational5-a950-readonly-strict-reverify-failed', String((e && e.message) || e)));
```

Expected for the current DB: `a950Found:true`, `strictActiveFolderTombstonePresent:false`,
`strictActiveFolderBindingTombstonePresent:false`, `strictTombstoneBacked:false`, `newStrictEvidence:false`,
`remainsDocumentedDebt:true`.

## Next Route

Keep `row:a950a44b859f` as documented, quarantined debt and keep `productSyncReady:false`. Only a SEPARATE reviewed lane
may act on it, and only if a live read-only re-verification finds BOTH exact active tombstones legitimately minted (a
cleanup path) OR a legitimate folder-restore/recovery is proven (a migration-repair path). Neither exists now. No
cleanup, no restore, no receipt mint, and no `productSyncReady` flip from this investigation.

## Boundaries Held

- Read-only investigation only; no cleanup apply; no cleanup authority introduced.
- `row:a950a44b859f` not cleaned or mutated; no folder/chat/binding/tombstone/ledger/receipt/approval/import-export/
  render-mirror mutation.
- `productSyncReady` not flipped - remains `false`; `localExportableSyncReady:true` preserved.
- No WebDAV/cloud/relay/`fullBundle.v3` started; no Chat Saving WebDAV/cloud/archive CAS touched.
- Strict tombstone verification not weakened; broad text matching not accepted as cleanup proof.
- No product source edited; no unrelated Studio-lane files touched.
