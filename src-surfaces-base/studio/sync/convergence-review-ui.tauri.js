/* H2O Desktop Sync - F10.8.6d manual convergence review UI
 *
 * Desktop/Tauri-only operator review surface over the read-only convergence
 * plan. UI only.
 *
 * Safety invariants:
 *   - Calls only H2O.Desktop.Sync.buildConvergencePlan().
 *   - No convergence actions, apply buttons, proposal generation, conflict
 *     generation, WebDAV calls, inbox/outbox changes, timers, auto-refresh,
 *     automatic merge, or mobile write-back.
 *   - Counts-first with redacted drill-down details only.
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
  if (H2O.Desktop.Sync.__convergenceReviewUiInstalled) return;

  var VERSION = '0.1.0-f10.8.6d';
  var PANEL_ID = 'h2o-convergence-review-panel';
  var LAUNCHER_ID = 'h2o-convergence-review-launcher';
  var STYLE_ID = 'h2o-convergence-review-style';
  var BUCKET_ORDER = [
    'alreadyConverged',
    'needsPreview',
    'proposalEligible',
    'conflicted',
    'blocked',
    'stale',
    'replay'
  ];

  var state = {
    open: false,
    plan: null,
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

  function titleForBucket(bucket) {
    return bucket
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, function (letter) { return letter.toUpperCase(); });
  }

  function metric(label, value) {
    return '<div class="h2oConvMetric"><span class="h2oConvValue">' +
      escapeHtml(value == null ? 0 : value) + '</span><span class="h2oConvLabel">' +
      escapeHtml(label) + '</span></div>';
  }

  function codes(label, values) {
    var list = codeList(values);
    if (!list.length) return '';
    return '<p class="h2oConvCodes"><strong>' + escapeHtml(label) + ':</strong> ' +
      list.map(escapeHtml).join(', ') + '</p>';
  }

  function rowList(rows, emptyText) {
    var list = asArray(rows);
    if (!list.length) return '<p class="h2oConvNote">' + escapeHtml(emptyText) + '</p>';
    return '<div class="h2oConvRows">' + list.map(function (row) {
      var r = safeObject(row);
      var platform = safeObject(r.sourcePlatform);
      return '<article class="h2oConvRow">' +
        '<div><strong>subject</strong> ' + escapeHtml(shortHash(r.subjectId)) +
        ' <strong>peer</strong> ' + escapeHtml(shortHash(r.sourcePeerId)) + '</div>' +
        '<div><strong>local</strong> ' + escapeHtml(shortHash(r.localRevisionHash)) +
        ' <strong>remote</strong> ' + escapeHtml(shortHash(r.remoteRevisionHash)) + '</div>' +
        '<div><strong>reason</strong> ' + escapeHtml(r.reason || 'unspecified') +
        ' <strong>event</strong> ' + escapeHtml(shortHash(r.eventDigest)) + '</div>' +
        '<div><strong>platform</strong> ' + escapeHtml(platform.platformId || 'unknown') +
        ' / ' + escapeHtml(platform.surfaceKind || 'unknown') + '</div>' +
        codes('blockers', r.blockerCodes) +
        (asArray(r.changedFields).length
          ? '<div><strong>changed fields</strong> ' + asArray(r.changedFields).map(escapeHtml).join(', ') + '</div>'
          : '') +
        '</article>';
    }).join('') + '</div>';
  }

  function emptyPlan(blockers) {
    var buckets = {};
    BUCKET_ORDER.forEach(function (bucket) { buckets[bucket] = []; });
    return {
      schema: 'h2o.studio.sync.convergence-plan.v1',
      ok: false,
      buckets: buckets,
      counts: {
        alreadyConverged: 0,
        needsPreview: 0,
        proposalEligible: 0,
        conflicted: 0,
        blocked: 0,
        stale: 0,
        replay: 0
      },
      blockers: codeList(blockers),
      warnings: []
    };
  }

  async function collectPlan() {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.buildConvergencePlan !== 'function') {
      return emptyPlan(['convergence-planner-unavailable']);
    }
    try {
      return safeObject(await sync.buildConvergencePlan());
    } catch (e) {
      return emptyPlan(['convergence-plan-read-failed']);
    }
  }

  function injectStyle() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#h2o-convergence-review-launcher{position:fixed;right:18px;bottom:64px;z-index:2147482599;border:1px solid rgba(148,163,184,.45);border-radius:999px;padding:10px 14px;background:var(--wb-panel,#151923);color:var(--wb-text,#f8fafc);font:650 13px/1.2 system-ui,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.24);cursor:pointer}',
      '#h2o-convergence-review-panel{position:fixed;right:18px;top:64px;width:min(980px,calc(100vw - 36px));max-height:calc(100vh - 84px);z-index:2147482602;overflow:auto;border:1px solid rgba(148,163,184,.35);border-radius:20px;background:var(--wb-surface,#10141d);color:var(--wb-text,#f8fafc);box-shadow:0 24px 90px rgba(0,0,0,.38);font:13px/1.45 system-ui,sans-serif}',
      '#h2o-convergence-review-panel *{box-sizing:border-box}',
      '.h2oConvHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid rgba(148,163,184,.22)}',
      '.h2oConvBody{padding:18px 20px 22px}',
      '.h2oConvKicker{margin:0 0 4px;color:var(--wb-muted,#94a3b8);font-size:12px;text-transform:uppercase;letter-spacing:.08em}',
      '.h2oConvTitle{margin:0;font-size:20px;line-height:1.15}',
      '.h2oConvNote{margin:8px 0 0;color:var(--wb-muted,#94a3b8)}',
      '.h2oConvBtn{border:1px solid rgba(148,163,184,.34);border-radius:12px;background:rgba(148,163,184,.12);color:inherit;padding:9px 12px;font-weight:650;cursor:pointer}',
      '.h2oConvDanger{background:rgba(239,68,68,.16);border-color:rgba(248,113,113,.38)}',
      '.h2oConvGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}',
      '.h2oConvMetric{border:1px solid rgba(148,163,184,.22);border-radius:16px;padding:12px;background:rgba(148,163,184,.08)}',
      '.h2oConvValue{display:block;font-size:24px;font-weight:800;line-height:1.05}',
      '.h2oConvLabel{display:block;color:var(--wb-muted,#94a3b8);font-size:12px;margin-top:4px}',
      '.h2oConvSection{border:1px solid rgba(148,163,184,.22);border-radius:16px;margin:10px 0;background:rgba(148,163,184,.06)}',
      '.h2oConvSection>summary{cursor:pointer;padding:12px 14px;font-weight:780}',
      '.h2oConvSectionBody{padding:0 14px 14px}',
      '.h2oConvRows{display:grid;gap:8px}',
      '.h2oConvRow{border:1px solid rgba(148,163,184,.18);border-radius:14px;padding:10px;background:rgba(2,6,23,.18);word-break:break-word}',
      '.h2oConvCodes{margin:6px 0 0;color:var(--wb-muted,#94a3b8)}',
      '@media(max-width:760px){.h2oConvGrid{grid-template-columns:repeat(2,minmax(0,1fr))}#h2o-convergence-review-panel{right:10px;top:54px;width:calc(100vw - 20px)}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function renderPlan(plan) {
    var p = safeObject(plan);
    var counts = safeObject(p.counts);
    var buckets = safeObject(p.buckets);
    return '<div class="h2oConvHeader"><div>' +
      '<p class="h2oConvKicker">F10.8.6d read-only</p>' +
      '<h2 class="h2oConvTitle">Convergence review</h2>' +
      '<p class="h2oConvNote">Review only. No apply, convergence, proposal creation, automatic merge, or transport action.</p>' +
      '</div><div><button class="h2oConvBtn" id="h2o-convergence-refresh">Refresh plan</button> ' +
      '<a class="h2oConvBtn" href="#/settings/convergence/review">Open in Settings</a> ' +
      '<button class="h2oConvBtn h2oConvDanger" id="h2o-convergence-close">Close</button></div></div>' +
      '<div class="h2oConvBody">' +
      (state.message ? '<p class="h2oConvNote">' + escapeHtml(state.message) + '</p>' : '') +
      '<div class="h2oConvGrid">' +
      BUCKET_ORDER.map(function (bucket) { return metric(titleForBucket(bucket), counts[bucket] || 0); }).join('') +
      metric('plan ok', p.ok === true ? 'yes' : 'no') +
      '</div>' +
      codes('plan blockers', p.blockers) +
      codes('plan warnings', p.warnings) +
      BUCKET_ORDER.map(function (bucket) {
        var rows = asArray(buckets[bucket]);
        return '<details class="h2oConvSection" ' + (rows.length ? 'open' : '') + '>' +
          '<summary>' + escapeHtml(titleForBucket(bucket)) + ' (' + escapeHtml(rows.length) + ')</summary>' +
          '<div class="h2oConvSectionBody">' +
          rowList(rows, 'No ' + titleForBucket(bucket).toLowerCase() + ' items.') +
          '</div></details>';
      }).join('') +
      '</div>';
  }

  function bindPanel() {
    var close = document.getElementById('h2o-convergence-close');
    var refresh = document.getElementById('h2o-convergence-refresh');
    if (close) close.addEventListener('click', closeConvergenceReview);
    if (refresh) refresh.addEventListener('click', function () { refreshConvergenceReview(); });
  }

  function ensurePanel() {
    injectStyle();
    var panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Convergence review');
      document.body.appendChild(panel);
    }
    return panel;
  }

  async function renderPanel() {
    var panel = ensurePanel();
    if (!state.plan) state.plan = await collectPlan();
    panel.innerHTML = renderPlan(state.plan);
    bindPanel();
  }

  async function openConvergenceReview() {
    state.open = true;
    state.message = '';
    await refreshConvergenceReview();
    return state.plan;
  }

  function closeConvergenceReview() {
    state.open = false;
    var panel = document.getElementById(PANEL_ID);
    if (panel) panel.remove();
  }

  async function refreshConvergenceReview() {
    state.plan = await collectPlan();
    if (state.open) await renderPanel();
    return state.plan;
  }

  function installLauncher() {
    if (typeof document === 'undefined' || !document.body || document.getElementById(LAUNCHER_ID)) return;
    injectStyle();
    var button = document.createElement('button');
    button.id = LAUNCHER_ID;
    button.type = 'button';
    button.textContent = 'Convergence Review';
    button.setAttribute('aria-label', 'Open convergence review panel');
    button.addEventListener('click', function () { openConvergenceReview(); });
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

  H2O.Desktop.Sync.openConvergenceReview = openConvergenceReview;
  H2O.Desktop.Sync.refreshConvergenceReview = refreshConvergenceReview;
  H2O.Desktop.Sync.__convergenceReviewUiInstalled = true;
  H2O.Desktop.Sync.__convergenceReviewUiVersion = VERSION;

  bootLauncher();

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
