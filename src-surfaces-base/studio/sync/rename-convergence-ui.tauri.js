/* H2O Desktop Sync - F10.9.7 rename convergence action UI
 *
 * Desktop/Tauri-only operator surface for one rename convergence action.
 *
 * Safety invariants:
 *   - UI only. This module adds no rename, apply, bookkeeping, publication,
 *     WebDAV, inbox/outbox, transport, mobile write-back, or convergence logic.
 *   - Calls existing APIs only:
 *       buildConvergencePlan()
 *       checkRenameMaterialization()
 *       runRenameConvergencePreflight()
 *       executeRenameConvergence()
 *       finalizeRenameConvergence()
 *       listConsumedOperations()
 *       getConvergenceWatermarks()
 *   - Operator actions are explicit button clicks. No timers, polling,
 *     automatic refresh, automatic rename, batch rename, auto merge, or
 *     transport.
 *   - The panel works on one rename-only subject at a time.
 *   - proposedName is local operator input only. It is passed to existing
 *     rename APIs and is never persisted, enqueued, uploaded, logged, or
 *     rendered in result sections by this module.
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
      if (global.H2O && global.H2O.Studio && global.H2O.Studio.platform &&
          global.H2O.Studio.platform.env && global.H2O.Studio.platform.env.isTauri === true) return true;
    } catch (_) { /* ignore */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Desktop = H2O.Desktop || {};
  H2O.Desktop.Sync = H2O.Desktop.Sync || {};
  if (H2O.Desktop.Sync.__renameConvergenceUiInstalled) return;

  var VERSION = '0.1.0-f10.9.7';
  var PANEL_ID = 'h2o-rename-convergence-panel';
  var LAUNCHER_ID = 'h2o-rename-convergence-launcher';
  var STYLE_ID = 'h2o-rename-convergence-style';

  var state = {
    open: false,
    busy: false,
    snapshot: null,
    selectedIndex: 0,
    proposedName: '',
    materialization: null,
    preflight: null,
    renameResult: null,
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
    return '<p class="h2oRenameConvCodes"><strong>' + escapeHtml(label) + ':</strong> ' +
      list.map(escapeHtml).join(', ') + '</p>';
  }

  function metric(label, value) {
    return '<div class="h2oRenameConvMetric"><span class="h2oRenameConvValue">' +
      escapeHtml(value == null ? 0 : value) + '</span><span class="h2oRenameConvLabel">' +
      escapeHtml(label) + '</span></div>';
  }

  function changedFields(entry) {
    return asArray(safeObject(entry).changedFields).map(cleanString).filter(Boolean).sort();
  }

  function isRenameOnlyEntry(entry) {
    var fields = changedFields(entry);
    return fields.length === 1 && fields[0] === 'name';
  }

  function sourceBucketLabel(bucket) {
    return cleanString(bucket) || 'unknown';
  }

  function renameCandidateItems(plan) {
    var buckets = safeObject(safeObject(plan).buckets);
    var order = ['proposalEligible', 'needsPreview', 'conflicted', 'blocked', 'stale', 'replay'];
    var items = [];
    order.forEach(function (bucket) {
      asArray(buckets[bucket]).forEach(function (entry) {
        if (!isRenameOnlyEntry(entry)) return;
        items.push({ bucket: bucket, entry: safeObject(entry) });
      });
    });
    return items;
  }

  function selectedItem() {
    var items = renameCandidateItems(safeObject(state.snapshot && state.snapshot.plan));
    if (!items.length) return null;
    var index = Math.max(0, Math.min(state.selectedIndex || 0, items.length - 1));
    return items[index];
  }

  function selectedEntry() {
    var item = selectedItem();
    return item ? safeObject(item.entry) : null;
  }

  function firstHash(row, keys) {
    var obj = safeObject(row);
    for (var i = 0; i < keys.length; i += 1) {
      var text = cleanString(obj[keys[i]]).toLowerCase();
      if (text) return text;
    }
    return '';
  }

  function targetNameHashFromMaterialization() {
    return cleanString(safeObject(state.materialization).targetNameHash).toLowerCase();
  }

  function enrichedRenameResult(result, entry) {
    var row = Object.assign({}, safeObject(result));
    row.preStateHash = firstHash(entry, ['baseHash', 'localRevisionHash', 'preStateHash']);
    row.postStateHash = firstHash(entry, ['targetHash', 'remoteRevisionHash', 'revisionHash', 'postStateHash']);
    row.targetNameHash = targetNameHashFromMaterialization();
    row.predicateVersion = cleanString(row.predicateVersion) || 'h2o.folder-sync.rename-predicate.v1';
    return row;
  }

  function rowSummary(item, index) {
    var row = safeObject(item && item.entry);
    var platform = safeObject(row.sourcePlatform);
    var selected = index === (state.selectedIndex || 0);
    return '<article class="h2oRenameConvRow' + (selected ? ' h2oRenameConvRowSelected' : '') + '">' +
      '<div><strong>' + (selected ? 'selected subject' : 'subject') + '</strong> ' +
      escapeHtml(shortHash(row.subjectId)) + ' <strong>bucket</strong> ' +
      escapeHtml(sourceBucketLabel(item && item.bucket)) + '</div>' +
      '<div><strong>local</strong> ' + escapeHtml(shortHash(row.localRevisionHash || row.baseHash)) +
      ' <strong>remote</strong> ' + escapeHtml(shortHash(row.remoteRevisionHash || row.targetHash || row.revisionHash)) + '</div>' +
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
        blockers: codeList(fallback.blockers).concat(['rename-convergence-ui-call-failed'])
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
    var items = renameCandidateItems(plan);
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
      '#h2o-rename-convergence-launcher{position:fixed;right:18px;bottom:160px;z-index:2147482598;border:1px solid rgba(148,163,184,.45);border-radius:999px;padding:10px 14px;background:var(--wb-panel,#151923);color:var(--wb-text,#f8fafc);font:650 13px/1.2 system-ui,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.24);cursor:pointer}',
      '#h2o-rename-convergence-panel{position:fixed;right:18px;top:64px;width:min(1060px,calc(100vw - 36px));max-height:calc(100vh - 84px);z-index:2147482604;overflow:auto;border:1px solid rgba(148,163,184,.35);border-radius:20px;background:var(--wb-surface,#10141d);color:var(--wb-text,#f8fafc);box-shadow:0 24px 90px rgba(0,0,0,.38);font:13px/1.45 system-ui,sans-serif}',
      '#h2o-rename-convergence-panel *{box-sizing:border-box}',
      '.h2oRenameConvHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid rgba(148,163,184,.22)}',
      '.h2oRenameConvBody{padding:18px 20px 22px}',
      '.h2oRenameConvKicker{margin:0 0 4px;color:var(--wb-muted,#94a3b8);font-size:12px;text-transform:uppercase;letter-spacing:.08em}',
      '.h2oRenameConvTitle{margin:0;font-size:20px;line-height:1.15}',
      '.h2oRenameConvNote{margin:8px 0 0;color:var(--wb-muted,#94a3b8)}',
      '.h2oRenameConvControls{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}',
      '.h2oRenameConvBtn{border:1px solid rgba(148,163,184,.34);border-radius:12px;background:rgba(148,163,184,.12);color:inherit;padding:9px 12px;font-weight:650;cursor:pointer}',
      '.h2oRenameConvClose{min-width:38px;height:38px;padding:0;border-radius:999px;font-size:20px;line-height:1}',
      '#h2o-rename-convergence-panel[data-settings-hosted="true"] .h2oRenameConvClose{display:none}',
      '.h2oRenameConvBtn[disabled]{opacity:.55;cursor:not-allowed}',
      '.h2oRenameConvPrimary{background:rgba(59,130,246,.24);border-color:rgba(96,165,250,.5)}',
      '.h2oRenameConvApply{background:rgba(34,197,94,.18);border-color:rgba(74,222,128,.42)}',
      '.h2oRenameConvGrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:14px 0}',
      '.h2oRenameConvMetric{border:1px solid rgba(148,163,184,.22);border-radius:16px;padding:12px;background:rgba(148,163,184,.08)}',
      '.h2oRenameConvValue{display:block;font-size:22px;font-weight:800;line-height:1.05}',
      '.h2oRenameConvLabel{display:block;color:var(--wb-muted,#94a3b8);font-size:12px;margin-top:4px}',
      '.h2oRenameConvSection{border:1px solid rgba(148,163,184,.22);border-radius:16px;margin:10px 0;background:rgba(148,163,184,.06);padding:12px 14px}',
      '.h2oRenameConvSection h3{margin:0 0 8px;font-size:15px}',
      '.h2oRenameConvRows{display:grid;gap:8px}',
      '.h2oRenameConvRow{border:1px solid rgba(148,163,184,.18);border-radius:14px;padding:10px;background:rgba(2,6,23,.18);word-break:break-word}',
      '.h2oRenameConvRowSelected{border-color:rgba(96,165,250,.65);box-shadow:0 0 0 1px rgba(96,165,250,.25) inset}',
      '.h2oRenameConvCodes{margin:6px 0 0;color:var(--wb-muted,#94a3b8)}',
      '.h2oRenameConvField{display:grid;gap:6px;margin:10px 0}',
      '.h2oRenameConvField label{font-weight:700}',
      '.h2oRenameConvInput{width:100%;border:1px solid rgba(148,163,184,.34);border-radius:12px;background:rgba(2,6,23,.18);color:inherit;padding:10px 12px;font:inherit}',
      '@media(max-width:860px){.h2oRenameConvGrid{grid-template-columns:repeat(2,minmax(0,1fr))}#h2o-rename-convergence-panel{right:10px;top:54px;width:calc(100vw - 20px)}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function renderRenameProposalCandidate(plan) {
    var items = renameCandidateItems(plan);
    var rows = items.length
      ? items.slice(0, 12).map(rowSummary).join('')
      : '<p class="h2oRenameConvNote">No rename-only planner entries are currently available. Rename action requires changedFields === ["name"].</p>';
    return '<section class="h2oRenameConvSection"><h3>Rename Proposal Candidate</h3>' +
      '<p class="h2oRenameConvNote">One folder at a time. This panel uses the first rename-only planner entry and does not create proposal, publication, or transport artifacts.</p>' +
      '<div class="h2oRenameConvField">' +
      '<label for="h2o-rename-convergence-name">Proposed name</label>' +
      '<input id="h2o-rename-convergence-name" class="h2oRenameConvInput" type="text" autocomplete="off" spellcheck="false" value="' +
      escapeHtml(state.proposedName) + '" placeholder="Local-only rename materialization input">' +
      '<p class="h2oRenameConvNote">Local input only. The panel does not persist or display the cleartext name in result sections.</p>' +
      '</div>' +
      '<div class="h2oRenameConvRows">' + rows + '</div>' +
      codes('plan blockers', safeObject(plan).blockers) +
      codes('plan warnings', safeObject(plan).warnings) +
      '</section>';
  }

  function renderMaterialization(result) {
    var r = safeObject(result);
    if (!result) {
      return '<section class="h2oRenameConvSection"><h3>Materialization Result</h3>' +
        '<p class="h2oRenameConvNote">No materialization check has been run for the selected rename candidate.</p></section>';
    }
    return '<section class="h2oRenameConvSection"><h3>Materialization Result</h3>' +
      '<div class="h2oRenameConvGrid">' +
      metric('ok', boolText(r.ok)) +
      metric('hash match', boolText(r.hashMatches)) +
      metric('duplicate sibling', boolText(r.duplicateSiblingExists)) +
      metric('parent stable', boolText(r.parentStable)) +
      metric('subject resolved', boolText(r.subjectResolved)) +
      '</div><div class="h2oRenameConvGrid">' +
      metric('watermark safe', boolText(r.watermarkSafe)) +
      metric('replay safe', boolText(r.replaySafe)) +
      metric('consumed safe', boolText(r.consumedSafe)) +
      metric('target name hash', shortHash(r.targetNameHash)) +
      metric('normalized hash', shortHash(r.normalizedNameHash)) +
      '</div>' +
      codes('materialization blockers', r.blockers) +
      codes('materialization warnings', r.warnings) +
      '</section>';
  }

  function renderPreflight(result) {
    var r = safeObject(result);
    if (!result) {
      return '<section class="h2oRenameConvSection"><h3>Rename Preflight Result</h3>' +
        '<p class="h2oRenameConvNote">No rename preflight has been run for the selected candidate.</p></section>';
    }
    return '<section class="h2oRenameConvSection"><h3>Rename Preflight Result</h3>' +
      '<div class="h2oRenameConvGrid">' +
      metric('actionable', boolText(r.actionable)) +
      metric('hash verified', boolText(r.hashVerified)) +
      metric('duplicate sibling', boolText(r.duplicateSiblingExists)) +
      metric('parent stable', boolText(r.parentStable)) +
      metric('subject resolved', boolText(r.subjectResolved)) +
      '</div><div class="h2oRenameConvGrid">' +
      metric('rename vs move', boolText(r.renameVsMoveConflict)) +
      metric('rename vs delete', boolText(r.renameVsDeleteConflict)) +
      metric('watermark safe', boolText(r.watermarkSafe)) +
      metric('replay safe', boolText(r.replaySafe)) +
      metric('consumed safe', boolText(r.consumedSafe)) +
      '</div>' +
      codes('preflight blockers', r.blockers) +
      codes('preflight warnings', r.warnings) +
      '</section>';
  }

  function renderApplyStatus(renameResult, bookkeepingResult) {
    var r = safeObject(renameResult);
    var b = safeObject(bookkeepingResult);
    var applyEvent = safeObject(b.applyEvent || r.applyEvent);
    if (!renameResult && !bookkeepingResult) {
      return '<section class="h2oRenameConvSection"><h3>Rename Apply Status</h3>' +
        '<p class="h2oRenameConvNote">No local rename convergence action has been executed from this panel.</p></section>';
    }
    return '<section class="h2oRenameConvSection"><h3>Rename Apply Status</h3>' +
      '<div class="h2oRenameConvGrid">' +
      metric('action ok', boolText(r.ok)) +
      metric('renamed', boolText(r.renamed)) +
      metric('applyEvent', applyEvent.kind === 'applyEvent' ? 'yes' : 'no') +
      metric('dryRun', boolText(applyEvent.dryRun)) +
      metric('subject', shortHash(r.subjectId || applyEvent.subjectId)) +
      '</div>' +
      '<p class="h2oRenameConvNote">event ' + escapeHtml(shortHash(applyEvent.eventDigest)) +
      ' / lineage ' + escapeHtml(shortHash(r.lineageId || applyEvent.lineageId)) + '</p>' +
      codes('rename blockers', r.blockers) +
      codes('rename warnings', r.warnings) +
      codes('bookkeeping blockers', b.blockers) +
      codes('bookkeeping warnings', b.warnings) +
      '</section>';
  }

  function recentRows(rows, fields) {
    var list = asArray(rows).slice(-6).reverse();
    if (!list.length) return '<p class="h2oRenameConvNote">No rows recorded.</p>';
    return '<div class="h2oRenameConvRows">' + list.map(function (row) {
      var r = safeObject(row);
      return '<article class="h2oRenameConvRow">' +
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
    return '<section class="h2oRenameConvSection"><h3>Consumed Ledger Status</h3>' +
      '<div class="h2oRenameConvGrid">' +
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
    return '<section class="h2oRenameConvSection"><h3>Watermark Status</h3>' +
      '<div class="h2oRenameConvGrid">' +
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

  function renderRecentRenameActions(snapshot) {
    var consumed = safeObject(snapshot && snapshot.consumed);
    var watermarks = safeObject(snapshot && snapshot.watermarks);
    return '<section class="h2oRenameConvSection"><h3>Recent Rename Actions</h3>' +
      '<p class="h2oRenameConvNote">Recent rename consumed-operation rows:</p>' +
      recentRows(asArray(consumed.rows).filter(function (row) {
        return cleanString(row && row.operationKind) === 'folder.rename';
      }), [
        { label: 'status', key: 'consumedStatus' },
        { label: 'subject', key: 'subjectId', hash: true },
        { label: 'event', key: 'eventDigest', hash: true },
        { label: 'lineage', key: 'lineageId', hash: true }
      ]) +
      '<p class="h2oRenameConvNote">Recent watermark rows:</p>' +
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
    var items = renameCandidateItems(plan);
    var hasName = cleanString(state.proposedName).length > 0;
    var canRun = !state.busy && !!selectedEntry() && hasName;
    var canExecute = canRun &&
      safeObject(state.materialization).ok === true &&
      !!targetNameHashFromMaterialization() &&
      safeObject(state.preflight).actionable === true;
    return '<div class="h2oRenameConvHeader"><div>' +
      '<p class="h2oRenameConvKicker">F10.9.7 operator action surface</p>' +
      '<h2 class="h2oRenameConvTitle">Rename convergence review</h2>' +
      '<p class="h2oRenameConvNote">UI only. One rename-only subject at a time. No batch rename, auto refresh, publication, transport, or remote mutation.</p>' +
      '</div><div class="h2oRenameConvControls">' +
      '<a class="h2oRenameConvBtn" href="#/settings/convergence/rename">Open in Settings</a>' +
      '<button class="h2oRenameConvBtn" id="h2o-rename-convergence-refresh" type="button" ' + (state.busy ? 'disabled' : '') + '>Refresh</button>' +
      '<button class="h2oRenameConvBtn h2oRenameConvPrimary" id="h2o-rename-convergence-materialize" type="button" ' + (canRun ? '' : 'disabled') + '>Run Materialization Check</button>' +
      '<button class="h2oRenameConvBtn h2oRenameConvPrimary" id="h2o-rename-convergence-preflight" type="button" ' + (canRun ? '' : 'disabled') + '>Run Rename Preflight</button>' +
      '<button class="h2oRenameConvBtn h2oRenameConvApply" id="h2o-rename-convergence-execute" type="button" ' + (canExecute ? '' : 'disabled') + '>Execute Rename Convergence</button>' +
      '<button class="h2oRenameConvBtn h2oRenameConvClose" id="h2o-rename-convergence-close" type="button" aria-label="Close Rename Convergence panel" title="Close">×</button>' +
      '</div></div><div class="h2oRenameConvBody">' +
      (state.message ? '<p class="h2oRenameConvNote">' + escapeHtml(state.message) + '</p>' : '') +
      '<div class="h2oRenameConvGrid">' +
      metric('rename candidates', items.length) +
      metric('proposalEligible', counts.proposalEligible || 0) +
      metric('needsPreview', counts.needsPreview || 0) +
      metric('conflicted', counts.conflicted || 0) +
      metric('blocked', counts.blocked || 0) +
      '</div>' +
      renderRenameProposalCandidate(plan) +
      renderMaterialization(state.materialization) +
      renderPreflight(state.preflight) +
      renderApplyStatus(state.renameResult, state.bookkeepingResult) +
      renderConsumedStatus(snapshot, state.bookkeepingResult) +
      renderWatermarkStatus(snapshot, state.bookkeepingResult) +
      renderRecentRenameActions(snapshot) +
      '</div>';
  }

  function bindPanel() {
    var close = document.getElementById('h2o-rename-convergence-close');
    var refresh = document.getElementById('h2o-rename-convergence-refresh');
    var materialize = document.getElementById('h2o-rename-convergence-materialize');
    var preflight = document.getElementById('h2o-rename-convergence-preflight');
    var execute = document.getElementById('h2o-rename-convergence-execute');
    var nameInput = document.getElementById('h2o-rename-convergence-name');
    if (close) close.addEventListener('click', closeRenameConvergencePanel);
    if (refresh) refresh.addEventListener('click', function () { refreshRenameConvergencePanel(); });
    if (materialize) materialize.addEventListener('click', function () { runSelectedMaterialization(); });
    if (preflight) preflight.addEventListener('click', function () { runSelectedRenamePreflight(); });
    if (execute) execute.addEventListener('click', function () { executeSelectedRenameConvergence(); });
    if (nameInput) nameInput.addEventListener('input', function () {
      state.proposedName = String(nameInput.value || '');
      state.materialization = null;
      state.preflight = null;
      state.renameResult = null;
      state.bookkeepingResult = null;
      state.message = 'Local rename input changed; rerun materialization and preflight.';
      var canRun = !state.busy && !!selectedEntry() && !!cleanString(state.proposedName);
      if (materialize) materialize.disabled = !canRun;
      if (preflight) preflight.disabled = !canRun;
      if (execute) execute.disabled = true;
    });
  }

  function ensurePanel() {
    injectStyle();
    var panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Rename convergence review');
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

  async function openRenameConvergencePanel() {
    state.open = true;
    state.message = '';
    await refreshRenameConvergencePanel();
    return state.snapshot;
  }

  function closeRenameConvergencePanel() {
    state.open = false;
    var panel = document.getElementById(PANEL_ID);
    if (panel) panel.remove();
  }

  async function refreshRenameConvergencePanel() {
    state.busy = true;
    state.message = 'Refreshing rename convergence status...';
    if (state.open) await renderPanel();
    state.snapshot = await collectSnapshot();
    state.materialization = null;
    state.preflight = null;
    state.renameResult = null;
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
    state.message = 'Running rename materialization check...';
    if (state.open) await renderPanel();
    if (!entry) {
      state.materialization = { ok: false, blockers: ['rename-entry-required'], warnings: [] };
    } else if (!cleanString(state.proposedName)) {
      state.materialization = { ok: false, blockers: ['proposed-name-required'], warnings: [] };
    } else if (!sync || typeof sync.checkRenameMaterialization !== 'function') {
      state.materialization = { ok: false, blockers: ['rename-materialization-unavailable'], warnings: [] };
    } else {
      try {
        state.materialization = safeObject(await sync.checkRenameMaterialization({
          plannerEntry: entry,
          proposedName: state.proposedName
        }));
      } catch (_) {
        state.materialization = { ok: false, blockers: ['rename-materialization-failed'], warnings: [] };
      }
    }
    state.preflight = null;
    state.renameResult = null;
    state.bookkeepingResult = null;
    state.message = 'Materialization check complete.';
    state.busy = false;
    if (state.open) await renderPanel();
    return state.materialization;
  }

  async function runSelectedRenamePreflight() {
    var sync = H2O.Desktop.Sync;
    var entry = selectedEntry();
    state.busy = true;
    state.message = 'Running rename preflight...';
    if (state.open) await renderPanel();
    if (!entry) {
      state.preflight = { ok: false, actionable: false, blockers: ['rename-entry-required'], warnings: [] };
    } else if (!cleanString(state.proposedName)) {
      state.preflight = { ok: false, actionable: false, blockers: ['proposed-name-required'], warnings: [] };
    } else if (!sync || typeof sync.runRenameConvergencePreflight !== 'function') {
      state.preflight = { ok: false, actionable: false, blockers: ['rename-preflight-unavailable'], warnings: [] };
    } else {
      try {
        state.preflight = safeObject(await sync.runRenameConvergencePreflight({
          plannerEntry: entry,
          proposedName: state.proposedName
        }));
      } catch (_) {
        state.preflight = { ok: false, actionable: false, blockers: ['rename-preflight-failed'], warnings: [] };
      }
    }
    state.renameResult = null;
    state.bookkeepingResult = null;
    state.message = 'Rename preflight complete.';
    state.busy = false;
    if (state.open) await renderPanel();
    return state.preflight;
  }

  async function executeSelectedRenameConvergence() {
    var sync = H2O.Desktop.Sync;
    var entry = selectedEntry();
    state.busy = true;
    state.message = 'Executing one local rename convergence action...';
    if (state.open) await renderPanel();
    if (!entry) {
      state.renameResult = { ok: false, renamed: false, blockers: ['rename-entry-required'], warnings: [] };
    } else if (!state.preflight || state.preflight.actionable !== true) {
      state.renameResult = { ok: false, renamed: false, blockers: ['actionable-rename-preflight-required'], warnings: [] };
    } else if (!state.materialization || state.materialization.ok !== true || !targetNameHashFromMaterialization()) {
      state.renameResult = { ok: false, renamed: false, blockers: ['rename-materialization-result-required'], warnings: [] };
    } else if (!sync || typeof sync.executeRenameConvergence !== 'function') {
      state.renameResult = { ok: false, renamed: false, blockers: ['rename-convergence-action-unavailable'], warnings: [] };
    } else {
      try {
        state.renameResult = safeObject(await sync.executeRenameConvergence({
          plannerEntry: entry,
          proposedName: state.proposedName,
          operatorApprovalToken: cleanString(sync.__renameConvergenceApprovalToken)
        }));
      } catch (_) {
        state.renameResult = { ok: false, renamed: false, blockers: ['rename-convergence-action-failed'], warnings: [] };
      }
    }

    if (state.renameResult && state.renameResult.renamed === true) {
      if (!sync || typeof sync.finalizeRenameConvergence !== 'function') {
        state.bookkeepingResult = { ok: false, blockers: ['rename-bookkeeping-unavailable'], warnings: [] };
      } else {
        try {
          state.bookkeepingResult = safeObject(await sync.finalizeRenameConvergence({
            renameResult: enrichedRenameResult(state.renameResult, entry)
          }));
        } catch (_) {
          state.bookkeepingResult = { ok: false, blockers: ['rename-bookkeeping-failed'], warnings: [] };
        }
      }
    } else {
      state.bookkeepingResult = null;
    }

    state.snapshot = await collectSnapshot();
    state.message = state.renameResult && state.renameResult.renamed === true
      ? 'Local rename convergence action completed; bookkeeping status updated.'
      : 'Local rename convergence action did not apply.';
    state.busy = false;
    if (state.open) await renderPanel();
    return {
      renameResult: state.renameResult,
      bookkeepingResult: state.bookkeepingResult
    };
  }

  function installLauncher() {
    if (typeof document === 'undefined' || !document.body || document.getElementById(LAUNCHER_ID)) return;
    injectStyle();
    var button = document.createElement('button');
    button.id = LAUNCHER_ID;
    button.type = 'button';
    button.textContent = 'Rename Convergence';
    button.setAttribute('aria-label', 'Open rename convergence panel');
    button.addEventListener('click', function () { openRenameConvergencePanel(); });
    document.body.appendChild(button);
  }

  function removeLauncher() {
    if (typeof document === 'undefined') return;
    var button = document.getElementById(LAUNCHER_ID);
    if (button) button.remove();
  }

  function bootLauncher() {
    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', installLauncher, { once: true });
    } else {
      installLauncher();
    }
  }

  H2O.Desktop.Sync.openRenameConvergencePanel = openRenameConvergencePanel;
  H2O.Desktop.Sync.closeRenameConvergencePanel = closeRenameConvergencePanel;
  H2O.Desktop.Sync.refreshRenameConvergencePanel = refreshRenameConvergencePanel;
  H2O.Desktop.Sync.installRenameConvergenceLauncher = installLauncher;
  H2O.Desktop.Sync.removeRenameConvergenceLauncher = removeLauncher;
  H2O.Desktop.Sync.__renameConvergenceUiInstalled = true;
  H2O.Desktop.Sync.__renameConvergenceUiVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
