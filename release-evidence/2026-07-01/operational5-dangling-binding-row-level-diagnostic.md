# Operational.5 - Dangling Binding Row-Level Diagnostic Prep

Verdict: **OPERATIONAL.5 DANGLING BINDING ROW-LEVEL DIAGNOSTIC READY - PENDING DEVTOOLS OUTPUT**.

This slice prepares the read-only row-level diagnostic required after cleanup preflight
`584aff71ce3f40d45cc1b51ea38fe98813c6f093`. It does not run live Desktop, does not mutate
canonical state, does not approve cleanup, does not flip `productSyncReady`, does not start
WebDAV/cloud/relay/`fullBundle.v3`, and does not touch Chat Saving WebDAV/cloud/archive CAS.

## Correction (2026-07-04) - broad matching superseded by strict verification

The first live run of the cleanup command's dry-run (`9fdf2dab`) reported `verifiedCount:0`: both dangling rows
were `skipped-not-fully-tombstone-verified` (candidate 1 had neither an exact active folder tombstone nor an exact
active folderBinding tombstone; candidate 2 had the exact active folderBinding tombstone but NO exact active folder
tombstone). This contradicted this diagnostic's original classification of both rows as "tombstone/receipt
explained".

Root cause: the original diagnostic used BROAD matching that the strict cleanup command does not accept -
`folderBindingTombstoneMatches` accepted a meta-only match (including `meta.oldFolderId`, i.e. move edges),
`receiptMatches` accepted the folderId appearing in ANY receipt field, and `alreadyExplained` required only a
binding-tombstone-OR-receipt and did NOT require a folder tombstone at all. Those are FALSE POSITIVES. The cleanup
command is authoritative and correct: it requires a strict exact active folder tombstone AND a strict exact active
folderBinding tombstone (via `store.tombstones.getTombstone`, which matches `record_kind = ? AND record_id = ? AND
restored_at IS NULL`). See `operational5-orphan-binding-cleanup-tombstone-verification-fix.md`.

This snippet has been corrected to score evidence with the SAME strict exact + active tombstone bar. Loose meta /
receipt-field / substring matches are retained only as clearly-labeled non-authoritative context and never drive the
"explained" verdict. Controlled cleanup apply remains BLOCKED; both rows require manual review.

## Purpose

The previous Operational.5 slices proved:

- raw Desktop canonical `folder_bindings`: `14`;
- exportable canonical bindings: `12`;
- `fullBundle.v2` binding projection: `12`;
- known debt: `rawCanonicalDanglingBindingsFilteredFromExport`;
- the two-row gap is `missingFolderBindingCount:2`, `fallbackUnfiledBindingCount:2`, and
  `activeDanglingFolderBindingCount:2`;
- destructive cleanup is not approved.

This diagnostic classifies the two dangling rows using redacted/hash tokens only before any cleanup
decision.

## Read-Only Row-Level Contract

The diagnostic reads:

- `H2O.Studio.store.folders.getAll()`;
- `H2O.Studio.store.folders.listCanonicalChatFolderBindings()`;
- `H2O.Studio.store.folders.listCanonicalChatFolderBindingsForChat(chatId)`;
- `H2O.Studio.store.folders.listRecentlyDeletedFolders({ limit: 1000 })`;
- `H2O.Studio.store.folders.diagnose()`;
- `H2O.Studio.store.tombstones.list({ recordKind:"folder", includeRestored:true, limit:1000 })`;
- `H2O.Studio.store.tombstones.list({ recordKind:"folderBinding", includeRestored:true, limit:1000 })`;
- `H2O.Studio.store.tombstoneReviews.listChatFolderBindingReceipts({ limit:1000 })`;
- `H2O.Desktop.Sync.listConsumedOperations()` if available;
- `H2O.Studio.ingestion.diagnoseFullBundleV2ReadonlyProjection()` if available;
- `chrome.storage.local.get('h2o:prm:cgx:fldrs:state:data:v1')` or localStorage fallback read;
- `H2O.Studio.store.chats.get(chatId)` if available, but it records only liveness booleans.

