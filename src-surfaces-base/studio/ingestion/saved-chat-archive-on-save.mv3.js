/* H2O Studio — Saved Chat Archive Delivery Companion on Save (Chrome / MV3)
 *
 * Phase E.1.1 (per the E.1.0a trigger amendment): a flag-gated, default-OFF
 * companion that reacts to the existing library-index update signal, detects
 * newly saved + snapshot-backed rows, and delivers one metadata-only archive
 * request per row through the proven D.3C delivery API.
 *
 * Why a listener and not a Save-to-Folder hook: in Chrome Studio the
 * Save-to-Folder facade returns native-context-required (it never succeeds),
 * and the Library Actions Core (S0F0j) is byte-locked. Real saves arrive
 * asynchronously via evt:h2o:library-index:updated / cross-surface-sync, whose
 * detail carries only summary metadata, so this module reads
 * H2O.LibraryIndex.getAll() itself and dedupes per chatId|snapshotId.
 *
 * Boundaries: Chrome intent-only; Desktop authoritative. Deliver-only — never
 * enqueue/materialize/package/CAS/store/SQLite/contentHash, no auto-
 * materialization, no sync/WebDAV/cloud, no native messaging, no localhost, no
 * polling/setInterval/watcher/MutationObserver. The listener is a one-shot
 * debounce on an event the index already emits; it is inert while the flag is
 * OFF. No UI, no app-wide buttons. It never blocks Library rendering.
 *
 * Public API (H2O.Studio.ingestion):
 *   maybeDeliverSavedChatArchiveOnSaveToFolderV1(context)
 *   diagnoseSavedChatArchiveOnSaveToFolderV1()
 */
