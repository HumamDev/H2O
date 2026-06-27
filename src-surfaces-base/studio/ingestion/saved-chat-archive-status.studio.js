/* H2O Studio — Saved Chat Archive Status Model (Phase E.2.1)
 *
 * A PURE status model for the inline archive delivery status surface (E.2). It
 * maps a library row + local delivered metadata + delivery diagnostics + an
 * optional receipt read-back into one normalized, product-language status.
 *
 * It is pure: no DOM, no timers, no polling, no storage writes, no delivery
 * calls, no Desktop calls, no package/CAS/SQLite/materializer calls, and it
 * never inspects transcript/messages/html/assets/contentHash/package body. It
 * reads only row metadata, local delivered/dedupe metadata, delivery
 * diagnostics, and receipt/read-back metadata.
 *
 * Eligibility reuses the listener's saved-wins predicate
 * (H2O.Studio.ingestion.isSavedChatArchiveEligibleRowV1) when present, with an
 * internal mirror as a fallback, so the status surface and the delivery
 * listener never drift: saved snapshot-backed rows are eligible even when
 * isLinked is true; true link-only Add-to-Library rows are not.
 *
 * Public API (H2O.Studio.ingestion):
 *   computeSavedChatArchiveStatusV1({ row, local, diagnostics, receipt })
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.ingestion = H2O.Studio.ingestion || {};
  if (H2O.Studio.ingestion.computeSavedChatArchiveStatusV1) return;

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
  function safeObject(value) {
    return isObject(value) ? value : {};
  }
  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  var LABELS = {
    'archive-off': 'Archive off',
    'folder-not-connected': 'Connect archive folder',
    'ready': 'Ready to archive',
    'archive-requested': 'Archive requested',
    'waiting-for-desktop': 'Waiting for Desktop',
    'needs-desktop-snapshot': 'Needs Desktop snapshot',
    'archived': 'Archived',
    'already-archived': 'Already archived',
    'failed': 'Archive failed',
    'unknown-check-status': 'Check archive status',
  };
  var SEVERITY = {
    'archive-off': 'neutral',
    'folder-not-connected': 'warn',
    'ready': 'neutral',
    'archive-requested': 'info',
    'waiting-for-desktop': 'info',
    'needs-desktop-snapshot': 'warn',
    'archived': 'success',
    'already-archived': 'success',
    'failed': 'error',
    'unknown-check-status': 'neutral',
  };

  /* Internal mirror of the listener saved-wins predicate (fallback only). */
  function internalIsSavedRow(row) {
    if (!isObject(row)) return false;
    if (row.isSaved === true) return true;
    var dv = cleanString(row.displayView).toLowerCase();
    var bk = cleanString(row.badgeKind).toLowerCase();
    return dv === 'saved' || bk === 'saved';
  }
  function internalIsLinkOnlyRow(row) {
    if (internalIsSavedRow(row)) return false;
    if (row.isLinked === true || row.isImported === true) return true;
    var dv = cleanString(row.displayView).toLowerCase();
    return dv === 'link' || dv === 'linked' || dv === 'imported';
  }
  function internalEligible(row) {
    if (!isObject(row)) return false;
    if (row.archived === true || row.isDeleted === true) return false;
    return internalIsSavedRow(row) && !internalIsLinkOnlyRow(row) && !!cleanString(row.chatId);
  }
  function isEligible(row) {
    try {
      var ext = H2O.Studio && H2O.Studio.ingestion && H2O.Studio.ingestion.isSavedChatArchiveEligibleRowV1;
      if (typeof ext === 'function') return ext(row) === true;
    } catch (_) { /* fall through to mirror */ }
    return internalEligible(row);
  }
  function deriveSnapshotId(row) {
    return cleanString(row.snapshotId) || cleanString(row.lastSnapshotId) || cleanString(row.latestSnapshotId);
  }

  function makeStatus(state, extra) {
    var base = {
      state: state,
      label: LABELS[state] || state,
      severity: SEVERITY[state] || 'neutral',
      reason: '',
      requestId: null,
      canCheckStatus: false,
      canConnectFolder: false,
    };
    var merged = Object.assign(base, extra || {});
    merged.state = state;
    merged.label = LABELS[state] || state;
    merged.severity = SEVERITY[state] || 'neutral';
    return merged;
  }

  /* Map a receipt read-back status to an archive state (null = unrecognized). */
  function mapReceiptStatus(receiptStatus) {
    switch (receiptStatus) {
      case 'queued-on-desktop': return 'archived';
      case 'already-queued-duplicate': return 'already-archived';
      case 'needs-desktop-snapshot': return 'needs-desktop-snapshot';
      case 'delivered-awaiting-desktop': return 'waiting-for-desktop';
      case 'db-unavailable': return 'waiting-for-desktop';
      case 'rejected-by-desktop': return 'failed';
      case 'archive-request-folder-not-connected': return 'folder-not-connected';
      case 'archive-request-folder-permission-denied': return 'folder-not-connected';
      default: return null;
    }
  }

  function flagOn(diagnostics) {
    var d = safeObject(diagnostics);
    return d.enabled === true || d.flagEnabled === true || d.archiveEnabled === true;
  }
  function folderConnected(diagnostics) {
    return safeObject(diagnostics).folderConnected === true;
  }

  function computeSavedChatArchiveStatusV1(input) {
    var args = safeObject(input);
    var row = safeObject(args.row);
    var local = safeObject(args.local);
    var diagnostics = safeObject(args.diagnostics);
    var receipt = safeObject(args.receipt);

    /* 1. Eligibility gate — true link-only / non-saved rows never show as saved
     *    or archived. */
    if (!isEligible(row)) {
      return makeStatus('unknown-check-status', { reason: 'not-eligible', canCheckStatus: false });
    }

    var requestId = cleanString(local.requestId)
      || cleanString(receipt.requestId)
      || cleanString(safeObject(receipt.receipt).requestId)
      || null;

    /* 2. A recognized receipt verdict is the most authoritative local signal. */
    var receiptStatus = cleanString(receipt.status);
    if (receiptStatus) {
      var mapped = mapReceiptStatus(receiptStatus);
      if (mapped) {
        return makeStatus(mapped, {
          reason: 'receipt:' + receiptStatus,
          requestId: requestId,
          canCheckStatus: mapped !== 'folder-not-connected',
          canConnectFolder: mapped === 'folder-not-connected',
        });
      }
      /* Unrecognized / malformed receipt → offer a re-check. */
      return makeStatus('unknown-check-status', { reason: 'receipt:' + receiptStatus, requestId: requestId, canCheckStatus: !!requestId });
    }

    /* 3. Delivered locally but no receipt yet. */
    if (local.delivered === true) {
      if (requestId) {
        return makeStatus('waiting-for-desktop', { reason: 'delivered-no-receipt', requestId: requestId, canCheckStatus: true });
      }
      /* Legacy dedupe entry (E.1.x) had no requestId — delivered, cannot read back. */
      return makeStatus('archive-requested', { reason: 'delivered-legacy-no-request-id', requestId: null, canCheckStatus: false });
    }

    /* 4. Not delivered yet — global gates first. */
    if (!flagOn(diagnostics)) {
      return makeStatus('archive-off', { reason: 'flag-off' });
    }
    if (!folderConnected(diagnostics)) {
      return makeStatus('folder-not-connected', { reason: 'folder-not-connected', canConnectFolder: true });
    }
    if (!deriveSnapshotId(row)) {
      return makeStatus('needs-desktop-snapshot', { reason: 'missing-snapshot-id', canCheckStatus: false });
    }

    /* 5. Eligible, flag on, folder connected, has a snapshot, not yet delivered. */
    return makeStatus('ready', { reason: 'eligible-not-delivered' });
  }

  H2O.Studio.ingestion.computeSavedChatArchiveStatusV1 = computeSavedChatArchiveStatusV1;
})(typeof window !== 'undefined' ? window : globalThis);
