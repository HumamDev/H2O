/* H2O Studio Sync - F8.2 remote apply-event preview
 *
 * PURE PREVIEW HELPER - read-only, in-memory, no IO.
 *   - No Tauri invokes, no browser storage access, no fetch, no fs.
 *   - No SQLite access and no persistence.
 *   - No import/export mutation.
 *   - No Chrome storage mutation.
 *   - No F5 lifecycle calls.
 *   - No F6 conflict queue calls or ingestion.
 *   - No F7 apply calls.
 *
 * This helper validates redacted syncApplyEvents evidence from an exported
 * bundle and returns counts only by default. It never applies a remote change.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.diagnostics = H2O.Studio.diagnostics || {};
  if (H2O.Studio.diagnostics.__remoteApplyEventPreviewInstalled) return;

  var REPORT_SCHEMA = 'h2o.studio.sync.remote-apply-propagation-preview.v0';
  var APPLY_EVENTS_SCHEMA = 'h2o.studio.sync.apply-events.v0';
  var APPLY_EVENT_SCHEMA = 'h2o.studio.sync.apply-event.v0';
  var OPERATION = 'folder-metadata-color-apply';
  var ENTITY_KIND = 'folder.metadata';
  var POLICY_VERSION = 'h2o.studio.sync.folder-metadata-apply.v0';
  var DEFAULT_SAMPLE_LIMIT = 20;
  var MAX_SAMPLE_LIMIT = 50;
  var VERSION = '0.1.0-f8.2';

  var SENSITIVE_FIELD_NAMES = Object.freeze({
    folderid: true,
    folder_id: true,
    foldername: true,
    name: true,
    parentid: true,
    parent_id: true,
    color: true,
    rawcolor: true,
    peerid: true,
    beforehash: true,
    afterhash: true,
    auditid: true,
    resultjson: true,
    rawjson: true,
    metadata: true,
    conflictid: true,
    tombstoneid: true,
    content: true
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

  function normalizeKey(value) {
    return cleanString(value).replace(/[^A-Za-z0-9_]/g, '').toLowerCase();
  }

  function hasOwn(map, key) {
    return Object.prototype.hasOwnProperty.call(map, cleanString(key));
  }

  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized) return;
    for (var i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].code === normalized) return;
    }
    list.push({ code: normalized });
  }

  function increment(map, key) {
    var safeKey = cleanString(key) || 'unknown';
    map[safeKey] = Number(map[safeKey] || 0) + 1;
  }

  function safeWarningCodes(warnings) {
    var out = [];
    asArray(warnings).forEach(function (warning) {
      var code = cleanString(isObject(warning) ? warning.code : warning);
      if (/^[A-Za-z0-9._:-]{1,120}$/.test(code)) addCode(out, code);
    });
    return out;
  }

  function parseOptions(input) {
    var root = safeObject(input);
    var opts = isObject(root.options) ? root.options : root;
    var limit = Number(opts.eventSampleLimit);
    if (!Number.isFinite(limit) || limit < 0) limit = DEFAULT_SAMPLE_LIMIT;
    limit = Math.min(Math.floor(limit), MAX_SAMPLE_LIMIT);
    return {
      includeEventSamples: opts.includeEventSamples === true,
      eventSampleLimit: limit
    };
  }

  function makeReport(options) {
    var sourceApplyEvents = {
      available: false,
      total: 0,
      valid: 0,
      unsupported: 0,
      malformed: 0,
      duplicate: 0,
      capped: false
    };
    if (options.includeEventSamples) sourceApplyEvents.samples = [];

    return {
      schema: REPORT_SCHEMA,
      ok: true,
      dryRun: true,
      redacted: true,
      writesPerformed: 0,
      sourceApplyEvents: sourceApplyEvents,
      proposedRemoteApplies: {
        total: 0,
        blocked: 0,
        byEntityKind: {},
        byOperation: {}
      },
      conflictCandidates: {
        total: 0,
        byKind: {},
        bySeverity: {}
      },
      tombstoneReferences: {
        total: 0,
        deleteVsEditOwnedByF5: 0
      },
      blockers: [],
      warnings: []
    };
  }

  function fieldsAreColorOnly(fields) {
    var values = asArray(fields).map(function (field) {
      return cleanString(field);
    }).filter(Boolean);
    return values.length === 1 && values[0] === 'color';
  }

  function eventDigestSafe(value) {
    return /^sha256:[a-f0-9]{64}$/i.test(cleanString(value));
  }

  function findSensitiveField(value) {
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) {
        var nestedArrayHit = findSensitiveField(value[i]);
        if (nestedArrayHit) return nestedArrayHit;
      }
      return '';
    }
    if (!isObject(value)) return '';
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k += 1) {
      var key = keys[k];
      var normalized = normalizeKey(key);
      if (hasOwn(SENSITIVE_FIELD_NAMES, normalized)) return key;
      var nestedHit = findSensitiveField(value[key]);
      if (nestedHit) return nestedHit;
    }
    return '';
  }

  function validateApplyEvent(event) {
    if (!isObject(event)) return { ok: false, category: 'malformed', code: 'apply-event-malformed' };
    if (findSensitiveField(event)) {
      return { ok: false, category: 'unsupported', code: 'apply-event-sensitive-field-rejected' };
    }
    if (cleanString(event.schema) !== APPLY_EVENT_SCHEMA) {
      return { ok: false, category: 'unsupported', code: 'apply-event-schema-unsupported' };
    }
    if (cleanString(event.operation) !== OPERATION) {
      return { ok: false, category: 'unsupported', code: 'apply-event-operation-unsupported' };
    }
    if (cleanString(event.entityKind) !== ENTITY_KIND) {
      return { ok: false, category: 'unsupported', code: 'apply-event-entity-kind-unsupported' };
    }
    if (!fieldsAreColorOnly(event.fieldsUpdated)) {
      return { ok: false, category: 'unsupported', code: 'apply-event-field-unsupported' };
    }
    if (cleanString(event.policyVersion) !== POLICY_VERSION) {
      return { ok: false, category: 'unsupported', code: 'apply-event-policy-unsupported' };
    }
    if (event.redacted !== true) {
      return { ok: false, category: 'unsupported', code: 'apply-event-not-redacted' };
    }
    if (event.auditRecorded !== true) {
      return { ok: false, category: 'malformed', code: 'apply-event-audit-missing' };
    }
    if (!eventDigestSafe(event.eventDigest)) {
      return { ok: false, category: 'malformed', code: 'apply-event-digest-invalid' };
    }
    return { ok: true, code: '' };
  }

  function makeSample(event, duplicate) {
    return {
      schema: APPLY_EVENT_SCHEMA,
      operation: OPERATION,
      entityKind: ENTITY_KIND,
      fieldsUpdated: ['color'],
      policyVersion: POLICY_VERSION,
      eventDigestPresent: !!cleanString(event && event.eventDigest),
      duplicate: duplicate === true,
      targetResolution: 'target-handle-unavailable'
    };
  }

  function addSample(report, options, event, duplicate) {
    if (!options.includeEventSamples) return;
    var samples = report.sourceApplyEvents.samples;
    if (!Array.isArray(samples) || samples.length >= options.eventSampleLimit) return;
    samples.push(makeSample(event, duplicate));
  }

  function markTargetUnavailable(report) {
    addCode(report.blockers, 'target-handle-unavailable');
    addCode(report.warnings, 'target-resolution-not-implemented');
  }

  function previewRemoteApplyEvents(input) {
    var options = parseOptions(input);
    var report = makeReport(options);
    var root = safeObject(input);
    var bundle = isObject(root.bundle) ? root.bundle : root;
    var syncApplyEvents = bundle && bundle.syncApplyEvents;

    if (!isObject(syncApplyEvents)) {
      addCode(report.warnings, 'sync-apply-events-missing');
      return report;
    }

    report.sourceApplyEvents.available = syncApplyEvents.available === true;
    report.sourceApplyEvents.total = Number(syncApplyEvents.total) || 0;
    report.sourceApplyEvents.capped = syncApplyEvents.capped === true;

    safeWarningCodes(syncApplyEvents.warnings).forEach(function (warning) {
      addCode(report.warnings, warning.code);
    });

    if (cleanString(syncApplyEvents.schema) !== APPLY_EVENTS_SCHEMA) {
      report.sourceApplyEvents.available = false;
      addCode(report.warnings, 'sync-apply-events-schema-unsupported');
      return report;
    }

    if (syncApplyEvents.available !== true) {
      addCode(report.warnings, 'sync-apply-events-unavailable');
      return report;
    }

    if (!Array.isArray(syncApplyEvents.events)) {
      report.sourceApplyEvents.malformed += 1;
      addCode(report.warnings, 'sync-apply-events-events-malformed');
      return report;
    }

    var seenDigests = Object.create(null);
    var events = syncApplyEvents.events;
    if (!Number.isFinite(Number(syncApplyEvents.total)) || Number(syncApplyEvents.total) < events.length) {
      report.sourceApplyEvents.total = events.length;
    }

    for (var i = 0; i < events.length; i += 1) {
      var event = events[i];
      var validation = validateApplyEvent(event);
      if (!validation.ok) {
        if (validation.category === 'malformed') report.sourceApplyEvents.malformed += 1;
        else report.sourceApplyEvents.unsupported += 1;
        addCode(report.warnings, validation.code);
        continue;
      }

      var digest = cleanString(event.eventDigest);
      if (seenDigests[digest]) {
        report.sourceApplyEvents.duplicate += 1;
        addSample(report, options, event, true);
        continue;
      }
      seenDigests[digest] = true;

      report.sourceApplyEvents.valid += 1;
      report.proposedRemoteApplies.total += 1;
      report.proposedRemoteApplies.blocked += 1;
      increment(report.proposedRemoteApplies.byEntityKind, ENTITY_KIND);
      increment(report.proposedRemoteApplies.byOperation, OPERATION);
      addSample(report, options, event, false);
      markTargetUnavailable(report);
    }

    if (report.sourceApplyEvents.capped) addCode(report.warnings, 'sync-apply-events-capped');
    return report;
  }

  H2O.Studio.diagnostics.previewRemoteApplyEvents = previewRemoteApplyEvents;
  H2O.Studio.diagnostics.__remoteApplyEventPreviewInstalled = true;
  H2O.Studio.diagnostics.__remoteApplyEventPreviewVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
