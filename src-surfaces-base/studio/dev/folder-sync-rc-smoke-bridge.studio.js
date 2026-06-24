/* H2O Studio Dev Smoke - Folder Sync RC Registry
 *
 * Shared, disabled-by-default command registry for packaged/local folder-sync
 * smoke automation. This slice exposes an allowlisted in-page dispatcher only.
 * It does not add a Chrome CDP runner, Desktop file queue, arbitrary eval,
 * raw SQL access, purge, hard delete, tombstone propagation apply, or
 * chat/snapshot deletion behavior.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.devSmoke = H2O.Studio.devSmoke || {};
  if (H2O.Studio.devSmoke.folderSync && H2O.Studio.devSmoke.folderSync.__installed) return;

  var SCHEMA = 'h2o.studio.dev-smoke.folder-sync.registry.v1';
  var PHASE = 'folder-sync-rc-smoke-bridge';
  var VERSION = '0.1.0-slice2';
  var URL_FLAG = 'h2oSmokeBridge';
  var OPT_IN_KEY = 'h2o:studio:smoke-bridge:enabled:v1';
  var REQUIRED_VALUE = 'folder-sync-rc';
  var FOLDER_METADATA_OPERATION_SCHEMA = 'h2o.folder-metadata-operation.v1';
  var FOLDER_STATE_DATA_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';
  var REFRESH_EVENT = 'evt:h2o:library-index:refresh-request';

  var ALLOWED_OPS = Object.freeze([
    'getFolderModel',
    'createFolder',
    'renameFolder',
    'setFolderColor',
    'syncNow',
    'diagnoseHealth',
    'requestFolderDelete',
    'listFolderDeleteRequests',
    'applyFolderDeleteRequest',
    'listFolderDeleteReceipts',
    'listActiveFolderTombstones',
    'listRecentlyDeletedFolders',
    'restoreFolder',
    'countChatsSnapshots',
    'verifyFolderVisible',
    'verifyFolderHidden',
  ]);
  var ALLOWED_OP_SET = ALLOWED_OPS.reduce(function (acc, op) {
    acc[op] = true;
    return acc;
  }, Object.create(null));
  var DESKTOP_ONLY_OPS = Object.freeze({
    applyFolderDeleteRequest: true,
    listActiveFolderTombstones: true,
    listRecentlyDeletedFolders: true,
    restoreFolder: true,
  });
  var CHROME_ONLY_OPS = Object.freeze({
    requestFolderDelete: true,
  });
  var FORBIDDEN_OPS = Object.freeze([
    'eval',
    'rawSql',
    'hardDelete',
    'purge',
    'applyTombstonePropagation',
    'deleteChat',
    'deleteSnapshot',
  ]);

  var lastRun = null;

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

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function codeList(value) {
    return safeArray(value).map(function (entry) {
      if (typeof entry === 'string') return cleanString(entry);
      return cleanString(entry && (entry.code || entry.status || entry.reason));
    }).filter(Boolean).slice(0, 16);
  }

  function isValidId(value) {
    if (value == null || value === '') return true;
    return /^[A-Za-z0-9._:@-]{1,180}$/.test(String(value));
  }

  function normalizeColor(value) {
    var color = cleanString(value);
    if (!color) return '';
    if (/^#[0-9A-Fa-f]{6}$/.test(color)) return color.toUpperCase();
    return color;
  }

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* ignore */ }
    return false;
  }

  function detectChromeExtension() {
    try {
      return !!(global.chrome && global.chrome.runtime && global.chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function detectSurface() {
    var href = '';
    var protocol = '';
    var hostname = '';
    try {
      href = String(global.location && global.location.href || '');
      protocol = String(global.location && global.location.protocol || '');
      hostname = String(global.location && global.location.hostname || '');
    } catch (_) { /* ignore */ }
    if (detectTauri()) {
      return { kind: 'desktop-studio', adapter: 'tauri', href: href, protocol: protocol, hostname: hostname };
    }
    if (detectChromeExtension() || protocol === 'chrome-extension:') {
      return { kind: 'chrome-studio', adapter: 'mv3', href: href, protocol: protocol, hostname: hostname };
    }
    return { kind: 'web-studio', adapter: 'web', href: href, protocol: protocol, hostname: hostname };
  }

  function readUrlFlag() {
    try {
      var url = new URL(global.location && global.location.href || '');
      return cleanString(url.searchParams.get(URL_FLAG));
    } catch (_) {
      return '';
    }
  }

  function readLocalOptIn() {
    try {
      return cleanString(global.localStorage && global.localStorage.getItem(OPT_IN_KEY));
    } catch (_) {
      return '';
    }
  }

  function knownLocalDevSurface(surface) {
    var s = surface || detectSurface();
    if (s.kind === 'desktop-studio') return true;
    if (s.kind === 'chrome-studio') return true;
    return s.hostname === '127.0.0.1' || s.hostname === 'localhost' || s.hostname === '::1';
  }

  function publicReleaseFlagActive() {
    try {
      if (global.H2O_PUBLIC_RELEASE === true) return true;
      if (H2O.Studio && H2O.Studio.release && H2O.Studio.release.publicRelease === true) return true;
      if (H2O.Studio && H2O.Studio.config && H2O.Studio.config.publicRelease === true) return true;
    } catch (_) { /* ignore */ }
    try {
      if (global.localStorage && global.localStorage.getItem('h2o:studio:public-release:v1') === 'true') return true;
    } catch (_) { /* ignore */ }
    try {
      var root = global.document && global.document.documentElement;
      if (root && root.getAttribute('data-h2o-public-release') === '1') return true;
    } catch (_) { /* ignore */ }
    return false;
  }

  function diagnoseGates() {
    var surface = detectSurface();
    var urlFlag = readUrlFlag();
    var localOptIn = readLocalOptIn();
    var localStorageOptIn = localOptIn === REQUIRED_VALUE;
    var knownSurface = knownLocalDevSurface(surface);
    var publicReleaseBlocked = !publicReleaseFlagActive();
    var chromeAttachLocalOptIn = surface.kind === 'chrome-studio' &&
      localStorageOptIn &&
      knownSurface &&
      publicReleaseBlocked;
    var urlFlagSatisfied = urlFlag === REQUIRED_VALUE || chromeAttachLocalOptIn;
    var checks = {
      urlFlag: urlFlag === REQUIRED_VALUE,
      urlFlagSatisfied: urlFlagSatisfied,
      chromeAttachLocalOptIn: chromeAttachLocalOptIn,
      localStorageOptIn: localStorageOptIn,
      knownLocalDevSurface: knownSurface,
      publicReleaseBlocked: publicReleaseBlocked,
    };
    var blockers = [];
    if (!checks.urlFlagSatisfied) blockers.push('url-flag-required');
    if (!checks.localStorageOptIn) blockers.push('local-storage-opt-in-required');
    if (!checks.knownLocalDevSurface) blockers.push('known-local-dev-surface-required');
    if (!checks.publicReleaseBlocked) blockers.push('public-release-flag-active');
    return {
      schema: SCHEMA + '.gates',
      phase: PHASE,
      enabled: blockers.length === 0,
      surface: surface.kind,
      adapter: surface.adapter,
      observedAt: nowIso(),
      urlFlagName: URL_FLAG,
      urlFlagValue: urlFlag ? 'present' : '',
      urlFlagRequiredByFreshLaunch: true,
      urlFlagBypassedByChromeAttachLocalOptIn: chromeAttachLocalOptIn,
      localStorageKey: OPT_IN_KEY,
      localStorageOptInValue: localOptIn ? 'present' : '',
      requiredValue: REQUIRED_VALUE,
      checks: checks,
      blockers: blockers,
      privacy: { redacted: true },
    };
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
    };
  }

  function baseResult(op, extra) {
    var surface = detectSurface();
    return Object.assign({
      schema: SCHEMA,
      ok: false,
      op: cleanString(op),
      surface: surface.kind,
      adapter: surface.adapter,
      phase: PHASE,
      observedAt: nowIso(),
    }, safetyFlags(), extra || {});
  }

  function disabledResult(op, gates) {
    return baseResult(op, {
      ok: false,
      disabled: true,
      status: 'smoke-bridge-disabled',
      gates: gates || diagnoseGates(),
    });
  }

  function unsupportedResult(op, status, extra) {
    return baseResult(op, Object.assign({
      ok: false,
      status: status || 'unsupported-op-on-surface',
      blockers: [status || 'unsupported-op-on-surface'],
    }, extra || {}));
  }

  function normalizeEnvelope(opInput, payloadInput) {
    var envelope = {};
    if (opInput && typeof opInput === 'object' && !Array.isArray(opInput)) {
      envelope = opInput;
    }
    var payload = envelope.payload !== undefined ? envelope.payload : payloadInput;
    if (payload == null) payload = {};
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { ok: false, status: 'invalid-payload', op: cleanString(envelope.op || opInput), payload: {} };
    }
    var op = cleanString(envelope.op || opInput);
    var commandId = cleanString(envelope.commandId || payload.commandId);
    var createdAt = cleanString(envelope.createdAt || payload.createdAt);
    var expectedSurface = cleanString(envelope.surface || envelope.expectedSurface || payload.surface || payload.expectedSurface);
    if (!op) return { ok: false, status: 'op-required', op: '', payload: payload };
    if (!isValidId(commandId)) return { ok: false, status: 'invalid-command-id', op: op, payload: payload };
    if (createdAt && Number.isNaN(Date.parse(createdAt))) {
      return { ok: false, status: 'invalid-created-at', op: op, payload: payload };
    }
    if (expectedSurface && !/^[A-Za-z0-9._:-]{1,80}$/.test(expectedSurface)) {
      return { ok: false, status: 'invalid-expected-surface', op: op, payload: payload };
    }
    return {
      ok: true,
      op: op,
      payload: payload,
      commandId: commandId,
      createdAt: createdAt,
      expectedSurface: expectedSurface,
    };
  }

  function getPath(root, path) {
    var value = root;
    for (var i = 0; i < path.length; i += 1) {
      if (value == null) return null;
      value = value[path[i]];
    }
    return value;
  }

  function hasChromeStorageLocal() {
    try {
      return !!(global.chrome && global.chrome.storage && global.chrome.storage.local &&
        typeof global.chrome.storage.local.get === 'function' &&
        typeof global.chrome.storage.local.set === 'function');
    } catch (_) {
      return false;
    }
  }

  function chromeStorageGet(key) {
    return new Promise(function (resolve, reject) {
      try {
        if (!hasChromeStorageLocal()) return resolve(null);
        global.chrome.storage.local.get(key, function (items) {
          try {
            var runtime = global.chrome && global.chrome.runtime;
            if (runtime && runtime.lastError) return reject(new Error(runtime.lastError.message || 'chrome-storage-get-failed'));
          } catch (_) { /* ignore */ }
          resolve(items && items[key]);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function chromeStorageSet(items) {
    return new Promise(function (resolve, reject) {
      try {
        if (!hasChromeStorageLocal()) return reject(new Error('chrome-storage-write-unavailable'));
        global.chrome.storage.local.set(items, function () {
          try {
            var runtime = global.chrome && global.chrome.runtime;
            if (runtime && runtime.lastError) return reject(new Error(runtime.lastError.message || 'chrome-storage-set-failed'));
          } catch (_) { /* ignore */ }
          resolve(true);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function folderNameKey(value) {
    return cleanString(value).toLowerCase().replace(/\s+/g, ' ');
  }

  function folderIdSlug(value) {
    var slug = folderNameKey(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug || 'folder';
  }

  function randomToken() {
    try {
      if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
        var bytes = new Uint8Array(6);
        global.crypto.getRandomValues(bytes);
        return Array.prototype.map.call(bytes, function (byte) {
          return ('0' + byte.toString(16)).slice(-2);
        }).join('');
      }
    } catch (_) { /* ignore */ }
    return Math.floor(Math.random() * 0xFFFFFFFFFFFF).toString(16);
  }

  function makeSmokeFolderId(name, existingRows) {
    var existing = safeArray(existingRows).reduce(function (acc, row) {
      var id = cleanString(row && (row.folderId || row.id));
      if (id) acc[id] = true;
      return acc;
    }, Object.create(null));
    for (var attempt = 0; attempt < 8; attempt += 1) {
      var id = 'fold_smoke_' + folderIdSlug(name).slice(0, 48) + '_' + Date.now().toString(36) + '_' + randomToken();
      if (!existing[id]) return id;
    }
    return 'fold_smoke_' + Date.now().toString(36) + '_' + randomToken();
  }

  function availableCreateApis() {
    var rows = [];
    var actions = getPath(H2O, ['Studio', 'actions', 'folders']);
    if (actions && typeof actions.create === 'function') rows.push('actions.folders.create');
    var request = getPath(H2O, ['Studio', 'sync', 'folderMetadataOperations', 'request']);
    if (typeof request === 'function') rows.push('sync.folderMetadataOperations.request');
    if (hasChromeStorageLocal()) rows.push('chrome.folder-state-mirror');
    return rows;
  }

  function dispatchFolderStateRefresh(reason) {
    try {
      if (H2O.Library && H2O.Library.Sync && typeof H2O.Library.Sync.pingNow === 'function') {
        H2O.Library.Sync.pingNow(reason || 'folder-sync-rc-smoke-folder-create');
      }
    } catch (_) { /* ignore */ }
    try {
      if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
        global.dispatchEvent(new global.CustomEvent(REFRESH_EVENT, {
          detail: { reason: reason || 'folder-sync-rc-smoke-folder-create' },
        }));
      }
    } catch (_) { /* ignore */ }
  }

  function summarizeFolderRow(row) {
    var r = safeObject(row);
    var meta = safeObject(r.meta);
    var folderId = cleanString(r.folderId || r.id || r.recordId);
    var color = cleanString(r.iconColor || r.color || meta.iconColor || meta.color);
    return {
      folderId: folderId,
      id: folderId,
      name: cleanString(r.name || r.title || r.folderName || meta.name),
      color: color,
      iconColor: color,
      sourceKind: cleanString(r.sourceKind || r.kind || meta.sourceKind || meta.kind),
      stateSource: cleanString(r.stateSource || meta.stateSource),
      isCanonical: r.isCanonical === true,
      hidden: r.hidden === true || r.hiddenByDesktopReceipt === true || r.deletedByDesktopReceipt === true,
    };
  }

  function summarizeFolderModel(model) {
    var m = safeObject(model);
    var sourceRows = safeArray(m.canonicalRows).length
      ? safeArray(m.canonicalRows)
      : safeArray(m.folderDisplayRows).length
        ? safeArray(m.folderDisplayRows)
        : safeArray(m.rows).length
          ? safeArray(m.rows)
          : safeArray(m.folders);
    var folders = sourceRows.map(summarizeFolderRow).filter(function (row) {
      return !!(row && row.folderId);
    });
    return {
      rowCount: folders.length,
      canonicalRowCount: safeArray(m.canonicalRows).length,
      displayModelAvailable: m.displayModelAvailable === true || folders.length > 0,
      renderBlockedReason: cleanString(m.renderBlockedReason),
      folders: folders,
    };
  }

  async function getFolderModel(payload) {
    var provider = getPath(H2O, ['Library', 'FolderParity']);
    if (!provider || typeof provider.getDisplayModel !== 'function') {
      return unsupportedResult('getFolderModel', 'folder-display-model-unavailable');
    }
    var model = await provider.getDisplayModel({
      fresh: true,
      reason: cleanString(payload.reason) || 'folder-sync-rc-smoke-bridge',
    });
    return baseResult('getFolderModel', Object.assign({
      ok: true,
      status: 'folder-model-read',
    }, summarizeFolderModel(model)));
  }

  async function findFolderRow(payload) {
    var targetId = cleanString(payload.folderId || payload.id);
    var targetName = cleanString(payload.name || payload.folderName);
    var targetNameKey = folderNameKey(targetName);
    var modelResult = await getFolderModel({ reason: 'folder-sync-rc-smoke-bridge-find' });
    var rows = safeArray(modelResult.folders);
    var row = null;
    for (var i = 0; i < rows.length; i += 1) {
      if (targetId && rows[i].folderId === targetId) {
        row = rows[i];
        break;
      }
      if (!targetId && targetName && rows[i].name === targetName) {
        row = rows[i];
        break;
      }
      if (!targetId && targetNameKey && folderNameKey(rows[i].name) === targetNameKey) {
        row = rows[i];
        break;
      }
    }
    if (!row && hasChromeStorageLocal()) {
      try {
        var mirror = safeObject(await chromeStorageGet(FOLDER_STATE_DATA_KEY));
        var mirrorRows = safeArray(mirror.folders).map(summarizeFolderRow).filter(function (candidate) {
          return !!(candidate && candidate.folderId);
        });
        for (var j = 0; j < mirrorRows.length; j += 1) {
          if (targetId && mirrorRows[j].folderId === targetId) {
            row = mirrorRows[j];
            break;
          }
          if (!targetId && targetName && mirrorRows[j].name === targetName) {
            row = mirrorRows[j];
            break;
          }
          if (!targetId && targetNameKey && folderNameKey(mirrorRows[j].name) === targetNameKey) {
            row = mirrorRows[j];
            break;
          }
        }
        if (row && modelResult) {
          modelResult.mirrorFallbackUsed = true;
          modelResult.mirrorRowCount = mirrorRows.length;
        }
      } catch (_) { /* ignore mirror fallback failures */ }
    }
    return { model: modelResult, row: row, folderId: targetId || cleanString(row && row.folderId) };
  }

  function buildMetadataOperation(operationType, row, payload) {
    var sourceRow = safeObject(row);
    var folderId = cleanString(payload.folderId || payload.id || sourceRow.folderId);
    var op = {
      schema: FOLDER_METADATA_OPERATION_SCHEMA,
      operationType: operationType,
      folderId: folderId,
      sourceSurface: detectSurface().kind,
      reason: cleanString(payload.reason) || 'folder-sync-rc-smoke-bridge',
    };
    if (operationType === 'create-folder') {
      delete op.folderId;
      op.after = { name: cleanString(payload.name || payload.folderName) };
    } else if (operationType === 'rename-folder') {
      op.after = { name: cleanString(payload.name || payload.newName || payload.folderName) };
    } else if (operationType === 'change-folder-color') {
      op.before = row ? summarizeFolderRow(row) : undefined;
      op.after = { iconColor: normalizeColor(payload.color || payload.iconColor) };
    }
    return op;
  }

  async function requestFolderMetadataApply(operation, payload) {
    var request = getPath(H2O, ['Studio', 'sync', 'folderMetadataOperations', 'request']);
    if (typeof request !== 'function') return null;
    return request.call(H2O.Studio.sync.folderMetadataOperations, operation, {
      requestMode: 'apply',
      timeoutMs: Number(payload.timeoutMs) || 30000,
      reason: cleanString(payload.reason) || 'folder-sync-rc-smoke-bridge',
    });
  }

  async function requestFolderMetadataPreview(operation, payload) {
    var request = getPath(H2O, ['Studio', 'sync', 'folderMetadataOperations', 'request']);
    if (typeof request !== 'function') return null;
    return request.call(H2O.Studio.sync.folderMetadataOperations, operation, {
      requestMode: 'preview',
      timeoutMs: Number(payload.timeoutMs) || 30000,
      reason: cleanString(payload.reason) || 'folder-sync-rc-smoke-bridge',
    });
  }

  function summarizeMutationResult(op, result) {
    var r = safeObject(result);
    return baseResult(op, {
      ok: r.ok === true,
      status: cleanString(r.status || r.action || (r.ok === true ? 'ok' : 'not-ok')),
      action: cleanString(r.action),
      reviewId: cleanString(r.reviewId || r.requestId || r.id),
      requestId: cleanString(r.requestId || r.reviewId || r.id),
      folderId: cleanString(r.folderId || r.id || (r.after && (r.after.folderId || r.after.id))),
      tombstoneId: cleanString(r.tombstoneId || r.tombstone_id),
      name: cleanString(r.name || (r.after && (r.after.name || r.after.title))),
      color: cleanString(r.color || r.iconColor || (r.after && (r.after.iconColor || r.after.color))),
      applied: r.applied === true,
      alreadyApplied: r.alreadyApplied === true,
      alreadyRestored: r.alreadyRestored === true,
      duplicate: r.duplicate === true,
      affectedChatCount: Number(r.affectedChatCount) || 0,
      bindingCount: Number(r.bindingCount) || 0,
      bindingRestoreAttemptedCount: Number(r.bindingRestoreAttemptedCount) || 0,
      bindingRestoredCount: Number(r.bindingRestoredCount) || 0,
      bindingSkippedCount: Number(r.bindingSkippedCount) || 0,
      restoreWarnings: codeList(r.restoreWarnings),
      blockers: codeList(r.blockers),
      warnings: codeList(r.warnings),
      noHardDelete: true,
      noChatDelete: true,
      noSnapshotDelete: true,
    });
  }

  async function summarizeCreateFolderResult(result, payload) {
    var summary = summarizeMutationResult('createFolder', result);
    var requestedName = cleanString(payload.name || payload.folderName);
    var requestedColor = normalizeColor(payload.color || payload.iconColor);
    var diagnostics = safeObject(payload.__createDiagnostics);
    var found = null;
    if (!summary.folderId && requestedName) {
      try {
        found = await findFolderRow({ name: requestedName });
      } catch (_) {
        found = null;
      }
      if (found && found.row) {
        summary.folderId = cleanString(found.row.folderId);
        summary.id = summary.folderId;
        summary.name = cleanString(found.row.name || requestedName);
        summary.color = cleanString(found.row.color || found.row.iconColor || requestedColor);
        summary.iconColor = summary.color;
        summary.modelRowCount = Number(found.model && found.model.rowCount) || 0;
      }
    }
    if (summary.folderId) {
      summary.ok = true;
      summary.status = diagnostics.existing === true ? 'folder-created-or-existing' : 'folder-created';
      summary.id = summary.folderId;
      summary.name = cleanString(summary.name || requestedName);
      summary.color = cleanString(summary.color || requestedColor);
      summary.iconColor = cleanString(summary.iconColor || summary.color);
      summary.source = detectSurface().kind;
      summary.createPathUsed = cleanString(diagnostics.createPathUsed);
      summary.availableCreateApis = safeArray(diagnostics.availableCreateApis);
      summary.duplicateNameDetected = diagnostics.duplicateNameDetected === true;
      summary.existing = diagnostics.existing === true;
      summary.existingFolderId = cleanString(diagnostics.existingFolderId);
      summary.folderModelCountBefore = Number(diagnostics.folderModelCountBefore) || 0;
      summary.folderModelCountAfter = Number(diagnostics.folderModelCountAfter || summary.modelRowCount) || 0;
      summary.createdFolderFoundByName = diagnostics.createdFolderFoundByName === true || !!found;
      summary.rawResult = safeObject(diagnostics.rawResult);
      summary.blockers = [];
      return summary;
    }
    return baseResult('createFolder', {
      ok: false,
      status: 'folder-create-failed',
      blockers: ['folder-create-failed'],
      reason: cleanString(summary.reason || summary.status || 'created folder was not returned or visible in folder model'),
      requestedName: requestedName,
      requestedColor: requestedColor,
      createPathUsed: cleanString(diagnostics.createPathUsed),
      availableCreateApis: safeArray(diagnostics.availableCreateApis),
      duplicateNameDetected: diagnostics.duplicateNameDetected === true,
      existingFolderId: cleanString(diagnostics.existingFolderId),
      folderModelCountBefore: Number(diagnostics.folderModelCountBefore) || 0,
      folderModelCountAfter: Number(diagnostics.folderModelCountAfter) || 0,
      createdFolderFoundByName: diagnostics.createdFolderFoundByName === true,
      rawResult: safeObject(diagnostics.rawResult),
      rawStatus: cleanString(summary.status),
      rawOk: summary.ok === true,
      warnings: codeList(summary.warnings),
      noHardDelete: true,
      noChatDelete: true,
      noSnapshotDelete: true,
    });
  }

  async function createChromeFolderStateMirrorFolder(payload) {
    if (detectSurface().kind !== 'chrome-studio') return null;
    var name = cleanString(payload.name || payload.folderName);
    if (!name) return unsupportedResult('createFolder', 'folder-name-required');
    var color = normalizeColor(payload.color || payload.iconColor);
    var before = await getFolderModel({ reason: 'folder-sync-rc-smoke-create-before' });
    var beforeRows = safeArray(before.folders);
    var nameKey = folderNameKey(name);
    var existing = beforeRows.filter(function (row) {
      return !row.hidden && folderNameKey(row.name) === nameKey;
    })[0] || null;
    var diagnostics = {
      createPathUsed: 'chrome-folder-state-mirror',
      availableCreateApis: availableCreateApis(),
      folderModelCountBefore: Number(before.rowCount) || beforeRows.length,
      duplicateNameDetected: !!existing,
      existingFolderId: cleanString(existing && existing.folderId),
      existing: !!existing,
      createdFolderFoundByName: !!existing,
    };
    if (existing) {
      diagnostics.folderModelCountAfter = diagnostics.folderModelCountBefore;
      return summarizeCreateFolderResult({
        ok: true,
        status: 'folder-created-or-existing',
        folderId: existing.folderId,
        name: existing.name,
        color: existing.color || existing.iconColor || color,
      }, Object.assign({}, payload, { __createDiagnostics: diagnostics }));
    }
    if (!hasChromeStorageLocal()) {
      return baseResult('createFolder', {
        ok: false,
        status: 'folder-create-failed',
        blockers: ['folder-create-failed'],
        reason: 'chrome-storage-write-unavailable',
        requestedName: name,
        requestedColor: color,
        createPathUsed: diagnostics.createPathUsed,
        availableCreateApis: diagnostics.availableCreateApis,
        duplicateNameDetected: false,
        folderModelCountBefore: diagnostics.folderModelCountBefore,
        folderModelCountAfter: diagnostics.folderModelCountBefore,
        createdFolderFoundByName: false,
      });
    }

    var raw = safeObject(await chromeStorageGet(FOLDER_STATE_DATA_KEY));
    var folders = Array.isArray(raw.folders) ? raw.folders.slice() : [];
    var items = safeObject(raw.items);
    var storedExisting = folders.filter(function (row) {
      return folderNameKey(row && (row.name || row.title || safeObject(row.meta).name)) === nameKey;
    })[0] || null;
    if (storedExisting) {
      var storedSummary = summarizeFolderRow(storedExisting);
      diagnostics.duplicateNameDetected = true;
      diagnostics.existing = true;
      diagnostics.existingFolderId = storedSummary.folderId;
      diagnostics.createdFolderFoundByName = true;
      diagnostics.folderModelCountAfter = diagnostics.folderModelCountBefore;
      return summarizeCreateFolderResult({
        ok: true,
        status: 'folder-created-or-existing',
        folderId: storedSummary.folderId,
        name: storedSummary.name || name,
        color: storedSummary.color || color,
      }, Object.assign({}, payload, { __createDiagnostics: diagnostics }));
    }

    var now = nowIso();
    var folderId = makeSmokeFolderId(name, folders);
    var source = 'chrome-studio';
    var sourceKind = 'chrome-user-folder-create';
    var meta = Object.assign({}, safeObject(payload.meta), {
      folderId: folderId,
      name: name,
      title: name,
      color: color,
      iconColor: color,
      source: source,
      sourceKind: sourceKind,
      userCreated: true,
      materializedUserFolder: true,
      trustedFolderDisplay: true,
      shownInNormalMode: true,
      createdBy: 'chrome-studio',
      createdAt: now,
      updatedAt: now,
    });
    var row = {
      id: folderId,
      folderId: folderId,
      name: name,
      title: name,
      color: color,
      iconColor: color,
      source: source,
      sourceKind: sourceKind,
      kind: sourceKind,
      stateSource: 'stored-folder-state',
      userCreated: true,
      materializedUserFolder: true,
      trustedFolderDisplay: true,
      shownInNormalMode: true,
      createdAt: now,
      updatedAt: now,
      meta: meta,
    };
    folders.push(row);
    if (!Array.isArray(items[folderId])) items[folderId] = [];
    var nextState = Object.assign({}, raw, {
      schemaVersion: Number(raw.schemaVersion || raw.version || 1) || 1,
      source: cleanString(raw.source || raw.exportedFrom || 'stored-folder-state') || 'stored-folder-state',
      sourceKind: 'chrome-folder-state-local-mutation',
      updatedAt: now,
      folders: folders,
      items: items,
    });
    await chromeStorageSet({ [FOLDER_STATE_DATA_KEY]: nextState });
    dispatchFolderStateRefresh('folder-sync-rc-smoke-create-folder');

    var found = await findFolderRow({ name: name });
    diagnostics.folderModelCountAfter = Number(found.model && found.model.rowCount) || folders.length;
    diagnostics.createdFolderFoundByName = !!(found && found.row);
    if (!found || !found.row) {
      return baseResult('createFolder', {
        ok: false,
        status: 'folder-create-failed',
        blockers: ['folder-create-failed'],
        reason: 'created-folder-not-visible-in-display-model',
        requestedName: name,
        requestedColor: color,
        folderId: folderId,
        id: folderId,
        createPathUsed: diagnostics.createPathUsed,
        availableCreateApis: diagnostics.availableCreateApis,
        duplicateNameDetected: false,
        folderModelCountBefore: diagnostics.folderModelCountBefore,
        folderModelCountAfter: diagnostics.folderModelCountAfter,
        createdFolderFoundByName: false,
      });
    }
    return summarizeCreateFolderResult({
      ok: true,
      status: 'folder-created',
      folderId: found.row.folderId || folderId,
      name: found.row.name || name,
      color: found.row.color || found.row.iconColor || color,
    }, Object.assign({}, payload, { __createDiagnostics: diagnostics }));
  }

  function summarizeFolderSyncDiagnose(raw) {
    var r = safeObject(raw);
    var blockers = safeObject(r.blockers);
    var desktopToChrome = safeObject(r.desktopToChrome);
    var chromeToDesktop = safeObject(r.chromeToDesktop);
    var exportWriteGate = safeObject(chromeToDesktop.exportWriteGate || safeObject(r.chromeDesktopExport).exportWriteGate);
    return {
      available: !!raw,
      connected: r.connected === true,
      permission: cleanString(r.permission || chromeToDesktop.permission || desktopToChrome.permission),
      folderName: cleanString(r.folderName),
      fileSystemAccessAvailable: r.fileSystemAccessAvailable === true,
      chromeWritesSyncFolder: r.chromeWritesSyncFolder === true || chromeToDesktop.chromeWritesSyncFolder === true,
      chromeExportFlagKey: cleanString(chromeToDesktop.exportFlagKey || exportWriteGate.flagKey),
      chromeExportFlagEnabled: chromeToDesktop.exportFlagEnabled === true || exportWriteGate.effectiveFlagEnabled === true,
      chromeExportSmokeEnabled: exportWriteGate.smokeChromeExportEnabled === true,
      chromeExportSmokeOptInKey: cleanString(exportWriteGate.smokeChromeExportOptInKey),
      desktopToChromePermission: cleanString(desktopToChrome.permission),
      chromeToDesktopPermission: cleanString(chromeToDesktop.permission),
      permissionRequired: blockers.permissionRequired === true,
      noFolderHandle: blockers.noFolderHandle === true,
    };
  }

  function chromeSyncDiagnosePermissionGranted(raw) {
    var summary = summarizeFolderSyncDiagnose(raw);
    var permission = cleanString(summary.permission || summary.chromeToDesktopPermission || summary.desktopToChromePermission);
    return summary.connected === true &&
      permission === 'granted' &&
      summary.permissionRequired !== true &&
      summary.noFolderHandle !== true;
  }

  function removeHealthCodes(codes, blocked) {
    var blockedMap = blocked.reduce(function (acc, code) {
      acc[code] = true;
      return acc;
    }, Object.create(null));
    return codeList(codes).filter(function (code) { return !blockedMap[code]; });
  }

  function reconcileChromeHealthWithSyncDiagnose(health, rawDiagnose) {
    var output = Object.assign({}, safeObject(health));
    if (detectSurface().kind !== 'chrome-studio') return output;
    if (!chromeSyncDiagnosePermissionGranted(rawDiagnose)) return output;

    var permission = summarizeFolderSyncDiagnose(rawDiagnose).permission || 'granted';
    var removedPermissionCodes = ['permission-required', 'no-folder-handle'];
    output.blockers = removeHealthCodes(output.blockers, removedPermissionCodes);
    output.statusCodes = removeHealthCodes(output.statusCodes, removedPermissionCodes);

    var desktopToChrome = Object.assign({}, safeObject(output.desktopToChrome));
    desktopToChrome.permission = permission;
    output.desktopToChrome = desktopToChrome;

    var rawChromeToDesktop = safeObject(safeObject(rawDiagnose).chromeToDesktop);
    var chromeToDesktop = Object.assign({}, safeObject(output.chromeToDesktop));
    chromeToDesktop.permission = cleanString(rawChromeToDesktop.permission || permission);
    chromeToDesktop.chromeWritesSyncFolder = chromeToDesktop.chromeWritesSyncFolder === true ||
      rawChromeToDesktop.chromeWritesSyncFolder === true ||
      safeObject(rawDiagnose).chromeWritesSyncFolder === true;
    output.chromeToDesktop = chromeToDesktop;

    if (!output.blockers.length && cleanString(output.verdict) === 'blocked') {
      output.verdict = codeList(output.warnings).length ? 'warning' : 'healthy';
    }
    if (!output.blockers.length && cleanString(output.status) === 'blocked') {
      output.status = output.verdict;
    }
    if (!output.blockers.length && cleanString(output.summaryText).toLowerCase().indexOf('blocked') !== -1) {
      output.summaryText = output.verdict === 'healthy'
        ? 'Folder sync is current and no blockers are active.'
        : 'Folder sync has warnings but no blockers are active.';
    }
    output.permissionStateReconciledFromSyncDiagnose = true;
    return output;
  }

  async function createFolder(payload) {
    var name = cleanString(payload.name || payload.folderName);
    if (!name) return unsupportedResult('createFolder', 'folder-name-required');
    var chromeLocalResult = await createChromeFolderStateMirrorFolder(payload);
    if (chromeLocalResult) return chromeLocalResult;
    var actions = getPath(H2O, ['Studio', 'actions', 'folders']);
    if (actions && typeof actions.create === 'function') {
      var actionResult = await actions.create({
        name: name,
        color: normalizeColor(payload.color || payload.iconColor),
        iconColor: normalizeColor(payload.iconColor || payload.color),
        parentId: cleanString(payload.parentId),
        meta: safeObject(payload.meta),
      });
      return summarizeCreateFolderResult(actionResult, Object.assign({}, payload, {
        __createDiagnostics: {
          createPathUsed: 'actions.folders.create',
          availableCreateApis: availableCreateApis(),
          rawResult: {
            ok: safeObject(actionResult).ok === true,
            status: cleanString(safeObject(actionResult).status),
            reason: cleanString(safeObject(actionResult).reason),
          },
        },
      }));
    }
    var operation = buildMetadataOperation('create-folder', null, payload);
    var result = await requestFolderMetadataApply(operation, payload);
    if (result) return summarizeCreateFolderResult(result, Object.assign({}, payload, {
      __createDiagnostics: {
        createPathUsed: 'sync.folderMetadataOperations.request',
        availableCreateApis: availableCreateApis(),
        rawResult: {
          ok: safeObject(result).ok === true,
          status: cleanString(safeObject(result).status),
          reason: cleanString(safeObject(result).reason),
        },
      },
    }));
    return unsupportedResult('createFolder', 'unsupported-op-on-surface');
  }

  async function renameFolder(payload) {
    var folderId = cleanString(payload.folderId || payload.id);
    var newName = cleanString(payload.name || payload.newName || payload.folderName);
    if (!folderId) return unsupportedResult('renameFolder', 'folder-id-required');
    if (!newName) return unsupportedResult('renameFolder', 'folder-name-required');
    var actions = getPath(H2O, ['Studio', 'actions', 'folders']);
    if (actions && typeof actions.rename === 'function') {
      return summarizeMutationResult('renameFolder', await actions.rename(folderId, newName));
    }
    var found = await findFolderRow({ folderId: folderId });
    var operation = buildMetadataOperation('rename-folder', found.row || { folderId: folderId }, payload);
    var result = await requestFolderMetadataApply(operation, payload);
    if (result) return summarizeMutationResult('renameFolder', result);
    return unsupportedResult('renameFolder', 'unsupported-op-on-surface');
  }

  async function setChromeFolderColor(payload) {
    if (detectSurface().kind !== 'chrome-studio') return null;
    var folderId = cleanString(payload.folderId || payload.id);
    var color = normalizeColor(payload.color || payload.iconColor);
    if (!folderId) return unsupportedResult('setFolderColor', 'folder-id-required');
    if (!color) return unsupportedResult('setFolderColor', 'folder-color-required');

    var foundBefore = await findFolderRow({ folderId: folderId });
    var beforeRow = foundBefore.row || null;
    var colorBefore = cleanString(beforeRow && (beforeRow.color || beforeRow.iconColor));
    var operation = buildMetadataOperation('change-folder-color', beforeRow || { folderId: folderId }, payload);
    var preview = await requestFolderMetadataPreview(operation, payload);
    var staleGuard = safeObject(preview && preview.staleGuard);
    var staleGuardProvided = !!(cleanString(staleGuard.sourceHash) && cleanString(staleGuard.previewHash));
    if (staleGuardProvided) operation.staleGuard = staleGuard;

    var applyResult = staleGuardProvided ? await requestFolderMetadataApply(operation, payload) : null;
    var foundAfter = await findFolderRow({ folderId: folderId });
    var afterRow = foundAfter.row || null;
    var colorAfter = normalizeColor(afterRow && (afterRow.color || afterRow.iconColor));
    var apply = safeObject(applyResult);
    var rawBlockers = codeList(apply.blockers);
    var rawWarnings = codeList(apply.warnings);
    var ok = apply.ok === true && !!afterRow && colorAfter === color;
    if (ok) {
      return baseResult('setFolderColor', {
        ok: true,
        status: 'folder-color-set',
        folderId: folderId,
        id: folderId,
        color: color,
        iconColor: color,
        row: afterRow,
        applied: apply.applied === true,
        colorPathUsed: 'folder-metadata-preview-apply',
        staleGuardProvided: true,
        staleGuardSource: 'folder-metadata-preview',
        folderFoundBefore: !!beforeRow,
        folderFoundAfter: !!afterRow,
        colorBefore: colorBefore,
        colorAfter: colorAfter,
        previewStatus: cleanString(preview && preview.status),
        previewOk: safeObject(preview).ok === true,
        applyStatus: cleanString(apply.status),
        blockers: [],
        warnings: rawWarnings,
      });
    }
    return baseResult('setFolderColor', {
      ok: false,
      status: 'folder-color-set-failed',
      blockers: rawBlockers.length ? rawBlockers : ['folder-color-set-failed'],
      folderId: folderId,
      id: folderId,
      color: color,
      iconColor: color,
      applied: apply.applied === true,
      colorPathUsed: 'folder-metadata-preview-apply',
      staleGuardProvided: staleGuardProvided,
      staleGuardSource: staleGuardProvided ? 'folder-metadata-preview' : '',
      folderFoundBefore: !!beforeRow,
      folderFoundAfter: !!afterRow,
      colorBefore: colorBefore,
      colorAfter: colorAfter,
      previewStatus: cleanString(preview && preview.status),
      previewOk: safeObject(preview).ok === true,
      previewBlockers: codeList(preview && preview.blockers),
      applyStatus: cleanString(apply.status),
      applyOk: apply.ok === true,
      applyBlockers: rawBlockers,
      warnings: rawWarnings,
    });
  }

  async function setFolderColor(payload) {
    var folderId = cleanString(payload.folderId || payload.id);
    var color = normalizeColor(payload.color || payload.iconColor);
    if (!folderId) return unsupportedResult('setFolderColor', 'folder-id-required');
    var chromeResult = await setChromeFolderColor(payload);
    if (chromeResult) return chromeResult;
    var actions = getPath(H2O, ['Studio', 'actions', 'folders']);
    if (actions && typeof actions.update === 'function') {
      return summarizeMutationResult('setFolderColor', await actions.update(folderId, {
        color: color,
        iconColor: color,
      }));
    }
    var found = await findFolderRow({ folderId: folderId });
    var operation = buildMetadataOperation('change-folder-color', found.row || { folderId: folderId }, payload);
    var result = await requestFolderMetadataApply(operation, payload);
    if (result) return summarizeMutationResult('setFolderColor', result);
    return unsupportedResult('setFolderColor', 'unsupported-op-on-surface');
  }

  async function syncNow(payload) {
    var api = getPath(H2O, ['Studio', 'sync', 'folder']);
    if (!api || typeof api.syncNow !== 'function') return unsupportedResult('syncNow', 'folder-sync-api-unavailable');
    var result = safeObject(await api.syncNow(safeObject(payload)));
    return baseResult('syncNow', {
      ok: result.ok === true,
      status: cleanString(result.status),
      direction: cleanString(result.direction || payload.direction),
      transport: cleanString(result.transport),
      exportedAt: cleanString(result.exportedAt),
      importedAt: cleanString(result.importedAt || result.appliedAt),
      bytes: Number(result.bytes || result.lastExportBytes) || 0,
      blockers: codeList(result.blockers),
      warnings: codeList(result.warnings),
      folderDeleteReceiptImport: safeObject(result.folderDeleteReceiptImport),
      folderRestoreReceiptImport: safeObject(result.folderRestoreReceiptImport),
    });
  }

  async function diagnoseHealth() {
    var api = getPath(H2O, ['Studio', 'sync', 'folder']);
    var fn = api && (api.diagnoseHealth || (api.health && api.health.diagnose) || (api.diagnostics && api.diagnostics.diagnose));
    if (typeof fn !== 'function') return unsupportedResult('diagnoseHealth', 'folder-health-api-unavailable');
    var rawDiagnose = null;
    try {
      rawDiagnose = api && typeof api.diagnose === 'function' ? safeObject(await api.diagnose()) : null;
    } catch (_) {
      rawDiagnose = null;
    }
    var result = reconcileChromeHealthWithSyncDiagnose(safeObject(await fn.call(api)), rawDiagnose);
    return baseResult('diagnoseHealth', {
      ok: true,
      status: cleanString(result.verdict || result.status || 'diagnosed'),
      verdict: cleanString(result.verdict),
      summaryText: cleanString(result.summaryText),
      blockers: codeList(result.blockers),
      warnings: codeList(result.warnings),
      privacy: { redacted: true },
      deferred: safeObject(result.deferred),
      desktopToChrome: safeObject(result.desktopToChrome),
      chromeToDesktop: safeObject(result.chromeToDesktop),
      syncFolderDiagnose: summarizeFolderSyncDiagnose(rawDiagnose),
      folderDeleteReceiptImport: safeObject(result.folderDeleteReceiptImport ||
        rawDiagnose && (rawDiagnose.folderDeleteReceiptImport || safeObject(rawDiagnose.desktopToChrome).folderDeleteReceiptImport)),
      folderRestoreReceiptImport: safeObject(result.folderRestoreReceiptImport ||
        rawDiagnose && (rawDiagnose.folderRestoreReceiptImport || safeObject(rawDiagnose.desktopToChrome).folderRestoreReceiptImport)),
      lastFolderRestoreReceiptImport: safeObject(rawDiagnose &&
        (rawDiagnose.folderRestoreReceiptImport || safeObject(rawDiagnose.desktopToChrome).folderRestoreReceiptImport)),
      permissionStateReconciledFromSyncDiagnose: result.permissionStateReconciledFromSyncDiagnose === true,
      tombstoneLocalDelete: safeObject(result.tombstoneLocalDelete),
    });
  }

  async function requestFolderDelete(payload) {
    var actions = getPath(H2O, ['Studio', 'actions', 'folders']);
    var fn = actions && (actions.requestDelete || actions.requestFolderDelete);
    if (typeof fn !== 'function') return unsupportedResult('requestFolderDelete', 'folder-delete-request-api-unavailable');
    var result = await fn.call(actions, {
      folderId: cleanString(payload.folderId || payload.id),
      folderName: cleanString(payload.folderName || payload.name),
    }, {
      reason: cleanString(payload.reason) || 'folder-sync-rc-smoke-bridge',
    });
    return summarizeMutationResult('requestFolderDelete', result);
  }

  async function listFolderDeleteRequests(payload) {
    var store = getPath(H2O, ['Studio', 'store', 'tombstoneReviews']);
    var fn = store && (store.listFolderDeleteRequests || store.listReviews || store.list);
    if (typeof fn !== 'function') return unsupportedResult('listFolderDeleteRequests', 'folder-delete-review-api-unavailable');
    var rows = safeArray(await fn.call(store, Object.assign({ limit: 100 }, safeObject(payload))));
    return baseResult('listFolderDeleteRequests', {
      ok: true,
      status: 'folder-delete-requests-listed',
      count: rows.length,
      requests: rows.map(summarizeReviewRow),
    });
  }

  async function applyFolderDeleteRequest(payload) {
    var store = getPath(H2O, ['Studio', 'store', 'tombstoneReviews']);
    var fn = store && store.applyFolderDeleteRequest;
    if (typeof fn !== 'function') return unsupportedResult('applyFolderDeleteRequest', 'folder-delete-apply-api-unavailable');
    var result = await fn.call(store, {
      reviewId: cleanString(payload.reviewId || payload.requestId),
      requestId: cleanString(payload.requestId || payload.reviewId),
    }, {
      reason: cleanString(payload.reason) || 'folder-sync-rc-smoke-bridge',
    });
    return summarizeMutationResult('applyFolderDeleteRequest', result);
  }

  async function restoreFolder(payload) {
    var store = getPath(H2O, ['Studio', 'store', 'folders']);
    var fn = store && (store.restoreTombstonedFolder || store.restoreFolder);
    if (typeof fn !== 'function') return unsupportedResult('restoreFolder', 'folder-restore-api-unavailable');
    var target = {
      tombstoneId: cleanString(payload.tombstoneId),
      folderId: cleanString(payload.folderId || payload.id),
      id: cleanString(payload.tombstoneId || payload.folderId || payload.id),
    };
    var result = await fn.call(store, target, {
      reason: cleanString(payload.reason) || 'folder-sync-rc-smoke-bridge',
      restoredBySyncPeerId: cleanString(payload.restoredBySyncPeerId) || 'desktop-smoke-phase4d4',
    });
    return summarizeMutationResult('restoreFolder', result);
  }

  async function listFolderDeleteReceipts(payload) {
    var store = getPath(H2O, ['Studio', 'store', 'tombstoneReviews']);
    var fn = store && store.listFolderDeleteReceipts;
    if (typeof fn !== 'function') return unsupportedResult('listFolderDeleteReceipts', 'folder-delete-receipts-api-unavailable');
    var rows = safeArray(await fn.call(store, Object.assign({ limit: 100 }, safeObject(payload))));
    return baseResult('listFolderDeleteReceipts', {
      ok: true,
      status: 'folder-delete-receipts-listed',
      count: rows.length,
      receipts: rows.map(summarizeReceiptRow),
    });
  }

  function summarizeReviewRow(row) {
    var r = safeObject(row);
    return {
      reviewId: cleanString(r.reviewId || r.requestId || r.id),
      requestId: cleanString(r.requestId || r.reviewId || r.id),
      folderId: cleanString(r.folderId || r.recordId),
      folderName: cleanString(r.folderName || r.folderNameAtRequest),
      recordKind: cleanString(r.recordKind),
      classification: cleanString(r.classification),
      status: cleanString(r.status),
      decision: cleanString(r.decision),
      remoteSyncPeerId: cleanString(r.remoteSyncPeerId),
      warnings: codeList(r.warnings || r.warningsJson),
    };
  }

  function summarizeReceiptRow(row) {
    var r = safeObject(row);
    return {
      receiptId: cleanString(r.receiptId),
      requestId: cleanString(r.requestId || r.reviewId),
      reviewId: cleanString(r.reviewId || r.requestId),
      folderId: cleanString(r.folderId),
      status: cleanString(r.status),
      decision: cleanString(r.decision),
      tombstoneId: cleanString(r.tombstoneId),
      statusOnly: r.statusOnly === true,
      noTombstoneApply: r.noTombstoneApply === true,
      noHardDelete: r.noHardDelete === true,
      noChatDelete: r.noChatDelete === true,
    };
  }

  async function listActiveFolderTombstones(payload) {
    var store = getPath(H2O, ['Studio', 'store', 'tombstones']);
    var fn = store && (store.listTombstones || store.list);
    if (typeof fn !== 'function') return unsupportedResult('listActiveFolderTombstones', 'tombstone-store-unavailable');
    var rows = safeArray(await fn.call(store, Object.assign({
      recordKind: 'folder',
      includeRestored: true,
      limit: 500,
    }, safeObject(payload))));
    var active = rows.filter(function (row) {
      var r = safeObject(row);
      return cleanString(r.recordKind) === 'folder' &&
        !cleanString(r.restoredAt || r.restored_at);
    });
    return baseResult('listActiveFolderTombstones', {
      ok: true,
      status: 'active-folder-tombstones-listed',
      activeCount: active.length,
      totalScanned: rows.length,
      tombstones: active.map(function (row) {
        var r = safeObject(row);
        return {
          tombstoneId: cleanString(r.tombstoneId || r.tombstone_id),
          recordKind: cleanString(r.recordKind),
          recordId: cleanString(r.recordId),
          deletedAt: cleanString(r.deletedAt || r.deleted_at),
          deleteReason: cleanString(r.deleteReason || r.delete_reason),
          restoredAt: cleanString(r.restoredAt || r.restored_at),
        };
      }),
    });
  }

  async function listRecentlyDeletedFolders(payload) {
    var store = getPath(H2O, ['Studio', 'store', 'folders']);
    var fn = store && (store.listRecentlyDeletedFolders || store.diagnoseRecentlyDeletedFolders);
    if (typeof fn !== 'function') return unsupportedResult('listRecentlyDeletedFolders', 'recently-deleted-diagnostics-unavailable');
    var result = safeObject(await fn.call(store, Object.assign({ limit: 500 }, safeObject(payload))));
    var rows = safeArray(result.rows || result.items || result.list);
    var diagnostics = Object.assign({}, result, {
      rows: rows,
    });
    return baseResult('listRecentlyDeletedFolders', Object.assign({}, result, {
      ok: result.ok === true,
      status: cleanString(result.status || 'recently-deleted-folders-listed'),
      blockers: codeList(result.blockers),
      warnings: codeList(result.warnings),
      recentlyDeletedDiagnostics: diagnostics,
      rows: rows,
      items: rows,
      list: rows,
      activeTombstoneCount: Number(result.activeTombstoneCount) || 0,
      restoredTombstoneCount: Number(result.restoredTombstoneCount) || 0,
      folderTombstoneCount: Number(result.folderTombstoneCount) || 0,
      restoreAvailableCount: Number(result.restoreAvailableCount) || 0,
      purgeBlockedCount: Number(result.purgeBlockedCount) || 0,
      hardDeleteBlockedCount: Number(result.hardDeleteBlockedCount) || 0,
      retentionDays: Number(result.retentionDays) || 30,
      noHardDelete: true,
      noPurge: true,
      noChatDelete: true,
      noSnapshotDelete: true,
    }));
  }

  async function countChatsSnapshots() {
    var store = getPath(H2O, ['Studio', 'store']) || {};
    var chatCount = null;
    var snapshotCount = null;
    if (store.chats && typeof store.chats.count === 'function') {
      chatCount = Number(await store.chats.count()) || 0;
    } else {
      var indexRows = getPath(H2O, ['LibraryIndex', 'getAll']);
      if (typeof indexRows === 'function') {
        var rows = safeArray(indexRows.call(H2O.LibraryIndex));
        chatCount = rows.length;
        snapshotCount = rows.reduce(function (sum, row) {
          return sum + (Array.isArray(row && row.snapshots) ? row.snapshots.length : 0);
        }, 0);
      }
    }
    if (store.snapshots && typeof store.snapshots.count === 'function') {
      snapshotCount = Number(await store.snapshots.count()) || 0;
    }
    return baseResult('countChatsSnapshots', {
      ok: chatCount !== null || snapshotCount !== null,
      status: 'counts-read',
      chatCount: chatCount,
      snapshotCount: snapshotCount,
    });
  }

  async function verifyFolderVisibility(op, payload) {
    var found = await findFolderRow(payload);
    var visible = !!(found.row && !found.row.hidden);
    var expectVisible = op === 'verifyFolderVisible';
    return baseResult(op, {
      ok: expectVisible ? visible : !visible,
      status: visible ? 'folder-visible' : 'folder-hidden-or-missing',
      expectedVisible: expectVisible,
      visible: visible,
      folderId: cleanString(payload.folderId || payload.id || (found.row && found.row.folderId)),
      folderName: cleanString(payload.name || payload.folderName || (found.row && found.row.name)),
      row: found.row || null,
      modelRowCount: Number(found.model && found.model.rowCount) || 0,
      mirrorFallbackUsed: found.model && found.model.mirrorFallbackUsed === true,
      mirrorRowCount: Number(found.model && found.model.mirrorRowCount) || 0,
    });
  }

  async function dispatchOp(op, payload) {
    if (op === 'getFolderModel') return getFolderModel(payload);
    if (op === 'createFolder') return createFolder(payload);
    if (op === 'renameFolder') return renameFolder(payload);
    if (op === 'setFolderColor') return setFolderColor(payload);
    if (op === 'syncNow') return syncNow(payload);
    if (op === 'diagnoseHealth') return diagnoseHealth(payload);
    if (op === 'requestFolderDelete') return requestFolderDelete(payload);
    if (op === 'listFolderDeleteRequests') return listFolderDeleteRequests(payload);
    if (op === 'applyFolderDeleteRequest') return applyFolderDeleteRequest(payload);
    if (op === 'listFolderDeleteReceipts') return listFolderDeleteReceipts(payload);
    if (op === 'listActiveFolderTombstones') return listActiveFolderTombstones(payload);
    if (op === 'listRecentlyDeletedFolders') return listRecentlyDeletedFolders(payload);
    if (op === 'restoreFolder') return restoreFolder(payload);
    if (op === 'countChatsSnapshots') return countChatsSnapshots(payload);
    if (op === 'verifyFolderVisible' || op === 'verifyFolderHidden') return verifyFolderVisibility(op, payload);
    return unsupportedResult(op, 'unsupported-op');
  }

  async function run(opInput, payloadInput) {
    var gates = diagnoseGates();
    var envelope = normalizeEnvelope(opInput, payloadInput);
    if (!envelope.ok) {
      return baseResult(envelope.op, {
        ok: false,
        status: envelope.status,
        blockers: [envelope.status],
        disabled: !gates.enabled,
        gates: gates.enabled ? undefined : gates,
      });
    }
    if (!gates.enabled) return disabledResult(envelope.op, gates);
    if (!ALLOWED_OP_SET[envelope.op]) {
      return unsupportedResult(envelope.op, 'op-not-allowlisted', { allowlist: ALLOWED_OPS.slice() });
    }
    var surface = detectSurface();
    if (envelope.expectedSurface && envelope.expectedSurface !== surface.kind) {
      return unsupportedResult(envelope.op, 'surface-mismatch', {
        expectedSurface: envelope.expectedSurface,
        actualSurface: surface.kind,
      });
    }
    if (DESKTOP_ONLY_OPS[envelope.op] && surface.kind !== 'desktop-studio') {
      return unsupportedResult(envelope.op, 'unsupported-op-on-surface', { requiredSurface: 'desktop-studio' });
    }
    if (CHROME_ONLY_OPS[envelope.op] && surface.kind !== 'chrome-studio') {
      return unsupportedResult(envelope.op, 'unsupported-op-on-surface', { requiredSurface: 'chrome-studio' });
    }
    try {
      var result = await dispatchOp(envelope.op, envelope.payload);
      result.commandId = envelope.commandId || '';
      result.createdAt = envelope.createdAt || '';
      result.allowed = true;
      result.disabled = false;
      lastRun = {
        op: envelope.op,
        ok: result.ok === true,
        status: cleanString(result.status),
        surface: surface.kind,
        at: nowIso(),
      };
      return result;
    } catch (e) {
      var failed = baseResult(envelope.op, {
        ok: false,
        status: 'op-threw',
        blockers: ['op-threw'],
        reason: cleanString((e && e.message) || e),
      });
      lastRun = {
        op: envelope.op,
        ok: false,
        status: 'op-threw',
        surface: surface.kind,
        at: nowIso(),
      };
      return failed;
    }
  }

  H2O.Studio.devSmoke.folderSync = {
    __installed: true,
    __version: VERSION,
    schema: SCHEMA,
    phase: PHASE,
    storageKey: OPT_IN_KEY,
    urlFlag: URL_FLAG,
    requiredValue: REQUIRED_VALUE,
    allowlist: function () { return ALLOWED_OPS.slice(); },
    forbiddenOps: function () { return FORBIDDEN_OPS.slice(); },
    diagnoseGates: diagnoseGates,
    lastRun: function () { return lastRun ? Object.assign({}, lastRun) : null; },
    run: run,
  };
})(typeof window !== 'undefined' ? window : globalThis);
