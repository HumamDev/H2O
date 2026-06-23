/* H2O Studio Dev Smoke - Desktop Folder Sync RC File Queue
 *
 * Desktop/Tauri-only file-command queue for packaged/local folder-sync smoke
 * automation. This bridge is disabled unless the shared Slice 2 smoke registry
 * gates are enabled, reads one scoped command file, writes redacted result
 * files under one scoped results directory, and dispatches only through:
 *
 *   H2O.Studio.devSmoke.folderSync.run(op, payload)
 *
 * No HTTP server, arbitrary JS execution, raw SQL, hard delete, purge,
 * tombstone propagation apply, chat deletion, or snapshot deletion behavior is
 * introduced here.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.devSmoke = H2O.Studio.devSmoke || {};
  if (H2O.Studio.devSmoke.folderSyncQueue && H2O.Studio.devSmoke.folderSyncQueue.__installed) return;

  var SCHEMA = 'h2o.studio.dev-smoke.folder-sync.desktop-queue.v1';
  var RESULT_SCHEMA = 'h2o.studio.dev-smoke.folder-sync.desktop-queue-result.v1';
  var PHASE = 'folder-sync-rc-smoke-desktop-queue';
  var VERSION = '0.1.0-slice3';
  var SMOKE_ROOT = '/Users/hobayda/H2O Studio Sync/.h2o-smoke';
  var SMOKE_ROOT_HOME_RELATIVE = 'H2O Studio Sync/.h2o-smoke';
  var COMMAND_PATH = SMOKE_ROOT + '/desktop-command.json';
  var COMMAND_FS_PATH = SMOKE_ROOT_HOME_RELATIVE + '/desktop-command.json';
  var RESULTS_DIR = SMOKE_ROOT + '/results';
  var RESULTS_FS_DIR = SMOKE_ROOT_HOME_RELATIVE + '/results';
  var POLL_INTERVAL_MS = 3000;
  var MAX_PROCESSED_IDS = 120;
  var DESKTOP_SURFACES = Object.freeze({
    'desktop-studio': true,
    desktop: true,
    tauri: true,
  });

  var state = {
    installedAt: nowIso(),
    started: false,
    pollIntervalMs: POLL_INTERVAL_MS,
    timer: null,
    inFlight: false,
    lastStatus: '',
    lastError: '',
    lastCommandId: '',
    lastCommandHash: '',
    lastResultPath: '',
    lastProcessedAt: '',
    lastDuplicateAt: '',
    lastMalformedAt: '',
    lastMalformedHash: '',
    readCount: 0,
    writeCount: 0,
    duplicateCount: 0,
    malformedCount: 0,
    disabledPollCount: 0,
    processedCommandIds: Object.create(null),
    processedOrder: [],
  };

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return ''; }
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function safeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* ignore */ }
    return false;
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

  function isAbsolutePath(path) {
    var text = String(path || '');
    return text.charAt(0) === '/' || /^[A-Za-z]:[\\/]/.test(text);
  }

  function getHomeBaseDir() {
    return 21;
  }

  function readOptionsForPath(path) {
    return isAbsolutePath(path) ? {} : { baseDir: getHomeBaseDir() };
  }

  function decodeToText(raw, contextPath) {
    if (raw == null) throw new Error('decodeToText: null response for ' + cleanString(contextPath));
    if (typeof raw === 'string') return raw;
    if (raw instanceof Uint8Array) return new TextDecoder('utf-8').decode(raw);
    if (raw instanceof ArrayBuffer) return new TextDecoder('utf-8').decode(new Uint8Array(raw));
    if (Array.isArray(raw)) {
      var bytes = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i += 1) {
        var value = raw[i];
        if (typeof value !== 'number' || value < 0 || value > 255 || (value | 0) !== value) {
          throw new Error('decodeToText: non-byte array element at ' + i);
        }
        bytes[i] = value;
      }
      return new TextDecoder('utf-8').decode(bytes);
    }
    if (raw && typeof raw === 'object' && typeof raw.byteLength === 'number' && raw.buffer instanceof ArrayBuffer) {
      return new TextDecoder('utf-8').decode(new Uint8Array(raw.buffer, raw.byteOffset || 0, raw.byteLength));
    }
    throw new Error('decodeToText: unsupported response type for ' + cleanString(contextPath));
  }

  async function fsReadTextFile(path) {
    var fs = getTauriFsFacade();
    if (fs && typeof fs.readTextFile === 'function') {
      return decodeToText(await fs.readTextFile(path, readOptionsForPath(path)), path);
    }
    var invoke = getInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable for fs read_text_file');
    var options = readOptionsForPath(path);
    try {
      return decodeToText(await invoke('plugin:fs|read_text_file', { path: path, options: options }), path);
    } catch (textErr) {
      try {
        return decodeToText(await invoke('plugin:fs|read_file', { path: path, options: options }), path);
      } catch (bytesErr) {
        if (Object.keys(options).length > 0) {
          try {
            return decodeToText(await invoke('plugin:fs|read_text_file', { path: path }), path);
          } catch (_) { /* preserve paired error below */ }
        }
        throw new Error(String((textErr && textErr.message) || textErr) +
          ' / fallback read_file failed: ' + String((bytesErr && bytesErr.message) || bytesErr));
      }
    }
  }

  async function fsMkdir(path) {
    var options = Object.assign({ recursive: true }, readOptionsForPath(path));
    var fs = getTauriFsFacade();
    if (fs && typeof fs.mkdir === 'function') return fs.mkdir(path, options);
    var invoke = getInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable for fs mkdir');
    try {
      return await invoke('plugin:fs|mkdir', { path: path, options: options });
    } catch (e) {
      return invoke('plugin:fs|mkdir', { path: path, options: { recursive: true } });
    }
  }

  async function fsWriteTextFile(path, text) {
    var body = String(text || '');
    var options = readOptionsForPath(path);
    var fs = getTauriFsFacade();
    if (fs && typeof fs.writeTextFile === 'function') return fs.writeTextFile(path, body, options);
    var invoke = getInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable for fs write_text_file');
    try {
      return await invoke('plugin:fs|write_text_file', { path: path, contents: body, options: options });
    } catch (objectErr) {
      var bytes = new TextEncoder().encode(body);
      try {
        return await invoke('plugin:fs|write_text_file', bytes, {
          headers: {
            path: encodeURIComponent(path),
            options: JSON.stringify(options || {}),
          },
        });
      } catch (bytesErr) {
        throw new Error(String((objectErr && objectErr.message) || objectErr) +
          ' / fallback write_text_file failed: ' + String((bytesErr && bytesErr.message) || bytesErr));
      }
    }
  }

  function isMissingFileError(error) {
    var text = String((error && error.message) || error || '').toLowerCase();
    return text.indexOf('not found') >= 0 ||
      text.indexOf('no such file') >= 0 ||
      text.indexOf('os error 2') >= 0 ||
      text.indexOf('enoent') >= 0 ||
      text.indexOf('notfound') >= 0;
  }

  function simpleHash(text) {
    var hash = 2166136261;
    var source = String(text || '');
    for (var i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
  }

  function safeFileToken(value, fallback) {
    var token = cleanString(value).replace(/[^A-Za-z0-9._:@-]/g, '-').slice(0, 180);
    return token || fallback || ('command-' + Date.now().toString(36));
  }

  function resultPathForCommand(commandId) {
    return RESULTS_DIR + '/' + safeFileToken(commandId, 'command') + '.json';
  }

  function resultFsPathForCommand(commandId) {
    return RESULTS_FS_DIR + '/' + safeFileToken(commandId, 'command') + '.json';
  }

  function safetyFlags() {
    return {
      privacy: { redacted: true },
      noArbitraryEval: true,
      noRawSql: true,
      noHardDelete: true,
      noPurge: true,
      noTombstonePropagationApply: true,
      noChatDelete: true,
      noSnapshotDelete: true,
      noBroadFilesystemAccess: true,
      commandPathScoped: COMMAND_PATH.indexOf(SMOKE_ROOT + '/') === 0,
      resultPathScoped: RESULTS_DIR.indexOf(SMOKE_ROOT + '/') === 0,
      tauriFsRootScoped: COMMAND_FS_PATH.indexOf(SMOKE_ROOT_HOME_RELATIVE + '/') === 0 &&
        RESULTS_FS_DIR.indexOf(SMOKE_ROOT_HOME_RELATIVE + '/') === 0,
    };
  }

  function baseQueueResult(extra) {
    var registry = getRegistry();
    var gates = registry && typeof registry.diagnoseGates === 'function'
      ? registry.diagnoseGates()
      : null;
    return Object.assign({
      schema: RESULT_SCHEMA,
      phase: PHASE,
      version: VERSION,
      ok: false,
      status: 'queue-result',
      surface: 'desktop-studio',
      adapter: 'tauri',
      observedAt: nowIso(),
      commandPath: COMMAND_PATH,
      commandFsPath: COMMAND_FS_PATH,
      resultsDir: RESULTS_DIR,
      resultsFsDir: RESULTS_FS_DIR,
      registryGatesEnabled: !!(gates && gates.enabled),
    }, safetyFlags(), extra || {});
  }

  function summarizeError(error) {
    return {
      message: cleanString((error && error.message) || error).slice(0, 300),
      code: cleanString(error && error.code).slice(0, 80),
    };
  }

  function getRegistry() {
    return H2O.Studio.devSmoke && H2O.Studio.devSmoke.folderSync;
  }

  function diagnoseGates() {
    var registry = getRegistry();
    var registryGates = registry && typeof registry.diagnoseGates === 'function'
      ? registry.diagnoseGates()
      : null;
    var blockers = [];
    if (!detectTauri()) blockers.push('desktop-tauri-required');
    if (!registry || registry.__installed !== true) blockers.push('smoke-registry-required');
    if (!registryGates || registryGates.enabled !== true) blockers.push('smoke-registry-gates-required');
    if (registryGates && registryGates.surface !== 'desktop-studio') blockers.push('desktop-studio-surface-required');
    if (registryGates && registryGates.adapter !== 'tauri') blockers.push('tauri-adapter-required');
    return {
      schema: SCHEMA + '.gates',
      phase: PHASE,
      enabled: blockers.length === 0,
      surface: registryGates && registryGates.surface || (detectTauri() ? 'desktop-studio' : 'unknown'),
      adapter: registryGates && registryGates.adapter || (detectTauri() ? 'tauri' : 'unknown'),
      observedAt: nowIso(),
      commandPath: COMMAND_PATH,
      commandFsPath: COMMAND_FS_PATH,
      resultsDir: RESULTS_DIR,
      resultsFsDir: RESULTS_FS_DIR,
      registryGates: registryGates,
      blockers: blockers,
      privacy: { redacted: true },
    };
  }

  function diagnose() {
    var gates = diagnoseGates();
    return Object.assign({
      schema: SCHEMA + '.diagnostic',
      phase: PHASE,
      version: VERSION,
      enabled: gates.enabled,
      started: state.started,
      inFlight: state.inFlight,
      pollIntervalMs: state.pollIntervalMs,
      commandPath: COMMAND_PATH,
      commandFsPath: COMMAND_FS_PATH,
      resultsDir: RESULTS_DIR,
      resultsFsDir: RESULTS_FS_DIR,
      lastStatus: state.lastStatus,
      lastError: state.lastError,
      lastCommandId: state.lastCommandId,
      lastResultPath: state.lastResultPath,
      lastProcessedAt: state.lastProcessedAt,
      readCount: state.readCount,
      writeCount: state.writeCount,
      duplicateCount: state.duplicateCount,
      malformedCount: state.malformedCount,
      disabledPollCount: state.disabledPollCount,
      processedCommandCount: state.processedOrder.length,
      gates: gates,
    }, safetyFlags());
  }

  function validateCommand(command) {
    var cmd = safeObject(command);
    var commandId = cleanString(cmd.commandId);
    var op = cleanString(cmd.op);
    var createdAt = cleanString(cmd.createdAt);
    var surface = cleanString(cmd.surface);
    var payload = cmd.payload === undefined ? {} : cmd.payload;
    var blockers = [];
    if (!commandId) blockers.push('command-id-required');
    else if (!/^[A-Za-z0-9._:@-]{1,180}$/.test(commandId)) blockers.push('invalid-command-id');
    if (!op) blockers.push('op-required');
    else if (!/^[A-Za-z0-9._:-]{1,120}$/.test(op)) blockers.push('invalid-op');
    if (!createdAt) blockers.push('created-at-required');
    else if (Number.isNaN(Date.parse(createdAt))) blockers.push('invalid-created-at');
    if (surface && !DESKTOP_SURFACES[surface]) blockers.push('surface-mismatch');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) blockers.push('invalid-payload');
    return {
      ok: blockers.length === 0,
      commandId: commandId,
      op: op,
      createdAt: createdAt,
      surface: surface,
      payload: safeObject(payload),
      blockers: blockers,
    };
  }

  function rememberProcessed(commandId, resultPath) {
    var id = cleanString(commandId);
    if (!id) return;
    if (!state.processedCommandIds[id]) state.processedOrder.push(id);
    state.processedCommandIds[id] = {
      commandId: id,
      resultPath: resultPath || resultPathForCommand(id),
      processedAt: nowIso(),
    };
    while (state.processedOrder.length > MAX_PROCESSED_IDS) {
      var stale = state.processedOrder.shift();
      delete state.processedCommandIds[stale];
    }
  }

  async function writeResult(commandId, result) {
    var id = safeFileToken(commandId, 'command');
    var path = resultPathForCommand(id);
    var fsPath = resultFsPathForCommand(id);
    await fsMkdir(RESULTS_FS_DIR);
    await fsWriteTextFile(fsPath, JSON.stringify(result, null, 2) + '\n');
    state.writeCount += 1;
    state.lastResultPath = path;
    return path;
  }

  async function writeMalformedResult(rawText, reason) {
    var hash = simpleHash(rawText);
    if (state.lastMalformedHash === hash) {
      state.lastStatus = 'malformed-command-duplicate-suppressed';
      return baseQueueResult({
        ok: false,
        status: 'malformed-command-duplicate-suppressed',
        commandId: 'malformed-' + hash,
        op: '',
        duplicate: true,
        malformed: true,
      });
    }
    state.lastMalformedHash = hash;
    state.lastMalformedAt = nowIso();
    state.malformedCount += 1;
    var commandId = 'malformed-' + hash;
    var result = baseQueueResult({
      ok: false,
      status: 'malformed-command',
      commandId: commandId,
      op: '',
      malformed: true,
      blockers: [cleanString(reason) || 'malformed-command'],
      error: { message: cleanString(reason).slice(0, 300) },
    });
    var path = await writeResult(commandId, result);
    result.resultPath = path;
    state.lastStatus = result.status;
    return result;
  }

  async function processCommand(command, rawHash, triggerReason) {
    var validation = validateCommand(command);
    if (!validation.ok) {
      return writeMalformedResult(JSON.stringify(command || {}), validation.blockers.join(','));
    }
    if (state.processedCommandIds[validation.commandId]) {
      state.duplicateCount += 1;
      state.lastDuplicateAt = nowIso();
      state.lastStatus = 'duplicate-command-id';
      return baseQueueResult({
        ok: true,
        status: 'duplicate-command-id',
        duplicate: true,
        commandId: validation.commandId,
        op: validation.op,
        originalResultPath: state.processedCommandIds[validation.commandId].resultPath,
        rawHash: rawHash,
        noCommandExecuted: true,
      });
    }

    var registry = getRegistry();
    if (!registry || typeof registry.run !== 'function') {
      return baseQueueResult({
        ok: false,
        status: 'smoke-registry-unavailable',
        commandId: validation.commandId,
        op: validation.op,
        blockers: ['smoke-registry-unavailable'],
      });
    }

    var runPayload = Object.assign({}, validation.payload, {
      commandId: validation.commandId,
      createdAt: validation.createdAt,
      expectedSurface: 'desktop-studio',
      smokeQueueTrigger: cleanString(triggerReason) || 'desktop-file-command-queue',
    });
    var registryResult = await registry.run(validation.op, runPayload);
    var result = baseQueueResult({
      ok: registryResult && registryResult.ok === true,
      status: cleanString(registryResult && registryResult.status) || 'registry-command-completed',
      commandId: validation.commandId,
      op: validation.op,
      createdAt: validation.createdAt,
      commandSurface: validation.surface || 'desktop-studio',
      rawHash: rawHash,
      result: registryResult || null,
    });
    var resultPath = await writeResult(validation.commandId, result);
    result.resultPath = resultPath;
    rememberProcessed(validation.commandId, resultPath);
    state.lastStatus = result.status;
    state.lastCommandId = validation.commandId;
    state.lastCommandHash = rawHash;
    state.lastProcessedAt = nowIso();
    return result;
  }

  async function pollOnce(options) {
    if (state.inFlight) {
      return baseQueueResult({ ok: false, status: 'poll-in-flight', inFlight: true });
    }
    state.inFlight = true;
    try {
      var gates = diagnoseGates();
      if (!gates.enabled) {
        state.disabledPollCount += 1;
        state.lastStatus = 'smoke-desktop-queue-disabled';
        return baseQueueResult({
          ok: false,
          disabled: true,
          status: 'smoke-desktop-queue-disabled',
          gates: gates,
        });
      }

      var rawText = '';
      try {
        rawText = await fsReadTextFile(COMMAND_FS_PATH);
      } catch (readErr) {
        if (isMissingFileError(readErr)) {
          state.lastStatus = 'command-file-missing';
          return baseQueueResult({ ok: true, status: 'command-file-missing', noCommandFile: true });
        }
        state.lastError = cleanString((readErr && readErr.message) || readErr).slice(0, 300);
        state.lastStatus = 'command-read-failed';
        return baseQueueResult({
          ok: false,
          status: 'command-read-failed',
          blockers: ['command-read-failed'],
          error: summarizeError(readErr),
        });
      }
      state.readCount += 1;
      var rawHash = simpleHash(rawText);
      var command;
      try {
        command = JSON.parse(rawText);
      } catch (parseErr) {
        return writeMalformedResult(rawText, 'command-json-parse-failed');
      }
      return processCommand(command, rawHash, safeObject(options).reason || 'poll');
    } catch (error) {
      state.lastError = cleanString((error && error.message) || error).slice(0, 300);
      state.lastStatus = 'queue-poll-threw';
      return baseQueueResult({
        ok: false,
        status: 'queue-poll-threw',
        blockers: ['queue-poll-threw'],
        error: summarizeError(error),
      });
    } finally {
      state.inFlight = false;
    }
  }

  function start() {
    if (!detectTauri()) return diagnose();
    if (state.started) return diagnose();
    state.started = true;
    state.timer = global.setInterval(function () {
      pollOnce({ reason: 'interval' }).catch(function (error) {
        state.lastError = cleanString((error && error.message) || error).slice(0, 300);
        state.lastStatus = 'interval-poll-failed';
      });
    }, state.pollIntervalMs);
    return diagnose();
  }

  function stop() {
    if (state.timer) {
      try { global.clearInterval(state.timer); }
      catch (_) { /* ignore */ }
    }
    state.timer = null;
    state.started = false;
    return diagnose();
  }

  H2O.Studio.devSmoke.folderSyncQueue = {
    __installed: true,
    __version: VERSION,
    schema: SCHEMA,
    phase: PHASE,
    commandPath: COMMAND_PATH,
    resultsDir: RESULTS_DIR,
    diagnose: diagnose,
    diagnoseGates: diagnoseGates,
    pollOnce: pollOnce,
    start: start,
    stop: stop,
  };

  if (detectTauri()) {
    try {
      global.setTimeout(function () { start(); }, 1000);
    } catch (_) { /* ignore */ }
  }
})(typeof window !== 'undefined' ? window : globalThis);
