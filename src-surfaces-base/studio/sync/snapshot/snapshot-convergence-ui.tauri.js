/* H2O Desktop Sync - F14.4.11 snapshot convergence UI
 *
 * Read-only Desktop panel for the snapshot convergence lane. It displays
 * proposal candidates, handoff/receipt/bookkeeping linkage, and proof status.
 * It has no apply, publish, relay, outbox, Native, F5, watermark, or
 * consumed-operation actions.
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
  if (H2O.Desktop.Sync.__snapshotConvergenceUiInstalled) return;

  var VERSION = '0.1.0-f14.4.11';
  var PANEL_ID = 'h2o-snapshot-convergence-panel';
  var STYLE_ID = 'h2o-snapshot-convergence-style';
  var PROPOSAL_LEDGER_KEY = 'h2o:sync:convergence-proposal-candidates:v1';
  var PROPOSAL_LEDGER_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-ledger.v1';
  var SUBJECT_TYPE = 'snapshot.conversation';
  var OP_ARCHIVE_PROPOSED = 'snapshot-lifecycle-archive-proposed';
  var OP_TOMBSTONE_PROPOSED = 'snapshot-lifecycle-tombstone-proposed';
  var OP_RESTORE_PROPOSED = 'snapshot-lifecycle-restore-proposed';

  var state = {
    open: false,
    busy: false,
    proofBusy: false,
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
  function cleanLower(value) {
    return cleanString(value).toLowerCase();
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
    }).filter(Boolean).filter(function (code, index, arr) {
      return arr.indexOf(code) === index;
    });
  }
  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  function boolText(value) {
    return value === true ? 'yes' : 'no';
  }
  function operationLabel(operation) {
    if (operation === OP_ARCHIVE_PROPOSED) return 'Archive';
    if (operation === OP_TOMBSTONE_PROPOSED) return 'Tombstone';
    if (operation === OP_RESTORE_PROPOSED) return 'Restore';
    return cleanString(operation) || 'Snapshot';
  }
  function proofLaneFor(operation) {
    var proof = safeObject(state.proof);
    if (operation === OP_ARCHIVE_PROPOSED) return safeObject(proof.archiveLane);
    if (operation === OP_TOMBSTONE_PROPOSED) return safeObject(proof.tombstoneLane);
    if (operation === OP_RESTORE_PROPOSED) {
      return {
        ok: safeObject(proof.restoreArchiveLane).ok === true && safeObject(proof.restoreTombstoneLane).ok === true,
        archive: safeObject(proof.restoreArchiveLane),
        tombstone: safeObject(proof.restoreTombstoneLane)
      };
    }
    return {};
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
    if (!isObject(raw) || raw.schema !== PROPOSAL_LEDGER_SCHEMA || !Array.isArray(raw.rows)) {
      return { schema: PROPOSAL_LEDGER_SCHEMA, rows: [] };
    }
    return { schema: raw.schema, rows: raw.rows.slice() };
  }

  function metric(label, value) {
    return '<div class="h2oSnapConvMetric"><span class="h2oSnapConvValue">' +
      escapeHtml(value == null ? 0 : value) + '</span><span class="h2oSnapConvLabel">' +
      escapeHtml(label) + '</span></div>';
  }
  function codes(label, values) {
    var list = codeList(values);
    if (!list.length) return '';
    return '<p class="h2oSnapConvCodes"><strong>' + escapeHtml(label) + ':</strong> ' +
      list.map(escapeHtml).join(', ') + '</p>';
  }

  function injectStyle() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#h2o-snapshot-convergence-panel{position:fixed;right:18px;top:64px;width:min(1080px,calc(100vw - 36px));max-height:calc(100vh - 84px);z-index:2147482608;overflow:auto;border:1px solid rgba(56,189,248,.35);border-radius:20px;background:var(--wb-surface,#10141d);color:var(--wb-text,#f8fafc);box-shadow:0 24px 90px rgba(0,0,0,.38);font:13px/1.45 system-ui,sans-serif}',
      '#h2o-snapshot-convergence-panel *{box-sizing:border-box}',
      '.h2oSnapConvHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid rgba(148,163,184,.22)}',
      '.h2oSnapConvBody{padding:18px 20px 22px}',
      '.h2oSnapConvKicker{margin:0 0 4px;color:var(--wb-muted,#94a3b8);font-size:12px;text-transform:uppercase;letter-spacing:.08em}',
      '.h2oSnapConvTitle{margin:0;font-size:20px;line-height:1.15}',
      '.h2oSnapConvNote{margin:8px 0 0;color:var(--wb-muted,#94a3b8)}',
      '.h2oSnapConvControls{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}',
      '.h2oSnapConvBtn{border:1px solid rgba(148,163,184,.34);border-radius:12px;background:rgba(148,163,184,.12);color:inherit;padding:9px 12px;font-weight:650;cursor:pointer}',
      '.h2oSnapConvClose{min-width:38px;height:38px;padding:0;border-radius:999px;font-size:18px;line-height:1}',
      '#h2o-snapshot-convergence-panel[data-settings-hosted="true"] .h2oSnapConvClose{display:none}',
      '.h2oSnapConvBtn[disabled]{opacity:.55;cursor:not-allowed}',
      '.h2oSnapConvGrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:14px 0}',
      '.h2oSnapConvMetric{border:1px solid rgba(148,163,184,.22);border-radius:16px;padding:12px;background:rgba(148,163,184,.08)}',
      '.h2oSnapConvValue{display:block;font-size:22px;font-weight:800;line-height:1.05}',
      '.h2oSnapConvLabel{display:block;color:var(--wb-muted,#94a3b8);font-size:12px;margin-top:4px}',
      '.h2oSnapConvSection{border:1px solid rgba(148,163,184,.22);border-radius:16px;margin:10px 0;background:rgba(148,163,184,.06);padding:12px 14px}',
      '.h2oSnapConvSection h3{margin:0 0 8px;font-size:15px}',
      '.h2oSnapConvRows{display:grid;gap:8px}',
      '.h2oSnapConvRow{border:1px solid rgba(148,163,184,.18);border-radius:14px;padding:10px;background:rgba(2,6,23,.18);word-break:break-word}',
      '.h2oSnapConvCodes{margin:6px 0 0;color:var(--wb-muted,#94a3b8)}',
      '@media(max-width:900px){.h2oSnapConvGrid{grid-template-columns:repeat(2,minmax(0,1fr))}#h2o-snapshot-convergence-panel{right:10px;top:54px;width:calc(100vw - 20px)}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function summarizeCandidate(row) {
    var r = safeObject(row);
    var targetState = safeObject(r.targetState);
    var snapshotSummary = safeObject(r.canonicalSnapshotSummary);
    return {
      rowId: cleanString(r.rowId),
      envelopeId: cleanString(r.envelopeId),
      operation: cleanString(r.operation),
      operationIntent: cleanString(r.operationIntent),
      subjectId: cleanLower(r.subjectId),
      lineageId: cleanLower(r.lineageId),
      baseHash: cleanLower(r.baseHash),
      targetHash: cleanLower(r.targetHash),
      eventDigest: cleanLower(r.eventDigest),
      dedupeKey: cleanLower(r.dedupeKey),
      status: cleanString(r.status),
      generatedAtIso: cleanString(r.generatedAtIso),
      expiresAt: cleanString(r.expiresAt),
      sourceLifecycleState: cleanString(snapshotSummary.lifecycleState),
      targetLifecycleState: cleanString(targetState.lifecycleState)
    };
  }
  function summarizeBookkeeping(row) {
    var r = safeObject(row);
    var validation = safeObject(r.validationSummary);
    return {
      rowId: cleanString(r.rowId),
      status: cleanString(r.status),
      proposalOperation: cleanString(r.proposalOperation),
      operation: cleanString(r.operation),
      operationName: cleanString(r.operationName),
      subjectId: cleanLower(r.subjectId),
      lineageId: cleanLower(r.lineageId),
      proposalEventDigest: cleanLower(r.proposalEventDigest),
      applyEventDigest: cleanLower(r.applyEventDigest || r.eventDigest),
      applyEventDedupeKey: cleanLower(r.applyEventDedupeKey || r.dedupeKey),
      auditMaintenanceId: cleanString(r.auditMaintenanceId),
      handoffId: cleanString(r.handoffId),
      ownerKind: cleanString(r.ownerKind),
      sourceLifecycleState: cleanString(r.sourceLifecycleState),
      targetLifecycleState: cleanString(r.targetLifecycleState),
      validationSummary: {
        proposalLinked: validation.proposalLinked === true,
        handoffLinked: validation.handoffLinked === true,
        receiptLinked: validation.receiptLinked === true,
        auditLinked: validation.auditLinked === true,
        publicationTouched: validation.publicationTouched === true,
        relayTouched: validation.relayTouched === true,
        nativeCalled: validation.nativeCalled === true,
        f5Touched: validation.f5Touched === true,
        watermarkWritten: validation.watermarkWritten === true,
        consumedOperationWritten: validation.consumedOperationWritten === true
      }
    };
  }
  function summarizeProof(proof) {
    var p = safeObject(proof);
    var summary = safeObject(p.summary);
    return {
      ok: p.ok === true,
      archiveLane: safeObject(p.archiveLane).ok === true,
      tombstoneLane: safeObject(p.tombstoneLane).ok === true,
      restoreArchiveLane: safeObject(p.restoreArchiveLane).ok === true,
      restoreTombstoneLane: safeObject(p.restoreTombstoneLane).ok === true,
      privacyOk: safeObject(p.privacy).ok === true,
      lineageOk: safeObject(p.lineage).ok === true,
      sideEffectsOk: safeObject(p.sideEffects).ok === true,
      positiveLaneCount: summary.positiveLaneCount || 0,
      negativeGateCount: summary.negativeGateCount || 0,
      expectedNegativeGateCount: summary.expectedNegativeGateCount || 0,
      rawLeakDetected: summary.rawLeakDetected === true,
      publicationTouched: summary.publicationTouched === true,
      relayTouched: summary.relayTouched === true,
      outboxTouched: summary.outboxTouched === true,
      nativeCalled: summary.nativeCalled === true,
      f5Touched: summary.f5Touched === true,
      watermarkWritten: summary.watermarkWritten === true,
      consumedOperationWritten: summary.consumedOperationWritten === true,
      blockers: codeList(p.blockers),
      warnings: codeList(p.warnings)
    };
  }

  function rowsForOperation(rows, operation) {
    return asArray(rows).filter(function (row) {
      return safeObject(row).operation === operation || safeObject(row).proposalOperation === operation;
    });
  }
  function renderCandidateRows(rows, operation) {
    var filtered = rowsForOperation(rows, operation).slice(-8).reverse();
    if (!filtered.length) return '<p class="h2oSnapConvNote">No generated ' + escapeHtml(operationLabel(operation).toLowerCase()) + ' candidates found.</p>';
    return '<div class="h2oSnapConvRows">' + filtered.map(function (row) {
      var r = safeObject(row);
      return '<div class="h2oSnapConvRow">' +
        '<strong>' + escapeHtml(operationLabel(operation)) + '</strong>' +
        '<p class="h2oSnapConvNote">candidate ' + escapeHtml(shortHash(r.rowId)) +
        ' · subject ' + escapeHtml(shortHash(r.subjectId)) +
        ' · lineage ' + escapeHtml(shortHash(r.lineageId)) + '</p>' +
        '<p class="h2oSnapConvNote">base ' + escapeHtml(shortHash(r.baseHash)) +
        ' · target ' + escapeHtml(shortHash(r.targetHash)) +
        ' · event ' + escapeHtml(shortHash(r.eventDigest)) + '</p>' +
        '<p class="h2oSnapConvNote">state ' + escapeHtml(r.sourceLifecycleState || 'unknown') +
        ' -> ' + escapeHtml(r.targetLifecycleState || 'unknown') +
        ' · status ' + escapeHtml(r.status || 'unknown') + '</p>' +
        '</div>';
    }).join('') + '</div>';
  }
  function renderHandoffRows(rows, operation) {
    var filtered = rowsForOperation(rows, operation).slice(-8).reverse();
    var proofLane = proofLaneFor(operation);
    var proofHtml = state.proof
      ? '<p class="h2oSnapConvNote">Latest proof handoff ready: ' + escapeHtml(boolText(proofLane.ok === true)) + '.</p>'
      : '<p class="h2oSnapConvNote">Run proof to preview read-only handoff readiness.</p>';
    if (!filtered.length) return proofHtml + '<p class="h2oSnapConvNote">No recorded bookkeeping handoff linkage found.</p>';
    return proofHtml + '<div class="h2oSnapConvRows">' + filtered.map(function (row) {
      var r = safeObject(row);
      return '<div class="h2oSnapConvRow">' +
        '<strong>' + escapeHtml(operationLabel(operation)) + ' handoff</strong>' +
        '<p class="h2oSnapConvNote">handoff ' + escapeHtml(shortHash(r.handoffId)) +
        ' · owner ' + escapeHtml(r.ownerKind || 'unknown') +
        ' · linked ' + escapeHtml(boolText(safeObject(r.validationSummary).handoffLinked)) + '</p>' +
        '<p class="h2oSnapConvNote">subject ' + escapeHtml(shortHash(r.subjectId)) +
        ' · lineage ' + escapeHtml(shortHash(r.lineageId)) + '</p>' +
        '</div>';
    }).join('') + '</div>';
  }
  function renderReceiptRows(rows, operation) {
    var filtered = rowsForOperation(rows, operation).slice(-8).reverse();
    var proofLane = proofLaneFor(operation);
    var proofHtml = state.proof
      ? '<p class="h2oSnapConvNote">Latest proof applyEvent receipt generated: ' + escapeHtml(boolText(proofLane.ok === true)) + '.</p>'
      : '<p class="h2oSnapConvNote">Run proof to build read-only receipt previews.</p>';
    if (!filtered.length) return proofHtml + '<p class="h2oSnapConvNote">No recorded applyEvent receipt linkage found.</p>';
    return proofHtml + '<div class="h2oSnapConvRows">' + filtered.map(function (row) {
      var r = safeObject(row);
      return '<div class="h2oSnapConvRow">' +
        '<strong>' + escapeHtml(operationLabel(operation)) + ' receipt</strong>' +
        '<p class="h2oSnapConvNote">applyEvent ' + escapeHtml(shortHash(r.applyEventDigest)) +
        ' · audit ' + escapeHtml(shortHash(r.auditMaintenanceId)) +
        ' · linked ' + escapeHtml(boolText(safeObject(r.validationSummary).receiptLinked)) + '</p>' +
        '<p class="h2oSnapConvNote">state ' + escapeHtml(r.sourceLifecycleState || 'unknown') +
        ' -> ' + escapeHtml(r.targetLifecycleState || 'unknown') + '</p>' +
        '</div>';
    }).join('') + '</div>';
  }
  function renderBookkeepingRows(rows) {
    if (!rows.length) return '<p class="h2oSnapConvNote">No snapshot bookkeeping rows recorded yet.</p>';
    return '<div class="h2oSnapConvRows">' + rows.slice(-10).reverse().map(function (row) {
      var r = safeObject(row);
      var validation = safeObject(r.validationSummary);
      return '<div class="h2oSnapConvRow">' +
        '<strong>' + escapeHtml(operationLabel(r.proposalOperation)) + '</strong>' +
        '<p class="h2oSnapConvNote">bookkeeping ' + escapeHtml(shortHash(r.rowId)) +
        ' · subject ' + escapeHtml(shortHash(r.subjectId)) +
        ' · lineage ' + escapeHtml(shortHash(r.lineageId)) + '</p>' +
        '<p class="h2oSnapConvNote">proposal ' + escapeHtml(shortHash(r.proposalEventDigest)) +
        ' · receipt ' + escapeHtml(shortHash(r.applyEventDigest)) +
        ' · status ' + escapeHtml(r.status || 'unknown') + '</p>' +
        '<p class="h2oSnapConvNote">side effects: publication ' + escapeHtml(boolText(validation.publicationTouched)) +
        ' · relay ' + escapeHtml(boolText(validation.relayTouched)) +
        ' · native ' + escapeHtml(boolText(validation.nativeCalled)) +
        ' · f5 ' + escapeHtml(boolText(validation.f5Touched)) +
        ' · watermark ' + escapeHtml(boolText(validation.watermarkWritten)) +
        ' · consumed ' + escapeHtml(boolText(validation.consumedOperationWritten)) + '</p>' +
        '</div>';
    }).join('') + '</div>';
  }
  function renderProof(proof) {
    if (!proof) return '<p class="h2oSnapConvNote">Proof has not been run in this panel session.</p>';
    var p = safeObject(proof);
    return '<div class="h2oSnapConvGrid">' +
      metric('proof ok', boolText(p.ok)) +
      metric('archive', boolText(p.archiveLane)) +
      metric('tombstone', boolText(p.tombstoneLane)) +
      metric('restore archive', boolText(p.restoreArchiveLane)) +
      metric('restore tombstone', boolText(p.restoreTombstoneLane)) +
      '</div><div class="h2oSnapConvGrid">' +
      metric('privacy', boolText(p.privacyOk)) +
      metric('lineage', boolText(p.lineageOk)) +
      metric('side effects', boolText(p.sideEffectsOk)) +
      metric('negative gates', String(p.negativeGateCount) + '/' + String(p.expectedNegativeGateCount)) +
      metric('raw leak', boolText(p.rawLeakDetected)) +
      '</div><div class="h2oSnapConvGrid">' +
      metric('publication', boolText(p.publicationTouched)) +
      metric('relay', boolText(p.relayTouched)) +
      metric('outbox', boolText(p.outboxTouched)) +
      metric('native', boolText(p.nativeCalled)) +
      metric('f5', boolText(p.f5Touched)) +
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
    var proposalRows = asArray(proposals.rows).filter(function (row) {
      var r = safeObject(row);
      return r.sourceDomain === SUBJECT_TYPE &&
        (r.operation === OP_ARCHIVE_PROPOSED ||
          r.operation === OP_TOMBSTONE_PROPOSED ||
          r.operation === OP_RESTORE_PROPOSED);
    }).map(summarizeCandidate);

    var bookkeeping = { ok: false, rows: [], counts: { rows: 0 }, blockers: ['snapshot-bookkeeping-unavailable'], warnings: [] };
    if (typeof H2O.Desktop.Sync.listSnapshotConvergenceBookkeeping === 'function') {
      try {
        bookkeeping = safeObject(await H2O.Desktop.Sync.listSnapshotConvergenceBookkeeping());
      } catch (_) {
        bookkeeping = { ok: false, rows: [], counts: { rows: 0 }, blockers: ['snapshot-bookkeeping-read-failed'], warnings: [] };
      }
    }
    var bookkeepingRows = asArray(bookkeeping.rows).map(summarizeBookkeeping);
    return {
      generatedAtIso: nowIsoSeconds(),
      proposalRows: proposalRows,
      archiveRows: rowsForOperation(proposalRows, OP_ARCHIVE_PROPOSED),
      tombstoneRows: rowsForOperation(proposalRows, OP_TOMBSTONE_PROPOSED),
      restoreRows: rowsForOperation(proposalRows, OP_RESTORE_PROPOSED),
      bookkeeping: {
        ok: bookkeeping.ok === true,
        rows: bookkeepingRows,
        counts: safeObject(bookkeeping.counts),
        blockers: codeList(bookkeeping.blockers),
        warnings: codeList(bookkeeping.warnings)
      },
      counts: {
        archiveCandidates: rowsForOperation(proposalRows, OP_ARCHIVE_PROPOSED).length,
        tombstoneCandidates: rowsForOperation(proposalRows, OP_TOMBSTONE_PROPOSED).length,
        restoreCandidates: rowsForOperation(proposalRows, OP_RESTORE_PROPOSED).length,
        bookkeepingRows: bookkeepingRows.length
      },
      blockers: codeList(proposals.blockers),
      warnings: codeList(proposals.warnings)
    };
  }

  function render() {
    var panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    var snapshot = safeObject(state.snapshot);
    var counts = safeObject(snapshot.counts);
    var bookkeeping = safeObject(snapshot.bookkeeping);
    var proposalRows = asArray(snapshot.proposalRows);
    var bookkeepingRows = asArray(bookkeeping.rows);
    panel.innerHTML =
      '<div class="h2oSnapConvHeader">' +
      '<div><p class="h2oSnapConvKicker">F14.4.11 · read-only</p>' +
      '<h2 class="h2oSnapConvTitle">Snapshot Convergence</h2>' +
      '<p class="h2oSnapConvNote">Displays archive, tombstone, and restore candidates plus handoff, receipt, bookkeeping, and proof status. No apply, publish, relay, Native, F5, watermark, or consumed-operation controls are exposed.</p>' +
      (state.message ? '<p class="h2oSnapConvNote">' + escapeHtml(state.message) + '</p>' : '') +
      '</div><div class="h2oSnapConvControls">' +
      '<button class="h2oSnapConvBtn" id="h2o-snapshot-convergence-refresh" type="button" ' + (state.busy ? 'disabled' : '') + '>Refresh</button>' +
      '<button class="h2oSnapConvBtn" id="h2o-snapshot-convergence-proof" type="button" ' + (state.busy || state.proofBusy ? 'disabled' : '') + '>Run Proof</button>' +
      '<button class="h2oSnapConvBtn h2oSnapConvClose" id="h2o-snapshot-convergence-close" type="button" aria-label="Close">x</button>' +
      '</div></div>' +
      '<div class="h2oSnapConvBody">' +
      '<div class="h2oSnapConvGrid">' +
      metric('archive candidates', counts.archiveCandidates || 0) +
      metric('tombstone candidates', counts.tombstoneCandidates || 0) +
      metric('restore candidates', counts.restoreCandidates || 0) +
      metric('bookkeeping rows', counts.bookkeepingRows || 0) +
      metric('proof ok', state.proof ? boolText(state.proof.ok) : 'not run') +
      '</div>' +
      '<section class="h2oSnapConvSection"><h3>Archive Proposal Candidates</h3>' +
      renderCandidateRows(proposalRows, OP_ARCHIVE_PROPOSED) + '</section>' +
      '<section class="h2oSnapConvSection"><h3>Tombstone Proposal Candidates</h3>' +
      renderCandidateRows(proposalRows, OP_TOMBSTONE_PROPOSED) + '</section>' +
      '<section class="h2oSnapConvSection"><h3>Restore Proposal Candidates</h3>' +
      renderCandidateRows(proposalRows, OP_RESTORE_PROPOSED) + '</section>' +
      '<section class="h2oSnapConvSection"><h3>Archive Handoff Previews</h3>' +
      renderHandoffRows(bookkeepingRows, OP_ARCHIVE_PROPOSED) + '</section>' +
      '<section class="h2oSnapConvSection"><h3>Tombstone / F5 Handoff Previews</h3>' +
      renderHandoffRows(bookkeepingRows, OP_TOMBSTONE_PROPOSED) + '</section>' +
      '<section class="h2oSnapConvSection"><h3>Restore Handoff Previews</h3>' +
      renderHandoffRows(bookkeepingRows, OP_RESTORE_PROPOSED) + '</section>' +
      '<section class="h2oSnapConvSection"><h3>Archive ApplyEvent Receipts</h3>' +
      renderReceiptRows(bookkeepingRows, OP_ARCHIVE_PROPOSED) + '</section>' +
      '<section class="h2oSnapConvSection"><h3>Tombstone ApplyEvent Receipts</h3>' +
      renderReceiptRows(bookkeepingRows, OP_TOMBSTONE_PROPOSED) + '</section>' +
      '<section class="h2oSnapConvSection"><h3>Restore ApplyEvent Receipts</h3>' +
      renderReceiptRows(bookkeepingRows, OP_RESTORE_PROPOSED) + '</section>' +
      '<section class="h2oSnapConvSection"><h3>Bookkeeping Rows</h3>' +
      renderBookkeepingRows(bookkeepingRows) +
      codes('bookkeeping blockers', bookkeeping.blockers) +
      codes('bookkeeping warnings', bookkeeping.warnings) +
      '</section>' +
      '<section class="h2oSnapConvSection"><h3>Proof Status</h3>' +
      renderProof(state.proof) + '</section>' +
      codes('panel blockers', snapshot.blockers) +
      codes('panel warnings', snapshot.warnings) +
      '</div>';
    bindPanelEvents();
  }

  function closePanel() {
    var panel = document.getElementById(PANEL_ID);
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    state.open = false;
  }
  function bindPanelEvents() {
    var refresh = document.getElementById('h2o-snapshot-convergence-refresh');
    if (refresh) refresh.onclick = function () { refreshSnapshotConvergencePanel({ runProof: false }); };
    var proof = document.getElementById('h2o-snapshot-convergence-proof');
    if (proof) proof.onclick = function () { refreshSnapshotConvergencePanel({ runProof: true }); };
    var close = document.getElementById('h2o-snapshot-convergence-close');
    if (close) close.onclick = closePanel;
  }

  async function refreshSnapshotConvergencePanel(options) {
    var opts = safeObject(options);
    state.busy = true;
    state.proofBusy = opts.runProof === true;
    state.message = opts.runProof === true
      ? 'Refreshing and running read-only snapshot proof...'
      : 'Refreshing read-only snapshot convergence state...';
    render();
    try {
      state.snapshot = await collectSnapshot();
      if (opts.runProof === true || !state.proof) {
        if (typeof H2O.Desktop.Sync.runSnapshotConvergenceProof === 'function') {
          state.proof = summarizeProof(await H2O.Desktop.Sync.runSnapshotConvergenceProof());
        } else {
          state.proof = {
            ok: false,
            blockers: ['snapshot-proof-unavailable'],
            warnings: []
          };
        }
      }
      state.message = 'Refreshed ' + nowIsoSeconds() + '.';
    } catch (_) {
      state.message = 'Refresh failed.';
    } finally {
      state.busy = false;
      state.proofBusy = false;
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

  async function openSnapshotConvergencePanel(options) {
    if (typeof document === 'undefined') {
      return { ok: false, blockers: ['document-unavailable'], warnings: [] };
    }
    injectStyle();
    var panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Snapshot convergence panel');
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
    await refreshSnapshotConvergencePanel({ runProof: true });
    return {
      ok: true,
      panelId: PANEL_ID,
      blockers: [],
      warnings: []
    };
  }

  H2O.Desktop.Sync.openSnapshotConvergencePanel = openSnapshotConvergencePanel;
  H2O.Desktop.Sync.refreshSnapshotConvergencePanel = refreshSnapshotConvergencePanel;
  H2O.Desktop.Sync.__snapshotConvergenceUiInstalled = true;
  H2O.Desktop.Sync.__snapshotConvergenceUiVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
