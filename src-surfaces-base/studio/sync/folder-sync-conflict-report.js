/* H2O Studio Sync - F10.6.4 read-only folder conflict report
 *
 * REPORT-ONLY diagnostic over F10.6.2 diff output.
 *
 * Safety invariants:
 *   - No proposal envelope emission.
 *   - No conflictCandidate envelope emission.
 *   - No applyEvent, apply, remote apply, WebDAV, or write-back.
 *   - No storage reads/writes. No fetch. No chrome.runtime.sendMessage.
 *   - No timers or polling.
 *   - No automatic merge or auto-resolution recommendation.
 *   - Raw folder names and raw chat IDs are never emitted.
 *   - No runtime import of @h2o/cross-platform-envelope.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.diagnostics = H2O.Studio.diagnostics || {};
  if (H2O.Studio.diagnostics.__folderConflictReportInstalled) return;

  var DIFF_SCHEMA = 'h2o.studio.sync.folder-diff.v1';
  var REPORT_SCHEMA = 'h2o.studio.sync.folder-conflict-report.v1';
  var VERSION = '0.1.0-f10.6.4';
  var REDACTED = 'redacted';
  var DEVICE_LOCAL = 'device-local';
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'url', 'path', 'password', 'apiKey'
  ];
  var HARD_KINDS = Object.freeze({
    'delete-vs-update': true,
    'orphan-parent': true,
    'duplicate-folder-name': true,
    'orphan-binding': true,
    'stale-base': true,
    'subjectId-collision': true,
    'rename-vs-move': true,
    'both-renamed': true
  });
  var NON_PROPOSAL_KINDS = Object.freeze({
    'delete-vs-update': true,
    'orphan-parent': true,
    'duplicate-folder-name': true,
    'orphan-binding': true,
    'stale-base': true,
    'subjectId-collision': true
  });

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

  function nowIso() {
    return new Date().toISOString();
  }

  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
  }

  function normalizeOptions(input) {
    var opts = safeObject(input);
    return {
      redactionClass: opts.redactionClass === DEVICE_LOCAL ? DEVICE_LOCAL : REDACTED
    };
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isObject(value)) return value;
    var out = {};
    var keys = Object.keys(value).sort();
    for (var i = 0; i < keys.length; i += 1) {
      out[keys[i]] = canonicalize(value[keys[i]]);
    }
    return out;
  }

  function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
  }

  function webCryptoAvailable() {
    try {
      return !!(global.crypto && global.crypto.subtle && global.crypto.subtle.digest);
    } catch (_) {
      return false;
    }
  }

  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i += 1) {
      var part = bytes[i].toString(16);
      hex += part.length === 1 ? '0' + part : part;
    }
    return hex;
  }

  async function sha256Hex(value) {
    if (!webCryptoAvailable()) return '';
    var data = new TextEncoder().encode(typeof value === 'string' ? value : String(value == null ? '' : value));
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
  }

  function baseReport(options) {
    return {
      schema: REPORT_SCHEMA,
      ok: false,
      generatedAtIso: nowIso(),
      redactionClass: options.redactionClass,
      summary: {
        totalConflicts: 0,
        hardBlockers: 0,
        softWarnings: 0,
        proposalEligible: 0,
        reportOnly: 0
      },
      conflicts: [],
      blockers: [],
      warnings: []
    };
  }

  function validDiff(diff) {
    return isObject(diff)
      && diff.schema === DIFF_SCHEMA
      && isObject(diff.buckets)
      && Array.isArray(diff.conflicts)
      && Array.isArray(diff.blockers)
      && Array.isArray(diff.warnings);
  }

  function mapReasonToKind(reason, fields, bucket) {
    var normalized = cleanString(reason);
    var list = asArray(fields).map(cleanString).filter(Boolean);
    if (normalized === 'rename-vs-rename') return 'both-renamed';
    if (normalized === 'rename-vs-move') return 'rename-vs-move';
    if (normalized === 'color-vs-color') return 'color-divergence';
    if (normalized === 'delete-vs-update') return 'delete-vs-update';
    if (normalized === 'baseline-hash-not-verified' || normalized === '2-way-different-revision') return 'stale-base';
    if (normalized === 'orphan-parent') return 'orphan-parent';
    if (normalized === 'duplicate-folder-name') return 'duplicate-folder-name';
    if (normalized === 'orphan-binding') return 'orphan-binding';
    if (normalized === 'subjectId-collision') return 'subjectId-collision';
    if (list.length === 1 && list[0] === 'color') return 'color-divergence';
    if (list.indexOf('name') !== -1 && list.indexOf('parent') !== -1) return 'rename-vs-move';
    if (list.indexOf('name') !== -1) return 'both-renamed';
    if (bucket === 'added' || bucket === 'changed' || bucket === 'deleted') return 'unknown-remote-object';
    return 'stale-base';
  }

  function suggestedAction(kind, proposalEligible) {
    if (proposalEligible === true) return 'safe-preview-only';
    if (kind === 'stale-base') return 're-preview-required';
    if (kind === 'orphan-parent') return 'parent-resolution-required';
    if (kind === 'color-divergence') return 'safe-preview-only';
    if (kind === 'delete-vs-update') return 'review-required';
    return 'manual-resolution-required';
  }

  function severityFor(kind, proposalEligible) {
    if (proposalEligible === true) return 'soft';
    return HARD_KINDS[kind] ? 'hard' : 'soft';
  }

  function blockerForKind(kind) {
    if (kind === 'delete-vs-update') return 'f5-blocker-present';
    if (kind === 'stale-base') return 'baseline-hash-not-verified';
    if (kind === 'orphan-parent') return 'orphan-parent';
    if (kind === 'duplicate-folder-name') return 'duplicate-folder-name';
    if (kind === 'orphan-binding') return 'orphan-binding';
    if (kind === 'subjectId-collision') return 'subjectId-collision';
    return '';
  }

  function stateHash(state) {
    var obj = safeObject(state);
    return cleanString(obj.revisionHash || obj.hash);
  }

  async function reportRow(input) {
    var row = safeObject(input);
    var kind = cleanString(row.conflictKind);
    var subjectId = cleanString(row.subjectId);
    var proposalEligible = row.proposalEligible === true && !NON_PROPOSAL_KINDS[kind];
    var blockers = asArray(row.blockers).map(cleanString).filter(Boolean);
    var warnings = asArray(row.warnings).map(function (warning) {
      return isObject(warning) ? cleanString(warning.code) : cleanString(warning);
    }).filter(Boolean);
    var severity = severityFor(kind, proposalEligible);
    var requesterStateHash = cleanString(row.requesterStateHash || stateHash(row.requesterState));
    var counterpartStateHash = cleanString(row.counterpartStateHash || stateHash(row.counterpartState));
    var commonAncestorHash = cleanString(row.commonAncestorHash);
    if (severity === 'hard') addCode(blockers, blockerForKind(kind));
    if (severity === 'soft' && proposalEligible !== true) addCode(warnings, kind);
    return {
      conflictId: await sha256Hex(canonicalJson({
        schema: REPORT_SCHEMA,
        subjectId: subjectId,
        conflictKind: kind,
        divergenceReason: cleanString(row.divergenceReason),
        requesterStateHash: requesterStateHash,
        counterpartStateHash: counterpartStateHash,
        commonAncestorHash: commonAncestorHash
      })),
      subjectId: subjectId,
      objectType: cleanString(row.objectType) || 'folder',
      conflictKind: kind,
      severity: severity,
      divergenceReason: cleanString(row.divergenceReason) || kind,
      requesterStateHash: requesterStateHash || null,
      counterpartStateHash: counterpartStateHash || null,
      commonAncestorHash: commonAncestorHash || null,
      proposalEligible: proposalEligible,
      suggestedAction: suggestedAction(kind, proposalEligible),
      blockers: blockers,
      warnings: warnings
    };
  }

  function rowsFromDiffConflicts(diff) {
    return asArray(diff.conflicts).map(function (conflict) {
      var c = safeObject(conflict);
      var fields = asArray(c.changedFields).map(cleanString).filter(Boolean);
      var kind = mapReasonToKind(c.divergenceReason, fields, 'conflicted');
      var blocker = blockerForKind(kind);
      return {
        subjectId: cleanString(c.subjectId),
        objectType: 'folder',
        conflictKind: kind,
        divergenceReason: cleanString(c.divergenceReason) || kind,
        requesterState: c.requesterState,
        counterpartState: c.counterpartState,
        commonAncestorHash: cleanString(c.commonAncestorHash),
        proposalEligible: false,
        blockers: blocker ? [blocker] : [],
        warnings: []
      };
    });
  }

  function rowsFromBuckets(diff) {
    var rows = [];
    var buckets = safeObject(diff.buckets);
    ['added', 'changed', 'deleted', 'conflicted'].forEach(function (bucketName) {
      asArray(buckets[bucketName]).forEach(function (entry) {
        var e = safeObject(entry);
        var fields = asArray(e.changedFields).map(cleanString).filter(Boolean);
        var reason = cleanString(e.reason) || bucketName;
        var kind = mapReasonToKind(reason, fields, bucketName);
        rows.push({
          subjectId: cleanString(e.subjectId),
          objectType: 'folder',
          conflictKind: kind,
          divergenceReason: reason,
          requesterStateHash: cleanString(e.revisionHash),
          counterpartStateHash: null,
          commonAncestorHash: cleanString(e.baseHash),
          proposalEligible: e.proposalEligible === true && bucketName !== 'conflicted',
          blockers: [],
          warnings: []
        });
      });
    });
    return rows;
  }

  function rowsFromBlockers(diff) {
    return asArray(diff.blockers).map(cleanString).filter(Boolean).map(function (code) {
      var kind = mapReasonToKind(code, [], '');
      return {
        subjectId: '',
        objectType: 'folder',
        conflictKind: kind,
        divergenceReason: code,
        requesterStateHash: null,
        counterpartStateHash: null,
        commonAncestorHash: null,
        proposalEligible: false,
        blockers: [code],
        warnings: []
      };
    });
  }

  function dedupeRows(rows) {
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      var key = [
        cleanString(row.subjectId),
        cleanString(row.conflictKind),
        cleanString(row.divergenceReason),
        cleanString(row.requesterStateHash || stateHash(row.requesterState)),
        cleanString(row.counterpartStateHash || stateHash(row.counterpartState))
      ].join('\n');
      if (seen[key]) continue;
      seen[key] = true;
      out.push(row);
    }
    return out;
  }

  function foreverNoKey(value) {
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) {
        var arrHit = foreverNoKey(value[i]);
        if (arrHit) return arrHit;
      }
      return '';
    }
    if (!isObject(value)) return '';
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k += 1) {
      var key = keys[k];
      if (FOREVER_NO_FIELDS.indexOf(key) !== -1) return key;
      if (/Token$/.test(key) && key !== 'previewToken') return key;
      var childHit = foreverNoKey(value[key]);
      if (childHit) return childHit;
    }
    return '';
  }

  async function buildFolderConflictReport(input) {
    var args = safeObject(input);
    var options = normalizeOptions(args);
    var report = baseReport(options);
    var diff = safeObject(args.diff);
    if (!validDiff(diff)) {
      report.blockers.push('invalid-folder-diff');
      return report;
    }
    if (!webCryptoAvailable()) {
      report.blockers.push('web-crypto-unavailable');
      return report;
    }

    asArray(diff.warnings).map(cleanString).filter(Boolean).forEach(function (code) {
      addCode(report.warnings, code);
    });
    asArray(diff.blockers).map(cleanString).filter(Boolean).forEach(function (code) {
      addCode(report.blockers, code);
    });

    var rows = dedupeRows([]
      .concat(rowsFromDiffConflicts(diff))
      .concat(rowsFromBuckets(diff))
      .concat(rowsFromBlockers(diff)));

    for (var i = 0; i < rows.length; i += 1) {
      var row = await reportRow(rows[i]);
      report.conflicts.push(row);
      if (row.severity === 'hard') report.summary.hardBlockers += 1;
      if (row.severity === 'soft') report.summary.softWarnings += 1;
      if (row.proposalEligible === true) report.summary.proposalEligible += 1;
      else report.summary.reportOnly += 1;
    }
    report.conflicts.sort(function (a, b) {
      return String(a.conflictId).localeCompare(String(b.conflictId));
    });
    report.summary.totalConflicts = report.conflicts.length;
    report.ok = true;

    var forbiddenKey = foreverNoKey(report);
    if (forbiddenKey) {
      report.ok = false;
      addCode(report.blockers, 'payload-contains-forever-no-field');
      report.conflicts = [];
      report.summary = {
        totalConflicts: 0,
        hardBlockers: 0,
        softWarnings: 0,
        proposalEligible: 0,
        reportOnly: 0
      };
    }
    return report;
  }

  H2O.Studio.diagnostics.buildFolderConflictReport = buildFolderConflictReport;
  H2O.Studio.diagnostics.__folderConflictReportInstalled = true;
  H2O.Studio.diagnostics.__folderConflictReportVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
