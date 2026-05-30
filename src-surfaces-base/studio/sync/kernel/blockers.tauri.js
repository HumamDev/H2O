/* H2O Desktop Sync Kernel - F14.2.4 blocker vocabulary primitive
 *
 * Desktop/Tauri L0 primitive only.
 *
 * Safety invariants:
 *   - Normalizes blocker/warning shape only.
 *   - No domain policy decisions, storage reads/writes, publication, replay,
 *     watermark, relay, WebDAV, polling, timers, apply, convergence, or mobile
 *     behavior.
 *   - Existing domain lanes are not wired to this module in F14.2.4, so their
 *     output remains unchanged.
 *
 * Public API:
 *   H2O.Desktop.Sync.kernel.createBlocker(input, category?)
 *   H2O.Desktop.Sync.kernel.createWarning(input, category?)
 *   H2O.Desktop.Sync.kernel.normalizeBlockers(value)
 *   H2O.Desktop.Sync.kernel.normalizeWarnings(value)
 *   H2O.Desktop.Sync.kernel.addBlocker(list, input, category?)
 *   H2O.Desktop.Sync.kernel.addWarning(list, input, category?)
 *   H2O.Desktop.Sync.kernel.categorizeBlockers(value)
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
  H2O.Desktop.Sync.kernel = H2O.Desktop.Sync.kernel || {};

  var kernel = H2O.Desktop.Sync.kernel;
  if (kernel.__blockersInstalled) return;

  var VERSION = '0.1.0-f14.2.4';

  var CATEGORIES = [
    'identity',
    'replay',
    'watermark',
    'privacy',
    'ownership',
    'lifecycle',
    'conflict',
    'authority',
    'tombstone',
    'unknown'
  ];

  var CATEGORY_PREFIXES = [
    ['identity', ['identity-', 'peer-', 'subject-']],
    ['replay', ['replay-', 'duplicate-', 'dedupe-', 'expired-', 'stale-']],
    ['watermark', ['watermark-']],
    ['privacy', ['privacy-', 'redaction-', 'forbidden-', 'payload-']],
    ['ownership', ['owner-', 'ownership-', 'handoff-']],
    ['lifecycle', ['lifecycle-', 'status-', 'state-', 'proposal-', 'publication-']],
    ['conflict', ['conflict-', 'f6-']],
    ['authority', ['authority-', 'platform-', 'capability-', 'surface-']],
    ['tombstone', ['tombstone-', 'f5-', 'delete-']]
  ];

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function dedupePush(list, item, keyFn) {
    var key = keyFn(item);
    if (!key) return;
    for (var i = 0; i < list.length; i++) {
      if (keyFn(list[i]) === key) return;
    }
    list.push(item);
  }

  function normalizeCategory(category) {
    var normalized = cleanString(category);
    return CATEGORIES.indexOf(normalized) === -1 ? 'unknown' : normalized;
  }

  function inferCategory(code, fallback) {
    var normalized = cleanString(code);
    for (var i = 0; i < CATEGORY_PREFIXES.length; i++) {
      var category = CATEGORY_PREFIXES[i][0];
      var prefixes = CATEGORY_PREFIXES[i][1];
      for (var j = 0; j < prefixes.length; j++) {
        if (normalized.indexOf(prefixes[j]) === 0) return category;
      }
    }
    return normalizeCategory(fallback);
  }

  function normalizeMetadata(value) {
    if (!isObject(value)) return {};
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      var normalized = cleanString(key);
      if (!normalized) return;
      var item = value[key];
      if (item == null) return;
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        out[normalized] = item;
      }
    });
    return out;
  }

  function normalizeEntry(input, fallbackCategory, severity) {
    var source = isObject(input) ? input : { code: input };
    var code = cleanString(source.code || source.blocker || source.warning || source.id);
    var category = inferCategory(code, source.category || fallbackCategory);
    return {
      code: code,
      category: category,
      severity: severity,
      metadata: normalizeMetadata(source.metadata || source.domainMetadata)
    };
  }

  function createBlocker(input, category) {
    return normalizeEntry(input, category, 'blocker');
  }

  function createWarning(input, category) {
    return normalizeEntry(input, category, 'warning');
  }

  function normalizeBlockers(value) {
    var out = [];
    asArray(value).forEach(function (item) {
      var blocker = createBlocker(item);
      dedupePush(out, blocker, function (entry) { return entry.code + ':' + entry.category; });
    });
    return out.filter(function (entry) { return !!entry.code; });
  }

  function normalizeWarnings(value) {
    var out = [];
    asArray(value).forEach(function (item) {
      var warning = createWarning(item);
      dedupePush(out, warning, function (entry) { return entry.code + ':' + entry.category; });
    });
    return out.filter(function (entry) { return !!entry.code; });
  }

  function addBlocker(list, input, category) {
    if (!Array.isArray(list)) return null;
    var blocker = createBlocker(input, category);
    if (!blocker.code) return null;
    dedupePush(list, blocker, function (entry) { return entry.code + ':' + entry.category; });
    return blocker;
  }

  function addWarning(list, input, category) {
    if (!Array.isArray(list)) return null;
    var warning = createWarning(input, category);
    if (!warning.code) return null;
    dedupePush(list, warning, function (entry) { return entry.code + ':' + entry.category; });
    return warning;
  }

  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean).filter(function (code, index, arr) {
      return arr.indexOf(code) === index;
    });
  }

  function categorizeBlockers(value) {
    var categories = {};
    CATEGORIES.forEach(function (category) { categories[category] = []; });
    normalizeBlockers(value).forEach(function (blocker) {
      categories[blocker.category].push(blocker.code);
    });
    return categories;
  }

  function hasBlockers(value) {
    return normalizeBlockers(value).length > 0;
  }

  kernel.BLOCKER_CATEGORIES = CATEGORIES.slice();
  kernel.createBlocker = createBlocker;
  kernel.createWarning = createWarning;
  kernel.normalizeBlockers = normalizeBlockers;
  kernel.normalizeWarnings = normalizeWarnings;
  kernel.addBlocker = addBlocker;
  kernel.addWarning = addWarning;
  kernel.blockerCodeList = codeList;
  kernel.warningCodeList = codeList;
  kernel.categorizeBlockers = categorizeBlockers;
  kernel.hasBlockers = hasBlockers;
  kernel.__blockersInstalled = true;
  kernel.__blockersVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : window);
