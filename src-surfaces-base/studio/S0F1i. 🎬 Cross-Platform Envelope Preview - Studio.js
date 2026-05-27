// ==UserScript==
// @h2o-id             s0f1i.cross_platform_envelope_preview.studio
// @name               S0F1i. 🎬 Cross-Platform Envelope Preview - Studio
// @namespace          H2O.Premium.CGX.cross_platform_envelope_preview.studio
// @author             H2O / Cockpit Pro
// @version            1.0.0
// @revision           001
// @description        Studio Settings card surface for the F10.3 bundle-envelope preview diagnostic. Read-only display only. Operator-triggered. No write actions, no merge / apply / proposal / sync-now / mobile write-back / chrome.storage write / chrome.runtime broadcast / folder-import call / @h2o/cross-platform-envelope runtime import / background polling / auto-run.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

/* F10.4 — read-only Settings card for the proven F10.3 bridge.
 *
 * Mounts a sibling card inside Settings → Local Sync (immediately after
 * #wbSettingsSyncBox) that exposes the
 * H2O.Studio.diagnostics.previewLatestBundleAsEnvelopes diagnostic.
 *
 * Safety invariants (matches the F10.3 bridge's posture):
 *   - Chrome MV3 only (bails on Tauri detection).
 *   - Read-only display only. No Apply / Merge / Sync Now / Proposal /
 *     mobile-write-back buttons or actions exist in this card.
 *   - The card calls EXACTLY ONE Studio API:
 *       H2O.Studio.diagnostics.previewLatestBundleAsEnvelopes(...)
 *   - No chrome.storage.local writes. No chrome.runtime.sendMessage.
 *     No fetch. No setInterval. No background polling.
 *   - No @h2o/cross-platform-envelope import (consumes the diagnostic via
 *     the global H2O.Studio.diagnostics.* namespace).
 *   - No DOM mutation outside the card's own subtree.
 *   - Raw peer sha256 hashes are hidden by default; an opt-in toggle
 *     reveals them for the current session only (does not persist).
 *   - No content from the bundle is displayed (section counts only).
 *   - Idempotent install marker:
 *       H2O.Studio.diagnostics.__bundleEnvelopePreviewCardInstalled
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* swallow */ }
    return false;
  }
  if (detectTauri()) return;

  function detectChromeExtension() {
    try {
      return !!(global.chrome && global.chrome.runtime && global.chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }
  if (!detectChromeExtension()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.diagnostics = H2O.Studio.diagnostics || {};
  if (H2O.Studio.diagnostics.__bundleEnvelopePreviewCardInstalled) return;

  // ── Style constants (match the existing Local Sync card) ──────────────
  var CARD_STYLE = 'display:flex;flex-direction:column;gap:8px;padding:16px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.02);margin:0 0 28px';
  var BTN_STYLE = 'padding:8px 14px;border-radius:6px;cursor:pointer;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:inherit;font:inherit;text-decoration:none;display:inline-block';
  var GRID_STYLE = 'display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace';
  var MUTED_STYLE = 'opacity:.7;font-size:12px';
  var STATUS_BADGE_STYLE = 'font-weight:600;padding:2px 8px;border-radius:4px;display:inline-block';

  // ── DOM ids (prefixed to avoid collision) ─────────────────────────────
  var ID = {
    card:                'wbCrossPlatformEnvelopePreviewCard',
    statusBadge:         'wbCrossPlatformEnvelopePreviewStatus',
    lastChecked:         'wbCrossPlatformEnvelopePreviewLastChecked',
    bridgeStatus:        'wbCrossPlatformEnvelopePreviewBridgeStatus',
    runBtn:              'wbCrossPlatformEnvelopePreviewRunBtn',
    showRawHashesToggle: 'wbCrossPlatformEnvelopePreviewShowRawHashes',
    fieldEnvelopeKind:   'wbCrossPlatformEnvelopePreviewFieldKind',
    fieldOk:             'wbCrossPlatformEnvelopePreviewFieldOk',
    fieldBundleBytes:    'wbCrossPlatformEnvelopePreviewFieldBundleBytes',
    fieldBundleSchema:   'wbCrossPlatformEnvelopePreviewFieldBundleSchema',
    blockersCount:       'wbCrossPlatformEnvelopePreviewBlockersCount',
    blockersList:        'wbCrossPlatformEnvelopePreviewBlockersList',
    warningsCount:       'wbCrossPlatformEnvelopePreviewWarningsCount',
    warningsList:        'wbCrossPlatformEnvelopePreviewWarningsList',
    peerPhysical:        'wbCrossPlatformEnvelopePreviewPeerPhysical',
    peerInstall:         'wbCrossPlatformEnvelopePreviewPeerInstall',
    peerSync:            'wbCrossPlatformEnvelopePreviewPeerSync',
    sectionChats:        'wbCrossPlatformEnvelopePreviewSectionChats',
    sectionSnapshots:    'wbCrossPlatformEnvelopePreviewSectionSnapshots',
    sectionFolders:      'wbCrossPlatformEnvelopePreviewSectionFolders',
    sectionLabels:       'wbCrossPlatformEnvelopePreviewSectionLabels',
    sectionTags:         'wbCrossPlatformEnvelopePreviewSectionTags',
    sectionCategories:   'wbCrossPlatformEnvelopePreviewSectionCategories',
  };

  // ── Readable labels for known blocker / warning codes ─────────────────
  var CODE_LABELS = {
    // F10.2.0 BLOCKER_CODES (18 codes)
    'platform-not-authorized-for-kind': 'Platform not authorized to produce this envelope kind.',
    'capability-not-on-platform-allowlist': 'Capability not on platform allowlist.',
    'surface-authority-mismatch': 'Surface kind does not match the declared authority level.',
    'mobile-payload-outside-allowlist': 'Mobile payload contains fields outside the cacheMetadata allowlist.',
    'mobile-must-redact': 'Mobile envelopes must be redacted or metadata-only.',
    'native-extension-entity-outside-evidence-scope': 'Native extension subjectType outside the evidence scope.',
    'native-extension-not-authorized-for-tombstones': 'Native extension may not emit tombstone-related envelopes.',
    'envelope-schema-too-new': 'Envelope schema mismatch (Desktop bundle may pre-date F10.3d).',
    'envelope-schema-too-old': 'Envelope schema is older than this consumer recognizes.',
    'envelope-schema-hash-unknown': 'Envelope schemaHash does not match any known revision.',
    'capability-snapshot-unknown': 'Capability snapshot hash is not in the known set.',
    'operation-intent-wrong-for-kind': 'operationIntent is forbidden or missing for this kind.',
    'delete-intent-on-read-only-kind': 'delete operationIntent on a read-only kind.',
    'delete-proposal-missing-f5-predicate': 'Delete proposal is missing the F5 predicate version or justifying evidence.',
    'delete-apply-event-missing-audit-id': 'Delete applyEvent is missing the audit maintenance id.',
    'local-only-audit-detail-on-mobile-or-cache': 'Local-only audit detail appeared in a mobile/cache envelope.',
    'payload-contains-forever-no-field': 'Payload contains a forever-no field name (content / body / text / etc.).',
    'stale-evidence-not-revalidated': 'Stale evidence (past expiresAt) used as input.',
    // Bridge-emitted warnings
    'web-crypto-unavailable': 'Web Crypto (crypto.subtle.digest) is unavailable in this context.',
    'no-sync-folder-handle': 'Sync folder not connected. Use the Local Sync card above to connect one first.',
    'sync-folder-permission-not-granted': 'Permission to read the sync folder is not granted. Re-grant via the Local Sync card above.',
    'sync-folder-permission-check-failed': 'Could not query sync-folder permission. Proceeding cautiously.',
    'no-latest-json-in-folder': 'latest.json not found in the sync folder. Run a Desktop export first.',
    'file-handle-read-failed': 'Failed to open latest.json from the connected sync folder.',
    'bundle-exceeds-byte-cap': 'Bundle exceeds the 16 MiB default cap. Pass { maxBytes } via DevTools to extend up to the 64 MiB hard cap.',
    'latest-json-decode-failed': 'Failed to decode latest.json (UTF-8 decode error).',
    'latest-json-not-json': 'latest.json is not valid JSON.',
    'latest-json-not-object': 'latest.json top-level value is not a plain object.',
    'source-sync-peer-id-missing-from-bundle': 'Bundle does not carry bundle.sourceSyncPeerId.',
    'source-peer-physical-device-id-absent-from-bundle': 'Bundle does not carry F2 physicalDeviceIdHash (pre-F10.3d Desktop bundle).',
    'source-peer-install-id-absent-from-bundle': 'Bundle does not carry F2 installIdHash (pre-F10.3d Desktop bundle).',
    'source-peer-sync-peer-id-not-sha256': 'Computed syncPeerIdHash is not a valid sha256 hex string.',
  };

  function labelFor(code) {
    if (typeof code !== 'string') return '(non-string code)';
    if (Object.prototype.hasOwnProperty.call(CODE_LABELS, code)) return CODE_LABELS[code];
    return '(unknown code)';
  }

  // ── Card-local state ──────────────────────────────────────────────────
  var state = {
    mounted: false,
    lastResult: null,
    lastError: null,
    lastCheckedAt: null,
    inFlight: false,
    showRawHashes: false,
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtBytes(n) {
    if (typeof n !== 'number' || !isFinite(n) || n < 0) return '—';
    if (n < 1024) return String(n) + ' B';
    var kib = n / 1024;
    if (kib < 1024) return kib.toFixed(1) + ' KiB';
    var mib = kib / 1024;
    return mib.toFixed(2) + ' MiB';
  }

  function fmtIso(d) {
    if (!d) return 'Never';
    try {
      return new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z');
    } catch (_) {
      return 'Never';
    }
  }

  // ── HTML template ─────────────────────────────────────────────────────
  function buildCardHtml() {
    return ''
      + '<div id="' + ID.card + '" class="wbSettingsCard" style="' + CARD_STYLE + '">'
      +   '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">'
      +     '<div>'
      +       '<div style="font-weight:600">Bundle Envelope Preview</div>'
      +       '<div style="' + MUTED_STYLE + '">F10.3 cross-platform envelope diagnostic — preview / read-only.</div>'
      +     '</div>'
      +     '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
      +       '<span id="' + ID.statusBadge + '" style="' + STATUS_BADGE_STYLE + ';background:rgba(255,255,255,.06)">— Not yet checked</span>'
      +       '<button id="' + ID.runBtn + '" type="button" style="' + BTN_STYLE + '">Run preview check</button>'
      +     '</div>'
      +   '</div>'
      +   '<div style="' + MUTED_STYLE + '">'
      +     'Last checked: <span id="' + ID.lastChecked + '">Never</span>'
      +     ' &middot; Bridge: <span id="' + ID.bridgeStatus + '">checking…</span>'
      +   '</div>'
      +   '<div style="' + GRID_STYLE + ';margin-top:8px">'
      +     '<span>Envelope kind</span><span id="' + ID.fieldEnvelopeKind + '">—</span>'
      +     '<span>ok</span><span id="' + ID.fieldOk + '">—</span>'
      +     '<span>bundleBytes</span><span id="' + ID.fieldBundleBytes + '">—</span>'
      +     '<span>bundleSchema</span><span id="' + ID.fieldBundleSchema + '">—</span>'
      +     '<span>blockers</span><span><span id="' + ID.blockersCount + '">—</span><div id="' + ID.blockersList + '" style="margin-top:4px;font-family:inherit;font-size:12px;opacity:.85"></div></span>'
      +     '<span>warnings</span><span><span id="' + ID.warningsCount + '">—</span><div id="' + ID.warningsList + '" style="margin-top:4px;font-family:inherit;font-size:12px;opacity:.85"></div></span>'
      +     '<span>physicalDeviceIdHash</span><span id="' + ID.peerPhysical + '">—</span>'
      +     '<span>installIdHash</span><span id="' + ID.peerInstall + '">—</span>'
      +     '<span>syncPeerIdHash</span><span id="' + ID.peerSync + '">—</span>'
      +     '<span>chats</span><span id="' + ID.sectionChats + '">—</span>'
      +     '<span>snapshots</span><span id="' + ID.sectionSnapshots + '">—</span>'
      +     '<span>folders</span><span id="' + ID.sectionFolders + '">—</span>'
      +     '<span>labels</span><span id="' + ID.sectionLabels + '">—</span>'
      +     '<span>tags</span><span id="' + ID.sectionTags + '">—</span>'
      +     '<span>categories</span><span id="' + ID.sectionCategories + '">—</span>'
      +   '</div>'
      +   '<label style="display:inline-flex;align-items:center;gap:6px;' + MUTED_STYLE + ';margin-top:8px;cursor:pointer">'
      +     '<input type="checkbox" id="' + ID.showRawHashesToggle + '" />'
      +     '<span>Show raw peer hashes (session only; not persisted)</span>'
      +   '</label>'
      + '</div>';
  }

  // ── Result rendering ──────────────────────────────────────────────────
  function setStatusBadge(text, color) {
    var el = document.getElementById(ID.statusBadge);
    if (!el) return;
    el.textContent = text;
    el.style.background = color || 'rgba(255,255,255,.06)';
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value == null ? '—' : String(value);
  }

  function renderCodesList(targetId, codes) {
    var el = document.getElementById(targetId);
    if (!el) return;
    if (!Array.isArray(codes) || codes.length === 0) {
      el.innerHTML = '';
      return;
    }
    var html = '';
    for (var i = 0; i < codes.length; i++) {
      var code = codes[i];
      html += '<div>&middot; <code style="opacity:.85">' + escapeHtml(code) + '</code> — '
            + escapeHtml(labelFor(code)) + '</div>';
    }
    el.innerHTML = html;
  }

  function renderPeerHashRow(targetId, value) {
    var el = document.getElementById(targetId);
    if (!el) return;
    if (typeof value !== 'string' || value.length === 0) {
      el.textContent = '—';
      return;
    }
    var isHex = /^[0-9a-f]{64}$/.test(value);
    if (!isHex) {
      el.textContent = '(absent)';
      el.style.opacity = '.6';
      return;
    }
    el.style.opacity = '1';
    if (state.showRawHashes) {
      el.innerHTML = '<code style="font-size:11px">' + escapeHtml(value) + '</code>';
    } else {
      el.textContent = '✓ present';
    }
  }

  function renderResult(result) {
    setText(ID.lastChecked, fmtIso(state.lastCheckedAt));
    if (!result || typeof result !== 'object') {
      setStatusBadge('❌ Error', 'rgba(255,80,80,.18)');
      return;
    }
    var blockers = (result.findings && Array.isArray(result.findings.blockers)) ? result.findings.blockers : [];
    var warnings = (result.findings && Array.isArray(result.findings.warnings)) ? result.findings.warnings : [];

    // Status badge.
    if (blockers.length > 0) {
      setStatusBadge('❌ blocked', 'rgba(255,80,80,.18)');
    } else if (result.ok && warnings.length === 0) {
      setStatusBadge('✅ ok', 'rgba(60,200,120,.18)');
    } else if (result.ok && warnings.length > 0) {
      setStatusBadge('⚠️ ok with warnings', 'rgba(240,180,60,.18)');
    } else {
      setStatusBadge('❌ not ok', 'rgba(255,80,80,.18)');
    }

    // Field values.
    var env = result.envelope || null;
    setText(ID.fieldEnvelopeKind, env && env.kind ? env.kind : '—');
    setText(ID.fieldOk, String(!!result.ok));
    var bytes = typeof result.bundleBytes === 'number' ? result.bundleBytes : 0;
    setText(ID.fieldBundleBytes, bytes ? (String(bytes) + '  (' + fmtBytes(bytes) + ')') : '—');
    setText(ID.fieldBundleSchema, result.bundleSchema || '—');

    // Findings.
    setText(ID.blockersCount, String(blockers.length));
    renderCodesList(ID.blockersList, blockers);
    setText(ID.warningsCount, String(warnings.length));
    renderCodesList(ID.warningsList, warnings);

    // Peer hash rows.
    var peer = env && env.sourcePlatform && env.sourcePlatform.sourcePeerEnvelope
      ? env.sourcePlatform.sourcePeerEnvelope
      : null;
    renderPeerHashRow(ID.peerPhysical, peer ? peer.physicalDeviceIdHash : '');
    renderPeerHashRow(ID.peerInstall, peer ? peer.installIdHash : '');
    renderPeerHashRow(ID.peerSync, peer ? peer.syncPeerIdHash : '');

    // Section counts.
    var sc = result.sectionCounts || {};
    setText(ID.sectionChats, typeof sc.chats === 'number' ? String(sc.chats) : '—');
    setText(ID.sectionSnapshots, typeof sc.snapshots === 'number' ? String(sc.snapshots) : '—');
    setText(ID.sectionFolders, typeof sc.folders === 'number' ? String(sc.folders) : '—');
    setText(ID.sectionLabels, typeof sc.labels === 'number' ? String(sc.labels) : '—');
    setText(ID.sectionTags, typeof sc.tags === 'number' ? String(sc.tags) : '—');
    setText(ID.sectionCategories, typeof sc.categories === 'number' ? String(sc.categories) : '—');
  }

  function renderError(err) {
    setText(ID.lastChecked, fmtIso(state.lastCheckedAt));
    setStatusBadge('❌ Error', 'rgba(255,80,80,.18)');
    var msg = (err && err.message ? String(err.message) : 'unknown error').slice(0, 200);
    var el = document.getElementById(ID.blockersList);
    if (el) el.innerHTML = '<div>&middot; <code>diagnostic-threw</code> — ' + escapeHtml(msg) + '</div>';
    setText(ID.blockersCount, '1');
  }

  function refreshBridgeStatus() {
    var el = document.getElementById(ID.bridgeStatus);
    if (!el) return;
    if (typeof H2O.Studio.diagnostics.previewLatestBundleAsEnvelopes === 'function') {
      el.textContent = 'Loaded';
    } else {
      el.textContent = 'Not loaded';
    }
  }

  function setRunButtonState(enabled, label) {
    var btn = document.getElementById(ID.runBtn);
    if (!btn) return;
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? '1' : '.6';
    btn.style.cursor = enabled ? 'pointer' : 'wait';
    btn.textContent = label;
  }

  async function runPreview() {
    if (state.inFlight) return;
    state.inFlight = true;
    setRunButtonState(false, 'Running…');
    if (typeof H2O.Studio.diagnostics.previewLatestBundleAsEnvelopes !== 'function') {
      state.lastError = new Error('F10.3 bridge not loaded. Rebuild the extension and reload.');
      state.lastResult = null;
      state.lastCheckedAt = Date.now();
      renderError(state.lastError);
      refreshBridgeStatus();
      state.inFlight = false;
      setRunButtonState(true, 'Run preview check');
      return;
    }
    try {
      var r = await H2O.Studio.diagnostics.previewLatestBundleAsEnvelopes();
      state.lastResult = r;
      state.lastError = null;
      state.lastCheckedAt = Date.now();
      renderResult(r);
    } catch (e) {
      state.lastResult = null;
      state.lastError = e;
      state.lastCheckedAt = Date.now();
      renderError(e);
    } finally {
      refreshBridgeStatus();
      state.inFlight = false;
      setRunButtonState(true, 'Run preview check');
    }
  }

  function wireCardEvents() {
    var btn = document.getElementById(ID.runBtn);
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        runPreview();
      });
    }
    var toggle = document.getElementById(ID.showRawHashesToggle);
    if (toggle) {
      toggle.addEventListener('change', function () {
        state.showRawHashes = !!toggle.checked;
        // Re-render only the peer rows from the cached last result.
        if (state.lastResult) {
          var env = state.lastResult.envelope || null;
          var peer = env && env.sourcePlatform && env.sourcePlatform.sourcePeerEnvelope
            ? env.sourcePlatform.sourcePeerEnvelope
            : null;
          renderPeerHashRow(ID.peerPhysical, peer ? peer.physicalDeviceIdHash : '');
          renderPeerHashRow(ID.peerInstall, peer ? peer.installIdHash : '');
          renderPeerHashRow(ID.peerSync, peer ? peer.syncPeerIdHash : '');
        }
      });
    }
  }

  // ── Mount ─────────────────────────────────────────────────────────────
  function tryMount() {
    if (document.getElementById(ID.card)) {
      // Already mounted.
      refreshBridgeStatus();
      return true;
    }
    var anchor = document.querySelector('#wbSettingsSyncBox');
    if (!anchor) return false;
    anchor.insertAdjacentHTML('afterend', buildCardHtml());
    wireCardEvents();
    refreshBridgeStatus();
    setText(ID.lastChecked, fmtIso(state.lastCheckedAt));
    state.mounted = true;
    // Replay cached result if present (e.g. after Settings rebuild).
    if (state.lastResult) {
      renderResult(state.lastResult);
    } else if (state.lastError) {
      renderError(state.lastError);
    }
    return true;
  }

  // Watch document.body for Settings overlay (re)mounts and inject the
  // card whenever #wbSettingsSyncBox appears without our card sibling.
  // No setInterval; observer-driven.
  function installObserver() {
    if (typeof global.MutationObserver !== 'function') return;
    var obs = new global.MutationObserver(function () {
      tryMount();
    });
    try {
      obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch (_) { /* swallow */ }
  }

  function bootstrap() {
    tryMount();
    installObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }

  H2O.Studio.diagnostics.__bundleEnvelopePreviewCardInstalled = true;

})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
