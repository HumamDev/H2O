# Operational.5 - Dangling Binding Row-Level Diagnostic Prep

Verdict: **OPERATIONAL.5 DANGLING BINDING ROW-LEVEL DIAGNOSTIC READY - PENDING DEVTOOLS OUTPUT**.

This slice prepares the read-only row-level diagnostic required after cleanup preflight
`584aff71ce3f40d45cc1b51ea38fe98813c6f093`. It does not run live Desktop, does not mutate
canonical state, does not approve cleanup, does not flip `productSyncReady`, does not start
WebDAV/cloud/relay/`fullBundle.v3`, and does not touch Chat Saving WebDAV/cloud/archive CAS.

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

## Classification Rules

For each dangling row:

- `restore-folder-candidate`: chat is live and a folder tombstone/recovery snapshot exists for the
  missing folder.
- `reviewed-rebind-or-unbind-candidate`: chat is live, no restorable folder context is proven, and no
  folderBinding tombstone/receipt already explains the edge.
- `tombstone-receipt-already-explains-it`: folderBinding tombstone or reviewed receipt context already
  represents the edge.
- `unsafe-needs-manual-review`: chat liveness is false/unknown, row context is incomplete, or exposed
  APIs cannot prove a non-destructive next step.

Cleanup remains blocked after this diagnostic. A later implementation must be separately reviewed and
must dry-run first.

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

  function folderBindingTombstoneMatches(row, chatId, folderId) {
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
    const relatedBindingTombstones = folderBindingTombstones.filter((t) => folderBindingTombstoneMatches(t, chatId, folderId));
    const relatedReceipts = receipts.filter((r) => receiptMatches(r, chatId, folderId));
    const renderMirrorFolderPresent = safeArray(mirror.folders).some((f) => folderIdOf(f) === folderId);
    const renderMirrorItemBucketPresent = !!(safeObject(mirror.items)[folderId]);

    const chatLive = !!chatRow;
    const folderRestorable = activeFolderTombstones.length > 0 || recoverySnapshots.length > 0;
    const alreadyExplained = relatedBindingTombstones.length > 0 || relatedReceipts.length > 0;
    let classification = 'unsafe-needs-manual-review';
    let recommendedAction = 'blocked-insufficient-context';
    if (alreadyExplained) {
      classification = 'tombstone-receipt-already-explains-it';
      recommendedAction = 'verify-existing-tombstone-or-receipt-before-any-row-cleanup';
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
        renderMirrorFolderPresent,
        renderMirrorItemBucketPresent
      },
      bindingContext: {
        perChatCanonicalBindingCount: perChatRows.length,
        folderBindingTombstoneCount: relatedBindingTombstones.length,
        reviewedReceiptCount: relatedReceipts.length,
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
  - `tombstone-receipt-already-explains-it`
  - `unsafe-needs-manual-review`
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