The diagnostic does **not** call apply, delete, restore, bind, unbind, purge, import, export, restart
convergence, ledger write, tombstone write, `chrome.storage.local.set`, or any gate.

## Classification Rules (strict - corrected 2026-07-04)

Evidence is scored ONLY on strict, exact, active (`restored_at IS NULL`) tombstone rows - the identical bar
used by `operational5OrphanBindingCleanup` / `store.tombstones.getTombstone`. Loose meta / receipt-field /
substring matches are recorded as non-authoritative context and NEVER establish "explained". For each
dangling row:

- `tombstone-receipt-already-explains-it`: a strict exact active folder tombstone
  (`folder:<encodeURIComponent(folderId)>`) AND a strict exact active folderBinding tombstone
  (`folderBinding:<encodeURIComponent(chatId)>:<encodeURIComponent(folderId)>`) both exist.
- `binding-tombstone-present-folder-tombstone-missing-needs-manual-review`: a strict active folderBinding
  tombstone exists but NO strict active folder tombstone does - insufficient for cleanup; manual review.
- `restore-folder-candidate`: chat is live and a strict active folder tombstone / recovery snapshot exists.
- `reviewed-rebind-or-unbind-candidate`: chat is live and no strict tombstone evidence proves the edge.
- `unsafe-needs-manual-review`: chat liveness is false/unknown, or exposed APIs cannot prove a strict,
  non-destructive next step.

Cleanup remains blocked after this diagnostic. A later implementation must be separately reviewed and must
dry-run first. A `tombstone-receipt-already-explains-it` classification is necessary but NOT sufficient to
approve cleanup: the cleanup command re-verifies strict evidence live and stays dry-run-first behind its gate.

## DevTools Snippet

Paste this into Desktop Studio WebView DevTools:

