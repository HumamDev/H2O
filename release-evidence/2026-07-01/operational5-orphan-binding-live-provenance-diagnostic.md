# Operational.5 - Orphan-Binding Live Provenance Diagnostic

Verdict: **OPERATIONAL.5 ORPHAN-BINDING LIVE PROVENANCE DIAGNOSTIC READY - READ-ONLY DEVTOOLS STEP APPROVED**.

This slice prepares a stronger live read-only provenance diagnostic for the two dangling raw canonical
`folder_bindings` rows. It does not run cleanup apply, does not mutate product state, does not flip
`productSyncReady`, does not start WebDAV/cloud/relay/`fullBundle.v3`, does not touch Chat Saving
WebDAV/cloud/archive CAS, does not add fallback, and does not weaken strict tombstone verification.

## Context

- Read-only provenance search: `2ecfbd81eddbef72b6f3c626ce503b33939291c4`.
- Manual-review packet: `b344120ac4462b6e91f7ac6bfb4cff507cab0a68`.
- Cleanup command implementation: `9fdf2dab`.
- Tombstone verification fix: `221d91b6`.
- Manual-review blocker decision: `9dd82fdf`.
- Current retained binding/readiness baseline before this slice: `72/72` green.

Target rows:

| Row token | Chat token | Folder token | Strict folder tombstone | Strict folderBinding tombstone |
| --- | --- | --- | --- | --- |
| `row:a950a44b859f` | `r:650c3cb39924` | `r:0226fecaed5b` | not found | not found |
| `row:fdd2456fc8a2` | `r:2f29d39a6c4f` | `r:2d5469848470` | not found | found |

Strict cleanup proof remains unchanged:

- exact active folder tombstone:
  `recordKind:"folder"` and `recordId:"folder:<encodeURIComponent(folderId)>"`
  with `restored_at IS NULL`;
- exact active folderBinding tombstone:
  `recordKind:"folderBinding"` and
  `recordId:"folderBinding:<encodeURIComponent(chatId)>:<encodeURIComponent(folderId)>"`
  with `restored_at IS NULL`.

Broad text matching, metadata correlation, receipt substring matching, row-token correlation, execute
journal presence, F15 settlement history, and export filtering are non-authoritative context only. They
must not be used as cleanup proof.

## Live Read-Only APIs To Inspect

The diagnostic uses read-only APIs only:

- `H2O.Studio.store.folders.getAll()`
- `H2O.Studio.store.folders.listCanonicalChatFolderBindings()`
- `H2O.Studio.store.folders.listCanonicalChatFolderBindingsForChat(chatId)`
- `H2O.Studio.store.folders.listRecentlyDeletedFolders({ limit: 1000 })`
- `H2O.Studio.store.folders.diagnose()`
- `H2O.Studio.store.tombstones.getTombstone(recordKind, recordId)`
- `H2O.Studio.store.tombstones.list({ recordKind, includeRestored:true, limit:1000 })`
- `H2O.Studio.store.tombstoneReviews.listChatFolderBindingReceipts({ limit:1000 })`
- `H2O.Desktop.Sync.listConsumedOperations()` if exposed
- `H2O.Studio.ingestion.diagnoseFullBundleV2ReadonlyProjection()` if exposed
- `chrome.storage.local.get('h2o:prm:cgx:fldrs:state:data:v1')` or localStorage fallback read
- `H2O.Studio.store.chats.get(chatId)` if exposed, recording only liveness booleans

The current source exposes safe read paths for tombstone list/get, folder/binding canonical reads,
recently deleted folders, chat-folder binding receipts, consumed-operation ledger summaries, and
`fullBundle.v2` read-only projection diagnostics. Execute/settlement journal details and F15
materialization rows may be visible only through summarized diagnostics; if not exposed, the diagnostic
must report `not-exposed` instead of guessing.

## DevTools Snippet

Paste this into Desktop Studio WebView DevTools. It is read-only and redacted/hash-only.

