/* H2O Studio Saved Chat Archive Diagnostics (Desktop / Tauri)
 *
 * C5.1 + C5.2: read-only inventory and package hash validation for saved-chat
 * packages under $APPLOCALDATA/archive/packages.
 *
 * Boundaries: Desktop-only, AppLocalData only, read-only fs calls only. This
 * module does not touch DB/store rows, live CAS, Sync, Chrome, import/recovery,
 * user export locations, package materialization, or UI.
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* ignore */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.ingestion = H2O.Studio.ingestion || {};

  var APP_LOCAL_DATA = 15;
  var PACKAGE_ROOT = 'archive/packages';
  var LIVE_CAS_ROOT = 'archive/assets';
  var DIAGNOSTIC_SCHEMA = 'h2o.savedChatArchiveDiagnostic.v1';
  var PACKAGE_SCHEMA = 'h2o.savedChatPackage';
  var STATUS_OK = 'ok';
  var STATUS_WARNING = 'warning';
  var STATUS_BLOCKED = 'blocked';
  var STATUS_EMPTY = 'empty';
  var STATUS_PARTIAL = 'partial';
  var REQUIRED_FILES = ['manifest.json', 'snapshot.json', 'chat.md', 'chat.html'];

  var state = {
    lastRunAt: null,
    errors: [],
  };

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }

  function recordError(op, err) {
    state.errors.push({ t: Date.now(), op: String(op), error: String((err && err.message) || err || '') });
    if (state.errors.length > 20) state.errors.splice(0, state.errors.length - 20);
  }

  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function isFiniteNumber(value) { return typeof value === 'number' && isFinite(value); }

  function joinPath() {
    var parts = [];
    for (var i = 0; i < arguments.length; i += 1) {
      var part = cleanString(arguments[i]).replace(/^\/+|\/+$/g, '');
      if (part) parts.push(part);
    }
    return parts.join('/');
  }

  function packageDirNameForPath(packagePath) {
    var path = cleanString(packagePath).replace(/[\/\\]+$/g, '');
    var idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return idx >= 0 ? path.slice(idx + 1) : path;
  }

  function packagePathIsScoped(packagePath) {
    var path = cleanString(packagePath).replace(/[\/\\]+$/g, '');
    return path.indexOf(PACKAGE_ROOT + '/') === 0 && /\.h2ochat$/.test(packageDirNameForPath(path));
  }

  function packagePathForDirName(dirName) {
    return joinPath(PACKAGE_ROOT, dirName);
  }

  function fsOptions(extra) {
    var out = { baseDir: APP_LOCAL_DATA };
    var src = safeObject(extra);
    Object.keys(src).forEach(function (key) {
      if (key !== 'baseDir') out[key] = src[key];
    });
    return out;
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

  async function fsExists(path) {
    var invoke = getInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable for fs exists');
    try { return !!(await invoke('plugin:fs|exists', { path: path, options: fsOptions() })); }
    catch (err) {
      var msg = String((err && err.message) || err).toLowerCase();
      if (msg.indexOf('not found') >= 0 || msg.indexOf('no such') >= 0) return false;
      throw err;
    }
  }

  async function fsReadDir(path) {
    var invoke = getInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable for fs read_dir');
    return await invoke('plugin:fs|read_dir', { path: path, options: fsOptions() });
  }

  function bytesFor(value) {
    if (value instanceof Uint8Array) return value;
    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return new Uint8Array(value);
    if (value && typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    if (Array.isArray(value)) return Uint8Array.from(value);
    return getTextEncoder().encode(String(value == null ? '' : value));
  }

  function getTextEncoder() {
    if (typeof global.TextEncoder === 'function') return new global.TextEncoder();
    if (typeof TextEncoder === 'function') return new TextEncoder();
    throw new Error('TextEncoder unavailable');
  }

  function getTextDecoder() {
    if (typeof global.TextDecoder === 'function') return new global.TextDecoder();
    if (typeof TextDecoder === 'function') return new TextDecoder();
    throw new Error('TextDecoder unavailable');
  }

  function bytesToText(value) {
    return getTextDecoder().decode(bytesFor(value));
  }

  async function fsReadBytes(path) {
    var invoke = getInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable for fs read_file');
    return bytesFor(await invoke('plugin:fs|read_file', { path: path, options: fsOptions() }));
  }

  function bytesToHex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i += 1) {
      var part = bytes[i].toString(16);
      out += part.length === 1 ? '0' + part : part;
    }
    return out;
  }

  async function sha256Hex(value) {
    var cryptoObj = global.crypto || {};
    if (!cryptoObj.subtle || typeof cryptoObj.subtle.digest !== 'function') {
      throw new Error('WebCrypto SHA-256 unavailable');
    }
    var digest = await cryptoObj.subtle.digest('SHA-256', bytesFor(value));
    return bytesToHex(new Uint8Array(digest));
  }

  async function sha256Prefixed(value) {
    return 'sha256-' + await sha256Hex(value);
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value !== null && typeof value === 'object') {
      var out = {};
      Object.keys(value).sort().forEach(function (key) {
        if (typeof value[key] !== 'undefined') out[key] = canonicalize(value[key]);
      });
      return out;
    }
    return value;
  }

  function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
  }

  function makeIssue(code, message, detail) {
    var out = { code: code, message: message };
    if (typeof detail !== 'undefined') out.detail = detail;
    return out;
  }

  function statusFromIssues(blockers, warnings) {
    if (blockers.length) return STATUS_BLOCKED;
    if (warnings.length) return STATUS_WARNING;
    return STATUS_OK;
  }

  function rootResult(generatedAt) {
    return {
      ok: true,
      status: STATUS_OK,
      schema: DIAGNOSTIC_SCHEMA,
      generatedAt: generatedAt || nowIso(),
      baseDir: APP_LOCAL_DATA,
      roots: {
        packages: PACKAGE_ROOT,
        liveCas: LIVE_CAS_ROOT,
      },
      blockers: [],
      warnings: [],
      counts: {},
      packages: [],
    };
  }

  function entryName(entry) {
    return cleanString(entry && (entry.name || entry.fileName || entry.basename || entry.path));
  }

  function entryPath(entry, fallbackName) {
    var path = cleanString(entry && entry.path);
    if (path) {
      var marker = PACKAGE_ROOT + '/';
      var idx = path.indexOf(marker);
      if (idx >= 0) return path.slice(idx);
      return path;
    }
    return packagePathForDirName(fallbackName);
  }

  function entryIsDirectory(entry) {
    if (!entry || typeof entry !== 'object') return false;
    if (entry.isDirectory === true || entry.is_dir === true) return true;
    if (entry.isFile === true || entry.is_file === true) return false;
    if (entry.children && Array.isArray(entry.children)) return true;
    var type = cleanString(entry.type).toLowerCase();
    if (type === 'directory' || type === 'dir') return true;
    if (type === 'file') return false;
    return false;
  }

  async function shallowPackageEntry(packagePath, dirName) {
    var blockers = [];
    var warnings = [];
    var manifestPresent = await fsExists(joinPath(packagePath, 'manifest.json'));
    var snapshotPresent = await fsExists(joinPath(packagePath, 'snapshot.json'));
    var markdownPresent = await fsExists(joinPath(packagePath, 'chat.md'));
    var htmlPresent = await fsExists(joinPath(packagePath, 'chat.html'));
    var assetsDirPresent = await fsExists(joinPath(packagePath, 'assets'));
    if (!manifestPresent) blockers.push(makeIssue('manifest-missing', 'manifest.json is missing'));
    if (!snapshotPresent) blockers.push(makeIssue('snapshot-missing', 'snapshot.json is missing'));
    if (!markdownPresent) blockers.push(makeIssue('markdown-missing', 'chat.md is missing'));
    if (!htmlPresent) blockers.push(makeIssue('html-missing', 'chat.html is missing'));
    var status = statusFromIssues(blockers, warnings);
    return {
      ok: status === STATUS_OK,
      status: status,
      packagePath: packagePath,
      packageDirName: dirName || packageDirNameForPath(packagePath),
      manifestPresent: manifestPresent,
      snapshotPresent: snapshotPresent,
      markdownPresent: markdownPresent,
      htmlPresent: htmlPresent,
      assetsDirPresent: assetsDirPresent,
      blockers: blockers,
      warnings: warnings,
    };
  }

  function updateCounts(result) {
    var packages = result.packages || [];
    var counts = {
      packagesTotal: packages.length,
      packagesOk: 0,
      packagesWarning: 0,
      packagesBlocked: 0,
      v1: 0,
      v2: 0,
    };
    packages.forEach(function (pkg) {
      if (pkg.status === STATUS_BLOCKED) counts.packagesBlocked += 1;
      else if (pkg.status === STATUS_WARNING) counts.packagesWarning += 1;
      else if (pkg.status === STATUS_OK) counts.packagesOk += 1;
      if (pkg.schemaVersion === 1) counts.v1 += 1;
      if (pkg.schemaVersion === 2) counts.v2 += 1;
    });
    result.counts = Object.assign({}, result.counts || {}, counts);
    return result;
  }

  function setAggregateStatus(result, emptyAllowed) {
    updateCounts(result);
    if (emptyAllowed && result.packages.length === 0) {
      result.status = STATUS_EMPTY;
    } else if (result.blockers.length) {
      result.status = STATUS_BLOCKED;
    } else if (result.packages.length && result.counts.packagesOk !== result.packages.length) {
      var mixedBlocked = result.counts.packagesBlocked > 0 && result.counts.packagesBlocked !== result.packages.length;
      var mixedWarning = result.counts.packagesWarning > 0 && result.counts.packagesWarning !== result.packages.length;
      if (mixedBlocked || mixedWarning) result.status = STATUS_PARTIAL;
      else if (result.counts.packagesBlocked) result.status = STATUS_BLOCKED;
      else result.status = STATUS_WARNING;
    } else if (result.counts.packagesBlocked) {
      result.status = STATUS_BLOCKED;
    } else if (result.warnings.length || result.counts.packagesWarning) {
      result.status = STATUS_WARNING;
    } else {
      result.status = STATUS_OK;
    }
    result.ok = result.status === STATUS_OK;
    return result;
  }

  async function listSavedChatArchivePackagesV1(options) {
    var opts = safeObject(options);
    var limit = isFiniteNumber(opts.limit) && opts.limit > 0 ? Math.floor(opts.limit) : 500;
    var result = rootResult();
    try {
      var rootExists = await fsExists(PACKAGE_ROOT);
      if (!rootExists) {
        result.warnings.push(makeIssue('archive-packages-root-missing', 'archive package root is missing'));
        return setAggregateStatus(result, true);
      }
      var entries = asArray(await fsReadDir(PACKAGE_ROOT));
      for (var i = 0; i < entries.length && result.packages.length < limit; i += 1) {
        var entry = entries[i] || {};
        var name = entryName(entry);
        if (!name) {
          result.warnings.push(makeIssue('archive-entry-name-missing', 'archive package entry has no readable name'));
          continue;
        }
        if (!entryIsDirectory(entry)) {
          result.warnings.push(makeIssue('archive-entry-not-directory', 'archive entry is not a package directory', { name: name }));
          continue;
        }
        if (!/\.h2ochat$/.test(name)) {
          result.warnings.push(makeIssue('archive-entry-not-package', 'archive directory does not end with .h2ochat', { name: name }));
          continue;
        }
        var packagePath = entryPath(entry, name);
        if (packagePath.indexOf(PACKAGE_ROOT + '/') !== 0) packagePath = packagePathForDirName(name);
        result.packages.push(await shallowPackageEntry(packagePath, name));
      }
      if (entries.length > limit) {
        result.warnings.push(makeIssue('archive-package-limit-reached', 'archive package inventory reached the requested limit', { limit: limit, entries: entries.length }));
      }
      state.lastRunAt = result.generatedAt;
      return setAggregateStatus(result, true);
    } catch (err) {
      recordError('listSavedChatArchivePackagesV1', err);
      result.blockers.push(makeIssue('archive-package-list-failed', 'archive package inventory failed', String((err && err.message) || err)));
      return setAggregateStatus(result, false);
    }
  }

  function packageDiagnostic(packagePath) {
    var path = cleanString(packagePath);
    var dirName = packageDirNameForPath(path);
    return {
      ok: false,
      status: STATUS_BLOCKED,
      packagePath: path,
      packageDirName: dirName,
      chatId: '',
      snapshotId: '',
      schemaVersion: null,
      payloadVersion: null,
      manifestPresent: false,
      snapshotPresent: false,
      markdownPresent: false,
      htmlPresent: false,
      assetsDirPresent: false,
      blockers: [],
      warnings: [],
      hashChecks: {
        snapshotShaOk: false,
        contentHashOk: false,
        expectedContentHash: '',
        actualContentHash: '',
      },
    };
  }

  function parseJsonFile(text, label, diag) {
    try { return JSON.parse(text); }
    catch (err) {
      diag.blockers.push(makeIssue(label + '-json-invalid', label + ' is not parseable JSON', String((err && err.message) || err)));
      return null;
    }
  }

  function firstString() {
    for (var i = 0; i < arguments.length; i += 1) {
      var text = cleanString(arguments[i]);
      if (text) return text;
    }
    return '';
  }

  async function validateSavedChatPackageV1(options) {
    var opts = safeObject(options);
    var packagePath = firstString(opts.packagePath, opts.path);
    var diag = packageDiagnostic(packagePath);
    try {
      if (!packagePath) {
        diag.blockers.push(makeIssue('package-path-required', 'packagePath is required'));
        diag.status = statusFromIssues(diag.blockers, diag.warnings);
        return diag;
      }
      if (!packagePathIsScoped(packagePath)) {
        diag.blockers.push(makeIssue('package-path-out-of-scope', 'packagePath must be under archive/packages and end with .h2ochat'));
      }

      diag.manifestPresent = await fsExists(joinPath(packagePath, 'manifest.json'));
      diag.snapshotPresent = await fsExists(joinPath(packagePath, 'snapshot.json'));
      diag.markdownPresent = await fsExists(joinPath(packagePath, 'chat.md'));
      diag.htmlPresent = await fsExists(joinPath(packagePath, 'chat.html'));
      diag.assetsDirPresent = await fsExists(joinPath(packagePath, 'assets'));
      if (!diag.manifestPresent) diag.blockers.push(makeIssue('manifest-missing', 'manifest.json is missing'));
      if (!diag.snapshotPresent) diag.blockers.push(makeIssue('snapshot-missing', 'snapshot.json is missing'));
      if (!diag.markdownPresent) diag.blockers.push(makeIssue('markdown-missing', 'chat.md is missing'));
      if (!diag.htmlPresent) diag.blockers.push(makeIssue('html-missing', 'chat.html is missing'));

      var manifest = null;
      var snapshot = null;
      var snapshotBytes = null;
      if (diag.manifestPresent) {
        manifest = parseJsonFile(bytesToText(await fsReadBytes(joinPath(packagePath, 'manifest.json'))), 'manifest', diag);
      }
      if (diag.snapshotPresent) {
        snapshotBytes = await fsReadBytes(joinPath(packagePath, 'snapshot.json'));
        snapshot = parseJsonFile(bytesToText(snapshotBytes), 'snapshot', diag);
      }

      if (manifest) {
        if (manifest.schema && manifest.schema !== PACKAGE_SCHEMA) {
          diag.blockers.push(makeIssue('manifest-schema-invalid', 'manifest schema is not h2o.savedChatPackage', manifest.schema));
        }
        diag.schemaVersion = isFiniteNumber(manifest.schemaVersion) ? manifest.schemaVersion : null;
        diag.payloadVersion = isFiniteNumber(manifest.payloadVersion) ? manifest.payloadVersion : null;
        if (diag.schemaVersion !== 1 && diag.schemaVersion !== 2) {
          diag.blockers.push(makeIssue('manifest-schema-version-invalid', 'manifest schemaVersion must be 1 or 2', manifest.schemaVersion));
        }
        if (diag.schemaVersion === 2 && diag.payloadVersion !== 2) {
          diag.blockers.push(makeIssue('manifest-payload-version-invalid', 'v2 manifest payloadVersion must be 2', manifest.payloadVersion));
        }
        diag.chatId = firstString(manifest.chatId);
        diag.snapshotId = firstString(manifest.snapshotId);
      }
      if (snapshot) {
        if (snapshot.chatId && diag.chatId && snapshot.chatId !== diag.chatId) {
          diag.blockers.push(makeIssue('chat-id-mismatch', 'manifest.chatId does not match snapshot.chatId'));
        }
        if (snapshot.snapshotId && diag.snapshotId && snapshot.snapshotId !== diag.snapshotId) {
          diag.blockers.push(makeIssue('snapshot-id-mismatch', 'manifest.snapshotId does not match snapshot.snapshotId'));
        }
        diag.chatId = firstString(diag.chatId, snapshot.chatId);
        diag.snapshotId = firstString(diag.snapshotId, snapshot.snapshotId);
      }
      if (diag.chatId && diag.packageDirName !== diag.chatId + '.h2ochat') {
        diag.blockers.push(makeIssue('package-dirname-chat-id-mismatch', 'package folder basename must match chatId'));
      }

      if (manifest && snapshotBytes) {
        var fileSnapshotSha = firstString(manifest.files && manifest.files.snapshot && manifest.files.snapshot.sha256);
        var actualSnapshotSha = await sha256Prefixed(snapshotBytes);
        diag.hashChecks.snapshotShaOk = !!fileSnapshotSha && fileSnapshotSha === actualSnapshotSha;
        if (!diag.hashChecks.snapshotShaOk) {
          diag.blockers.push(makeIssue('snapshot-sha-mismatch', 'files.snapshot.sha256 does not match stored snapshot.json bytes', { expected: actualSnapshotSha, actual: fileSnapshotSha }));
        }
        var expectedContentHash = '';
        if (diag.schemaVersion === 1) {
          expectedContentHash = fileSnapshotSha;
          var assets = asArray(manifest.assets);
          if (assets.length) diag.warnings.push(makeIssue('v1-assets-nonempty', 'v1 package manifest.assets should be empty'));
        } else if (diag.schemaVersion === 2) {
          var assetShas = asArray(manifest.assets).map(function (asset) {
            return cleanString(asset && asset.sha256);
          }).filter(Boolean).sort();
          expectedContentHash = await sha256Prefixed(canonicalJson({ snapshot: fileSnapshotSha, assets: assetShas }));
        }
        diag.hashChecks.expectedContentHash = expectedContentHash;
        diag.hashChecks.actualContentHash = firstString(manifest.contentHash);
        diag.hashChecks.contentHashOk = !!expectedContentHash && expectedContentHash === diag.hashChecks.actualContentHash;
        if (!diag.hashChecks.contentHashOk) {
          diag.blockers.push(makeIssue('content-hash-mismatch', 'manifest.contentHash does not match expected package content hash', { expected: expectedContentHash, actual: diag.hashChecks.actualContentHash }));
        }
      }

      diag.status = statusFromIssues(diag.blockers, diag.warnings);
      diag.ok = diag.status === STATUS_OK;
      state.lastRunAt = nowIso();
      return diag;
    } catch (err) {
      recordError('validateSavedChatPackageV1', err);
      diag.blockers.push(makeIssue('package-validation-failed', 'saved chat package validation failed', String((err && err.message) || err)));
      diag.status = statusFromIssues(diag.blockers, diag.warnings);
      diag.ok = false;
      return diag;
    }
  }

  async function diagnoseSavedChatArchiveV1(options) {
    var list = await listSavedChatArchivePackagesV1(options);
    var result = rootResult(list.generatedAt);
    result.blockers = list.blockers.slice();
    result.warnings = list.warnings.slice();
    for (var i = 0; i < list.packages.length; i += 1) {
      result.packages.push(await validateSavedChatPackageV1({ packagePath: list.packages[i].packagePath }));
    }
    state.lastRunAt = result.generatedAt;
    return setAggregateStatus(result, true);
  }

  function diagnoseSavedChatArchiveCapabilitiesV1() {
    return {
      installed: true,
      schema: DIAGNOSTIC_SCHEMA,
      desktopOnly: true,
      readOnly: true,
      baseDir: APP_LOCAL_DATA,
      roots: {
        packages: PACKAGE_ROOT,
        liveCas: LIVE_CAS_ROOT,
      },
      requiredFs: ['exists', 'read_dir', 'read_file'],
      api: [
        'diagnoseSavedChatArchiveCapabilitiesV1',
        'listSavedChatArchivePackagesV1',
        'validateSavedChatPackageV1',
        'diagnoseSavedChatArchiveV1',
      ],
      boundaries: {
        dbChecks: false,
        casChecks: false,
        sync: false,
        chrome: false,
        ui: false,
      },
      lastRunAt: state.lastRunAt,
      errors: state.errors.slice(),
    };
  }

  H2O.Studio.ingestion.diagnoseSavedChatArchiveCapabilitiesV1 = diagnoseSavedChatArchiveCapabilitiesV1;
  H2O.Studio.ingestion.listSavedChatArchivePackagesV1 = function (options) {
    return listSavedChatArchivePackagesV1(options);
  };
  H2O.Studio.ingestion.validateSavedChatPackageV1 = function (options) {
    return validateSavedChatPackageV1(options);
  };
  H2O.Studio.ingestion.diagnoseSavedChatArchiveV1 = function (options) {
    return diagnoseSavedChatArchiveV1(options);
  };
})(typeof window !== 'undefined' ? window : globalThis);
