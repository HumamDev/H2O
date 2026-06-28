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
  var fullRowCache = new Map();
  var warmSeen = new Object();
  var hydrateSeen = new Object();
  var diagnosticsState = {
    calls: 0,
    hydrationAttempts: 0,
    hydrationResolved: 0,
    hydrationMisses: 0,
    rendered: 0,
    staleArticleRetargeted: 0,
    staleArticleMisses: 0,
    connectedRendered: 0,
    preservedExisting: 0,
    fullRowCacheHits: 0,
    fullRowCacheWrites: 0,
    removed: 0,
    skippedQuietThinPreserved: 0,
    skippedQuiet: 0,
    skippedNoArticle: 0,
    skippedNoIdentifiers: 0,
    lastState: null,
    lastReason: '',
    lastError: '',
    lastArticleConnected: false,
    lastRetargeted: false,
  };

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
  function attr(el, name) {
    if (!el) return '';
    try {
      if (typeof el.getAttribute === 'function') return cleanString(el.getAttribute(name));
    } catch (_) { /* fall through */ }
    try {
      var key = name.replace(/^data-/, '').replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
      return cleanString(el.dataset && el.dataset[key]);
    } catch (_) { return ''; }
  }
  function articleIds(article) {
    return {
      chatId: attr(article, 'data-chat-id'),
      snapshotId: attr(article, 'data-snapshot-id'),
    };
  }
  function selectorValue(value) {
    return cleanString(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
  function isConnectedArticle(article) {
    return !!article && article.isConnected === true;
  }
  function articleMatchesIds(article, chatId, snapshotId) {
    if (!isConnectedArticle(article)) return false;
    var ids = articleIds(article);
    if (!ids.chatId && !ids.snapshotId) return true;
    if (chatId && ids.chatId && ids.chatId !== chatId) return false;
    if (snapshotId && ids.snapshotId && ids.snapshotId !== snapshotId) return false;
    return (chatId && ids.chatId === chatId) || (snapshotId && ids.snapshotId === snapshotId);
  }
  function findCurrentArticle(chatId, snapshotId) {
    var document = doc();
    if (!document || typeof document.querySelector !== 'function') return null;
    var selectors = [];
    if (chatId) selectors.push('article.wbHistoryRow[data-chat-id="' + selectorValue(chatId) + '"]');
    if (snapshotId) selectors.push('article.wbHistoryRow[data-snapshot-id="' + selectorValue(snapshotId) + '"]');
    for (var i = 0; i < selectors.length; i += 1) {
      try {
        var found = document.querySelector(selectors[i]);
        if (articleMatchesIds(found, chatId, snapshotId)) return found;
      } catch (_) { /* try next selector */ }
    }
    return null;
  }
  function currentArticleFor(article, row) {
    var ids = articleIds(article);
    var chatId = cleanString(row && row.chatId) || ids.chatId;
    var snapshotId = deriveSnapshotId(row || {}) || ids.snapshotId;
    diagnosticsState.lastRetargeted = false;
    if (articleMatchesIds(article, chatId, snapshotId)) {
      diagnosticsState.lastArticleConnected = true;
      return article;
    }
    var current = findCurrentArticle(chatId, snapshotId);
    if (current) {
      diagnosticsState.staleArticleRetargeted += 1;
      diagnosticsState.lastRetargeted = true;
      diagnosticsState.lastArticleConnected = true;
      return current;
    }
    diagnosticsState.staleArticleMisses += 1;
    diagnosticsState.lastArticleConnected = false;
    return null;
  }
  function rowWithArticleIds(row, article) {
    var base = isObject(row) ? Object.assign({}, row) : {};
    var ids = articleIds(article);
    if (!cleanString(base.chatId) && ids.chatId) base.chatId = ids.chatId;
    if (!deriveSnapshotId(base) && ids.snapshotId) base.snapshotId = ids.snapshotId;
    return base;
  }
  function keyFor(row) {
    var chatId = cleanString(row && row.chatId);
    var snapshotId = deriveSnapshotId(row || {});
    return (chatId && snapshotId) ? (chatId + '|' + snapshotId) : null;
  }
  function cacheFullRow(row) {
    var key = keyFor(row);
    if (!key || !isObject(row)) return;
    fullRowCache.set(key, row);
    diagnosticsState.fullRowCacheWrites += 1;
  }
  function cachedFullRow(row) {
    var key = keyFor(row);
    if (!key || !fullRowCache.has(key)) return null;
    diagnosticsState.fullRowCacheHits += 1;
    return fullRowCache.get(key);
  }
  function explicitLinkOnly(row) {
    if (!isObject(row) || row.isSaved === true) return false;
    var dv = cleanString(row.displayView).toLowerCase();
    var bk = cleanString(row.badgeKind).toLowerCase();
    return row.isLinked === true || row.isImported === true || dv === 'link' || dv === 'linked' || dv === 'imported' || bk === 'link';
  }
  function likelyThinRow(row) {
    if (!isObject(row) || row.isSaved === true || row.isLinked === true || row.isImported === true) return false;
    return !cleanString(row.displayView) && !cleanString(row.badgeKind);
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
    } catch (err) {
      diagnosticsState.lastError = cleanString(err && err.message) || 'status-compute-failed';
      return null;
    }
  }
  function libraryRows() {
    try {
      var index = H2O.LibraryIndex;
      if (index && typeof index.getAll === 'function') return index.getAll();
    } catch (_) { /* fall through */ }
    return null;
  }
  function matchLibraryRow(rows, row, article) {
    var ids = articleIds(article);
    var chatId = cleanString(row && row.chatId) || ids.chatId;
    var snapshotId = deriveSnapshotId(row || {}) || ids.snapshotId;
    if (!Array.isArray(rows) || (!chatId && !snapshotId)) return null;
    var both = null;
    var bySnapshot = null;
    var byChat = null;
    for (var i = 0; i < rows.length; i += 1) {
      var candidate = rows[i];
      if (!isObject(candidate)) continue;
      var candidateChatId = cleanString(candidate.chatId);
      var candidateSnapshotId = deriveSnapshotId(candidate);
      if (chatId && snapshotId && candidateChatId === chatId && candidateSnapshotId === snapshotId) {
        both = candidate;
        break;
      }
      if (!bySnapshot && snapshotId && candidateSnapshotId === snapshotId) bySnapshot = candidate;
      if (!byChat && chatId && candidateChatId === chatId) byChat = candidate;
    }
    return both || bySnapshot || byChat || null;
  }
  function hydrateFullRow(article, row) {
    var rows = libraryRows();
    return Promise.resolve(rows).then(function (resolvedRows) {
      return matchLibraryRow(resolvedRows, row, article);
    });
  }
  function shouldShowStatus(status) {
    if (!status || !status.state) return false;
    if (SHOW_STATES[status.state]) return true;
    return status.state === 'unknown-check-status' && status.canCheckStatus === true && cleanString(status.requestId);
  }
  function priorInformativeBadge(container) {
    if (!container || typeof container.querySelector !== 'function') return null;
    var prior = container.querySelector(BADGE_SELECTOR);
    if (!prior || typeof prior.getAttribute !== 'function') return null;
    return SHOW_STATES[prior.getAttribute('data-h2o-archive-status')] ? prior : null;
  }
  function shouldPreserveExisting(row, status, prior) {
    if (!prior || shouldShowStatus(status)) return false;
    return likelyThinRow(row);
  }
  function recordStatus(status) {
    diagnosticsState.lastState = status && status.state ? cleanString(status.state) : null;
    diagnosticsState.lastReason = status && status.reason ? cleanString(status.reason) : '';
  }
  function normalizeLocalMeta(meta) {
    return {
      delivered: !!(meta && meta.delivered),
      requestId: (meta && meta.requestId) || null,
      deliveredAt: (meta && meta.deliveredAt) || null,
    };
  }
  function readLocalMeta(row) {
    var fn = ingestion().getSavedChatArchiveLocalDeliveryMetaV1;
    if (typeof fn !== 'function') return Promise.resolve({ delivered: false, requestId: null, deliveredAt: null });
    return Promise.resolve(fn(row)).then(normalizeLocalMeta);
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
    recordStatus(status);
    var targetArticle = currentArticleFor(article, row);
    var targetBadgesEl = targetArticle === article ? badgesEl : null;
    var existingContainer = resolveContainer(targetArticle, targetBadgesEl, false);
    var prior = existingContainer && typeof existingContainer.querySelector === 'function'
      ? existingContainer.querySelector(BADGE_SELECTOR)
      : null;
    if (!shouldShowStatus(status)) {
      diagnosticsState.skippedQuiet += 1;
      if (shouldPreserveExisting(row, status, priorInformativeBadge(existingContainer))) {
        diagnosticsState.preservedExisting += 1;
        diagnosticsState.skippedQuietThinPreserved += 1;
        return status;
      }
      if (prior && typeof prior.remove === 'function' && !likelyThinRow(row)) {
        prior.remove();
        diagnosticsState.removed += 1;
      }
      return status;
    }
    if (!targetArticle) return status;
    var container = resolveContainer(targetArticle, targetBadgesEl, true);
    if (!container) return status;
    var document = doc();
    if (!document) return status;
    if (prior && typeof prior.remove === 'function') prior.remove();
    var span = document.createElement('span');
    applyStatusToBadge(span, status, row, local, diagnostics);
    container.appendChild(span);
    var attached = container.querySelector && container.querySelector(BADGE_SELECTOR);
    if (isConnectedArticle(targetArticle) && attached && attached.getAttribute('data-h2o-archive-status') === cleanString(status.state)) {
      diagnosticsState.rendered += 1;
      diagnosticsState.connectedRendered += 1;
      diagnosticsState.lastArticleConnected = true;
    }
    return status;
  }

  /* One-shot, fire-and-forget warm of the local delivered cache for a row, then
   * a single in-place re-render. No timers; this is the continuation of one
   * read-only storage read. */
  function warmLocal(article, badgesEl, row) {
    var key = keyFor(row);
    if (!key || localCache.has(key) || warmSeen[key]) return;
    warmSeen[key] = true;
    try {
      readLocalMeta(row).then(function (local) {
        localCache.set(key, local);
        renderInto(article, badgesEl, row);
      }).catch(function () { delete warmSeen[key]; });
    } catch (_) { delete warmSeen[key]; }
  }
  function maybeHydrateFromLibrary(article, badgesEl, row, localOverride, diagOverride, initialStatus) {
    if (!article) {
      diagnosticsState.skippedNoArticle += 1;
      return;
    }
    if (explicitLinkOnly(row)) return;
    var ids = articleIds(article);
    var chatId = cleanString(row && row.chatId) || ids.chatId;
    var snapshotId = deriveSnapshotId(row || {}) || ids.snapshotId;
    if (!chatId && !snapshotId) {
      diagnosticsState.skippedNoIdentifiers += 1;
      return;
    }
    if (shouldShowStatus(initialStatus) && deriveSnapshotId(row) && row.isSaved === true) return;
    var key = 'hydrate|' + (chatId || '?') + '|' + (snapshotId || '?');
    if (hydrateSeen[key]) return;
    hydrateSeen[key] = true;
    diagnosticsState.hydrationAttempts += 1;
    Promise.resolve().then(function () {
      return hydrateFullRow(article, row);
    }).then(function (fullRow) {
      if (!isObject(fullRow) || explicitLinkOnly(fullRow)) {
        diagnosticsState.hydrationMisses += 1;
        delete hydrateSeen[key];
        return null;
      }
      var merged = rowWithArticleIds(fullRow, article);
      cacheFullRow(merged);
      var localPromise = isObject(localOverride) ? Promise.resolve(localOverride) : readLocalMeta(merged);
      return localPromise.then(function (local) {
        var cacheKey = keyFor(merged);
        if (cacheKey && !isObject(localOverride)) localCache.set(cacheKey, local);
        diagnosticsState.hydrationResolved += 1;
        return Promise.resolve().then(function () {
          renderInto(article, badgesEl, merged, local, diagOverride);
        });
      });
    }).catch(function () {
      diagnosticsState.lastError = 'hydrate-failed';
      delete hydrateSeen[key];
    });
  }

  function appendSavedChatArchiveStatusBadgeV1(options) {
    diagnosticsState.calls += 1;
    var opts = isObject(options) ? options : {};
    var article = opts.article || null;
    var badgesEl = opts.badgesEl || null;
    var row = rowWithArticleIds(opts.row, article);
    if (!cleanString(row.chatId) && !deriveSnapshotId(row)) {
      diagnosticsState.skippedNoIdentifiers += 1;
      return;
    }
    if (likelyThinRow(row)) {
      var cached = cachedFullRow(row);
      if (cached) row = rowWithArticleIds(cached, article);
    }
    var status = renderInto(article, badgesEl, row, opts.local, opts.diagnostics);
    var hydrateFirst = likelyThinRow(row) && !shouldShowStatus(status);
    /* Only warm from the live cache path (not when caller supplied local).
     * Thin route rows hydrate first so they do not cache a false local result
     * before the full LibraryIndex row is available. */
    if (!isObject(opts.local) && !hydrateFirst) warmLocal(article, badgesEl, row);
    maybeHydrateFromLibrary(article, badgesEl, row, opts.local, opts.diagnostics, status);
  }
  function diagnoseSavedChatArchiveStatusBadgeV1() {
    return {
      schema: 'h2o.savedChatArchiveStatusBadgeDiagnostic.v1',
      calls: diagnosticsState.calls,
      hydrationAttempts: diagnosticsState.hydrationAttempts,
      hydrationResolved: diagnosticsState.hydrationResolved,
      hydrationMisses: diagnosticsState.hydrationMisses,
      rendered: diagnosticsState.rendered,
      staleArticleRetargeted: diagnosticsState.staleArticleRetargeted,
      staleArticleMisses: diagnosticsState.staleArticleMisses,
      connectedRendered: diagnosticsState.connectedRendered,
      preservedExisting: diagnosticsState.preservedExisting,
      fullRowCacheHits: diagnosticsState.fullRowCacheHits,
      fullRowCacheWrites: diagnosticsState.fullRowCacheWrites,
      removed: diagnosticsState.removed,
      skippedQuietThinPreserved: diagnosticsState.skippedQuietThinPreserved,
      skippedQuiet: diagnosticsState.skippedQuiet,
      skippedNoArticle: diagnosticsState.skippedNoArticle,
      skippedNoIdentifiers: diagnosticsState.skippedNoIdentifiers,
      lastState: diagnosticsState.lastState,
      lastReason: diagnosticsState.lastReason,
      lastError: diagnosticsState.lastError,
      lastArticleConnected: diagnosticsState.lastArticleConnected,
      lastRetargeted: diagnosticsState.lastRetargeted,
    };
  }

  H2O.Studio.ingestion.appendSavedChatArchiveStatusBadgeV1 = appendSavedChatArchiveStatusBadgeV1;
  H2O.Studio.ingestion.diagnoseSavedChatArchiveStatusBadgeV1 = diagnoseSavedChatArchiveStatusBadgeV1;
})(typeof window !== 'undefined' ? window : globalThis);