```js
(async () => {
  const SCHEMA = 'h2o.studio.operational5.orphan-binding-live-provenance-diagnostic.v1';
  const FOLDER_STATE_DATA_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';
  const TARGETS = [
    {
      rowToken: 'row:a950a44b859f',
      chatToken: 'r:650c3cb39924',
      folderToken: 'r:0226fecaed5b',
      expectedStrictFolderTombstone: false,
      expectedStrictFolderBindingTombstone: false
    },
    {
      rowToken: 'row:fdd2456fc8a2',
      chatToken: 'r:2f29d39a6c4f',
      folderToken: 'r:2d5469848470',
      expectedStrictFolderTombstone: false,
      expectedStrictFolderBindingTombstone: true
    }
  ];
  const safety = {
    readOnly: true,
    applyGatePassed: false,
    applyTruePassed: false,
    cleanupApplyCalled: false,
    mutationAttempted: false,
    noFolderDelete: true,
    noChatDelete: true,
    noBindingDelete: true,
    noTombstoneMutation: true,
    noLedgerMutation: true,
    noReceiptMutation: true,
    noImportExportMutation: true,
    noRenderMirrorWrite: true,
    noProductSyncReadyFlip: true,
    noWebdavCloudRelay: true,
    noChatSavingCas: true,
    noFallback: true
  };
  function clean(value) { return value == null ? '' : String(value); }
  function safeObject(value) { return value && typeof value === 'object' ? value : {}; }
  function safeArray(value) { return Array.isArray(value) ? value : []; }
  function parseJsonObject(value) {
    if (!value) return {};
    if (typeof value === 'object') return safeObject(value);
    try { return safeObject(JSON.parse(String(value))); } catch (_) { return {}; }
  }
  function stableStringify(value) {
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
    }
    return JSON.stringify(value);
  }
  async function sha256Hex(value) {
    const text = String(value == null ? '' : value);
    if (globalThis.crypto && crypto.subtle && typeof TextEncoder !== 'undefined') {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }
  async function redactionToken(raw) {
    try { return 'r:' + (await sha256Hex(clean(raw))).slice(0, 12); } catch (_) { return 'r:redacted'; }
  }
  async function summaryHash(value) {
    return 'sha256:' + (await sha256Hex(stableStringify(value)));
  }
  function folderIdOf(row) {
    return clean(row && (row.folderId || row.folder_id || row.id || row.localId || row.local_id));
  }
  function chatIdOf(row) {
    return clean(row && (row.chatId || row.chat_id || row.conversationId || row.conversation_id));
  }
  function folderRecordId(folderId) {
    return 'folder:' + encodeURIComponent(folderId);
  }
  function bindingRecordId(chatId, folderId) {
    return 'folderBinding:' + encodeURIComponent(chatId) + ':' + encodeURIComponent(folderId);
  }
  function tombstoneRecordId(row) {
    return clean(row && (row.recordId || row.record_id || row.id));
  }
  function tombstoneRestored(row) {
    return !!clean(row && (row.restoredAt || row.restored_at));
  }
  function tombstoneMeta(row) {
    return parseJsonObject(row && (row.meta || row.metaJson || row.meta_json));
  }
  function folderIdFromFolderTombstone(row) {
    const meta = tombstoneMeta(row);
    const recordId = tombstoneRecordId(row);
    return clean(meta.folderId ||
      (meta.recoverySnapshot && meta.recoverySnapshot.folder && (meta.recoverySnapshot.folder.id || meta.recoverySnapshot.folder.folderId)) ||
      (recordId.indexOf('folder:') === 0 ? decodeURIComponent(recordId.slice('folder:'.length)) : ''));
  }
  function looseFolderBindingMetaMatch(row, chatId, folderId) {
    const meta = tombstoneMeta(row);
    const recordId = tombstoneRecordId(row);
    return recordId === bindingRecordId(chatId, folderId) ||
      (clean(meta.chatId) === chatId && clean(meta.folderId || meta.oldFolderId || meta.newFolderId) === folderId);
  }
  function receiptMatches(receipt, chatId, folderId) {
    const values = [
      receipt && receipt.beforeFolderId,
      receipt && receipt.expectedCurrentFolderId,
      receipt && receipt.targetFolderId,
      receipt && receipt.afterFolderId,
      receipt && receipt.folderId
    ].map(clean);
    return clean(receipt && (receipt.chatId || receipt.conversationId)) === chatId && values.includes(folderId);
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
  function consumedRelated(row, chatToken, folderToken) {
    const text = stableStringify(row || {});
    return text.includes(chatToken) || text.includes(folderToken);
  }

  const folders = globalThis.H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.folders;
  const chats = globalThis.H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.chats;
  const tombstones = globalThis.H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.tombstones;
  const tombstoneReviews = globalThis.H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.tombstoneReviews;
  const ingestion = globalThis.H2O && H2O.Studio && H2O.Studio.ingestion;
  const desktopSync = globalThis.H2O && H2O.Desktop && H2O.Desktop.Sync;

  if (!folders || typeof folders.listCanonicalChatFolderBindings !== 'function') {
    throw new Error('canonical folder binding read API unavailable');
  }

  const canonicalFolders = typeof folders.getAll === 'function' ? safeArray(await folders.getAll()) : [];
  const canonicalBindings = safeArray(await folders.listCanonicalChatFolderBindings());
  const canonicalFolderIds = new Set(canonicalFolders.map(folderIdOf).filter(Boolean));
  const rawDanglingRows = canonicalBindings.filter((row) => {
    const chatId = chatIdOf(row);
    const folderId = folderIdOf(row);
    return chatId && folderId && !canonicalFolderIds.has(folderId);
  });

  const recentlyDeleted = folders && typeof folders.listRecentlyDeletedFolders === 'function'
    ? safeObject(await folders.listRecentlyDeletedFolders({ limit: 1000 }).catch(() => ({})))
    : {};
  const foldersDiag = folders && typeof folders.diagnose === 'function' ? safeObject(folders.diagnose()) : {};
  const folderTombstones = tombstones && typeof tombstones.list === 'function'
    ? safeArray(await tombstones.list({ recordKind: 'folder', includeRestored: true, limit: 1000 }).catch(() => []))
    : [];
  const folderBindingTombstones = tombstones && typeof tombstones.list === 'function'
    ? safeArray(await tombstones.list({ recordKind: 'folderBinding', includeRestored: true, limit: 1000 }).catch(() => []))
    : [];
  const receipts = tombstoneReviews && typeof tombstoneReviews.listChatFolderBindingReceipts === 'function'
    ? safeArray(await tombstoneReviews.listChatFolderBindingReceipts({ limit: 1000 }).catch(() => []))
    : [];
  const consumed = desktopSync && typeof desktopSync.listConsumedOperations === 'function'
    ? safeObject(await desktopSync.listConsumedOperations().catch(() => ({})))
    : {};
  const fullBundleProjection = ingestion && typeof ingestion.diagnoseFullBundleV2ReadonlyProjection === 'function'
    ? safeObject(await ingestion.diagnoseFullBundleV2ReadonlyProjection().catch(() => ({})))
    : {};
  const renderMirror = safeObject(await readChromeStorageKey(FOLDER_STATE_DATA_KEY));

  const rowContexts = [];
  for (const row of rawDanglingRows) {
    const chatId = chatIdOf(row);
    const folderId = folderIdOf(row);
    const chatToken = await redactionToken(chatId);
    const folderToken = await redactionToken(folderId);
    const target = TARGETS.find((t) => t.chatToken === chatToken && t.folderToken === folderToken) || null;
    if (!target) continue;

    const exactFolderRecordId = folderRecordId(folderId);
    const exactBindingRecordId = bindingRecordId(chatId, folderId);
    const strictFolderTombstone = tombstones && typeof tombstones.getTombstone === 'function'
      ? await tombstones.getTombstone('folder', exactFolderRecordId).catch(() => null)
      : null;
    const strictBindingTombstone = tombstones && typeof tombstones.getTombstone === 'function'
      ? await tombstones.getTombstone('folderBinding', exactBindingRecordId).catch(() => null)
      : null;

    const folderTombstoneContext = folderTombstones.filter((t) => folderIdFromFolderTombstone(t) === folderId);
    const activeFolderTombstoneContext = folderTombstoneContext.filter((t) => !tombstoneRestored(t));
    const restoredFolderTombstoneContext = folderTombstoneContext.filter(tombstoneRestored);
    const recoverySnapshotContext = folderTombstoneContext.filter((t) => {
      const meta = tombstoneMeta(t);
      return !!(meta.recoverySnapshot && meta.recoverySnapshot.folder);
    });
    const looseBindingContext = folderBindingTombstones.filter((t) => looseFolderBindingMetaMatch(t, chatId, folderId));
    const strictBindingContext = folderBindingTombstones.filter((t) => tombstoneRecordId(t) === exactBindingRecordId && !tombstoneRestored(t));
    const receiptContext = receipts.filter((r) => receiptMatches(r, chatId, folderId));
    const perChatRows = typeof folders.listCanonicalChatFolderBindingsForChat === 'function'
      ? safeArray(await folders.listCanonicalChatFolderBindingsForChat(chatId).catch(() => []))
      : [];
    const chatLive = !!(chats && typeof chats.get === 'function' ? await chats.get(chatId).catch(() => null) : null);
    const mirrorFolderPresent = safeArray(renderMirror.folders).some((f) => folderIdOf(f) === folderId);
    const mirrorItemBucketPresent = !!safeObject(renderMirror.items)[folderId];
    const consumedRows = safeArray(consumed.rows).filter((r) => consumedRelated(r, chatToken, folderToken));
    const fullBundleBinding = safeObject(fullBundleProjection.canonicalChatFolderBindingProjection);
    const fullBundleDiagnostics = safeObject(fullBundleBinding.diagnostics);

    let route = 'A.keep-documented-debt';
    if (strictFolderTombstone && strictBindingTombstone) route = 'C.manual-approval-cleanup-override-or-reviewed-cleanup';
    else if (chatLive && recoverySnapshotContext.length > 0) route = 'B.restore-missing-folder-review';
    else if (!chatLive && !strictFolderTombstone && !strictBindingTombstone) route = 'A.keep-documented-debt-or-E.no-op-manual-reject';
    else if (chatLive && strictBindingTombstone && !strictFolderTombstone) route = 'D.create-new-strict-evidence-receipt-or-B.restore-if-recovery-found';

    rowContexts.push({
      rowToken: target.rowToken,
      chatToken,
      folderToken,
      targetMatched: true,
      strict: {
        folderTombstonePresent: !!strictFolderTombstone,
        folderBindingTombstonePresent: !!strictBindingTombstone,
        exactFolderRecordIdToken: await redactionToken(exactFolderRecordId),
        exactFolderBindingRecordIdToken: await redactionToken(exactBindingRecordId),
        cleanupEligibleUnderCurrentRules: !!strictFolderTombstone && !!strictBindingTombstone
      },
      chat: {
        livenessChecked: !!(chats && typeof chats.get === 'function'),
        live: chatLive,
        rawTitleLogged: false,
        rawContentLogged: false
      },
      folder: {
        canonicalFolderPresent: false,
        recentlyDeletedChecked: !!recentlyDeleted.rows,
        hiddenFolderCheck: 'not-exposed',
        strictActiveFolderTombstoneCount: strictFolderTombstone ? 1 : 0,
        activeFolderTombstoneContextCount: activeFolderTombstoneContext.length,
        restoredFolderTombstoneContextCount: restoredFolderTombstoneContext.length,
        recoverySnapshotContextCount: recoverySnapshotContext.length,
        renderMirrorFolderPresent: mirrorFolderPresent,
        renderMirrorItemBucketPresent: mirrorItemBucketPresent
      },
      binding: {
        perChatCanonicalBindingCount: perChatRows.length,
        strictActiveFolderBindingTombstoneCount: strictBindingContext.length,
        looseFolderBindingContextCount: looseBindingContext.length,
        reviewedReceiptContextCount: receiptContext.length,
        consumedLedgerRelatedCount: consumedRows.length,
        f15MaterializationRecordExposure: foldersDiag.lastF15SettledBindingRestartConvergence ? 'restart-convergence-summary-only' : 'not-exposed',
        executeSettlementJournalExposure: 'not-exposed-unless-source-adds-readonly-summarizer'
      },
      fullBundle: {
        diagnosticAvailable: !!fullBundleProjection.schema,
        missingFolderBindingCount: Number(fullBundleDiagnostics.missingFolderBindingCount) || 0,
        activeDanglingFolderBindingCount: Number(fullBundleDiagnostics.activeDanglingFolderBindingCount) || 0,
        fallbackUnfiledBindingCount: Number(fullBundleDiagnostics.fallbackUnfiledBindingCount) || 0
      },
      broadContextAuthoritativeForCleanup: false,
      recommendedRoute: route,
      cleanupApplyApproved: false
    });
  }

  const output = {
    schema: SCHEMA,
    phase: 'Operational.5-orphan-binding-live-provenance-diagnostic',
    mode: 'manual-devtools-read-only',
    readOnly: true,
    safety,
    targetRowsTracked: TARGETS.map((t) => ({ rowToken: t.rowToken, chatToken: t.chatToken, folderToken: t.folderToken })),
    targetRowsMatched: rowContexts.length,
    rawCanonicalBindingCount: canonicalBindings.length,
    rawDanglingBindingCount: rawDanglingRows.length,
    rowContexts,
    rowContextHash: await summaryHash(rowContexts.map((r) => ({
      rowToken: r.rowToken,
      strict: r.strict,
      chatLive: r.chat.live,
      recommendedRoute: r.recommendedRoute
    }))),
    strictProofRequirementsUnchanged: true,
    broadMatchingAcceptedAsCleanupProof: false,
    rawIdsLogged: false,
    rawNamesLogged: false,
    rawChatTitlesLogged: false,
    rawContentLogged: false,
    cleanupApplyApproved: false,
    productSyncReady: false,
    webdavCloudRelay: 'blocked',
    fullBundleV3: 'not-started',
    chatSavingWebdavCloudArchiveCas: 'blocked',
    nextAction: 'paste-output-into-evidence-slice-before-any-cleanup-or-restore-decision'
  };
  console.log(JSON.stringify(output, null, 2));
  return output;
})().catch((error) => {
  const failure = {
    schema: 'h2o.studio.operational5.orphan-binding-live-provenance-diagnostic.failure.v1',
    prefix: 'operational5-orphan-binding-live-provenance-diagnostic-failed',
    readOnly: true,
    applyGatePassed: false,
    applyTruePassed: false,
    cleanupApplyCalled: false,
    mutationAttempted: false,
    productSyncReady: false,
    webdavCloudRelay: 'blocked',
    fullBundleV3: 'not-started',
    chatSavingWebdavCloudArchiveCas: 'blocked',
    error: String((error && error.message) || error)
  };
  console.error('operational5-orphan-binding-live-provenance-diagnostic-failed', failure);
  return failure;
});
```

