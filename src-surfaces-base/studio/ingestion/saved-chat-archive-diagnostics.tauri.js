/* H2O Studio Saved Chat Archive Diagnostics (Desktop / Tauri)
 *
 * C5.1-C5.3: read-only inventory, package hash validation, package asset
 * validation, and live-CAS presence comparison for saved-chat packages under
 * $APPLOCALDATA/archive/packages.
 *
 * Boundaries: Desktop-only, AppLocalData only, read-only fs calls only. This
 * module does not touch DB/store rows, mutate live CAS, Sync, Chrome,
 * import/recovery, user export locations, package materialization, or UI.
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
      assetChecks: {
        passed: 0,
        warnings: 0,
        failed: 0,
      },
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
      missingLiveCasAssets: 0,
      brokenPackageAssets: 0,
      assetRefMismatches: 0,
      dataImageResidue: 0,
      orphanedPackages: 0,
      missingDbChats: 0,
      missingDbSnapshots: 0,
      stalePackages: 0,
      storeAssetMismatches: 0,
    };
    var assetSummary = {
      passed: 0,
      warnings: 0,
      failed: 0,
    };
    var dbSummary = {
      passed: 0,
      warnings: 0,
      failed: 0,
    };
    packages.forEach(function (pkg) {
      if (pkg.status === STATUS_BLOCKED) counts.packagesBlocked += 1;
      else if (pkg.status === STATUS_WARNING) counts.packagesWarning += 1;
      else if (pkg.status === STATUS_OK) counts.packagesOk += 1;
      if (pkg.schemaVersion === 1) counts.v1 += 1;
      if (pkg.schemaVersion === 2) counts.v2 += 1;
      var db = pkg.dbChecks || {};
      if (db.checked && db.available) {
        if (db.chatExists === false) counts.missingDbChats += 1;
        if (db.snapshotExists === false) counts.missingDbSnapshots += 1;
        if (db.packageIsLatest === false) counts.stalePackages += 1;
        if (db.packageAssetSetMatchesStore === false) counts.storeAssetMismatches += 1;
        if (db.chatExists === false && db.snapshotExists === false) counts.orphanedPackages += 1;
      }
      if (db.checked) {
        if (asArray(db.blockers).length) dbSummary.failed += 1;
        else if (asArray(db.warnings).length) dbSummary.warnings += 1;
        else if (db.available) dbSummary.passed += 1;
      }
      var checks = pkg.assetChecks || {};
      var broken =
        asArray(checks.missingPackageAssets).length +
        asArray(checks.unreadablePackageAssets).length +
        asArray(checks.hashMismatches).length +
        asArray(checks.byteLengthMismatches).length;
      var warnings =
        asArray(checks.extraPackageAssets).length +
        asArray(checks.unreferencedManifestAssets).length +
        asArray(checks.missingLiveCasAssets).length;
      counts.missingLiveCasAssets += asArray(checks.missingLiveCasAssets).length;
      counts.brokenPackageAssets += broken;
      counts.assetRefMismatches += asArray(checks.assetRefMismatches).length + asArray(checks.rendererAssetRefMismatches).length;
      counts.dataImageResidue += asArray(checks.dataImageResidue).length;
      if (broken || asArray(checks.assetRefMismatches).length || asArray(checks.rendererAssetRefMismatches).length || asArray(checks.dataImageResidue).length) {
        assetSummary.failed += 1;
      } else if (warnings || pkg.status === STATUS_WARNING) {
        assetSummary.warnings += 1;
      } else if (checks.packageAssetsOk === true || pkg.schemaVersion === 1 || pkg.schemaVersion === 2) {
        assetSummary.passed += 1;
      }
    });
    result.counts = Object.assign({}, result.counts || {}, counts);
    result.assetChecks = assetSummary;
    result.dbChecks = dbSummary;
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
      assetChecks: defaultAssetChecks(),
      dbChecks: defaultDbChecks(),
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

  function defaultAssetChecks() {
    return {
      manifestAssetCount: 0,
      packageAssetCount: 0,
      packageAssetsOk: false,
      missingPackageAssets: [],
      unreadablePackageAssets: [],
      hashMismatches: [],
      byteLengthMismatches: [],
      extraPackageAssets: [],
      unreferencedManifestAssets: [],
      assetRefMismatches: [],
      dataImageResidue: [],
      rendererAssetRefMismatches: [],
      missingLiveCasAssets: [],
      liveCasChecked: false,
      liveCasAvailable: false,
    };
  }

  function addAssetBlocker(diag, bucket, code, message, detail) {
    var issue = makeIssue(code, message, detail);
    if (diag.assetChecks && Array.isArray(diag.assetChecks[bucket])) diag.assetChecks[bucket].push(issue);
    diag.blockers.push(issue);
    return issue;
  }

  function addAssetWarning(diag, bucket, code, message, detail) {
    var issue = makeIssue(code, message, detail);
    if (diag.assetChecks && Array.isArray(diag.assetChecks[bucket])) diag.assetChecks[bucket].push(issue);
    diag.warnings.push(issue);
    return issue;
  }

  function normalizeAssetSha(shaInput) {
    var sha = cleanString(shaInput).toLowerCase();
    if (/^sha256-[0-9a-f]{64}$/.test(sha)) return sha;
    if (/^[0-9a-f]{64}$/.test(sha)) return 'sha256-' + sha;
    return '';
  }

  function normalizeAssetExt(extInput) {
    return cleanString(extInput).toLowerCase().replace(/^\.+/, '').replace(/[^a-z0-9]/g, '');
  }

  function assetPathParts(pathInput) {
    var path = cleanString(pathInput);
    var match = /^assets\/(sha256-[0-9a-f]{64})\.([a-z0-9]+)$/i.exec(path);
    if (!match) return null;
    return { sha256: normalizeAssetSha(match[1]), ext: normalizeAssetExt(match[2]) };
  }

  function packageRelativePathIsSafe(pathInput) {
    var path = cleanString(pathInput);
    if (!path) return false;
    if (path.charAt(0) === '/' || /\\/.test(path) || path.indexOf('..') >= 0 || path.indexOf(':') >= 0) return false;
    return path.indexOf('assets/') === 0;
  }

  function assetPathMatchesDescriptor(asset, diag, index) {
    var sha = normalizeAssetSha(asset && asset.sha256);
    var path = cleanString(asset && asset.path);
    var ext = normalizeAssetExt(asset && asset.ext);
    var mimeType = cleanString(asset && asset.mimeType);
    var byteLength = asset && asset.byteLength;
    var detail = { index: index, sha256: sha || cleanString(asset && asset.sha256), path: path };
    if (!sha) {
      addAssetBlocker(diag, 'assetRefMismatches', 'manifest-asset-sha-invalid', 'manifest.assets[] entry has an invalid sha256', detail);
      return null;
    }
    if (!path || !packageRelativePathIsSafe(path)) {
      addAssetBlocker(diag, 'assetRefMismatches', 'manifest-asset-path-unsafe', 'manifest.assets[] path must be package-relative under assets/', detail);
      return null;
    }
    var parts = assetPathParts(path);
    if (!parts) {
      addAssetBlocker(diag, 'assetRefMismatches', 'manifest-asset-path-invalid', 'manifest.assets[] path must match assets/sha256-<hash>.<ext>', detail);
      return null;
    }
    if (parts.sha256 !== sha) {
      addAssetBlocker(diag, 'assetRefMismatches', 'manifest-asset-path-sha-mismatch', 'manifest asset path sha does not match asset.sha256', detail);
    }
    if (!ext) {
      addAssetBlocker(diag, 'assetRefMismatches', 'manifest-asset-ext-missing', 'manifest.assets[] entry is missing ext', detail);
    } else if (parts.ext !== ext) {
      addAssetBlocker(diag, 'assetRefMismatches', 'manifest-asset-ext-mismatch', 'manifest asset path extension does not match ext', Object.assign({}, detail, { ext: ext, pathExt: parts.ext }));
    }
    if (!mimeType) {
      addAssetBlocker(diag, 'assetRefMismatches', 'manifest-asset-mime-missing', 'manifest.assets[] entry is missing mimeType', detail);
    }
    if (!isFiniteNumber(byteLength) || byteLength < 0) {
      addAssetBlocker(diag, 'byteLengthMismatches', 'manifest-asset-byte-length-invalid', 'manifest.assets[] entry has invalid byteLength', Object.assign({}, detail, { byteLength: byteLength }));
    }
    if (!cleanString(asset && asset.source)) {
      addAssetWarning(diag, 'unreferencedManifestAssets', 'manifest-asset-source-missing', 'manifest.assets[] entry is missing source provenance', detail);
    }
    return {
      index: index,
      sha256: sha,
      path: path,
      ext: ext || (parts && parts.ext) || '',
      mimeType: mimeType,
      byteLength: isFiniteNumber(byteLength) ? byteLength : null,
    };
  }

  function entryIsFile(entry) {
    if (!entry || typeof entry !== 'object') return false;
    if (entry.isFile === true || entry.is_file === true) return true;
    if (entry.isDirectory === true || entry.is_dir === true) return false;
    var type = cleanString(entry.type).toLowerCase();
    return type === 'file';
  }

  async function listPackageAssetRelativePaths(packagePath, diag) {
    var out = [];
    if (!diag.assetsDirPresent) return out;
    try {
      var entries = asArray(await fsReadDir(joinPath(packagePath, 'assets')));
      entries.forEach(function (entry) {
        var name = entryName(entry);
        if (!name) return;
        if (entryIsDirectory(entry)) {
          addAssetWarning(diag, 'extraPackageAssets', 'nested-package-asset-entry', 'assets/ contains a nested directory that C5.3 does not recurse into', { path: 'assets/' + name });
          return;
        }
        if (!entryIsFile(entry) && entryIsDirectory(entry) !== false) return;
        out.push('assets/' + name);
      });
    } catch (err) {
      addAssetWarning(diag, 'extraPackageAssets', 'assets-dir-read-failed', 'assets/ directory could not be listed', String((err && err.message) || err));
    }
    return out;
  }

  function collectMessageAssetRefs(snapshot) {
    var refs = [];
    var duplicates = [];
    var seen = Object.create(null);
    asArray(snapshot && snapshot.messages).forEach(function (message, messageIndex) {
      asArray(message && message.assetRefs).forEach(function (ref, refIndex) {
        var sha = normalizeAssetSha(typeof ref === 'string' ? ref : (ref && (ref.sha256 || ref.id || ref.assetId)));
        if (!sha) {
          refs.push({ sha256: '', messageIndex: messageIndex, refIndex: refIndex, invalid: true, raw: ref });
          return;
        }
        if (seen[sha]) duplicates.push({ sha256: sha, messageIndex: messageIndex, refIndex: refIndex });
        seen[sha] = true;
        refs.push({ sha256: sha, messageIndex: messageIndex, refIndex: refIndex });
      });
    });
    return { refs: refs, duplicates: duplicates };
  }

  function snapshotHtmlTexts(snapshot) {
    var texts = [];
    asArray(snapshot && snapshot.messages).forEach(function (message, messageIndex) {
      if (typeof message.contentHtml === 'string' && message.contentHtml) {
        texts.push({ label: 'snapshot.messages[' + messageIndex + '].contentHtml', text: message.contentHtml });
      }
      asArray(message && message.content).forEach(function (entry, entryIndex) {
        if (entry && entry.type === 'html' && typeof entry.html === 'string' && entry.html) {
          texts.push({ label: 'snapshot.messages[' + messageIndex + '].content[' + entryIndex + '].html', text: entry.html });
        }
      });
    });
    return texts;
  }

  function collectPackageAssetRefsFromHtml(text) {
    var refs = [];
    var seen = Object.create(null);
    var re = /assets\/sha256-[0-9a-f]{64}\.[a-z0-9]+/ig;
    var match;
    while ((match = re.exec(String(text || ''))) !== null) {
      var ref = match[0];
      if (!seen[ref]) { seen[ref] = true; refs.push(ref); }
    }
    return refs;
  }

  function containsDataImage(text) {
    return /data:image\//i.test(String(text || ''));
  }

  function getAssetCas() {
    try {
      var ingestion = H2O && H2O.Studio && H2O.Studio.ingestion;
      return ingestion && ingestion.assetCas ? ingestion.assetCas : null;
    } catch (_) {
      return null;
    }
  }

  /* C5.4A: read-only store adapter namespace for package/DB reconciliation. */
  function getStores() {
    try {
      var store = H2O && H2O.Studio && H2O.Studio.store;
      return store || null;
    } catch (_) {
      return null;
    }
  }

  function uniqStrings(values) {
    var seen = Object.create(null);
    var out = [];
    asArray(values).forEach(function (value) {
      var text = cleanString(value);
      if (text && !seen[text]) { seen[text] = true; out.push(text); }
    });
    return out;
  }

  function defaultDbChecks() {
    return {
      checked: false,
      available: false,
      chatExists: false,
      snapshotExists: false,
      latestSnapshotId: null,
      packageIsLatest: null,
      storeSnapshotCount: null,
      storeAssetCount: null,
      packageAssetSetMatchesStore: null,
      missingStoreAssets: [],
      extraStoreAssets: [],
      warnings: [],
      blockers: [],
    };
  }

  /* DB reconciliation warnings never block: package validity is structural
   * (C5.2/C5.3). Recorded on dbChecks.warnings AND mirrored to the package
   * warnings so the package status can degrade to "warning". */
  function addDbWarning(diag, code, message, detail) {
    var issue = makeIssue(code, message, detail);
    diag.dbChecks.warnings.push(issue);
    diag.warnings.push(issue);
    return issue;
  }

  /* C5.4A read-only, package-centric DB reconciliation. Uses ONLY
   * store.chats.get / store.snapshots.get / store.snapshots.listByChat /
   * store.assets.listBySnapshot. Never mutates the DB, never writes packages or
   * CAS, never repairs/imports. Missing rows / drift are warnings, not blockers;
   * a missing namespace, missing method, or thrown read degrades to a warning. */
  async function validateDbChecks(diag, manifest, includeDbChecks) {
    if (includeDbChecks === false) return;
    var db = diag.dbChecks;
    db.checked = true;
    var stores = getStores();
    if (!stores) {
      db.available = false;
      addDbWarning(diag, 'db-api-missing', 'H2O.Studio.store is unavailable for DB reconciliation');
      return;
    }
    db.available = true;
    var chatId = cleanString(diag.chatId);
    var snapshotId = cleanString(diag.snapshotId);
    if (!chatId && !snapshotId) return; /* no identity to reconcile (already-blocked package) */

    /* chat existence */
    if (chatId) {
      if (stores.chats && typeof stores.chats.get === 'function') {
        try {
          var chatRow = await stores.chats.get(chatId);
          db.chatExists = !!chatRow;
          if (!chatRow) addDbWarning(diag, 'missing-db-chat', 'package chatId has no DB chat row', { chatId: chatId });
        } catch (err) {
          addDbWarning(diag, 'db-check-failed', 'store.chats.get failed', { chatId: chatId, error: String((err && err.message) || err) });
        }
      } else {
        addDbWarning(diag, 'db-api-missing', 'store.chats.get is unavailable');
      }
    }

    /* snapshot existence (store.snapshots.get returns { snapshot, turns } | row | null) */
    if (snapshotId) {
      if (stores.snapshots && typeof stores.snapshots.get === 'function') {
        try {
          var snapRow = await stores.snapshots.get(snapshotId);
          db.snapshotExists = !!(snapRow && (snapRow.snapshot || snapRow.snapshotId || snapRow.id));
          if (!db.snapshotExists) addDbWarning(diag, 'missing-db-snapshot', 'package snapshotId has no DB snapshot row', { snapshotId: snapshotId });
        } catch (err) {
          addDbWarning(diag, 'db-check-failed', 'store.snapshots.get failed', { snapshotId: snapshotId, error: String((err && err.message) || err) });
        }
      } else {
        addDbWarning(diag, 'db-api-missing', 'store.snapshots.get is unavailable');
      }
    }

    /* latest-snapshot / stale-package: first row is treated as latest; an
     * indeterminate row shape is handled safely (packageIsLatest stays null). */
    if (chatId && stores.snapshots && typeof stores.snapshots.listByChat === 'function') {
      try {
        var rows = asArray(await stores.snapshots.listByChat(chatId));
        db.storeSnapshotCount = rows.length;
        if (rows.length) {
          var latestId = firstString(rows[0] && (rows[0].snapshotId || rows[0].id));
          db.latestSnapshotId = latestId || null;
          if (latestId && snapshotId) {
            db.packageIsLatest = latestId === snapshotId;
            if (!db.packageIsLatest) addDbWarning(diag, 'stale-package', 'package snapshot is not the latest DB snapshot for this chat', { packageSnapshotId: snapshotId, latestSnapshotId: latestId });
          }
        }
      } catch (err) {
        addDbWarning(diag, 'db-check-failed', 'store.snapshots.listByChat failed', { chatId: chatId, error: String((err && err.message) || err) });
      }
    } else if (chatId && (!stores.snapshots || typeof stores.snapshots.listByChat !== 'function')) {
      addDbWarning(diag, 'db-api-missing', 'store.snapshots.listByChat is unavailable');
    }

    /* store asset registry vs package manifest.assets[] */
    if (snapshotId) {
      if (stores.assets && typeof stores.assets.listBySnapshot === 'function') {
        try {
          var storeAssetRows = asArray(await stores.assets.listBySnapshot(snapshotId));
          var storeShas = uniqStrings(storeAssetRows.map(function (row) { return row && row.sha256; }));
          db.storeAssetCount = storeShas.length;
          var manifestShas = uniqStrings(asArray(manifest && manifest.assets).map(function (asset) { return asset && asset.sha256; }));
          var missing = manifestShas.filter(function (sha) { return storeShas.indexOf(sha) < 0; });
          var extra = storeShas.filter(function (sha) { return manifestShas.indexOf(sha) < 0; });
          db.missingStoreAssets = missing;
          db.extraStoreAssets = extra;
          db.packageAssetSetMatchesStore = missing.length === 0 && extra.length === 0;
          if (!db.packageAssetSetMatchesStore) {
            addDbWarning(diag, 'store-asset-registry-mismatch', 'store asset registry differs from package manifest assets', { missingStoreAssets: missing, extraStoreAssets: extra });
          }
        } catch (err) {
          addDbWarning(diag, 'db-check-failed', 'store.assets.listBySnapshot failed', { snapshotId: snapshotId, error: String((err && err.message) || err) });
        }
      } else {
        addDbWarning(diag, 'db-api-missing', 'store.assets.listBySnapshot is unavailable');
      }
    }
  }

  function validateManifestAssets(manifest, diag) {
    var manifestAssets = asArray(manifest && manifest.assets);
    var out = [];
    var bySha = Object.create(null);
    diag.assetChecks.manifestAssetCount = manifestAssets.length;
    manifestAssets.forEach(function (asset, index) {
      var desc = assetPathMatchesDescriptor(asset, diag, index);
      if (!desc) return;
      if (bySha[desc.sha256]) {
        addAssetWarning(diag, 'unreferencedManifestAssets', 'manifest-asset-duplicate', 'manifest.assets[] contains a duplicate sha256', { sha256: desc.sha256, path: desc.path, index: index });
      } else {
        bySha[desc.sha256] = desc;
      }
      out.push(desc);
    });
    return { list: out, bySha: bySha };
  }

  async function validatePackageAssetFiles(packagePath, manifestAssets, diag) {
    var actualPaths = await listPackageAssetRelativePaths(packagePath, diag);
    var manifestPathSet = Object.create(null);
    manifestAssets.forEach(function (asset) { manifestPathSet[asset.path] = asset; });
    actualPaths.forEach(function (path) {
      if (!manifestPathSet[path]) {
        addAssetWarning(diag, 'extraPackageAssets', 'extra-package-asset', 'assets/ contains a file not listed in manifest.assets[]', { path: path });
      }
    });
    diag.assetChecks.packageAssetCount = actualPaths.length;
    for (var i = 0; i < manifestAssets.length; i += 1) {
      var asset = manifestAssets[i];
      var fullPath = joinPath(packagePath, asset.path);
      var exists = false;
      try { exists = await fsExists(fullPath); }
      catch (err) {
        addAssetBlocker(diag, 'missingPackageAssets', 'package-asset-exists-check-failed', 'package asset existence check failed', { sha256: asset.sha256, path: asset.path, error: String((err && err.message) || err) });
        continue;
      }
      if (!exists) {
        addAssetBlocker(diag, 'missingPackageAssets', 'package-asset-missing', 'package asset file is missing', { sha256: asset.sha256, path: asset.path });
        continue;
      }
      var bytes = null;
      try { bytes = await fsReadBytes(fullPath); }
      catch (err2) {
        addAssetBlocker(diag, 'unreadablePackageAssets', 'package-asset-unreadable', 'package asset file could not be read', { sha256: asset.sha256, path: asset.path, error: String((err2 && err2.message) || err2) });
        continue;
      }
      var actualSha = await sha256Prefixed(bytes);
      if (actualSha !== asset.sha256) {
        addAssetBlocker(diag, 'hashMismatches', 'package-asset-sha-mismatch', 'package asset bytes do not match manifest sha256', { sha256: asset.sha256, actualSha256: actualSha, path: asset.path });
      }
      if (isFiniteNumber(asset.byteLength) && bytes.length !== asset.byteLength) {
        addAssetBlocker(diag, 'byteLengthMismatches', 'package-asset-byte-length-mismatch', 'package asset byte length does not match manifest byteLength', { sha256: asset.sha256, path: asset.path, expected: asset.byteLength, actual: bytes.length });
      }
    }
    diag.assetChecks.packageAssetsOk =
      diag.assetChecks.missingPackageAssets.length === 0 &&
      diag.assetChecks.unreadablePackageAssets.length === 0 &&
      diag.assetChecks.hashMismatches.length === 0 &&
      diag.assetChecks.byteLengthMismatches.length === 0;
  }

  function validateSnapshotAssetRefs(snapshot, manifestAssets, diag) {
    var refs = collectMessageAssetRefs(snapshot);
    var manifestBySha = Object.create(null);
    var referenced = Object.create(null);
    manifestAssets.forEach(function (asset) { manifestBySha[asset.sha256] = asset; });
    refs.refs.forEach(function (ref) {
      if (ref.invalid || !ref.sha256) {
        addAssetBlocker(diag, 'assetRefMismatches', 'snapshot-asset-ref-invalid', 'snapshot message assetRef is not a valid sha256 id', { messageIndex: ref.messageIndex, refIndex: ref.refIndex });
        return;
      }
      referenced[ref.sha256] = true;
      if (!manifestBySha[ref.sha256]) {
        addAssetBlocker(diag, 'assetRefMismatches', 'snapshot-asset-ref-missing-manifest', 'snapshot message assetRef is not present in manifest.assets[]', { sha256: ref.sha256, messageIndex: ref.messageIndex, refIndex: ref.refIndex });
      }
    });
    refs.duplicates.forEach(function (dup) {
      addAssetWarning(diag, 'assetRefMismatches', 'snapshot-asset-ref-duplicate', 'snapshot message assetRef is duplicated', dup);
    });
    if (manifestAssets.length && refs.refs.length === 0) {
      addAssetWarning(diag, 'assetRefMismatches', 'v2-assets-without-assetRefs', 'v2 package has manifest assets but no message assetRefs');
    }
    manifestAssets.forEach(function (asset) {
      if (!referenced[asset.sha256]) {
        addAssetWarning(diag, 'unreferencedManifestAssets', 'manifest-asset-unreferenced', 'manifest asset is not referenced by any snapshot message assetRefs', { sha256: asset.sha256, path: asset.path });
      }
    });
  }

  async function validateRendererAssetRefs(packagePath, snapshot, chatHtmlText, manifestAssets, diag) {
    var manifestPathSet = Object.create(null);
    manifestAssets.forEach(function (asset) { manifestPathSet[asset.path] = asset; });
    var htmlTexts = snapshotHtmlTexts(snapshot);
    if (typeof chatHtmlText === 'string') htmlTexts.push({ label: 'chat.html', text: chatHtmlText });
    for (var i = 0; i < htmlTexts.length; i += 1) {
      var item = htmlTexts[i];
      if (containsDataImage(item.text)) {
        addAssetBlocker(diag, 'dataImageResidue', 'data-image-residue-v2', 'v2 package renderer content still contains data:image', { location: item.label });
      }
      var refs = collectPackageAssetRefsFromHtml(item.text);
      for (var r = 0; r < refs.length; r += 1) {
        var refPath = refs[r];
        if (!manifestPathSet[refPath]) {
          addAssetBlocker(diag, 'rendererAssetRefMismatches', 'renderer-asset-ref-not-in-manifest', 'renderer asset reference is not listed in manifest.assets[]', { location: item.label, path: refPath });
          continue;
        }
        var exists = false;
        try { exists = await fsExists(joinPath(packagePath, refPath)); }
        catch (err) {
          addAssetBlocker(diag, 'rendererAssetRefMismatches', 'renderer-asset-ref-exists-check-failed', 'renderer asset reference existence check failed', { location: item.label, path: refPath, error: String((err && err.message) || err) });
          continue;
        }
        if (!exists) {
          addAssetBlocker(diag, 'rendererAssetRefMismatches', 'renderer-asset-ref-missing-file', 'renderer asset reference does not resolve to an existing package asset', { location: item.label, path: refPath });
        }
      }
    }
  }

  async function compareLiveCasAssets(manifestAssets, diag, includeCasChecks) {
    if (!includeCasChecks) return;
    diag.assetChecks.liveCasChecked = true;
    var assetCas = getAssetCas();
    if (!assetCas || (typeof assetCas.exists !== 'function' && typeof assetCas.describe !== 'function')) {
      diag.assetChecks.liveCasAvailable = false;
      addAssetWarning(diag, 'missingLiveCasAssets', 'live-cas-diagnostic-unavailable', 'live CAS read-only diagnostic helper is unavailable');
      return;
    }
    diag.assetChecks.liveCasAvailable = true;
    for (var i = 0; i < manifestAssets.length; i += 1) {
      var asset = manifestAssets[i];
      var exists = false;
      try {
        if (typeof assetCas.exists === 'function') exists = !!(await assetCas.exists(asset.sha256));
        else {
          var desc = await assetCas.describe(asset.sha256);
          exists = !!(desc && desc.exists);
        }
      } catch (err) {
        addAssetWarning(diag, 'missingLiveCasAssets', 'live-cas-check-failed', 'live CAS existence check failed', { sha256: asset.sha256, error: String((err && err.message) || err) });
        continue;
      }
      if (!exists) {
        addAssetWarning(diag, 'missingLiveCasAssets', 'live-cas-missing-package-portable', 'live CAS asset is missing, but package remains portable when the package asset is valid', { sha256: asset.sha256, path: asset.path });
      }
    }
  }

  async function validateSavedChatPackageV1(options) {
    var opts = safeObject(options);
    var packagePath = firstString(opts.packagePath, opts.path);
    var includeCasChecks = opts.includeCasChecks !== false;
    var includeRendererChecks = opts.includeRendererChecks !== false;
    var includeDbChecks = opts.includeDbChecks !== false;
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
      var chatHtmlText = '';
      if (diag.manifestPresent) {
        manifest = parseJsonFile(bytesToText(await fsReadBytes(joinPath(packagePath, 'manifest.json'))), 'manifest', diag);
      }
      if (diag.snapshotPresent) {
        snapshotBytes = await fsReadBytes(joinPath(packagePath, 'snapshot.json'));
        snapshot = parseJsonFile(bytesToText(snapshotBytes), 'snapshot', diag);
      }
      if (includeRendererChecks && diag.htmlPresent) {
        try { chatHtmlText = bytesToText(await fsReadBytes(joinPath(packagePath, 'chat.html'))); }
        catch (err) {
          addAssetBlocker(diag, 'rendererAssetRefMismatches', 'chat-html-unreadable', 'chat.html could not be read for renderer asset diagnostics', String((err && err.message) || err));
        }
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

      if (manifest) {
        if (diag.schemaVersion === 1) {
          diag.assetChecks.manifestAssetCount = asArray(manifest.assets).length;
          if (diag.assetsDirPresent) {
            addAssetWarning(diag, 'extraPackageAssets', 'unexpected-assets-dir-v1', 'v1 asset-less package should normally omit assets/');
            diag.assetChecks.packageAssetCount = (await listPackageAssetRelativePaths(packagePath, diag)).length;
          }
          diag.assetChecks.packageAssetsOk = true;
        } else if (diag.schemaVersion === 2) {
          var manifestAssetInfo = validateManifestAssets(manifest, diag);
          await validatePackageAssetFiles(packagePath, manifestAssetInfo.list, diag);
          if (snapshot) validateSnapshotAssetRefs(snapshot, manifestAssetInfo.list, diag);
          if (includeRendererChecks && snapshot) await validateRendererAssetRefs(packagePath, snapshot, chatHtmlText, manifestAssetInfo.list, diag);
          if (manifestAssetInfo.list.length) await compareLiveCasAssets(manifestAssetInfo.list, diag, includeCasChecks);
        }
      }

      /* C5.4A: read-only DB reconciliation (warnings only; never blocks). Runs
       * after package identity is resolved so chatId/snapshotId are available. */
      await validateDbChecks(diag, manifest, includeDbChecks);

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
    var opts = safeObject(options);
    var result = rootResult(list.generatedAt);
    result.blockers = list.blockers.slice();
    result.warnings = list.warnings.slice();
    for (var i = 0; i < list.packages.length; i += 1) {
      result.packages.push(await validateSavedChatPackageV1({
        packagePath: list.packages[i].packagePath,
        includeCasChecks: opts.includeCasChecks,
        includeRendererChecks: opts.includeRendererChecks,
        includeDbChecks: opts.includeDbChecks,
      }));
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
        dbChecks: 'read-only-store-adapters',
        casChecks: 'read-only-exists-describe',
        sync: false,
        chrome: false,
        ui: false,
      },
      storeReads: [
        'chats.get',
        'snapshots.get',
        'snapshots.listByChat',
        'assets.listBySnapshot',
      ],
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
