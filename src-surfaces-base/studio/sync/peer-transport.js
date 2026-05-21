/* H2O Studio Sync - Per-Peer Local Transport Mirror (F4)
 *
 * Producer-side only. Mirrors the already-committed root latest.json bytes into
 * ~/H2O Studio Sync/devices/<safePeerDir>/ after the canonical root export
 * succeeds. No reads, no polling, no conflict handling, no tombstones.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};
  H2O.Studio.sync.peerTransport = H2O.Studio.sync.peerTransport || {};
  if (H2O.Studio.sync.peerTransport.__peerTransportInstalled) return;

  var SYNC_FOLDER_NAME = 'H2O Studio Sync';
  var DEVICES_DIR = 'devices';
  var LATEST_FILE = 'latest.json';
  var LATEST_SHA_FILE = 'latest.sha256';
  var STATE_FILE = 'state.json';
  var TMP_PREFIX = '.';
  var TMP_SUFFIX = '.tmp';
  var PEER_STATE_SCHEMA = 'h2o.studio.sync.peer-state.v1';
  var TRANSPORT_VERSION = 'h2o.studio.sync.peer-transport.v1';

  var state = {
    installedAt: Date.now(),
    lastResult: null,
  };

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function safeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function getHomeBaseDir() {
    return 21;
  }

  function joinPath(parts) {
    return parts.map(function (part) {
      return String(part || '').replace(/^\/+|\/+$/g, '');
    }).filter(Boolean).join('/');
  }

  function peerDirPath(safePeerDir) {
    return joinPath([SYNC_FOLDER_NAME, DEVICES_DIR, safePeerDir]);
  }

  function displayPath(path) {
    return '~/' + String(path || '').replace(/^\/+/, '');
  }

  function getTauriInvoke() {
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

  function getTauriFsFacade() {
    try {
      var tauri = global.__TAURI__;
      if (tauri && tauri.fs) return tauri.fs;
    } catch (_) { /* ignore */ }
    return null;
  }

  async function fsMkdir(path, options) {
    var fs = getTauriFsFacade();
    if (fs && typeof fs.mkdir === 'function') return fs.mkdir(path, options);
    var invoke = getTauriInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable for fs mkdir');
    return invoke('plugin:fs|mkdir', { path: path, options: options });
  }

  async function fsWriteTextFile(path, text, options) {
    var fs = getTauriFsFacade();
    if (fs && typeof fs.writeTextFile === 'function') return fs.writeTextFile(path, text, options);
    var invoke = getTauriInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable for fs write_text_file');
    var bytes = new TextEncoder().encode(String(text || ''));
    return invoke('plugin:fs|write_text_file', bytes, {
      headers: {
        path: encodeURIComponent(path),
        options: JSON.stringify(options || {}),
      },
    });
  }

  async function fsRename(oldPath, newPath, options) {
    var fs = getTauriFsFacade();
    if (fs && typeof fs.rename === 'function') return fs.rename(oldPath, newPath, options);
    var invoke = getTauriInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable for fs rename');
    return invoke('plugin:fs|rename', {
      oldPath: oldPath,
      newPath: newPath,
      options: options,
    });
  }

  async function sha256Hex(text) {
    if (!global.crypto || !global.crypto.subtle || typeof TextEncoder === 'undefined') {
      throw new Error('crypto.subtle SHA-256 unavailable');
    }
    var bytes = new TextEncoder().encode(String(text || ''));
    var digest = await global.crypto.subtle.digest('SHA-256', bytes);
    return Array.prototype.map.call(new Uint8Array(digest), function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
  }

  function byteLengthOf(text) {
    try {
      if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(text || '')).byteLength;
    } catch (_) { /* ignore */ }
    return String(text || '').length;
  }

  function encodePeerDir(syncPeerId) {
    var syncId = cleanString(syncPeerId);
    if (!syncId) throw new Error('syncPeerId required for peer transport');
    var safePeerDir = encodeURIComponent(syncId);
    if (!safePeerDir || safePeerDir === '.' || safePeerDir === '..' || /[\\/]/.test(safePeerDir)) {
      throw new Error('encoded syncPeerId is not a safe peer directory');
    }
    return safePeerDir;
  }

  function integerOrNull(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.floor(n);
  }

  function buildPeerState(input, safePeerDir, fileSha256, fileSize) {
    var bundle = safeObject(input.bundle);
    return {
      schema: PEER_STATE_SCHEMA,
      syncPeerId: cleanString(input.syncPeerId || bundle.sourceSyncPeerId),
      safePeerDir: safePeerDir,
      surfaceKind: cleanString(input.surfaceKind || bundle.sourceSurfaceKind),
      appKind: cleanString(input.appKind || bundle.sourceAppKind),
      storeKind: cleanString(input.storeKind || bundle.sourceStoreKind),
      lastExportId: cleanString(input.exportId || bundle.exportId),
      sequenceNumber: integerOrNull(input.sequenceNumber != null ? input.sequenceNumber : bundle.sequenceNumber),
      previousExportId: (input.previousExportId != null || bundle.previousExportId != null)
        ? cleanString(input.previousExportId != null ? input.previousExportId : bundle.previousExportId)
        : null,
      lastExportedAt: cleanString(input.exportedAt || bundle.exportedAt) || nowIso(),
      lastContentSha256: cleanString(input.contentSha256 || bundle.contentSha256),
      lastFileSha256: fileSha256,
      lastFileSize: fileSize,
      exporterVersion: cleanString(input.exporterVersion),
      exportSchemaVersion: cleanString(input.exportSchemaVersion || bundle.exportSchemaVersion),
      transportVersion: TRANSPORT_VERSION,
      updatedAt: nowIso(),
    };
  }

  async function writeAtomicText(path, text, fileOptions, renameOptions) {
    var parts = String(path || '').split('/');
    var filename = parts.pop();
    var dir = parts.join('/');
    var tmpPath = joinPath([dir, TMP_PREFIX + filename + TMP_SUFFIX]);
    await fsWriteTextFile(tmpPath, text, fileOptions);
    await fsRename(tmpPath, path, renameOptions);
    return tmpPath;
  }

  function failureResult(input, startedAt, error) {
    var syncPeerId = cleanString(input && input.syncPeerId);
    var safePeerDir = '';
    try { if (syncPeerId) safePeerDir = encodePeerDir(syncPeerId); }
    catch (_) { safePeerDir = ''; }
    var dirPath = safePeerDir ? peerDirPath(safePeerDir) : '';
    return {
      ok: false,
      phase: 'F4',
      mode: 'per-peer-local-transport-mirror',
      transportVersion: TRANSPORT_VERSION,
      stateSchema: PEER_STATE_SCHEMA,
      syncPeerId: syncPeerId,
      safePeerDir: safePeerDir,
      directory: dirPath ? displayPath(dirPath) : '',
      path: dirPath ? displayPath(joinPath([dirPath, LATEST_FILE])) : '',
      error: String(error && (error.message || error)),
      status: 'peer-transport-mirror-write-failed',
      atomicWrite: true,
      manifestCreated: false,
      historyCreated: false,
      durationMs: Date.now() - startedAt,
    };
  }

  async function writeLatestMirror(input) {
    var startedAt = Date.now();
    var inp = safeObject(input);
    try {
      var syncPeerId = cleanString(inp.syncPeerId || (inp.bundle && inp.bundle.sourceSyncPeerId));
      var safePeerDir = encodePeerDir(syncPeerId);
      var latestText = typeof inp.latestText === 'string' ? inp.latestText : '';
      if (!latestText) throw new Error('latestText required for peer transport');

      var baseDir = getHomeBaseDir();
      var dirPath = peerDirPath(safePeerDir);
      var latestPath = joinPath([dirPath, LATEST_FILE]);
      var shaPath = joinPath([dirPath, LATEST_SHA_FILE]);
      var statePath = joinPath([dirPath, STATE_FILE]);
      var folderOptions = { baseDir: baseDir, recursive: true };
      var fileOptions = { baseDir: baseDir, create: true, truncate: true };
      var renameOptions = { oldPathBaseDir: baseDir, newPathBaseDir: baseDir };
      var fileHex = await sha256Hex(latestText);
      var fileSha256 = 'sha256:' + fileHex;
      var shaText = fileSha256 + '\n';
      var fileSize = byteLengthOf(latestText);
      var stateJson = buildPeerState(Object.assign({}, inp, { syncPeerId: syncPeerId }), safePeerDir, fileSha256, fileSize);
      var stateText = JSON.stringify(stateJson, null, 2) + '\n';

      await fsMkdir(dirPath, folderOptions);
      await writeAtomicText(latestPath, latestText, fileOptions, renameOptions);
      await writeAtomicText(shaPath, shaText, fileOptions, renameOptions);
      await writeAtomicText(statePath, stateText, fileOptions, renameOptions);

      var result = {
        ok: true,
        phase: 'F4',
        mode: 'per-peer-local-transport-mirror',
        transportVersion: TRANSPORT_VERSION,
        stateSchema: PEER_STATE_SCHEMA,
        syncPeerId: syncPeerId,
        safePeerDir: safePeerDir,
        directory: displayPath(dirPath),
        path: displayPath(latestPath),
        shaPath: displayPath(shaPath),
        statePath: displayPath(statePath),
        bytes: fileSize,
        checksum: fileSha256,
        latestFileSha256: fileSha256,
        state: stateJson,
        files: [LATEST_FILE, LATEST_SHA_FILE, STATE_FILE],
        atomicWrite: true,
        manifestCreated: false,
        historyCreated: false,
        durationMs: Date.now() - startedAt,
        status: 'peer-transport-mirror-written',
      };
      state.lastResult = result;
      return result;
    } catch (error) {
      var failure = failureResult(inp, startedAt, error);
      state.lastResult = failure;
      return failure;
    }
  }

  function diagnose() {
    return {
      installed: true,
      transportVersion: TRANSPORT_VERSION,
      stateSchema: PEER_STATE_SCHEMA,
      rootCanonicalPath: displayPath(joinPath([SYNC_FOLDER_NAME, LATEST_FILE])),
      pathTemplate: displayPath(joinPath([SYNC_FOLDER_NAME, DEVICES_DIR, '<safePeerDir>', LATEST_FILE])),
      safePeerDirRule: 'encodeURIComponent(syncPeerId)',
      writesRootLatest: false,
      readsRootLatest: false,
      readsDevices: false,
      chromeStorageKeys: [],
      manifestCreated: false,
      historyCreated: false,
      lastResult: state.lastResult,
    };
  }

  H2O.Studio.sync.peerTransport.writeLatestMirror = writeLatestMirror;
  H2O.Studio.sync.peerTransport.diagnose = diagnose;
  H2O.Studio.sync.peerTransport.constants = Object.freeze({
    DEVICES_DIR: DEVICES_DIR,
    LATEST_FILE: LATEST_FILE,
    LATEST_SHA_FILE: LATEST_SHA_FILE,
    STATE_FILE: STATE_FILE,
    PEER_STATE_SCHEMA: PEER_STATE_SCHEMA,
    TRANSPORT_VERSION: TRANSPORT_VERSION,
  });
  H2O.Studio.sync.peerTransport.__peerTransportInstalled = true;
  H2O.Studio.sync.peerTransport.__peerTransportVersion = TRANSPORT_VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
