/* H2O Desktop Sync - F14.3.7 chat convergence UI
 *
 * Read-only Desktop panel for the chat convergence lane. It displays proposal
 * candidates, handoff/receipt/bookkeeping linkage, and proof status. It has
 * no apply, publish, relay, outbox, Native, watermark, or consumed-op actions.
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
  if (H2O.Desktop.Sync.__chatConvergenceUiInstalled) return;

  var VERSION = '0.1.0-f14.3.7';
  var PANEL_ID = 'h2o-chat-convergence-panel';
  var STYLE_ID = 'h2o-chat-convergence-style';
  var PROPOSAL_LEDGER_KEY = 'h2o:sync:convergence-proposal-candidates:v1';
  var PROPOSAL_LEDGER_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-ledger.v1';
  var SUBJECT_TYPE = 'chat.metadata';
  var OP_ARCHIVE_PROPOSED = 'chat-metadata-archive-proposed';
  var OP_RENAME_PROPOSED = 'chat-metadata-rename-proposed';

  var state = {
    open: false,
    busy: false,
    snapshot: null,
    proof: null,
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

  function storageRef() {
    try {
      var s = global.chrome && global.chrome.storage && global.chrome.storage.local;
      if (s && typeof s.get === 'function') return s;
    } catch (_) { /* ignore */ }
    return null;
  }

  function storageGet(key) {
    return new Promise(function (resolve, reject) {
      var s = storageRef();
      if (!s) { reject(new Error('storage-unavailable')); return; }
      try {
        s.get([key], function (items) {
          var lastError = global.chrome && global.chrome.runtime && global.chrome.runtime.lastError;
          if (lastError) { reject(new Error(String(lastError.message || lastError))); return; }
          resolve(items && Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null);
        });
      } catch (e) { reject(e); }
    });
  }

  function normalizeProposalLedger(raw) {
    if (!raw) return { schema: PROPOSAL_LEDGER_SCHEMA, rows: [] };
    if (!isObject(raw) || raw.schema !== PROPOSAL_LEDGER_SCHEMA || !Array.isArray(raw.rows)) return { schema: PROPOSAL_LEDGER_SCHEMA, rows: [] };
    return { schema: raw.schema, rows: raw.rows.slice() };
  }

  function metric(label, value) {
    return '<div class="h2oChatConvMetric"><span class="h2oChatConvValue">' +
      escapeHtml(value == null ? 0 : value) + '</span><span class="h2oChatConvLabel">' +
      escapeHtml(label) + '</span></div>';
  }

  function codes(label, values) {
    var list = codeList(values);
    if (!list.length) return '';
    return '<p class="h2oChatConvCodes"><strong>' + escapeHtml(label) + ':</strong> ' +
      list.map(escapeHtml).join(', ') + '</p>';
  }

  function injectStyle() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#h2o-chat-convergence-panel{position:fixed;right:18px;top:64px;width:min(1040px,calc(100vw - 36px));max-height:calc(100vh - 84px);z-index:2147482609;overflow:auto;border:1px solid rgba(96,165,250,.35);border-radius:20px;background:var(--wb-surface,#10141d);color:var(--wb-text,#f8fafc);box-shadow:0 24px 90px rgba(0,0,0,.38);font:13px/1.45 system-ui,sans-serif}',
      '#h2o-chat-convergence-panel *{box-sizing:border-box}',
      '.h2oChatConvHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid rgba(148,163,184,.22)}',
      '.h2oChatConvBody{padding:18px 20px 22px}',
      '.h2oChatConvKicker{margin:0 0 4px;color:var(--wb-muted,#94a3b8);font-size:12px;text-transform:uppercase;letter-spacing:.08em}',
      '.h2oChatConvTitle{margin:0;font-size:20px;line-height:1.15}',
      '.h2oChatConvNote{margin:8px 0 0;color:var(--wb-muted,#94a3b8)}',
      '.h2oChatConvControls{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}',
      '.h2oChatConvBtn{border:1px solid rgba(148,163,184,.34);border-radius:12px;background:rgba(148,163,184,.12);color:inherit;padding:9px 12px;font-weight:650;cursor:pointer}',
      '.h2oChatConvClose{min-width:38px;height:38px;padding:0;border-radius:999px;font-size:20px;line-height:1}',
      '#h2o-chat-convergence-panel[data-settings-hosted="true"] .h2oChatConvClose{display:none}',
      '.h2oChatConvBtn[disabled]{opacity:.55;cursor:not-allowed}',
      '.h2oChatConvGrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:14px 0}',
      '.h2oChatConvMetric{border:1px solid rgba(148,163,184,.22);border-radius:16px;padding:12px;background:rgba(148,163,184,.08)}',
      '.h2oChatConvValue{display:block;font-size:22px;font-weight:800;line-height:1.05}',
      '.h2oChatConvLabel{display:block;color:var(--wb-muted,#94a3b8);font-size:12px;margin-top:4px}',
      '.h2oChatConvSection{border:1px solid rgba(148,163,184,.22);border-radius:16px;margin:10px 0;background:rgba(148,163,184,.06);padding:12px 14px}',
      '.h2oChatConvSection h3{margin:0 0 8px;font-size:15px}',
      '.h2oChatConvRows{display:grid;gap:8px}',
      '.h2oChatConvRow{border:1px solid rgba(148,163,184,.18);border-radius:14px;padding:10px;background:rgba(2,6,23,.18);word-break:break-word}',
      '.h2oChatConvCodes{margin:6px 0 0;color:var(--wb-muted,#94a3b8)}',
      '@media(max-width:860px){.h2oChatConvGrid{grid-template-columns:repeat(2,minmax(0,1fr))}#h2o-chat-convergence-panel{right:10px;top:54px;width:calc(100vw - 20px)}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function renderCandidateRows(rows, operation) {
    var filtered = rows.filter(function (row) {
      var r = safeObject(row);
      return r.sourceDomain === SUBJECT_TYPE && r.operation === operation;
    }).slice(-8).reverse();
    if (!filtered.length) return '<p class="h2oChatConvNote">No generated candidates found.</p>';
    return '<div class="h2oChatConvRows">' + filtered.map(function (row) {
      var r = safeObject(row);
      return '<div class="h2oChatConvRow">' +
        '<strong>' + escapeHtml(operation === OP_ARCHIVE_PROPOSED ? 'Archive' : 'Rename') + '</strong>' +
        '<p class="h2oChatConvNote">candidate ' + escapeHtml(shortHash(r.rowId)) +
        ' · subject ' + escapeHtml(shortHash(r.subjectId)) +
        ' · lineage ' + escapeHtml(shortHash(r.lineageId)) + '</p>' +
        '<p class="h2oChatConvNote">event ' + escapeHtml(shortHash(r.eventDigest)) +
        ' · status ' + escapeHtml(r.status || 'unknown') + '</p>' +
        '</div>';
    }).join('') + '</div>';
  }

  function renderBookkeepingRows(rows) {
    if (!rows.length) return '<p class="h2oChatConvNote">No chat bookkeeping rows recorded yet.</p>';
    return '<div class="h2oChatConvRows">' + rows.slice(-8).reverse().map(function (row) {
      var r = safeObject(row);
      return '<div class="h2oChatConvRow">' +
        '<strong>' + escapeHtml(r.proposalOperation || 'chat operation') + '</strong>' +
        '<p class="h2oChatConvNote">bookkeeping ' + escapeHtml(shortHash(r.rowId)) +
        ' · subject ' + escapeHtml(shortHash(r.subjectId)) +
        ' · lineage ' + escapeHtml(shortHash(r.lineageId)) + '</p>' +
        '<p class="h2oChatConvNote">receipt ' + escapeHtml(shortHash(r.applyEventDigest)) +
        ' · audit ' + escapeHtml(shortHash(r.auditMaintenanceId)) +
        ' · status ' + escapeHtml(r.status || 'unknown') + '</p>' +
        '</div>';
    }).join('') + '</div>';
  }

  function renderProof(proof) {
    var p = safeObject(proof);
    if (!proof) return '<p class="h2oChatConvNote">Proof has not been run in this panel session.</p>';
    return '<div class="h2oChatConvGrid">' +
      metric('proof ok', boolText(p.ok)) +
      metric('archive lane', boolText(p.archiveLaneOk)) +
      metric('rename lane', boolText(p.renameLaneOk)) +
      metric('privacy', boolText(p.privacyOk)) +
      metric('lineage', boolText(p.proposalLineageOk && p.applyEventLineageOk)) +
      '</div>' +
      '<div class="h2oChatConvGrid">' +
      metric('raw title blocked', boolText(p.noRawTitleLeaks)) +
      metric('raw chatId blocked', boolText(p.noRawChatIdLeaks)) +
      metric('archive event', shortHash(safeObject(p.archive).applyEventDigest)) +
      metric('rename event', shortHash(safeObject(p.rename).applyEventDigest)) +
      metric('blockers', codeList(p.blockers).length) +
      '</div>' +
      codes('proof blockers', p.blockers) +
      codes('proof warnings', p.warnings);
  }

  async function collectSnapshot() {
    var proposals = { rows: [] };
    try {
      proposals = normalizeProposalLedger(await storageGet(PROPOSAL_LEDGER_KEY));
    } catch (_) {
      proposals = { rows: [], blockers: ['proposal-ledger-read-failed'] };
    }
    var bookkeeping = { ok: false, rows: [], counts: { rows: 0 }, blockers: ['chat-bookkeeping-unavailable'], warnings: [] };
    if (typeof H2O.Desktop.Sync.listChatConvergenceBookkeeping === 'function') {
      try {
        bookkeeping = safeObject(await H2O.Desktop.Sync.listChatConvergenceBookkeeping());
      } catch (_) {
        bookkeeping = { ok: false, rows: [], counts: { rows: 0 }, blockers: ['chat-bookkeeping-read-failed'], warnings: [] };
      }
    }
    var rows = asArray(proposals.rows).filter(function (row) {
      var r = safeObject(row);
      return r.sourceDomain === SUBJECT_TYPE &&
        (r.operation === OP_ARCHIVE_PROPOSED || r.operation === OP_RENAME_PROPOSED);
    });
    var archive = rows.filter(function (row) { return safeObject(row).operation === OP_ARCHIVE_PROPOSED; });
    var rename = rows.filter(function (row) { return safeObject(row).operation === OP_RENAME_PROPOSED; });
    return {
      generatedAtIso: nowIsoSeconds(),
      proposalRows: rows,
      archiveRows: archive,
      renameRows: rename,
      bookkeeping: bookkeeping,
      counts: {
        archiveCandidates: archive.length,
        renameCandidates: rename.length,
        bookkeepingRows: asArray(bookkeeping.rows).length
      }
    };
  }

  function render() {
    var panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    var snapshot = safeObject(state.snapshot);
    var counts = safeObject(snapshot.counts);
    var bookkeeping = safeObject(snapshot.bookkeeping);
    var proposalRows = asArray(snapshot.proposalRows);
    panel.innerHTML =
      '<div class="h2oChatConvHeader">' +
      '<div><p class="h2oChatConvKicker">F14.3.7 · read-only</p>' +
      '<h2 class="h2oChatConvTitle">Chat Convergence</h2>' +
      '<p class="h2oChatConvNote">Displays archive/rename candidates, Native handoff previews, receipt linkage, bookkeeping rows, and proof status. No apply, publish, relay, or Native controls are exposed.</p>' +
      (state.message ? '<p class="h2oChatConvNote">' + escapeHtml(state.message) + '</p>' : '') +
      '</div><div class="h2oChatConvControls">' +
      '<button class="h2oChatConvBtn" id="h2o-chat-convergence-refresh" type="button" ' + (state.busy ? 'disabled' : '') + '>Refresh</button>' +
      '<button class="h2oChatConvBtn h2oChatConvClose" id="h2o-chat-convergence-close" type="button" aria-label="Close">×</button>' +
      '</div></div>' +
      '<div class="h2oChatConvBody">' +
      '<div class="h2oChatConvGrid">' +
      metric('archive candidates', counts.archiveCandidates || 0) +
      metric('rename candidates', counts.renameCandidates || 0) +
      metric('bookkeeping rows', counts.bookkeepingRows || 0) +
      metric('proof ok', state.proof ? boolText(state.proof.ok) : 'not run') +
      metric('last refresh', shortHash(snapshot.generatedAtIso)) +
      '</div>' +
      '<section class="h2oChatConvSection"><h3>Archive Proposal Candidates</h3>' +
      renderCandidateRows(proposalRows, OP_ARCHIVE_PROPOSED) + '</section>' +
      '<section class="h2oChatConvSection"><h3>Rename Proposal Candidates</h3>' +
      renderCandidateRows(proposalRows, OP_RENAME_PROPOSED) + '</section>' +
      '<section class="h2oChatConvSection"><h3>Handoff Previews / Apply Receipts</h3>' +
      '<p class="h2oChatConvNote">Handoff and receipt artifacts are displayed through recorded bookkeeping linkage only; this panel does not execute owner handoff or build new receipts.</p>' +
      renderBookkeepingRows(asArray(bookkeeping.rows)) +
      codes('bookkeeping blockers', bookkeeping.blockers) +
      codes('bookkeeping warnings', bookkeeping.warnings) +
      '</section>' +
      '<section class="h2oChatConvSection"><h3>Bookkeeping Rows</h3>' +
      renderBookkeepingRows(asArray(bookkeeping.rows)) + '</section>' +
      '<section class="h2oChatConvSection"><h3>Proof Status</h3>' +
      renderProof(state.proof) + '</section>' +
      '</div>';
    bindPanelEvents();
  }

  function closePanel() {
    var panel = document.getElementById(PANEL_ID);
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    state.open = false;
  }

  function bindPanelEvents() {
    var refresh = document.getElementById('h2o-chat-convergence-refresh');
    if (refresh) refresh.onclick = function () { refreshChatConvergencePanel(); };
    var close = document.getElementById('h2o-chat-convergence-close');
    if (close) close.onclick = closePanel;
  }

  async function refreshChatConvergencePanel() {
    state.busy = true;
    state.message = 'Refreshing read-only chat convergence state...';
    render();
    try {
      state.snapshot = await collectSnapshot();
      if (typeof H2O.Desktop.Sync.runChatConvergenceProof === 'function') {
        state.proof = await H2O.Desktop.Sync.runChatConvergenceProof();
      } else {
        state.proof = {
          ok: false,
          blockers: ['chat-proof-unavailable'],
          warnings: []
        };
      }
      state.message = 'Refreshed ' + nowIsoSeconds() + '.';
    } catch (_) {
      state.message = 'Refresh failed.';
    } finally {
      state.busy = false;
      render();
    }
    return {
      ok: true,
      snapshot: state.snapshot,
      proof: state.proof,
      blockers: [],
      warnings: []
    };
  }

  async function openChatConvergencePanel(options) {
    if (typeof document === 'undefined') {
      return { ok: false, blockers: ['document-unavailable'], warnings: [] };
    }
    injectStyle();
    var panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Chat convergence panel');
      document.body.appendChild(panel);
    }
    if (safeObject(options).settingsHosted === true) {
      panel.setAttribute('data-settings-hosted', 'true');
    } else {
      panel.removeAttribute('data-settings-hosted');
    }
    state.open = true;
    if (!state.snapshot) state.snapshot = await collectSnapshot();
    render();
    await refreshChatConvergencePanel();
    return {
      ok: true,
      panelId: PANEL_ID,
      blockers: [],
      warnings: []
    };
  }

  H2O.Desktop.Sync.openChatConvergencePanel = openChatConvergencePanel;
  H2O.Desktop.Sync.refreshChatConvergencePanel = refreshChatConvergencePanel;
  H2O.Desktop.Sync.__chatConvergenceUiInstalled = true;
  H2O.Desktop.Sync.__chatConvergenceUiVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