```js
(async function operational5DanglingBindingRowLevelDiagnostic() {
  const SCHEMA = 'h2o.studio.operational5.dangling-binding-row-level-diagnostic.v1';
  const FOLDER_STATE_DATA_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';
  const safety = {
    readOnly: true,
    mutationAttempted: false,
    calledApply: false,
    calledGate: false,
    calledBind: false,
    calledUnbind: false,
    calledRestore: false,
    calledDelete: false,
    calledPurge: false,
    calledExportFullBundle: false,
    calledExportLatestSyncBundle: false,
    calledImportLatestBundle: false,
    calledRestartConvergence: false,
    wroteSqlite: false,
    wroteChromeStorage: false,
    wroteKv: false,
    wroteLedger: false,
    wroteReceipt: false,
    wroteTombstone: false,
    productSyncReady: false,
    webdavCloudRelay: 'blocked',
    fullBundleV3: 'not-started',
    chatSavingWebdavCloudArchiveCas: 'blocked'
  };

  const safeArray = (value) => Array.isArray(value) ? value : [];
  const safeObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const clean = (value) => String(value || '').trim();
  const numberOrNull = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const folderIdOf = (row) => clean(row && (row.folderId || row.folder_id || row.id));
  const chatIdOf = (row) => clean(row && (row.chatId || row.chat_id || row.conversationId || row.id));

  function parseJsonObject(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return {};
    try {
      const parsed = JSON.parse(value);
      return safeObject(parsed);
    } catch (_) {
      return {};
    }
  }

  function stableStringify(value) {
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
    }
    return JSON.stringify(value);
  }

  async function sha256Token(kind, raw) {
    const text = stableStringify({ schema: SCHEMA, kind, raw: clean(raw) });
    if (globalThis.crypto && crypto.subtle && typeof TextEncoder !== 'undefined') {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return 'sha256:' + Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    }
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return 'fnv1a:' + ('00000000' + h.toString(16)).slice(-8);
  }

  async function sha256Summary(value) {
    const text = stableStringify(value);
    if (globalThis.crypto && crypto.subtle && typeof TextEncoder !== 'undefined') {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return 'sha256:' + Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return 'sha256:unavailable';
  }

  async function readChromeStorageKey(key) {
    if (globalThis.chrome && chrome.storage && chrome.storage.local && typeof chrome.storage.local.get === 'function') {
      const result = await chrome.storage.local.get(key);
      return result && result[key] ? result[key] : null;
    }
    try {
      const raw = globalThis.localStorage && localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function folderIdFromTombstone(row) {
    const meta = parseJsonObject(row && (row.meta || row.metaJson || row.meta_json));
    const recordId = clean(row && (row.recordId || row.record_id || row.id));
    return clean(meta.folderId || (meta.recoverySnapshot && meta.recoverySnapshot.folder && (meta.recoverySnapshot.folder.id || meta.recoverySnapshot.folder.folderId)) ||
      (recordId.indexOf('folder:') === 0 ? decodeURIComponent(recordId.slice('folder:'.length)) : ''));
  }

  function bindingRecordId(chatId, folderId) {
    return 'folderBinding:' + encodeURIComponent(chatId) + ':' + encodeURIComponent(folderId);
  }

  function folderTombstoneRecordId(folderId) {
    return 'folder:' + encodeURIComponent(folderId);
  }

  function tombstoneRestored(row) {
    return !!clean(row && (row.restoredAt || row.restored_at));
  }

  // STRICT, cleanup-grade evidence: exact record_id + active (restored_at IS NULL), the identical bar used by
  // operational5OrphanBindingCleanup / store.tombstones.getTombstone. Broad meta / recordId-decode / receipt-field /
  // substring matching is NOT accepted as cleanup proof (it produced false positives in the first diagnostic run).
  function strictActiveFolderTombstoneMatch(row, folderId) {
    const recordId = clean(row && (row.recordId || row.record_id || row.id));
    return recordId === folderTombstoneRecordId(folderId) && !tombstoneRestored(row);
  }

  function strictActiveFolderBindingTombstoneMatch(row, chatId, folderId) {
    const recordId = clean(row && (row.recordId || row.record_id || row.id));
    return recordId === bindingRecordId(chatId, folderId) && !tombstoneRestored(row);
  }

  // NON-AUTHORITATIVE loose matcher: retained only as diagnostic context; must NOT drive cleanup eligibility.
  function looseFolderBindingMetaMatch(row, chatId, folderId) {
    const meta = parseJsonObject(row && (row.meta || row.metaJson || row.meta_json));
    const recordId = clean(row && (row.recordId || row.record_id || row.id));
    return recordId === bindingRecordId(chatId, folderId) ||
      (clean(meta.chatId) === chatId && clean(meta.folderId || meta.oldFolderId) === folderId);
  }

  function receiptMatches(receipt, chatId, folderId) {
    return clean(receipt && (receipt.chatId || receipt.conversationId)) === chatId &&
      [receipt && receipt.beforeFolderId, receipt && receipt.expectedCurrentFolderId, receipt && receipt.targetFolderId, receipt && receipt.afterFolderId]
        .map(clean)
        .includes(folderId);
  }

  function consumedMatches(row, chatIdToken, folderToken) {
    const text = stableStringify(row || {});
    return text.includes(chatIdToken) || text.includes(folderToken);
  }

  const folders = globalThis.H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.folders;
  const chats = globalThis.H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.chats;
  const tombstones = globalThis.H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.tombstones;
  const tombstoneReviews = globalThis.H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.tombstoneReviews;
  const ingestion = globalThis.H2O && H2O.Studio && H2O.Studio.ingestion;
  const desktopSync = globalThis.H2O && H2O.Desktop && H2O.Desktop.Sync;

  const canonicalFolders = folders && typeof folders.getAll === 'function' ? safeArray(await folders.getAll()) : [];
  const canonicalBindings = folders && typeof folders.listCanonicalChatFolderBindings === 'function'
    ? safeArray(await folders.listCanonicalChatFolderBindings())
    : [];
  const recentlyDeleted = folders && typeof folders.listRecentlyDeletedFolders === 'function'
    ? safeObject(await folders.listRecentlyDeletedFolders({ limit: 1000 }))
    : {};
  const folderTombstones = tombstones && typeof tombstones.list === 'function'
    ? safeArray(await tombstones.list({ recordKind: 'folder', includeRestored: true, limit: 1000 }))
    : [];
  const folderBindingTombstones = tombstones && typeof tombstones.list === 'function'
    ? safeArray(await tombstones.list({ recordKind: 'folderBinding', includeRestored: true, limit: 1000 }))
    : [];
  const receipts = tombstoneReviews && typeof tombstoneReviews.listChatFolderBindingReceipts === 'function'
    ? safeArray(await tombstoneReviews.listChatFolderBindingReceipts({ limit: 1000 }))
    : [];
  const consumed = desktopSync && typeof desktopSync.listConsumedOperations === 'function'
    ? safeObject(await desktopSync.listConsumedOperations())
    : {};
  const fullBundleProjection = ingestion && typeof ingestion.diagnoseFullBundleV2ReadonlyProjection === 'function'
    ? safeObject(await ingestion.diagnoseFullBundleV2ReadonlyProjection())
    : {};
  const mirror = safeObject(await readChromeStorageKey(FOLDER_STATE_DATA_KEY));
  const foldersDiag = folders && typeof folders.diagnose === 'function' ? safeObject(folders.diagnose()) : {};

  const canonicalFolderIds = new Set(canonicalFolders.map(folderIdOf).filter(Boolean));
  const missingRows = canonicalBindings.filter((row) => {
    const chatId = chatIdOf(row);
    const folderId = folderIdOf(row);
    return chatId && folderId && !canonicalFolderIds.has(folderId);
  });

  const rowResults = [];
  for (const row of missingRows) {
    const chatId = chatIdOf(row);
    const folderId = folderIdOf(row);
    const chatToken = await sha256Token('chat', chatId);
    const folderToken = await sha256Token('folder', folderId);
    const rowToken = await sha256Token('binding-row', chatId + '\u0000' + folderId + '\u0000' + clean(row.assignedAt));

    const chatRow = chats && typeof chats.get === 'function' ? await chats.get(chatId).catch(() => null) : null;
    const perChatRows = folders && typeof folders.listCanonicalChatFolderBindingsForChat === 'function'
      ? safeArray(await folders.listCanonicalChatFolderBindingsForChat(chatId))
      : [];
    const folderTombstoneRows = folderTombstones.filter((t) => folderIdFromTombstone(t) === folderId);
    const activeFolderTombstones = folderTombstoneRows.filter((t) => !clean(t && t.restoredAt));
    const restoredFolderTombstones = folderTombstoneRows.filter((t) => !!clean(t && t.restoredAt));
    const recoverySnapshots = folderTombstoneRows.filter((t) => {
      const meta = parseJsonObject(t && (t.meta || t.metaJson || t.meta_json));
      return !!(meta.recoverySnapshot && meta.recoverySnapshot.folder);
    });
    // AUTHORITATIVE: strict exact + active tombstone evidence (identical bar to the cleanup command).
    const strictActiveFolderTombstones = folderTombstones.filter((t) => strictActiveFolderTombstoneMatch(t, folderId));
    const strictActiveBindingTombstones = folderBindingTombstones.filter((t) => strictActiveFolderBindingTombstoneMatch(t, chatId, folderId));
    const strictFolderTombstonePresent = strictActiveFolderTombstones.length > 0;
    const strictFolderBindingTombstonePresent = strictActiveBindingTombstones.length > 0;
    const strictTombstoneBacked = strictFolderTombstonePresent && strictFolderBindingTombstonePresent;

    // NON-AUTHORITATIVE context only (broad meta / receipt-field / substring matches). NOT cleanup proof.
    const looseFolderBindingMetaMatches = folderBindingTombstones.filter((t) => looseFolderBindingMetaMatch(t, chatId, folderId));
    const looseReceiptFieldMatches = receipts.filter((r) => receiptMatches(r, chatId, folderId));
    const renderMirrorFolderPresent = safeArray(mirror.folders).some((f) => folderIdOf(f) === folderId);
    const renderMirrorItemBucketPresent = !!(safeObject(mirror.items)[folderId]);

    const chatLive = !!chatRow;
    const folderRestorable = strictFolderTombstonePresent || recoverySnapshots.length > 0;
    // Only strict exact+active folder AND folderBinding tombstones count as "already explained". A loose meta match,
    // a receipt-field match, or a folderBinding tombstone WITHOUT a folder tombstone is NOT cleanup proof.
    let classification = 'unsafe-needs-manual-review';
    let recommendedAction = 'blocked-insufficient-context';
    if (strictTombstoneBacked) {
      classification = 'tombstone-receipt-already-explains-it';
      recommendedAction = 'verify-existing-tombstone-or-receipt-before-any-row-cleanup';
    } else if (strictFolderBindingTombstonePresent && !strictFolderTombstonePresent) {
      classification = 'binding-tombstone-present-folder-tombstone-missing-needs-manual-review';
      recommendedAction = 'manual-review-missing-folder-tombstone-before-any-row-cleanup';
    } else if (chatLive && folderRestorable) {
      classification = 'restore-folder-candidate';
      recommendedAction = 'reviewed-folder-restore-reconciliation-dry-run-first';
    } else if (chatLive) {
      classification = 'reviewed-rebind-or-unbind-candidate';
      recommendedAction = 'reviewed-f15-binding-repair-dry-run-first';
    }

    rowResults.push({
      rowToken,
      chatToken,
      missingFolderToken: folderToken,
      assignedAt: row && row.assignedAt != null ? clean(row.assignedAt) : null,
      source: clean(row && row.source),
      sourceSurface: clean(row && row.sourceSurface),
      authority: clean(row && row.authority),
      status: clean(row && row.status),
      state: clean(row && row.state),
      chat: {
        livenessChecked: !!(chats && typeof chats.get === 'function'),
        live: chatLive,
        rawTitleLogged: false,
        rawContentLogged: false
      },
      folder: {
        canonicalFolderPresent: false,
        hiddenFolderCheck: 'not-exposed',
        recentlyDeletedChecked: !!recentlyDeleted.rows,
        folderTombstoneCount: folderTombstoneRows.length,
        activeFolderTombstoneCount: activeFolderTombstones.length,
        restoredFolderTombstoneCount: restoredFolderTombstones.length,
        recoverySnapshotCount: recoverySnapshots.length,
        strictActiveFolderTombstoneCount: strictActiveFolderTombstones.length,
        strictFolderTombstonePresent,
        renderMirrorFolderPresent,
        renderMirrorItemBucketPresent
      },
      bindingContext: {
        perChatCanonicalBindingCount: perChatRows.length,
        folderBindingTombstoneCount: strictActiveBindingTombstones.length,
        strictFolderBindingTombstonePresent,
        strictTombstoneBacked,
        looseFolderBindingMetaMatchCount: looseFolderBindingMetaMatches.length,
        looseReceiptFieldMatchCount: looseReceiptFieldMatches.length,
        reviewedReceiptCount: looseReceiptFieldMatches.length,
        f15MaterializationRecordExposure: foldersDiag.lastF15SettledBindingRestartConvergence ? 'restart-convergence-summary-only' : 'not-exposed',
        consumedLedgerRelatedCount: safeArray(consumed.rows).filter((r) => consumedMatches(r, chatToken, folderToken)).length
      },
      classification,
      recommendedAction,
      cleanupApproved: false,
      mutationAttempted: false
    });
  }

  const fullBundleBinding = safeObject(fullBundleProjection.canonicalChatFolderBindingProjection);
  const diagnostics = safeObject(fullBundleBinding.diagnostics);
  const result = {
    schema: SCHEMA,
    phase: 'Operational.5-dangling-binding-row-level-diagnostic',
    surface: 'desktop-studio',
    mode: 'manual-devtools-read-only',
    readOnly: true,
    safety,
    counts: {
      rawCanonicalBindingCount: canonicalBindings.length,
      canonicalFolderCount: canonicalFolders.length,
      danglingBindingCount: missingRows.length,
      expectedDanglingBindingCount: 2,
      fullBundleV2ProjectionCount: Number(fullBundleBinding.count) || null,
      fullBundleMissingFolderBindingCount: Number(diagnostics.missingFolderBindingCount) || 0,
      fullBundleActiveDanglingFolderBindingCount: Number(diagnostics.activeDanglingFolderBindingCount) || 0,
      fullBundleFallbackUnfiledBindingCount: Number(diagnostics.fallbackUnfiledBindingCount) || 0
    },
    rows: rowResults,
    rowClassificationHash: await sha256Summary(rowResults.map((r) => ({
      rowToken: r.rowToken,
      classification: r.classification,
      recommendedAction: r.recommendedAction
    }))),
    rawIdentifiersLogged: false,
    rawNamesLogged: false,
    chatTitlesLogged: false,
    chatContentLogged: false,
    cleanupApproved: false,
    productSyncReady: false,
    webdavCloudRelay: 'blocked',
    fullBundleV3: 'not-started',
    chatSavingWebdavCloudArchiveCas: 'blocked',
    nextAction: 'record-row-level-output-and-decide-cleanup-preflight'
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
})().catch((error) => {
  const failure = {
    schema: 'h2o.studio.operational5.dangling-binding-row-level-diagnostic.failure.v1',
    prefix: 'operational5-dangling-binding-row-level-diagnostic-failed',
    readOnly: true,
    applyGatePassed: false,
    applyTruePassed: false,
    mutationAttempted: false,
    productSyncReady: false,
    webdavCloudRelay: 'blocked',
    chatSavingWebdavCloudArchiveCas: 'blocked',
    error: String((error && error.message) || error)
  };
  console.error('operational5-dangling-binding-row-level-diagnostic-failed', failure);
  return failure;
});
```

