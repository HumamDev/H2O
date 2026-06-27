/* H2O Studio — Saved Chat Archive Status Badge (UI shell, Phase E.2.2)
 *
 * Renders one quiet inline archive status badge into a library row's existing
 * wbBadges container, using the E.2.1 pure status model
 * (computeSavedChatArchiveStatusV1) and the local delivered metadata accessor
 * (getSavedChatArchiveLocalDeliveryMetaV1). It is a UI shell only:
 *   - no receipt read-back, no "Check status" action, no buttons, no click handlers;
 *   - no delivery/enqueue/materialize/package/CAS/SQLite/Desktop calls;
 *   - no timers, no polling, no watcher, no MutationObserver;
 *   - never inspects transcript/messages/html/assets/contentHash/package body;
 *   - never writes storage and never mutates row data.
 *
 * renderRow() stays synchronous: status is computed from a synchronous flag +
 * a lazily-warmed local cache. On a cold cache the badge renders conservatively
 * (no false "archived"); a one-shot fire-and-forget read of the local delivered
 * metadata then refreshes the badge in place. Only meaningful, non-noisy states
 * render a badge; the quiet default (flag OFF / nothing delivered) shows none.
 *
 * Public API (H2O.Studio.ingestion):
 *   appendSavedChatArchiveStatusBadgeV1({ article, badgesEl, row, local?, diagnostics? })
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.ingestion = H2O.Studio.ingestion || {};
  if (H2O.Studio.ingestion.appendSavedChatArchiveStatusBadgeV1) return;

  var BADGE_CLASS = 'wbBadge wbBadge--archive-status';
  var BADGE_SELECTOR = '.wbBadge--archive-status';
  var BADGES_CONTAINER_CLASS = 'wbBadges';
  /* Only informative archive states render a badge; ready/archive-off/unknown
   * stay quiet so the default install and idle rows show nothing. */
  var SHOW_STATES = {
    'archived': true,
    'already-archived': true,
    'waiting-for-desktop': true,
    'archive-requested': true,
    'needs-desktop-snapshot': true,
    'failed': true,
  };

  /* Lazily-warmed synchronous cache of local delivered metadata by chatId|snapshotId. */
  var localCache = new Map();
  var warmSeen = new Object();

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }
  function ingestion() {
    return (H2O.Studio && H2O.Studio.ingestion) || {};
  }
  function doc() {
    try { return global.document || null; }
    catch (_) { return null; }
  }
  function deriveSnapshotId(row) {
    return cleanString(row.snapshotId) || cleanString(row.lastSnapshotId) || cleanString(row.latestSnapshotId);
  }
  function keyFor(row) {
    var chatId = cleanString(row && row.chatId);
    var snapshotId = deriveSnapshotId(row || {});
    return (chatId && snapshotId) ? (chatId + '|' + snapshotId) : null;
  }
  function flagEnabled() {
    try {
      var diag = ingestion().diagnoseSavedChatArchiveOnSaveToFolderV1;
      if (typeof diag === 'function') return diag().enabled === true;
    } catch (_) { /* conservative default below */ }
    return false;
  }

  function computeStatus(row, localOverride, diagOverride) {
    var compute = ingestion().computeSavedChatArchiveStatusV1;
    if (typeof compute !== 'function') return null;
    var key = keyFor(row);
    var local = isObject(localOverride)
      ? localOverride
      : (key && localCache.has(key) ? localCache.get(key) : { delivered: false, requestId: null, deliveredAt: null });
    var diagnostics = isObject(diagOverride)
      ? diagOverride
      : { enabled: flagEnabled(), folderConnected: true };
    try {
      return compute({ row: row, local: local, diagnostics: diagnostics, receipt: null });
    } catch (_) { return null; }
  }

  function resolveContainer(article, badgesEl, createIfMissing) {
    if (badgesEl && typeof badgesEl.appendChild === 'function') return badgesEl;
    if (article && typeof article.querySelector === 'function') {
      var found = article.querySelector('.' + BADGES_CONTAINER_CLASS);
      if (found) return found;
    }
    if (!createIfMissing) return null;
    var document = doc();
    if (!document || !article || typeof article.appendChild !== 'function') return null;
    var container = document.createElement('div');
    container.className = BADGES_CONTAINER_CLASS;
    article.appendChild(container);
    return container;
  }

  function renderInto(article, badgesEl, row, localOverride, diagOverride) {
    var status = computeStatus(row, localOverride, diagOverride);
    /* Remove any prior archive-status badge first (idempotent re-render). */
    var existingContainer = resolveContainer(article, badgesEl, false);
    if (existingContainer && typeof existingContainer.querySelector === 'function') {
      var prior = existingContainer.querySelector(BADGE_SELECTOR);
      if (prior && typeof prior.remove === 'function') prior.remove();
    }
    if (!status || !SHOW_STATES[status.state]) return;
    var container = resolveContainer(article, badgesEl, true);
    if (!container) return;
    var document = doc();
    if (!document) return;
    var span = document.createElement('span');
    span.className = BADGE_CLASS + ' wbBadge--archive-' + cleanString(status.severity || 'neutral');
    span.setAttribute('data-h2o-archive-status', cleanString(status.state));
    span.setAttribute('title', status.reason ? (status.label + ' — ' + status.reason) : status.label);
    span.textContent = status.label;
    container.appendChild(span);
  }

  /* One-shot, fire-and-forget warm of the local delivered cache for a row, then
   * a single in-place re-render. No timers; this is the continuation of one
   * read-only storage read. */
  function warmLocal(article, badgesEl, row) {
    var key = keyFor(row);
    if (!key || localCache.has(key) || warmSeen[key]) return;
    warmSeen[key] = true;
    var fn = ingestion().getSavedChatArchiveLocalDeliveryMetaV1;
    if (typeof fn !== 'function') return;
    try {
      Promise.resolve(fn(row)).then(function (meta) {
        localCache.set(key, {
          delivered: !!(meta && meta.delivered),
          requestId: (meta && meta.requestId) || null,
          deliveredAt: (meta && meta.deliveredAt) || null,
        });
        renderInto(article, badgesEl, row);
      }).catch(function () { delete warmSeen[key]; });
    } catch (_) { delete warmSeen[key]; }
  }

  function appendSavedChatArchiveStatusBadgeV1(options) {
    var opts = isObject(options) ? options : {};
    var row = isObject(opts.row) ? opts.row : null;
    if (!row) return;
    renderInto(opts.article || null, opts.badgesEl || null, row, opts.local, opts.diagnostics);
    /* Only warm from the live cache path (not when caller supplied local). */
    if (!isObject(opts.local)) warmLocal(opts.article || null, opts.badgesEl || null, row);
  }

  H2O.Studio.ingestion.appendSavedChatArchiveStatusBadgeV1 = appendSavedChatArchiveStatusBadgeV1;
})(typeof window !== 'undefined' ? window : globalThis);
