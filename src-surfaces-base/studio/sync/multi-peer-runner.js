/* H2O Studio Diagnostics - Multi-Peer Readiness Runner (F1B)
 *
 * HIDDEN, GATED, COUNTS-ONLY runner that wraps multiPeerDiff with live
 * bundle + localState inside Desktop or Chrome Studio.
 *
 * GATE (BOTH must hold for the panel to mount or do anything):
 *   - H2O.flags && H2O.flags.experimentalMultiPeer === true
 *   - location.hash === '#/dev/multi-peer-readiness'
 *
 * Constraints (enforced by code + acceptance checks):
 *   - createElement + textContent only; no innerHTML / outerHTML.
 *   - Counts only. No record IDs, titles, URLs, samples, or transcript text
 *     are ever rendered into the DOM.
 *   - No writes anywhere. No chrome.storage / localStorage / sessionStorage /
 *     SQLite / IndexedDB / filesystem.
 *   - Does NOT call exportLatestSyncBundle() (the writer); calls
 *     exportFullBundle() only, which is documented in-memory.
 *   - "Last run" state is module-scoped and in-memory only; refresh resets.
 *   - The gate flag is in-memory only; this file never persists it.
 *
 * Discovery: no UI link, no menu entry, no Settings tab references this.
 *   The hash route name lives in this file and in the F1B doc only.
 *
 * Developer usage:
 *   1. Open Studio (Desktop or Chrome).
 *   2. DevTools console:
 *        H2O.flags = H2O.flags || {};
 *        H2O.flags.experimentalMultiPeer = true;
 *   3. Navigate: location.hash = '#/dev/multi-peer-readiness';
 *   4. Click "Run readiness check".
 *
 * F1B is diagnostic-only. It does not change the R1-R2E sync lane.
 */
