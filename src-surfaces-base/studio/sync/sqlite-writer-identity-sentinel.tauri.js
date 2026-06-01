/* H2O Desktop Sync - F15.8.f SQLite writer identity sentinel facade
 *
 * Thin JS facade over Rust's SQLite-visible writer identity command. This
 * module does not mutate store state by itself; callers provide explicit SQL
 * statements and an allowed identity. SQLite triggers enforce the identity.
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
  if (H2O.Desktop.Sync.__sqliteWriterIdentitySentinelInstalled) return;

  var VERSION = '0.1.0-f15.8.f';
  var SETTLEMENT_IDENTITY = 'f15.execute-settlement-writer';
  var BULK_MIGRATION_IDENTITY = 'f15.bulk-migration';
  var DEBUG_BYPASS_IDENTITY = 'f15.debug-bypass';
  var EMERGENCY_REPAIR_IDENTITY = 'f15.emergency-repair';

  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }

  function getInvoke() {
    try {
      var internals = global.__TAURI_INTERNALS__;
      if (internals && typeof internals.invoke === 'function') return internals.invoke.bind(internals);
    } catch (_) { /* ignore */ }
    try {
      var tauri = global.__TAURI__;
      if (tauri && tauri.core && typeof tauri.core.invoke === 'function') return tauri.core.invoke.bind(tauri.core);
      if (tauri && typeof tauri.invoke === 'function') return tauri.invoke.bind(tauri);
    } catch (_) { /* ignore */ }
    return null;
  }

  function normalizeStatement(statement) {
    var s = safeObject(statement);
    return {
      query: cleanString(s.query || s.sql),
      values: asArray(s.values)
    };
  }

  async function executeAuthorizedSqlite(input) {
    var args = safeObject(input);
    var invoke = getInvoke();
    if (!invoke) {
      return {
        ok: false,
        executed: false,
        sqliteSentinelUsed: false,
        blockers: ['sqlite-writer-identity-invoke-unavailable'],
        warnings: []
      };
    }
    var statements = asArray(args.statements).map(normalizeStatement).filter(function (s) {
      return !!s.query;
    });
    if (!statements.length && (args.query || args.sql)) {
      statements = [normalizeStatement(args)];
    }
    if (!statements.length) {
      return {
        ok: false,
        executed: false,
        sqliteSentinelUsed: false,
        blockers: ['sqlite-authorized-statements-required'],
        warnings: []
      };
    }
    try {
      return await invoke('f15_authorized_sqlite_execute', {
        payload: {
          identity: cleanString(args.identity) || SETTLEMENT_IDENTITY,
          statements: statements,
          bulkMigrationEnabled: args.bulkMigrationEnabled === true,
          debugBypassToken: cleanString(args.debugBypassToken) || null,
          emergencyRepairToken: cleanString(args.emergencyRepairToken) || null,
          reason: cleanString(args.reason) || null
        }
      });
    } catch (err) {
      return {
        ok: false,
        executed: false,
        sqliteSentinelUsed: false,
        blockers: ['sqlite-authorized-execute-failed'],
        warnings: [String(err && err.message || err)]
      };
    }
  }

  async function executeSettlementSqlite(statements, options) {
    return await executeAuthorizedSqlite(Object.assign({}, safeObject(options), {
      identity: SETTLEMENT_IDENTITY,
      statements: statements
    }));
  }

  async function withSQLiteWriterIdentity(identity, fn, options) {
    if (typeof fn !== 'function') {
      return {
        ok: false,
        executed: false,
        blockers: ['sqlite-writer-identity-callback-required'],
        warnings: []
      };
    }
    var id = cleanString(identity) || SETTLEMENT_IDENTITY;
    var context = {
      identity: id,
      execute: function (query, values, statementOptions) {
        return executeAuthorizedSqlite(Object.assign({}, safeObject(options), safeObject(statementOptions), {
          identity: id,
          statements: [{ query: query, values: values || [] }]
        }));
      },
      executeBatch: function (statements, statementOptions) {
        return executeAuthorizedSqlite(Object.assign({}, safeObject(options), safeObject(statementOptions), {
          identity: id,
          statements: statements
        }));
      }
    };
    return await fn(context);
  }

  async function proveSQLiteWriterIdentitySentinel() {
    var invoke = getInvoke();
    if (!invoke) {
      return {
        ok: false,
        blockers: ['sqlite-writer-identity-invoke-unavailable'],
        warnings: []
      };
    }
    return await invoke('f15_prove_sqlite_writer_identity_sentinel', {});
  }

  H2O.Desktop.Sync.executeAuthorizedSqlite = executeAuthorizedSqlite;
  H2O.Desktop.Sync.executeSettlementSqlite = executeSettlementSqlite;
  H2O.Desktop.Sync.withSQLiteWriterIdentity = withSQLiteWriterIdentity;
  H2O.Desktop.Sync.proveSQLiteWriterIdentitySentinel = proveSQLiteWriterIdentitySentinel;
  H2O.Desktop.Sync.__sqliteWriterIdentitySentinelInstalled = true;
  H2O.Desktop.Sync.__sqliteWriterIdentitySentinelVersion = VERSION;
  H2O.Desktop.Sync.__f15CutoverInstalled = true;
  H2O.Desktop.Sync.__f15CutoverVersion = VERSION;
  H2O.Desktop.Sync.__f15CutoverAllowedWriterIdentities = [
    SETTLEMENT_IDENTITY,
    BULK_MIGRATION_IDENTITY,
    DEBUG_BYPASS_IDENTITY,
    EMERGENCY_REPAIR_IDENTITY
  ];
})(typeof window !== 'undefined' ? window : globalThis);
