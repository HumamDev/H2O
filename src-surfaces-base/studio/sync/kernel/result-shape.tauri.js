/* H2O Desktop Sync Kernel - F14.2.4 result shape primitive
 *
 * Desktop/Tauri L0 primitive only.
 *
 * Safety invariants:
 *   - Shapes result objects and derives ok/actionable only from caller-provided
 *     blockers/warnings/metadata.
 *   - No domain policy decisions, storage reads/writes, publication, replay,
 *     watermark, relay, WebDAV, polling, timers, apply, convergence, or mobile
 *     behavior.
 *   - Existing domain lanes are not wired to this module in F14.2.4, so their
 *     output remains unchanged.
 *
 * Public API:
 *   H2O.Desktop.Sync.kernel.calculateOk(input)
 *   H2O.Desktop.Sync.kernel.calculateActionable(input)
 *   H2O.Desktop.Sync.kernel.createResult(input)
 *   H2O.Desktop.Sync.kernel.createSuccessResult(input)
 *   H2O.Desktop.Sync.kernel.createFailureResult(input)
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
  if (kernel.__resultShapeInstalled) return;

  var VERSION = '0.1.0-f14.2.4';
  var DEFAULT_SCHEMA = 'h2o.desktop.sync.kernel.result.v1';

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

  function normalizeBlockers(value) {
    if (typeof kernel.normalizeBlockers === 'function') return kernel.normalizeBlockers(value);
    return asArray(value).map(function (item) {
      return isObject(item) ? item : { code: cleanString(item), category: 'unknown', severity: 'blocker', metadata: {} };
    }).filter(function (item) { return !!cleanString(item.code); });
  }

  function normalizeWarnings(value) {
    if (typeof kernel.normalizeWarnings === 'function') return kernel.normalizeWarnings(value);
    return asArray(value).map(function (item) {
      return isObject(item) ? item : { code: cleanString(item), category: 'unknown', severity: 'warning', metadata: {} };
    }).filter(function (item) { return !!cleanString(item.code); });
  }

  function codeList(entries) {
    return asArray(entries).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean).filter(function (code, index, arr) {
      return arr.indexOf(code) === index;
    });
  }

  function calculateOk(input) {
    var value = safeObject(input);
    if (typeof value.ok === 'boolean') return value.ok;
    return normalizeBlockers(value.blockers).length === 0;
  }

  function calculateActionable(input) {
    var value = safeObject(input);
    if (typeof value.actionable === 'boolean') return value.actionable;
    if (calculateOk(value) !== true) return false;
    if (value.actionableWhenOk === false) return false;
    return true;
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

  function mergeExtra(target, extra) {
    if (!isObject(extra)) return target;
    Object.keys(extra).forEach(function (key) {
      if (key === 'schema' ||
        key === 'ok' ||
        key === 'actionable' ||
        key === 'blockers' ||
        key === 'warnings' ||
        key === 'blockerDetails' ||
        key === 'warningDetails' ||
        key === 'metadata') {
        return;
      }
      target[key] = extra[key];
    });
    return target;
  }

  function createResult(input) {
    var value = safeObject(input);
    var blockerDetails = normalizeBlockers(value.blockers);
    var warningDetails = normalizeWarnings(value.warnings);
    var result = {
      schema: cleanString(value.schema) || DEFAULT_SCHEMA,
      ok: calculateOk({ ok: value.ok, blockers: blockerDetails }),
      actionable: false,
      blockers: codeList(blockerDetails),
      warnings: codeList(warningDetails),
      blockerDetails: blockerDetails,
      warningDetails: warningDetails,
      metadata: normalizeMetadata(value.metadata || value.domainMetadata)
    };
    result.actionable = calculateActionable({
      actionable: value.actionable,
      actionableWhenOk: value.actionableWhenOk,
      ok: result.ok,
      blockers: blockerDetails
    });
    return mergeExtra(result, value.extra);
  }

  function createSuccessResult(input) {
    var value = safeObject(input);
    return createResult(Object.assign({}, value, {
      ok: true,
      actionable: typeof value.actionable === 'boolean' ? value.actionable : true,
      blockers: []
    }));
  }

  function createFailureResult(input) {
    var value = safeObject(input);
    return createResult(Object.assign({}, value, {
      ok: false,
      actionable: false
    }));
  }

  function assertResultShape(input) {
    var value = safeObject(input);
    var blockers = [];
    if (!cleanString(value.schema)) blockers.push('result-schema-missing');
    if (typeof value.ok !== 'boolean') blockers.push('result-ok-invalid');
    if (typeof value.actionable !== 'boolean') blockers.push('result-actionable-invalid');
    if (!Array.isArray(value.blockers)) blockers.push('result-blockers-invalid');
    if (!Array.isArray(value.warnings)) blockers.push('result-warnings-invalid');
    return {
      schema: DEFAULT_SCHEMA,
      ok: blockers.length === 0,
      actionable: false,
      blockers: blockers,
      warnings: []
    };
  }

  kernel.calculateOk = calculateOk;
  kernel.calculateActionable = calculateActionable;
  kernel.createResult = createResult;
  kernel.createSuccessResult = createSuccessResult;
  kernel.createFailureResult = createFailureResult;
  kernel.assertResultShape = assertResultShape;
  kernel.__resultShapeInstalled = true;
  kernel.__resultShapeVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : window);