(function (global) {
  'use strict';

  /* ── Desktop bail — this is Chrome / MV3 only ─────────────────────── */
  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* swallow */ }
    return false;
  }
  if (detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.ingestion = H2O.Studio.ingestion || {};
  if (H2O.Studio.ingestion.__archiveOnSaveInstalled) return;

  var PHASE = 'E.1.1';
  var DIAG_SCHEMA = 'h2o.studio.archive-on-save-diagnostics.v1';
  var FLAG_KEY = 'archive.deliverOnSaveToFolder';
  var EVENT_INDEX_UPDATED = 'evt:h2o:library-index:updated';
  var EVENT_CROSS_SURFACE = 'evt:h2o:library:cross-surface-sync';
  var DEDUPE_STORAGE_KEY = 'h2o:studio:archive-on-save:delivered:v1';
  var SOURCE_SURFACE = 'chrome-studio';
  var INTENT_KIND = 'save-to-folder';
  var MAX_PER_EVENT = 5;
  var DEBOUNCE_MS = 1500;

  var state = {
    listenersInstalled: false,
    debounceTimer: null,
    lastScanAt: null,
    lastReason: null,
    lastDelivered: 0,
  };
  /* In-memory mirror of the persisted delivered set (fallback when
   * chrome.storage.local is unavailable, e.g. in a VM/test context). */
  var deliveredCache = null;

  /* ── Small helpers ────────────────────────────────────────────────── */
  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }
  function asArray(value) {
    if (!Array.isArray(value)) return [];
    var out = [];
    value.forEach(function (item) {
      var text = cleanString(item);
      if (text) out.push(text);
    });
    return out;
  }
  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }
  function getLocationHref() {
    try { if (global.location && typeof global.location.href === 'string') return global.location.href; }
    catch (_) { /* ignore */ }
    return '';
  }

  function flagEnabled() {
    try {
      var flags = H2O.flags;
      if (flags && typeof flags.get === 'function') return flags.get(FLAG_KEY, false) === true;
    } catch (_) { /* fall through */ }
    return false;
  }

  function getDeliverApi() {
    var fn = H2O.Studio && H2O.Studio.ingestion && H2O.Studio.ingestion.deliverSavedChatArchiveRequestV1;
    return typeof fn === 'function' ? fn : null;
  }

  function getLibraryIndexRows() {
    try {
      var idx = H2O.LibraryIndex || (H2O.Library && H2O.Library.Index) || null;
      if (!idx || typeof idx.getAll !== 'function') return [];
      var rows = idx.getAll();
      return Array.isArray(rows) ? rows : [];
    } catch (_) { return []; }
  }

  /* ── Candidate selection (saved + snapshot-backed, not link-only) ─── */
  function isSavedRow(row) {
    if (!isObject(row)) return false;
    if (row.isSaved === true) return true;
    var dv = cleanString(row.displayView).toLowerCase();
    var bk = cleanString(row.badgeKind).toLowerCase();
    return dv === 'saved' || bk === 'saved';
  }
  function isLinkOnlyRow(row) {
    if (row.isLinked === true || row.isImported === true) return true;
    var dv = cleanString(row.displayView).toLowerCase();
    return dv === 'link' || dv === 'linked' || dv === 'imported';
  }
  function isExcludedRow(row) {
    return row.archived === true || row.isDeleted === true;
  }
  function deriveSnapshotId(row) {
    return cleanString(row.snapshotId) || cleanString(row.lastSnapshotId) || cleanString(row.latestSnapshotId);
  }
  function deriveNativeConversationId(row) {
    var candidates = [row.href, row.normalizedHref, row.linkSourceHref];
    for (var i = 0; i < candidates.length; i += 1) {
      var text = cleanString(candidates[i]);
      var match = text.match(/\/c\/([A-Za-z0-9._:-]+)/);
      if (match && match[1]) return match[1];
    }
    return null;
  }
  /* Saved, not link-only/Add-to-Library, not archived/deleted, has a chat id.
   * Snapshot presence is checked separately so a missing snapshotId can be
   * reported as pending rather than mis-delivered. */
  function isSavedSnapshotBackedRow(row) {
    return isSavedRow(row) && !isLinkOnlyRow(row) && !isExcludedRow(row) && !!cleanString(row.chatId);
  }

  /* ── Persistent dedupe (chrome.storage.local, in-memory fallback) ─── */
  function getChromeStorageLocal() {
    try { return global.chrome && global.chrome.storage && global.chrome.storage.local; }
    catch (_) { return null; }
  }
  function readDeliveredSet() {
    return new Promise(function (resolve) {
      if (deliveredCache && isObject(deliveredCache)) { resolve(deliveredCache); return; }
      var storage = getChromeStorageLocal();
      if (!storage || typeof storage.get !== 'function') { deliveredCache = {}; resolve(deliveredCache); return; }
      try {
        storage.get([DEDUPE_STORAGE_KEY], function (items) {
          var value = items && items[DEDUPE_STORAGE_KEY];
          deliveredCache = isObject(value) ? value : {};
          resolve(deliveredCache);
        });
      } catch (_) { deliveredCache = {}; resolve(deliveredCache); }
    });
  }
  async function isDelivered(dedupeRowKey) {
    var set = await readDeliveredSet();
    return !!set[dedupeRowKey];
  }
  async function markDelivered(dedupeRowKey) {
    var set = await readDeliveredSet();
    if (set[dedupeRowKey]) return;
    set[dedupeRowKey] = nowIso();
    deliveredCache = set;
    var storage = getChromeStorageLocal();
    if (storage && typeof storage.set === 'function') {
      try {
        var payload = {};
        payload[DEDUPE_STORAGE_KEY] = set;
        storage.set(payload, function () { /* best-effort */ });
      } catch (_) { /* ignore */ }
    }
  }
  function rowDedupeKey(chatId, snapshotId) {
    return chatId + '|' + snapshotId;
  }

  /* ── Request construction (metadata-only) ─────────────────────────── */
  function buildDeliverOptionsFromRow(row) {
    var snapshotId = deriveSnapshotId(row);
    var messageCount = (typeof row.messageCount === 'number' && isFinite(row.messageCount)) ? row.messageCount : undefined;
    return {
      confirmDelivery: true,
      builderOptions: {
        source: {
          surface: SOURCE_SURFACE,
          href: cleanString(row.href) || cleanString(row.normalizedHref) || getLocationHref() || null,
          title: cleanString(row.title) || null,
          nativeConversationId: deriveNativeConversationId(row),
          capturedAt: nowIso(),
          messageCount: messageCount,
        },
        intent: {
          kind: INTENT_KIND,
          target: {
            folderIdAtRequest: cleanString(row.folderId) || null,
            categoryIdAtRequest: cleanString(row.categoryId) || null,
            projectIdAtRequest: cleanString(row.projectId) || null,
            labelIdsAtRequest: asArray(row.labels),
            tagIdsAtRequest: asArray(row.tags),
          },
        },
        desktopResolution: {
          studioChatId: cleanString(row.chatId),
          snapshotId: snapshotId,
          requireExistingDesktopSnapshot: true,
        },
      },
    };
  }

  /* Quiet product-language status (not shown as UI in E.1.1; available for a
   * future inline surface). No raw requestId/dedupeKey in product copy. */
  var PRODUCT_MESSAGES = {
    delivered: 'Archive request sent to Desktop',
    'delivered-awaiting-desktop': 'Waiting for Desktop to process',
    'queued-on-desktop': 'Saved to Desktop archive queue',
    'already-queued-duplicate': 'Already queued on Desktop',
    'needs-desktop-snapshot': 'Desktop snapshot needed',
    'rejected-by-desktop': 'Archive request rejected',
    'db-unavailable': 'Desktop database unavailable',
    'archive-request-folder-not-connected': 'Connect archive folder in Settings',
    'archive-request-folder-permission-denied': 'Archive folder permission needed',
    'missing-snapshot-id': 'Archive request pending Desktop snapshot',
  };
  function productMessageFor(status) {
    return PRODUCT_MESSAGES[status] || '';
  }

  function makeOnSaveResult(status, extra) {
    var base = {
      ok: status === 'delivered',
      status: status,
      productMessage: productMessageFor(status),
      chatId: null,
      snapshotId: null,
      delivered: status === 'delivered',
    };
    return Object.assign(base, extra || {});
  }

  /* ── Deliver one saved snapshot-backed row ────────────────────────── */
  async function maybeDeliverSavedChatArchiveOnSaveToFolderV1(context) {
    if (detectTauri()) return makeOnSaveResult('skipped-desktop');
    if (!flagEnabled()) return makeOnSaveResult('skipped-flag-off');

    var deliver = getDeliverApi();
    if (!deliver) return makeOnSaveResult('delivery-unavailable');

    var input = isObject(context) ? context : {};
    var row = isObject(input.row) ? input.row : input;
    if (!isSavedSnapshotBackedRow(row)) return makeOnSaveResult('skipped-not-saved-row');

    var chatId = cleanString(row.chatId);
    var snapshotId = deriveSnapshotId(row);
    if (!snapshotId) {
      return makeOnSaveResult('missing-snapshot-id', { chatId: chatId, snapshotId: null });
    }

    var key = rowDedupeKey(chatId, snapshotId);
    if (await isDelivered(key)) {
      return makeOnSaveResult('already-delivered-locally', { chatId: chatId, snapshotId: snapshotId, delivered: false, ok: false });
    }

    var result;
    try {
      result = await deliver(buildDeliverOptionsFromRow(row));
    } catch (e) {
      /* Best-effort: never block Library rendering or saving. */
      return makeOnSaveResult('delivery-error', { chatId: chatId, snapshotId: snapshotId, delivered: false, ok: false, error: cleanString(e && e.message) });
    }

    var status = cleanString(result && result.status) || 'unknown';
    if (status === 'delivered') await markDelivered(key);

    return makeOnSaveResult(status === 'delivered' ? 'delivered' : status, {
      chatId: chatId,
      snapshotId: snapshotId,
      delivered: status === 'delivered',
      ok: status === 'delivered',
      requestId: result && result.requestId || null,
      dedupeKey: result && result.dedupeKey || null,
    });
  }

  /* ── Scan the current index and deliver newly saved rows ──────────── */
  async function scanAndDeliver(reason) {
    if (!flagEnabled()) return { status: 'skipped-flag-off', delivered: 0 };
    var rows = getLibraryIndexRows();
    var delivered = 0;
    var skippedMissingSnapshot = 0;
    var considered = 0;
    for (var i = 0; i < rows.length; i += 1) {
      if (delivered >= MAX_PER_EVENT) break;
      var row = rows[i];
      if (!isSavedSnapshotBackedRow(row)) continue;
      considered += 1;
      var res = await maybeDeliverSavedChatArchiveOnSaveToFolderV1({ row: row, reason: reason });
      if (res.status === 'delivered') delivered += 1;
      else if (res.status === 'missing-snapshot-id') skippedMissingSnapshot += 1;
    }
    state.lastScanAt = nowIso();
    state.lastReason = cleanString(reason);
    state.lastDelivered = delivered;
    return { status: 'scanned', considered: considered, delivered: delivered, skippedMissingSnapshot: skippedMissingSnapshot };
  }

  /* ── Listener (one-shot debounce; inert while flag is OFF) ─────────── */
  function onIndexEvent(reason) {
    if (!flagEnabled()) return;
    if (state.debounceTimer) { try { clearTimeout(state.debounceTimer); } catch (_) { /* ignore */ } }
    state.debounceTimer = setTimeout(function () {
      state.debounceTimer = null;
      scanAndDeliver(reason).catch(function () { /* best-effort */ });
    }, DEBOUNCE_MS);
  }
  function installListeners() {
    if (state.listenersInstalled) return;
    try {
      if (typeof global.addEventListener === 'function') {
        global.addEventListener(EVENT_INDEX_UPDATED, function () { onIndexEvent('library-index:updated'); });
        global.addEventListener(EVENT_CROSS_SURFACE, function () { onIndexEvent('cross-surface-sync'); });
        state.listenersInstalled = true;
      }
    } catch (_) { /* ignore */ }
  }

  /* ── Diagnostics (read-only) ──────────────────────────────────────── */
  function diagnoseSavedChatArchiveOnSaveToFolderV1() {
    return {
      schema: DIAG_SCHEMA,
      phase: PHASE,
      flagKey: FLAG_KEY,
      enabled: flagEnabled(),
      deliveryApiAvailable: !!getDeliverApi(),
      libraryIndexAvailable: !!(H2O.LibraryIndex && typeof H2O.LibraryIndex.getAll === 'function'),
      chromeStorageAvailable: !!getChromeStorageLocal(),
      eventIndexUpdated: EVENT_INDEX_UPDATED,
      eventCrossSurface: EVENT_CROSS_SURFACE,
      dedupeStorageKey: DEDUPE_STORAGE_KEY,
      maxDeliveriesPerEvent: MAX_PER_EVENT,
      debounceMs: DEBOUNCE_MS,
      listenersInstalled: state.listenersInstalled === true,
      lastScanAt: state.lastScanAt,
      lastReason: state.lastReason,
      lastDelivered: state.lastDelivered,
      automaticMaterialization: false,
      pollingEnabled: false,
      watcherEnabled: false,
    };
  }

  H2O.Studio.ingestion.maybeDeliverSavedChatArchiveOnSaveToFolderV1 = maybeDeliverSavedChatArchiveOnSaveToFolderV1;
  H2O.Studio.ingestion.diagnoseSavedChatArchiveOnSaveToFolderV1 = diagnoseSavedChatArchiveOnSaveToFolderV1;
  H2O.Studio.ingestion.__archiveOnSaveInstalled = true;

  installListeners();
})(typeof window !== 'undefined' ? window : globalThis);