## Expected Output

Expected successful shape:

- `schema:"h2o.studio.operational5.dangling-binding-row-level-diagnostic.v1"`
- `readOnly:true`
- `safety.calledApply:false`
- `safety.calledGate:false`
- `safety.wroteSqlite:false`
- `safety.wroteChromeStorage:false`
- `counts.rawCanonicalBindingCount:14`
- `counts.danglingBindingCount:2`
- `rows.length:2`
- every row has `rowToken`, `chatToken`, and `missingFolderToken`
- every row has `rawTitleLogged:false` / `rawContentLogged:false`
- every row has `cleanupApproved:false`
- row classification is one of:
  - `restore-folder-candidate`
  - `reviewed-rebind-or-unbind-candidate`
  - `tombstone-receipt-already-explains-it` (strict: exact active folder AND folderBinding tombstone)
  - `binding-tombstone-present-folder-tombstone-missing-needs-manual-review`
  - `unsafe-needs-manual-review`
- for the recorded live run both rows were NOT strict-tombstone-backed (`strictTombstoneBacked:false`); cleanup
  stays blocked
- `productSyncReady:false`
- `webdavCloudRelay:"blocked"`
- `fullBundleV3:"not-started"`
- `chatSavingWebdavCloudArchiveCas:"blocked"`

## Boundaries

- No product source edited.
- No live Desktop run by Codex.
- No cleanup/write/apply/delete/restore/rebind/unbind/purge.
- No raw chat titles, raw content, raw folder names, raw chat ids, or raw folder ids in evidence.
- No `productSyncReady` flip.
- No WebDAV/cloud/relay/`fullBundle.v3`.
- No Chat Saving WebDAV/cloud/archive CAS.
- No fallback added.
- Durable/hash gates, conflict runtime, `requireContext`, restart convergence, reviewed request path,
  and render-mirror no-write boundary were not weakened.

## Next Step

Run the DevTools snippet and paste the JSON output. If both rows classify cleanly, create evidence
from the output and then decide whether the next implementation should be reviewed folder restore,
reviewed F15 rebind/unbind, or a dedicated orphan-binding tombstone-plus-cleanup handler.
