/* H2O Desktop Sync - F15.10.b library sync operator status UI
 *
 * Settings-hosted, read-only operator panel for F15 Library Sync proof status.
 *
 * Safety invariants:
 *   - UI only. No proposal actions, execute dispatch, Native call, F5
 *     decision, SQL/store write, publication, relay/outbox, watermark, or
 *     consumed-op write.
 *   - Proof APIs run only after explicit operator clicks.
 *   - Refresh re-renders the latest in-memory proof state only.
 *   - Rendered output is privacy-safe: identifiers are shortened and raw
 *     names, ids, paths, filenames, content, urls, or secrets are not shown.
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
  if (H2O.Desktop.Sync.__librarySyncOperatorUiInstalled) return;

  var VERSION = '0.2.0-f15.10.b';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-sync-operator-ui-result.v1';
  var PANEL_ID = 'h2o-library-sync-operator-panel';
  var STYLE_ID = 'h2o-library-sync-operator-style';
  var STALE_AFTER_MS = 15 * 60 * 1000;
  var SIDE_EFFECT_KEYS = [
    'publicationTouched',
    'relayTouched',
    'outboxTouched',
    'nativeCalled',
    'f5Touched',
    'applyExecuted',
    'watermarkWritten',
    'consumedOperationWritten'
  ];
  var REQUIRED_APIS = [
    'runLibrarySyncClosureProof',
    'runLibraryEndToEndSyncProof',
    'runLibraryCatalogPipelineProof',
    'runLibraryBindingPipelineProof',
    'runLibraryStoreCutoverProof',
    'runLibraryBulkMigrationE2EProof'
  ];
  var CATALOG_LANE_CASES = [
    { caseId: 'catalog-create-full-pipeline', label: 'Catalog creation lane' },
    { caseId: 'catalog-rename-full-pipeline', label: 'Catalog name-change lane' },
    { caseId: 'catalog-recolor-full-pipeline', label: 'Catalog color-change lane' },
    { caseId: 'catalog-archive-full-pipeline', label: 'Catalog archive' },
    { caseId: 'catalog-restore-from-archived-full-pipeline', label: 'Catalog restore from archived' },
    { caseId: 'catalog-tombstone-approve-seal-full-pipeline', label: 'Catalog tombstone seal path' },
    { caseId: 'catalog-tombstone-approve-restore-full-pipeline', label: 'Catalog tombstone restore path' },
    { caseId: 'catalog-restore-from-retained-full-pipeline', label: 'Catalog restore from retained' },
    { caseId: 'catalog-tombstone-pending-f5-blocks-execute', label: 'Catalog tombstone pending F5 block' },
    { caseId: 'catalog-privacy-leak-scan', label: 'Catalog privacy leak scan' }
  ];
  var BINDING_LANE_CASES = [
    { caseId: 'binding-bind-chat-label-full-pipeline', label: 'Chat-label link lane' },
    { caseId: 'binding-unbind-chat-label-full-pipeline', label: 'Chat-label unlink lane' },
    { caseId: 'binding-bind-chat-tag-full-pipeline', label: 'Chat-tag link lane' },
    { caseId: 'binding-unbind-chat-tag-full-pipeline', label: 'Chat-tag unlink lane' },
    { caseId: 'binding-bind-chat-category-full-pipeline', label: 'Chat-category link lane' },
    { caseId: 'binding-unbind-chat-category-full-pipeline', label: 'Chat-category unlink lane' },
    { caseId: 'binding-bind-tag-category-full-pipeline', label: 'Tag-category link lane' },
    { caseId: 'binding-unbind-tag-category-full-pipeline', label: 'Tag-category unlink lane' },
    { caseId: 'binding-chat-category-cache-refresh-metadata', label: 'Binding chat-category cache refresh metadata' },
    { caseId: 'binding-no-f5-footprint', label: 'Binding no F5 footprint' },
    { caseId: 'binding-replace-operation-not-supported', label: 'Binding replace operation block' },
    { caseId: 'binding-privacy-leak-scan', label: 'Binding privacy leak scan' }
  ];
  var FORBIDDEN_BUTTON_LABELS = [
    'apply',
    'execute now',
    'publish',
    'dispatch',
    'native action',
    'f5 action',
    'direct sql',
    'approve seal',
    'approve restore',
    'create',
    'rename',
    'recolor',
    'bind',
    'unbind'
  ];
  var RAW_FIELD_KEYS = [
    'name',
    'rawName',
    'displayName',
    'label',
    'title',
    'chatTitle',
    'rawTitle',
    'color',
    'rawColor',
    'rawId',
    'labelId',
    'tagId',
    'categoryId',
    'folderId',
    'chatId',
    'chat_id',
    'category_id',
    'accountId',
    'rawAccountId',
    'userId',
    'rawUserId',
    'path',
    'url',
    'fileName',
    'filename',
    'bundlePath',
    'bundleFilename',
    'content',
    'body',
    'text',
    'messages',
    'turns',
    'attachments',
    'files',
    'token',
    'shareToken'
  ];
  var RAW_LEAK_PATTERNS = [
    /\bchat[_-]?id\b/i,
    /\bcategory[_-]?id\b/i,
    /\blabel[_-]?id\b/i,
    /\btag[_-]?id\b/i,
    /\bfolder[_-]?id\b/i,
    /\baccount[_-]?id\b/i,
    /\buser[_-]?id\b/i,
    /\bhttps?:\/\//i,
    /\bfile:\/\//i,
    /\btoken\b/i,
    /\bsecret\b/i
  ];
  var state = {
    open: false,
    settingsHosted: false,
    busy: false,
    message: '',
    lastClosure: null,
    lastE2E: null,
    lastProofKind: '',
    lastRunAtIso: '',
    lastCopiedAtIso: ''
  };

  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function cleanLower(value) { return cleanString(value).toLowerCase(); }
  function nowIsoSeconds() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function boolText(value) { return value === true ? 'yes' : 'no'; }
  function escapeHtml(value) {
    return cleanString(value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }
  function shortHash(value) {
    var text = cleanString(value);
    if (!text) return 'missing';
    if (/^[0-9a-f]{64}$/i.test(text)) return text.slice(0, 10) + '...' + text.slice(-6);
    if (text.length > 22) return text.slice(0, 18) + '...';
    return text;
  }
  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean).filter(function (code, index, arr) { return arr.indexOf(code) === index; });
  }
  function mergeCodes(target, source) {
    codeList(source).forEach(function (code) {
      if (target.indexOf(code) === -1) target.push(code);
    });
  }
  function latestProof() {
    return state.lastClosure || state.lastE2E || null;
  }
  function proofAgeMs() {
    if (!state.lastRunAtIso) return Infinity;
    var t = Date.parse(state.lastRunAtIso);
    if (!Number.isFinite(t)) return Infinity;
    return Date.now() - t;
  }
  function staleStatus() {
    if (!latestProof()) return { stale: true, label: 'Not run this session' };
    if (proofAgeMs() > STALE_AFTER_MS) return { stale: true, label: 'Proof stale' };
    return { stale: false, label: 'Fresh' };
  }
  function hasCodeMatching(proof, pattern) {
    var re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern), 'i');
    var stack = [proof];
    var found = false;
    while (stack.length) {
      if (found) break;
      var item = stack.pop();
      if (Array.isArray(item)) {
        item.forEach(function (child) { stack.push(child); });
      } else if (isObject(item)) {
        Object.keys(item).forEach(function (key) {
          var value = item[key];
          if ((key === 'blockers' || key === 'warnings') && Array.isArray(value)) {
            if (codeList(value).some(function (code) { return re.test(code); })) found = true;
          } else {
            stack.push(value);
          }
        });
      }
    }
    return found;
  }
  function collectBlockersWarnings() {
    var blockers = [];
    var warnings = [];
    [state.lastClosure, state.lastE2E].forEach(function (proof) {
      mergeCodes(blockers, proof && proof.blockers);
      mergeCodes(warnings, proof && proof.warnings);
      asArray(proof && proof.cases).forEach(function (entry) {
        mergeCodes(blockers, entry && entry.blockers);
        mergeCodes(warnings, entry && entry.warnings);
      });
    });
    return { blockers: blockers, warnings: warnings };
  }
  function sideEffectValue(proof, key) {
    var direct = safeObject(proof && proof.sideEffectSummary);
    if (direct[key] === true) return true;
    var nested = safeObject(proof && proof.aggregate && proof.aggregate.sideEffectSummary);
    if (nested[key] === true) return true;
    return false;
  }
  function sideEffectSummary() {
    var proof = state.lastClosure || state.lastE2E || {};
    var out = {};
    SIDE_EFFECT_KEYS.forEach(function (key) {
      out[key] = sideEffectValue(proof, key) === true;
    });
    return out;
  }
  function sideEffectsSafe() {
    var summary = sideEffectSummary();
    return SIDE_EFFECT_KEYS.every(function (key) { return summary[key] !== true; });
  }
  function closureSubproof(name) {
    var proof = safeObject(state.lastClosure);
    return safeObject(proof[name]);
  }
  function e2eSubproof(name) {
    var proof = safeObject(state.lastE2E);
    return safeObject(proof[name]);
  }
  function laneSummary(name) {
    var closure = closureSubproof(name);
    var e2e = e2eSubproof(name + 'Proof');
    if (name === 'storeCutover') e2e = e2eSubproof('storeCutover');
    if (name === 'bulkMigration') e2e = e2eSubproof('bulkMigration');
    var source = closure.ok != null ? closure : e2e;
    return {
      ok: source.ok === true,
      caseCount: Number(source.caseCount || 0),
      passCount: Number(source.passCount || 0),
      failCount: Number(source.failCount || 0),
      blockers: codeList(source.blockers),
      warnings: codeList(source.warnings)
    };
  }
  function caseIdOf(entry) {
    return cleanString(entry && (entry.caseId || entry.name));
  }
  function caseSourceCandidates(lane) {
    if (lane === 'catalog') {
      return [
        { source: 'closure.catalog', proof: safeObject(state.lastClosure && state.lastClosure.catalog) },
        { source: 'closure.aggregate.catalogProof', proof: safeObject(state.lastClosure && state.lastClosure.aggregate && state.lastClosure.aggregate.catalogProof) },
        { source: 'e2e.catalogProof', proof: safeObject(state.lastE2E && state.lastE2E.catalogProof) },
        { source: 'e2e.catalog', proof: safeObject(state.lastE2E && state.lastE2E.catalog) }
      ];
    }
    return [
      { source: 'closure.binding', proof: safeObject(state.lastClosure && state.lastClosure.binding) },
      { source: 'closure.aggregate.bindingProof', proof: safeObject(state.lastClosure && state.lastClosure.aggregate && state.lastClosure.aggregate.bindingProof) },
      { source: 'e2e.bindingProof', proof: safeObject(state.lastE2E && state.lastE2E.bindingProof) },
      { source: 'e2e.binding', proof: safeObject(state.lastE2E && state.lastE2E.binding) }
    ];
  }
  function findLaneCase(lane, caseId) {
    var candidates = caseSourceCandidates(lane);
    for (var i = 0; i < candidates.length; i += 1) {
      var rows = asArray(candidates[i].proof && candidates[i].proof.cases);
      for (var j = 0; j < rows.length; j += 1) {
        if (caseIdOf(rows[j]) === caseId) {
          return {
            source: candidates[i].source,
            caseRow: rows[j],
            sourceProof: candidates[i].proof
          };
        }
      }
    }
    return {
      source: latestProof() ? 'latest-proof' : 'not-run',
      caseRow: null,
      sourceProof: null
    };
  }
  function laneCaseStatus(found) {
    var row = safeObject(found && found.caseRow);
    if (!found || !found.caseRow) return {
      key: 'not-run',
      label: latestProof() ? 'not run' : 'not run',
      uiStatus: 'proof stale / not run'
    };
    var blockers = codeList(row.blockers);
    var warnings = codeList(row.warnings);
    if (row.ok === true && warnings.length) return {
      key: 'warning',
      label: 'warning',
      uiStatus: 'warning'
    };
    if (row.ok === true) return {
      key: 'pass',
      label: 'pass',
      uiStatus: 'healthy'
    };
    return {
      key: 'fail',
      label: 'fail',
      uiStatus: 'proof failed'
    };
  }
  function renderLaneCaseRow(lane, definition) {
    var found = findLaneCase(lane, definition.caseId);
    var row = safeObject(found.caseRow);
    var status = laneCaseStatus(found);
    var blockers = codeList(row.blockers);
    var warnings = codeList(row.warnings);
    var details = [
      '<span>source <code>' + escapeHtml(found.source) + '</code></span>',
      '<span>case <code>' + escapeHtml(definition.caseId) + '</code></span>',
      '<span>blockers ' + escapeHtml(String(blockers.length)) + '</span>',
      '<span>warnings ' + escapeHtml(String(warnings.length)) + '</span>'
    ].join(' · ');
    return '<details class="h2oLibSyncLaneRow h2oLibSyncLaneRow-' + escapeHtml(status.key) + '">' +
      '<summary><span class="h2oLibSyncLaneTitle">' + escapeHtml(definition.label) + '</span>' +
      '<span class="h2oLibSyncLaneStatus">' + escapeHtml(status.label) + '</span></summary>' +
      '<p class="h2oLibSyncNote">' + details + '</p>' +
      '<p class="h2oLibSyncNote">status mapping: ' + escapeHtml(status.uiStatus) + '</p>' +
      (blockers.length ? '<p class="h2oLibSyncNote">blockers: ' + blockers.slice(0, 8).map(function (code) {
        return '<code>' + escapeHtml(shortHash(code)) + '</code>';
      }).join(', ') + '</p>' : '') +
      (warnings.length ? '<p class="h2oLibSyncNote">warnings: ' + warnings.slice(0, 8).map(function (code) {
        return '<code>' + escapeHtml(shortHash(code)) + '</code>';
      }).join(', ') + '</p>' : '') +
      '</details>';
  }
  function renderLaneDetails(lane, definitions) {
    var proofAvailable = !!latestProof();
    return '<p class="h2oLibSyncNote">' + escapeHtml(proofAvailable
      ? 'Rows reflect the latest in-memory closure or end-to-end proof result.'
      : 'No proof has run in this session; rows remain not run until an explicit proof action completes.') + '</p>' +
      '<div class="h2oLibSyncLaneRows">' + definitions.map(function (definition) {
        return renderLaneCaseRow(lane, definition);
      }).join('') + '</div>';
  }
  function privacySummary() {
    var closurePrivacy = safeObject(state.lastClosure && state.lastClosure.privacy);
    var e2ePrivacy = safeObject(state.lastE2E && state.lastE2E.privacy);
    var source = closurePrivacy.ok != null ? closurePrivacy : e2ePrivacy;
    return {
      ok: source.ok === true,
      leakCount: Number(source.leakCount || 0),
      rawFieldGuard: true,
      blockers: codeList(source.blockers),
      warnings: codeList(source.warnings)
    };
  }
  function apiPresence() {
    var sync = H2O.Desktop.Sync || {};
    var missing = REQUIRED_APIS.filter(function (name) { return typeof sync[name] !== 'function'; });
    return { ok: missing.length === 0, missing: missing };
  }
  function statusState() {
    var api = apiPresence();
    var stale = staleStatus();
    var closure = safeObject(state.lastClosure);
    var e2e = safeObject(state.lastE2E);
    var codes = collectBlockersWarnings();
    if (!api.ok) return { key: 'blocked', label: 'Blocked', reason: 'Required proof API missing' };
    if (codes.blockers.length) return { key: 'blocked', label: 'Blocked', reason: 'Closure blocker present' };
    if ((state.lastClosure && closure.ok !== true) || (state.lastE2E && e2e.ok !== true)) {
      return { key: 'proof failed', label: 'Proof failed', reason: 'Latest proof returned ok=false' };
    }
    if (stale.stale) return { key: 'proof stale', label: stale.label, reason: 'Run proof explicitly' };
    if (hasPendingReview()) return { key: 'pending review', label: 'Pending review', reason: 'Catalog tombstone F5 state pending' };
    if (hasPartialMigration()) return { key: 'partial migration', label: 'Partial migration', reason: 'Bulk proof contains partial result evidence' };
    if (hasCacheDrift()) return { key: 'cache drift detected', label: 'Cache drift detected', reason: 'Cache bridge warning or failed cache proof' };
    if (codes.warnings.length) return { key: 'warning', label: 'Warning', reason: 'Proof warning present' };
    if (closure.ok === true && privacySummary().ok === true && sideEffectsSafe()) {
      return { key: 'healthy', label: 'Healthy', reason: 'Closure proof passed' };
    }
    return { key: 'warning', label: 'Warning', reason: 'Proof status incomplete' };
  }
  function hasPendingReview() {
    var proof = state.lastClosure || state.lastE2E || null;
    if (!proof) return false;
    if (hasCodeMatching(proof, /pending-f5|pending-review|f5-state-not-post-decision/i)) return true;
    var catalog = safeObject(proof.catalog || proof.catalogProof);
    return asArray(catalog.cases).some(function (entry) {
      return cleanString(entry.caseId) === 'catalog-tombstone-pending-f5-blocks-execute' && entry.ok === true;
    });
  }
  function hasPartialMigration() {
    var bulk = safeObject((state.lastClosure && state.lastClosure.bulkMigration) ||
      (state.lastE2E && state.lastE2E.bulkMigration));
    if (safeObject(bulk.partialFailure).status === 'partial') return true;
    return asArray(bulk.cases).some(function (entry) {
      return /partial/.test(cleanString(entry.caseId)) && entry.ok === true;
    });
  }
  function hasCacheDrift() {
    var binding = safeObject((state.lastClosure && state.lastClosure.binding) ||
      (state.lastE2E && state.lastE2E.bindingProof));
    if (binding.ok === false) return true;
    var warnings = codeList(binding.warnings).join(' ');
    return /cache.*drift|category.*cache.*failed/i.test(warnings);
  }
  function rawLeakCheck(value) {
    var text = '';
    try { text = JSON.stringify(value || {}); } catch (_) { text = ''; }
    var matches = RAW_LEAK_PATTERNS.map(function (re) {
      return re.test(text) ? String(re) : '';
    }).filter(Boolean);
    return { ok: matches.length === 0, matches: matches };
  }
  function safeReportKey(key) {
    var lowered = cleanLower(key);
    return RAW_FIELD_KEYS.some(function (blocked) {
      return lowered === cleanLower(blocked) || lowered.indexOf(cleanLower(blocked)) !== -1;
    });
  }
  function safeReportString(value, key) {
    var text = cleanString(value);
    if (!text) return text;
    if (safeReportKey(key || '')) return '[redacted]';
    if (/^[0-9a-f]{64}$/i.test(text)) return text;
    if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text;
    if (/^[a-z0-9_.:/-]{1,96}$/i.test(text) && !RAW_LEAK_PATTERNS.some(function (re) { return re.test(text); })) return text;
    return '[redacted-string]';
  }
  function sanitizeForReport(value, key) {
    if (Array.isArray(value)) return value.slice(0, 80).map(function (item) { return sanitizeForReport(item, key); });
    if (isObject(value)) {
      var out = {};
      Object.keys(value).sort().forEach(function (childKey) {
        if (safeReportKey(childKey)) {
          out[childKey] = '[redacted]';
          return;
        }
        out[childKey] = sanitizeForReport(value[childKey], childKey);
      });
      return out;
    }
    if (typeof value === 'string') return safeReportString(value, key);
    if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
    return '[redacted]';
  }
  function buildReport() {
    var payload = {
      schema: RESULT_SCHEMA,
      version: VERSION,
      generatedAtIso: nowIsoSeconds(),
      lastRunAtIso: state.lastRunAtIso,
      lastProofKind: state.lastProofKind,
      status: statusState(),
      closure: state.lastClosure,
      endToEnd: state.lastE2E,
      privacy: privacySummary(),
      sideEffectSummary: sideEffectSummary()
    };
    return sanitizeForReport(payload, '');
  }
  function metric(label, value, className) {
    return '<div class="h2oLibSyncMetric ' + escapeHtml(className || '') + '">' +
      '<span class="h2oLibSyncValue">' + escapeHtml(value) + '</span>' +
      '<span class="h2oLibSyncLabel">' + escapeHtml(label) + '</span>' +
      '</div>';
  }
  function codeBlock(title, values) {
    var list = codeList(values);
    if (!list.length) return '<p class="h2oLibSyncNote">No ' + escapeHtml(title.toLowerCase()) + '.</p>';
    return '<details class="h2oLibSyncDetails" open><summary>' + escapeHtml(title) + ' (' + list.length + ')</summary>' +
      '<ul>' + list.slice(0, 24).map(function (code) {
        return '<li><code>' + escapeHtml(shortHash(code)) + '</code></li>';
      }).join('') + '</ul>' +
      (list.length > 24 ? '<p class="h2oLibSyncNote">Additional entries omitted from compact view.</p>' : '') +
      '</details>';
  }
  function section(title, html) {
    return '<section class="h2oLibSyncSection"><h3>' + escapeHtml(title) + '</h3>' + html + '</section>';
  }
  function renderSummaryCard(title, summary) {
    var s = safeObject(summary);
    return '<div class="h2oLibSyncCard">' +
      '<div class="h2oLibSyncCardTitle">' + escapeHtml(title) + '</div>' +
      '<div class="h2oLibSyncCardStatus ' + (s.ok ? 'isOk' : 'isWarn') + '">' + escapeHtml(s.ok ? 'ok' : 'not ok') + '</div>' +
      '<p class="h2oLibSyncNote">cases ' + escapeHtml(String(s.passCount || 0)) + '/' + escapeHtml(String(s.caseCount || 0)) +
      ' · failures ' + escapeHtml(String(s.failCount || 0)) + '</p>' +
      '</div>';
  }
  function renderProofStatus() {
    var closure = safeObject(state.lastClosure);
    var e2e = safeObject(state.lastE2E);
    var status = statusState();
    var stale = staleStatus();
    return '<div class="h2oLibSyncStatusLine">' +
      '<span class="h2oLibSyncPill h2oLibSyncPill-' + escapeHtml(status.key.replace(/\s+/g, '-')) + '">' + escapeHtml(status.label) + '</span>' +
      '<span>' + escapeHtml(status.reason) + '</span>' +
      '<span class="h2oLibSyncMuted">' + escapeHtml(stale.label) + '</span>' +
      '</div>' +
      '<div class="h2oLibSyncGrid">' +
      metric('closure proof', state.lastClosure ? boolText(closure.ok) : 'not run') +
      metric('E2E proof', state.lastE2E ? boolText(e2e.ok) : 'not run') +
      metric('closure cases', state.lastClosure ? String(closure.passCount || 0) + '/' + String(closure.caseCount || 0) : '0/0') +
      metric('last run', state.lastRunAtIso || 'never') +
      '</div>';
  }
  function renderPrivacy() {
    var privacy = privacySummary();
    return '<div class="h2oLibSyncGrid">' +
      metric('privacy clean', boolText(privacy.ok)) +
      metric('leak count', String(privacy.leakCount || 0)) +
      metric('raw-field guard', boolText(privacy.rawFieldGuard)) +
      '</div>' +
      codeBlock('Privacy blockers', privacy.blockers) +
      codeBlock('Privacy warnings', privacy.warnings);
  }
  function renderSideEffects() {
    var summary = sideEffectSummary();
    return '<div class="h2oLibSyncGrid h2oLibSyncGridWide">' + SIDE_EFFECT_KEYS.map(function (key) {
      return metric(key.replace(/([A-Z])/g, ' $1').toLowerCase(), boolText(summary[key] === true), summary[key] === true ? 'isBad' : 'isOk');
    }).join('') + '</div>';
  }
  function renderBlockersWarnings() {
    var codes = collectBlockersWarnings();
    return codeBlock('Blockers', codes.blockers) + codeBlock('Warnings', codes.warnings);
  }
  function renderReport() {
    var report = buildReport();
    var leak = rawLeakCheck(report);
    return '<p class="h2oLibSyncNote">Latest report is held in module memory only. Copy emits redacted JSON.</p>' +
      '<div class="h2oLibSyncGrid">' +
      metric('report ready', boolText(!!latestProof())) +
      metric('copy result', state.lastCopiedAtIso || 'not copied') +
      metric('report leak check', boolText(leak.ok)) +
      '</div>';
  }
  function injectStyle() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#' + PANEL_ID + '{position:fixed;right:18px;top:64px;width:min(1080px,calc(100vw - 36px));max-height:calc(100vh - 84px);z-index:2147482609;overflow:auto;border:1px solid rgba(34,197,94,.3);border-radius:18px;background:var(--wb-surface,#10141d);color:var(--wb-text,#f8fafc);box-shadow:0 24px 90px rgba(0,0,0,.38);font:13px/1.45 system-ui,sans-serif}',
      '#' + PANEL_ID + '[data-settings-hosted="true"]{position:relative;right:auto;top:auto;width:100%;max-height:none;z-index:auto;box-shadow:none;border-radius:8px;background:#101418}',
      '#' + PANEL_ID + ' *{box-sizing:border-box}',
      '.h2oLibSyncHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid rgba(148,163,184,.22)}',
      '.h2oLibSyncKicker{margin:0 0 4px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.08em}',
      '.h2oLibSyncTitle{margin:0;font-size:20px;line-height:1.15}',
      '.h2oLibSyncNote{margin:7px 0 0;color:#94a3b8;font-size:12px;line-height:1.45}',
      '.h2oLibSyncControls{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}',
      '.h2oLibSyncBtn{border:1px solid rgba(148,163,184,.34);border-radius:12px;background:rgba(148,163,184,.12);color:inherit;padding:9px 12px;font-weight:650;cursor:pointer}',
      '.h2oLibSyncClose{min-width:38px;height:38px;padding:0;border-radius:999px;font-size:18px;line-height:1}',
      '#' + PANEL_ID + '[data-settings-hosted="true"] .h2oLibSyncClose{display:none}',
      '.h2oLibSyncBtn[disabled]{opacity:.55;cursor:not-allowed}',
      '.h2oLibSyncBody{padding:18px 20px 22px}',
      '.h2oLibSyncStatusLine{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}',
      '.h2oLibSyncPill{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;font-weight:800;background:rgba(148,163,184,.14);border:1px solid rgba(148,163,184,.24)}',
      '.h2oLibSyncPill-healthy{background:rgba(34,197,94,.14);border-color:rgba(34,197,94,.35)}',
      '.h2oLibSyncPill-blocked,.h2oLibSyncPill-proof-failed{background:rgba(248,113,113,.14);border-color:rgba(248,113,113,.35)}',
      '.h2oLibSyncPill-warning,.h2oLibSyncPill-proof-stale,.h2oLibSyncPill-pending-review,.h2oLibSyncPill-partial-migration,.h2oLibSyncPill-cache-drift-detected{background:rgba(251,191,36,.14);border-color:rgba(251,191,36,.35)}',
      '.h2oLibSyncMuted{color:#94a3b8}',
      '.h2oLibSyncGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:10px 0}',
      '.h2oLibSyncGridWide{grid-template-columns:repeat(4,minmax(0,1fr))}',
      '.h2oLibSyncMetric,.h2oLibSyncCard{border:1px solid rgba(148,163,184,.22);border-radius:14px;padding:11px;background:rgba(148,163,184,.07)}',
      '.h2oLibSyncValue{display:block;font-size:18px;font-weight:850;line-height:1.1;word-break:break-word}',
      '.h2oLibSyncLabel{display:block;color:#94a3b8;font-size:12px;margin-top:4px;text-transform:capitalize}',
      '.h2oLibSyncSection{border:1px solid rgba(148,163,184,.22);border-radius:16px;margin:10px 0;background:rgba(148,163,184,.05);padding:12px 14px}',
      '.h2oLibSyncSection h3{margin:0 0 8px;font-size:15px}',
      '.h2oLibSyncCards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}',
      '.h2oLibSyncCardTitle{font-weight:800}',
      '.h2oLibSyncCardStatus{margin-top:7px;font-size:18px;font-weight:850}',
      '.h2oLibSyncCardStatus.isOk,.h2oLibSyncMetric.isOk .h2oLibSyncValue{color:#86efac}',
      '.h2oLibSyncCardStatus.isWarn,.h2oLibSyncMetric.isBad .h2oLibSyncValue{color:#fca5a5}',
      '.h2oLibSyncDetails{margin:8px 0;color:#cbd5e1}',
      '.h2oLibSyncDetails summary{cursor:pointer;font-weight:750}',
      '.h2oLibSyncDetails ul{margin:8px 0 0;padding-left:18px;display:grid;gap:4px}',
      '.h2oLibSyncDetails code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:#cbd5e1}',
      '.h2oLibSyncLaneRows{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}',
      '.h2oLibSyncLaneRow{border:1px solid rgba(148,163,184,.2);border-radius:13px;background:rgba(15,23,42,.34);padding:9px 10px}',
      '.h2oLibSyncLaneRow summary{cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;font-weight:800}',
      '.h2oLibSyncLaneTitle{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.h2oLibSyncLaneStatus{border-radius:999px;padding:3px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;background:rgba(148,163,184,.14);border:1px solid rgba(148,163,184,.24)}',
      '.h2oLibSyncLaneRow-pass .h2oLibSyncLaneStatus{color:#86efac;background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.3)}',
      '.h2oLibSyncLaneRow-warning .h2oLibSyncLaneStatus,.h2oLibSyncLaneRow-not-run .h2oLibSyncLaneStatus{color:#fde68a;background:rgba(251,191,36,.12);border-color:rgba(251,191,36,.3)}',
      '.h2oLibSyncLaneRow-fail .h2oLibSyncLaneStatus{color:#fca5a5;background:rgba(248,113,113,.12);border-color:rgba(248,113,113,.3)}',
      '.h2oLibSyncLaneRow code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:#cbd5e1}',
      '@media(max-width:900px){.h2oLibSyncGrid,.h2oLibSyncGridWide,.h2oLibSyncCards,.h2oLibSyncLaneRows{grid-template-columns:repeat(2,minmax(0,1fr))}#' + PANEL_ID + '{right:10px;top:54px;width:calc(100vw - 20px)}}',
      '@media(max-width:640px){.h2oLibSyncLaneRows{grid-template-columns:1fr}}'
    ].join('\n');
    document.head.appendChild(style);
  }
  function render() {
    var panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    var api = apiPresence();
    var status = statusState();
    var message = state.message ? '<p class="h2oLibSyncNote">' + escapeHtml(state.message) + '</p>' : '';
    panel.innerHTML =
      '<div class="h2oLibSyncHeader">' +
      '<div><p class="h2oLibSyncKicker">F15.10.b · read-only</p>' +
      '<h2 class="h2oLibSyncTitle">Library Sync Operator Status</h2>' +
      '<p class="h2oLibSyncNote">Settings-hosted proof/status panel for F15 Library Sync. Proofs run only from explicit operator actions. No mutation controls are exposed.</p>' +
      message + '</div>' +
      '<div class="h2oLibSyncControls">' +
      '<button class="h2oLibSyncBtn" id="h2o-library-sync-refresh" type="button" ' + (state.busy ? 'disabled' : '') + '>Refresh</button>' +
      '<button class="h2oLibSyncBtn" id="h2o-library-sync-run-closure" type="button" ' + (state.busy ? 'disabled' : '') + '>Run Closure Proof</button>' +
      '<button class="h2oLibSyncBtn" id="h2o-library-sync-run-e2e" type="button" ' + (state.busy ? 'disabled' : '') + '>Run End-to-End Proof</button>' +
      '<button class="h2oLibSyncBtn" id="h2o-library-sync-copy-report" type="button" ' + (state.busy ? 'disabled' : '') + '>Copy Report</button>' +
      '<button class="h2oLibSyncBtn h2oLibSyncClose" id="h2o-library-sync-close" type="button" aria-label="Close">x</button>' +
      '</div></div>' +
      '<div class="h2oLibSyncBody">' +
      section('Proof Status', renderProofStatus()) +
      section('Summary Cards', '<div class="h2oLibSyncCards">' +
        renderSummaryCard('Catalog Lane', laneSummary('catalog')) +
        renderSummaryCard('Binding Lane', laneSummary('binding')) +
        renderSummaryCard('Store Cutover', laneSummary('storeCutover')) +
        renderSummaryCard('Bulk Migration', laneSummary('bulkMigration')) +
        '</div>') +
      section('Catalog Lane Details', renderLaneDetails('catalog', CATALOG_LANE_CASES)) +
      section('Binding Lane Details', renderLaneDetails('binding', BINDING_LANE_CASES)) +
      section('Privacy', renderPrivacy()) +
      section('Side Effects', renderSideEffects()) +
      section('Blockers / Warnings', renderBlockersWarnings()) +
      section('Report', renderReport()) +
      (!api.ok ? section('API Presence', codeBlock('Missing APIs', api.missing)) : '') +
      '<p class="h2oLibSyncNote">Status: ' + escapeHtml(status.key) + ' · ' + escapeHtml(status.reason) + '</p>' +
      '</div>';
    bindEvents();
  }
  function forbiddenButtonLabelCheck() {
    var panel = document.getElementById(PANEL_ID);
    var labels = asArray(panel && panel.querySelectorAll ? panel.querySelectorAll('button') : []).map(function (button) {
      return cleanLower(button.textContent);
    });
    return {
      ok: !labels.some(function (label) {
        return FORBIDDEN_BUTTON_LABELS.some(function (forbidden) { return label === forbidden; });
      }),
      labels: labels
    };
  }
  function closePanel() {
    var panel = document.getElementById(PANEL_ID);
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    state.open = false;
  }
  function bindEvents() {
    var refresh = document.getElementById('h2o-library-sync-refresh');
    if (refresh) refresh.onclick = function () { refreshLibrarySyncOperatorPanel(); };
    var closure = document.getElementById('h2o-library-sync-run-closure');
    if (closure) closure.onclick = function () { refreshLibrarySyncOperatorPanel({ runClosureProof: true }); };
    var e2e = document.getElementById('h2o-library-sync-run-e2e');
    if (e2e) e2e.onclick = function () { refreshLibrarySyncOperatorPanel({ runEndToEndProof: true }); };
    var copy = document.getElementById('h2o-library-sync-copy-report');
    if (copy) copy.onclick = function () { copyLibrarySyncProofReport().then(function (result) {
      state.message = result.ok ? 'Copied redacted report ' + nowIsoSeconds() + '.' : 'Report copy unavailable; returned report string.';
      render();
    }); };
    var close = document.getElementById('h2o-library-sync-close');
    if (close) close.onclick = closePanel;
  }
  async function runProof(kind) {
    var sync = H2O.Desktop.Sync || {};
    if (kind === 'closure') {
      if (typeof sync.runLibrarySyncClosureProof !== 'function') return { ok: false, blockers: ['library-sync-closure-proof-unavailable'], warnings: [] };
      return await sync.runLibrarySyncClosureProof();
    }
    if (typeof sync.runLibraryEndToEndSyncProof !== 'function') return { ok: false, blockers: ['library-sync-e2e-proof-unavailable'], warnings: [] };
    return await sync.runLibraryEndToEndSyncProof();
  }
  async function refreshLibrarySyncOperatorPanel(options) {
    var opts = safeObject(options);
    var result = {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: true,
      panelRefreshed: true,
      routeRendered: state.settingsHosted === true,
      proofRan: false,
      status: statusState(),
      blockers: [],
      warnings: [],
      rawLeakCheck: { ok: true, matches: [] }
    };
    if (opts.runClosureProof || opts.runEndToEndProof) {
      state.busy = true;
      state.message = opts.runClosureProof ? 'Running closure proof...' : 'Running end-to-end proof...';
      render();
      try {
        var kind = opts.runClosureProof ? 'closure' : 'end-to-end';
        var proof = await runProof(kind);
        if (kind === 'closure') state.lastClosure = proof;
        else state.lastE2E = proof;
        state.lastProofKind = kind;
        state.lastRunAtIso = nowIsoSeconds();
        state.message = (proof && proof.ok === true ? 'Proof completed.' : 'Proof completed with blockers.') + ' ' + state.lastRunAtIso;
        result.proofRan = true;
        result.proofOk = proof && proof.ok === true;
      } catch (e) {
        result.ok = false;
        result.blockers = ['library-sync-proof-run-failed'];
        result.warnings = [cleanString(e && (e.message || e))];
        state.message = 'Proof failed: ' + cleanString(e && (e.message || e));
      } finally {
        state.busy = false;
      }
    } else {
      state.message = latestProof() ? 'Refreshed latest in-memory proof state.' : 'Not run this session.';
    }
    var report = buildReport();
    result.status = statusState();
    result.rawLeakCheck = rawLeakCheck(report);
    result.forbiddenButtonLabels = forbiddenButtonLabelCheck();
    result.sideEffectSummary = sideEffectSummary();
    if (!result.rawLeakCheck.ok) result.blockers.push('library-sync-ui-report-privacy-failed');
    if (!result.forbiddenButtonLabels.ok) result.blockers.push('library-sync-ui-forbidden-button-label');
    result.ok = result.ok !== false && result.blockers.length === 0;
    render();
    return result;
  }
  function ensurePanel(options) {
    injectStyle();
    var opts = safeObject(options);
    var panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-label', 'Library Sync Operator Status');
      document.body.appendChild(panel);
    }
    if (opts.settingsHosted === true) {
      panel.setAttribute('data-settings-hosted', 'true');
      state.settingsHosted = true;
    } else {
      panel.removeAttribute('data-settings-hosted');
      state.settingsHosted = false;
    }
    state.open = true;
    return panel;
  }
  async function openLibrarySyncOperatorPanel(options) {
    ensurePanel(options);
    state.message = latestProof() ? 'Showing latest in-memory proof state.' : 'Not run this session.';
    render();
    return await refreshLibrarySyncOperatorPanel();
  }
  async function copyLibrarySyncProofReport() {
    var report = buildReport();
    var reportText = JSON.stringify(report, null, 2);
    var leak = rawLeakCheck(report);
    var result = {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: leak.ok === true,
      copied: false,
      reportText: reportText,
      rawLeakCheck: leak,
      blockers: leak.ok ? [] : ['library-sync-ui-report-privacy-failed'],
      warnings: []
    };
    if (!result.ok) return result;
    try {
      if (global.navigator && global.navigator.clipboard && typeof global.navigator.clipboard.writeText === 'function') {
        await global.navigator.clipboard.writeText(reportText);
        result.copied = true;
        state.lastCopiedAtIso = nowIsoSeconds();
      } else {
        result.warnings.push('clipboard-api-unavailable');
      }
    } catch (e) {
      result.warnings.push('clipboard-copy-failed');
      result.copyError = cleanString(e && (e.message || e));
    }
    return result;
  }

  H2O.Desktop.Sync.openLibrarySyncOperatorPanel = openLibrarySyncOperatorPanel;
  H2O.Desktop.Sync.refreshLibrarySyncOperatorPanel = refreshLibrarySyncOperatorPanel;
  H2O.Desktop.Sync.copyLibrarySyncProofReport = copyLibrarySyncProofReport;
  H2O.Desktop.Sync.__librarySyncOperatorUiInstalled = true;
  H2O.Desktop.Sync.__librarySyncOperatorUiVersion = VERSION;
})(typeof window !== 'undefined' ? window : globalThis);
