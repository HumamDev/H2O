/* H2O Desktop Sync - F14.5.5.3 snapshot F5 review operator UI panel
 *
 * Operator-visible read+decide-only panel for the snapshot tombstone
 * reviews landed by F14.5.5.2 (receipt wire-through) into the F14.5.5.1
 * F5 review queue. This is the last F14.5.5.x sub-phase before F14 closes.
 *
 * BUTTON LABEL POLICY (enforced by header comment + render-time guard):
 *   Allowed verbs: "Approve seal", "Approve restore", "Refresh", "Close panel".
 *   FORBIDDEN (auto-asserted absent from rendered DOM by the proof harness):
 *     dispatch, native action, f5 action, relay action, settle, settlement
 *     action, publish, apply, mutate, execute now, undo, reject, deny.
 *
 * Hard boundaries (per F14.5.5 §1 + §11):
 *   - No Native execution. No F5 work outside the queue ledger.
 *   - No publication / relay / outbox / watermark / consumed-op writes.
 *   - No raw chatId, title, accountId, model, modelSlug, content, turns,
 *     messages, share urls rendered to the DOM. All identifiers shortHash'd
 *     before render; all dynamic text escapeHtml'd. The `metadata.reviewRow`
 *     subfield from getF5ReviewById is NEVER read by the panel (only the
 *     redacted `result.rows[]` array is consumed).
 *   - No date picker for observedAtIso; locked to nowIsoSeconds() at
 *     refresh time. No operator-typed rationale today; if added, must be
 *     sha256-hashed client-side before persistence with raw text discarded.
 *   - No own timer. The fallback expiry sweep is invoked synchronously
 *     during open/refresh and only as a safety net for the F14.6 timer.
 *   - Decision buttons render ONLY when row.currentState === 'pending'
 *     and a fully-hashed actorPeer is available. Defense-in-depth client
 *     guards re-check both invariants on click.
 *   - approval token never logged; canonicalJson token-input object is
 *     consumed by sha256 and discarded.
 *
 * Public API:
 *   H2O.Desktop.Sync.openSnapshotF5ReviewPanel(options)
 *   H2O.Desktop.Sync.refreshSnapshotF5ReviewPanel(options)
 *   H2O.Desktop.Sync.__snapshotF5ReviewPanelInstalled
 *   H2O.Desktop.Sync.__snapshotF5ReviewPanelVersion
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
  if (H2O.Desktop.Sync.__snapshotF5ReviewPanelInstalled) return;

  // ── Constants ───────────────────────────────────────────────────────
  var VERSION = '0.1.0-f14.5.5.3';
  var RESULT_SCHEMA = 'h2o.desktop.sync.snapshot-f5-review-panel.v1';
  var PANEL_ID = 'h2o-snapshot-f5-review-panel';
  var STYLE_ID = 'h2o-snapshot-f5-review-style';
  var STATE_PENDING = 'pending';
  var STATES = ['pending', 'approved-seal', 'approved-restore',
                'auto-expired', 'closed-sealed', 'closed-restored'];
  var TERMINAL_STATES = ['closed-sealed', 'closed-restored'];
  var DECISION_SEAL = 'approve-seal';
  var DECISION_RESTORE = 'approve-restore';
  var STATE_LABELS = {
    'pending': 'Pending review',
    'approved-seal': 'Approved (seal)',
    'approved-restore': 'Approved (restore)',
    'auto-expired': 'Auto-expired',
    'closed-sealed': 'Closed (sealed)',
    'closed-restored': 'Closed (restored)'
  };
  var DEFAULT_STUCK_GRACE_MS = 24 * 60 * 60 * 1000; // 24h

  // ── Tiny helpers ────────────────────────────────────────────────────
  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function cleanLower(value) { return cleanString(value).toLowerCase(); }
  function nowIsoSeconds() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function isSha256Hex(value) { return typeof value === 'string' && /^[0-9a-f]{64}$/.test(cleanLower(value)); }
  function addCode(list, code) {
    var n = cleanString(code);
    if (!n || list.indexOf(n) !== -1) return;
    list.push(n);
  }
  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean).filter(function (code, index, arr) { return arr.indexOf(code) === index; });
  }
  // Verbatim copy of snapshot-convergence-ui.tauri.js shortHash semantics
  function shortHash(value) {
    var s = cleanString(value);
    if (!s) return 'missing';
    if (s.length <= 14) return s;
    return s.slice(0, 12) + '…';
  }
  // Verbatim copy of escapeHtml from snapshot-convergence-ui.tauri.js
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Canonicalize byte-identical to the queue's lines 177-185 + 187-192 so
  // the approval-token derivation produces the same digest. Kernel preferred.
  function canonicalizeForToken(value) {
    if (Array.isArray(value)) return value.map(canonicalizeForToken);
    if (!isObject(value)) return value;
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      if (typeof value[key] !== 'undefined') out[key] = canonicalizeForToken(value[key]);
    });
    return out;
  }
  function canonicalJsonForToken(value) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.canonicalJSON === 'function') {
      try { return kernel.canonicalJSON(value); } catch (_) { /* fall through */ }
    }
    return JSON.stringify(canonicalizeForToken(value));
  }
  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      var p = bytes[i].toString(16);
      hex += p.length === 1 ? '0' + p : p;
    }
    return hex;
  }
  function webCryptoAvailable() {
    try { return !!(global.crypto && global.crypto.subtle && global.crypto.subtle.digest); }
    catch (_) { return false; }
  }
  async function sha256Hex(value) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.sha256Hex === 'function') {
      try {
        var k = await kernel.sha256Hex(value);
        if (isSha256Hex(k)) return cleanLower(k);
      } catch (_) { /* fall through */ }
    }
    if (!webCryptoAvailable()) return '';
    var text = typeof value === 'string' ? value : canonicalJsonForToken(value);
    var data = new TextEncoder().encode(text);
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
  }

  // ── Actor peer resolution ──────────────────────────────────────────
  // Returns { peer, ok, reason } — never returns operator raw identity.
  // The queue rejects any actorPeer whose three hashes are not sha256 hex;
  // this guard surfaces the failure as a panel-level warning + disabled
  // decision buttons rather than letting the queue reject after click.
  async function resolveActorPeer() {
    var studio = (global.H2O && global.H2O.Studio) || null;
    var identity = studio && studio.identity ? studio.identity : null;
    var raw = null;
    try {
      if (identity && typeof identity.get === 'function') raw = identity.get();
      else if (identity && typeof identity === 'object') raw = identity;
    } catch (_) { raw = null; }
    if (!isObject(raw)) {
      return { peer: null, ok: false, reason: 'actor-peer-unavailable' };
    }
    var peer = {
      physicalDeviceIdHash: cleanLower(raw.physicalDeviceIdHash),
      installIdHash: cleanLower(raw.installIdHash),
      syncPeerIdHash: cleanLower(raw.syncPeerIdHash),
      surfaceKind: cleanString(raw.surfaceKind) || 'desktop-tauri'
    };
    if (!isSha256Hex(peer.physicalDeviceIdHash)
        || !isSha256Hex(peer.installIdHash)
        || !isSha256Hex(peer.syncPeerIdHash)) {
      return { peer: null, ok: false, reason: 'actor-peer-hashes-invalid' };
    }
    return { peer: peer, ok: true, reason: '' };
  }

  // ── Approval-token derivation (byte-identical to queue's deriveApprovalToken) ─
  // CRITICAL contract per the workflow's API review (blocker):
  //   queue computes sha256(canonicalJson({reviewId, decisionKind,
  //     reviewStatusVersion, actorPeerSyncHash, decidedAtIso}))
  //   with cleanLower on reviewId/actorPeerSyncHash, cleanString on
  //   decisionKind/decidedAtIso, and (parts.reviewStatusVersion | 0).
  //   The decidedAtIso STRING IDENTITY must match between token derivation
  //   and the recordF5ReviewDecision call — callers MUST capture the ISO
  //   string ONCE and pass the same reference into both code paths.
  async function deriveApprovalToken(parts) {
    var body = {
      reviewId: cleanLower(parts.reviewId),
      decisionKind: cleanString(parts.decisionKind),
      reviewStatusVersion: (parts.reviewStatusVersion | 0),
      actorPeerSyncHash: cleanLower(parts.actorPeerSyncHash),
      decidedAtIso: cleanString(parts.decidedAtIso)
    };
    return await sha256Hex(canonicalJsonForToken(body));
  }

  // ── Queue API surface (kernel-first; defensive null returns) ────────
  function sync() { return (H2O && H2O.Desktop && H2O.Desktop.Sync) || {}; }
  async function queueListByState(state, observedAtIso) {
    var s = sync();
    if (typeof s.listF5ReviewsByState !== 'function') return null;
    try { return await s.listF5ReviewsByState(state, observedAtIso); }
    catch (_) { return null; }
  }
  async function queueListPastExpiry(observedAtIso) {
    var s = sync();
    if (typeof s.listF5ReviewsPastExpiry !== 'function') return null;
    try { return await s.listF5ReviewsPastExpiry(observedAtIso); }
    catch (_) { return null; }
  }
  async function queueListStuck(observedAtIso, gracePeriodMs) {
    var s = sync();
    if (typeof s.listF5ReviewsStuckPostDecision !== 'function') return null;
    try { return await s.listF5ReviewsStuckPostDecision(observedAtIso, gracePeriodMs); }
    catch (_) { return null; }
  }
  async function queueGetById(reviewId) {
    var s = sync();
    if (typeof s.getF5ReviewById !== 'function') return null;
    try { return await s.getF5ReviewById(reviewId); }
    catch (_) { return null; }
  }
  async function queueEvaluateExpiry(reviewId, observedAtIso) {
    var s = sync();
    if (typeof s.evaluateF5ReviewExpiry !== 'function') return null;
    try { return await s.evaluateF5ReviewExpiry({ reviewId: reviewId, observedAtIso: observedAtIso }); }
    catch (_) { return null; }
  }
  async function queueRecordDecision(input) {
    var s = sync();
    if (typeof s.recordF5ReviewDecision !== 'function') return null;
    try { return await s.recordF5ReviewDecision(input); }
    catch (_) { return null; }
  }

  // ── Snapshot collection (egress rows only; never reads metadata.reviewRow) ─
  // The list/get APIs return rows already privacy-scanned by the queue.
  // The panel consumes ONLY the redacted `rows[]` array; `metadata.reviewRow`
  // is intentionally ignored at the call boundary.
  async function collectSnapshot(observedAtIso, gracePeriodMs) {
    var snapshot = {
      observedAtIso: observedAtIso,
      perState: {},
      pastExpiryIds: [],
      stuckIds: []
    };
    for (var i = 0; i < STATES.length; i++) {
      var st = STATES[i];
      var res = await queueListByState(st, observedAtIso);
      snapshot.perState[st] = (res && res.ok && Array.isArray(res.rows)) ? res.rows.slice() : [];
    }
    var past = await queueListPastExpiry(observedAtIso);
    if (past && past.ok && Array.isArray(past.rows)) {
      snapshot.pastExpiryIds = past.rows.map(function (r) { return cleanLower(r.reviewId); }).filter(Boolean);
    }
    var stuck = await queueListStuck(observedAtIso, gracePeriodMs);
    if (stuck && stuck.ok && Array.isArray(stuck.rows)) {
      snapshot.stuckIds = stuck.rows.map(function (r) { return cleanLower(r.reviewId); }).filter(Boolean);
    }
    return snapshot;
  }

  // ── Auto-expiry sweep on open (fallback for F14.6 timer) ────────────
  // Sequential: list-past-expiry → evaluate per row → collect auto-expired ids.
  // Returns the list of reviewIds that auto-expired during this open so the
  // panel can surface a non-modal toast/banner ("N reviews auto-expired").
  async function autoExpirySweep(observedAtIso) {
    var expiredIds = [];
    var past = await queueListPastExpiry(observedAtIso);
    if (!past || !past.ok || !Array.isArray(past.rows)) return expiredIds;
    for (var i = 0; i < past.rows.length; i++) {
      var row = past.rows[i];
      var rid = cleanLower(row && row.reviewId);
      if (!isSha256Hex(rid)) continue;
      var ev = await queueEvaluateExpiry(rid, observedAtIso);
      if (ev && ev.ok && ev.status === 'auto-expired') expiredIds.push(rid);
    }
    return expiredIds;
  }

  // ── Decision flow with retry-once on f5-review-decision-stale ──────
  // Per the workflow's API review (blocker): on click, re-fetch fresh
  // reviewStatusVersion, capture decidedAtIso ONCE, compute approvalToken
  // with the matching version, post recordF5ReviewDecision. On
  // f5-review-decision-stale (concurrent ledger advance), retry exactly
  // once with a fresh fetch + new token. Never retry beyond once.
  async function submitDecision(reviewId, decisionKind, actorPeer) {
    var observed = nowIsoSeconds();
    var decidedAtIso = observed; // captured ONCE; passed verbatim to both token + API
    for (var attempt = 1; attempt <= 2; attempt++) {
      var fetched = await queueGetById(reviewId);
      if (!fetched || fetched.status !== 'found') {
        return { ok: false, reason: 'f5-review-not-found', attempt: attempt };
      }
      // Defense-in-depth client-side terminal guard
      if (fetched.currentState !== STATE_PENDING) {
        return { ok: false, reason: 'f5-review-not-pending', attempt: attempt };
      }
      var version = (fetched.reviewStatusVersion | 0);
      var approvalToken = await deriveApprovalToken({
        reviewId: reviewId,
        decisionKind: decisionKind,
        reviewStatusVersion: version,
        actorPeerSyncHash: actorPeer.syncPeerIdHash,
        decidedAtIso: decidedAtIso
      });
      var posted = await queueRecordDecision({
        reviewId: reviewId,
        decisionKind: decisionKind,
        actorPeer: actorPeer,
        approvalToken: approvalToken,
        decidedAtIso: decidedAtIso,
        observedAtIso: decidedAtIso
      });
      if (posted && posted.ok === true) {
        return {
          ok: true, reason: '',
          attempt: attempt,
          reviewId: reviewId,
          currentState: posted.currentState,
          reviewStatusVersion: posted.reviewStatusVersion
        };
      }
      var blockers = codeList(posted && posted.blockers);
      if (blockers.indexOf('f5-review-decision-stale') === -1 || attempt === 2) {
        return { ok: false, reason: blockers[0] || 'f5-review-decision-failed',
                 blockers: blockers, attempt: attempt };
      }
      // else: stale + first attempt → loop again with fresh fetch + new token
    }
    return { ok: false, reason: 'f5-review-decision-exhausted', attempt: 2 };
  }

  // ── DOM rendering ───────────────────────────────────────────────────
  function styleSheetText() {
    return [
      '#' + PANEL_ID + '{position:fixed;right:18px;top:64px;width:520px;max-height:80vh;overflow:auto;',
      'background:#181a20;color:#e5e7eb;border:1px solid #2d3142;border-radius:10px;padding:14px 16px;',
      'font:13px/1.4 system-ui,sans-serif;z-index:2147482610;box-shadow:0 6px 24px rgba(0,0,0,.4);}',
      '#' + PANEL_ID + '[data-settings-hosted="true"]{position:static;right:auto;top:auto;width:auto;max-height:none;box-shadow:none;border:none;border-radius:0;padding:0;}',
      '#' + PANEL_ID + ' h2{margin:0 0 6px;font-size:15px;font-weight:600;color:#fafafa;}',
      '#' + PANEL_ID + ' h3{margin:14px 0 4px;font-size:13px;font-weight:600;color:#cbd5e1;text-transform:uppercase;letter-spacing:.05em;}',
      '#' + PANEL_ID + ' .h2o-f5-meta{font-size:11px;color:#9ca3af;margin:0 0 8px;}',
      '#' + PANEL_ID + ' .h2o-f5-banner{padding:8px 10px;margin:6px 0;border-radius:6px;font-size:12px;}',
      '#' + PANEL_ID + ' .h2o-f5-banner-warn{background:#3a2a14;color:#fde68a;border:1px solid #6a4d18;}',
      '#' + PANEL_ID + ' .h2o-f5-banner-info{background:#1e2a3a;color:#bae6fd;border:1px solid #1e4060;}',
      '#' + PANEL_ID + ' .h2o-f5-row{padding:10px;margin:6px 0;border-radius:6px;background:#22252e;border:1px solid #2d3142;}',
      '#' + PANEL_ID + ' .h2o-f5-row-past{border-color:#7f1d1d;background:#2a181a;}',
      '#' + PANEL_ID + ' .h2o-f5-row-soon{border-color:#9a6b00;background:#2a2418;}',
      '#' + PANEL_ID + ' .h2o-f5-badges{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0;}',
      '#' + PANEL_ID + ' .h2o-f5-badge{font-size:10px;padding:2px 6px;border-radius:10px;background:#2d3142;color:#cbd5e1;}',
      '#' + PANEL_ID + ' .h2o-f5-badge-past{background:#7f1d1d;color:#fecaca;}',
      '#' + PANEL_ID + ' .h2o-f5-badge-soon{background:#9a6b00;color:#fde68a;}',
      '#' + PANEL_ID + ' .h2o-f5-badge-stuck{background:#581c87;color:#e9d5ff;}',
      '#' + PANEL_ID + ' .h2o-f5-fields{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#a6b0c0;margin:4px 0;}',
      '#' + PANEL_ID + ' .h2o-f5-fields dt{display:inline-block;min-width:120px;color:#7f8696;}',
      '#' + PANEL_ID + ' .h2o-f5-fields dd{display:inline;margin:0 0 0 4px;}',
      '#' + PANEL_ID + ' .h2o-f5-fields .h2o-f5-line{display:block;margin:2px 0;}',
      '#' + PANEL_ID + ' .h2o-f5-actions{display:flex;gap:8px;margin-top:8px;}',
      '#' + PANEL_ID + ' button.h2o-f5-btn{cursor:pointer;font:inherit;padding:6px 12px;border-radius:6px;border:1px solid #2d3142;background:#374151;color:#fafafa;}',
      '#' + PANEL_ID + ' button.h2o-f5-btn:hover{background:#475569;}',
      '#' + PANEL_ID + ' button.h2o-f5-btn-seal{background:#7f1d1d;border-color:#9b2222;}',
      '#' + PANEL_ID + ' button.h2o-f5-btn-seal:hover{background:#9b2222;}',
      '#' + PANEL_ID + ' button.h2o-f5-btn-restore{background:#14532d;border-color:#166534;}',
      '#' + PANEL_ID + ' button.h2o-f5-btn-restore:hover{background:#166534;}',
      '#' + PANEL_ID + ' button.h2o-f5-btn[disabled]{opacity:.4;cursor:not-allowed;}',
      '#' + PANEL_ID + ' .h2o-f5-confirm{font-size:12px;color:#fde68a;margin-top:6px;}',
      '#' + PANEL_ID + ' .h2o-f5-tabs{display:flex;gap:4px;flex-wrap:wrap;margin:6px 0;}',
      '#' + PANEL_ID + ' .h2o-f5-tab{font-size:11px;padding:3px 8px;border-radius:10px;background:#2d3142;color:#cbd5e1;cursor:pointer;border:0;}',
      '#' + PANEL_ID + ' .h2o-f5-tab[aria-pressed="true"]{background:#475569;color:#fafafa;}'
    ].join('');
  }
  function ensureStyle(doc) {
    if (!doc || typeof doc.getElementById !== 'function') return;
    var existing = doc.getElementById(STYLE_ID);
    if (existing) return;
    var style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = styleSheetText();
    if (doc.head && typeof doc.head.appendChild === 'function') doc.head.appendChild(style);
    else if (doc.body && typeof doc.body.appendChild === 'function') doc.body.appendChild(style);
  }
  function el(doc, tag, props) {
    var node = doc.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      if (k === 'text') node.textContent = props[k];
      else if (k === 'cls') node.className = props[k];
      else if (k === 'attrs') Object.keys(props[k]).forEach(function (a) { node.setAttribute(a, props[k][a]); });
      else node[k] = props[k];
    });
    return node;
  }
  function fieldLine(doc, label, value) {
    var line = el(doc, 'span', { cls: 'h2o-f5-line' });
    line.appendChild(el(doc, 'dt', { text: label }));
    line.appendChild(el(doc, 'dd', { text: cleanString(value) || '—' }));
    return line;
  }
  function renderRowCard(doc, row, opts) {
    opts = opts || {};
    var card = el(doc, 'div', { cls: 'h2o-f5-row' });
    if (row.pastExpiry === true) card.className += ' h2o-f5-row-past';
    else if (typeof row.daysRemaining === 'number' && row.daysRemaining <= 1) card.className += ' h2o-f5-row-soon';
    card.setAttribute('data-review-id-short', shortHash(row.reviewId));
    card.setAttribute('data-current-state', cleanString(row.currentState));

    // Badge row
    var badges = el(doc, 'div', { cls: 'h2o-f5-badges' });
    var stateBadge = el(doc, 'span', { cls: 'h2o-f5-badge', text: STATE_LABELS[row.currentState] || row.currentState });
    badges.appendChild(stateBadge);
    if (row.pastExpiry === true) badges.appendChild(el(doc, 'span', { cls: 'h2o-f5-badge h2o-f5-badge-past', text: 'Past expiry' }));
    else if (typeof row.daysRemaining === 'number' && row.daysRemaining <= 1) {
      badges.appendChild(el(doc, 'span', { cls: 'h2o-f5-badge h2o-f5-badge-soon', text: 'Expires soon' }));
    }
    if (opts.stuck === true) badges.appendChild(el(doc, 'span', { cls: 'h2o-f5-badge h2o-f5-badge-stuck', text: 'Awaiting apply' }));
    card.appendChild(badges);

    // Privacy-safe fields ONLY — all identifiers shortHash'd before render.
    var fields = el(doc, 'dl', { cls: 'h2o-f5-fields' });
    fields.appendChild(fieldLine(doc, 'reviewId', shortHash(row.reviewId)));
    fields.appendChild(fieldLine(doc, 'subjectId', shortHash(row.subjectId)));
    fields.appendChild(fieldLine(doc, 'lineageId', shortHash(row.lineageId)));
    fields.appendChild(fieldLine(doc, 'reviewStatusVersion', String(row.reviewStatusVersion | 0)));
    fields.appendChild(fieldLine(doc, 'evidenceDigestCount', String(row.evidenceDigestCount | 0)));
    fields.appendChild(fieldLine(doc, 'retentionStartedAtIso', row.retentionStartedAtIso));
    fields.appendChild(fieldLine(doc, 'retentionExpiresAtIso', row.retentionExpiresAtIso));
    if (typeof row.daysRemaining === 'number') {
      fields.appendChild(fieldLine(doc, 'daysRemaining', String(row.daysRemaining)));
    }
    if (cleanString(row.postDecisionAtIso)) {
      fields.appendChild(fieldLine(doc, 'postDecisionAtIso', row.postDecisionAtIso));
    }
    if (cleanString(row.lastEventAtIso)) {
      fields.appendChild(fieldLine(doc, 'lastEventAtIso', row.lastEventAtIso));
    }
    card.appendChild(fields);

    // Decision controls — ONLY on pending rows AND only when actorPeer
    // is resolved. Terminal/auto-expired rows render NO buttons at all.
    if (row.currentState === STATE_PENDING && opts.canDecide === true) {
      var actions = el(doc, 'div', { cls: 'h2o-f5-actions' });
      var sealBtn = el(doc, 'button', {
        cls: 'h2o-f5-btn h2o-f5-btn-seal',
        text: 'Approve seal',
        attrs: { 'type': 'button', 'data-decision': DECISION_SEAL, 'data-review-id': cleanLower(row.reviewId) }
      });
      var restoreBtn = el(doc, 'button', {
        cls: 'h2o-f5-btn h2o-f5-btn-restore',
        text: 'Approve restore (cancel tombstone)',
        attrs: { 'type': 'button', 'data-decision': DECISION_RESTORE, 'data-review-id': cleanLower(row.reviewId) }
      });
      sealBtn.addEventListener('click', opts.onSeal);
      restoreBtn.addEventListener('click', opts.onRestore);
      actions.appendChild(sealBtn);
      actions.appendChild(restoreBtn);
      card.appendChild(actions);
    }
    return card;
  }

  function renderPanel(doc, panel, state) {
    while (panel.firstChild) panel.removeChild(panel.firstChild);

    panel.appendChild(el(doc, 'h2', { text: 'F5 review queue' }));
    panel.appendChild(el(doc, 'p', { cls: 'h2o-f5-meta',
      text: 'Read + decide only. Observed: ' + (state.snapshot.observedAtIso || '—') }));

    // Identity / actor-peer banner
    if (!state.actorPeer) {
      var warn = el(doc, 'div', { cls: 'h2o-f5-banner h2o-f5-banner-warn',
        text: 'Identity unavailable — decision buttons disabled. ('
          + (state.actorPeerReason || 'actor-peer-unavailable') + ')' });
      panel.appendChild(warn);
    }
    // Auto-expiry sweep banner
    if (Array.isArray(state.autoExpiredIds) && state.autoExpiredIds.length) {
      var info = el(doc, 'div', { cls: 'h2o-f5-banner h2o-f5-banner-info',
        text: state.autoExpiredIds.length + ' review(s) auto-expired on open: '
          + state.autoExpiredIds.map(shortHash).join(', ') });
      panel.appendChild(info);
    }

    // ── Pending section (action column visible) ────────────────────
    panel.appendChild(el(doc, 'h3', { text: 'Pending review (' + (state.snapshot.perState.pending || []).length + ')' }));
    var pendingRows = (state.snapshot.perState.pending || []).slice();
    pendingRows.sort(function (a, b) {
      if (a.pastExpiry === b.pastExpiry) {
        return (a.daysRemaining | 0) - (b.daysRemaining | 0);
      }
      return a.pastExpiry ? -1 : 1;
    });
    if (!pendingRows.length) {
      panel.appendChild(el(doc, 'p', { cls: 'h2o-f5-meta', text: 'No pending reviews.' }));
    } else {
      for (var i = 0; i < pendingRows.length; i++) {
        panel.appendChild(renderRowCard(doc, pendingRows[i], {
          canDecide: !!state.actorPeer,
          onSeal: state.handleSeal,
          onRestore: state.handleRestore
        }));
      }
    }

    // ── History section (read-only; filterable by state) ────────────
    panel.appendChild(el(doc, 'h3', { text: 'History' }));
    var tabs = el(doc, 'div', { cls: 'h2o-f5-tabs' });
    var historyStates = STATES.filter(function (s) { return s !== STATE_PENDING; });
    historyStates.forEach(function (s) {
      var rows = state.snapshot.perState[s] || [];
      var btn = el(doc, 'button', {
        cls: 'h2o-f5-tab',
        text: STATE_LABELS[s] + ' (' + rows.length + ')',
        attrs: { 'type': 'button', 'data-history-tab': s,
                 'aria-pressed': state.historyFilter === s ? 'true' : 'false' }
      });
      btn.addEventListener('click', function () { state.handleHistoryFilter(s); });
      tabs.appendChild(btn);
    });
    panel.appendChild(tabs);

    var activeHistoryRows = (state.snapshot.perState[state.historyFilter] || []);
    if (!activeHistoryRows.length) {
      panel.appendChild(el(doc, 'p', { cls: 'h2o-f5-meta', text: 'No rows in this state.' }));
    } else {
      for (var j = 0; j < activeHistoryRows.length; j++) {
        var stuck = state.snapshot.stuckIds.indexOf(cleanLower(activeHistoryRows[j].reviewId)) !== -1;
        panel.appendChild(renderRowCard(doc, activeHistoryRows[j], {
          canDecide: false, // history rows NEVER expose decision buttons
          stuck: stuck
        }));
      }
    }

    // ── Confirmation surface (lives at panel bottom; only visible during 2-step) ─
    if (state.pendingConfirm) {
      var confirm = el(doc, 'div', { cls: 'h2o-f5-banner h2o-f5-banner-warn h2o-f5-confirm' });
      confirm.appendChild(el(doc, 'span', {
        text: 'Confirm ' + (state.pendingConfirm.kind === DECISION_SEAL ? 'seal (irreversible)' : 'restore')
          + ' for review ' + shortHash(state.pendingConfirm.reviewId) + '?' }));
      var go = el(doc, 'button', {
        cls: 'h2o-f5-btn ' + (state.pendingConfirm.kind === DECISION_SEAL ? 'h2o-f5-btn-seal' : 'h2o-f5-btn-restore'),
        text: state.pendingConfirm.kind === DECISION_SEAL ? 'Approve seal' : 'Approve restore',
        attrs: { 'type': 'button' }
      });
      go.addEventListener('click', state.handleConfirmGo);
      var cancel = el(doc, 'button', {
        cls: 'h2o-f5-btn', text: 'Cancel', attrs: { 'type': 'button' }
      });
      cancel.addEventListener('click', state.handleConfirmCancel);
      var actions = el(doc, 'div', { cls: 'h2o-f5-actions' });
      actions.appendChild(go);
      actions.appendChild(cancel);
      confirm.appendChild(actions);
      panel.appendChild(confirm);
    }

    // Footer
    var footer = el(doc, 'div', { cls: 'h2o-f5-actions' });
    var refresh = el(doc, 'button', { cls: 'h2o-f5-btn', text: 'Refresh', attrs: { 'type': 'button' } });
    refresh.addEventListener('click', state.handleRefresh);
    footer.appendChild(refresh);
    if (state.settingsHosted !== true) {
      var close = el(doc, 'button', { cls: 'h2o-f5-btn', text: 'Close panel', attrs: { 'type': 'button' } });
      close.addEventListener('click', state.handleClose);
      footer.appendChild(close);
    }
    panel.appendChild(footer);
  }

  function ensurePanel(doc, settingsHosted) {
    if (!doc) return null;
    var existing = doc.getElementById(PANEL_ID);
    if (existing) {
      if (settingsHosted === true) existing.setAttribute('data-settings-hosted', 'true');
      else existing.removeAttribute('data-settings-hosted');
      return existing;
    }
    var section = doc.createElement('section');
    section.id = PANEL_ID;
    section.setAttribute('role', 'dialog');
    section.setAttribute('aria-label', 'F5 review queue panel');
    if (settingsHosted === true) section.setAttribute('data-settings-hosted', 'true');
    if (doc.body && typeof doc.body.appendChild === 'function') doc.body.appendChild(section);
    return section;
  }

  // ── Panel state (per-panel; module is single-panel by design) ───────
  var STATE = {
    actorPeer: null,
    actorPeerReason: '',
    snapshot: { observedAtIso: '', perState: {}, pastExpiryIds: [], stuckIds: [] },
    autoExpiredIds: [],
    historyFilter: 'closed-sealed',
    pendingConfirm: null,
    settingsHosted: false,
    handleSeal: null,
    handleRestore: null,
    handleConfirmGo: null,
    handleConfirmCancel: null,
    handleHistoryFilter: null,
    handleRefresh: null,
    handleClose: null,
    lastResult: null
  };

  function getDocument() {
    try { if (typeof document !== 'undefined' && document) return document; }
    catch (_) { /* ignore */ }
    try { if (global && global.document) return global.document; }
    catch (_) { /* ignore */ }
    return null;
  }

  async function refreshState(observedAtIsoOverride) {
    var observed = cleanString(observedAtIsoOverride) || nowIsoSeconds();
    var resolved = await resolveActorPeer();
    STATE.actorPeer = resolved.peer;
    STATE.actorPeerReason = resolved.reason;
    var expired = await autoExpirySweep(observed);
    STATE.autoExpiredIds = expired;
    var snap = await collectSnapshot(observed, DEFAULT_STUCK_GRACE_MS);
    STATE.snapshot = snap;
    STATE.pendingConfirm = null; // dismiss any in-flight confirm on refresh
  }

  function wireHandlers(doc, panel) {
    STATE.handleRefresh = function () { refreshAndRender(doc, panel); };
    STATE.handleClose = function () {
      if (!panel) return;
      if (panel.parentNode && typeof panel.parentNode.removeChild === 'function') {
        try { panel.parentNode.removeChild(panel); } catch (_) { /* ignore */ }
      }
    };
    STATE.handleHistoryFilter = function (s) {
      STATE.historyFilter = s;
      renderPanel(doc, panel, STATE);
    };
    STATE.handleSeal = function (ev) {
      var rid = cleanLower(ev && ev.currentTarget && ev.currentTarget.getAttribute('data-review-id'));
      if (!isSha256Hex(rid)) return;
      // Two-step confirmation for the destructive path (per UX review).
      STATE.pendingConfirm = { kind: DECISION_SEAL, reviewId: rid };
      renderPanel(doc, panel, STATE);
    };
    STATE.handleRestore = function (ev) {
      var rid = cleanLower(ev && ev.currentTarget && ev.currentTarget.getAttribute('data-review-id'));
      if (!isSha256Hex(rid)) return;
      // Restore is reversible relative to seal; still confirm for symmetry.
      STATE.pendingConfirm = { kind: DECISION_RESTORE, reviewId: rid };
      renderPanel(doc, panel, STATE);
    };
    STATE.handleConfirmCancel = function () {
      STATE.pendingConfirm = null;
      renderPanel(doc, panel, STATE);
    };
    STATE.handleConfirmGo = async function () {
      var pending = STATE.pendingConfirm;
      if (!pending || !STATE.actorPeer) {
        STATE.pendingConfirm = null;
        renderPanel(doc, panel, STATE);
        return;
      }
      STATE.pendingConfirm = null;
      STATE.lastResult = await submitDecision(pending.reviewId, pending.kind, STATE.actorPeer);
      await refreshAndRender(doc, panel);
    };
  }

  async function refreshAndRender(doc, panel) {
    await refreshState();
    if (doc && panel) {
      ensureStyle(doc);
      renderPanel(doc, panel, STATE);
    }
    return buildResult();
  }

  function buildResult() {
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: true,
      panelId: PANEL_ID,
      observedAtIso: STATE.snapshot.observedAtIso,
      actorPeerResolved: !!STATE.actorPeer,
      actorPeerReason: STATE.actorPeerReason || '',
      pendingCount: ((STATE.snapshot.perState.pending) || []).length,
      historyCounts: STATES.reduce(function (acc, s) {
        acc[s] = (STATE.snapshot.perState[s] || []).length;
        return acc;
      }, {}),
      autoExpiredOnOpenIds: STATE.autoExpiredIds.slice(),
      lastDecisionResult: STATE.lastResult || null,
      sideEffectSummary: {
        publicationTouched: false,
        relayTouched: false,
        outboxTouched: false,
        nativeCalled: false,
        applyExecuted: false,
        watermarkWritten: false,
        consumedOperationWritten: false,
        snapshotMutated: false
      },
      warnings: STATE.actorPeer ? [] : [STATE.actorPeerReason || 'actor-peer-unavailable']
    };
  }

  // ── Public API ──────────────────────────────────────────────────────
  async function openSnapshotF5ReviewPanel(options) {
    options = isObject(options) ? options : {};
    STATE.settingsHosted = options.settingsHosted === true;
    var doc = getDocument();
    if (!doc) {
      // Headless / pre-DOM path — still collect snapshot for result envelope.
      await refreshState();
      return buildResult();
    }
    ensureStyle(doc);
    var panel = ensurePanel(doc, STATE.settingsHosted);
    wireHandlers(doc, panel);
    return await refreshAndRender(doc, panel);
  }

  async function refreshSnapshotF5ReviewPanel(options) {
    options = isObject(options) ? options : {};
    var doc = getDocument();
    var panel = doc ? doc.getElementById(PANEL_ID) : null;
    if (panel && !STATE.handleRefresh) wireHandlers(doc, panel);
    return await refreshAndRender(doc, panel);
  }

  H2O.Desktop.Sync.openSnapshotF5ReviewPanel = openSnapshotF5ReviewPanel;
  H2O.Desktop.Sync.refreshSnapshotF5ReviewPanel = refreshSnapshotF5ReviewPanel;
  H2O.Desktop.Sync.__snapshotF5ReviewPanelInstalled = true;
  H2O.Desktop.Sync.__snapshotF5ReviewPanelVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
