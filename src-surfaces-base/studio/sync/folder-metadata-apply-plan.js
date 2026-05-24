/* H2O Studio Sync - F7.4.1b folder.metadata color apply plan
 *
 * PURE DRY-RUN HELPER - in-memory only.
 *   - No Tauri invokes, no browser storage access, no fetch, no fs.
 *   - No SQLite access and no persistence.
 *   - No F5 lifecycle calls.
 *   - No F6 conflict queue calls.
 *   - No import/export/folder-sync/peer-transport calls.
 *   - No folder store mutation calls.
 *
 * This helper accepts one selected color/iconColor delta plus caller-provided
 * check booleans and returns a redacted plan. It never applies the change.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.diagnostics = H2O.Studio.diagnostics || {};
  if (H2O.Studio.diagnostics.__folderMetadataApplyPlanInstalled) return;

  var PLAN_SCHEMA = 'h2o.studio.sync.folder-metadata-apply-plan.v0';
  var ENTITY_KIND = 'folder.metadata';
  var VERSION = '0.1.0-f7.4.1b';
  var ALLOWED_FIELDS = Object.freeze({
    color: true,
    iconColor: true
  });
  var ALLOWED_FIELD_LIST = Object.freeze(['color', 'iconColor']);

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function safeObject(value) {
    return isObject(value) ? value : {};
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function hasOwn(map, key) {
    return Object.prototype.hasOwnProperty.call(map, cleanString(key));
  }

  function blocker(code) {
    return { code: cleanString(code) || 'blocked' };
  }

  function addBlocker(list, code) {
    var normalized = cleanString(code);
    if (!normalized) return;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].code === normalized) return;
    }
    list.push(blocker(normalized));
  }

  function validOptionalReason(reason) {
    if (reason == null || reason === '') return true;
    if (typeof reason !== 'string') return false;
    if (reason.length > 256) return false;
    return !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(reason);
  }

  function makeBase(input) {
    var field = cleanString(input && input.field);
    return {
      schema: PLAN_SCHEMA,
      ok: false,
      dryRun: !!(input && input.dryRun === true),
      redacted: true,
      writesPerformed: 0,
      wouldMutateOnApply: true,
      applyable: false,
      entityKind: ENTITY_KIND,
      allowedFields: ALLOWED_FIELD_LIST.slice(),
      selectedField: field || null,
      checks: {
        targetFolderExists: false,
        baselineHashMatches: false,
        f5BlockersAbsent: false,
        f6BlockersAbsent: false,
        fieldAllowlisted: false
      },
      plannedMutation: {
        type: null,
        rowsWouldUpdate: 0
      },
      blockers: [],
      warnings: []
    };
  }

  function selectedDeltaPresent(value) {
    return isObject(value) && Object.keys(value).length > 0;
  }

  function hashPresent(value) {
    return cleanString(value).length > 0;
  }

  function planBidirectionalFolderMetadataApply(input) {
    var inp = safeObject(input);
    var out = makeBase(inp);
    var checks = safeObject(inp.checks);
    var field = cleanString(inp.field);
    var fieldAllowlisted = hasOwn(ALLOWED_FIELDS, field);

    out.checks.fieldAllowlisted = fieldAllowlisted;
    if (fieldAllowlisted) {
      out.plannedMutation.type = ENTITY_KIND + '.' + field;
    }

    if (inp.dryRun !== true) addBlocker(out.blockers, 'dry-run-required');
    if (inp.entityKind !== ENTITY_KIND) addBlocker(out.blockers, 'unsupported-entity-kind');
    if (!fieldAllowlisted) addBlocker(out.blockers, 'field-not-allowlisted');
    if (!selectedDeltaPresent(inp.selectedDelta)) addBlocker(out.blockers, 'selected-delta-required');
    if (!hashPresent(inp.expectedBaselineHash)) addBlocker(out.blockers, 'expected-baseline-hash-required');
    if (!hashPresent(inp.expectedTargetHash)) addBlocker(out.blockers, 'expected-target-hash-required');
    if (!validOptionalReason(inp.reason)) addBlocker(out.blockers, 'invalid-reason');

    out.checks.targetFolderExists = checks.targetFolderExists === true;
    out.checks.baselineHashMatches = checks.baselineHashMatches === true;
    out.checks.f5BlockersAbsent = checks.f5BlockersAbsent === true;
    out.checks.f6BlockersAbsent = checks.f6BlockersAbsent === true;

    if (checks.targetFolderExists !== true) addBlocker(out.blockers, 'target-folder-not-verified');
    if (checks.baselineHashMatches !== true) addBlocker(out.blockers, 'baseline-hash-not-verified');
    if (checks.f5BlockersAbsent !== true) {
      addBlocker(out.blockers, checks.f5BlockersAbsent === false
        ? 'f5-blocker-present'
        : 'f5-blocker-check-unavailable');
    }
    if (checks.f6BlockersAbsent !== true) {
      addBlocker(out.blockers, checks.f6BlockersAbsent === false
        ? 'f6-blocker-present'
        : 'f6-blocker-check-unavailable');
    }

    out.ok = out.blockers.length === 0;
    out.applyable = out.ok === true;
    if (out.applyable) out.plannedMutation.rowsWouldUpdate = 1;
    return out;
  }

  H2O.Studio.diagnostics.planBidirectionalFolderMetadataApply = planBidirectionalFolderMetadataApply;
  H2O.Studio.diagnostics.__folderMetadataApplyPlanInstalled = true;
  H2O.Studio.diagnostics.__folderMetadataApplyPlanVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
