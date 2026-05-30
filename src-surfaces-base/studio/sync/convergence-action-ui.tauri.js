/* H2O Desktop Sync - F10.8.9d convergence action UI
 *
 * Desktop/Tauri-only operator surface for one color-only convergence action.
 *
 * Safety invariants:
 *   - UI only. This module adds no convergence, apply, bookkeeping,
 *     publication, WebDAV, inbox/outbox, or mobile write-back logic.
 *   - Calls existing APIs only:
 *       buildConvergencePlan()
 *       runConvergencePreflight()
 *       executeColorConvergence()
 *       finalizeConvergenceAction()
 *       listConsumedOperations()
 *       getConvergenceWatermarks()
 *   - Operator actions are explicit button clicks. No timers, polling,
 *     automatic refresh, automatic apply, batch apply, auto merge, or transport.
 *   - The panel works on one proposalEligible subject at a time.
 *   - Rendered details are redacted: hashes/counts/status only; no raw names,
 *     colors, IDs, paths, URLs, tokens, or content.
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
  if (H2O.Desktop.Sync.__convergenceActionUiInstalled) return;

  var VERSION = '0.1.0-f10.8.9d';
  var PANEL_ID = 'h2o-convergence-action-panel';
  var LAUNCHER_ID = 'h2o-convergence-action-launcher';
  var STYLE_ID = 'h2o-convergence-action-style';

  var state = {
    open: false,
    busy: false,
    snapshot: null,
    selectedIndex: 0,
    preflight: null,
    applyResult: null,
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

  function codes(label, values) {
    var list = codeList(values);
    if (!list.length) return '';
    return '<p class="h2oConvActionCodes"><strong>' + escapeHtml(label) + ':</strong> ' +
      list.map(escapeHtml).join(', ') + '</p>';
  }

  function metric(label, value) {
    return '<div class="h2oConvActionMetric"><span class="h2oConvActionValue">' +
      escapeHtml(value == null ? 0 : value) + '</span><span class="h2oConvActionLabel">' +
      escapeHtml(label) + '</span></div>';
  }

  function boolText(value) {
    return value === true ? 'yes' : 'no';
  }

  function selectedEntry() {
    var plan = safeObject(state.snapshot && state.snapshot.plan);
    var eligible = asArray(safeObject(plan.buckets).proposalEligible);
    if (!eligible.length) return null;
    var index = Math.max(0, Math.min(state.selectedIndex || 0, eligible.length - 1));
    return safeObject(eligible[index]);
  }

  function rowSummary(row, index) {
    var r = safeObject(row);
    var platform = safeObject(r.sourcePlatform);
    var selected = index === (state.selectedIndex || 0);
    return '<article class="h2oConvActionRow' + (selected ? ' h2oConvActionRowSelected' : '') + '">' +
      '<div><strong>' + (selected ? 'selected subject' : 'subject') + '</strong> ' +
      escapeHtml(shortHash(r.subjectId)) + ' <strong>peer</strong> ' +
      escapeHtml(shortHash(r.sourcePeerId)) + '</div>' +
      '<div><strong>local</strong> ' + escapeHtml(shortHash(r.localRevisionHash)) +
      ' <strong>remote</strong> ' + escapeHtml(shortHash(r.remoteRevisionHash)) + '</div>' +
      '<div><strong>lineage</strong> ' + escapeHtml(shortHash(r.lineageId)) +
      ' <strong>event</strong> ' + escapeHtml(shortHash(r.eventDigest)) + '</div>' +
      '<div><strong>reason</strong> ' + escapeHtml(r.reason || 'unspecified') +
      ' <strong>platform</strong> ' + escapeHtml(platform.platformId || 'unknown') +
      ' / ' + escapeHtml(platform.surfaceKind || 'unknown') + '</div>' +
      (asArray(r.changedFields).length
        ? '<div><strong>changed fields</strong> ' + asArray(r.changedFields).map(escapeHtml).join(', ') + '</div>'
        : '') +
      codes('blockers', r.blockerCodes) +
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
        blockers: codeList(fallback.blockers).concat(['convergence-action-ui-call-failed'])
      });
    }
  }

  async function collectSnapshot() {
    var sync = H2O.Desktop.Sync;
    var plan = await safeCall(sync.buildConvergencePlan, {
      ok: false,
      buckets: { proposalEligible: [] },
      counts: { proposalEligible: 0 },
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
    var eligible = asArray(safeObject(plan.buckets).proposalEligible);
    if (state.selectedIndex >= eligible.length) state.selectedIndex = 0;
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
      '#h2o-convergence-action-launcher{position:fixed;right:18px;bottom:110px;z-index:2147482598;border:1px solid rgba(148,163,184,.45);border-radius:999px;padding:10px 14px;background:var(--wb-panel,#151923);color:var(--wb-text,#f8fafc);font:650 13px/1.2 system-ui,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.24);cursor:pointer}',
      '#h2o-convergence-action-panel{position:fixed;right:18px;top:64px;width:min(1040px,calc(100vw - 36px));max-height:calc(100vh - 84px);z-index:2147482603;overflow:auto;border:1px solid rgba(148,163,184,.35);border-radius:20px;background:var(--wb-surface,#10141d);color:var(--wb-text,#f8fafc);box-shadow:0 24px 90px rgba(0,0,0,.38);font:13px/1.45 system-ui,sans-serif}',
      '#h2o-convergence-action-panel *{box-sizing:border-box}',
      '.h2oConvActionHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid rgba(148,163,184,.22)}',
      '.h2oConvActionBody{padding:18px 20px 22px}',
      '.h2oConvActionKicker{margin:0 0 4px;color:var(--wb-muted,#94a3b8);font-size:12px;text-transform:uppercase;letter-spacing:.08em}',
      '.h2oConvActionTitle{margin:0;font-size:20px;line-height:1.15}',
      '.h2oConvActionNote{margin:8px 0 0;color:var(--wb-muted,#94a3b8)}',
      '.h2oConvActionControls{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}',
      '.h2oConvActionBtn{border:1px solid rgba(148,163,184,.34);border-radius:12px;background:rgba(148,163,184,.12);color:inherit;padding:9px 12px;font-weight:650;cursor:pointer}',
      '.h2oConvActionBtn[disabled]{opacity:.55;cursor:not-allowed}',
      '.h2oConvActionPrimary{background:rgba(59,130,246,.24);border-color:rgba(96,165,250,.5)}',
      '.h2oConvActionApply{background:rgba(34,197,94,.18);border-color:rgba(74,222,128,.42)}',
      '.h2oConvActionDanger{background:rgba(239,68,68,.16);border-color:rgba(248,113,113,.38)}',
      '.h2oConvActionGrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:14px 0}',
      '.h2oConvActionMetric{border:1px solid rgba(148,163,184,.22);border-radius:16px;padding:12px;background:rgba(148,163,184,.08)}',
      '.h2oConvActionValue{display:block;font-size:22px;font-weight:800;line-height:1.05}',
      '.h2oConvActionLabel{display:block;color:var(--wb-muted,#94a3b8);font-size:12px;margin-top:4px}',
      '.h2oConvActionSection{border:1px solid rgba(148,163,184,.22);border-radius:16px;margin:10px 0;background:rgba(148,163,184,.06);padding:12px 14px}',
      '.h2oConvActionSection h3{margin:0 0 8px;font-size:15px}',
      '.h2oConvActionRows{display:grid;gap:8px}',
      '.h2oConvActionRow{border:1px solid rgba(148,163,184,.18);border-radius:14px;padding:10px;background:rgba(2,6,23,.18);word-break:break-word}',
      '.h2oConvActionRowSelected{border-color:rgba(96,165,250,.65);box-shadow:0 0 0 1px rgba(96,165,250,.25) inset}',
      '.h2oConvActionCodes{margin:6px 0 0;color:var(--wb-muted,#94a3b8)}',
      '@media(max-width:860px){.h2oConvActionGrid{grid-template-columns:repeat(2,minmax(0,1fr))}#h2o-convergence-action-panel{right:10px;top:54px;width:calc(100vw - 20px)}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function renderProposalEligible(plan) {
    var p = safeObject(plan);
    var eligible = asArray(safeObject(p.buckets).proposalEligible);
    var rows = eligible.length
      ? eligible.slice(0, 12).map(rowSummary).join('')
      : '<p class="h2oConvActionNote">No proposalEligible color convergence candidates.</p>';
    return '<section class="h2oConvActionSection"><h3>ProposalEligible</h3>' +
      '<p class="h2oConvActionNote">One subject at a time. The first proposalEligible item is selected for preflight and execution.</p>' +
      '<div class="h2oConvActionRows">' + rows + '</div>' +
      codes('plan blockers', p.blockers) +
      codes('plan warnings', p.warnings) +
      '</section>';
  }

  function renderPreflight(preflight) {
    var p = safeObject(preflight);
    if (!preflight) {
      return '<section class="h2oConvActionSection"><h3>Preflight Results</h3>' +
        '<p class="h2oConvActionNote">No preflight has been run for the selected subject.</p></section>';
    }
    return '<section class="h2oConvActionSection"><h3>Preflight Results</h3>' +
      '<div class="h2oConvActionGrid">' +
      metric('actionable', boolText(p.actionable)) +
      metric('target color', boolText(p.targetColorAvailable)) +
      metric('subject resolved', boolText(p.subjectResolved)) +
      metric('baseline matches', boolText(p.baselineMatches)) +
      metric('readiness safe', boolText(p.readinessSafe)) +
      '</div>' +
      '<div class="h2oConvActionGrid">' +
      metric('replay safe', boolText(p.replaySafe)) +
      metric('watermark safe', boolText(p.watermarkSafe)) +
      metric('consumed safe', boolText(p.consumedSafe)) +
      metric('F5/F6 safe', boolText(p.f5f6Safe)) +
      metric('ok', boolText(p.ok)) +
      '</div>' +
      codes('preflight blockers', p.blockers) +
      codes('preflight warnings', p.warnings) +
      '</section>';
  }

  function renderApplyStatus(applyResult, bookkeepingResult) {
    var a = safeObject(applyResult);
    var b = safeObject(bookkeepingResult);
    var applyEvent = safeObject(b.applyEvent || a.applyEvent);
    if (!applyResult && !bookkeepingResult) {
      return '<section class="h2oConvActionSection"><h3>Apply Status</h3>' +
        '<p class="h2oConvActionNote">No local color convergence action has been executed from this panel.</p></section>';
    }
    return '<section class="h2oConvActionSection"><h3>Apply Status</h3>' +
      '<div class="h2oConvActionGrid">' +
      metric('action ok', boolText(a.ok)) +
      metric('applied', boolText(a.applied)) +
      metric('applyEvent', applyEvent.kind === 'applyEvent' ? 'yes' : 'no') +
      metric('dryRun', boolText(applyEvent.dryRun)) +
      metric('subject', shortHash(a.subjectId || applyEvent.subjectId)) +
      '</div>' +
      '<p class="h2oConvActionNote">event ' + escapeHtml(shortHash(applyEvent.eventDigest)) +
      ' / lineage ' + escapeHtml(shortHash(a.lineageId || applyEvent.lineageId)) + '</p>' +
      codes('apply blockers', a.blockers) +
      codes('apply warnings', a.warnings) +
      codes('bookkeeping blockers', b.blockers) +
      codes('bookkeeping warnings', b.warnings) +
      '</section>';
  }

  function recentRows(rows, fields) {
    var list = asArray(rows).slice(-6).reverse();
    if (!list.length) return '<p class="h2oConvActionNote">No rows recorded.</p>';
    return '<div class="h2oConvActionRows">' + list.map(function (row) {
      var r = safeObject(row);
      return '<article class="h2oConvActionRow">' +
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
    return '<section class="h2oConvActionSection"><h3>Consumed Ledger Status</h3>' +
      '<div class="h2oConvActionGrid">' +
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
    return '<section class="h2oConvActionSection"><h3>Watermark Status</h3>' +
      '<div class="h2oConvActionGrid">' +
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

  function renderRecentActions(snapshot) {
    var consumed = safeObject(snapshot && snapshot.consumed);
    var watermarks = safeObject(snapshot && snapshot.watermarks);
    return '<section class="h2oConvActionSection"><h3>Recent Convergence Actions</h3>' +
      '<p class="h2oConvActionNote">Recent consumed-operation rows:</p>' +
      recentRows(asArray(consumed.rows).filter(function (row) {
        return cleanString(row && row.operationKind) === 'folder-metadata-color-apply';
      }), [
        { label: 'status', key: 'consumedStatus' },
        { label: 'subject', key: 'subjectId', hash: true },
        { label: 'event', key: 'eventDigest', hash: true },
        { label: 'lineage', key: 'lineageId', hash: true }
      ]) +
      '<p class="h2oConvActionNote">Recent watermark rows:</p>' +
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
    var canRun = !state.busy && !!selectedEntry();
    var canExecute = canRun && safeObject(state.preflight).actionable === true;
    return '<div class="h2oConvActionHeader"><div>' +
      '<p class="h2oConvActionKicker">F10.8.9d operator action surface</p>' +
      '<h2 class="h2oConvActionTitle">Convergence action review</h2>' +
      '<p class="h2oConvActionNote">UI only. One color-only subject at a time. No batch apply, auto refresh, transport, publication, or remote mutation.</p>' +
      '</div><div class="h2oConvActionControls">' +
      '<a class="h2oConvActionBtn" href="#/settings/convergence/color">Open in Settings</a>' +
      '<button class="h2oConvActionBtn" id="h2o-convergence-action-refresh" type="button" ' + (state.busy ? 'disabled' : '') + '>Refresh</button>' +
      '<button class="h2oConvActionBtn h2oConvActionPrimary" id="h2o-convergence-action-preflight" type="button" ' + (canRun ? '' : 'disabled') + '>Run Preflight</button>' +
      '<button class="h2oConvActionBtn h2oConvActionApply" id="h2o-convergence-action-execute" type="button" ' + (canExecute ? '' : 'disabled') + '>Execute Local Color Convergence</button>' +
      '</div></div><div class="h2oConvActionBody">' +
      (state.message ? '<p class="h2oConvActionNote">' + escapeHtml(state.message) + '</p>' : '') +
      '<div class="h2oConvActionGrid">' +
      metric('proposalEligible', counts.proposalEligible || 0) +
      metric('conflicted', counts.conflicted || 0) +
      metric('blocked', counts.blocked || 0) +
      metric('stale', counts.stale || 0) +
      metric('replay', counts.replay || 0) +
      '</div>' +
      renderProposalEligible(plan) +
      renderPreflight(state.preflight) +
      renderApplyStatus(state.applyResult, state.bookkeepingResult) +
      renderConsumedStatus(snapshot, state.bookkeepingResult) +
      renderWatermarkStatus(snapshot, state.bookkeepingResult) +
      renderRecentActions(snapshot) +
      '</div>';
  }

  function bindPanel() {
    var refresh = document.getElementById('h2o-convergence-action-refresh');
    var preflight = document.getElementById('h2o-convergence-action-preflight');
    var execute = document.getElementById('h2o-convergence-action-execute');
    if (refresh) refresh.addEventListener('click', function () { refreshConvergenceActionPanel(); });
    if (preflight) preflight.addEventListener('click', function () { runSelectedPreflight(); });
    if (execute) execute.addEventListener('click', function () { executeSelectedConvergence(); });
  }

  function ensurePanel() {
    injectStyle();
    var panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Convergence action review');
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

  async function openConvergenceActionPanel() {
    state.open = true;
    state.message = '';
    await refreshConvergenceActionPanel();
    return state.snapshot;
  }

  async function refreshConvergenceActionPanel() {
    state.busy = true;
    state.message = 'Refreshing convergence action status...';
    if (state.open) await renderPanel();
    state.snapshot = await collectSnapshot();
    state.preflight = null;
    state.applyResult = null;
    state.bookkeepingResult = null;
    state.message = 'Refreshed at ' + nowIsoSeconds() + '.';
    state.busy = false;
    if (state.open) await renderPanel();
    return state.snapshot;
  }

  async function runSelectedPreflight() {
    var sync = H2O.Desktop.Sync;
    var entry = selectedEntry();
    state.busy = true;
    state.message = 'Running preflight for selected subject...';
    if (state.open) await renderPanel();
    if (!entry) {
      state.preflight = { ok: false, actionable: false, blockers: ['proposalEligible-entry-required'], warnings: [] };
    } else if (!sync || typeof sync.runConvergencePreflight !== 'function') {
      state.preflight = { ok: false, actionable: false, blockers: ['convergence-preflight-unavailable'], warnings: [] };
    } else {
      try {
        state.preflight = safeObject(await sync.runConvergencePreflight({ plannerEntry: entry }));
      } catch (_) {
        state.preflight = { ok: false, actionable: false, blockers: ['convergence-preflight-failed'], warnings: [] };
      }
    }
    state.applyResult = null;
    state.bookkeepingResult = null;
    state.message = 'Preflight complete.';
    state.busy = false;
    if (state.open) await renderPanel();
    return state.preflight;
  }

  async function executeSelectedConvergence() {
    var sync = H2O.Desktop.Sync;
    var entry = selectedEntry();
    state.busy = true;
    state.message = 'Executing one local color convergence action...';
    if (state.open) await renderPanel();
    if (!entry) {
      state.applyResult = { ok: false, applied: false, blockers: ['proposalEligible-entry-required'], warnings: [] };
    } else if (!state.preflight || state.preflight.actionable !== true) {
      state.applyResult = { ok: false, applied: false, blockers: ['actionable-preflight-required'], warnings: [] };
    } else if (!sync || typeof sync.executeColorConvergence !== 'function') {
      state.applyResult = { ok: false, applied: false, blockers: ['color-convergence-action-unavailable'], warnings: [] };
    } else {
      try {
        state.applyResult = safeObject(await sync.executeColorConvergence({
          plannerEntry: entry,
          operatorApprovalToken: cleanString(sync.__colorConvergenceActionApprovalToken)
        }));
      } catch (_) {
        state.applyResult = { ok: false, applied: false, blockers: ['color-convergence-action-failed'], warnings: [] };
      }
    }

    if (state.applyResult && state.applyResult.applied === true) {
      if (!sync || typeof sync.finalizeConvergenceAction !== 'function') {
        state.bookkeepingResult = { ok: false, blockers: ['convergence-bookkeeping-unavailable'], warnings: [] };
      } else {
        try {
          state.bookkeepingResult = safeObject(await sync.finalizeConvergenceAction({
            convergenceResult: state.applyResult
          }));
        } catch (_) {
          state.bookkeepingResult = { ok: false, blockers: ['convergence-bookkeeping-failed'], warnings: [] };
        }
      }
    } else {
      state.bookkeepingResult = null;
    }

    state.snapshot = await collectSnapshot();
    state.message = state.applyResult && state.applyResult.applied === true
      ? 'Local color convergence action completed; bookkeeping status updated.'
      : 'Local color convergence action did not apply.';
    state.busy = false;
    if (state.open) await renderPanel();
    return {
      applyResult: state.applyResult,
      bookkeepingResult: state.bookkeepingResult
    };
  }

  function installLauncher() {
    if (typeof document === 'undefined' || !document.body || document.getElementById(LAUNCHER_ID)) return;
    injectStyle();
    var button = document.createElement('button');
    button.id = LAUNCHER_ID;
    button.type = 'button';
    button.textContent = 'Convergence Action';
    button.setAttribute('aria-label', 'Open convergence action panel');
    button.addEventListener('click', function () { openConvergenceActionPanel(); });
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

  H2O.Desktop.Sync.openConvergenceActionPanel = openConvergenceActionPanel;
  H2O.Desktop.Sync.refreshConvergenceActionPanel = refreshConvergenceActionPanel;
  H2O.Desktop.Sync.__convergenceActionUiInstalled = true;
  H2O.Desktop.Sync.__convergenceActionUiVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
