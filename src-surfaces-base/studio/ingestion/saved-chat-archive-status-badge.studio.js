/* H2O Studio — Saved Chat Archive Status Badge (receipt check, Phase E.2.3)
 *
 * Renders one quiet inline archive status badge into a library row's existing
 * wbBadges container, using the E.2.1 pure status model
 * (computeSavedChatArchiveStatusV1) and the local delivered metadata accessor
 * (getSavedChatArchiveLocalDeliveryMetaV1). If the model says the row can
 * check status and local delivery metadata includes a requestId, the badge
 * becomes the explicit per-row read-back gesture:
 *   - reads only a Desktop receipt by requestId;
 *   - recomputes status through computeSavedChatArchiveStatusV1;
 *   - updates only the same badge in place;
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

  function resolveLocal(row, localOverride) {
    if (isObject(localOverride)) return localOverride;
    var key = keyFor(row);
    return (key && localCache.has(key)) ? localCache.get(key) : { delivered: false, requestId: null, deliveredAt: null };
  }
  function resolveDiag(diagOverride) {
    return isObject(diagOverride) ? diagOverride : { enabled: flagEnabled(), folderConnected: true };
  }
  function computeStatusWith(row, local, diagnostics, receipt) {
    var compute = ingestion().computeSavedChatArchiveStatusV1;
    if (typeof compute !== 'function') return null;
    try {
      return compute({ row: row, local: local, diagnostics: diagnostics, receipt: receipt || null });
    } catch (_) { return null; }
  }
  function shouldShowStatus(status) {
    if (!status || !status.state) return false;
    if (SHOW_STATES[status.state]) return true;
    return status.state === 'unknown-check-status' && status.canCheckStatus === true && cleanString(status.requestId);
  }
  function localRequestId(local) {
    return cleanString(local && local.requestId);
  }
  function interactiveRequestId(status, local) {
    var requestId = localRequestId(local);
    return (status && status.canCheckStatus === true && requestId) ? requestId : '';
  }
  function readReceipt(requestId) {
    var fn = ingestion().readSavedChatArchiveRequestReceiptV1;
    if (typeof fn !== 'function') return Promise.reject(new Error('receipt read-back unavailable'));
    return Promise.resolve(fn({ requestId: requestId }));
  }
  function titleFor(status, canCheck) {
    var label = cleanString(status && status.label) || 'Archive status';
    var reason = cleanString(status && status.reason);
    var title = reason ? (label + ' — ' + reason) : label;
    if (canCheck) title += ' Click or press Enter to check archive status.';
    return title;
  }
  function stopRowEvent(event) {
    if (!event) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
  }
  function clearInteractiveAttrs(el) {
    if (!el || typeof el.removeAttribute !== 'function') return;
    el.removeAttribute('role');
    el.removeAttribute('tabindex');
    el.removeAttribute('aria-label');
    el.removeAttribute('aria-busy');
  }
  function applyStatusToBadge(span, status, row, local, diagnostics) {
    var requestId = interactiveRequestId(status, local);
    var canCheck = !!requestId;
    span.className = BADGE_CLASS + ' wbBadge--archive-' + cleanString(status.severity || 'neutral');
    span.setAttribute('data-h2o-archive-status', cleanString(status.state));
    if (requestId) span.setAttribute('data-h2o-archive-request-id', requestId);
    else if (typeof span.removeAttribute === 'function') span.removeAttribute('data-h2o-archive-request-id');
    span.setAttribute('title', titleFor(status, canCheck));
    span.textContent = status.label;
    if (!canCheck) {
      clearInteractiveAttrs(span);
      return;
    }
    span.setAttribute('role', 'button');
    span.setAttribute('tabindex', '0');
    span.setAttribute('aria-label', 'Check archive status for this saved chat');
    if (span.__h2oArchiveStatusCheckBound) return;
    span.__h2oArchiveStatusCheckBound = true;
    var check = function (event) {
      stopRowEvent(event);
      if (span.__h2oArchiveCheckInFlight) return;
      var currentRequestId = span.getAttribute('data-h2o-archive-request-id');
      if (!currentRequestId) return;
      span.__h2oArchiveCheckInFlight = true;
      span.setAttribute('aria-busy', 'true');
      readReceipt(currentRequestId).then(function (receipt) {
        var nextStatus = computeStatusWith(row, local, diagnostics, receipt);
        if (shouldShowStatus(nextStatus)) applyStatusToBadge(span, nextStatus, row, local, diagnostics);
      }).catch(function () {
        var failedStatus = computeStatusWith(row, local, diagnostics, { status: 'receipt-read-error', requestId: currentRequestId });
        if (shouldShowStatus(failedStatus)) applyStatusToBadge(span, failedStatus, row, local, diagnostics);
      }).finally(function () {
        span.__h2oArchiveCheckInFlight = false;
        if (typeof span.removeAttribute === 'function') span.removeAttribute('aria-busy');
      });
    };
    span.addEventListener('click', check);
    span.addEventListener('keydown', function (event) {
      var key = event && event.key;
      if (key === 'Enter' || key === ' ') check(event);
    });
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
    var local = resolveLocal(row, localOverride);
    var diagnostics = resolveDiag(diagOverride);
    var status = computeStatusWith(row, local, diagnostics, null);
    /* Remove any prior archive-status badge first (idempotent re-render). */
    var existingContainer = resolveContainer(article, badgesEl, false);
    if (existingContainer && typeof existingContainer.querySelector === 'function') {
      var prior = existingContainer.querySelector(BADGE_SELECTOR);
      if (prior && typeof prior.remove === 'function') prior.remove();
    }
    if (!shouldShowStatus(status)) return;
    var container = resolveContainer(article, badgesEl, true);
    if (!container) return;
    var document = doc();
    if (!document) return;
    var span = document.createElement('span');
    applyStatusToBadge(span, status, row, local, diagnostics);
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
