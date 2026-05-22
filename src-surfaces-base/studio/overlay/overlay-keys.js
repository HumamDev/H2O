/* H2O Studio — Overlay Keys (Phase 2a)
 *
 * Frozen constants for the Studio edit-overlay subsystem. Passive: loading
 * this file only attaches constant namespaces under H2O.Studio.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  if (H2O.Studio.OverlayKeys && H2O.Studio.OverlayEvents
    && H2O.Studio.OverlayOpTypes && H2O.Studio.OverlayTargets) {
    return;
  }

  var VERSION = '0.1.0-phase-2a';
  var SCHEMA_VERSION = 1;
  var KEY_PREFIX = 'h2o:studio:edit-overlay:v1:';

  var OverlayKeys = Object.freeze({
    version: VERSION,
    schemaVersion: SCHEMA_VERSION,
    prefix: KEY_PREFIX,
    index: KEY_PREFIX + 'index',
    record: function record(snapshotId) {
      return KEY_PREFIX + encodeURIComponent(String(snapshotId || ''));
    },
  });

  var OverlayEvents = Object.freeze({
    ready: 'evt:h2o:studio:overlay:ready',
    changed: 'evt:h2o:studio:overlay:changed',
    removed: 'evt:h2o:studio:overlay:removed',
    driftDetected: 'evt:h2o:studio:overlay:drift-detected',
    applySkipped: 'evt:h2o:studio:overlay:apply-skipped',
  });

  var OverlayOpTypes = Object.freeze({
    heading: 'heading',
    quote: 'quote',
    codeBlock: 'code-block',
    callout: 'callout',
    cleanSpacing: 'clean-spacing',
    section: 'section',
    divider: 'divider',
    toc: 'toc',
  });

  var OverlayTargets = Object.freeze({
    message: 'message',
    section: 'section',
    betweenTurns: 'between-turns',
    snapshot: 'snapshot',
  });

  function selfCheck() {
    return {
      ok: true,
      version: VERSION,
      schemaVersion: SCHEMA_VERSION,
      keyPrefix: KEY_PREFIX,
      eventCount: Object.keys(OverlayEvents).length,
      opTypeCount: Object.keys(OverlayOpTypes).length,
      targetCount: Object.keys(OverlayTargets).length,
    };
  }

  H2O.Studio.OverlayKeys = OverlayKeys;
  H2O.Studio.OverlayEvents = OverlayEvents;
  H2O.Studio.OverlayOpTypes = OverlayOpTypes;
  H2O.Studio.OverlayTargets = OverlayTargets;
  H2O.Studio.OverlayKeysSelfCheck = selfCheck;
})(globalThis);