## Output Contract

Expected JSON fields:

- `schema:"h2o.studio.operational5.orphan-binding-live-provenance-diagnostic.v1"`
- `readOnly:true`
- `targetRowsTracked` with only row/chat/folder tokens
- `targetRowsMatched`
- `rawCanonicalBindingCount`
- `rawDanglingBindingCount`
- `rowContexts[]`
  - `rowToken`
  - `chatToken`
  - `folderToken`
  - `strict.folderTombstonePresent`
  - `strict.folderBindingTombstonePresent`
  - `strict.cleanupEligibleUnderCurrentRules`
  - `chat.live`
  - `folder.recoverySnapshotContextCount`
  - `folder.restoredFolderTombstoneContextCount`
  - `binding.reviewedReceiptContextCount`
  - `binding.consumedLedgerRelatedCount`
  - `binding.f15MaterializationRecordExposure`
  - `binding.executeSettlementJournalExposure`
  - `fullBundle.missingFolderBindingCount`
  - `fullBundle.activeDanglingFolderBindingCount`
  - `broadContextAuthoritativeForCleanup:false`
  - `recommendedRoute`
- `rowContextHash`
- `strictProofRequirementsUnchanged:true`
- `broadMatchingAcceptedAsCleanupProof:false`
- `rawIdsLogged:false`
- `rawNamesLogged:false`
- `rawChatTitlesLogged:false`
- `rawContentLogged:false`
- `cleanupApplyApproved:false`
- `productSyncReady:false`
- `webdavCloudRelay:"blocked"`
- `fullBundleV3:"not-started"`
- `chatSavingWebdavCloudArchiveCas:"blocked"`

