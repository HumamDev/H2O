/* H2O Studio — Saved Chat Archive Health UI (Desktop read-only, Phase C6.1)
 *
 * Read-only operator surface shell that renders the existing C5 archive
 * diagnostics into a Settings -> Diagnostics card. C6.1 is STATUS-ONLY:
 * idle / loading / unavailable / empty / ready / error — no summary counts
 * grid (C6.2), no package details table (C6.3), no Copy report JSON, no runtime
 * evidence (C6.4).
 *
 * Strictly read-only. It only calls the read-only diagnostic API
 * H2O.Studio.ingestion.diagnoseSavedChatArchiveV1 (injected by the caller). It
 * never mutates the DB, packages, CAS, sync, Chrome, or import/recovery state,
 * never repairs/imports/deletes/overwrites, and renders only into the provided
 * container (no full Settings repaint). On non-Desktop (API absent) it shows an
 * "available in Desktop Studio only" message instead of crashing.
 *
 * Public API (H2O.Studio.archiveHealthUi):
 *   renderArchiveHealthCard(container, { diagnose, diagnoseOptions })
 *   formatArchiveHealthSummary(result) -> pure { state, status, pill, headline, explanation }
 *
 * Contracts: docs/decisions/ADR-0009-chat-saving-architecture.md
 *            release-evidence/2026-06-24/saved-chat-archive-diagnostics-c5-closure.md
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  if (H2O.Studio.archiveHealthUi && H2O.Studio.archiveHealthUi.__installed) return;

  var MODULE_VERSION = '0.1.0-phase-c-c6.1';

  var TEXT = {
    title: 'Saved Chat Archive Health',
    idle: 'Run diagnostics to check saved chat package health.',
    loading: 'Reading saved chat archive diagnostics…',
    unavailable: 'Archive diagnostics are available in Desktop Studio only.',
    empty: 'No saved chat packages found yet.',
    ok: 'Archive diagnostics completed.',
    warning: 'Archive diagnostics completed with warnings. Saved packages may still be portable.',
    blocked: 'Archive diagnostics found package integrity problems.',
    error: 'Could not run archive diagnostics.',
    runButton: 'Run diagnostics',
  };

  /* Non-scary explanations: drift/warnings are not corruption. */
  var EXPLAIN = {
    ok: 'All saved chat packages are structurally valid.',
    warning: 'Warnings are database or asset-cache drift. The saved packages remain valid and portable.',
    partial: 'Some packages have integrity problems; others are healthy and portable.',
    blocked: 'One or more saved chat packages are corrupt or unreadable and need attention.',
    empty: 'Save a chat to a folder to create a package.',
  };

  var PILL_TONES = {
    ok: 'background:rgba(46,160,67,.18);color:#3fb950;border:1px solid rgba(46,160,67,.35)',
    warn: 'background:rgba(210,153,34,.18);color:#d29922;border:1px solid rgba(210,153,34,.35)',
    block: 'background:rgba(248,81,73,.16);color:#f85149;border:1px solid rgba(248,81,73,.35)',
    neutral: 'background:rgba(255,255,255,.06);color:inherit;border:1px solid rgba(255,255,255,.14)',
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return ''; }
  }

  /* Pure: map a diagnoseSavedChatArchiveV1 result to a status-only summary. */
  function formatArchiveHealthSummary(result) {
    var status = result && typeof result === 'object' ? String(result.status || '') : '';
    if (status === 'empty') {
      return { state: 'empty', status: 'empty', pill: { label: 'Empty', tone: 'neutral' }, headline: TEXT.empty, explanation: EXPLAIN.empty };
    }
    if (status === 'ok') {
      return { state: 'ready', status: 'ok', pill: { label: 'Healthy', tone: 'ok' }, headline: TEXT.ok, explanation: EXPLAIN.ok };
    }
    if (status === 'warning') {
      return { state: 'ready', status: 'warning', pill: { label: 'Healthy with drift', tone: 'warn' }, headline: TEXT.warning, explanation: EXPLAIN.warning };
    }
    if (status === 'partial') {
      return { state: 'ready', status: 'partial', pill: { label: 'Mixed', tone: 'block' }, headline: TEXT.blocked, explanation: EXPLAIN.partial };
    }
    if (status === 'blocked') {
      return { state: 'ready', status: 'blocked', pill: { label: 'Integrity problems', tone: 'block' }, headline: TEXT.blocked, explanation: EXPLAIN.blocked };
    }
    return { state: 'ready', status: status || 'unknown', pill: { label: 'Completed', tone: 'neutral' }, headline: TEXT.ok, explanation: '' };
  }

  function resolveDiagnose(options) {
    var opts = options || {};
    if (typeof opts.diagnose === 'function') return opts.diagnose;
    try {
      var ing = H2O.Studio && H2O.Studio.ingestion;
      if (ing && typeof ing.diagnoseSavedChatArchiveV1 === 'function') {
        return function (o) { return ing.diagnoseSavedChatArchiveV1(o); };
      }
    } catch (_) { /* ignore */ }
    return null;
  }

  function renderArchiveHealthCard(container, options) {
    if (!container || typeof container !== 'object') return null;
    if (typeof document === 'undefined') return null;
    var opts = options || {};
    var diagnose = resolveDiagnose(opts);
    var diagnoseOptions = opts.diagnoseOptions || { includeCasChecks: true, includeRendererChecks: true, includeDbChecks: true, limit: 500 };

    var card = {
      state: diagnose ? 'idle' : 'unavailable',
      lastResult: null,
      lastRunAt: null,
      error: null,
      busy: false,
    };

    function pillHtml(label, tone) {
      var style = PILL_TONES[tone] || PILL_TONES.neutral;
      return '<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;' + style + '">' + escapeHtml(label) + '</span>';
    }

    function bodyHtml() {
      if (card.state === 'unavailable') {
        return '<div style="opacity:.7;font-size:12px">' + escapeHtml(TEXT.unavailable) + '</div>';
      }
      if (card.state === 'idle') {
        return '<div style="opacity:.7;font-size:12px">' + escapeHtml(TEXT.idle) + '</div>';
      }
      if (card.state === 'loading') {
        return '<div style="opacity:.7;font-size:12px">' + escapeHtml(TEXT.loading) + '</div>';
      }
      if (card.state === 'error') {
        return '<div style="display:flex;flex-direction:column;gap:4px">'
          + '<div>' + pillHtml('Error', 'block') + '</div>'
          + '<div style="font-size:13px">' + escapeHtml(TEXT.error) + '</div>'
          + (card.error ? '<div style="opacity:.6;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace">' + escapeHtml(card.error) + '</div>' : '')
          + '</div>';
      }
      // ready / empty
      var summary = formatArchiveHealthSummary(card.lastResult);
      return '<div style="display:flex;flex-direction:column;gap:6px">'
        + '<div>' + pillHtml(summary.pill.label, summary.pill.tone) + '</div>'
        + '<div style="font-size:13px">' + escapeHtml(summary.headline) + '</div>'
        + (summary.explanation ? '<div style="opacity:.7;font-size:12px">' + escapeHtml(summary.explanation) + '</div>' : '')
        + '</div>';
    }

    function render() {
      var lastRunLine = card.lastRunAt
        ? '<div style="opacity:.55;font-size:11px">Last run: ' + escapeHtml(card.lastRunAt) + '</div>'
        : '';
      var disabled = (card.busy || card.state === 'unavailable') ? ' disabled' : '';
      var btnStyle = 'padding:8px 14px;border-radius:6px;cursor:pointer;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:inherit;font:inherit;'
        + ((card.busy || card.state === 'unavailable') ? 'opacity:.5;cursor:default;' : '');
      container.innerHTML = ''
        + '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">'
        +   '<div style="font-weight:600">' + escapeHtml(TEXT.title) + '</div>'
        +   '<button type="button" data-archive-health-run="1" style="' + btnStyle + '"' + disabled + '>' + escapeHtml(TEXT.runButton) + '</button>'
        + '</div>'
        + '<div data-archive-health-body="1">' + bodyHtml() + '</div>'
        + lastRunLine;
      var btn = container.querySelector('[data-archive-health-run="1"]');
      if (btn && !(card.busy || card.state === 'unavailable')) {
        btn.addEventListener('click', run, { once: true });
      }
    }

    function run() {
      if (card.busy || card.state === 'unavailable' || !diagnose) return;
      card.busy = true;
      card.state = 'loading';
      card.error = null;
      render();
      var p;
      try { p = diagnose(diagnoseOptions); }
      catch (err) { onError(err); return; }
      if (!p || typeof p.then !== 'function') { onResult(p); return; }
      p.then(onResult, onError);
    }

    function onResult(result) {
      card.busy = false;
      card.lastResult = result || null;
      card.lastRunAt = nowIso();
      var status = result && typeof result === 'object' ? String(result.status || '') : '';
      card.state = status === 'empty' ? 'empty' : 'ready';
      render();
    }

    function onError(err) {
      card.busy = false;
      card.error = String((err && (err.message || err)) || 'unknown error');
      card.state = 'error';
      card.lastRunAt = nowIso();
      render();
    }

    render();
    return { run: run, getState: function () { return card.state; } };
  }

  H2O.Studio.archiveHealthUi = {
    __installed: true,
    __version: MODULE_VERSION,
    renderArchiveHealthCard: renderArchiveHealthCard,
    formatArchiveHealthSummary: formatArchiveHealthSummary,
  };
})(typeof window !== 'undefined' ? window : globalThis);
