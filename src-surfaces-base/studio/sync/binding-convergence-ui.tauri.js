/* H2O Desktop Sync - F13.0.7 binding convergence action UI
 *
 * Desktop/Tauri-only operator surface for one reviewed binding-add convergence
 * action.
 *
 * Safety invariants:
 *   - UI only. This module adds no binding logic, apply logic, bookkeeping
 *     logic, publication, WebDAV, inbox/outbox, transport, mobile write-back,
 *     or convergence algorithm.
 *   - Calls existing APIs only:
 *       checkBindingIdentityAndCardinality()
 *       checkBindingMaterialization()
 *       runBindingConvergencePreflight()
 *       executeReviewedBindingAdd()
 *       buildBindingApplyEvent()
 *       finalizeBindingConvergence()
 *       listConsumedOperations()
 *       getConvergenceWatermarks()
 *   - Operator actions are explicit button clicks. No timers, polling,
 *     automatic refresh, automatic binding, batch binding, auto merge,
 *     publication, or transport.
 *   - The panel works on one binding candidate at a time.
 *   - Rendered details are redacted: hashes/counts/status only; no raw names,
 *     chat IDs, folder IDs, paths, URLs, tokens, or content.
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
  if (H2O.Desktop.Sync.__bindingConvergenceUiInstalled) return;

  var VERSION = '0.1.0-f13.0.7';
  var PANEL_ID = 'h2o-binding-convergence-panel';
  var LAUNCHER_ID = 'h2o-binding-convergence-launcher';
  var STYLE_ID = 'h2o-binding-convergence-style';
  var HASH_RE = /^[0-9a-f]{64}$/;

  var state = {
    open: false,
    busy: false,
    snapshot: null,
    chatSubjectId: '',
    folderSubjectId: '',
    candidateId: '',
    identity: null,
    materialization: null,
    preflight: null,
    bindResult: null,
    applyEventResult: null,
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

  function cleanLower(value) {
    return cleanString(value).toLowerCase();
  }

  function isSha256Hex(value) {
    return HASH_RE.test(cleanLower(value));
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
    return '<p class="h2oBindConvCodes"><strong>' + escapeHtml(label) + ':</strong> ' +
      list.map(escapeHtml).join(', ') + '</p>';
  }

  function metric(label, value) {
    return '<div class="h2oBindConvMetric"><span class="h2oBindConvValue">' +
      escapeHtml(value == null ? 0 : value) + '</span><span class="h2oBindConvLabel">' +
      escapeHtml(label) + '</span></div>';
  }

  function inputField(id, label, value, placeholder) {
    return '<div class="h2oBindConvField">' +
      '<label for="' + escapeHtml(id) + '">' + escapeHtml(label) + '</label>' +
      '<input id="' + escapeHtml(id) + '" class="h2oBindConvInput" type="text" autocomplete="off" spellcheck="false" value="' +
      escapeHtml(value) + '" placeholder="' + escapeHtml(placeholder || '') + '">' +
      '</div>';
  }

  function bindingInputReady() {
    return isSha256Hex(state.chatSubjectId) && isSha256Hex(state.folderSubjectId);
  }

  async function safeCall(fn, fallback) {
    if (typeof fn !== 'function') return fallback;
    try {
      var result = await fn();
      return result || fallback;
    } catch (_) {
      return Object.assign({}, fallback, {
        ok: false,
        blockers: codeList(fallback.blockers).concat(['binding-convergence-ui-call-failed'])
      });
    }
  }

  async function collectSnapshot() {
    var sync = H2O.Desktop.Sync;
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
    return {
      generatedAtIso: nowIsoSeconds(),
      consumed: safeObject(consumed),
      watermarks: safeObject(watermarks)
    };
  }

  function injectStyle() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#h2o-binding-convergence-launcher{position:fixed;right:18px;bottom:310px;z-index:2147482598;border:1px solid rgba(45,212,191,.45);border-radius:999px;padding:10px 14px;background:var(--wb-panel,#151923);color:var(--wb-text,#f8fafc);font:650 13px/1.2 system-ui,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.24);cursor:pointer}',
      '#h2o-binding-convergence-panel{position:fixed;right:18px;top:64px;width:min(1080px,calc(100vw - 36px));max-height:calc(100vh - 84px);z-index:2147482607;overflow:auto;border:1px solid rgba(45,212,191,.35);border-radius:20px;background:var(--wb-surface,#10141d);color:var(--wb-text,#f8fafc);box-shadow:0 24px 90px rgba(0,0,0,.38);font:13px/1.45 system-ui,sans-serif}',
      '#h2o-binding-convergence-panel *{box-sizing:border-box}',
      '.h2oBindConvHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid rgba(148,163,184,.22)}',
      '.h2oBindConvBody{padding:18px 20px 22px}',
      '.h2oBindConvKicker{margin:0 0 4px;color:var(--wb-muted,#94a3b8);font-size:12px;text-transform:uppercase;letter-spacing:.08em}',
      '.h2oBindConvTitle{margin:0;font-size:20px;line-height:1.15}',
      '.h2oBindConvNote{margin:8px 0 0;color:var(--wb-muted,#94a3b8)}',
      '.h2oBindConvControls{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}',
      '.h2oBindConvBtn{border:1px solid rgba(148,163,184,.34);border-radius:12px;background:rgba(148,163,184,.12);color:inherit;padding:9px 12px;font-weight:650;cursor:pointer}',
      '.h2oBindConvBtn[disabled]{opacity:.55;cursor:not-allowed}',
      '.h2oBindConvPrimary{background:rgba(59,130,246,.24);border-color:rgba(96,165,250,.5)}',
      '.h2oBindConvApply{background:rgba(20,184,166,.20);border-color:rgba(45,212,191,.46)}',
      '.h2oBindConvGrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:14px 0}',
      '.h2oBindConvMetric{border:1px solid rgba(148,163,184,.22);border-radius:16px;padding:12px;background:rgba(148,163,184,.08)}',
      '.h2oBindConvValue{display:block;font-size:22px;font-weight:800;line-height:1.05}',
      '.h2oBindConvLabel{display:block;color:var(--wb-muted,#94a3b8);font-size:12px;margin-top:4px}',
      '.h2oBindConvSection{border:1px solid rgba(148,163,184,.22);border-radius:16px;margin:10px 0;background:rgba(148,163,184,.06);padding:12px 14px}',
      '.h2oBindConvSection h3{margin:0 0 8px;font-size:15px}',
      '.h2oBindConvRows{display:grid;gap:8px}',
      '.h2oBindConvRow{border:1px solid rgba(148,163,184,.18);border-radius:14px;padding:10px;background:rgba(2,6,23,.18);word-break:break-word}',
      '.h2oBindConvCodes{margin:6px 0 0;color:var(--wb-muted,#94a3b8)}',
      '.h2oBindConvField{display:grid;gap:6px;margin:10px 0}',
      '.h2oBindConvField label{font-weight:700}',
      '.h2oBindConvInput{width:100%;border:1px solid rgba(148,163,184,.34);border-radius:12px;background:rgba(2,6,23,.18);color:inherit;padding:10px 12px;font:inherit}',
      '@media(max-width:860px){.h2oBindConvGrid{grid-template-columns:repeat(2,minmax(0,1fr))}#h2o-binding-convergence-panel{right:10px;top:54px;width:calc(100vw - 20px)}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function renderIdentity(result) {
    var r = safeObject(result);
    return '<section class="h2oBindConvSection"><h3>Binding Identity / Cardinality</h3>' +
      '<p class="h2oBindConvNote">Enter redacted subject hashes only. This panel never asks for raw chat IDs, folder IDs, titles, or names.</p>' +
      inputField('h2o-binding-convergence-chat', 'Chat subject id', state.chatSubjectId, '64-char chat subject hash') +
      inputField('h2o-binding-convergence-folder', 'Folder subject id', state.folderSubjectId, '64-char folder subject hash') +
      (!result
        ? '<p class="h2oBindConvNote">No identity/cardinality check has been run.</p>'
        : '<div class="h2oBindConvGrid">' +
          metric('ok', boolText(r.ok)) +
          metric('canonical', boolText(r.canonicalOrderVerified)) +
          metric('chat resolved', boolText(r.chatResolved)) +
          metric('folder resolved', boolText(r.folderResolved)) +
          metric('policy', r.cardinalityPolicy || 'unknown') +
          '</div><div class="h2oBindConvGrid">' +
          metric('binding', shortHash(r.bindingSubjectId)) +
          metric('existing binding', r.existingBindingCount == null ? 'unknown' : r.existingBindingCount) +
          metric('chat folders', r.existingFolderCountForChat == null ? 'unknown' : r.existingFolderCountForChat) +
          metric('policy satisfied', boolText(r.policySatisfied)) +
          metric('warnings', codeList(r.warnings).length) +
          '</div>' +
          codes('identity blockers', r.blockers) +
          codes('identity warnings', r.warnings)) +
      '</section>';
  }

  function renderMaterialization(result) {
    var r = safeObject(result);
    if (!result) {
      return '<section class="h2oBindConvSection"><h3>Binding Materialization Result</h3>' +
        '<p class="h2oBindConvNote">No binding materialization check has been run.</p></section>';
    }
    return '<section class="h2oBindConvSection"><h3>Binding Materialization Result</h3>' +
      '<div class="h2oBindConvGrid">' +
      metric('ok', boolText(r.ok)) +
      metric('chat resolved', boolText(r.chatResolved)) +
      metric('folder resolved', boolText(r.folderResolved)) +
      metric('chat live', boolText(r.chatLive)) +
      metric('folder live', boolText(r.folderLive)) +
      '</div><div class="h2oBindConvGrid">' +
      metric('duplicate', boolText(r.duplicateBinding)) +
      metric('cardinality', boolText(r.cardinalitySatisfied)) +
      metric('tombstone safe', boolText(r.tombstoneSafe)) +
      metric('orphan safe', boolText(r.orphanSafe)) +
      metric('binding', shortHash(r.bindingSubjectId)) +
      '</div>' +
      codes('materialization blockers', r.blockers) +
      codes('materialization warnings', r.warnings) +
      '</section>';
  }

  function renderPreflight(result) {
    var r = safeObject(result);
    if (!result) {
      return '<section class="h2oBindConvSection"><h3>Binding Preflight Result</h3>' +
        '<p class="h2oBindConvNote">No binding preflight has been run.</p></section>';
    }
    return '<section class="h2oBindConvSection"><h3>Binding Preflight Result</h3>' +
      '<div class="h2oBindConvGrid">' +
      metric('actionable', boolText(r.actionable)) +
      metric('chat resolved', boolText(r.chatResolved)) +
      metric('folder resolved', boolText(r.folderResolved)) +
      metric('duplicate', boolText(r.duplicateBinding)) +
      metric('cardinality', boolText(r.cardinalitySatisfied)) +
      '</div><div class="h2oBindConvGrid">' +
      metric('tombstone safe', boolText(r.tombstoneSafe)) +
      metric('orphan safe', boolText(r.orphanSafe)) +
      metric('watermark safe', boolText(r.watermarkSafe)) +
      metric('replay safe', boolText(r.replaySafe)) +
      metric('consumed safe', boolText(r.consumedSafe)) +
      '</div><div class="h2oBindConvGrid">' +
      metric('ok', boolText(r.ok)) +
      metric('binding', shortHash(r.bindingSubjectId)) +
      metric('blockers', codeList(r.blockers).length) +
      metric('warnings', codeList(r.warnings).length) +
      metric('mode', 'manual') +
      '</div>' +
      codes('preflight blockers', r.blockers) +
      codes('preflight warnings', r.warnings) +
      '</section>';
  }

  function renderProposalCandidate() {
    return '<section class="h2oBindConvSection"><h3>Binding Proposal Candidate</h3>' +
      '<p class="h2oBindConvNote">Use an existing generated binding proposal candidate id. This UI does not create, publish, enqueue, upload, or transport candidates.</p>' +
      inputField('h2o-binding-convergence-candidate', 'Binding proposal candidate id', state.candidateId, 'generated candidate id required for reviewed bind add') +
      '<div class="h2oBindConvGrid">' +
      metric('candidate id', shortHash(state.candidateId)) +
      metric('candidate ready', boolText(!!cleanString(state.candidateId))) +
      metric('candidate kind', 'proposal') +
      metric('subject type', 'folderBinding') +
      metric('operation', 'create') +
      '</div>' +
      '</section>';
  }

  function renderApplyStatus(bindResult, applyEventResult, bookkeepingResult) {
    var r = safeObject(bindResult);
    var e = safeObject(applyEventResult);
    var b = safeObject(bookkeepingResult);
    var applyEvent = safeObject(b.applyEvent || e.applyEvent);
    if (!bindResult && !applyEventResult && !bookkeepingResult) {
      return '<section class="h2oBindConvSection"><h3>Binding Apply Status</h3>' +
        '<p class="h2oBindConvNote">No reviewed binding add has been executed from this panel.</p></section>';
    }
    return '<section class="h2oBindConvSection"><h3>Binding Apply Status</h3>' +
      '<div class="h2oBindConvGrid">' +
      metric('action ok', boolText(r.ok)) +
      metric('bound', boolText(r.bound)) +
      metric('applyEvent', applyEvent.kind === 'applyEvent' ? 'yes' : 'no') +
      metric('dryRun', boolText(applyEvent.dryRun)) +
      metric('bookkeeping', boolText(b.ok)) +
      '</div><div class="h2oBindConvGrid">' +
      metric('binding', shortHash(r.bindingSubjectId || applyEvent.subjectId)) +
      metric('chat', shortHash(r.chatSubjectId)) +
      metric('folder', shortHash(r.folderSubjectId)) +
      metric('lineage', shortHash(r.lineageId || applyEvent.lineageId)) +
      metric('event', shortHash(applyEvent.eventDigest)) +
      '</div><div class="h2oBindConvGrid">' +
      metric('pre hash', shortHash(r.preStateHash)) +
      metric('post hash', shortHash(r.postStateHash)) +
      metric('audit', shortHash(r.auditMaintenanceId)) +
      metric('transaction', shortHash(r.transactionId)) +
      metric('subject', shortHash(r.subjectId)) +
      '</div>' +
      codes('binding blockers', r.blockers) +
      codes('binding warnings', r.warnings) +
      codes('applyEvent blockers', e.blockers) +
      codes('applyEvent warnings', e.warnings) +
      codes('bookkeeping blockers', b.blockers) +
      codes('bookkeeping warnings', b.warnings) +
      '</section>';
  }

  function recentRows(rows, fields) {
    var list = asArray(rows).slice(-6).reverse();
    if (!list.length) return '<p class="h2oBindConvNote">No rows recorded.</p>';
    return '<div class="h2oBindConvRows">' + list.map(function (row) {
      var r = safeObject(row);
      return '<article class="h2oBindConvRow">' +
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
    return '<section class="h2oBindConvSection"><h3>Consumed Ledger Status</h3>' +
      '<div class="h2oBindConvGrid">' +
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
    return '<section class="h2oBindConvSection"><h3>Watermark Status</h3>' +
      '<div class="h2oBindConvGrid">' +
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

  function renderRecentBindingActions(snapshot) {
    var consumed = safeObject(snapshot && snapshot.consumed);
    var watermarks = safeObject(snapshot && snapshot.watermarks);
    return '<section class="h2oBindConvSection"><h3>Recent Binding Actions</h3>' +
      '<p class="h2oBindConvNote">Recent binding consumed-operation rows:</p>' +
      recentRows(asArray(consumed.rows).filter(function (row) {
        return cleanString(row && row.operationKind) === 'folderBinding.add';
      }), [
        { label: 'status', key: 'consumedStatus' },
        { label: 'subject', key: 'subjectId', hash: true },
        { label: 'event', key: 'eventDigest', hash: true },
        { label: 'lineage', key: 'lineageId', hash: true }
      ]) +
      '<p class="h2oBindConvNote">Recent watermark rows:</p>' +
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
    var consumed = safeObject(snapshot.consumed);
    var watermarks = safeObject(snapshot.watermarks);
    var canRun = !state.busy && bindingInputReady();
    var canExecute = !state.busy && !!cleanString(state.candidateId);
    return '<div class="h2oBindConvHeader"><div>' +
      '<p class="h2oBindConvKicker">F13.0.7 operator action surface</p>' +
      '<h2 class="h2oBindConvTitle">Binding convergence review</h2>' +
      '<p class="h2oBindConvNote">UI only. One binding at a time. No batch binding, auto refresh, publication, transport, or remote mutation.</p>' +
      '</div><div class="h2oBindConvControls">' +
      '<a class="h2oBindConvBtn" href="#/settings/convergence/binding">Open in Settings</a>' +
      '<button class="h2oBindConvBtn" id="h2o-binding-convergence-refresh" type="button" ' + (state.busy ? 'disabled' : '') + '>Refresh</button>' +
      '<button class="h2oBindConvBtn h2oBindConvPrimary" id="h2o-binding-convergence-identity" type="button" ' + (canRun ? '' : 'disabled') + '>Run Identity Check</button>' +
      '<button class="h2oBindConvBtn h2oBindConvPrimary" id="h2o-binding-convergence-materialize" type="button" ' + (canRun ? '' : 'disabled') + '>Run Materialization Check</button>' +
      '<button class="h2oBindConvBtn h2oBindConvPrimary" id="h2o-binding-convergence-preflight" type="button" ' + (canRun ? '' : 'disabled') + '>Run Binding Preflight</button>' +
      '<button class="h2oBindConvBtn h2oBindConvApply" id="h2o-binding-convergence-execute" type="button" ' + (canExecute ? '' : 'disabled') + '>Execute Reviewed Bind Add</button>' +
      '</div></div><div class="h2oBindConvBody">' +
      (state.message ? '<p class="h2oBindConvNote">' + escapeHtml(state.message) + '</p>' : '') +
      '<div class="h2oBindConvGrid">' +
      metric('input ready', boolText(bindingInputReady())) +
      metric('candidate ready', boolText(!!cleanString(state.candidateId))) +
      metric('consumed rows', safeObject(consumed.counts).rows || asArray(consumed.rows).length) +
      metric('watermark rows', safeObject(watermarks.counts).rows || asArray(watermarks.rows).length) +
      metric('busy', boolText(state.busy)) +
      '</div>' +
      renderIdentity(state.identity) +
      renderMaterialization(state.materialization) +
      renderPreflight(state.preflight) +
      renderProposalCandidate() +
      renderApplyStatus(state.bindResult, state.applyEventResult, state.bookkeepingResult) +
      renderConsumedStatus(snapshot, state.bookkeepingResult) +
      renderWatermarkStatus(snapshot, state.bookkeepingResult) +
      renderRecentBindingActions(snapshot) +
      '</div>';
  }

  function bindPanel() {
    var refresh = document.getElementById('h2o-binding-convergence-refresh');
    var identity = document.getElementById('h2o-binding-convergence-identity');
    var materialize = document.getElementById('h2o-binding-convergence-materialize');
    var preflight = document.getElementById('h2o-binding-convergence-preflight');
    var execute = document.getElementById('h2o-binding-convergence-execute');
    var chat = document.getElementById('h2o-binding-convergence-chat');
    var folder = document.getElementById('h2o-binding-convergence-folder');
    var candidate = document.getElementById('h2o-binding-convergence-candidate');
    if (refresh) refresh.addEventListener('click', function () { refreshBindingConvergencePanel(); });
    if (identity) identity.addEventListener('click', function () { runSelectedIdentityCheck(); });
    if (materialize) materialize.addEventListener('click', function () { runSelectedMaterialization(); });
    if (preflight) preflight.addEventListener('click', function () { runSelectedBindingPreflight(); });
    if (execute) execute.addEventListener('click', function () { executeSelectedReviewedBindAdd(); });
    if (chat) chat.addEventListener('input', function () {
      state.chatSubjectId = cleanLower(chat.value);
      state.identity = null;
      state.materialization = null;
      state.preflight = null;
      state.bindResult = null;
      state.applyEventResult = null;
      state.bookkeepingResult = null;
      state.message = 'Chat subject changed; rerun binding checks.';
      updateButtonStates();
    });
    if (folder) folder.addEventListener('input', function () {
      state.folderSubjectId = cleanLower(folder.value);
      state.identity = null;
      state.materialization = null;
      state.preflight = null;
      state.bindResult = null;
      state.applyEventResult = null;
      state.bookkeepingResult = null;
      state.message = 'Folder subject changed; rerun binding checks.';
      updateButtonStates();
    });
    if (candidate) candidate.addEventListener('input', function () {
      state.candidateId = cleanString(candidate.value);
      state.bindResult = null;
      state.applyEventResult = null;
      state.bookkeepingResult = null;
      state.message = 'Candidate id changed; execute only a reviewed generated binding-add proposal.';
      updateButtonStates();
    });
  }

  function updateButtonStates() {
    var canRun = !state.busy && bindingInputReady();
    var canExecute = !state.busy && !!cleanString(state.candidateId);
    var identity = document.getElementById('h2o-binding-convergence-identity');
    var materialize = document.getElementById('h2o-binding-convergence-materialize');
    var preflight = document.getElementById('h2o-binding-convergence-preflight');
    var execute = document.getElementById('h2o-binding-convergence-execute');
    if (identity) identity.disabled = !canRun;
    if (materialize) materialize.disabled = !canRun;
    if (preflight) preflight.disabled = !canRun;
    if (execute) execute.disabled = !canExecute;
  }

  function ensurePanel() {
    injectStyle();
    var panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Binding convergence review');
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

  async function openBindingConvergencePanel() {
    state.open = true;
    state.message = '';
    await refreshBindingConvergencePanel();
    return state.snapshot;
  }

  async function refreshBindingConvergencePanel() {
    state.busy = true;
    state.message = 'Refreshing binding convergence status...';
    if (state.open) await renderPanel();
    state.snapshot = await collectSnapshot();
    state.identity = null;
    state.materialization = null;
    state.preflight = null;
    state.bindResult = null;
    state.applyEventResult = null;
    state.bookkeepingResult = null;
    state.message = 'Refreshed at ' + nowIsoSeconds() + '.';
    state.busy = false;
    if (state.open) await renderPanel();
    return state.snapshot;
  }

  function bindingArgs() {
    return {
      chatSubjectId: cleanLower(state.chatSubjectId),
      folderSubjectId: cleanLower(state.folderSubjectId)
    };
  }

  async function runSelectedIdentityCheck() {
    var sync = H2O.Desktop.Sync;
    state.busy = true;
    state.message = 'Running binding identity/cardinality check...';
    if (state.open) await renderPanel();
    if (!bindingInputReady()) {
      state.identity = { ok: false, blockers: ['valid-chat-and-folder-subjects-required'], warnings: [] };
    } else if (!sync || typeof sync.checkBindingIdentityAndCardinality !== 'function') {
      state.identity = { ok: false, blockers: ['binding-identity-cardinality-unavailable'], warnings: [] };
    } else {
      try {
        state.identity = safeObject(await sync.checkBindingIdentityAndCardinality(bindingArgs()));
      } catch (_) {
        state.identity = { ok: false, blockers: ['binding-identity-cardinality-failed'], warnings: [] };
      }
    }
    state.materialization = null;
    state.preflight = null;
    state.bindResult = null;
    state.applyEventResult = null;
    state.bookkeepingResult = null;
    state.message = 'Binding identity/cardinality check complete.';
    state.busy = false;
    if (state.open) await renderPanel();
    return state.identity;
  }

  async function runSelectedMaterialization() {
    var sync = H2O.Desktop.Sync;
    state.busy = true;
    state.message = 'Running binding materialization check...';
    if (state.open) await renderPanel();
    if (!bindingInputReady()) {
      state.materialization = { ok: false, blockers: ['valid-chat-and-folder-subjects-required'], warnings: [] };
    } else if (!sync || typeof sync.checkBindingMaterialization !== 'function') {
      state.materialization = { ok: false, blockers: ['binding-materialization-unavailable'], warnings: [] };
    } else {
      try {
        state.materialization = safeObject(await sync.checkBindingMaterialization(bindingArgs()));
      } catch (_) {
        state.materialization = { ok: false, blockers: ['binding-materialization-failed'], warnings: [] };
      }
    }
    state.preflight = null;
    state.bindResult = null;
    state.applyEventResult = null;
    state.bookkeepingResult = null;
    state.message = 'Binding materialization check complete.';
    state.busy = false;
    if (state.open) await renderPanel();
    return state.materialization;
  }

  async function runSelectedBindingPreflight() {
    var sync = H2O.Desktop.Sync;
    state.busy = true;
    state.message = 'Running binding preflight...';
    if (state.open) await renderPanel();
    if (!bindingInputReady()) {
      state.preflight = { ok: false, actionable: false, blockers: ['valid-chat-and-folder-subjects-required'], warnings: [] };
    } else if (!sync || typeof sync.runBindingConvergencePreflight !== 'function') {
      state.preflight = { ok: false, actionable: false, blockers: ['binding-preflight-unavailable'], warnings: [] };
    } else {
      try {
        state.preflight = safeObject(await sync.runBindingConvergencePreflight(bindingArgs()));
      } catch (_) {
        state.preflight = { ok: false, actionable: false, blockers: ['binding-preflight-failed'], warnings: [] };
      }
    }
    state.bindResult = null;
    state.applyEventResult = null;
    state.bookkeepingResult = null;
    state.message = 'Binding preflight complete.';
    state.busy = false;
    if (state.open) await renderPanel();
    return state.preflight;
  }

  async function executeSelectedReviewedBindAdd() {
    var sync = H2O.Desktop.Sync;
    var candidateId = cleanString(state.candidateId);
    state.busy = true;
    state.message = 'Executing one reviewed binding add...';
    if (state.open) await renderPanel();
    if (!candidateId) {
      state.bindResult = { ok: false, bound: false, blockers: ['candidateId-required'], warnings: [] };
    } else if (!sync || typeof sync.executeReviewedBindingAdd !== 'function') {
      state.bindResult = { ok: false, bound: false, blockers: ['binding-reviewed-apply-unavailable'], warnings: [] };
    } else {
      try {
        state.bindResult = safeObject(await sync.executeReviewedBindingAdd({
          candidateId: candidateId,
          operatorApprovalToken: cleanString(sync.__bindingReviewedApplyApprovalToken)
        }));
      } catch (_) {
        state.bindResult = { ok: false, bound: false, blockers: ['binding-reviewed-apply-failed'], warnings: [] };
      }
    }

    if (state.bindResult && state.bindResult.bound === true) {
      if (!sync || typeof sync.buildBindingApplyEvent !== 'function') {
        state.applyEventResult = { ok: false, blockers: ['binding-applyEvent-builder-unavailable'], warnings: [] };
      } else {
        try {
          state.applyEventResult = safeObject(await sync.buildBindingApplyEvent({
            bindingResult: state.bindResult
          }));
        } catch (_) {
          state.applyEventResult = { ok: false, blockers: ['binding-applyEvent-build-failed'], warnings: [] };
        }
      }
      if (!sync || typeof sync.finalizeBindingConvergence !== 'function') {
        state.bookkeepingResult = { ok: false, blockers: ['binding-bookkeeping-unavailable'], warnings: [] };
      } else {
        try {
          state.bookkeepingResult = safeObject(await sync.finalizeBindingConvergence({
            bindingResult: state.bindResult
          }));
        } catch (_) {
          state.bookkeepingResult = { ok: false, blockers: ['binding-bookkeeping-failed'], warnings: [] };
        }
      }
    } else {
      state.applyEventResult = null;
      state.bookkeepingResult = null;
    }

    state.snapshot = await collectSnapshot();
    state.message = state.bindResult && state.bindResult.bound === true
      ? 'Reviewed binding add completed; applyEvent/bookkeeping status updated.'
      : 'Reviewed binding add did not apply.';
    state.busy = false;
    if (state.open) await renderPanel();
    return {
      bindResult: state.bindResult,
      applyEventResult: state.applyEventResult,
      bookkeepingResult: state.bookkeepingResult
    };
  }

  function installLauncher() {
    if (typeof document === 'undefined' || !document.body || document.getElementById(LAUNCHER_ID)) return;
    injectStyle();
    var button = document.createElement('button');
    button.id = LAUNCHER_ID;
    button.type = 'button';
    button.textContent = 'Binding Convergence';
    button.setAttribute('aria-label', 'Open binding convergence panel');
    button.addEventListener('click', function () { openBindingConvergencePanel(); });
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

  H2O.Desktop.Sync.openBindingConvergencePanel = openBindingConvergencePanel;
  H2O.Desktop.Sync.refreshBindingConvergencePanel = refreshBindingConvergencePanel;
  H2O.Desktop.Sync.__bindingConvergenceUiInstalled = true;
  H2O.Desktop.Sync.__bindingConvergenceUiVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
