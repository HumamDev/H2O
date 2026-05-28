/* H2O Desktop Sync - F10.8.6a convergence readiness diagnostic
 *
 * Desktop/Tauri-only read-only diagnostic over existing sync primitives.
 *
 * Safety invariants:
 *   - Diagnostics only. No convergence, apply, proposal generation,
 *     conflictCandidate generation, WebDAV calls, storage mutation, polling,
 *     network, automatic repair, automatic merge, or mobile write-back.
 *   - Uses only installed API checks plus read-only list/diagnostic calls.
 *   - A false `ok` result is expected when future convergence prerequisites
 *     are still missing; blockers explain what remains.
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
  if (H2O.Desktop.Sync.__convergenceReadinessInstalled) return;

  var SCHEMA = 'h2o.studio.sync.convergence-readiness.v1';
  var VERSION = '0.1.0-f10.8.6a';

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

  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
  }

  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean);
  }

  function getStudioDiagnostics() {
    return H2O.Studio && H2O.Studio.diagnostics ? H2O.Studio.diagnostics : {};
  }

  function getPeerWatermarks() {
    return H2O.Studio && H2O.Studio.sync && H2O.Studio.sync.peerWatermarks
      ? H2O.Studio.sync.peerWatermarks
      : {};
  }

  function addApiBlocker(blockers, ready, code) {
    if (!ready) addCode(blockers, code);
  }

  async function safeRead(fn, unavailableCode, failedCode) {
    if (typeof fn !== 'function') {
      return {
        ok: false,
        value: null,
        blockers: [unavailableCode],
        warnings: []
      };
    }
    try {
      var value = await fn();
      return {
        ok: !!(value && value.ok === true),
        value: safeObject(value),
        blockers: codeList(value && value.blockers),
        warnings: codeList(value && value.warnings)
      };
    } catch (_) {
      return {
        ok: false,
        value: null,
        blockers: [failedCode],
        warnings: []
      };
    }
  }

  function peerIdentityReady(blockers, warnings) {
    var api = H2O.Studio && H2O.Studio.identity;
    if (!api || typeof api.diagnose !== 'function') {
      addCode(blockers, 'peer-identity-unavailable');
      return false;
    }
    try {
      var diagnostic = safeObject(api.diagnose());
      if (diagnostic.status === 'ready') return true;
      addCode(blockers, 'peer-identity-not-ready');
      if (diagnostic.lastWarn) addCode(warnings, 'peer-identity-warning-present');
      return false;
    } catch (_) {
      addCode(blockers, 'peer-identity-diagnostic-failed');
      return false;
    }
  }

  async function watermarkDiagnosticAvailable(warnings) {
    var api = getPeerWatermarks();
    if (!api || typeof api.diagnose !== 'function') return false;
    try {
      var diagnostic = safeObject(await api.diagnose({ includeIds: false }));
      if (diagnostic.supported !== true) {
        addCode(warnings, 'peer-watermark-diagnostics-readonly');
        if (diagnostic.reason) addCode(warnings, cleanString(diagnostic.reason));
      }
      codeList(diagnostic.warnings).forEach(function (code) { addCode(warnings, code); });
      return true;
    } catch (_) {
      addCode(warnings, 'peer-watermark-diagnostic-failed');
      return true;
    }
  }

  function hasApplyLedgerReadApi(sync) {
    return typeof sync.listApplyLog === 'function' ||
      typeof sync.listApplyLedger === 'function' ||
      typeof sync.listFolderApplyAudit === 'function' ||
      typeof sync.listFolderApplyLog === 'function';
  }

  function calculateScore(readiness) {
    var keys = Object.keys(readiness);
    var readyCount = keys.filter(function (key) { return readiness[key] === true; }).length;
    var missingCount = keys.length - readyCount;
    return {
      readyCount: readyCount,
      missingCount: missingCount,
      readinessPercent: keys.length ? Math.round((readyCount / keys.length) * 100) : 0
    };
  }

  async function checkConvergenceReadiness() {
    var sync = H2O.Desktop.Sync;
    var diagnostics = getStudioDiagnostics();
    var blockers = [];
    var warnings = [];
    var readiness = {
      peerIdentityReady: false,
      relayOutboxReady: false,
      relayInboxReady: false,
      relayIndexReady: false,
      applyLedgerReadable: false,
      watermarkAvailable: false,
      lineageTrackingAvailable: false,
      replayProtectionAvailable: false,
      dedupeProtectionAvailable: false,
      conflictWorkflowAvailable: false,
      proposalWorkflowAvailable: false
    };

    readiness.peerIdentityReady = peerIdentityReady(blockers, warnings);

    var outbox = await safeRead(sync.listRelayOutbox, 'relay-outbox-unavailable', 'relay-outbox-read-failed');
    readiness.relayOutboxReady = outbox.ok === true;
    outbox.blockers.forEach(function (code) { addCode(blockers, code); });
    outbox.warnings.forEach(function (code) { addCode(warnings, code); });

    var inbox = await safeRead(sync.listRelayInbox, 'relay-inbox-unavailable', 'relay-inbox-read-failed');
    readiness.relayInboxReady = inbox.ok === true;
    inbox.blockers.forEach(function (code) { addCode(blockers, code); });
    inbox.warnings.forEach(function (code) { addCode(warnings, code); });

    var relayIndex = await safeRead(sync.listRelayIndex, 'relay-index-unavailable', 'relay-index-read-failed');
    readiness.relayIndexReady = relayIndex.ok === true;
    relayIndex.blockers.forEach(function (code) { addCode(blockers, code); });
    relayIndex.warnings.forEach(function (code) { addCode(warnings, code); });

    var indexValue = safeObject(relayIndex.value);
    var indexCounts = safeObject(indexValue.counts);
    var replaySignalsAvailable = relayIndex.ok === true &&
      Array.isArray(indexValue.replays) &&
      Object.prototype.hasOwnProperty.call(indexCounts, 'replayAttempts');
    var dedupeSignalsAvailable = relayIndex.ok === true &&
      Array.isArray(indexValue.duplicates) &&
      Object.prototype.hasOwnProperty.call(indexCounts, 'duplicates');

    readiness.replayProtectionAvailable = replaySignalsAvailable;
    readiness.dedupeProtectionAvailable = dedupeSignalsAvailable;

    var applyEventAvailable = typeof sync.buildFolderApplyEvent === 'function';
    addApiBlocker(blockers, applyEventAvailable, 'apply-event-support-unavailable');

    readiness.proposalWorkflowAvailable =
      typeof diagnostics.previewFolderSyncProposal === 'function';
    readiness.conflictWorkflowAvailable =
      typeof diagnostics.buildFolderConflictReport === 'function';

    readiness.watermarkAvailable = await watermarkDiagnosticAvailable(warnings);

    readiness.lineageTrackingAvailable = readiness.relayIndexReady &&
      applyEventAvailable &&
      readiness.proposalWorkflowAvailable;

    if (hasApplyLedgerReadApi(sync)) {
      readiness.applyLedgerReadable = true;
    } else if (readiness.relayIndexReady && applyEventAvailable) {
      readiness.applyLedgerReadable = true;
      addCode(warnings, 'apply-ledger-visible-through-relay-index-only');
    }

    addApiBlocker(blockers, readiness.relayOutboxReady, 'relay-outbox-not-ready');
    addApiBlocker(blockers, readiness.relayInboxReady, 'relay-inbox-not-ready');
    addApiBlocker(blockers, readiness.relayIndexReady, 'relay-index-not-ready');
    addApiBlocker(blockers, readiness.replayProtectionAvailable, 'replay-protection-unavailable');
    addApiBlocker(blockers, readiness.dedupeProtectionAvailable, 'dedupe-protection-unavailable');
    addApiBlocker(blockers, readiness.watermarkAvailable, 'watermark-diagnostic-unavailable');
    addApiBlocker(blockers, readiness.proposalWorkflowAvailable, 'proposal-workflow-unavailable');
    addApiBlocker(blockers, readiness.conflictWorkflowAvailable, 'conflict-workflow-unavailable');
    addApiBlocker(blockers, readiness.lineageTrackingAvailable, 'lineage-tracking-unavailable');
    addApiBlocker(blockers, readiness.applyLedgerReadable, 'apply-ledger-read-unavailable');

    return {
      schema: SCHEMA,
      ok: blockers.length === 0,
      readiness: readiness,
      blockers: blockers,
      warnings: warnings,
      score: calculateScore(readiness)
    };
  }

  H2O.Desktop.Sync.checkConvergenceReadiness = checkConvergenceReadiness;
  H2O.Desktop.Sync.__convergenceReadinessInstalled = true;
  H2O.Desktop.Sync.__convergenceReadinessVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
