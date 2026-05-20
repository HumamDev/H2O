/* H2O Studio Store — Namespace Entry
 *
 * Creates `H2O.Studio.store` with a registration helper for entity modules
 * (highlights.js today; future chats.js, folders.js, etc.). Entities self-
 * register via `H2O.Studio.store.__registerEntity('name', api)` and become
 * available as `H2O.Studio.store.<name>`.
 *
 * Idempotent: re-loading does not overwrite existing entities or the
 * namespace. Safe under double-load.
 *
 * Contract: surfaces/studio/store/README.md and
 * surfaces/studio/STUDIO_STORAGE_CONTRACT.md.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  if (H2O.Studio.store && H2O.Studio.store.__installed) {
    return;
  }

  var BOOT_AT = Date.now();
  var WARNINGS = [];
  var entities = Object.create(null);

  function registerEntity(name, api) {
    var key = String(name || '').trim();
    if (!key || !api || typeof api !== 'object') {
      WARNINGS.push('store.__registerEntity called with invalid arguments');
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(entities, key) && entities[key] !== api) {
      WARNINGS.push('store entity "' + key + '" already registered; not replacing');
      return false;
    }
    entities[key] = api;
    store[key] = api;
    return true;
  }

  function listEntities() { return Object.keys(entities); }

  function diagnose() {
    var names = Object.keys(entities);
    var entityDiagnostics = {};
    for (var i = 0; i < names.length; i += 1) {
      var n = names[i];
      var e = entities[n];
      if (e && typeof e.diagnose === 'function') {
        try { entityDiagnostics[n] = e.diagnose(); }
        catch (err) { entityDiagnostics[n] = { error: String(err && err.message || err) }; }
      } else {
        entityDiagnostics[n] = { error: 'no diagnose() exposed' };
      }
    }
    return {
      version: '0.1.0',
      bootedAt: BOOT_AT,
      ageMs: Date.now() - BOOT_AT,
      entities: names,
      entityDiagnostics: entityDiagnostics,
      warnings: WARNINGS.slice(),
    };
  }

  var store = {
    __installed: true,
    __version: '0.1.0',
    __registerEntity: registerEntity,
    __warn: function (msg) { WARNINGS.push(String(msg)); },
    listEntities: listEntities,
    diagnose: diagnose,
  };

  H2O.Studio.store = store;
})(typeof window !== 'undefined' ? window : globalThis);
