# Operational.5 - Live Read-Only Canonical Count Parity Diagnostic Prep

Verdict: **OPERATIONAL.5 LIVE READ-ONLY CANONICAL COUNT PARITY DIAGNOSTIC READY - PENDING DEVTOOLS OUTPUT**.

This slice prepares the live Desktop Studio diagnostic required after the read-only parity harness
commit `52264289de23207b6db8a376f5b46dc1a127a766`. It was later updated by the
Operational.5 `fullBundle.v2` read-only projection diagnostic slice so the live snippet can observe
that projection without running a real export. No live Desktop runtime was run by Codex, no
SQLite/chrome.storage/KV state was mutated, `productSyncReady` stayed `false`,
WebDAV/cloud/relay/`fullBundle.v3` was not started, and Chat Saving WebDAV/cloud/archive CAS remains
blocked/deferred.

Live Operational.5 parity remains pending DevTools output.

## Scope

The diagnostic is designed for the Desktop Studio WebView DevTools console. It reads current local
runtime state and emits one JSON object using this schema:

`h2o.studio.operational5.live-readonly-canonical-count-parity-diagnostic.v1`

It follows the harness contract from:

- `release-evidence/2026-07-01/operational5-canonical-count-parity-readonly-harness.md`
- `tools/validation/sync/validate-operational5-canonical-count-parity-readonly-harness.mjs`

## Read-Only Collection Plan

The snippet reads:

- Desktop canonical folders via `H2O.Studio.store.folders.getAll()` and `count()`.
- Canonical `folder_bindings` via `listCanonicalChatFolderBindings()`.
- Tombstones / recently deleted via `listRecentlyDeletedFolders()`.
- Render mirror via `chrome.storage.local.get('h2o:prm:cgx:fldrs:state:data:v1')`.
- `fullBundle.v2` projection counts/hashes via
  `H2O.Studio.ingestion.diagnoseFullBundleV2ReadonlyProjection()`.
- Export state diagnostics via `H2O.Studio.ingestion.diagnoseExportBundle()` only.
- Chrome/MV3 import/projection diagnostics via `H2O.Studio.sync.folder.diagnose()` only.
- Chat-folder binding receipts via `H2O.Studio.store.tombstoneReviews.listChatFolderBindingReceipts()`.
- Consumed-operation ledger via `H2O.Desktop.Sync.listConsumedOperations()`.

The snippet deliberately does **not** call:

- `exportFullBundle()`
- `exportLatestSyncBundle()`
- `syncNow()`
- `importLatestBundle()`
- `runF15SettledBindingRestartConvergence()`
- `whenF15SettledBindingRestartConvergenceReady()`
- `bindingRepair.apply(...)`
- `sortOrderReorder.apply(...)`
- any apply gate

Restart convergence is reported from already-exposed diagnostics only. If no safe read-only
convergence status exists, it is classified as `not-exposed` / `requires-live-follow-up`; the snippet
does not trigger convergence.

## Surface Classification

Every surface is classified as one of:

- `match`
- `mismatch`
- `orphan-bucket`
- `not-exposed`
- `requires-live-follow-up`

The diagnostic is PASS-ready only when every required surface is `match`, no orphan bucket exists,
and no required surface is `not-exposed` or `requires-live-follow-up`.

## DevTools Snippet

Paste this into the Desktop Studio WebView DevTools console:

