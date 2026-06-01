/* H2O Desktop Sync - F14.6.16 execute lane UI
 *
 * Read-only operator visibility panel for the Execute Lane.
 *
 * Safety invariants:
 *   - No dispatch, Native invoke, F5 close/decision, relay enqueue, settlement,
 *     watermark, consumed-operation, publication, or journal writes.
 *   - Render and refresh only read existing ledgers and read-only listing APIs.
 *   - The display is privacy-safe: opaque identifiers are shortened and raw
 *     domain identifiers or payload fields are never rendered.
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
  if (H2O.Desktop.Sync.__executeLaneUiInstalled) return;

  var VERSION = '0.1.0-f14.6.16';
  var PANEL_ID = 'h2o-execute-lane-panel';
  var STYLE_ID = 'h2o-execute-lane-style';
  var RESULT_SCHEMA = 'h2o.desktop.sync.execute-lane-ui-result.v1';
  var JOURNAL_KEY = 'h2o:sync:execute-journal:v1';
  var PUBLICATION_KEY = 'h2o:sync:execute-publication-lifecycle:v1';
  var REQUIRED_SECTIONS = [
    'journal',
    'in-flight',
    'publication',
    'relay',
    'native',
    'f5',
    'settlement',
    'adapters',
    'chat-readiness',
    'capture-readiness',
    'snapshot-readiness',
    'proof'
  ];
  var TERMINAL_PHASES = ['preflight-blocked', 'settled', 'bookkept', 'failed'];
  var SETTLEMENT_PHASES = [
    'settling-consumed',
    'settling-watermark',
    'settling-bookkeeping',
    'settling-publication-terminal',
    'settled',
    'bookkept'
  ];
  var FORBIDDEN_BUTTON_WORDS = [
    'dispatch',
    'native action',
    'f5 action',
    'relay action',
    'settle',
    'settlement action',
    'publish',
    'apply',
    'mutate',
    'execute now'
  ];
  var RAW_LEAK_PATTERNS = [
    /\bchatId\b/i,
    /\bsnapshotId\b/i,
    /\baccountId\b/i,
    /\bsource\s*pointer\b/i,
    /\bmodel\s*slug\b/i,
    /\braw\s+content\b/i,
    /\bcontent\s*:/i
  ];
  var state = {
    snapshot: null,
    lastProof: null,
    busy: false,
    proofBusy: false,
    lastError: ''
  };

  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function cleanLower(value) { return cleanString(value).toLowerCase(); }
  function nowIsoSeconds() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function boolText(value) { return value === true ? 'yes' : 'no'; }
  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
  }
  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean).filter(function (code, index, arr) { return arr.indexOf(code) === index; });
  }
  function escapeHtml(value) {
    return cleanString(value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }
  function shortHash(value) {
    var text = cleanString(value);
    if (!text) return '';
    if (text.length <= 12) return text;
    return text.slice(0, 8) + '...' + text.slice(-4);
  }
  function sideEffectSummary() {
    return {
      executeJournalTouched: false,
      journalTouched: false,
      publicationLedgerTouched: false,
      relayOutboxTouched: false,
      relayDispatched: false,
      nativeCalled: false,
      f5Touched: false,
      consumedOperationWritten: false,
      watermarkWritten: false,
      bookkeepingWritten: false,
      settlementWritten: false,
      storageWritten: false,
      domainMutated: false
    };
  }
  function buildResult(opts) {
    opts = safeObject(opts);
    var blockers = codeList(opts.blockers);
    var warnings = codeList(opts.warnings);
    var ok = typeof opts.ok === 'boolean' ? opts.ok : blockers.length === 0;
    var payload = {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: ok,
      actionable: ok,
      panelOpened: opts.panelOpened === true,
      panelRefreshed: opts.panelRefreshed === true,
      routeRendered: opts.routeRendered === true,
      sectionsVisible: opts.sectionsVisible || {},
      controls: opts.controls || [],
      rawLeakCheck: opts.rawLeakCheck || { hasLeak: false, matches: [] },
      sideEffectSummary: sideEffectSummary(),
      blockers: blockers,
      warnings: warnings,
      metadata: opts.metadata || {}
    };
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.createResult === 'function') {
      try {
        var shaped = kernel.createResult({
          schema: RESULT_SCHEMA,
          ok: payload.ok,
          actionable: payload.ok,
          blockers: payload.blockers,
          warnings: payload.warnings,
          metadata: { domain: 'execute', version: VERSION }
        });
        if (shaped && typeof shaped === 'object') {
          payload.ok = shaped.ok === true;
          payload.actionable = shaped.actionable !== false;
          payload.blockers = codeList(shaped.blockers);
          payload.warnings = codeList(shaped.warnings);
        }
      } catch (_) { /* keep local result */ }
    }
    return payload;
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
      if (!s) { resolve(null); return; }
      try {
        s.get([key], function (items) {
          var lastError = global.chrome && global.chrome.runtime && global.chrome.runtime.lastError;
          if (lastError) { reject(new Error(String(lastError.message || lastError))); return; }
          resolve(items && Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null);
        });
      } catch (e) { reject(e); }
    });
  }
  function uniqueRows(rows, keyFn) {
    var seen = {};
    return asArray(rows).filter(function (row) {
      var key = keyFn(row);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }
  function rowsFromLedger(raw) {
    var ledger = safeObject(raw);
    var rows = [];
    asArray(ledger.rows).forEach(function (row) { if (isObject(row)) rows.push(row); });
    asArray(ledger.events).forEach(function (event) {
      if (isObject(event.row)) rows.push(event.row);
      else if (isObject(event.journalRow)) rows.push(event.journalRow);
      else if (isObject(event.publicationRow)) rows.push(event.publicationRow);
      else if (isObject(event)) rows.push(event);
    });
    return uniqueRows(rows, function (row) {
      return cleanString(row.journalRowId || row.publicationId || row.eventDigest || row.eventId);
    });
  }
  function countBy(rows, field) {
    var counts = {};
    asArray(rows).forEach(function (row) {
      var key = cleanString(safeObject(row)[field]) || 'unknown';
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }
  function sumCounts(counts) {
    return Object.keys(safeObject(counts)).reduce(function (total, key) {
      return total + Number(safeObject(counts)[key] || 0);
    }, 0);
  }
  function summarizeJournalRows(rows) {
    var phaseCounts = countBy(rows, 'phase');
    var targetCounts = countBy(rows, 'dispatchTarget');
    var inFlight = asArray(rows).filter(function (row) {
      var phase = cleanString(row.phase);
      return phase && TERMINAL_PHASES.indexOf(phase) === -1;
    });
    return {
      total: rows.length,
      phaseCounts: phaseCounts,
      targetCounts: targetCounts,
      inFlightCount: inFlight.length,
      latestRows: asArray(rows).slice(-8).reverse().map(redactJournalRow)
    };
  }
  function redactJournalRow(row) {
    var r = safeObject(row);
    return {
      journalRowId: shortHash(r.journalRowId),
      envelopeKind: cleanString(r.envelopeKind),
      domainId: cleanString(r.domainId),
      operationKind: cleanString(r.operationKind),
      subjectId: shortHash(r.subjectId),
      lineageId: shortHash(r.lineageId),
      dedupeKey: shortHash(r.dedupeKey),
      eventDigest: shortHash(r.eventDigest),
      phase: cleanString(r.phase),
      attempt: cleanString(r.attempt || 0),
      dispatchTarget: cleanString(r.dispatchTarget || 'none'),
      createdAtIso: cleanString(r.createdAtIso)
    };
  }
  function redactPublicationRow(row) {
    var r = safeObject(row);
    return {
      publicationId: shortHash(r.publicationId),
      status: cleanString(r.status),
      domainId: cleanString(r.domainId),
      operationKind: cleanString(r.operationKind),
      dedupeKey: shortHash(r.dedupeKey),
      eventDigest: shortHash(r.eventDigest),
      createdAtIso: cleanString(r.createdAtIso)
    };
  }
  function summarizePublicationRows(rows) {
    return {
      total: rows.length,
      statusCounts: countBy(rows, 'status'),
      latestRows: asArray(rows).slice(-8).reverse().map(redactPublicationRow)
    };
  }
  function summarizeRelay(journalRows) {
    var relayRows = asArray(journalRows).filter(function (row) {
      return cleanString(row.dispatchTarget) === 'relay' ||
        safeObject(row.dispatchProfile).requiresRelay === true;
    });
    return {
      available: relayRows.length > 0 || typeof H2O.Desktop.Sync.dispatchExecuteRelay === 'function',
      rows: relayRows.length,
      phaseCounts: countBy(relayRows, 'phase'),
      pending: relayRows.filter(function (row) { return cleanString(row.phase) === 'dispatching'; }).length,
      uploaded: relayRows.filter(function (row) { return cleanString(row.phase) === 'confirmed'; }).length
    };
  }
  function summarizeNative(journalRows) {
    var nativeRows = asArray(journalRows).filter(function (row) {
      return cleanString(row.dispatchTarget) === 'native' ||
        safeObject(row.dispatchProfile).requiresNative === true;
    });
    return {
      available: nativeRows.length > 0 || typeof H2O.Desktop.Sync.dispatchExecuteNative === 'function',
      rows: nativeRows.length,
      phaseCounts: countBy(nativeRows, 'phase'),
      dispatching: nativeRows.filter(function (row) { return cleanString(row.phase) === 'dispatching'; }).length,
      confirmed: nativeRows.filter(function (row) { return cleanString(row.phase) === 'confirmed'; }).length
    };
  }
  async function summarizeF5() {
    var states = ['pending', 'approved-seal', 'approved-restore', 'auto-expired', 'closed-sealed', 'closed-restored'];
    var counts = {};
    var available = typeof H2O.Desktop.Sync.listF5ReviewsByState === 'function';
    if (!available) {
      return { available: false, stateCounts: counts, pending: 0, postDecision: 0, closed: 0, warnings: ['f5-review-list-unavailable'] };
    }
    var warnings = [];
    for (var i = 0; i < states.length; i += 1) {
      var stateName = states[i];
      try {
        var result = await H2O.Desktop.Sync.listF5ReviewsByState(stateName);
        counts[stateName] = asArray(safeObject(result).rows).length;
      } catch (_) {
        counts[stateName] = 0;
        addCode(warnings, 'f5-review-list-failed-' + stateName);
      }
    }
    return {
      available: true,
      stateCounts: counts,
      pending: counts.pending || 0,
      postDecision: (counts['approved-seal'] || 0) + (counts['approved-restore'] || 0) + (counts['auto-expired'] || 0),
      closed: (counts['closed-sealed'] || 0) + (counts['closed-restored'] || 0),
      warnings: warnings
    };
  }
  function summarizeSettlement(journalRows) {
    var counts = countBy(journalRows, 'phase');
    var settlementCounts = {};
    SETTLEMENT_PHASES.forEach(function (phase) { settlementCounts[phase] = counts[phase] || 0; });
    return {
      phaseCounts: settlementCounts,
      active: (counts['settling-consumed'] || 0) +
        (counts['settling-watermark'] || 0) +
        (counts['settling-bookkeeping'] || 0) +
        (counts['settling-publication-terminal'] || 0),
      complete: (counts.settled || 0) + (counts.bookkept || 0)
    };
  }
  function summarizeAdapters() {
    var rows = [];
    var registryAvailable = typeof H2O.Desktop.Sync.listExecuteAdapters === 'function';
    if (registryAvailable) {
      try {
        var listed = H2O.Desktop.Sync.listExecuteAdapters();
        rows = asArray(isObject(listed) ? listed.adapters || listed.rows : listed).map(function (adapter) {
          var a = safeObject(adapter);
          return {
            domainId: cleanString(a.domainId),
            flavor: cleanString(a.flavor || a.envelopeKind || a.adapterFlavor),
            operations: asArray(a.supportedOperations || a.operations).map(cleanString).filter(Boolean).slice(0, 6)
          };
        });
      } catch (_) { rows = []; }
    }
    return {
      registryAvailable: registryAvailable,
      total: rows.length,
      rows: rows,
      domains: countBy(rows, 'domainId')
    };
  }
  function readiness(domain, checks) {
    var missing = [];
    Object.keys(checks).forEach(function (name) {
      if (checks[name] !== true) missing.push(name);
    });
    return {
      domain: domain,
      ready: missing.length === 0,
      missing: missing,
      checks: checks
    };
  }
  function summarizeReadiness() {
    var sync = H2O.Desktop.Sync;
    return {
      chat: readiness('chat', {
        installed: sync.__chatExecuteAdapterInstalled === true,
        register: typeof sync.registerChatExecuteAdapter === 'function',
        buildEnvelope: typeof sync.buildChatExecuteEnvelope === 'function',
        proof: typeof sync.runChatExecuteAdapterProof === 'function'
      }),
      capture: readiness('capture', {
        installed: sync.__captureExecuteAdapterInstalled === true,
        materializationInstalled: sync.__captureMaterializationInstalled === true,
        register: typeof sync.registerCaptureExecuteAdapter === 'function',
        buildEnvelope: typeof sync.buildCaptureExecuteEnvelope === 'function',
        proof: typeof sync.runCaptureExecuteAdapterProof === 'function'
      }),
      snapshot: readiness('snapshot', {
        readinessInstalled: sync.__snapshotExecuteReadinessInstalled === true,
        archiveRestoreInstalled: sync.__snapshotExecuteAdapterInstalled === true,
        tombstoneInstalled: sync.__snapshotTombstoneExecuteAdapterInstalled === true,
        buildArchiveRestore: typeof sync.buildSnapshotExecuteEnvelope === 'function',
        buildTombstone: typeof sync.buildSnapshotTombstoneExecuteEnvelope === 'function'
      })
    };
  }
  async function collectSnapshot() {
    var warnings = [];
    var journalRows = [];
    var publicationRows = [];
    try { journalRows = rowsFromLedger(await storageGet(JOURNAL_KEY)); }
    catch (_) { addCode(warnings, 'execute-journal-read-failed'); }
    if (typeof H2O.Desktop.Sync.listExecuteJournalRowsInFlight === 'function') {
      try {
        var inFlightResult = await H2O.Desktop.Sync.listExecuteJournalRowsInFlight();
        var inFlightRows = asArray(safeObject(inFlightResult).rows);
        journalRows = uniqueRows(journalRows.concat(inFlightRows), function (row) {
          return cleanString(row.journalRowId || row.eventDigest);
        });
      } catch (_) { addCode(warnings, 'execute-journal-in-flight-read-failed'); }
    }
    try { publicationRows = rowsFromLedger(await storageGet(PUBLICATION_KEY)); }
    catch (_) { addCode(warnings, 'execute-publication-read-failed'); }
    var f5 = await summarizeF5();
    codeList(f5.warnings).forEach(function (code) { addCode(warnings, code); });
    return {
      collectedAtIso: nowIsoSeconds(),
      warnings: warnings,
      journal: summarizeJournalRows(journalRows),
      inFlight: asArray(journalRows).filter(function (row) {
        return TERMINAL_PHASES.indexOf(cleanString(row.phase)) === -1;
      }).map(redactJournalRow).slice(0, 12),
      publication: summarizePublicationRows(publicationRows),
      relay: summarizeRelay(journalRows),
      native: summarizeNative(journalRows),
      f5: f5,
      settlement: summarizeSettlement(journalRows),
      adapters: summarizeAdapters(),
      readiness: summarizeReadiness(),
      sideEffectSummary: sideEffectSummary()
    };
  }
  function ensureStyle() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#' + PANEL_ID + '{position:fixed;right:22px;top:76px;width:min(980px,calc(100vw - 44px));max-height:calc(100vh - 110px);overflow:auto;background:#101418;color:#eef3f8;border:1px solid rgba(255,255,255,.14);box-shadow:0 18px 50px rgba(0,0,0,.34);border-radius:10px;z-index:9999;font:13px/1.45 system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;}',
      '#' + PANEL_ID + '[data-settings-hosted=\"true\"]{position:relative;right:auto;top:auto;width:100%;max-height:none;z-index:auto;box-shadow:none;border-radius:8px;background:#101418;}',
      '#' + PANEL_ID + ' *{box-sizing:border-box;}',
      '.h2oExecHead{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.12);}',
      '.h2oExecTitle{margin:0;font-size:18px;font-weight:700;letter-spacing:0;color:#f5f7fa;}',
      '.h2oExecSub{margin:4px 0 0;color:#aeb8c5;font-size:12px;}',
      '.h2oExecTools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;}',
      '.h2oExecBtn{appearance:none;border:1px solid rgba(255,255,255,.18);background:#1b2430;color:#f5f7fa;border-radius:7px;padding:7px 10px;font:600 12px/1 system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;cursor:pointer;white-space:nowrap;}',
      '.h2oExecBtn:hover{background:#253244;}',
      '#' + PANEL_ID + '[data-settings-hosted=\"true\"] .h2oExecClose{display:none;}',
      '.h2oExecBody{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:14px;}',
      '.h2oExecSection{border:1px solid rgba(255,255,255,.1);border-radius:8px;background:#151b22;padding:12px;min-width:0;}',
      '.h2oExecSectionWide{grid-column:1/-1;}',
      '.h2oExecSection h3{margin:0 0 9px;font-size:13px;font-weight:700;color:#eef3f8;}',
      '.h2oExecMetrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px;}',
      '.h2oExecMetric{border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:8px;background:#10161d;min-width:0;}',
      '.h2oExecMetric span{display:block;color:#91a0b1;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.h2oExecMetric strong{display:block;margin-top:3px;font-size:17px;color:#f5f7fa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.h2oExecTable{width:100%;border-collapse:collapse;table-layout:fixed;}',
      '.h2oExecTable th,.h2oExecTable td{border-top:1px solid rgba(255,255,255,.08);padding:6px 5px;text-align:left;vertical-align:top;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.h2oExecTable th{color:#9ba9b8;font-size:11px;font-weight:700;}',
      '.h2oExecTable td{color:#e6edf3;font-size:12px;}',
      '.h2oExecNote{margin:8px 0 0;color:#aeb8c5;font-size:12px;}',
      '.h2oExecOk{color:#9fe6b1;}',
      '.h2oExecWarn{color:#ffd18a;}',
      '@media (max-width:760px){.h2oExecBody{grid-template-columns:1fr}.h2oExecMetrics{grid-template-columns:repeat(2,minmax(0,1fr))}.h2oExecHead{flex-direction:column}.h2oExecTools{justify-content:flex-start}}'
    ].join('\n');
    document.head.appendChild(style);
  }
  function metric(label, value) {
    return '<div class="h2oExecMetric"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
  }
  function countsText(counts) {
    var keys = Object.keys(safeObject(counts)).sort();
    if (!keys.length) return 'none';
    return keys.map(function (key) { return key + ':' + safeObject(counts)[key]; }).join(' ');
  }
  function rowsTable(rows, columns) {
    rows = asArray(rows);
    columns = asArray(columns);
    if (!rows.length) return '<p class="h2oExecNote">No rows found.</p>';
    return '<table class="h2oExecTable"><thead><tr>' +
      columns.map(function (c) { return '<th>' + escapeHtml(c.label) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      rows.map(function (row) {
        return '<tr>' + columns.map(function (c) {
          return '<td title="' + escapeHtml(row[c.key]) + '">' + escapeHtml(row[c.key]) + '</td>';
        }).join('') + '</tr>';
      }).join('') +
      '</tbody></table>';
  }
  function renderReadiness(item) {
    item = safeObject(item);
    var cls = item.ready ? 'h2oExecOk' : 'h2oExecWarn';
    return metric(item.domain || 'domain', item.ready ? 'ready' : 'blocked') +
      '<p class="h2oExecNote ' + cls + '">' +
      escapeHtml(item.ready ? 'all read-only adapter APIs are present' : 'missing ' + asArray(item.missing).join(', ')) +
      '</p>';
  }
  function renderPanelHtml(snapshot) {
    var s = safeObject(snapshot);
    var proof = state.lastProof;
    var proofOk = proof && proof.ok === true;
    return '<div class="h2oExecHead">' +
      '<div><h2 class="h2oExecTitle">Execute Lane</h2>' +
      '<p class="h2oExecSub">Read-only operator visibility. Last refresh ' + escapeHtml(s.collectedAtIso || 'not loaded') + '.</p></div>' +
      '<div class="h2oExecTools">' +
      '<button type="button" class="h2oExecBtn h2oExecRefresh" data-execute-control="refresh">Refresh</button>' +
      '<button type="button" class="h2oExecBtn h2oExecProof" data-execute-control="proof">Run Proof</button>' +
      '<button type="button" class="h2oExecBtn h2oExecClose" data-execute-control="close">Close</button>' +
      '</div></div>' +
      '<div class="h2oExecBody">' +
      '<section class="h2oExecSection h2oExecSectionWide" data-execute-section="journal"><h3>Execute journal rows</h3>' +
      '<div class="h2oExecMetrics">' +
      metric('rows', safeObject(s.journal).total || 0) +
      metric('in flight', safeObject(s.journal).inFlightCount || 0) +
      metric('phases', countsText(safeObject(s.journal).phaseCounts)) +
      '</div>' +
      rowsTable(safeObject(s.journal).latestRows, [
        { key: 'journalRowId', label: 'row' },
        { key: 'domainId', label: 'domain' },
        { key: 'operationKind', label: 'operation' },
        { key: 'phase', label: 'phase' },
        { key: 'dispatchTarget', label: 'target' },
        { key: 'eventDigest', label: 'digest' }
      ]) + '</section>' +
      '<section class="h2oExecSection" data-execute-section="in-flight"><h3>In-flight operations</h3>' +
      rowsTable(s.inFlight, [
        { key: 'journalRowId', label: 'row' },
        { key: 'domainId', label: 'domain' },
        { key: 'operationKind', label: 'operation' },
        { key: 'phase', label: 'phase' }
      ]) + '</section>' +
      '<section class="h2oExecSection" data-execute-section="publication"><h3>Publication ledger summary</h3>' +
      '<div class="h2oExecMetrics">' +
      metric('rows', safeObject(s.publication).total || 0) +
      metric('statuses', countsText(safeObject(s.publication).statusCounts)) +
      metric('latest', asArray(safeObject(s.publication).latestRows).length) +
      '</div>' +
      rowsTable(safeObject(s.publication).latestRows, [
        { key: 'publicationId', label: 'row' },
        { key: 'domainId', label: 'domain' },
        { key: 'operationKind', label: 'operation' },
        { key: 'status', label: 'status' }
      ]) + '</section>' +
      '<section class="h2oExecSection" data-execute-section="relay"><h3>Relay pending / uploaded summary</h3><div class="h2oExecMetrics">' +
      metric('available', boolText(safeObject(s.relay).available)) +
      metric('pending', safeObject(s.relay).pending || 0) +
      metric('uploaded', safeObject(s.relay).uploaded || 0) +
      '</div><p class="h2oExecNote">phase counts ' + escapeHtml(countsText(safeObject(s.relay).phaseCounts)) + '</p></section>' +
      '<section class="h2oExecSection" data-execute-section="native"><h3>Native dispatch summary</h3><div class="h2oExecMetrics">' +
      metric('available', boolText(safeObject(s.native).available)) +
      metric('dispatching', safeObject(s.native).dispatching || 0) +
      metric('confirmed', safeObject(s.native).confirmed || 0) +
      '</div><p class="h2oExecNote">phase counts ' + escapeHtml(countsText(safeObject(s.native).phaseCounts)) + '</p></section>' +
      '<section class="h2oExecSection" data-execute-section="f5"><h3>F5 pending / post-decision / closed summary</h3><div class="h2oExecMetrics">' +
      metric('pending', safeObject(s.f5).pending || 0) +
      metric('post-decision', safeObject(s.f5).postDecision || 0) +
      metric('closed', safeObject(s.f5).closed || 0) +
      '</div><p class="h2oExecNote">states ' + escapeHtml(countsText(safeObject(s.f5).stateCounts)) + '</p></section>' +
      '<section class="h2oExecSection" data-execute-section="settlement"><h3>Settlement phase summary</h3><div class="h2oExecMetrics">' +
      metric('active', safeObject(s.settlement).active || 0) +
      metric('complete', safeObject(s.settlement).complete || 0) +
      metric('phases', countsText(safeObject(s.settlement).phaseCounts)) +
      '</div></section>' +
      '<section class="h2oExecSection" data-execute-section="adapters"><h3>Adapter registry summary</h3><div class="h2oExecMetrics">' +
      metric('registry', boolText(safeObject(s.adapters).registryAvailable)) +
      metric('adapters', safeObject(s.adapters).total || 0) +
      metric('domains', countsText(safeObject(s.adapters).domains)) +
      '</div>' + rowsTable(safeObject(s.adapters).rows, [
        { key: 'domainId', label: 'domain' },
        { key: 'flavor', label: 'flavor' },
        { key: 'operations', label: 'operations' }
      ]) + '</section>' +
      '<section class="h2oExecSection" data-execute-section="chat-readiness"><h3>Chat adapter readiness</h3><div class="h2oExecMetrics">' + renderReadiness(safeObject(s.readiness).chat) + '</div></section>' +
      '<section class="h2oExecSection" data-execute-section="capture-readiness"><h3>Capture adapter readiness</h3><div class="h2oExecMetrics">' + renderReadiness(safeObject(s.readiness).capture) + '</div></section>' +
      '<section class="h2oExecSection" data-execute-section="snapshot-readiness"><h3>Snapshot adapter readiness</h3><div class="h2oExecMetrics">' + renderReadiness(safeObject(s.readiness).snapshot) + '</div></section>' +
      '<section class="h2oExecSection" data-execute-section="proof"><h3>Last proof status</h3><div class="h2oExecMetrics">' +
      metric('proof', proof ? (proofOk ? 'passed' : 'blocked') : 'not run') +
      metric('raw leak', proof ? boolText(safeObject(proof.rawLeakCheck).hasLeak) : 'no') +
      metric('side effects', 'false') +
      '</div><p class="h2oExecNote">' + escapeHtml(state.lastError || asArray(s.warnings).join(' ') || 'No read errors reported.') + '</p></section>' +
      '</div>';
  }
  function ensurePanel(options) {
    if (typeof document === 'undefined') return null;
    ensureStyle();
    var panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-label', 'Execute Lane');
      document.body.appendChild(panel);
    }
    if (safeObject(options).settingsHosted === true) panel.setAttribute('data-settings-hosted', 'true');
    panel.hidden = false;
    return panel;
  }
  function wirePanel(panel) {
    if (!panel || panel.__h2oExecuteLaneUiWired) return;
    panel.__h2oExecuteLaneUiWired = true;
    panel.addEventListener('click', async function (event) {
      var target = event.target;
      if (!target || typeof target.getAttribute !== 'function') return;
      var control = target.getAttribute('data-execute-control');
      if (control === 'refresh') {
        event.preventDefault();
        await refreshExecuteLanePanel();
      } else if (control === 'proof') {
        event.preventDefault();
        state.proofBusy = true;
        renderInto(panel);
        try {
          state.lastProof = await runExecuteLaneUiProof({ inspectCurrentPanel: true });
        } finally {
          state.proofBusy = false;
          renderInto(panel);
        }
      } else if (control === 'close') {
        event.preventDefault();
        panel.hidden = true;
      }
    });
  }
  function renderInto(panel) {
    if (!panel) return;
    panel.innerHTML = renderPanelHtml(state.snapshot || {
      collectedAtIso: '',
      journal: {},
      publication: {},
      relay: {},
      native: {},
      f5: {},
      settlement: {},
      adapters: {},
      readiness: summarizeReadiness(),
      warnings: []
    });
  }
  async function refreshExecuteLanePanel(options) {
    var panel = typeof document !== 'undefined' ? document.getElementById(PANEL_ID) : null;
    if (!panel && typeof document !== 'undefined') panel = ensurePanel(options);
    state.busy = true;
    state.lastError = '';
    try {
      state.snapshot = await collectSnapshot();
      if (panel) renderInto(panel);
      return buildResult({
        ok: true,
        panelOpened: !!panel,
        panelRefreshed: true,
        routeRendered: !!(panel && panel.getAttribute('data-settings-hosted') === 'true'),
        sectionsVisible: inspectSections(panel, renderPanelHtml(state.snapshot)),
        controls: inspectControls(panel, renderPanelHtml(state.snapshot)),
        rawLeakCheck: rawLeakCheck(panel, renderPanelHtml(state.snapshot)),
        metadata: { collectedAtIso: state.snapshot.collectedAtIso }
      });
    } catch (e) {
      state.lastError = cleanString(e && e.message) || 'execute-lane-refresh-failed';
      if (panel) renderInto(panel);
      return buildResult({
        ok: false,
        blockers: ['execute-lane-refresh-failed'],
        warnings: [state.lastError],
        panelOpened: !!panel,
        panelRefreshed: false
      });
    } finally {
      state.busy = false;
    }
  }
  async function openExecuteLanePanel(options) {
    var opts = safeObject(options);
    var panel = ensurePanel(opts);
    if (panel) {
      wirePanel(panel);
      renderInto(panel);
    }
    var result = await refreshExecuteLanePanel(opts);
    result.panelOpened = !!panel || result.panelOpened === true;
    result.routeRendered = !!(panel && panel.getAttribute('data-settings-hosted') === 'true') || result.routeRendered === true;
    return result;
  }
  function inspectSections(panel, fallbackHtml) {
    var out = {};
    REQUIRED_SECTIONS.forEach(function (name) { out[name] = false; });
    if (panel && typeof panel.querySelector === 'function') {
      REQUIRED_SECTIONS.forEach(function (name) {
        out[name] = !!panel.querySelector('[data-execute-section="' + name + '"]');
      });
      return out;
    }
    var html = cleanString(fallbackHtml);
    REQUIRED_SECTIONS.forEach(function (name) {
      out[name] = html.indexOf('data-execute-section="' + name + '"') !== -1;
    });
    return out;
  }
  function inspectControls(panel, fallbackHtml) {
    var controls = [];
    if (panel && typeof panel.querySelectorAll === 'function') {
      Array.prototype.forEach.call(panel.querySelectorAll('button'), function (button) {
        controls.push(cleanString(button.textContent));
      });
      return controls;
    }
    var html = cleanString(fallbackHtml);
    var re = /<button[^>]*>(.*?)<\/button>/g;
    var match;
    while ((match = re.exec(html))) controls.push(cleanString(match[1].replace(/<[^>]+>/g, '')));
    return controls;
  }
  function rawLeakCheck(panel, fallbackHtml) {
    var text = '';
    if (panel && typeof panel.textContent === 'string') text = panel.textContent;
    else text = cleanString(fallbackHtml).replace(/<[^>]+>/g, ' ');
    var matches = RAW_LEAK_PATTERNS.filter(function (pattern) { return pattern.test(text); }).map(String);
    return { hasLeak: matches.length > 0, matches: matches };
  }
  function controlsAreReadOnly(controls) {
    var labels = asArray(controls).map(function (label) { return cleanLower(label); });
    var allowed = { refresh: true, 'run proof': true, close: true };
    for (var i = 0; i < labels.length; i += 1) {
      if (!allowed[labels[i]]) return false;
      for (var j = 0; j < FORBIDDEN_BUTTON_WORDS.length; j += 1) {
        if (labels[i].indexOf(FORBIDDEN_BUTTON_WORDS[j]) !== -1) return false;
      }
    }
    return true;
  }
  function allSectionsVisible(map) {
    var sections = safeObject(map);
    return REQUIRED_SECTIONS.every(function (name) { return sections[name] === true; });
  }
  async function runExecuteLaneUiProof(options) {
    var opts = safeObject(options);
    var blockers = [];
    var warnings = [];
    var panel = typeof document !== 'undefined' ? document.getElementById(PANEL_ID) : null;
    var openResult = null;
    var refreshResult = null;

    if (typeof document !== 'undefined' && opts.inspectCurrentPanel !== true) {
      openResult = await openExecuteLanePanel({ settingsHosted: true });
      panel = document.getElementById(PANEL_ID);
    } else if (typeof document !== 'undefined' && !panel) {
      panel = ensurePanel({ settingsHosted: true });
      wirePanel(panel);
      renderInto(panel);
    }
    if (typeof document !== 'undefined') {
      refreshResult = await refreshExecuteLanePanel({ settingsHosted: panel && panel.getAttribute('data-settings-hosted') === 'true' });
      panel = document.getElementById(PANEL_ID);
    } else {
      state.snapshot = await collectSnapshot();
      refreshResult = buildResult({
        ok: true,
        panelOpened: true,
        panelRefreshed: true,
        routeRendered: true,
        sectionsVisible: inspectSections(null, renderPanelHtml(state.snapshot)),
        controls: inspectControls(null, renderPanelHtml(state.snapshot)),
        rawLeakCheck: rawLeakCheck(null, renderPanelHtml(state.snapshot))
      });
    }

    var html = renderPanelHtml(state.snapshot || {});
    var sections = inspectSections(panel, html);
    var controls = inspectControls(panel, html);
    var leaks = rawLeakCheck(panel, html);
    var routeRendered = typeof document === 'undefined' || !!panel;
    if (!(openResult ? openResult.panelOpened === true : true) && !panel && typeof document !== 'undefined') addCode(blockers, 'execute-lane-panel-open-failed');
    if (!refreshResult || refreshResult.panelRefreshed !== true) addCode(blockers, 'execute-lane-panel-refresh-failed');
    if (!routeRendered) addCode(blockers, 'execute-lane-route-render-failed');
    if (!allSectionsVisible(sections)) addCode(blockers, 'execute-lane-section-missing');
    if (!controlsAreReadOnly(controls)) addCode(blockers, 'execute-lane-mutation-control-present');
    if (leaks.hasLeak) addCode(blockers, 'execute-lane-raw-leak-detected');
    if (!state.snapshot || !state.snapshot.sideEffectSummary) addCode(warnings, 'execute-lane-side-effect-summary-missing');
    return buildResult({
      ok: blockers.length === 0,
      panelOpened: typeof document === 'undefined' || !!panel,
      panelRefreshed: !!refreshResult && refreshResult.panelRefreshed === true,
      routeRendered: routeRendered,
      sectionsVisible: sections,
      controls: controls,
      rawLeakCheck: leaks,
      blockers: blockers,
      warnings: warnings,
      metadata: {
        route: '#/settings/convergence/execute',
        requiredSections: REQUIRED_SECTIONS,
        controlCount: controls.length
      }
    });
  }

  H2O.Desktop.Sync.openExecuteLanePanel = openExecuteLanePanel;
  H2O.Desktop.Sync.refreshExecuteLanePanel = refreshExecuteLanePanel;
  H2O.Desktop.Sync.runExecuteLaneUiProof = runExecuteLaneUiProof;
  H2O.Desktop.Sync.__executeLaneUiInstalled = true;
  H2O.Desktop.Sync.__executeLaneUiVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : this);
