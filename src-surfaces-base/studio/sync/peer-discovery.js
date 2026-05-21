/* H2O Studio Sync - Peer Discovery Diagnostics (F4.x)
 *
 * Desktop-only, read-only diagnostic scanner for the F4 local transport layout:
 *   ~/H2O Studio Sync/devices/<safePeerDir>/{latest.json,latest.sha256,state.json}
 *
 * This module never imports, applies, writes files, mutates chrome.storage, polls,
 * creates manifests, or creates history. It only reports discovered peers and
 * file-integrity status for developer diagnostics.
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* swallow */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  if (H2O.Studio.peerDiscovery && H2O.Studio.peerDiscovery.__peerDiscoveryInstalled) return;

  var REPORT_SCHEMA = 'h2o.studio.peer-discovery.report.v1';
  var PEER_STATE_SCHEMA = 'h2o.studio.sync.peer-state.v1';
  var SYNC_FOLDER_NAME = 'H2O Studio Sync';
  var DEVICES_DIR = 'devices';
  var LATEST_FILE = 'latest.json';
  var LATEST_SHA_FILE = 'latest.sha256';
  var STATE_FILE = 'state.json';

  var state = {
    installedAt: Date.now(),
    lastScanAt: null,
    lastSummary: null,
    lastError: null,
    lastOptions: null,
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

  function homeOptions() {
    return { baseDir: getHomeBaseDir() };
  }

  function joinPath(parts) {
    return parts.map(function (part) {
      return String(part || '').replace(/^\/+|\/+$/g, '');
    }).filter(Boolean).join('/');
  }

  function displayPath(path) {
    return '~/' + String(path || '').replace(/^\/+/, '');
  }

  function devicesPath() {
    return joinPath([SYNC_FOLDER_NAME, DEVICES_DIR]);
  }

  function peerDirPath(safePeerDir) {
    return joinPath([devicesPath(), safePeerDir]);
  }

  function peerFilePath(safePeerDir, filename) {
    return joinPath([peerDirPath(safePeerDir), filename]);
  }

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

  function getTauriFsFacade() {
    try {
      var tauri = global.__TAURI__;
      if (tauri && tauri.fs) return tauri.fs;
    } catch (_) { /* ignore */ }
    return null;
  }

  async function fsReadDir(path, options) {
    var fs = getTauriFsFacade();
    if (fs && typeof fs.readDir === 'function') return fs.readDir(path, options || {});
    var invoke = getInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable for fs read_dir');
    try {
      return await invoke('plugin:fs|read_dir', { path: path, options: options || {} });
    } catch (e) {
      if (!options) throw e;
      return invoke('plugin:fs|read_dir', { path: path });
    }
  }

  async function fsReadTextFile(path, options) {
    var fs = getTauriFsFacade();
    if (fs && typeof fs.readTextFile === 'function') {
      return decodeToText(await fs.readTextFile(path, options || {}));
    }
    var invoke = getInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable for fs read_text_file');
    var raw;
    try {
      raw = await invoke('plugin:fs|read_text_file', { path: path, options: options || {} });
    } catch (textErr) {
      try {
        raw = await invoke('plugin:fs|read_file', { path: path, options: options || {} });
      } catch (bytesErr) {
        throw new Error(String((textErr && textErr.message) || textErr)
          + ' / fallback read_file failed: ' + String((bytesErr && bytesErr.message) || bytesErr));
      }
    }
    return decodeToText(raw);
  }

  function decodeToText(raw) {
    if (typeof raw === 'string') return raw;
    if (raw instanceof ArrayBuffer) return new TextDecoder('utf-8').decode(new Uint8Array(raw));
    if (raw instanceof Uint8Array) return new TextDecoder('utf-8').decode(raw);
    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(raw)) {
      return new TextDecoder('utf-8').decode(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
    }
    if (Array.isArray(raw)) return new TextDecoder('utf-8').decode(new Uint8Array(raw));
    if (raw && typeof raw === 'object') {
      if (Object.prototype.toString.call(raw) === '[object ArrayBuffer]') {
        return new TextDecoder('utf-8').decode(new Uint8Array(raw));
      }
      if (typeof raw.value === 'string') return raw.value;
      if (typeof raw.data === 'string') return raw.data;
      if (raw.value && raw.value !== raw) return decodeToText(raw.value);
      if (raw.data && raw.data !== raw) return decodeToText(raw.data);
      if (Array.isArray(raw.data)) return new TextDecoder('utf-8').decode(new Uint8Array(raw.data));
    }
    return String(raw == null ? '' : raw);
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

  async function sha256Token(text) {
    return 'sha256:' + await sha256Hex(text);
  }

  function normalizeSha256(value) {
    var text = cleanString(value).toLowerCase();
    if (/^[a-f0-9]{64}$/.test(text)) return 'sha256:' + text;
    return text;
  }

  function isValidSha256Token(value) {
    return /^sha256:[a-f0-9]{64}$/.test(normalizeSha256(value));
  }

  function entryName(entry) {
    if (!entry || typeof entry !== 'object') return '';
    var name = cleanString(entry.name);
    if (name) return name;
    var path = cleanString(entry.path);
    if (!path) return '';
    var parts = path.split(/[\\/]+/);
    return cleanString(parts[parts.length - 1]);
  }

  function isDirectoryEntry(entry) {
    if (!entry || typeof entry !== 'object') return false;
    if (entry.isDirectory === true) return true;
    if (entry.isFile === true) return false;
    if (entry.children && Array.isArray(entry.children)) return true;
    return entry.isDirectory !== false && entry.isFile !== true;
  }

  function nameSet(entries) {
    var set = Object.create(null);
    (Array.isArray(entries) ? entries : []).forEach(function (entry) {
      var name = entryName(entry);
      if (name) set[name] = true;
    });
    return set;
  }

  function redactSyncPeerId(syncPeerId) {
    var value = cleanString(syncPeerId);
    if (!value) return '';
    var parts = value.split(':');
    if (parts.length >= 4) return parts.slice(0, 3).join(':') + ':<redacted>';
    return '<redacted>';
  }

  function redactSafePeerDir() {
    return '<encoded-syncPeerId-redacted>';
  }

  function errorText(error) {
    return String(error && (error.message || error));
  }

  function pushCode(list, code, detail) {
    list.push(detail ? { code: code, detail: cleanString(detail) } : { code: code });
  }

  function makePeerReport(safePeerDir, includeSensitive) {
    var peer = {
      peerKey: '',
      safePeerDirRedacted: redactSafePeerDir(safePeerDir),
      syncPeerIdRedacted: '',
      syncPeerIdPresent: false,
      safePeerDirPresent: false,
      safePeerDirMatchesState: null,
      safePeerDirMatchesSyncPeerId: null,
      surfaceKind: '',
      appKind: '',
      storeKind: '',
      sequenceNumber: null,
      lastExportId: '',
      lastExportedAt: '',
      stateOk: false,
      stateSchema: '',
      latestExists: false,
      shaExists: false,
      shaMatches: null,
      stateShaMatchesSidecar: null,
      latestSha256: '',
      sidecarSha256: '',
      lastFileSha256: '',
      errors: [],
      warnings: [],
    };
    if (includeSensitive) peer.safePeerDir = safePeerDir;
    return peer;
  }

  async function readTextResult(path) {
    try {
      return { ok: true, text: await fsReadTextFile(path, homeOptions()) };
    } catch (e) {
      return { ok: false, error: errorText(e) };
    }
  }

  async function scanPeer(safePeerDir, options) {
    var includeSensitive = options.includeSensitive === true;
    var verifyLatest = options.verifyLatest !== false;
    var peer = makePeerReport(safePeerDir, includeSensitive);
    var peerDir = peerDirPath(safePeerDir);
    var files = null;

    try {
      files = nameSet(await fsReadDir(peerDir, homeOptions()));
    } catch (e) {
      pushCode(peer.errors, 'peer-dir-read-failed', errorText(e));
    }

    if (files) {
      peer.latestExists = !!files[LATEST_FILE];
      peer.shaExists = !!files[LATEST_SHA_FILE];
    }

    var stateJson = null;
    if (files && !files[STATE_FILE]) {
      pushCode(peer.errors, 'state-missing');
    } else {
      var stateRead = await readTextResult(peerFilePath(safePeerDir, STATE_FILE));
      if (!stateRead.ok) {
        pushCode(peer.errors, 'state-read-failed', stateRead.error);
      } else {
        try {
          stateJson = JSON.parse(stateRead.text);
        } catch (e) {
          pushCode(peer.errors, 'state-json-parse-failed', errorText(e));
        }
      }
    }

    if (stateJson && typeof stateJson === 'object' && !Array.isArray(stateJson)) {
      var syncPeerId = cleanString(stateJson.syncPeerId);
      var stateSafePeerDir = cleanString(stateJson.safePeerDir);
      peer.stateSchema = cleanString(stateJson.schema);
      peer.syncPeerIdPresent = !!syncPeerId;
      peer.safePeerDirPresent = !!stateSafePeerDir;
      peer.syncPeerIdRedacted = redactSyncPeerId(syncPeerId);
      peer.surfaceKind = cleanString(stateJson.surfaceKind);
      peer.appKind = cleanString(stateJson.appKind);
      peer.storeKind = cleanString(stateJson.storeKind);
      peer.sequenceNumber = Number.isFinite(Number(stateJson.sequenceNumber)) ? Math.floor(Number(stateJson.sequenceNumber)) : null;
      peer.lastExportId = cleanString(stateJson.lastExportId);
      peer.lastExportedAt = cleanString(stateJson.lastExportedAt);
      peer.lastFileSha256 = normalizeSha256(stateJson.lastFileSha256);
      peer.safePeerDirMatchesState = stateSafePeerDir ? stateSafePeerDir === safePeerDir : false;
      if (syncPeerId) {
        peer.safePeerDirMatchesSyncPeerId = encodeURIComponent(syncPeerId) === safePeerDir;
      } else {
        peer.safePeerDirMatchesSyncPeerId = false;
      }
      if (includeSensitive) peer.syncPeerId = syncPeerId;

      if (peer.stateSchema !== PEER_STATE_SCHEMA) pushCode(peer.errors, 'state-schema-invalid');
      if (!peer.syncPeerIdPresent) pushCode(peer.errors, 'state-syncPeerId-missing');
      if (!peer.safePeerDirPresent) pushCode(peer.errors, 'state-safePeerDir-missing');
      if (peer.safePeerDirMatchesState === false) pushCode(peer.errors, 'state-safePeerDir-mismatch');
      if (peer.safePeerDirMatchesSyncPeerId === false) pushCode(peer.errors, 'safePeerDir-encoding-mismatch');
      if (peer.lastFileSha256 && !isValidSha256Token(peer.lastFileSha256)) {
        pushCode(peer.errors, 'state-lastFileSha256-invalid');
      }

      peer.stateOk = peer.stateSchema === PEER_STATE_SCHEMA
        && peer.syncPeerIdPresent
        && peer.safePeerDirPresent
        && peer.safePeerDirMatchesState === true
        && peer.safePeerDirMatchesSyncPeerId === true;
    }

    if (!peer.shaExists && (!files || files[LATEST_SHA_FILE])) {
      var shaRead = await readTextResult(peerFilePath(safePeerDir, LATEST_SHA_FILE));
      if (shaRead.ok) peer.shaExists = true;
      if (shaRead.ok) peer.sidecarSha256 = normalizeSha256(shaRead.text);
      else pushCode(peer.errors, 'sha-read-failed', shaRead.error);
    } else if (peer.shaExists) {
      var shaReadKnown = await readTextResult(peerFilePath(safePeerDir, LATEST_SHA_FILE));
      if (shaReadKnown.ok) peer.sidecarSha256 = normalizeSha256(shaReadKnown.text);
      else pushCode(peer.errors, 'sha-read-failed', shaReadKnown.error);
    }

    if (!peer.shaExists) pushCode(peer.errors, 'sha-missing');
    if (peer.sidecarSha256 && !isValidSha256Token(peer.sidecarSha256)) {
      pushCode(peer.errors, 'sha-sidecar-invalid');
    }

    if (peer.lastFileSha256 && peer.sidecarSha256) {
      peer.stateShaMatchesSidecar = peer.lastFileSha256 === peer.sidecarSha256;
      if (!peer.stateShaMatchesSidecar) pushCode(peer.errors, 'state-sha-sidecar-mismatch');
    }

    if (!peer.latestExists && (!files || files[LATEST_FILE])) {
      if (verifyLatest) {
        var latestReadProbe = await readTextResult(peerFilePath(safePeerDir, LATEST_FILE));
        if (latestReadProbe.ok) {
          peer.latestExists = true;
          try { peer.latestSha256 = await sha256Token(latestReadProbe.text); }
          catch (e) { pushCode(peer.errors, 'latest-sha256-failed', errorText(e)); }
        } else {
          pushCode(peer.errors, 'latest-read-failed', latestReadProbe.error);
        }
      }
    }

    if (!peer.latestExists) pushCode(peer.errors, 'latest-missing');

    if (verifyLatest && peer.latestExists && !peer.latestSha256) {
      var latestRead = await readTextResult(peerFilePath(safePeerDir, LATEST_FILE));
      if (!latestRead.ok) {
        pushCode(peer.errors, 'latest-read-failed', latestRead.error);
      } else {
        try { peer.latestSha256 = await sha256Token(latestRead.text); }
        catch (e) { pushCode(peer.errors, 'latest-sha256-failed', errorText(e)); }
      }
    }

    if (verifyLatest) {
      if (peer.latestSha256 && peer.sidecarSha256) {
        peer.shaMatches = peer.latestSha256 === peer.sidecarSha256;
        if (!peer.shaMatches) pushCode(peer.errors, 'latest-sha-sidecar-mismatch');
      } else {
        peer.shaMatches = false;
      }
    }

    if (!peer.peerKey) {
      var keySource = (stateJson && cleanString(stateJson.syncPeerId)) || safePeerDir;
      try { peer.peerKey = (await sha256Hex(keySource)).slice(0, 12); }
      catch (_) { peer.peerKey = cleanString(safePeerDir).slice(0, 12); }
    }
    if (!peer.syncPeerIdRedacted && stateJson && stateJson.syncPeerId) {
      peer.syncPeerIdRedacted = redactSyncPeerId(stateJson.syncPeerId);
    }

    return peer;
  }

  function summarize(peers) {
    var summary = {
      okPeers: 0,
      warningPeers: 0,
      errorPeers: 0,
      shaMismatchCount: 0,
      missingLatestCount: 0,
      missingStateCount: 0,
      missingShaCount: 0,
      malformedStateCount: 0,
    };
    peers.forEach(function (peer) {
      if (peer.errors.length) summary.errorPeers += 1;
      else if (peer.warnings.length) summary.warningPeers += 1;
      else summary.okPeers += 1;

      if (peer.shaMatches === false) summary.shaMismatchCount += 1;
      if (!peer.latestExists) summary.missingLatestCount += 1;
      if (!peer.shaExists) summary.missingShaCount += 1;
      if (peer.errors.some(function (e) { return e.code === 'state-missing' || e.code === 'state-read-failed'; })) {
        summary.missingStateCount += 1;
      }
      if (peer.errors.some(function (e) { return e.code === 'state-json-parse-failed'; })) {
        summary.malformedStateCount += 1;
      }
    });
    return summary;
  }

  async function scan(options) {
    var startedAt = Date.now();
    var opts = safeObject(options);
    var includeSensitive = opts.includeSensitive === true;
    var verifyLatest = opts.verifyLatest !== false;
    var report = {
      schema: REPORT_SCHEMA,
      generatedAt: nowIso(),
      rootPath: displayPath(SYNC_FOLDER_NAME),
      devicesPath: displayPath(devicesPath()),
      peerCount: 0,
      verifyLatest: verifyLatest,
      redacted: !includeSensitive,
      peers: [],
      summary: summarize([]),
      errors: [],
      warnings: [],
      durationMs: 0,
      ok: false,
    };

    try {
      var entries = await fsReadDir(devicesPath(), homeOptions());
      var dirs = (Array.isArray(entries) ? entries : []).filter(function (entry) {
        var name = entryName(entry);
        if (!name || name.charAt(0) === '.') return false;
        return isDirectoryEntry(entry);
      });

      for (var i = 0; i < dirs.length; i += 1) {
        var safePeerDir = entryName(dirs[i]);
        if (!safePeerDir) continue;
        report.peers.push(await scanPeer(safePeerDir, {
          includeSensitive: includeSensitive,
          verifyLatest: verifyLatest,
        }));
      }
    } catch (e) {
      pushCode(report.errors, 'devices-read-failed', errorText(e));
      state.lastError = errorText(e);
    }

    report.peerCount = report.peers.length;
    report.summary = summarize(report.peers);
    report.durationMs = Date.now() - startedAt;
    report.ok = report.errors.length === 0 && report.summary.errorPeers === 0;
    state.lastScanAt = report.generatedAt;
    state.lastSummary = Object.assign({ peerCount: report.peerCount, ok: report.ok }, report.summary);
    state.lastOptions = { verifyLatest: verifyLatest, redacted: !includeSensitive };
    if (report.ok) state.lastError = null;
    return report;
  }

  function diagnose() {
    return {
      installed: true,
      desktopOnly: true,
      readOnly: true,
      schema: REPORT_SCHEMA,
      peerStateSchema: PEER_STATE_SCHEMA,
      rootPath: displayPath(SYNC_FOLDER_NAME),
      devicesPath: displayPath(devicesPath()),
      api: [
        'H2O.Studio.peerDiscovery.scan()',
        'H2O.Studio.peerDiscovery.scan({ verifyLatest: true })',
        'H2O.Studio.peerDiscovery.scan({ verifyLatest: false })',
        'H2O.Studio.peerDiscovery.scan({ includeSensitive: true })',
        'H2O.Studio.peerDiscovery.diagnose()',
      ],
      lastScanAt: state.lastScanAt,
      lastSummary: state.lastSummary,
      lastError: state.lastError,
      lastOptions: state.lastOptions,
      installedAt: state.installedAt,
    };
  }

  H2O.Studio.peerDiscovery = {
    __peerDiscoveryInstalled: true,
    scan: scan,
    diagnose: diagnose,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
