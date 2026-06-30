/* H2O Studio - Saved Chat Archive Relink (Desktop, Phase K.4.2)
 *
 * Verification-gated relink of a `.h2ochat` package onto an existing operator
 * selected chat. Relink inserts a fresh recovered snapshot under targetChatId,
 * inserts recovered turns for that fresh snapshot, then updates only the target
 * chat's current pointer/metadata. It never overwrites existing snapshots or
 * turns, never re-parents snapshots, and never uses the package original
 * snapshotId as the new snapshot id.
 *
 * Public API (H2O.Studio.archiveRelink):
 *   isDesktopCapable() -> boolean
 *   dryRunRelinkPackage({ packagePath, targetChatId }) -> Promise<decision>
 *   relinkVerifiedPackage({ packagePath, targetChatId, confirm }) -> Promise<result>
 *
 * Confirmation token: RELINK:<targetChatId>
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  if (H2O.Studio.archiveRelink && H2O.Studio.archiveRelink.__installed) return;

  var MODULE_VERSION = '0.1.0-phase-k-4-2';
  var APP_LOCAL_DATA = 15;
  var DB_URL = 'sqlite:studio-v1.db';
  var PACKAGE_ROOT = 'archive/packages';
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

  function metaJson(meta) {
    try { return JSON.stringify(meta || {}); } catch (_) { return '{}'; }
  }

  function parseMetaJson(value) {
    try {
      var v = JSON.parse(String(value || '{}'));
      return isObject(v) ? v : {};
    } catch (_) { return {}; }
  }

  function snapshotRowId(snap) {
    var s = safeObject(snap);
    return cleanString(s.snapshotId) || cleanString(s.id);
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
      originalChatId: cleanString(id.chatId) || cleanString(snap.chatId),
      originalSnapshotId: cleanString(id.snapshotId) || cleanString(snap.snapshotId),
      title: cleanString(snap.title) || cleanString(id.title) || 'Relinked chat',
      contentHash: contentHash,
      digest: contentDigestFromSnapshot(snap, contentHash),
      capturedAt: snap.capturedAt == null ? '' : snap.capturedAt,
      messageCount: messages.length || (isFiniteNumber(id.messageCount) ? id.messageCount : 0),
      schemaVersion: id.schemaVersion == null ? null : id.schemaVersion,
      payloadVersion: id.payloadVersion == null ? null : id.payloadVersion,
    };
  }

  function nonVerifiedDecision(inspectStatus) {
    var s = cleanString(inspectStatus);
    if (s === 'verified') return null;
    if (s === 'unsupported-version') return 'unsupported-version';
    if (s === 'missing-files' || s === 'hash-mismatch' || s === 'corrupted') return 'corrupted';
    if (s === 'read-error') return 'read-error';
    return 'rejected';
  }

  function toEpochMillis(value) {
    if (typeof value === 'number' && isFinite(value)) return Math.floor(value);
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
    var parsed = Date.parse(String(value == null ? '' : value));
    return isFinite(parsed) ? parsed : Date.now();
  }

  function confirmToken(targetChatId) {
    return 'RELINK:' + cleanString(targetChatId);
  }

  function baseIdentity() {
    return {
      originalChatId: '', originalSnapshotId: '', title: '', contentHash: '', digest: '',
      capturedAt: '', messageCount: 0, schemaVersion: null, payloadVersion: null,
    };
  }

  function baseTarget(targetChatId) {
    return {
      chatId: cleanString(targetChatId), title: '', headline: '',
      previousSnapshotId: '', previousCurrentLeafId: '', previousLastCapturedAt: null,
      snapshotCount: null,
    };
  }

  function dryRunResult(packagePath, targetChatId, decision, identity, target, store, reason, inspectStatus) {
    return {
      ok: decision === 'relink-ready' || decision === 'already-relinked',
      decision: decision,
      status: decision,
      packagePath: cleanString(packagePath) || null,
      packageDirName: packagePath ? packageDirNameForPath(packagePath) : null,
      targetChatId: cleanString(targetChatId) || null,
      requiredConfirmToken: targetChatId ? confirmToken(targetChatId) : '',
      confirmHint: targetChatId ? ('Type ' + confirmToken(targetChatId) + ' to relink') : '',
      mutated: false,
      identity: identity || baseIdentity(),
      target: target || baseTarget(targetChatId),
      store: store || {
        targetExists: false,
        targetDeleted: false,
        targetTombstoned: false,
        packageOriginalSnapshotExists: false,
        packageOriginalSnapshotBelongsToOtherChat: false,
        targetCurrentDigestMatchesPackage: false,
      },
      reason: reason || '',
      inspectStatus: cleanString(inspectStatus),
    };
  }

  function actionResult(packagePath, status, dry, relinked, reason) {
    return {
      ok: status === 'relinked' || status === 'already-relinked',
      status: status,
      decision: cleanString(dry && dry.decision),
      packagePath: cleanString(packagePath) || null,
      targetChatId: cleanString(dry && dry.targetChatId) || null,
      relinked: relinked || null,
      reason: reason || '',
    };
  }

  function currentSnapshotDigest(snapshotId) {
    var id = cleanString(snapshotId);
    if (!id) return Promise.resolve('');
    return sqlSelect('SELECT digest, meta_json FROM snapshots WHERE id = ? LIMIT 1', [id])
      .then(function (rows) {
        var row = safeObject(asArray(rows)[0]);
        var meta = parseMetaJson(row.meta_json);
        return cleanString(row.digest) || cleanString(meta.digest) || cleanString(meta.contentHash);
      }, function () { return ''; });
  }

  function readTargetChat(targetChatId) {
    var id = cleanString(targetChatId);
    if (!id) return Promise.resolve(null);
    return sqlSelect(
      'SELECT id, title, is_deleted, last_snapshot_id, current_leaf_id, last_captured_at, snapshot_count, meta_json FROM chats WHERE id = ? LIMIT 1',
      [id]
    ).then(function (rows) { return asArray(rows)[0] || null; });
  }

  function findActiveChatTombstone(chatId) {
    var id = cleanString(chatId);
    if (!id) return Promise.resolve(false);
    return sqlSelect(
      "SELECT 1 AS present FROM sync_tombstones WHERE record_kind = 'chat' AND record_id = ? AND (restored_at IS NULL OR restored_at = '') LIMIT 1",
      [id]
    ).then(function (rows) { return Array.isArray(rows) && rows.length > 0; }, function () { return false; });
  }

  function inspectOriginalSnapshot(identity, targetChatId) {
    var originalSnapshotId = cleanString(identity.originalSnapshotId);
    if (!originalSnapshotId) {
      return Promise.resolve({
        exists: false,
        belongsToOtherChat: false,
        belongsToTarget: false,
      });
    }
    return sqlSelect('SELECT id, chat_id FROM snapshots WHERE id = ? LIMIT 1', [originalSnapshotId])
      .then(function (rows) {
        var row = safeObject(asArray(rows)[0]);
        var chatId = cleanString(row.chat_id);
        var exists = !!cleanString(row.id);
        return {
          exists: exists,
          belongsToOtherChat: exists && !!chatId && chatId !== cleanString(targetChatId),
          belongsToTarget: exists && chatId === cleanString(targetChatId),
        };
      }, function () {
        return { exists: false, belongsToOtherChat: false, belongsToTarget: false };
      });
  }

  function targetFromRow(row) {
    var r = safeObject(row);
    return {
      chatId: cleanString(r.id),
      title: cleanString(r.title),
      headline: cleanString(r.title),
      previousSnapshotId: cleanString(r.last_snapshot_id),
      previousCurrentLeafId: cleanString(r.current_leaf_id),
      previousLastCapturedAt: r.last_captured_at == null ? null : r.last_captured_at,
      snapshotCount: isFiniteNumber(Number(r.snapshot_count)) ? Number(r.snapshot_count) : null,
    };
  }

  function dryRunRelinkPackage(options) {
    var opts = safeObject(options);
    var packagePath = cleanString(opts.packagePath);
    var targetChatId = cleanString(opts.targetChatId);
    if (!packagePath) return Promise.resolve(dryRunResult(null, targetChatId, 'rejected', null, null, null, 'no package path', ''));
    if (!targetChatId) return Promise.resolve(dryRunResult(packagePath, null, 'target-chat-missing', null, null, null, 'targetChatId required', ''));
    if (!isDesktopCapable()) return Promise.resolve(dryRunResult(packagePath, targetChatId, 'rejected', null, null, null, 'desktop-only', ''));
    if (!packagePathIsScoped(packagePath)) return Promise.resolve(dryRunResult(packagePath, targetChatId, 'rejected', null, null, null, 'path-not-scoped', ''));

    var inspection = null;
    var snapshotJson = null;
    return Promise.resolve(getInspector().inspectPackage({ packagePath: packagePath }))
      .then(function (res) { inspection = safeObject(res); })
      .then(function () { return readPackageSnapshotJson(packagePath); })
      .then(function (json) { snapshotJson = json; })
      .then(function () {
        var inspectStatus = cleanString(inspection.status);
        var identity = packageIdentity(inspection, snapshotJson);
        var early = nonVerifiedDecision(inspectStatus);
        if (early) return dryRunResult(packagePath, targetChatId, early, identity, null, null, 'inspector status: ' + inspectStatus, inspectStatus);
        return Promise.all([
          readTargetChat(targetChatId),
          findActiveChatTombstone(targetChatId),
          inspectOriginalSnapshot(identity, targetChatId),
        ]).then(function (triple) {
          var targetRow = triple[0];
          var targetTombstoned = triple[1] === true;
          var originalSnapshotState = triple[2];
          var targetExists = !!cleanString(safeObject(targetRow).id);
          var targetDeleted = Number(safeObject(targetRow).is_deleted) === 1;
          var target = targetExists ? targetFromRow(targetRow) : baseTarget(targetChatId);
          var store = {
            targetExists: targetExists,
            targetDeleted: targetDeleted,
            targetTombstoned: targetTombstoned,
            packageOriginalSnapshotExists: !!originalSnapshotState.exists,
            packageOriginalSnapshotBelongsToOtherChat: !!originalSnapshotState.belongsToOtherChat,
            targetCurrentDigestMatchesPackage: false,
          };
          if (!targetExists) return dryRunResult(packagePath, targetChatId, 'target-chat-missing', identity, target, store, 'target chat missing', inspectStatus);
          if (targetDeleted) return dryRunResult(packagePath, targetChatId, 'target-chat-deleted', identity, target, store, 'target chat is deleted; no relink', inspectStatus);
          if (targetTombstoned) return dryRunResult(packagePath, targetChatId, 'tombstoned', identity, target, store, 'target chat is tombstoned; override/un-delete is deferred', inspectStatus);
          if (!identity.originalSnapshotId) return dryRunResult(packagePath, targetChatId, 'snapshot-missing', identity, target, store, 'package original snapshot id missing', inspectStatus);
          if (originalSnapshotState.belongsToOtherChat) {
            return dryRunResult(packagePath, targetChatId, 'snapshot-belongs-to-other-chat', identity, target, store, 'package original snapshotId already belongs to another chat; refusing re-parenting', inspectStatus);
          }
          return currentSnapshotDigest(target.previousSnapshotId).then(function (existingDigest) {
            var expectedDigest = cleanString(identity.digest) || cleanString(identity.contentHash);
            var sameContent = !!existingDigest && !!expectedDigest && existingDigest === expectedDigest;
            store.targetCurrentDigestMatchesPackage = sameContent;
            if (sameContent) return dryRunResult(packagePath, targetChatId, 'already-relinked', identity, target, store, 'target already points at matching package content', inspectStatus);
            return dryRunResult(packagePath, targetChatId, 'relink-ready', identity, target, store, 'verified package can be relinked to target chat', inspectStatus);
          });
        });
      })
      .catch(function (err) {
        return dryRunResult(packagePath, targetChatId, 'read-error', null, null, null, String((err && err.message) || err || 'dry-run threw'), '');
      });
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

  function generateFreshSnapshotId() {
    var rnd = '';
    try { if (global.crypto && typeof global.crypto.randomUUID === 'function') rnd = global.crypto.randomUUID(); } catch (_) { /* ignore */ }
    if (!rnd) rnd = 'r' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    return 'snap_relinked_' + rnd.replace(/[^A-Za-z0-9_-]/g, '_');
  }

  function ensureFreshRelinkSnapshotId(originalSnapshotId) {
    var attempt = 0;
    function tryOnce() {
      var id = generateFreshSnapshotId();
      if (id === cleanString(originalSnapshotId)) {
        attempt += 1;
        if (attempt >= 8) return Promise.resolve(null);
        return tryOnce();
      }
      return sqlSelect('SELECT id FROM snapshots WHERE id = ? LIMIT 1', [id])
        .then(function (rows) {
          if (!asArray(rows).length) return id;
          attempt += 1;
          if (attempt >= 8) return null;
          return tryOnce();
        });
    }
    return tryOnce();
  }

  function rollbackQuietly() {
    return sqlExecute('ROLLBACK', []).catch(function () { return null; });
  }

  function insertRelinkRows(packagePath, targetChatId, identity, snapshotJson, turns, dry) {
    var now = Date.now();
    var relinkedAt = new Date(now).toISOString();
    var capturedAt = toEpochMillis(identity.capturedAt);
    var target = safeObject(dry && dry.target);
    var confirm = confirmToken(targetChatId);
    var provenance = {
      relinkedFromPackage: true,
      source: 'h2ochat-package-relink',
      relinker: 'archive-relink-k4',
      mode: 'relink',
      previousSnapshotId: cleanString(target.previousSnapshotId),
      previousCurrentLeafId: cleanString(target.previousCurrentLeafId),
      previousLastCapturedAt: target.previousLastCapturedAt == null ? null : target.previousLastCapturedAt,
      newSnapshotId: '',
      originalChatId: identity.originalChatId,
      originalSnapshotId: identity.originalSnapshotId,
      contentHash: identity.contentHash,
      digest: identity.digest,
      packagePath: packagePath,
      packageDirName: packageDirNameForPath(packagePath),
      relinkedAt: relinkedAt,
      confirmToken: confirm,
      confirmMode: 'typed-token',
    };

    return sqlExecute('BEGIN IMMEDIATE', []).then(function () {
      var targetRow = null;
      var newSnapshotId = '';
      return sqlSelect('SELECT id, is_deleted, last_snapshot_id, current_leaf_id, last_captured_at, snapshot_count, meta_json FROM chats WHERE id = ? LIMIT 1', [targetChatId])
        .then(function (rows) {
          targetRow = safeObject(asArray(rows)[0]);
          if (!cleanString(targetRow.id)) throw new Error('target-chat-missing');
          if (Number(targetRow.is_deleted) === 1) throw new Error('target-chat-deleted');
          return sqlSelect("SELECT tombstone_id FROM sync_tombstones WHERE record_kind = 'chat' AND record_id = ? AND (restored_at IS NULL OR restored_at = '') LIMIT 1", [targetChatId]);
        }).then(function (tombstoneRows) {
          if (asArray(tombstoneRows).length) throw new Error('tombstoned');
          return ensureFreshRelinkSnapshotId(identity.originalSnapshotId);
        }).then(function (freshId) {
          if (!freshId) throw new Error('could not allocate fresh relink snapshot id');
          newSnapshotId = freshId;
          provenance.previousSnapshotId = cleanString(targetRow.last_snapshot_id);
          provenance.previousCurrentLeafId = cleanString(targetRow.current_leaf_id);
          provenance.previousLastCapturedAt = targetRow.last_captured_at == null ? null : targetRow.last_captured_at;
          provenance.newSnapshotId = newSnapshotId;
          var snapshotMeta = Object.assign({}, safeObject(snapshotJson).meta || {}, { relink: provenance });
          return sqlExecute(
            'INSERT INTO snapshots (id, chat_id, title, digest, message_count, captured_at, updated_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [newSnapshotId, targetChatId, identity.title, identity.digest, turns.length, capturedAt, now, metaJson(snapshotMeta)]
          );
        }).then(function () {
          return insertTurns(newSnapshotId, turns);
        }).then(function () {
          var existingMeta = parseMetaJson(targetRow.meta_json);
          var relinks = asArray(existingMeta.relinks).slice(-9);
          relinks.push(provenance);
          var mergedMeta = Object.assign({}, existingMeta, {
            relinked: provenance,
            relinks: relinks,
          });
          return sqlExecute(
            'UPDATE chats SET last_snapshot_id = ?, current_leaf_id = ?, last_captured_at = ?, snapshot_count = COALESCE(snapshot_count, 0) + 1, updated_at = ?, meta_json = ? WHERE id = ?',
            [newSnapshotId, newSnapshotId, capturedAt, now, metaJson(mergedMeta), targetChatId]
          );
        }).then(function () {
          return sqlExecute('COMMIT', []);
        }).then(function () {
          return {
            targetChatId: targetChatId,
            newSnapshotId: newSnapshotId,
            previousSnapshotId: provenance.previousSnapshotId,
            previousCurrentLeafId: provenance.previousCurrentLeafId,
            turnCount: turns.length,
            originalChatId: identity.originalChatId,
            originalSnapshotId: identity.originalSnapshotId,
            contentHash: identity.contentHash,
            relinkedAt: relinkedAt,
          };
        });
    }).catch(function (err) {
      return rollbackQuietly().then(function () { throw err; });
    });
  }

  function relinkVerifiedPackage(options) {
    var opts = safeObject(options);
    var packagePath = cleanString(opts.packagePath);
    var targetChatId = cleanString(opts.targetChatId);
    if (!packagePath) return Promise.resolve(actionResult(null, 'rejected', null, null, 'no package path'));
    if (!targetChatId) return Promise.resolve(actionResult(packagePath, 'target-chat-missing', null, null, 'targetChatId required'));
    if (!isDesktopCapable()) return Promise.resolve(actionResult(packagePath, 'rejected', null, null, 'desktop-only'));
    if (typeof opts.confirm !== 'string' || cleanString(opts.confirm) !== confirmToken(targetChatId)) {
      return Promise.resolve(actionResult(packagePath, 'rejected', null, null, 'typed confirm required: ' + confirmToken(targetChatId)));
    }

    var dry = null;
    return dryRunRelinkPackage({ packagePath: packagePath, targetChatId: targetChatId }).then(function (res) {
      dry = safeObject(res);
      if (dry.decision === 'already-relinked') {
        return actionResult(packagePath, 'already-relinked', dry, {
          targetChatId: targetChatId,
          previousSnapshotId: cleanString(safeObject(dry.target).previousSnapshotId),
          newSnapshotId: cleanString(safeObject(dry.target).previousSnapshotId),
          turnCount: 0,
          contentHash: cleanString(safeObject(dry.identity).contentHash),
        }, 'target already points at matching package content; no write performed');
      }
      if (dry.decision !== 'relink-ready') {
        var decision = cleanString(dry.decision);
        var status = {
          'target-chat-missing': 'target-chat-missing',
          'target-chat-deleted': 'target-chat-deleted',
          'tombstoned': 'tombstoned',
          'snapshot-belongs-to-other-chat': 'conflict',
          'snapshot-missing': 'conflict',
          'conflict': 'conflict',
          'read-error': 'read-error',
        }[decision] || 'rejected';
        return actionResult(packagePath, status, dry, null, dry.reason || ('not relink-ready: ' + decision));
      }
      return Promise.resolve(getInspector().inspectPackage({ packagePath: packagePath })).then(function (inspection) {
        if (cleanString(safeObject(inspection).status) !== 'verified') {
          return actionResult(packagePath, 'rejected', dry, null, 'package no longer verified at write time');
        }
        return readPackageSnapshotJson(packagePath).then(function (snapshotJson) {
          var identity = packageIdentity(inspection, snapshotJson);
          var turns = getImporter().buildTurnsFromPackageSnapshot(snapshotJson);
          if (!turns.length) {
            return actionResult(packagePath, 'rejected', dry, null, 'no turns to relink (refusing partial relink)');
          }
          if (!identity.originalSnapshotId) {
            return actionResult(packagePath, 'conflict', dry, null, 'package original snapshot id missing');
          }
          return insertRelinkRows(packagePath, targetChatId, identity, snapshotJson, turns, dry)
            .then(function (relinked) {
              return actionResult(packagePath, 'relinked', dry, relinked, 'relinked package content to target chat with fresh snapshot');
            });
        });
      });
    }).catch(function (err) {
      var msg = String((err && err.message) || err || 'relink threw');
      if (msg === 'target-chat-missing') return actionResult(packagePath, 'target-chat-missing', dry, null, msg);
      if (msg === 'target-chat-deleted') return actionResult(packagePath, 'target-chat-deleted', dry, null, msg);
      if (msg === 'tombstoned') return actionResult(packagePath, 'tombstoned', dry, null, msg);
      return actionResult(packagePath, 'write-error', dry, null, msg);
    });
  }

  H2O.Studio.archiveRelink = {
    __installed: true,
    __version: MODULE_VERSION,
    detectTauri: detectTauri,
    isDesktopCapable: isDesktopCapable,
    dryRunRelinkPackage: dryRunRelinkPackage,
    relinkVerifiedPackage: relinkVerifiedPackage,
    requiredConfirmToken: confirmToken,
  };
})(typeof window !== 'undefined' ? window : globalThis);