(function (global) {
  'use strict';

  /* Bail out early in non-DOM hosts (e.g. Node, ServiceWorker). */
  if (typeof global.document === 'undefined' ||
      typeof global.document.createElement !== 'function') return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.diagnostics = H2O.Studio.diagnostics || {};
  if (H2O.Studio.diagnostics.__multiPeerRunnerInstalled) return;

  /* ─── Constants ───────────────────────────────────────────────────── */

  var GATE_FLAG_NAME = 'experimentalMultiPeer';
  var GATE_HASH      = '#/dev/multi-peer-readiness';
  var HOST_ID        = 'h2o-mp-readiness-host';
  var RUNNER_VERSION = '0.1.2-f5f.3b';

  /* ─── In-memory state (reset on refresh) ──────────────────────────── */

  var state = {
    lastRunAt:  null,
    lastReport: null,
    lastError:  null,
    inFlight:   false
  };

  var hostNode = null;
  var elements = {};

  /* ─── Gate predicate ──────────────────────────────────────────────── */

  function isFlagSet() {
    var flags = (global.H2O && global.H2O.flags) || {};
    return flags[GATE_FLAG_NAME] === true;
  }

  function isHashActive() {
    var h = '';
    try { h = String(global.location.hash || ''); } catch (_) { /* ignore */ }
    return h === GATE_HASH;
  }

  function isGated() {
    return isFlagSet() && isHashActive();
  }

  /* ─── Surface detection (read-only) ───────────────────────────────── */

  function detectSurface() {
    try {
      if (global.__TAURI_INTERNALS__ || global.__TAURI__) return 'studio-desktop';
    } catch (_) { /* ignore */ }
    try {
      if (global.chrome && global.chrome.runtime && global.chrome.runtime.id) return 'studio-chrome';
    } catch (_) { /* ignore */ }
    return 'unknown';
  }

  function analyzerAvailable() {
    return !!(H2O.Studio && H2O.Studio.diagnostics &&
              typeof H2O.Studio.diagnostics.multiPeerDiff === 'function');
  }

  function exporterAvailable() {
    return !!(H2O.Studio && H2O.Studio.ingestion &&
              typeof H2O.Studio.ingestion.exportFullBundle === 'function');
  }

  /* ─── DOM helpers (createElement + textContent ONLY; no innerHTML) ── */

  function el(tag, styleStr) {
    var n = global.document.createElement(tag);
    if (styleStr) n.setAttribute('style', styleStr);
    return n;
  }
  function txt(s) {
    return global.document.createTextNode(String(s == null ? '' : s));
  }
  function setText(node, s) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
    node.appendChild(txt(s));
  }
  function asCountMap(rows, keyField) {
    var out = {};
    if (!Array.isArray(rows)) return out;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || {};
      var key = String(row[keyField] || 'unknown');
      out[key] = Number(row.total || 0);
    }
    return out;
  }
  function warningCodesOnly(warnings) {
    var counts = {};
    var out = [];
    if (!Array.isArray(warnings)) return out;
    for (var i = 0; i < warnings.length; i++) {
      var code = String((warnings[i] && warnings[i].code) || 'warning');
      counts[code] = Number(counts[code] || 0) + Number((warnings[i] && warnings[i].count) || 1);
    }
    Object.keys(counts).sort().forEach(function (code) {
      out.push({ code: code, count: counts[code] });
    });
    return out;
  }
  function warningCount(warnings) {
    if (!Array.isArray(warnings)) return 0;
    var total = 0;
    for (var i = 0; i < warnings.length; i++) {
      total += Number((warnings[i] && warnings[i].count) || 1);
    }
    return total;
  }
  function unavailableTombstoneReviews(code) {
    return {
      supported: true,
      available: false,
      total: 0,
      pending: 0,
      byClassification: {},
      byStatus: {},
      malformedCount: 0,
      selfOriginatedIgnoredCount: 0,
      duplicateCount: 0,
      cascadeReviewCount: 0,
      deleteVsEditCount: 0,
      unsupportedKindCount: 0,
      warnings: [{ code: code || 'tombstone-review-store-unavailable' }]
    };
  }
  function normalizeTombstoneReviews(diag) {
    if (!diag || typeof diag !== 'object') {
      return unavailableTombstoneReviews('tombstone-review-diagnose-unavailable');
    }
    return {
      supported: true,
      available: true,
      total: Number(diag.total || 0),
      pending: Number(diag.pending || 0),
      byClassification: asCountMap(diag.byClassification, 'classification'),
      byStatus: asCountMap(diag.byStatus, 'status'),
      malformedCount: Number(diag.malformedCount || 0),
      selfOriginatedIgnoredCount: Number(diag.selfOriginatedIgnoredCount || 0),
      duplicateCount: Number(diag.duplicateCount || 0),
      cascadeReviewCount: Number(diag.cascadeReviewCount || 0),
      deleteVsEditCount: Number(diag.deleteVsEditCount || 0),
      unsupportedKindCount: Number(diag.unsupportedKindCount || 0),
      warnings: warningCodesOnly(diag.warnings)
    };
  }
  function readTombstoneReviewDiagnostics() {
    var reviews = H2O.Studio && H2O.Studio.store && H2O.Studio.store.tombstoneReviews;
    if (!reviews || typeof reviews.diagnose !== 'function') {
      return Promise.resolve(unavailableTombstoneReviews('tombstone-review-store-unavailable'));
    }
    try {
      return Promise.resolve(reviews.diagnose()).then(normalizeTombstoneReviews, function () {
        return unavailableTombstoneReviews('tombstone-review-diagnose-failed');
      });
    } catch (_) {
      return Promise.resolve(unavailableTombstoneReviews('tombstone-review-diagnose-failed'));
    }
  }

  /* ─── Panel construction (counts only) ────────────────────────────── */

  function makeKvBlock(title, keys) {
    var block = el('div', 'margin-bottom:12px;');
    var head = el('div', 'color:#9aa3ad;margin-bottom:4px;');
    head.appendChild(txt(title));
    block.appendChild(head);
    var grid = el('div',
      'display:grid;grid-template-columns:1fr auto;gap:2px 12px;');
    var values = {};
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var keyCell = el('div', 'color:#cdd2d7;');
      keyCell.appendChild(txt(k));
      var valCell = el('div', 'text-align:right;color:#e6e6e6;');
      valCell.appendChild(txt('—'));
      grid.appendChild(keyCell);
      grid.appendChild(valCell);
      values[k] = valCell;
    }
    block.appendChild(grid);
    return { block: block, values: values };
  }

  function buildPanel() {
    var rootStyle =
      'position:fixed;top:24px;right:24px;width:520px;max-height:80vh;overflow:auto;' +
      'background:#0d0f12;color:#e6e6e6;font:12px/1.45 ui-monospace,Menlo,monospace;' +
      'padding:16px;border:1px solid #2a2f36;border-radius:8px;z-index:2147483000;' +
      'box-shadow:0 8px 24px rgba(0,0,0,0.4);';
    var root = el('div', rootStyle);

    /* Title row */
    var titleRow = el('div', 'display:flex;justify-content:space-between;margin-bottom:8px;');
    var title = el('div', 'font-weight:600;');
    title.appendChild(txt('Multi-Peer Readiness Diagnostic'));
    var devBadge = el('span', 'color:#f5a623;');
    devBadge.appendChild(txt(' (dev-only · F1B)'));
    title.appendChild(devBadge);
    titleRow.appendChild(title);
    root.appendChild(titleRow);

    /* Meta line: surface · analyzer · runner versions */
    var meta = el('div', 'color:#9aa3ad;margin-bottom:12px;');
    meta.appendChild(txt('Surface: '));
    var surfaceVal = el('span', 'color:#e6e6e6;');
    surfaceVal.appendChild(txt(detectSurface()));
    meta.appendChild(surfaceVal);
    meta.appendChild(txt(' · Analyzer: '));
    var analyzerVal = el('span', 'color:#e6e6e6;');
    analyzerVal.appendChild(txt(H2O.Studio.diagnostics.__multiPeerDiffVersion || 'not loaded'));
    meta.appendChild(analyzerVal);
    meta.appendChild(txt(' · Runner: '));
    var runnerVal = el('span', 'color:#e6e6e6;');
    runnerVal.appendChild(txt(RUNNER_VERSION));
    meta.appendChild(runnerVal);
    root.appendChild(meta);

    /* Run button + status */
    var btnRow = el('div', 'margin-bottom:12px;');
    var btn = el('button',
      'background:#2563eb;color:#fff;border:0;border-radius:4px;' +
      'padding:6px 12px;cursor:pointer;font:inherit;');
    btn.appendChild(txt('Run readiness check'));
    btn.addEventListener('click', runReadiness);
    btnRow.appendChild(btn);
    var status = el('span', 'margin-left:12px;color:#9aa3ad;');
    btnRow.appendChild(status);
    root.appendChild(btnRow);

    /* Last run timestamp */
    var lastRunRow = el('div', 'color:#9aa3ad;margin-bottom:12px;');
    lastRunRow.appendChild(txt('Last run: '));
    var lastRunVal = el('span', 'color:#e6e6e6;');
    lastRunVal.appendChild(txt('—'));
    lastRunRow.appendChild(lastRunVal);
    lastRunRow.appendChild(txt(' (in-memory only)'));
    root.appendChild(lastRunRow);

    /* Counts blocks */
    var envEl = makeKvBlock('Envelope gaps', [
      'exportId', 'sequenceNumber', 'sourceSyncPeerId',
      'contentSha256', 'tombstones', 'parentExportIds'
    ]);
    root.appendChild(envEl.block);

    var covEl = makeKvBlock(
      'Coverage  (per kind: total / missing createdAt / missing updatedAt / missing source)',
      ['chat', 'snapshot', 'folder', 'category', 'label', 'tag', 'project', 'folderBinding']
    );
    root.appendChild(covEl.block);

    var tombEl = makeKvBlock(
      'Tombstone candidates  (records local but absent from bundle)',
      ['total', 'chat', 'snapshot', 'folder', 'category', 'label', 'tag', 'project']
    );
    root.appendChild(tombEl.block);

    var reviewEl = makeKvBlock(
      'Remote tombstone reviews  (evidence only; no apply)',
      ['available', 'total', 'pending', 'cascade-review', 'delete-vs-edit', 'malformed', 'unsupported', 'warnings']
    );
    root.appendChild(reviewEl.block);

    var confEl = makeKvBlock(
      'Conflicts  (by bucket — F1A merge-rule table)',
      ['merge:union', 'merge:visual-lww', 'conflict:needs-review', 'conflict:hard']
    );
    root.appendChild(confEl.block);

    var invEl = makeKvBlock('Invariants', [
      'issuesCount', 'everyChatHasId', 'everySnapshotHasDigest',
      'noSnapshotIdReusedAcrossChats', 'linkedSavedInvariantHolds'
    ]);
    root.appendChild(invEl.block);

    var readEl = makeKvBlock('Readiness  (advisory)', [
      'identity', 'deletion', 'conflict'
    ]);
    root.appendChild(readEl.block);

    /* Footer note */
    var footer = el('div',
      'color:#6c757d;margin-top:12px;border-top:1px solid #2a2f36;padding-top:8px;');
    footer.appendChild(txt(
      'F1B is diagnostic-only. Counts only. No writes. No sample content shown. ' +
      'Refresh clears state.'
    ));
    root.appendChild(footer);

    elements = {
      root:       root,
      status:     status,
      lastRunVal: lastRunVal,
      envelope:   envEl.values,
      coverage:   covEl.values,
      tombstones: tombEl.values,
      tombstoneReviews: reviewEl.values,
      conflicts:  confEl.values,
      invariants: invEl.values,
      readiness:  readEl.values
    };
    return root;
  }

  /* ─── Mount / unmount ─────────────────────────────────────────────── */

  function mount() {
    if (hostNode || !isGated()) return;
    hostNode = global.document.createElement('div');
    hostNode.id = HOST_ID;
    hostNode.appendChild(buildPanel());
    if (global.document.body) {
      global.document.body.appendChild(hostNode);
    }
  }

  function unmount() {
    if (!hostNode) return;
    if (hostNode.parentNode) hostNode.parentNode.removeChild(hostNode);
    hostNode = null;
    elements = {};
  }

  function reconcile() {
    if (isGated()) mount();
    else unmount();
  }

  /* ─── Run handler ─────────────────────────────────────────────────── */

  function runReadiness() {
    if (state.inFlight) return;
    if (!elements.status) return;

    /* F1B.1 — re-check the gate at click time. If either condition has gone
     * false since mount (e.g. dev flipped the flag without changing the hash),
     * unmount cleanly and abort without running anything. */
    if (!isGated()) {
      unmount();
      return;
    }

    var surface = detectSurface();
    if (!analyzerAvailable()) {
      setText(elements.status, 'analyzer not loaded');
      return;
    }
    if (!exporterAvailable()) {
      setText(elements.status,
        'bundle source unavailable on ' + surface +
        ' — run on Desktop for a full report');
      return;
    }

    state.inFlight = true;
    setText(elements.status, 'running…');

    var bundlePromise;
    try {
      bundlePromise = Promise.resolve(H2O.Studio.ingestion.exportFullBundle());
    } catch (e) {
      bundlePromise = Promise.reject(e);
    }

    bundlePromise
      .then(function (bundle) {
        var lsFn = H2O.Studio.diagnostics.collectLocalState;
        if (typeof lsFn !== 'function') return { bundle: bundle, localState: null };
        return Promise.resolve(lsFn()).then(function (ls) {
          return { bundle: bundle, localState: ls };
        });
      })
      .then(function (pair) {
        var report = H2O.Studio.diagnostics.multiPeerDiff({
          bundle: pair.bundle,
          localState: pair.localState
        });
        return readTombstoneReviewDiagnostics().then(function (reviewDiag) {
          report.tombstoneReviews = reviewDiag;
          state.lastReport = report;
          state.lastRunAt = new Date().toISOString();
          state.lastError = null;
          renderCounts(report);
          setText(elements.status, 'done');
        });
      })
      .catch(function (err) {
        state.lastError = String((err && err.message) || err);
        renderCounts(null);
        setText(elements.status, 'error');
      })
      .then(function () {
        state.inFlight = false;
      });
  }

  /* ─── Render counts only ──────────────────────────────────────────── */

  function renderCounts(report) {
    if (!elements.envelope) return;
    setText(elements.lastRunVal, state.lastRunAt || '—');

    var env = (report && report.envelope) || {};
    setText(elements.envelope.exportId,         env.hasExportId         ? 'present' : 'missing');
    setText(elements.envelope.sequenceNumber,   env.hasSequenceNumber   ? 'present' : 'missing');
    setText(elements.envelope.sourceSyncPeerId, env.hasSourceSyncPeerId ? 'present' : 'missing');
    setText(elements.envelope.contentSha256,    env.hasContentSha256    ? 'present' : 'missing');
    setText(elements.envelope.tombstones,       env.hasTombstoneArray   ? 'present' : 'missing');
    setText(elements.envelope.parentExportIds,  env.hasParentExportIds  ? 'present' : 'missing');

    var cov = (report && report.coverage) || {};
    var covKeys = ['chat','snapshot','folder','category','label','tag','project','folderBinding'];
    for (var i = 0; i < covKeys.length; i++) {
      var k = covKeys[i];
      var c = cov[k] || {};
      var tot = Number(c.total || 0);
      var mc  = Number(c.missingCreatedAt || 0);
      var mu  = Number(c.missingUpdatedAt || 0);
      var ms  = Number(c.missingSourceAttribution || 0);
      setText(elements.coverage[k], tot + ' / ' + mc + ' / ' + mu + ' / ' + ms);
    }

    var tomb = (report && report.tombstoneCandidates) || {};
    var byKind = tomb.byKind || {};
    setText(elements.tombstones.total, String(Number(tomb.totalCount || 0)));
    ['chat','snapshot','folder','category','label','tag','project'].forEach(function (k) {
      var n = (byKind[k] && Number(byKind[k].count)) || 0;
      setText(elements.tombstones[k], String(n));
    });

    var reviews = (report && report.tombstoneReviews) || unavailableTombstoneReviews();
    setText(elements.tombstoneReviews.available, reviews.available ? 'yes' : 'no');
    setText(elements.tombstoneReviews.total, String(Number(reviews.total || 0)));
    setText(elements.tombstoneReviews.pending, String(Number(reviews.pending || 0)));
    setText(elements.tombstoneReviews['cascade-review'], String(Number(reviews.cascadeReviewCount || 0)));
    setText(elements.tombstoneReviews['delete-vs-edit'], String(Number(reviews.deleteVsEditCount || 0)));
    setText(elements.tombstoneReviews.malformed, String(Number(reviews.malformedCount || 0)));
    setText(elements.tombstoneReviews.unsupported, String(Number(reviews.unsupportedKindCount || 0)));
    setText(elements.tombstoneReviews.warnings, String(warningCount(reviews.warnings)));

    var conf = (report && report.conflicts) || {};
    var cbk = conf.countsByBucket || {};
    setText(elements.conflicts['merge:union'],           String(Number(cbk['merge:union']           || 0)));
    setText(elements.conflicts['merge:visual-lww'],      String(Number(cbk['merge:visual-lww']      || 0)));
    setText(elements.conflicts['conflict:needs-review'], String(Number(cbk['conflict:needs-review'] || 0)));
    setText(elements.conflicts['conflict:hard'],         String(Number(cbk['conflict:hard']         || 0)));

    var inv = (report && report.invariants) || {};
    setText(elements.invariants.issuesCount,                   String((inv.issues && inv.issues.length) || 0));
    setText(elements.invariants.everyChatHasId,                inv.everyChatHasId ? 'ok' : 'fail');
    setText(elements.invariants.everySnapshotHasDigest,        inv.everySnapshotHasDigest ? 'ok' : 'fail');
    setText(elements.invariants.noSnapshotIdReusedAcrossChats, inv.noSnapshotIdReusedAcrossChats ? 'ok' : 'fail');
    setText(elements.invariants.linkedSavedInvariantHolds,     inv.linkedSavedInvariantHolds ? 'ok' : 'fail');

    var rd = (report && report.readiness) || {};
    setText(elements.readiness.identity, String(rd.identity || '—'));
    setText(elements.readiness.deletion, String(rd.deletion || '—'));
    setText(elements.readiness.conflict, String(rd.conflict || '—'));
  }

  /* ─── Wire listeners (once at module load) ────────────────────────── */

  try { global.addEventListener('hashchange', reconcile); }
  catch (_) { /* ignore */ }
  /* F1B.1 — visibilitychange fires when the tab regains focus, which is a
   * natural moment to re-check the gate (e.g. after a dev flipped the flag
   * in DevTools and switched back to the page). */
  try { global.document.addEventListener('visibilitychange', reconcile); }
  catch (_) { /* ignore */ }

  function bootReconcile() {
    try { reconcile(); } catch (_) { /* ignore */ }
  }
  if (global.document && global.document.readyState === 'loading') {
    try { global.document.addEventListener('DOMContentLoaded', bootReconcile, { once: true }); }
    catch (_) { bootReconcile(); }
  } else {
    bootReconcile();
  }

  /* ─── Registration ────────────────────────────────────────────────── */

  H2O.Studio.diagnostics.__multiPeerRunnerInstalled = true;
  H2O.Studio.diagnostics.__multiPeerRunnerVersion   = RUNNER_VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
