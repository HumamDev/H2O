/* H2O Desktop Sync - F12.0.6 delete convergence action UI
 *
 * Desktop/Tauri-only operator surface for one reviewed delete convergence
 * action.
 *
 * Safety invariants:
 *   - UI only. This module adds no delete logic, apply logic, bookkeeping
 *     logic, publication, WebDAV, inbox/outbox, transport, mobile write-back,
 *     or convergence algorithm.
 *   - Calls existing APIs only:
 *       buildConvergencePlan()
 *       checkDeleteMaterialization()
 *       runDeleteConvergencePreflight()
 *       previewDeleteF5Handoff()
 *       createDeleteF5ReviewRow()
 *       listDeleteF5ReviewRows()
 *       executeReviewedDelete()
 *       buildDeleteApplyEvent()
 *       finalizeDeleteConvergence()
 *       listConsumedOperations()
 *       getConvergenceWatermarks()
 *   - Operator actions are explicit button clicks. No timers, polling,
 *     automatic refresh, automatic delete, batch delete, auto merge,
 *     publication, or transport.
 *   - The panel works on one delete candidate / F5 review row at a time.
 *   - Rendered details are redacted: hashes/counts/status only; no raw names,
 *     folder IDs, parent IDs, chat IDs, paths, URLs, tokens, snapshots, or
 *     content.
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
  if (H2O.Desktop.Sync.__deleteConvergenceUiInstalled) return;

  var VERSION = '0.1.0-f12.0.6';
  var PANEL_ID = 'h2o-delete-convergence-panel';
  var LAUNCHER_ID = 'h2o-delete-convergence-launcher';
  var STYLE_ID = 'h2o-delete-convergence-style';

  var state = {
    open: false,
    busy: false,
    snapshot: null,
    selectedIndex: 0,
    candidateId: '',
    reviewId: '',
    materialization: null,
    preflight: null,
    handoff: null,
    reviewResult: null,
    deleteResult: null,
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
    return '<p class="h2oDeleteConvCodes"><strong>' + escapeHtml(label) + ':</strong> ' +
      list.map(escapeHtml).join(', ') + '</p>';
  }

  function metric(label, value) {
    return '<div class="h2oDeleteConvMetric"><span class="h2oDeleteConvValue">' +
      escapeHtml(value == null ? 0 : value) + '</span><span class="h2oDeleteConvLabel">' +
      escapeHtml(label) + '</span></div>';
  }

  function changedFields(entry) {
    return asArray(safeObject(entry).changedFields).map(cleanString).filter(Boolean).sort();
  }

  function isDeleteEntry(entry) {
    var row = safeObject(entry);
    var bucket = cleanString(row.bucket || row.sourceBucket || row.bucketName).toLowerCase();
    var reason = cleanString(row.reason || row.divergenceReason || row.conflictKind).toLowerCase();
    var operation = cleanString(row.operation || safeObject(row.proposedOperation).operation).toLowerCase();
    var intent = cleanString(row.operationIntent || safeObject(row.proposedOperation).operationIntent).toLowerCase();
    var fields = changedFields(row);
    if (bucket === 'deleted' || bucket === 'destructive' || bucket === 'delete') return true;
    if (reason.indexOf('delete') !== -1 && reason.indexOf('vs') === -1) return true;
    if (operation.indexOf('delete') !== -1 || intent === 'delete') return true;
    if (row.deleted === true || row.tombstoned === true) return true;
    return fields.length === 1 && (fields[0] === 'delete' || fields[0] === 'deleted' || fields[0] === 'tombstone');
  }

  function sourceBucketLabel(bucket) {
    return cleanString(bucket) || 'unknown';
  }

  function deleteCandidateItems(plan) {
    var buckets = safeObject(safeObject(plan).buckets);
    var order = ['proposalEligible', 'needsPreview', 'conflicted', 'blocked', 'stale', 'replay'];
    var items = [];
    order.forEach(function (bucket) {
      asArray(buckets[bucket]).forEach(function (entry) {
        if (!isDeleteEntry(entry)) return;
        items.push({ bucket: bucket, entry: safeObject(entry) });
      });
    });
    return items;
  }

  function selectedItem() {
    var items = deleteCandidateItems(safeObject(state.snapshot && state.snapshot.plan));
    if (!items.length) return null;
    var index = Math.max(0, Math.min(state.selectedIndex || 0, items.length - 1));
    return items[index];
  }

  function selectedEntry() {
    var item = selectedItem();
    return item ? safeObject(item.entry) : null;
  }

  function rowSummary(item, index) {
    var row = safeObject(item && item.entry);
    var platform = safeObject(row.sourcePlatform);
    var selected = index === (state.selectedIndex || 0);
    return '<article class="h2oDeleteConvRow' + (selected ? ' h2oDeleteConvRowSelected' : '') + '">' +
      '<div><strong>' + (selected ? 'selected subject' : 'subject') + '</strong> ' +
      escapeHtml(shortHash(row.subjectId)) + ' <strong>bucket</strong> ' +
      escapeHtml(sourceBucketLabel(item && item.bucket)) + '</div>' +
      '<div><strong>base</strong> ' + escapeHtml(shortHash(row.baseHash || row.localRevisionHash || row.preStateHash)) +
      ' <strong>target</strong> ' + escapeHtml(shortHash(row.targetHash || row.remoteRevisionHash || row.revisionHash)) + '</div>' +
      '<div><strong>lineage</strong> ' + escapeHtml(shortHash(row.lineageId)) +
      ' <strong>event</strong> ' + escapeHtml(shortHash(row.eventDigest)) + '</div>' +
      '<div><strong>reason</strong> ' + escapeHtml(row.reason || row.divergenceReason || 'unspecified') +
      ' <strong>platform</strong> ' + escapeHtml(platform.platformId || 'unknown') +
      ' / ' + escapeHtml(platform.surfaceKind || 'unknown') + '</div>' +
      (changedFields(row).length
        ? '<div><strong>changed fields</strong> ' + changedFields(row).map(escapeHtml).join(', ') + '</div>'
        : '') +
      codes('blockers', row.blockerCodes || row.blockers) +
      codes('warnings', row.warningCodes || row.warnings) +
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
        blockers: codeList(fallback.blockers).concat(['delete-convergence-ui-call-failed'])
      });
    }
  }

  async function collectSnapshot() {
    var sync = H2O.Desktop.Sync;
    var plan = await safeCall(sync.buildConvergencePlan, {
      ok: false,
      buckets: {},
      counts: {},
      blockers: ['convergence-planner-unavailable'],
      warnings: []
    });
    var reviews = await safeCall(sync.listDeleteF5ReviewRows, {
      ok: false,
      rows: [],
      counts: { total: 0, pendingReview: 0 },
      blockers: ['delete-f5-review-ledger-unavailable'],
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
    var items = deleteCandidateItems(plan);
    if (state.selectedIndex >= items.length) state.selectedIndex = 0;
    return {
      generatedAtIso: nowIsoSeconds(),
      plan: safeObject(plan),
      reviews: safeObject(reviews),
      consumed: safeObject(consumed),
      watermarks: safeObject(watermarks)
    };
  }

  function injectStyle() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#h2o-delete-convergence-launcher{position:fixed;right:18px;bottom:260px;z-index:2147482598;border:1px solid rgba(248,113,113,.45);border-radius:999px;padding:10px 14px;background:var(--wb-panel,#151923);color:var(--wb-text,#f8fafc);font:650 13px/1.2 system-ui,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.24);cursor:pointer}',
      '#h2o-delete-convergence-panel{position:fixed;right:18px;top:64px;width:min(1080px,calc(100vw - 36px));max-height:calc(100vh - 84px);z-index:2147482606;overflow:auto;border:1px solid rgba(248,113,113,.36);border-radius:20px;background:var(--wb-surface,#10141d);color:var(--wb-text,#f8fafc);box-shadow:0 24px 90px rgba(0,0,0,.38);font:13px/1.45 system-ui,sans-serif}',
      '#h2o-delete-convergence-panel *{box-sizing:border-box}',
      '.h2oDeleteConvHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid rgba(148,163,184,.22)}',
      '.h2oDeleteConvBody{padding:18px 20px 22px}',
      '.h2oDeleteConvKicker{margin:0 0 4px;color:var(--wb-muted,#94a3b8);font-size:12px;text-transform:uppercase;letter-spacing:.08em}',
      '.h2oDeleteConvTitle{margin:0;font-size:20px;line-height:1.15}',
      '.h2oDeleteConvNote{margin:8px 0 0;color:var(--wb-muted,#94a3b8)}',
      '.h2oDeleteConvControls{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}',
      '.h2oDeleteConvBtn{border:1px solid rgba(148,163,184,.34);border-radius:12px;background:rgba(148,163,184,.12);color:inherit;padding:9px 12px;font-weight:650;cursor:pointer}',
      '.h2oDeleteConvBtn[disabled]{opacity:.55;cursor:not-allowed}',
      '.h2oDeleteConvPrimary{background:rgba(59,130,246,.24);border-color:rgba(96,165,250,.5)}',
      '.h2oDeleteConvReview{background:rgba(245,158,11,.20);border-color:rgba(251,191,36,.46)}',
      '.h2oDeleteConvDelete{background:rgba(239,68,68,.20);border-color:rgba(248,113,113,.46)}',
      '.h2oDeleteConvGrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:14px 0}',
      '.h2oDeleteConvMetric{border:1px solid rgba(148,163,184,.22);border-radius:16px;padding:12px;background:rgba(148,163,184,.08)}',
      '.h2oDeleteConvValue{display:block;font-size:22px;font-weight:800;line-height:1.05}',
      '.h2oDeleteConvLabel{display:block;color:var(--wb-muted,#94a3b8);font-size:12px;margin-top:4px}',
      '.h2oDeleteConvSection{border:1px solid rgba(148,163,184,.22);border-radius:16px;margin:10px 0;background:rgba(148,163,184,.06);padding:12px 14px}',
      '.h2oDeleteConvSection h3{margin:0 0 8px;font-size:15px}',
      '.h2oDeleteConvRows{display:grid;gap:8px}',
      '.h2oDeleteConvRow{border:1px solid rgba(148,163,184,.18);border-radius:14px;padding:10px;background:rgba(2,6,23,.18);word-break:break-word}',
      '.h2oDeleteConvRowSelected{border-color:rgba(248,113,113,.66);box-shadow:0 0 0 1px rgba(248,113,113,.22) inset}',
      '.h2oDeleteConvCodes{margin:6px 0 0;color:var(--wb-muted,#94a3b8)}',
      '.h2oDeleteConvField{display:grid;gap:6px;margin:10px 0}',
      '.h2oDeleteConvField label{font-weight:700}',
      '.h2oDeleteConvInput{width:100%;border:1px solid rgba(148,163,184,.34);border-radius:12px;background:rgba(2,6,23,.18);color:inherit;padding:10px 12px;font:inherit}',
      '@media(max-width:860px){.h2oDeleteConvGrid{grid-template-columns:repeat(2,minmax(0,1fr))}#h2o-delete-convergence-panel{right:10px;top:54px;width:calc(100vw - 20px)}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function renderDeleteProposalCandidate(plan) {
    var items = deleteCandidateItems(plan);
    var rows = items.length
      ? items.slice(0, 12).map(rowSummary).join('')
      : '<p class="h2oDeleteConvNote">No delete planner entries are currently available. Proposal candidates must be generated by the existing delete proposal API before F5 review creation.</p>';
    return '<section class="h2oDeleteConvSection"><h3>Delete Proposal Candidate</h3>' +
      '<p class="h2oDeleteConvNote">One folder at a time. This panel does not generate proposal candidates; paste or keep the candidate id created by the existing delete proposal candidate API.</p>' +
      '<div class="h2oDeleteConvField">' +
      '<label for="h2o-delete-convergence-candidate">Delete proposal candidate id</label>' +
      '<input id="h2o-delete-convergence-candidate" class="h2oDeleteConvInput" type="text" autocomplete="off" spellcheck="false" value="' +
      escapeHtml(state.candidateId) + '" placeholder="candidate id required for F5 handoff/review">' +
      '</div>' +
      '<div class="h2oDeleteConvRows">' + rows + '</div>' +
      codes('plan blockers', safeObject(plan).blockers) +
      codes('plan warnings', safeObject(plan).warnings) +
      '</section>';
  }

  function renderMaterialization(result) {
    var r = safeObject(result);
    if (!result) {
      return '<section class="h2oDeleteConvSection"><h3>Delete Materialization Result</h3>' +
        '<p class="h2oDeleteConvNote">No materialization check has been run for the selected delete candidate.</p></section>';
    }
    return '<section class="h2oDeleteConvSection"><h3>Delete Materialization Result</h3>' +
      '<div class="h2oDeleteConvGrid">' +
      metric('ok', boolText(r.ok)) +
      metric('subject resolved', boolText(r.subjectResolved)) +
      metric('folder exists', boolText(r.folderExists)) +
      metric('empty folder', boolText(r.emptyFolder)) +
      metric('base fresh', boolText(r.baseFresh)) +
      '</div><div class="h2oDeleteConvGrid">' +
      metric('memberships', r.membershipCount == null ? 'unknown' : r.membershipCount) +
      metric('children', r.childFolderCount == null ? 'unknown' : r.childFolderCount) +
      metric('delete vs edit', boolText(r.deleteVsEditConflict)) +
      metric('recovery ready', boolText(r.recoveryReady)) +
      metric('tombstone capable', boolText(r.tombstoneCapable)) +
      '</div>' +
      codes('materialization blockers', r.blockers) +
      codes('materialization warnings', r.warnings) +
      '</section>';
  }

  function renderPreflight(result) {
    var r = safeObject(result);
    if (!result) {
      return '<section class="h2oDeleteConvSection"><h3>Delete Preflight Result</h3>' +
        '<p class="h2oDeleteConvNote">No delete preflight has been run for the selected candidate.</p></section>';
    }
    return '<section class="h2oDeleteConvSection"><h3>Delete Preflight Result</h3>' +
      '<div class="h2oDeleteConvGrid">' +
      metric('actionable', boolText(r.actionable)) +
      metric('subject resolved', boolText(r.subjectResolved)) +
      metric('folder exists', boolText(r.folderExists)) +
      metric('empty folder', boolText(r.emptyFolder)) +
      metric('base fresh', boolText(r.baseFresh)) +
      '</div><div class="h2oDeleteConvGrid">' +
      metric('delete vs edit', boolText(r.deleteVsEditConflict)) +
      metric('recovery ready', boolText(r.recoveryReady)) +
      metric('tombstone capable', boolText(r.tombstoneCapable)) +
      metric('watermark safe', boolText(r.watermarkSafe)) +
      metric('replay safe', boolText(r.replaySafe)) +
      '</div><div class="h2oDeleteConvGrid">' +
      metric('consumed safe', boolText(r.consumedSafe)) +
      metric('ok', boolText(r.ok)) +
      metric('blockers', codeList(r.blockers).length) +
      metric('warnings', codeList(r.warnings).length) +
      metric('mode', 'manual') +
      '</div>' +
      codes('preflight blockers', r.blockers) +
      codes('preflight warnings', r.warnings) +
      '</section>';
  }

  function renderHandoff(result) {
    var r = safeObject(result);
    if (!result) {
      return '<section class="h2oDeleteConvSection"><h3>F5 Handoff Preview</h3>' +
        '<p class="h2oDeleteConvNote">No F5 handoff preview has been run for the candidate id.</p></section>';
    }
    return '<section class="h2oDeleteConvSection"><h3>F5 Handoff Preview</h3>' +
      '<div class="h2oDeleteConvGrid">' +
      metric('ok', boolText(r.ok)) +
      metric('handoff ready', boolText(r.handoffReady)) +
      metric('candidate', shortHash(r.candidateId)) +
      metric('proposal', shortHash(r.proposalEnvelopeId)) +
      metric('subject', shortHash(r.subjectId)) +
      '</div><div class="h2oDeleteConvGrid">' +
      metric('lineage', shortHash(r.lineageId)) +
      metric('base hash', shortHash(r.baseHash)) +
      metric('memberships', r.membershipCount == null ? 'unknown' : r.membershipCount) +
      metric('children', r.childFolderCount == null ? 'unknown' : r.childFolderCount) +
      metric('F5 kind', r.expectedF5ReviewKind || 'missing') +
      '</div>' +
      codes('handoff blockers', r.blockers) +
      codes('handoff warnings', r.warnings) +
      '</section>';
  }

  function recentRows(rows, fields) {
    var list = asArray(rows).slice(-6).reverse();
    if (!list.length) return '<p class="h2oDeleteConvNote">No rows recorded.</p>';
    return '<div class="h2oDeleteConvRows">' + list.map(function (row) {
      var r = safeObject(row);
      return '<article class="h2oDeleteConvRow">' +
        fields.map(function (field) {
          return '<div><strong>' + escapeHtml(field.label) + '</strong> ' +
            escapeHtml(field.hash ? shortHash(r[field.key]) : cleanString(r[field.key] || 'missing')) +
            '</div>';
        }).join('') +
        '</article>';
    }).join('') + '</div>';
  }

  function renderReviewStatus(snapshot, reviewResult) {
    var reviews = safeObject(snapshot && snapshot.reviews);
    var row = safeObject(reviewResult && reviewResult.reviewRow);
    var rows = asArray(reviews.rows);
    return '<section class="h2oDeleteConvSection"><h3>F5 Review Status</h3>' +
      '<div class="h2oDeleteConvField">' +
      '<label for="h2o-delete-convergence-review">Approved F5 review id for execution</label>' +
      '<input id="h2o-delete-convergence-review" class="h2oDeleteConvInput" type="text" autocomplete="off" spellcheck="false" value="' +
      escapeHtml(state.reviewId || row.reviewId || '') + '" placeholder="approved/pending-approved review id required for reviewed delete">' +
      '</div>' +
      '<div class="h2oDeleteConvGrid">' +
      metric('ledger ok', boolText(reviews.ok)) +
      metric('review rows', safeObject(reviews.counts).total || rows.length) +
      metric('pending review', safeObject(reviews.counts).pendingReview || 0) +
      metric('created row', shortHash(row.reviewId)) +
      metric('created status', row.reviewStatus || 'none') +
      '</div>' +
      '<p class="h2oDeleteConvNote">Recent F5 review rows:</p>' +
      recentRows(rows, [
        { label: 'status', key: 'reviewStatus' },
        { label: 'review', key: 'reviewId', hash: true },
        { label: 'candidate', key: 'candidateId', hash: true },
        { label: 'subject', key: 'subjectId', hash: true }
      ]) +
      codes('review create blockers', safeObject(reviewResult).blockers) +
      codes('review create warnings', safeObject(reviewResult).warnings) +
      codes('review ledger blockers', reviews.blockers) +
      codes('review ledger warnings', reviews.warnings) +
      '</section>';
  }

  function renderDeleteApplyStatus(deleteResult, applyEventResult, bookkeepingResult) {
    var d = safeObject(deleteResult);
    var e = safeObject(applyEventResult);
    var b = safeObject(bookkeepingResult);
    var applyEvent = safeObject(b.applyEvent || e.applyEvent);
    if (!deleteResult && !applyEventResult && !bookkeepingResult) {
      return '<section class="h2oDeleteConvSection"><h3>Delete Apply Status</h3>' +
        '<p class="h2oDeleteConvNote">No reviewed delete has been executed from this panel.</p></section>';
    }
    return '<section class="h2oDeleteConvSection"><h3>Delete Apply Status</h3>' +
      '<div class="h2oDeleteConvGrid">' +
      metric('action ok', boolText(d.ok)) +
      metric('deleted', boolText(d.deleted)) +
      metric('applyEvent', applyEvent.kind === 'applyEvent' ? 'yes' : 'no') +
      metric('dryRun', boolText(applyEvent.dryRun)) +
      metric('subject', shortHash(d.subjectId || applyEvent.subjectId)) +
      '</div><div class="h2oDeleteConvGrid">' +
      metric('lineage', shortHash(d.lineageId || applyEvent.lineageId)) +
      metric('tombstone', shortHash(d.tombstoneId)) +
      metric('audit', shortHash(d.auditMaintenanceId)) +
      metric('event', shortHash(applyEvent.eventDigest)) +
      metric('bookkeeping', boolText(b.ok)) +
      '</div>' +
      codes('delete blockers', d.blockers) +
      codes('delete warnings', d.warnings) +
      codes('applyEvent blockers', e.blockers) +
      codes('applyEvent warnings', e.warnings) +
      codes('bookkeeping blockers', b.blockers) +
      codes('bookkeeping warnings', b.warnings) +
      '</section>';
  }

  function renderConsumedStatus(snapshot, bookkeepingResult) {
    var consumed = safeObject(snapshot && snapshot.consumed);
    var row = safeObject(bookkeepingResult && bookkeepingResult.consumedRow);
    return '<section class="h2oDeleteConvSection"><h3>Consumed Ledger Status</h3>' +
      '<div class="h2oDeleteConvGrid">' +
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
    return '<section class="h2oDeleteConvSection"><h3>Watermark Status</h3>' +
      '<div class="h2oDeleteConvGrid">' +
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

  function renderRecentDeleteActions(snapshot) {
    var consumed = safeObject(snapshot && snapshot.consumed);
    var watermarks = safeObject(snapshot && snapshot.watermarks);
    return '<section class="h2oDeleteConvSection"><h3>Recent Delete Actions</h3>' +
      '<p class="h2oDeleteConvNote">Recent delete consumed-operation rows:</p>' +
      recentRows(asArray(consumed.rows).filter(function (row) {
        return cleanString(row && row.operationKind) === 'folder.delete';
      }), [
        { label: 'status', key: 'consumedStatus' },
        { label: 'subject', key: 'subjectId', hash: true },
        { label: 'event', key: 'eventDigest', hash: true },
        { label: 'lineage', key: 'lineageId', hash: true }
      ]) +
      '<p class="h2oDeleteConvNote">Recent watermark rows:</p>' +
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
    var items = deleteCandidateItems(plan);
    var canRun = !state.busy && !!selectedEntry();
    var canReview = !state.busy && !!cleanString(state.candidateId);
    var canExecute = !state.busy && !!cleanString(state.reviewId || safeObject(state.reviewResult && state.reviewResult.reviewRow).reviewId);
    return '<div class="h2oDeleteConvHeader"><div>' +
      '<p class="h2oDeleteConvKicker">F12.0.6 operator action surface</p>' +
      '<h2 class="h2oDeleteConvTitle">Delete convergence review</h2>' +
      '<p class="h2oDeleteConvNote">UI only. One folder at a time. No batch delete, auto refresh, publication, transport, or remote mutation.</p>' +
      '</div><div class="h2oDeleteConvControls">' +
      '<a class="h2oDeleteConvBtn" href="#/settings/convergence/delete">Open in Settings</a>' +
      '<button class="h2oDeleteConvBtn" id="h2o-delete-convergence-refresh" type="button" ' + (state.busy ? 'disabled' : '') + '>Refresh</button>' +
      '<button class="h2oDeleteConvBtn h2oDeleteConvPrimary" id="h2o-delete-convergence-materialize" type="button" ' + (canRun ? '' : 'disabled') + '>Run Materialization Check</button>' +
      '<button class="h2oDeleteConvBtn h2oDeleteConvPrimary" id="h2o-delete-convergence-preflight" type="button" ' + (canRun ? '' : 'disabled') + '>Run Delete Preflight</button>' +
      '<button class="h2oDeleteConvBtn h2oDeleteConvReview" id="h2o-delete-convergence-create-review" type="button" ' + (canReview ? '' : 'disabled') + '>Create F5 Review Row</button>' +
      '<button class="h2oDeleteConvBtn h2oDeleteConvDelete" id="h2o-delete-convergence-execute" type="button" ' + (canExecute ? '' : 'disabled') + '>Execute Reviewed Delete</button>' +
      '</div></div><div class="h2oDeleteConvBody">' +
      (state.message ? '<p class="h2oDeleteConvNote">' + escapeHtml(state.message) + '</p>' : '') +
      '<div class="h2oDeleteConvGrid">' +
      metric('delete candidates', items.length) +
      metric('proposalEligible', counts.proposalEligible || 0) +
      metric('needsPreview', counts.needsPreview || 0) +
      metric('conflicted', counts.conflicted || 0) +
      metric('blocked', counts.blocked || 0) +
      '</div>' +
      renderDeleteProposalCandidate(plan) +
      renderMaterialization(state.materialization) +
      renderPreflight(state.preflight) +
      renderHandoff(state.handoff) +
      renderReviewStatus(snapshot, state.reviewResult) +
      renderDeleteApplyStatus(state.deleteResult, state.applyEventResult, state.bookkeepingResult) +
      renderConsumedStatus(snapshot, state.bookkeepingResult) +
      renderWatermarkStatus(snapshot, state.bookkeepingResult) +
      renderRecentDeleteActions(snapshot) +
      '</div>';
  }

  function bindPanel() {
    var refresh = document.getElementById('h2o-delete-convergence-refresh');
    var materialize = document.getElementById('h2o-delete-convergence-materialize');
    var preflight = document.getElementById('h2o-delete-convergence-preflight');
    var createReview = document.getElementById('h2o-delete-convergence-create-review');
    var execute = document.getElementById('h2o-delete-convergence-execute');
    var candidate = document.getElementById('h2o-delete-convergence-candidate');
    var review = document.getElementById('h2o-delete-convergence-review');
    if (refresh) refresh.addEventListener('click', function () { refreshDeleteConvergencePanel(); });
    if (materialize) materialize.addEventListener('click', function () { runSelectedMaterialization(); });
    if (preflight) preflight.addEventListener('click', function () { runSelectedDeletePreflight(); });
    if (createReview) createReview.addEventListener('click', function () { createSelectedF5ReviewRow(); });
    if (execute) execute.addEventListener('click', function () { executeSelectedReviewedDelete(); });
    if (candidate) candidate.addEventListener('input', function () {
      state.candidateId = String(candidate.value || '').trim();
      state.handoff = null;
      state.reviewResult = null;
      state.deleteResult = null;
      state.applyEventResult = null;
      state.bookkeepingResult = null;
      state.message = 'Candidate id changed; create a new F5 review row before delete.';
      if (createReview) createReview.disabled = state.busy || !cleanString(state.candidateId);
    });
    if (review) review.addEventListener('input', function () {
      state.reviewId = String(review.value || '').trim();
      state.deleteResult = null;
      state.applyEventResult = null;
      state.bookkeepingResult = null;
      state.message = 'Review id changed; execute only an approved reviewed-delete row.';
      if (execute) execute.disabled = state.busy || !cleanString(state.reviewId);
    });
  }

  function ensurePanel() {
    injectStyle();
    var panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Delete convergence review');
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

  async function openDeleteConvergencePanel() {
    state.open = true;
    state.message = '';
    await refreshDeleteConvergencePanel();
    return state.snapshot;
  }

  async function refreshDeleteConvergencePanel() {
    state.busy = true;
    state.message = 'Refreshing delete convergence status...';
    if (state.open) await renderPanel();
    state.snapshot = await collectSnapshot();
    state.materialization = null;
    state.preflight = null;
    state.handoff = null;
    state.reviewResult = null;
    state.deleteResult = null;
    state.applyEventResult = null;
    state.bookkeepingResult = null;
    state.message = 'Refreshed at ' + nowIsoSeconds() + '.';
    state.busy = false;
    if (state.open) await renderPanel();
    return state.snapshot;
  }

  async function runSelectedMaterialization() {
    var sync = H2O.Desktop.Sync;
    var entry = selectedEntry();
    state.busy = true;
    state.message = 'Running delete materialization check...';
    if (state.open) await renderPanel();
    if (!entry) {
      state.materialization = { ok: false, blockers: ['delete-entry-required'], warnings: [] };
    } else if (!sync || typeof sync.checkDeleteMaterialization !== 'function') {
      state.materialization = { ok: false, blockers: ['delete-materialization-unavailable'], warnings: [] };
    } else {
      try {
        state.materialization = safeObject(await sync.checkDeleteMaterialization({
          plannerEntry: entry
        }));
      } catch (_) {
        state.materialization = { ok: false, blockers: ['delete-materialization-failed'], warnings: [] };
      }
    }
    state.preflight = null;
    state.deleteResult = null;
    state.applyEventResult = null;
    state.bookkeepingResult = null;
    state.message = 'Delete materialization check complete.';
    state.busy = false;
    if (state.open) await renderPanel();
    return state.materialization;
  }

  async function runSelectedDeletePreflight() {
    var sync = H2O.Desktop.Sync;
    var entry = selectedEntry();
    state.busy = true;
    state.message = 'Running delete preflight...';
    if (state.open) await renderPanel();
    if (!entry) {
      state.preflight = { ok: false, actionable: false, blockers: ['delete-entry-required'], warnings: [] };
    } else if (!sync || typeof sync.runDeleteConvergencePreflight !== 'function') {
      state.preflight = { ok: false, actionable: false, blockers: ['delete-preflight-unavailable'], warnings: [] };
    } else {
      try {
        state.preflight = safeObject(await sync.runDeleteConvergencePreflight({
          plannerEntry: entry
        }));
      } catch (_) {
        state.preflight = { ok: false, actionable: false, blockers: ['delete-preflight-failed'], warnings: [] };
      }
    }
    state.deleteResult = null;
    state.applyEventResult = null;
    state.bookkeepingResult = null;
    state.message = 'Delete preflight complete.';
    state.busy = false;
    if (state.open) await renderPanel();
    return state.preflight;
  }

  async function createSelectedF5ReviewRow() {
    var sync = H2O.Desktop.Sync;
    var candidateId = cleanString(state.candidateId);
    state.busy = true;
    state.message = 'Creating F5 review row from delete proposal candidate...';
    if (state.open) await renderPanel();
    if (!candidateId) {
      state.handoff = { ok: false, handoffReady: false, blockers: ['candidateId-required'], warnings: [] };
      state.reviewResult = { ok: false, blockers: ['candidateId-required'], warnings: [] };
    } else if (!sync || typeof sync.previewDeleteF5Handoff !== 'function' || typeof sync.createDeleteF5ReviewRow !== 'function') {
      state.handoff = { ok: false, handoffReady: false, blockers: ['delete-f5-handoff-or-review-unavailable'], warnings: [] };
      state.reviewResult = { ok: false, blockers: ['delete-f5-handoff-or-review-unavailable'], warnings: [] };
    } else {
      try {
        state.handoff = safeObject(await sync.previewDeleteF5Handoff({ candidateId: candidateId }));
      } catch (_) {
        state.handoff = { ok: false, handoffReady: false, blockers: ['delete-f5-handoff-preview-failed'], warnings: [] };
      }
      if (state.handoff && state.handoff.handoffReady === true) {
        try {
          state.reviewResult = safeObject(await sync.createDeleteF5ReviewRow({
            candidateId: candidateId,
            operatorApprovalToken: cleanString(sync.__deleteF5ReviewRowApprovalToken)
          }));
          var row = safeObject(state.reviewResult.reviewRow);
          if (row.reviewId) state.reviewId = cleanString(row.reviewId);
        } catch (_) {
          state.reviewResult = { ok: false, blockers: ['delete-f5-review-row-failed'], warnings: [] };
        }
      } else {
        state.reviewResult = { ok: false, blockers: ['delete-f5-handoff-not-ready'], warnings: [] };
      }
    }
    state.snapshot = await collectSnapshot();
    state.deleteResult = null;
    state.applyEventResult = null;
    state.bookkeepingResult = null;
    state.message = state.reviewResult && state.reviewResult.ok === true
      ? 'F5 review row created. It must be approved before reviewed delete execution.'
      : 'F5 review row was not created.';
    state.busy = false;
    if (state.open) await renderPanel();
    return {
      handoff: state.handoff,
      reviewResult: state.reviewResult
    };
  }

  async function executeSelectedReviewedDelete() {
    var sync = H2O.Desktop.Sync;
    var reviewId = cleanString(state.reviewId || safeObject(state.reviewResult && state.reviewResult.reviewRow).reviewId);
    state.busy = true;
    state.message = 'Executing one approved F5 reviewed delete...';
    if (state.open) await renderPanel();
    if (!reviewId) {
      state.deleteResult = { ok: false, deleted: false, blockers: ['reviewId-required'], warnings: [] };
    } else if (!sync || typeof sync.executeReviewedDelete !== 'function') {
      state.deleteResult = { ok: false, deleted: false, blockers: ['delete-reviewed-apply-unavailable'], warnings: [] };
    } else {
      try {
        state.deleteResult = safeObject(await sync.executeReviewedDelete({
          reviewId: reviewId,
          operatorApprovalToken: cleanString(sync.__deleteReviewedApplyApprovalToken)
        }));
      } catch (_) {
        state.deleteResult = { ok: false, deleted: false, blockers: ['delete-reviewed-apply-failed'], warnings: [] };
      }
    }

    if (state.deleteResult && state.deleteResult.deleted === true) {
      if (!sync || typeof sync.buildDeleteApplyEvent !== 'function') {
        state.applyEventResult = { ok: false, blockers: ['delete-applyEvent-builder-unavailable'], warnings: [] };
      } else {
        try {
          state.applyEventResult = safeObject(await sync.buildDeleteApplyEvent({
            deleteResult: state.deleteResult
          }));
        } catch (_) {
          state.applyEventResult = { ok: false, blockers: ['delete-applyEvent-build-failed'], warnings: [] };
        }
      }
      if (!sync || typeof sync.finalizeDeleteConvergence !== 'function') {
        state.bookkeepingResult = { ok: false, blockers: ['delete-bookkeeping-unavailable'], warnings: [] };
      } else {
        try {
          state.bookkeepingResult = safeObject(await sync.finalizeDeleteConvergence({
            deleteResult: state.deleteResult
          }));
        } catch (_) {
          state.bookkeepingResult = { ok: false, blockers: ['delete-bookkeeping-failed'], warnings: [] };
        }
      }
    } else {
      state.applyEventResult = null;
      state.bookkeepingResult = null;
    }

    state.snapshot = await collectSnapshot();
    state.message = state.deleteResult && state.deleteResult.deleted === true
      ? 'Reviewed delete completed; applyEvent/bookkeeping status updated.'
      : 'Reviewed delete did not apply.';
    state.busy = false;
    if (state.open) await renderPanel();
    return {
      deleteResult: state.deleteResult,
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
    button.textContent = 'Delete Convergence';
    button.setAttribute('aria-label', 'Open delete convergence panel');
    button.addEventListener('click', function () { openDeleteConvergencePanel(); });
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

  H2O.Desktop.Sync.openDeleteConvergencePanel = openDeleteConvergencePanel;
  H2O.Desktop.Sync.refreshDeleteConvergencePanel = refreshDeleteConvergencePanel;
  H2O.Desktop.Sync.__deleteConvergenceUiInstalled = true;
  H2O.Desktop.Sync.__deleteConvergenceUiVersion = VERSION;

  bootLauncher();

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