## Pass / Decision Criteria

The live diagnostic does not by itself approve cleanup. It decides the next route:

- **A. keep documented debt** when no strict evidence or recovery path appears.
- **B. restore missing folder from legitimate recovery snapshot** only if recovery snapshot context is
  present and a separate reviewed restore slice approves it.
- **C. manual-approval cleanup override** only as a separately reviewed design if strict folder evidence
  cannot exist but the operator chooses a new override lane.
- **D. create a new strict evidence receipt** only as a separate reviewed receipt-minting design.
- **E. no-op/manual reject** when the operator rejects cleanup or restore.

Cleanup apply remains blocked unless exact active folder tombstone and exact active folderBinding
tombstone evidence exist or a later, separately approved manual-override contract is created. Broad
context remains non-authoritative.

## Boundaries

- No cleanup apply.
- No product source edited.
- No folder/chat/binding/tombstone/ledger/receipt/import/export/render-mirror mutation.
- No strict tombstone verification weakening.
- No broad text/meta/receipt matching accepted as cleanup proof.
- No `productSyncReady` flip.
- No WebDAV/cloud/relay/`fullBundle.v3`.
- No Chat Saving WebDAV/cloud/archive CAS.
- No fallback.
- Durable/hash gates, conflict runtime, `requireContext`, restart convergence, reviewed request path,
  and render-mirror no-write boundary remain unchanged.
