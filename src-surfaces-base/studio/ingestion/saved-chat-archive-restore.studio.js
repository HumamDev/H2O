/* H2O Studio — Saved Chat Archive Restore Original IDs (Desktop, Phase K.2)
 *
 * Verification-gated restore of a `.h2ochat` package under its ORIGINAL chatId
 * and ORIGINAL snapshotId. This is the first restore mode only:
 *
 *   restore-original-ids:
 *     - absent-only
 *     - non-destructive
 *     - no overwrite
 *     - no relink
 *     - no tombstone override/un-delete
 *
 * Public API (H2O.Studio.archiveRestore):
 *   isDesktopCapable() -> boolean
 *   dryRunRestorePackage({ packagePath }) -> Promise<decision>
 *   restoreVerifiedPackage({ packagePath, mode, confirm }) -> Promise<result>
 *
 * The module reuses:
 *   - H2O.Studio.archiveInspector.inspectPackage as the verification gate
 *   - H2O.Studio.archiveImporter.buildTurnsFromPackageSnapshot for portable
 *     package snapshot turns
 *
 * Writes are limited to insert-only rows in chats, snapshots, and
 * snapshot_turns, plus provenance metadata on the inserted rows. Existing rows
 * are never updated. Relink and tombstone override are future phases.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  if (H2O.Studio.archiveRestore && H2O.Studio.archiveRestore.__installed) return;

  var MODULE_VERSION = '0.1.0-phase-k-2';
  var APP_LOCAL_DATA = 15;
  var DB_URL = 'sqlite:studio-v1.db';
  var PACKAGE_ROOT = 'archive/packages';
  var RESTORE_MODE = 'restore-original-ids';
  var SNAPSHOT_READ_CAP = 8 * 1024 * 1024;
  var TURN_INSERT_BATCH_SIZE = 100;

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* swallow */ }
    return false;
  }

  function cleanString(v) { return String(v == null ? '' : v).trim(); }
  function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function safeObject(v) { return isObject(v) ? v : {}; }
  function asArray(v) { return Array.isArray(v) ? v : []; }
  function isFiniteNumber(v) { return typeof v === 'number' && isFinite(v); }

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

  function getInspector() {
    var ins = H2O.Studio && H2O.Studio.archiveInspector;
    return (ins && typeof ins.inspectPackage === 'function') ? ins : null;
  }

  function getImporter() {
    var imp = H2O.Studio && H2O.Studio.archiveImporter;
    return (imp && typeof imp.buildTurnsFromPackageSnapshot === 'function') ? imp : null;
  }

  function getStores() { return (H2O.Studio && H2O.Studio.store) || {}; }
  function getSnapshotsStore() {
    var s = getStores().snapshots;
    return (s && typeof s.get === 'function') ? s : null;
  }
  function getChatsStore() {
    var c = getStores().chats;
    return (c && typeof c.get === 'function') ? c : null;
  }

  function isDesktopCapable() {
    return detectTauri() && !!getInvoke() && !!getInspector() && !!getImporter()
      && !!getSnapshotsStore() && !!getChatsStore();
  }

  function sqlSelect(query, values) {
    var invoke = getInvoke();
    if (!invoke) return Promise.reject(new Error('tauri invoke unavailable'));
    return invoke('plugin:sql|select', { db: DB_URL, query: query, values: values || [] });
  }

  function sqlExecute(query, values) {
    var invoke = getInvoke();
    if (!invoke) return Promise.reject(new Error('tauri invoke unavailable'));
    return invoke('plugin:sql|execute', { db: DB_URL, query: query, values: values || [] });
  }

  function joinPath() {
    var parts = [];
    for (var i = 0; i < arguments.length; i += 1) {
      var part = cleanString(arguments[i]).replace(/^\/+|\/+$/g, '');
      if (part) parts.push(part);
    }
    return parts.join('/');
  }

  function packageDirNameForPath(packagePath) {
    var p = cleanString(packagePath).replace(/[\/\\]+$/g, '');
    var idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return idx >= 0 ? p.slice(idx + 1) : p;
  }

  function packagePathIsScoped(packagePath) {
    var p = cleanString(packagePath).replace(/[\/\\]+$/g, '');
    return p.indexOf(PACKAGE_ROOT + '/') === 0 && /\.h2ochat$/.test(packageDirNameForPath(p));
  }

  function decodeToText(value) {
    if (typeof value === 'string') return value;
    var bytes = value;
    if (value && value.data && (Array.isArray(value.data) || value.data instanceof Uint8Array)) bytes = value.data;
    try {
      var arr = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(asArray(bytes));
      if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(arr);
      var out = ''; for (var i = 0; i < arr.length; i += 1) out += String.fromCharCode(arr[i]);
      return out;
    } catch (_) { return ''; }
  }

  function readPackageTextFile(packagePath, leaf) {
    var invoke = getInvoke();
    if (!invoke) return Promise.reject(new Error('tauri invoke unavailable for fs read_file'));
    if (!packagePathIsScoped(packagePath)) return Promise.reject(new Error('package path not scoped to ' + PACKAGE_ROOT));
    var rel = joinPath(packagePath, leaf);
    return Promise.resolve(invoke('plugin:fs|read_file', { path: rel, options: { baseDir: APP_LOCAL_DATA } }))
      .then(decodeToText);
  }

  function safeParseJson(text) {
    try { var v = JSON.parse(text); return isObject(v) ? v : null; } catch (_) { return null; }
  }

  function readPackageSnapshotJson(packagePath) {
    return readPackageTextFile(packagePath, 'snapshot.json')
      .then(function (t) { return safeParseJson(String(t || '').slice(0, SNAPSHOT_READ_CAP)); }, function () { return null; });
  }

  function snapshotRowId(snap) {
    var s = safeObject(snap);
    return cleanString(s.snapshotId) || cleanString(s.id);
  }

  function getChatIdFromRow(chat) {
    var c = safeObject(chat);
    return cleanString(c.chatId) || cleanString(c.id);
  }

  function contentDigestFromSnapshot(snapshotJson, contentHash) {
    var snap = safeObject(snapshotJson);
    var meta = safeObject(snap.metadata || snap.meta);
    return cleanString(snap.digest) || cleanString(meta.digest) || cleanString(contentHash);
  }

  function packageIdentity(inspection, snapshotJson) {
    var ins = safeObject(inspection);
    var id = safeObject(ins.identity);
    var snap = safeObject(snapshotJson);
    var messages = asArray(snap.messages);
    var contentHash = cleanString(id.contentHash);
    return {
      chatId: cleanString(id.chatId) || cleanString(snap.chatId),
      snapshotId: cleanString(id.snapshotId) || cleanString(snap.snapshotId),
      title: cleanString(snap.title) || cleanString(id.title) || 'Restored chat',
      contentHash: contentHash,
      digest: contentDigestFromSnapshot(snap, contentHash),
      capturedAt: snap.capturedAt == null ? '' : snap.capturedAt,
      messageCount: messages.length || (isFiniteNumber(id.messageCount) ? id.messageCount : 0),
      schemaVersion: id.schemaVersion == null ? null : id.schemaVersion,
      payloadVersion: id.payloadVersion == null ? null : id.payloadVersion,
    };
  }

  function toEpochMillis(value) {
    if (typeof value === 'number' && isFinite(value)) return Math.floor(value);
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
    var parsed = Date.parse(String(value == null ? '' : value));
    return isFinite(parsed) ? parsed : Date.now();
  }

  function existingSnapshotDigest(combined) {
    var snap = safeObject(safeObject(combined).snapshot);
    var meta = safeObject(snap.meta);
    return cleanString(snap.digest) || cleanString(meta.digest) || cleanString(meta.contentHash);
  }

  function nonVerifiedDecision(inspectStatus) {
    var s = cleanString(inspectStatus);
    if (s === 'verified') return null;
    if (s === 'unsupported-version') return 'unsupported-version';
    if (s === 'missing-files' || s === 'hash-mismatch' || s === 'corrupted') return 'corrupted';
    if (s === 'read-error') return 'read-error';
    return 'rejected';
  }

  function baseIdentity() {
    return {
      chatId: '', snapshotId: '', title: '', contentHash: '', digest: '',
      capturedAt: '', messageCount: 0, schemaVersion: null, payloadVersion: null,
    };
  }

  function dryRunResult(packagePath, decision, identity, store, reason, inspectStatus) {
    var ok = decision === 'restore-ready' || decision === 'already-present';
    return {
      ok: ok,
      decision: decision,
      status: decision,
      packagePath: cleanString(packagePath) || null,
      packageDirName: packagePath ? packageDirNameForPath(packagePath) : null,
      mode: RESTORE_MODE,
      mutated: false,
      identity: identity || baseIdentity(),
      store: store || {
        chatExists: false,
        snapshotExists: false,
        chatTombstoned: false,
        digestMatches: false,
      },
      reason: reason || '',
      inspectStatus: cleanString(inspectStatus),
    };
  }

  function actionResult(packagePath, status, dry, restored, reason) {
    return {
      ok: status === 'restored' || status === 'already-present',
      status: status,
      decision: cleanString(dry && dry.decision),
      packagePath: cleanString(packagePath) || null,
      mode: RESTORE_MODE,
      restored: restored || null,
      reason: reason || '',
    };
  }

  function findActiveChatTombstone(chatId) {
    var id = cleanString(chatId);
    if (!id) return Promise.resolve(false);
    return sqlSelect(
      "SELECT 1 AS present FROM sync_tombstones WHERE record_kind = 'chat' AND record_id = ? AND (restored_at IS NULL OR restored_at = '') LIMIT 1",
      [id]
    ).then(function (rows) { return Array.isArray(rows) && rows.length > 0; }, function () { return false; });
  }

  function dryRunRestorePackage(options) {
    var opts = safeObject(options);
    var packagePath = cleanString(opts.packagePath);
    if (!packagePath) return Promise.resolve(dryRunResult(null, 'rejected', null, null, 'no package path', ''));
    if (!isDesktopCapable()) return Promise.resolve(dryRunResult(packagePath, 'rejected', null, null, 'desktop-only', ''));
    if (!packagePathIsScoped(packagePath)) return Promise.resolve(dryRunResult(packagePath, 'rejected', null, null, 'path-not-scoped', ''));

    var inspector = getInspector();
    var snapStore = getSnapshotsStore();
    var chatStore = getChatsStore();
    var inspection = null;
    var snapshotJson = null;

    return Promise.resolve()
      .then(function () { return inspector.inspectPackage({ packagePath: packagePath }); })
      .then(function (res) { inspection = safeObject(res); })
      .then(function () { return readPackageSnapshotJson(packagePath); })
      .then(function (json) { snapshotJson = json; })
      .then(function () {
        var inspectStatus = cleanString(inspection.status);
        var identity = packageIdentity(inspection, snapshotJson);
        var early = nonVerifiedDecision(inspectStatus);
        if (early) return dryRunResult(packagePath, early, identity, null, 'inspector status: ' + inspectStatus, inspectStatus);
        if (!identity.chatId || !identity.snapshotId) {
          return dryRunResult(packagePath, 'rejected', identity, null, 'package identity missing chatId or snapshotId', inspectStatus);
        }
        return Promise.all([
          Promise.resolve(snapStore.get(identity.snapshotId)).catch(function () { return null; }),
          Promise.resolve(chatStore.get(identity.chatId)).catch(function () { return null; }),
          findActiveChatTombstone(identity.chatId),
        ]).then(function (triple) {
          var existingCombined = triple[0];
          var existingChat = triple[1];
          var tombstoned = triple[2] === true || !!(existingChat && existingChat.isDeleted);
          var existingSnap = safeObject(existingCombined).snapshot;
          var snapshotExists = !!snapshotRowId(existingSnap);
          var chatExists = !!getChatIdFromRow(existingChat);
          var store = {
            chatExists: chatExists,
            snapshotExists: snapshotExists,
            chatTombstoned: tombstoned,
            digestMatches: false,
          };
          if (tombstoned) {
            return dryRunResult(packagePath, 'tombstoned', identity, store, 'original chatId is tombstoned; override/un-delete is deferred', inspectStatus);
          }
          if (snapshotExists) {
            var existingDigest = existingSnapshotDigest(existingCombined);
            var expectedDigest = cleanString(identity.digest);
            var digestMatches = !!expectedDigest && !!existingDigest && expectedDigest === existingDigest;
            store.digestMatches = digestMatches;
            if (digestMatches) {
              return dryRunResult(packagePath, 'already-present', identity, store, 'original snapshotId already exists with matching digest', inspectStatus);
            }
            return dryRunResult(packagePath, 'conflict-snapshot-id', identity, store, 'original snapshotId exists with different or unverifiable digest; refusing overwrite', inspectStatus);
          }
          if (chatExists) {
            return dryRunResult(packagePath, 'conflict-chat-id', identity, store, 'original chatId exists; relink/restore-into-existing-chat is deferred', inspectStatus);
          }
          return dryRunResult(packagePath, 'restore-ready', identity, store, 'verified package is absent from the store and not tombstoned', inspectStatus);
        });
      })
      .catch(function (err) {
        return dryRunResult(packagePath, 'read-error', null, null, String((err && err.message) || err || 'dry-run threw'), '');
      });
  }

  function metaJson(meta) {
    try { return JSON.stringify(meta || {}); } catch (_) { return '{}'; }
  }

  function turnMeta(turn) {
    return metaJson(safeObject(turn).meta || {});
  }

  function insertTurns(snapshotId, turns) {
    if (!Array.isArray(turns) || !turns.length) return Promise.resolve(null);
    var chain = Promise.resolve();
    for (var start = 0; start < turns.length; start += TURN_INSERT_BATCH_SIZE) {
      (function (batch, batchStart) {
        chain = chain.then(function () {
          var rowsSql = batch.map(function () { return '(?, ?, ?, ?, ?, ?)'; }).join(', ');
          var vals = [];
          batch.forEach(function (t, idx) {
            var turn = safeObject(t);
            var turnIdx = isFiniteNumber(turn.turnIdx) ? Math.floor(turn.turnIdx) : (batchStart + idx);
            vals.push(snapshotId, turnIdx, cleanString(turn.role) || 'assistant',
              String(turn.outerHtml || ''), String(turn.text || ''), turnMeta(turn));
          });
          return sqlExecute('INSERT INTO snapshot_turns (snapshot_id, turn_idx, role, outer_html, text, meta_json) VALUES ' + rowsSql, vals);
        });
      })(turns.slice(start, start + TURN_INSERT_BATCH_SIZE), start);
    }
    return chain;
  }

  function rollbackQuietly() {
    return sqlExecute('ROLLBACK', []).catch(function () { return null; });
  }

  function insertRestoreRows(packagePath, identity, snapshotJson, turns) {
    var now = Date.now();
    var restoredAt = new Date(now).toISOString();
    var capturedAt = toEpochMillis(identity.capturedAt);
    var provenance = {
      restoredFromPackage: true,
      source: 'h2ochat-package-restore',
      restorer: 'archive-restore-k2',
      mode: RESTORE_MODE,
      originalChatId: identity.chatId,
      originalSnapshotId: identity.snapshotId,
      contentHash: identity.contentHash,
      digest: identity.digest,
      packagePath: packagePath,
      packageDirName: packageDirNameForPath(packagePath),
      originalCapturedAt: identity.capturedAt,
      restoredAt: restoredAt,
    };
    var chatMeta = { restored: provenance };
    var snapshotMeta = Object.assign({}, safeObject(snapshotJson).meta || {}, { restored: provenance });

    return sqlExecute('BEGIN IMMEDIATE', []).then(function () {
      var chatRows = [];
      return sqlSelect('SELECT id FROM snapshots WHERE id = ? LIMIT 1', [identity.snapshotId])
        .then(function (snapshotRows) {
          if (asArray(snapshotRows).length) throw new Error('conflict-snapshot-id');
          return sqlSelect('SELECT id, is_deleted FROM chats WHERE id = ? LIMIT 1', [identity.chatId]);
        }).then(function (rows) {
          chatRows = asArray(rows);
          if (chatRows.length && Number(safeObject(chatRows[0]).is_deleted) === 1) throw new Error('tombstoned');
          return sqlSelect("SELECT tombstone_id FROM sync_tombstones WHERE record_kind = 'chat' AND record_id = ? AND (restored_at IS NULL OR restored_at = '') LIMIT 1", [identity.chatId]);
        }).then(function (tombstoneRows) {
          if (asArray(tombstoneRows).length) throw new Error('tombstoned');
          if (chatRows.length) throw new Error('conflict-chat-id');
        return sqlExecute(
          'INSERT INTO chats (id, title, created_at, updated_at, last_message_at, message_count, is_saved, is_linked, last_snapshot_id, last_captured_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [identity.chatId, identity.title, now, now, capturedAt, turns.length, 1, 0, identity.snapshotId, capturedAt, metaJson(chatMeta)]
        );
      }).then(function () {
        return sqlExecute(
          'INSERT INTO snapshots (id, chat_id, title, digest, message_count, captured_at, updated_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [identity.snapshotId, identity.chatId, identity.title, identity.digest, turns.length, capturedAt, now, metaJson(snapshotMeta)]
        );
      }).then(function () {
        return insertTurns(identity.snapshotId, turns);
      }).then(function () {
        return sqlExecute('COMMIT', []);
      }).then(function () {
        return {
          chatId: identity.chatId,
          snapshotId: identity.snapshotId,
          turnCount: turns.length,
          contentHash: identity.contentHash,
          restoredAt: restoredAt,
        };
      });
    }).catch(function (err) {
      return rollbackQuietly().then(function () { throw err; });
    });
  }

  function restoreVerifiedPackage(options) {
    var opts = safeObject(options);
    var packagePath = cleanString(opts.packagePath);
    var mode = cleanString(opts.mode) || RESTORE_MODE;
    if (!packagePath) return Promise.resolve(actionResult(null, 'rejected', null, null, 'no package path'));
    if (!isDesktopCapable()) return Promise.resolve(actionResult(packagePath, 'rejected', null, null, 'desktop-only'));
    if (mode !== RESTORE_MODE) return Promise.resolve(actionResult(packagePath, 'rejected', null, null, 'unsupported-mode: ' + mode));
    if (opts.confirm !== true) return Promise.resolve(actionResult(packagePath, 'rejected', null, null, 'confirm required'));

    var dry = null;
    var snapshotJson = null;
    return dryRunRestorePackage({ packagePath: packagePath }).then(function (res) {
      dry = safeObject(res);
      if (dry.decision === 'already-present') {
        return actionResult(packagePath, 'already-present', dry, {
          chatId: dry.identity.chatId,
          snapshotId: dry.identity.snapshotId,
          turnCount: 0,
          contentHash: dry.identity.contentHash,
        }, 'original snapshot already present; no write performed');
      }
      if (dry.decision !== 'restore-ready') {
        var conflictStatuses = { 'conflict-chat-id': true, 'conflict-snapshot-id': true };
        var status = conflictStatuses[dry.decision] ? 'conflict' : (dry.decision === 'tombstoned' ? 'tombstoned' : 'rejected');
        return actionResult(packagePath, status, dry, null, dry.reason || ('not restore-ready: ' + dry.decision));
      }
      return Promise.resolve(getInspector().inspectPackage({ packagePath: packagePath })).then(function (inspection) {
        if (cleanString(safeObject(inspection).status) !== 'verified') {
          return actionResult(packagePath, 'rejected', dry, null, 'package no longer verified at write time');
        }
        return readPackageSnapshotJson(packagePath).then(function (json) {
          snapshotJson = json;
          var identity = packageIdentity(inspection, snapshotJson);
          var turns = getImporter().buildTurnsFromPackageSnapshot(snapshotJson);
          if (!turns.length) {
            return actionResult(packagePath, 'rejected', dry, null, 'no turns to restore (refusing partial restore)');
          }
          return Promise.resolve(getSnapshotsStore().get(identity.snapshotId)).catch(function () { return null; })
            .then(function (existingCombined) {
              if (snapshotRowId(safeObject(existingCombined).snapshot)) {
                return actionResult(packagePath, 'conflict', dry, null, 'snapshot appeared before insert; refusing overwrite');
              }
              return insertRestoreRows(packagePath, identity, snapshotJson, turns).then(function (restored) {
                return actionResult(packagePath, 'restored', dry, restored, 'restored original chatId + snapshotId');
              });
            });
        });
      });
    }).catch(function (err) {
      var msg = String((err && err.message) || err || 'restore threw');
      if (msg === 'tombstoned') return actionResult(packagePath, 'tombstoned', dry, null, 'chat became tombstoned before insert');
      if (msg === 'conflict-chat-id' || msg === 'conflict-snapshot-id') return actionResult(packagePath, 'conflict', dry, null, msg);
      return actionResult(packagePath, 'write-error', dry, null, msg);
    });
  }

  H2O.Studio.archiveRestore = {
    __installed: true,
    __version: MODULE_VERSION,
    detectTauri: detectTauri,
    isDesktopCapable: isDesktopCapable,
    dryRunRestorePackage: dryRunRestorePackage,
    restoreVerifiedPackage: restoreVerifiedPackage,
  };
})(typeof window !== 'undefined' ? window : globalThis);