```js
(async function operational5LiveReadonlyCanonicalCountParityDiagnostic() {
  const SCHEMA = 'h2o.studio.operational5.live-readonly-canonical-count-parity-diagnostic.v1';
  const FOLDER_STATE_DATA_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';
  const startedAt = new Date().toISOString();
  const safety = {
    readOnly: true,
    mutationAttempted: false,
    calledApply: false,
    calledGate: false,
    calledExportFullBundle: false,
    calledExportLatestSyncBundle: false,
    calledSyncNow: false,
    calledImportLatestBundle: false,
    calledRestartConvergence: false,
    calledRestartConvergenceReady: false,
    wroteSqlite: false,
    wroteChromeStorage: false,
    wroteKv: false,
    wroteLedger: false,
    wroteReceipt: false,
    productSyncReady: false,
    webdavCloudRelay: 'blocked',
    chatSavingWebdavCloudArchiveCas: 'blocked'
  };

  const safeArray = (value) => Array.isArray(value) ? value : [];
  const safeObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const clean = (value) => String(value || '').trim();
  const numberOrZero = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const folderId = (row) => clean(row && (row.id || row.folderId || row.folder_id));
  const chatId = (row) => clean(row && (row.chatId || row.chat_id || row.conversationId));
  const sortOrder = (row) => row && row.sortOrder !== undefined ? numberOrZero(row.sortOrder)
    : (row && row.sort_order !== undefined ? numberOrZero(row.sort_order) : 0);

  function stableStringify(value) {
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
    }
    return JSON.stringify(value);
  }

  async function sha256(value) {
    const text = stableStringify(value);
    if (globalThis.crypto && crypto.subtle && typeof TextEncoder !== 'undefined') {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return 'sha256:' + Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return 'fnv1a:' + ('00000000' + h.toString(16)).slice(-8);
  }

  async function summarizeFolders(rows) {
    const normalized = safeArray(rows).map((row) => ({
      id: folderId(row),
      sortOrder: sortOrder(row),
      deleted: !!(row && (row.deleted === true || row.tombstoned === true || row.deletedAt || row.tombstoneId))
    })).filter((row) => row.id).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
    const visible = normalized.filter((row) => row.deleted !== true);
    return {
      count: normalized.length,
      visibleCount: visible.length,
      hash: await sha256(normalized),
      visibleHash: await sha256(visible)
    };
  }

  async function summarizeBindings(rows) {
    const normalized = safeArray(rows).map((row) => ({
      chatId: chatId(row),
      folderId: folderId(row)
    })).filter((row) => row.chatId && row.folderId)
      .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
    return { count: normalized.length, hash: await sha256(normalized) };
  }

  async function summarizeTombstones(rows) {
    const normalized = safeArray(rows).map((row) => ({
      folderId: folderId(row),
      tombstoneId: clean(row && (row.tombstoneId || row.recordId || row.id)),
      active: row && row.restoredAt ? false : !(row && row.active === false)
    })).filter((row) => row.folderId || row.tombstoneId)
      .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
    return {
      count: normalized.length,
      activeCount: normalized.filter((row) => row.active).length,
      hash: await sha256(normalized)
    };
  }

  function mirrorBindingRows(items) {
    const rows = [];
    const object = safeObject(items);
    Object.keys(object).sort().forEach((fid) => {
      safeArray(object[fid]).forEach((cid) => rows.push({ chatId: clean(cid), folderId: clean(fid) }));
    });
    return rows;
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

  function compare(name, actual, expected) {
    const mismatches = [];
    Object.keys(expected).forEach((key) => {
      if (actual[key] !== expected[key]) mismatches.push({ key, actual: actual[key], expected: expected[key] });
    });
    return {
      surface: name,
      status: mismatches.length ? 'mismatch' : 'match',
      mismatchCount: mismatches.length,
      mismatches
    };
  }

  function classifyUnavailable(surface, reason) {
    return {
      surface,
      status: 'not-exposed',
      reason,
      mismatchCount: 0,
      mismatches: []
    };
  }

  const foldersStore = globalThis.H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.folders;
  const tombstoneReviews = globalThis.H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.tombstoneReviews;
  const desktopSync = globalThis.H2O && H2O.Desktop && H2O.Desktop.Sync;
  const ingestion = globalThis.H2O && H2O.Studio && H2O.Studio.ingestion;
  const folderSync = globalThis.H2O && H2O.Studio && H2O.Studio.sync && H2O.Studio.sync.folder;

  const canonicalFolderRows = foldersStore && typeof foldersStore.getAll === 'function'
    ? safeArray(await foldersStore.getAll())
    : [];
  const canonicalFolderCountReported = foldersStore && typeof foldersStore.count === 'function'
    ? numberOrZero(await foldersStore.count())
    : null;
  const canonicalBindingRows = foldersStore && typeof foldersStore.listCanonicalChatFolderBindings === 'function'
    ? safeArray(await foldersStore.listCanonicalChatFolderBindings())
    : [];
  const tombstoneRows = foldersStore && typeof foldersStore.listRecentlyDeletedFolders === 'function'
    ? safeArray(await foldersStore.listRecentlyDeletedFolders({ limit: 1000 }))
    : [];
  const mirror = safeObject(await readChromeStorageKey(FOLDER_STATE_DATA_KEY));

  const canonicalFolders = await summarizeFolders(canonicalFolderRows);
  const canonicalBindings = await summarizeBindings(canonicalBindingRows);
  const tombstones = await summarizeTombstones(tombstoneRows);
  const mirrorFolders = await summarizeFolders(safeArray(mirror.folders));
  const mirrorBindings = await summarizeBindings(mirrorBindingRows(mirror.items));
  const mirrorFolderIds = new Set(safeArray(mirror.folders).map(folderId).filter(Boolean));
  const orphanItemBuckets = Object.keys(safeObject(mirror.items)).filter((fid) => !mirrorFolderIds.has(fid)).sort();
  const mirrorSummary = {
    folderCount: mirrorFolders.count,
    visibleFolderCount: mirrorFolders.visibleCount,
    folderHash: mirrorFolders.hash,
    visibleFolderHash: mirrorFolders.visibleHash,
    bindingProjectionCount: mirrorBindings.count,
    bindingProjectionHash: mirrorBindings.hash,
    orphanItemBucketCount: orphanItemBuckets.length,
    orphanItemBucketHash: await sha256(orphanItemBuckets)
  };

  const receiptRows = tombstoneReviews && typeof tombstoneReviews.listChatFolderBindingReceipts === 'function'
    ? safeArray(await tombstoneReviews.listChatFolderBindingReceipts({ limit: 1000 }))
    : [];
  const consumedList = desktopSync && typeof desktopSync.listConsumedOperations === 'function'
    ? safeObject(await desktopSync.listConsumedOperations())
    : {};
  const consumedRows = safeArray(consumedList.rows);
  const receiptSummary = {
    receiptCount: receiptRows.length,
    receiptHash: await sha256(receiptRows.map((row) => ({
      schema: clean(row && row.schema),
      status: clean(row && row.status),
      reason: clean(row && row.reason),
      resultingBindingHash: clean(row && row.resultingBindingHash)
    })).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)))),
    consumedOperationCount: consumedRows.length,
    consumedHash: await sha256(consumedRows.map((row) => ({
      operationKind: clean(row && row.operationKind),
      consumedStatus: clean(row && row.consumedStatus)
    })).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))))
  };

  const exportProjectionDiagnostic = ingestion && typeof ingestion.diagnoseFullBundleV2ReadonlyProjection === 'function'
    ? safeObject(await ingestion.diagnoseFullBundleV2ReadonlyProjection())
    : {};
  const exportFolderProjection = safeObject(exportProjectionDiagnostic.folderProjection);
  const exportBindingProjection = safeObject(exportProjectionDiagnostic.canonicalChatFolderBindingProjection);
  const exportReceiptProjection = safeObject(exportProjectionDiagnostic.chatFolderBindingReceiptProjection);
  const exportSurface = exportProjectionDiagnostic && exportProjectionDiagnostic.ok === true ? compare('fullBundle.v2-readonly-projection-diagnostic', {
    folderCount: numberOrZero(exportFolderProjection.count),
    folderHash: clean(exportFolderProjection.hash),
    desktopCanonicalChatFolderBindingCount: numberOrZero(exportBindingProjection.count),
    desktopCanonicalChatFolderBindingHash: clean(exportBindingProjection.hash),
    activeDesktopCanonicalChatFolderBindingCount: numberOrZero(exportBindingProjection.activeCount),
    activeDesktopCanonicalChatFolderBindingHash: clean(exportBindingProjection.activeHash),
    chatFolderBindingReceiptCount: numberOrZero(exportReceiptProjection.count),
    chatFolderBindingReceiptHash: clean(exportReceiptProjection.hash)
  }, {
    folderCount: canonicalFolders.count,
    folderHash: canonicalFolders.hash,
    desktopCanonicalChatFolderBindingCount: canonicalBindings.count,
    desktopCanonicalChatFolderBindingHash: canonicalBindings.hash,
    activeDesktopCanonicalChatFolderBindingCount: canonicalBindings.count,
    activeDesktopCanonicalChatFolderBindingHash: canonicalBindings.hash,
    chatFolderBindingReceiptCount: receiptSummary.receiptCount,
    chatFolderBindingReceiptHash: receiptSummary.receiptHash
  }) : {
    surface: 'fullBundle.v2-readonly-projection-diagnostic',
    status: 'not-exposed',
    reason: 'diagnoseFullBundleV2ReadonlyProjection-not-present-or-not-ok; exportFullBundle-not-called-by-this-diagnostic',
    mismatchCount: 0,
    mismatches: []
  };

  const exportDiagnostic = ingestion && typeof ingestion.diagnoseExportBundle === 'function'
    ? safeObject(ingestion.diagnoseExportBundle())
    : {};
  const exportSummary = safeObject(exportDiagnostic.lastSummary);

  const importDiagnostic = folderSync && typeof folderSync.diagnose === 'function'
    ? safeObject(folderSync.diagnose())
    : {};
  const chromeMv3Surface = importDiagnostic && Object.keys(importDiagnostic).length ? {
    surface: 'chrome-mv3-import-projection',
    status: 'requires-live-follow-up',
    reason: 'folder.diagnose is present; compare against a current latest/fullBundle.v2 import output in the evidence slice',
    lastSummarySignaturePresent: !!clean(importDiagnostic.lastSummarySignature),
    connected: importDiagnostic.connected === true,
    autoSyncEnabled: importDiagnostic.autoSyncEnabled === true,
    mismatchCount: 0,
    mismatches: []
  } : classifyUnavailable('chrome-mv3-import-projection', 'H2O.Studio.sync.folder.diagnose unavailable in this surface');

  const ledgerSurface = exportSummary && Object.keys(exportSummary).length ? compare('request-receipt-ledgers', {
    receiptCount: receiptSummary.receiptCount,
    consumedOperationCount: receiptSummary.consumedOperationCount
  }, {
    receiptCount: numberOrZero(exportSummary.chatFolderBindingReceiptCount),
    consumedOperationCount: numberOrZero(exportSummary.applyEventCount)
  }) : {
    surface: 'request-receipt-ledgers',
    status: 'requires-live-follow-up',
    reason: 'ledger counts collected; export summary absent so cross-surface receipt/apply-event parity cannot be decided',
    mismatchCount: 0,
    mismatches: []
  };

  const surfaces = [
    {
      surface: 'desktop-canonical-folders',
      status: foldersStore && typeof foldersStore.getAll === 'function' ? 'match' : 'not-exposed',
      count: canonicalFolders.count,
      visibleCount: canonicalFolders.visibleCount,
      countApiMatchesRows: canonicalFolderCountReported === null ? null : canonicalFolderCountReported === canonicalFolders.visibleCount,
      hash: canonicalFolders.hash,
      visibleHash: canonicalFolders.visibleHash
    },
    {
      surface: 'desktop-canonical-folder-bindings',
      status: foldersStore && typeof foldersStore.listCanonicalChatFolderBindings === 'function' ? 'match' : 'not-exposed',
      count: canonicalBindings.count,
      hash: canonicalBindings.hash
    },
    {
      surface: 'desktop-tombstones-recently-deleted',
      status: foldersStore && typeof foldersStore.listRecentlyDeletedFolders === 'function' ? 'match' : 'not-exposed',
      count: tombstones.count,
      activeCount: tombstones.activeCount,
      hash: tombstones.hash
    },
    compare('render-mirror-folders', {
      visibleFolderCount: mirrorSummary.visibleFolderCount,
      visibleFolderHash: mirrorSummary.visibleFolderHash
    }, {
      visibleFolderCount: canonicalFolders.visibleCount,
      visibleFolderHash: canonicalFolders.visibleHash
    }),
    compare('render-mirror-bindings', {
      bindingProjectionCount: mirrorSummary.bindingProjectionCount,
      bindingProjectionHash: mirrorSummary.bindingProjectionHash,
      orphanItemBucketCount: mirrorSummary.orphanItemBucketCount
    }, {
      bindingProjectionCount: canonicalBindings.count,
      bindingProjectionHash: canonicalBindings.hash,
      orphanItemBucketCount: 0
    }),
    mirrorSummary.orphanItemBucketCount > 0 ? {
      surface: 'render-mirror-orphan-buckets',
      status: 'orphan-bucket',
      orphanItemBucketCount: mirrorSummary.orphanItemBucketCount,
      orphanItemBucketHash: mirrorSummary.orphanItemBucketHash,
      mismatchCount: mirrorSummary.orphanItemBucketCount,
      mismatches: [{ key: 'orphanItemBucketCount', actual: mirrorSummary.orphanItemBucketCount, expected: 0 }]
    } : {
      surface: 'render-mirror-orphan-buckets',
      status: 'match',
      orphanItemBucketCount: 0,
      orphanItemBucketHash: mirrorSummary.orphanItemBucketHash,
      mismatchCount: 0,
      mismatches: []
    },
    exportSurface,
    chromeMv3Surface,
    ledgerSurface,
    {
      surface: 'restart-convergence-records',
      status: 'not-exposed',
      reason: 'read-only last convergence result is not exposed; runF15SettledBindingRestartConvergence/whenReady intentionally not called',
      apiPresent: !!(foldersStore && typeof foldersStore.runF15SettledBindingRestartConvergence === 'function'),
      unsafeApiNotCalled: true,
      mismatchCount: 0,
      mismatches: []
    }
  ];

  const blockingStatuses = ['mismatch', 'orphan-bucket', 'not-exposed', 'requires-live-follow-up'];
  const blockers = surfaces
    .filter((surface) => blockingStatuses.includes(surface.status))
    .map((surface) => surface.surface + ':' + surface.status);

  const result = {
    schema: SCHEMA,
    phase: 'Operational.5-live-readonly-canonical-count-parity-diagnostic',
    surface: 'desktop-studio',
    mode: 'manual-devtools-read-only',
    startedAt,
    completedAt: new Date().toISOString(),
    ok: blockers.length === 0,
    status: blockers.length === 0 ? 'pass' : 'blocked',
    readOnly: true,
    safety,
    canonical: {
      folders: canonicalFolders,
      folderBindings: canonicalBindings,
      tombstones
    },
    renderMirror: mirrorSummary,
    exportDiagnostic: {
      available: !!(exportDiagnostic && Object.keys(exportDiagnostic).length),
      lastSummaryPresent: !!(exportSummary && Object.keys(exportSummary).length),
      lastFolderParityPresent: !!(exportDiagnostic && exportDiagnostic.lastFolderParity),
      summaryHash: await sha256(exportSummary || null)
    },
    chromeMv3Projection: {
      diagnosticAvailable: !!(importDiagnostic && Object.keys(importDiagnostic).length),
      lastSummarySignaturePresent: !!clean(importDiagnostic.lastSummarySignature),
      connected: importDiagnostic.connected === true
    },
    requestReceiptLedger: receiptSummary,
    surfaces,
    blockers,
    passCriteria: {
      allRequiredSurfacesMatch: blockers.length === 0,
      noOrphanFolderStateItemsBucket: mirrorSummary.orphanItemBucketCount === 0,
      noNotExposedSurface: !surfaces.some((surface) => surface.status === 'not-exposed'),
      noRequiresLiveFollowUpSurface: !surfaces.some((surface) => surface.status === 'requires-live-follow-up')
    },
    nextAction: blockers.length === 0
      ? 'record-live-readonly-parity-pass-evidence-before-productSyncReady-review'
      : 'resolve-or-record-live-readonly-parity-blockers-before-productSyncReady-review'
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
})().catch((error) => {
  console.error('operational5-live-readonly-canonical-count-parity-diagnostic-failed', error);
  throw error;
});
```

