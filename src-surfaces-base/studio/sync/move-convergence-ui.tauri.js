/* H2O Desktop Sync - F11.0.6 move convergence action UI
 *
 * Desktop/Tauri-only operator surface for one move convergence action.
 *
 * Safety invariants:
 *   - UI only. This module adds no move logic, apply logic, bookkeeping logic,
 *     publication, WebDAV, inbox/outbox, transport, mobile write-back, or
 *     convergence algorithm.
 *   - Calls existing APIs only:
 *       buildConvergencePlan()
 *       checkMoveMaterialization()
 *       runMoveConvergencePreflight()
 *       executeMoveConvergence()
 *       finalizeMoveConvergence()
 *       listConsumedOperations()
 *       getConvergenceWatermarks()
 *   - Operator actions are explicit button clicks. No timers, polling,
 *     automatic refresh, automatic move, batch move, auto merge, or transport.
 *   - The panel works on one move-only subject at a time.
 *   - Rendered details are redacted: hashes/counts/status only; no raw names,
 *     folder IDs, parent IDs, chat IDs, paths, URLs, tokens, or content.
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* ignore */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Desktop = H2O.Desktop || {};
  H2O.Desktop.Sync = H2O.Desktop.Sync || {};
  if (H2O.Desktop.Sync.__moveConvergenceUiInstalled) return;

  var VERSION = '0.1.0-f11.0.6';
  var PANEL_ID = 'h2o-move-convergence-panel';
  var LAUNCHER_ID = 'h2o-move-convergence-launcher';
  var STYLE_ID = 'h2o-move-convergence-style';

  var state = {
    open: false,
    busy: false,
    snapshot: null,
    selectedIndex: 0,
    materialization: null,
    preflight: null,
    moveResult: null,
    bookkeepingResult: null,
    message: ''
  };

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function safeObject(value) {
    return isObject(value) ? value : {};
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function escapeHtml(value) {
    return cleanString(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function shortHash(value) {
    var text = cleanString(value);
    if (!text) return 'missing';
    return text.length > 14 ? text.slice(0, 12) + '...' : text;
  }

  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean);
  }

  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function boolText(value) {
    return value === true ? 'yes' : 'no';
  }

  function codes(label, values) {
    var list = codeList(values);
    if (!list.length) return '';
    return '<p class="h2oMoveConvCodes"><strong>' + escapeHtml(label) + ':</strong> ' +
      list.map(escapeHtml).join(', ') + '</p>';
  }

  function metric(label, value) {
    return '<div class="h2oMoveConvMetric"><span class="h2oMoveConvValue">' +
      escapeHtml(value == null ? 0 : value) + '</span><span class="h2oMoveConvLabel">' +
      escapeHtml(label) + '</span></div>';
  }

  function changedFields(entry) {
    return asArray(safeObject(entry).changedFields).map(cleanString).filter(Boolean).sort();
  }

  function isMoveOnlyEntry(entry) {
    var fields = changedFields(entry);
    return fields.length === 1 && (fields[0] === 'parent' || fields[0] === 'parentId');
  }

  function sourceBucketLabel(bucket) {
    return cleanString(bucket) || 'unknown';
  }

  function moveCandidateItems(plan) {
    var buckets = safeObject(safeObject(plan).buckets);
    var order = ['proposalEligible', 'needsPreview', 'conflicted', 'blocked', 'stale', 'replay'];
    var items = [];
    order.forEach(function (bucket) {
      asArray(buckets[bucket]).forEach(function (entry) {
        if (!isMoveOnlyEntry(entry)) return;
        items.push({ bucket: bucket, entry: safeObject(entry) });
      });
    });
    return items;
  }

  function selectedItem() {
    var items = moveCandidateItems(safeObject(state.snapshot && state.snapshot.plan));
    if (!items.length) return null;
    var index = Math.max(0, Math.min(state.selectedIndex || 0, items.length - 1));
    return items[index];
  }

  function selectedEntry() {
    var item = selectedItem();
    return item ? safeObject(item.entry) : null;
  }

  function parentHash(row, keys) {
    var obj = safeObject(row);
    for (var i = 0; i < keys.length; i += 1) {
      if (!Object.prototype.hasOwnProperty.call(obj, keys[i])) continue;
      var value = obj[keys[i]];
      if (value === null) return 'root';
      var text = cleanString(value);
      if (text) return shortHash(text);
    }
    return 'missing';
  }

  function rowSummary(item, index) {
    var row = safeObject(item && item.entry);
    var platform = safeObject(row.sourcePlatform);
    var selected = index === (state.selectedIndex || 0);
    return '<article class="h2oMoveConvRow' + (selected ? ' h2oMoveConvRowSelected' : '') + '">' +
      '<div><strong>' + (selected ? 'selected subject' : 'subject') + '</strong> ' +
      escapeHtml(shortHash(row.subjectId)) + ' <strong>bucket</strong> ' +
      escapeHtml(sourceBucketLabel(item && item.bucket)) + '</div>' +
      '<div><strong>local</strong> ' + escapeHtml(shortHash(row.localRevisionHash || row.baseHash)) +
      ' <strong>remote</strong> ' + escapeHtml(shortHash(row.remoteRevisionHash || row.targetHash || row.revisionHash)) + '</div>' +
      '<div><strong>from parent</strong> ' + escapeHtml(parentHash(row, ['fromParentSubjectId', 'sourceParentSubjectId', 'baseParentSubjectId', 'localParentSubjectId'])) +
      ' <strong>to parent</strong> ' + escapeHtml(parentHash(row, ['toParentSubjectId', 'targetParentSubjectId', 'newParentSubjectId', 'expectedParentSubjectId', 'parentSubjectId'])) + '</div>' +
      '<div><strong>lineage</strong> ' + escapeHtml(shortHash(row.lineageId)) +
      ' <strong>event</strong> ' + escapeHtml(shortHash(row.eventDigest)) + '</div>' +
      '<div><strong>reason</strong> ' + escapeHtml(row.reason || 'unspecified') +
      ' <strong>platform</strong> ' + escapeHtml(platform.platformId || 'unknown') +
      ' / ' + escapeHtml(platform.surfaceKind || 'unknown') + '</div>' +
      '<div><strong>changed fields</strong> ' + changedFields(row).map(escapeHtml).join(', ') + '</div>' +
      codes('blockers', row.blockerCodes || row.blockers) +
      codes('warnings', row.warningCodes || row.warnings) +
      '</article>';
  }

  async function safeCall(fn, fallback) {
    if (typeof fn !== 'function') return fallback;
    try {
      var result = await fn();
      return result || fallback;
    } catch (_) {
      return Object.assign({}, fallback, {
        ok: false,
        blockers: codeList(fallback.blockers).concat(['move-convergence-ui-call-failed'])
      });
    }
  }

  async function collectSnapshot() {
    var sync = H2O.Desktop.Sync;
    var plan = await safeCall(sync.buildConvergencePlan, {
      ok: false,
      buckets: {},
      counts: {},
      blockers: ['convergence-planner-unavailable'],
      warnings: []
    });
    var consumed = await safeCall(sync.listConsumedOperations, {
      ok: false,
      rows: [],
      counts: { rows: 0 },
      blockers: ['consumed-operation-ledger-unavailable'],
      warnings: []
    });
    var watermarks = await safeCall(sync.getConvergenceWatermarks, {
      ok: false,
      rows: [],
      counts: { rows: 0 },
      blockers: ['convergence-watermark-ledger-unavailable'],
      warnings: []
    });
    var items = moveCandidateItems(plan);
    if (state.selectedIndex >= items.length) state.selectedIndex = 0;
    return {
      generatedAtIso: nowIsoSeconds(),
      plan: safeObject(plan),
      consumed: safeObject(consumed),
      watermarks: safeObject(watermarks)
    };
  }

  function injectStyle() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#h2o-move-convergence-launcher{position:fixed;right:18px;bottom:210px;z-index:2147482598;border:1px solid rgba(148,163,184,.45);border-radius:999px;padding:10px 14px;background:var(--wb-panel,#151923);color:var(--wb-text,#f8fafc);font:650 13px/1.2 system-ui,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.24);cursor:pointer}',
      '#h2o-move-convergence-panel{position:fixed;right:18px;top:64px;width:min(1060px,calc(100vw - 36px));max-height:calc(100vh - 84px);z-index:2147482605;overflow:auto;border:1px solid rgba(148,163,184,.35);border-radius:20px;background:var(--wb-surface,#10141d);color:var(--wb-text,#f8fafc);box-shadow:0 24px 90px rgba(0,0,0,.38);font:13px/1.45 system-ui,sans-serif}',
      '#h2o-move-convergence-panel *{box-sizing:border-box}',
      '.h2oMoveConvHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid rgba(148,163,184,.22)}',
      '.h2oMoveConvBody{padding:18px 20px 22px}',
      '.h2oMoveConvKicker{margin:0 0 4px;color:var(--wb-muted,#94a3b8);font-size:12px;text-transform:uppercase;letter-spacing:.08em}',
      '.h2oMoveConvTitle{margin:0;font-size:20px;line-height:1.15}',
      '.h2oMoveConvNote{margin:8px 0 0;color:var(--wb-muted,#94a3b8)}',
      '.h2oMoveConvControls{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}',
      '.h2oMoveConvBtn{border:1px solid rgba(148,163,184,.34);border-radius:12px;background:rgba(148,163,184,.12);color:inherit;padding:9px 12px;font-weight:650;cursor:pointer}',
      '.h2oMoveConvBtn[disabled]{opacity:.55;cursor:not-allowed}',
      '.h2oMoveConvPrimary{background:rgba(59,130,246,.24);border-color:rgba(96,165,250,.5)}',
      '.h2oMoveConvApply{background:rgba(34,197,94,.18);border-color:rgba(74,222,128,.42)}',
      '.h2oMoveConvGrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:14px 0}',
      '.h2oMoveConvMetric{border:1px solid rgba(148,163,184,.22);border-radius:16px;padding:12px;background:rgba(148,163,184,.08)}',
      '.h2oMoveConvValue{display:block;font-size:22px;font-weight:800;line-height:1.05}',
      '.h2oMoveConvLabel{display:block;color:var(--wb-muted,#94a3b8);font-size:12px;margin-top:4px}',
      '.h2oMoveConvSection{border:1px solid rgba(148,163,184,.22);border-radius:16px;margin:10px 0;background:rgba(148,163,184,.06);padding:12px 14px}',
      '.h2oMoveConvSection h3{margin:0 0 8px;font-size:15px}',
      '.h2oMoveConvRows{display:grid;gap:8px}',
      '.h2oMoveConvRow{border:1px solid rgba(148,163,184,.18);border-radius:14px;padding:10px;background:rgba(2,6,23,.18);word-break:break-word}',
      '.h2oMoveConvRowSelected{border-color:rgba(96,165,250,.65);box-shadow:0 0 0 1px rgba(96,165,250,.25) inset}',
      '.h2oMoveConvCodes{margin:6px 0 0;color:var(--wb-muted,#94a3b8)}',
      '@media(max-width:860px){.h2oMoveConvGrid{grid-template-columns:repeat(2,minmax(0,1fr))}#h2o-move-convergence-panel{right:10px;top:54px;width:calc(100vw - 20px)}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function renderMoveProposalCandidate(plan) {
    var items = moveCandidateItems(plan);
    var rows = items.length
      ? items.slice(0, 12).map(rowSummary).join('')
      : '<p class="h2oMoveConvNote">No move-only planner entries are currently available. Move action requires changedFields === ["parent"] or ["parentId"].</p>';
    return '<section class="h2oMoveConvSection"><h3>Move Proposal Candidate</h3>' +
      '<p class="h2oMoveConvNote">One folder at a time. This panel displays move-only planner entries and does not create, publish, or transport proposal artifacts.</p>' +
      '<div class="h2oMoveConvRows">' + rows + '</div>' +
      codes('plan blockers', safeObject(plan).blockers) +
      codes('plan warnings', safeObject(plan).warnings) +
      '</section>';
  }

  function renderMaterialization(result) {
    var r = safeObject(result);
    if (!result) {
      return '<section class="h2oMoveConvSection"><h3>Move Materialization Result</h3>' +
        '<p class="h2oMoveConvNote">No materialization check has been run for the selected move candidate.</p></section>';
    }
    return '<section class="h2oMoveConvSection"><h3>Move Materialization Result</h3>' +
      '<div class="h2oMoveConvGrid">' +
      metric('ok', boolText(r.ok)) +
      metric('subject resolved', boolText(r.subjectResolved)) +
      metric('parent resolved', boolText(r.parentResolved)) +
      metric('parent stable', boolText(r.parentStable)) +
      metric('orphan safe', boolText(r.orphanSafe)) +
      '</div><div class="h2oMoveConvGrid">' +
      metric('cycle safe', boolText(r.cycleSafe)) +
      metric('depth safe', boolText(r.depthSafe)) +
      metric('duplicate safe', boolText(r.duplicateSiblingSafe)) +
      metric('blockers', codeList(r.blockers).length) +
      metric('warnings', codeList(r.warnings).length) +
      '</div>' +
      codes('materialization blockers', r.blockers) +
      codes('materialization warnings', r.warnings) +
      '</section>';
  }

  function renderPreflight(result) {
    var r = safeObject(result);
    if (!result) {
      return '<section class="h2oMoveConvSection"><h3>Move Preflight Result</h3>' +
        '<p class="h2oMoveConvNote">No move preflight has been run for the selected candidate.</p></section>';
    }
    return '<section class="h2oMoveConvSection"><h3>Move Preflight Result</h3>' +
      '<div class="h2oMoveConvGrid">' +
      metric('actionable', boolText(r.actionable)) +
      metric('subject resolved', boolText(r.subjectResolved)) +
      metric('parent resolved', boolText(r.parentResolved)) +
      metric('parent stable', boolText(r.parentStable)) +
      metric('orphan safe', boolText(r.orphanSafe)) +
      '</div><div class="h2oMoveConvGrid">' +
      metric('cycle safe', boolText(r.cycleSafe)) +
      metric('depth safe', boolText(r.depthSafe)) +
      metric('duplicate safe', boolText(r.duplicateSiblingSafe)) +
      metric('watermark safe', boolText(r.watermarkSafe)) +
      metric('replay safe', boolText(r.replaySafe)) +
      '</div><div class="h2oMoveConvGrid">' +
      metric('consumed safe', boolText(r.consumedSafe)) +
      metric('ok', boolText(r.ok)) +
      metric('blockers', codeList(r.blockers).length) +
      metric('warnings', codeList(r.warnings).length) +
      metric('mode', 'manual') +
      '</div>' +
      codes('preflight blockers', r.blockers) +
      codes('preflight warnings', r.warnings) +
      '</section>';
  }

  function renderApplyStatus(moveResult, bookkeepingResult) {
    var r = safeObject(moveResult);
    var b = safeObject(bookkeepingResult);
    var applyEvent = safeObject(b.applyEvent || r.applyEvent);
    if (!moveResult && !bookkeepingResult) {
      return '<section class="h2oMoveConvSection"><h3>Move Apply Status</h3>' +
        '<p class="h2oMoveConvNote">No local move convergence action has been executed from this panel.</p></section>';
    }
    return '<section class="h2oMoveConvSection"><h3>Move Apply Status</h3>' +
      '<div class="h2oMoveConvGrid">' +
      metric('action ok', boolText(r.ok)) +
      metric('moved', boolText(r.moved)) +
      metric('applyEvent', applyEvent.kind === 'applyEvent' ? 'yes' : 'no') +
      metric('dryRun', boolText(applyEvent.dryRun)) +
      metric('subject', shortHash(r.subjectId || applyEvent.subjectId)) +
      '</div><div class="h2oMoveConvGrid">' +
      metric('from parent', parentHash(r, ['fromParentSubjectId'])) +
      metric('to parent', parentHash(r, ['toParentSubjectId'])) +
      metric('pre hash', shortHash(r.preStateHash)) +
      metric('post hash', shortHash(r.postStateHash)) +
      metric('lineage', shortHash(r.lineageId || applyEvent.lineageId)) +
      '</div>' +
      '<p class="h2oMoveConvNote">event ' + escapeHtml(shortHash(applyEvent.eventDigest)) + '</p>' +
      codes('move blockers', r.blockers) +
      codes('move warnings', r.warnings) +
      codes('bookkeeping blockers', b.blockers) +
      codes('bookkeeping warnings', b.warnings) +
      '</section>';
  }

  function recentRows(rows, fields) {
    var list = asArray(rows).slice(-6).reverse();
    if (!list.length) return '<p class="h2oMoveConvNote">No rows recorded.</p>';
    return '<div class="h2oMoveConvRows">' + list.map(function (row) {
      var r = safeObject(row);
      return '<article class="h2oMoveConvRow">' +
        fields.map(function (field) {
          return '<div><strong>' + escapeHtml(field.label) + '</strong> ' +
            escapeHtml(field.hash ? shortHash(r[field.key]) : cleanString(r[field.key] || 'missing')) +
            '</div>';
        }).join('') +
        '</article>';
    }).join('') + '</div>';
  }

  function renderConsumedStatus(snapshot, bookkeepingResult) {
    var consumed = safeObject(snapshot && snapshot.consumed);
    var row = safeObject(bookkeepingResult && bookkeepingResult.consumedRow);
    return '<section class="h2oMoveConvSection"><h3>Consumed Ledger Status</h3>' +
      '<div class="h2oMoveConvGrid">' +
      metric('ledger ok', boolText(consumed.ok)) +
      metric('rows', safeObject(consumed.counts).rows || asArray(consumed.rows).length) +
      metric('last consumed', row.consumedStatus || 'none') +
      metric('last event', shortHash(row.eventDigest)) +
      metric('last subject', shortHash(row.subjectId)) +
      '</div>' +
      codes('consumed blockers', consumed.blockers) +
      codes('consumed warnings', consumed.warnings) +
      '</section>';
  }

  function renderWatermarkStatus(snapshot, bookkeepingResult) {
    var watermarks = safeObject(snapshot && snapshot.watermarks);
    var row = safeObject(bookkeepingResult && bookkeepingResult.watermarkRow);
    return '<section class="h2oMoveConvSection"><h3>Watermark Status</h3>' +
      '<div class="h2oMoveConvGrid">' +
      metric('ledger ok', boolText(watermarks.ok)) +
      metric('rows', safeObject(watermarks.counts).rows || asArray(watermarks.rows).length) +
      metric('last revision', shortHash(row.revisionHash)) +
      metric('last subject', shortHash(row.subjectId)) +
      metric('last peer', shortHash(row.peerId)) +
      '</div>' +
      codes('watermark blockers', watermarks.blockers) +
      codes('watermark warnings', watermarks.warnings) +
      '</section>';
  }

  function renderRecentMoveActions(snapshot) {
    var consumed = safeObject(snapshot && snapshot.consumed);
    var watermarks = safeObject(snapshot && snapshot.watermarks);
    return '<section class="h2oMoveConvSection"><h3>Recent Move Actions</h3>' +
      '<p class="h2oMoveConvNote">Recent move consumed-operation rows:</p>' +
      recentRows(asArray(consumed.rows).filter(function (row) {
        return cleanString(row && row.operationKind) === 'folder.move';
      }), [
        { label: 'status', key: 'consumedStatus' },
        { label: 'subject', key: 'subjectId', hash: true },
        { label: 'event', key: 'eventDigest', hash: true },
        { label: 'lineage', key: 'lineageId', hash: true }
      ]) +
      '<p class="h2oMoveConvNote">Recent watermark rows:</p>' +
      recentRows(asArray(watermarks.rows), [
        { label: 'subject', key: 'subjectId', hash: true },
        { label: 'peer', key: 'peerId', hash: true },
        { label: 'revision', key: 'revisionHash', hash: true },
        { label: 'recorded', key: 'recordedAtIso' }
      ]) +
      '</section>';
  }

  function renderPanelHtml() {
    var snapshot = safeObject(state.snapshot);
    var plan = safeObject(snapshot.plan);
    var counts = safeObject(plan.counts);
    var items = moveCandidateItems(plan);
    var canRun = !state.busy && !!selectedEntry();
    var canExecute = canRun &&
      safeObject(state.materialization).ok === true &&
      safeObject(state.preflight).actionable === true;
    return '<div class="h2oMoveConvHeader"><div>' +
      '<p class="h2oMoveConvKicker">F11.0.6 operator action surface</p>' +
      '<h2 class="h2oMoveConvTitle">Move convergence review</h2>' +
      '<p class="h2oMoveConvNote">UI only. One move-only subject at a time. No batch move, auto refresh, publication, transport, or remote mutation.</p>' +
      '</div><div class="h2oMoveConvControls">' +
      '<a class="h2oMoveConvBtn" href="#/settings/convergence/move">Open in Settings</a>' +
      '<button class="h2oMoveConvBtn" id="h2o-move-convergence-refresh" type="button" ' + (state.busy ? 'disabled' : '') + '>Refresh</button>' +
      '<button class="h2oMoveConvBtn h2oMoveConvPrimary" id="h2o-move-convergence-materialize" type="button" ' + (canRun ? '' : 'disabled') + '>Run Materialization Check</button>' +
      '<button class="h2oMoveConvBtn h2oMoveConvPrimary" id="h2o-move-convergence-preflight" type="button" ' + (canRun ? '' : 'disabled') + '>Run Move Preflight</button>' +
      '<button class="h2oMoveConvBtn h2oMoveConvApply" id="h2o-move-convergence-execute" type="button" ' + (canExecute ? '' : 'disabled') + '>Execute Move Convergence</button>' +
      '</div></div><div class="h2oMoveConvBody">' +
      (state.message ? '<p class="h2oMoveConvNote">' + escapeHtml(state.message) + '</p>' : '') +
      '<div class="h2oMoveConvGrid">' +
      metric('move candidates', items.length) +
      metric('proposalEligible', counts.proposalEligible || 0) +
      metric('needsPreview', counts.needsPreview || 0) +
      metric('conflicted', counts.conflicted || 0) +
      metric('blocked', counts.blocked || 0) +
      '</div>' +
      renderMoveProposalCandidate(plan) +
      renderMaterialization(state.materialization) +
      renderPreflight(state.preflight) +
      renderApplyStatus(state.moveResult, state.bookkeepingResult) +
      renderConsumedStatus(snapshot, state.bookkeepingResult) +
      renderWatermarkStatus(snapshot, state.bookkeepingResult) +
      renderRecentMoveActions(snapshot) +
      '</div>';
  }

  function bindPanel() {
    var refresh = document.getElementById('h2o-move-convergence-refresh');
    var materialize = document.getElementById('h2o-move-convergence-materialize');
    var preflight = document.getElementById('h2o-move-convergence-preflight');
    var execute = document.getElementById('h2o-move-convergence-execute');
    if (refresh) refresh.addEventListener('click', function () { refreshMoveConvergencePanel(); });
    if (materialize) materialize.addEventListener('click', function () { runSelectedMaterialization(); });
    if (preflight) preflight.addEventListener('click', function () { runSelectedMovePreflight(); });
    if (execute) execute.addEventListener('click', function () { executeSelectedMoveConvergence(); });
  }

  function ensurePanel() {
    injectStyle();
    var panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Move convergence review');
      document.body.appendChild(panel);
    }
    return panel;
  }

  async function renderPanel() {
    var panel = ensurePanel();
    if (!state.snapshot) state.snapshot = await collectSnapshot();
    panel.innerHTML = renderPanelHtml();
    bindPanel();
  }

  async function openMoveConvergencePanel() {
    state.open = true;
    state.message = '';
    await refreshMoveConvergencePanel();
    return state.snapshot;
  }

  async function refreshMoveConvergencePanel() {
    state.busy = true;
    state.message = 'Refreshing move convergence status...';
    if (state.open) await renderPanel();
    state.snapshot = await collectSnapshot();
    state.materialization = null;
    state.preflight = null;
    state.moveResult = null;
    state.bookkeepingResult = null;
    state.message = 'Refreshed at ' + nowIsoSeconds() + '.';
    state.busy = false;
    if (state.open) await renderPanel();
    return state.snapshot;
  }

  async function runSelectedMaterialization() {
    var sync = H2O.Desktop.Sync;
    var entry = selectedEntry();
    state.busy = true;
    state.message = 'Running move materialization check...';
    if (state.open) await renderPanel();
    if (!entry) {
      state.materialization = { ok: false, blockers: ['move-entry-required'], warnings: [] };
    } else if (!sync || typeof sync.checkMoveMaterialization !== 'function') {
      state.materialization = { ok: false, blockers: ['move-materialization-unavailable'], warnings: [] };
    } else {
      try {
        state.materialization = safeObject(await sync.checkMoveMaterialization({
          plannerEntry: entry
        }));
      } catch (_) {
        state.materialization = { ok: false, blockers: ['move-materialization-failed'], warnings: [] };
      }
    }
    state.preflight = null;
    state.moveResult = null;
    state.bookkeepingResult = null;
    state.message = 'Move materialization check complete.';
    state.busy = false;
    if (state.open) await renderPanel();
    return state.materialization;
  }

  async function runSelectedMovePreflight() {
    var sync = H2O.Desktop.Sync;
    var entry = selectedEntry();
    state.busy = true;
    state.message = 'Running move preflight...';
    if (state.open) await renderPanel();
    if (!entry) {
      state.preflight = { ok: false, actionable: false, blockers: ['move-entry-required'], warnings: [] };
    } else if (!sync || typeof sync.runMoveConvergencePreflight !== 'function') {
      state.preflight = { ok: false, actionable: false, blockers: ['move-preflight-unavailable'], warnings: [] };
    } else {
      try {
        state.preflight = safeObject(await sync.runMoveConvergencePreflight({
          plannerEntry: entry
        }));
      } catch (_) {
        state.preflight = { ok: false, actionable: false, blockers: ['move-preflight-failed'], warnings: [] };
      }
    }
    state.moveResult = null;
    state.bookkeepingResult = null;
    state.message = 'Move preflight complete.';
    state.busy = false;
    if (state.open) await renderPanel();
    return state.preflight;
  }

  async function executeSelectedMoveConvergence() {
    var sync = H2O.Desktop.Sync;
    var entry = selectedEntry();
    state.busy = true;
    state.message = 'Executing one local move convergence action...';
    if (state.open) await renderPanel();
    if (!entry) {
      state.moveResult = { ok: false, moved: false, blockers: ['move-entry-required'], warnings: [] };
    } else if (!state.materialization || state.materialization.ok !== true) {
      state.moveResult = { ok: false, moved: false, blockers: ['move-materialization-result-required'], warnings: [] };
    } else if (!state.preflight || state.preflight.actionable !== true) {
      state.moveResult = { ok: false, moved: false, blockers: ['actionable-move-preflight-required'], warnings: [] };
    } else if (!sync || typeof sync.executeMoveConvergence !== 'function') {
      state.moveResult = { ok: false, moved: false, blockers: ['move-convergence-action-unavailable'], warnings: [] };
    } else {
      try {
        state.moveResult = safeObject(await sync.executeMoveConvergence({
          plannerEntry: entry,
          operatorApprovalToken: cleanString(sync.__moveConvergenceApprovalToken)
        }));
      } catch (_) {
        state.moveResult = { ok: false, moved: false, blockers: ['move-convergence-action-failed'], warnings: [] };
      }
    }

    if (state.moveResult && state.moveResult.moved === true) {
      if (!sync || typeof sync.finalizeMoveConvergence !== 'function') {
        state.bookkeepingResult = { ok: false, blockers: ['move-bookkeeping-unavailable'], warnings: [] };
      } else {
        try {
          state.bookkeepingResult = safeObject(await sync.finalizeMoveConvergence({
            moveResult: state.moveResult
          }));
        } catch (_) {
          state.bookkeepingResult = { ok: false, blockers: ['move-bookkeeping-failed'], warnings: [] };
        }
      }
    } else {
      state.bookkeepingResult = null;
    }

    state.snapshot = await collectSnapshot();
    state.message = state.moveResult && state.moveResult.moved === true
      ? 'Local move convergence action completed; bookkeeping status updated.'
      : 'Local move convergence action did not apply.';
    state.busy = false;
    if (state.open) await renderPanel();
    return {
      moveResult: state.moveResult,
      bookkeepingResult: state.bookkeepingResult
    };
  }

  function installLauncher() {
    if (typeof document === 'undefined' || !document.body || document.getElementById(LAUNCHER_ID)) return;
    injectStyle();
    var button = document.createElement('button');
    button.id = LAUNCHER_ID;
    button.type = 'button';
    button.textContent = 'Move Convergence';
    button.setAttribute('aria-label', 'Open move convergence panel');
    button.addEventListener('click', function () { openMoveConvergencePanel(); });
    document.body.appendChild(button);
  }

  function bootLauncher() {
    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', installLauncher, { once: true });
    } else {
      installLauncher();
    }
  }

  H2O.Desktop.Sync.openMoveConvergencePanel = openMoveConvergencePanel;
  H2O.Desktop.Sync.refreshMoveConvergencePanel = refreshMoveConvergencePanel;
  H2O.Desktop.Sync.__moveConvergenceUiInstalled = true;
  H2O.Desktop.Sync.__moveConvergenceUiVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