## Pass Criteria For The Next Slice

The pasted live JSON may support an Operational.5 readiness decision only if:

- `ok:true`
- `status:"pass"`
- every required surface status is `match`
- `orphanItemBucketCount:0`
- no `not-exposed` surface
- no `requires-live-follow-up` surface
- `productSyncReady:false`
- WebDAV/cloud/relay/`fullBundle.v3` remains deferred
- Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred

If the live output contains `mismatch`, `orphan-bucket`, `not-exposed`, or `requires-live-follow-up`,
the next slice must record or fix that specific blocker before any productSyncReady readiness decision.

## Boundaries Held

- No product source edited.
- No live runtime run by Codex.
- No folder, `folder_bindings`, tombstone, ledger, receipt, render mirror, import/export, or restart
  convergence write.
- No `productSyncReady` flip.
- No WebDAV/cloud/relay/`fullBundle.v3`.
- No Chat Saving WebDAV/cloud/archive CAS.
- No fallback added.
- Durable/hash gates, conflict runtime, `requireContext`, restart convergence, reviewed request path,
  and F11 render-mirror no-write boundary were not weakened.

## Next Required Action

Run the DevTools snippet manually in Desktop Studio and paste the JSON output. The next evidence slice
should either record a live read-only parity pass or record the exact blocker/missing read-only surface.
