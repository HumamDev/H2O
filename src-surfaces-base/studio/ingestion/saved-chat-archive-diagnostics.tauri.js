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
  /* Frozen legacy inventory. V3 dispatch is additive and must not reinterpret
   * the v1/v2 required-file contract. */
  var REQUIRED_FILES = ['manifest.json', 'snapshot.json', 'chat.md', 'chat.html'];
  var REQUIRED_FILES_V3 = ['manifest.json', 'snapshot.json'];

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

  /* M05 §D classification. Exact basename equality against names derived from
   * VERIFIED identity: the verified chatId and the RECOMPUTED contentHash.
   * A filename is never identity authority.
   *
   * A legitimate legacy chatId ending in `.g<64hex>` classifies as LEGACY,
   * because its basename equals legacyExpected and can never equal
   * generationExpected (which appends a further `.g<hex>` suffix). */
  function classifyPackageBasenameV1(basename, verifiedChatId, recomputedContentHash) {
    var name = cleanString(basename);
    var chatId = cleanString(verifiedChatId);
    var hex = cleanString(recomputedContentHash).replace(/^sha256-/, '').toLowerCase();
    if (!name || !chatId) return 'unclassified';
    if (name === chatId + '.h2ochat') return 'legacy';
    if (/^[0-9a-f]{64}$/.test(hex) && name === chatId + '.g' + hex + '.h2ochat') return 'generation';
    return 'mismatch';
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

  /* Single governed saved-chat package codec authority (M03 T02/T03). This
   * module never implements its own gzip decoding, magic detection, physical or
   * logical hashing; it only adapts governed codec output into diagnostics. */
  function savedChatPackageCodecV3() {
    var codec = H2O.Studio && H2O.Studio.ingestion && H2O.Studio.ingestion.savedChatPackageCodec;
    if (!codec || codec.__installed !== true ||
        typeof codec.verifyPackageMemberBytes !== 'function' ||
        typeof codec.readBoundedPackageMemberBytes !== 'function' ||
        !isFiniteNumber(codec.LOGICAL_SNAPSHOT_CAP_BYTES)) {
      return null;
    }
    return codec;
  }

  async function fsReadBytes(path) {
    var invoke = getInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable for fs read_file');
    return bytesFor(await invoke('plugin:fs|read_file', { path: path, options: fsOptions() }));
  }

  /* M08: the governed verifier operates over one read-only package source.
   * The historical filesystem adapter remains the default; the portable-ZIP
   * adapter supplies a bounded in-memory byte map after container admission.
   * All package semantics below stay shared. */
  function filesystemPackageSource() {
    return {
      memory: false,
      exists: fsExists,
      readBytes: fsReadBytes,
      readDir: fsReadDir,
    };
  }

  function safeMemoryMemberPath(value) {
    var path = cleanString(value);
    var parts = path.split('/');
    return !!path && path.charAt(0) !== '/' && path.indexOf('\\') < 0 &&
      path.indexOf(':') < 0 && !parts.some(function (part) {
        return !part || part === '.' || part === '..';
      });
  }

  function memoryPackageSource(packagePath, entries) {
    var files = Object.create(null);
    asArray(entries).forEach(function (entry) {
      var rel = cleanString(entry && entry.name);
      if (!safeMemoryMemberPath(rel)) throw new Error('portable package member path is unsafe');
      if (Object.prototype.hasOwnProperty.call(files, rel)) throw new Error('portable package member path is duplicated');
      var source = bytesFor(entry && entry.bytes);
      var copy = new Uint8Array(source.byteLength);
      copy.set(source);
      files[rel] = copy;
    });
    function relative(fullPath) {
      var prefix = packagePath + '/';
      if (fullPath === packagePath) return '';
      if (fullPath.indexOf(prefix) !== 0) throw new Error('portable package source path escaped its root');
      return fullPath.slice(prefix.length);
    }
    function exists(fullPath) {
      var rel = relative(fullPath);
      if (!rel) return true;
      if (Object.prototype.hasOwnProperty.call(files, rel)) return true;
      var prefix = rel.replace(/\/$/, '') + '/';
      return Object.keys(files).some(function (name) { return name.indexOf(prefix) === 0; });
    }
    function readBytes(fullPath) {
      var rel = relative(fullPath);
      var value = files[rel];
      if (!value) return Promise.reject(new Error('portable package member not found'));
      var copy = new Uint8Array(value.byteLength);
      copy.set(value);
      return Promise.resolve(copy);
    }
    function readDir(fullPath) {
      var rel = relative(fullPath).replace(/\/$/, '');
      var prefix = rel ? rel + '/' : '';
      var children = Object.create(null);
      Object.keys(files).forEach(function (name) {
        if (name.indexOf(prefix) !== 0) return;
        var rest = name.slice(prefix.length);
        if (!rest) return;
        var slash = rest.indexOf('/');
        var child = slash >= 0 ? rest.slice(0, slash) : rest;
        children[child] = slash >= 0
          ? { name: child, isDirectory: true }
          : { name: child, isFile: true };
      });
      return Promise.resolve(Object.keys(children).sort().map(function (name) { return children[name]; }));
    }
    return { memory: true, exists: exists, readBytes: readBytes, readDir: readDir };
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
      /* M05 G1: true only when every archive entry was enumerated. A consumer
       * must not infer absence from a result with complete:false. */
      complete: true,
      truncated: false,
      blockers: [],
      warnings: [],
      counts: {},
      assetChecks: {
        passed: 0,
        warnings: 0,
        failed: 0,
      },
      packages: [],
      /* M06 T1.3: read-only staging/temp residue evidence, closing the M05
       * gap recorded in saved-chat-generations.md: "diagnostics report residue
       * count and exact paths; no delete authority."
       *
       * `count` is DERIVED from `entries.length`, never tracked separately, so
       * the two cannot drift. `complete` says whether the enumerated scope was
       * fully walked; `scanned` and `unscanned` say what that scope IS, so a
       * `count: 0` is never mistaken for "no residue anywhere in the archive".
       * Paths are evidence only -- nothing here confers mutation authority. */
      residue: {
        complete: false,
        scanned: [],
        unscanned: [],
        sources: [],
        count: 0,
        entries: [],
      },
    };
  }

  /* The reserved trusted staging/temp families of M05 section R and M06 T1.2.
   * Deliberately NOT "anything that looks temporary": a foreign or stray file
   * is reported by the existing archive-entry-* warnings, not counted as
   * trusted-writer residue. The reserved instance lock and the reserved
   * quarantine namespace are infrastructure, never residue. */
  /* M06 T1.3: the durable CAS writer's temps live in archive/assets/<aa>/,
   * where this surface holds no read-dir grant. A narrow trusted read-only
   * command answers for that family instead of widening the renderer. */
  var DURABLE_TEMP_RESIDUE_COMMAND = 'h2o_archive_durable_temp_residue';
  var DURABLE_TEMP_ROOT = LIVE_CAS_ROOT;
  var DURABLE_TEMP_FAMILY = '.h2o-durable-*.tmp';

  async function probeDurableTempResidue() {
    var source = {
      root: DURABLE_TEMP_ROOT,
      family: DURABLE_TEMP_FAMILY,
      complete: false,
      entries: [],
      reason: '',
    };
    var invoke = getInvoke();
    if (!invoke) {
      source.reason = 'tauri-invoke-unavailable';
      return source;
    }
    try {
      var probe = await invoke(DURABLE_TEMP_RESIDUE_COMMAND);
      var payload = safeObject(probe);
      /* Completeness is only ever ADOPTED from an explicit true. A malformed or
       * partial payload stays incomplete. */
      source.complete = payload.complete === true;
      source.entries = asArray(payload.entries).map(function (entry) {
        var item = safeObject(entry);
        return {
          name: cleanString(item.name),
          path: cleanString(item.path),
          kind: cleanString(item.kind) || 'durable-temp',
        };
      });
      if (!source.complete) source.reason = 'probe-incomplete';
      return source;
    } catch (err) {
      recordError(DURABLE_TEMP_RESIDUE_COMMAND, err);
      source.reason = 'probe-failed';
      return source;
    }
  }

  var RESIDUE_STAGING_PREFIX = '.h2o-genstage-';
  var RESIDUE_TEMP_PREFIX = '.h2o-durable-';
  var RESIDUE_TEMP_SUFFIX = '.tmp';

  /* M10 P3b: read-only staging/temp residue evidence, observed independently of
   * package verification.
   *
   * The legacy aggregate collected residue while walking the archive to VERIFY
   * packages. Verification now lives in trusted Rust, so this walks the same
   * namespace for residue ALONE: it lists entry names, classifies the two
   * residue families by prefix, and reads nothing inside any package. It
   * creates nothing, deletes nothing, and reaches no conclusion about package
   * validity — exactly the M06 T1.3 contract, minus the verification it used to
   * ride along with. */
  async function residueObservationV1() {
    var carrier = { residue: rootResult().residue };
    var stagingSource = {
      root: PACKAGE_ROOT,
      family: RESIDUE_STAGING_PREFIX + '*',
      complete: false,
      entries: [],
      reason: '',
    };
    /* Probed on EVERY path: a result that skipped the probe must never present
     * itself as complete. */
    var durableSource = await probeDurableTempResidue();
    try {
      var rootExists = await fsExists(PACKAGE_ROOT);
      if (!rootExists) {
        /* A missing package root is a PROVEN absence of staging residue. */
        stagingSource.complete = true;
        finalizeResidue(carrier, [stagingSource, durableSource]);
        return carrier.residue;
      }
      var entries = asArray(await fsReadDir(PACKAGE_ROOT));
      for (var i = 0; i < entries.length; i += 1) {
        var name = entryName(entries[i] || {});
        if (!name) {
          stagingSource.reason = 'entry-name-unreadable';
          continue;
        }
        /* BOTH reserved families are captured here, exactly as the legacy walk
         * did: staging lands as a directory and durable temp as a file, and
         * either can sit in the package root. Filtering to staging alone would
         * silently shrink the residue evidence. */
        var residueKind = residueKindForName(name);
        if (residueKind) {
          stagingSource.entries.push({
            path: entryPath(entries[i] || {}, name),
            name: name,
            kind: residueKind,
          });
        }
      }
      stagingSource.complete = !stagingSource.reason;
    } catch (err) {
      stagingSource.complete = false;
      stagingSource.reason = String((err && err.message) || err) || 'staging-scan-failed';
    }
    finalizeResidue(carrier, [stagingSource, durableSource]);
    return carrier.residue;
  }

  function residueKindForName(name) {
    var text = cleanString(name);
    if (!text) return '';
    if (text.indexOf(RESIDUE_STAGING_PREFIX) === 0) return 'generation-staging';
    if (text.indexOf(RESIDUE_TEMP_PREFIX) === 0 && /\.tmp$/.test(text)) return 'durable-temp';
    return '';
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

  function requiredFilesForManifest(manifest) {
    return manifest && manifest.schemaVersion === 3 ? REQUIRED_FILES_V3 : REQUIRED_FILES;
  }

  function addMissingRequiredFileIssues(diag, requiredFiles) {
    var required = asArray(requiredFiles);
    if (required.indexOf('manifest.json') >= 0 && !diag.manifestPresent) {
      diag.blockers.push(makeIssue('manifest-missing', 'manifest.json is missing'));
    }
    if (required.indexOf('snapshot.json') >= 0 && !diag.snapshotPresent) {
      diag.blockers.push(makeIssue('snapshot-missing', 'snapshot.json is missing'));
    }
    if (required.indexOf('chat.md') >= 0 && !diag.markdownPresent) {
      diag.blockers.push(makeIssue('markdown-missing', 'chat.md is missing'));
    }
    if (required.indexOf('chat.html') >= 0 && !diag.htmlPresent) {
      diag.blockers.push(makeIssue('html-missing', 'chat.html is missing'));
    }
  }

  async function shallowPackageEntry(packagePath, dirName) {
    var blockers = [];
    var warnings = [];
    var manifestPresent = await fsExists(joinPath(packagePath, 'manifest.json'));
    var manifest = null;
    if (manifestPresent) {
      try {
        manifest = parseJsonFile(bytesToText(await fsReadBytes(joinPath(packagePath, 'manifest.json'))), 'manifest', { blockers: blockers });
      } catch (err) {
        blockers.push(makeIssue('manifest-read-failed', 'manifest.json could not be read', String((err && err.message) || err)));
      }
    }
    var snapshotPresent = await fsExists(joinPath(packagePath, 'snapshot.json'));
    var markdownPresent = await fsExists(joinPath(packagePath, 'chat.md'));
    var htmlPresent = await fsExists(joinPath(packagePath, 'chat.html'));
    var assetsDirPresent = await fsExists(joinPath(packagePath, 'assets'));
    var requiredDiag = {
      manifestPresent: manifestPresent,
      snapshotPresent: snapshotPresent,
      markdownPresent: markdownPresent,
      htmlPresent: htmlPresent,
      blockers: blockers,
    };
    addMissingRequiredFileIssues(requiredDiag, requiredFilesForManifest(manifest));
    var status = statusFromIssues(blockers, warnings);
    return {
      ok: status === STATUS_OK,
      status: status,
      packagePath: packagePath,
      packageDirName: dirName || packageDirNameForPath(packagePath),
      nameClassification: 'unclassified',
      schemaVersion: manifest && isFiniteNumber(manifest.schemaVersion) ? manifest.schemaVersion : null,
      payloadVersion: manifest && isFiniteNumber(manifest.payloadVersion) ? manifest.payloadVersion : null,
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
      v3: 0,
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
      if (pkg.schemaVersion === 3) counts.v3 += 1;
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
      } else if (checks.packageAssetsOk === true || pkg.schemaVersion === 1 || pkg.schemaVersion === 2 || pkg.schemaVersion === 3) {
        assetSummary.passed += 1;
      }
    });
    /* Derived from the list itself so a count can never outlive its entries. */
    counts.residueTotal = asArray(result.residue && result.residue.entries).length;
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
    /* M05 G1: discovery is COMPLETE by default. The pre-M05 silent 500-entry
     * ceiling was harmless under one-package-per-chat, but accumulating
     * generations make it reachable — and a truncated scan must never be
     * usable as authority for fresh-generation ABSENCE, PRESERVED, COVERED,
     * BEST-HISTORICAL, or a dedupe/refresh decision. A caller may still bound
     * the work explicitly, and truncation is then reported as a BLOCKER plus
     * `complete:false`, never as a warning that a consumer could overlook. */
    var bounded = isFiniteNumber(opts.limit) && opts.limit > 0;
    var limit = bounded ? Math.floor(opts.limit) : Infinity;
    var result = rootResult();
    var stagingSource = {
      root: PACKAGE_ROOT,
      family: RESIDUE_STAGING_PREFIX + '*',
      complete: false,
      entries: [],
      reason: '',
    };
    /* Probed on EVERY path, including the early returns below: a result that
     * skipped the probe must never present itself as complete. */
    var durableSource = await probeDurableTempResidue();
    try {
      var rootExists = await fsExists(PACKAGE_ROOT);
      if (!rootExists) {
        result.warnings.push(makeIssue('archive-packages-root-missing', 'archive package root is missing'));
        /* A missing package root is a PROVEN absence of staging residue. */
        stagingSource.complete = true;
        finalizeResidue(result, [stagingSource, durableSource]);
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
        /* Recorded BEFORE the existing branches so residue evidence is
         * gathered without changing which warning any entry already produced.
         * Both reserved families are captured whether they land as a directory
         * (staging) or a file (temp). */
        var residueKind = residueKindForName(name);
        if (residueKind) {
          stagingSource.entries.push({
            name: name,
            path: entryPath(entry, name),
            kind: residueKind,
          });
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
      if (bounded && entries.length > limit) {
        /* BLOCKER, not a warning: a bounded scan is not evidence of absence. */
        result.complete = false;
        result.truncated = true;
        result.blockers.push(makeIssue('archive-package-inventory-truncated', 'archive package inventory was bounded and did not enumerate every entry; this result must not be used to conclude a package is absent', { limit: limit, entries: entries.length }));
      }
      /* Residue authority is exactly the enumeration authority: a bounded walk
       * stops early, so it cannot support a zero-residue conclusion either. */
      stagingSource.complete = result.complete === true;
      finalizeResidue(result, [stagingSource, durableSource]);
      state.lastRunAt = result.generatedAt;
      return setAggregateStatus(result, true);
    } catch (err) {
      recordError('listSavedChatArchivePackagesV1', err);
      result.blockers.push(makeIssue('archive-package-list-failed', 'archive package inventory failed', String((err && err.message) || err)));
      /* The walk threw: whatever was collected is a partial observation and
       * must never read as authoritative zero. */
      stagingSource.complete = false;
      stagingSource.reason = 'enumeration-failed';
      finalizeResidue(result, [stagingSource, durableSource]);
      return setAggregateStatus(result, false);
    }
  }

  /* Seals the residue block: deterministic order, derived count, and an
   * explicit statement of what was NOT looked at.
   *
   * `.h2o-durable-*.tmp` is created by the trusted CAS writer inside the shard
   * directory `archive/assets/<aa>/`, and this surface holds fs:allow-read-dir
   * for archive/packages only. That family therefore cannot be enumerated from
   * here at all, so it is declared unscanned rather than silently contributing
   * zero. Reaching it would require a renderer capability change, which T1.3
   * is not authorized to make. */
  function finalizeResidue(result, sources) {
    var residue = result.residue;
    var entries = [];
    var list = asArray(sources);
    list.forEach(function (source) {
      asArray(source.entries).forEach(function (entry) { entries.push(entry); });
    });
    entries.sort(function (a, b) {
      if (a.path < b.path) return -1;
      if (a.path > b.path) return 1;
      return 0;
    });
    residue.entries = entries;
    /* DERIVED, both of them. `count` cannot outlive its list, and completeness
     * cannot be asserted independently of the sources that established it --
     * so "a failed probe plus an empty staging list" can never compose into an
     * authoritative zero. */
    residue.count = entries.length;
    residue.sources = list.map(function (source) {
      return {
        root: source.root,
        family: source.family,
        complete: source.complete === true,
        reason: source.complete === true ? '' : (source.reason || 'incomplete'),
      };
    });
    residue.scanned = residue.sources
      .filter(function (source) { return source.complete; })
      .map(function (source) { return source.root; });
    residue.unscanned = residue.sources.filter(function (source) { return !source.complete; });
    residue.complete = residue.unscanned.length === 0;
    return result;
  }

  function packageDiagnostic(packagePath) {
    var path = cleanString(packagePath);
    var dirName = packageDirNameForPath(path);
    return {
      ok: false,
      status: STATUS_BLOCKED,
      packagePath: path,
      packageDirName: dirName,
      /* M05 §D: 'legacy' | 'generation' | 'mismatch' | 'unclassified'.
       * Set only after verification, from the verified chatId and the
       * RECOMPUTED contentHash. */
      nameClassification: 'unclassified',
      /* Verified snapshot.savedAt; presentation ordering only (M05 §G). */
      savedAt: '',
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
        snapshotByteLengthOk: null,
        snapshotEncoding: '',
        logicalSnapshotSha: '',
        logicalSnapshotByteLength: null,
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

  function validateManifestVersion(manifest, diag) {
    diag.schemaVersion = isFiniteNumber(manifest && manifest.schemaVersion) ? manifest.schemaVersion : null;
    diag.payloadVersion = isFiniteNumber(manifest && manifest.payloadVersion) ? manifest.payloadVersion : null;
    if (diag.schemaVersion !== 1 && diag.schemaVersion !== 2 && diag.schemaVersion !== 3) {
      diag.blockers.push(makeIssue('manifest-schema-version-invalid', 'manifest schemaVersion must be 1, 2 or 3', manifest && manifest.schemaVersion));
      return;
    }
    if (diag.schemaVersion === 1 && manifest.payloadVersion != null) {
      diag.blockers.push(makeIssue('manifest-payload-version-invalid', 'v1 manifest payloadVersion must be absent', manifest.payloadVersion));
    }
    if (diag.schemaVersion === 2 && diag.payloadVersion !== 2) {
      diag.blockers.push(makeIssue('manifest-payload-version-invalid', 'v2 manifest payloadVersion must be 2', manifest.payloadVersion));
    }
    if (diag.schemaVersion === 3 && diag.payloadVersion !== 3) {
      diag.blockers.push(makeIssue('manifest-payload-version-invalid', 'v3 manifest payloadVersion must be 3', manifest.payloadVersion));
    }
  }

  function validSha256(value) {
    return /^sha256-[0-9a-f]{64}$/.test(cleanString(value));
  }

  /* V1/v2 persistent renderers carry governed stored-byte descriptors in the
   * package manifest. Verify those descriptors in this shared package
   * authority so filesystem and portable byte-source admission cannot drift. */
  async function verifyLegacyRendererDescriptors(packagePath, manifest, diag, packageSource) {
    if (diag.schemaVersion !== 1 && diag.schemaVersion !== 2) return;
    var source = packageSource || filesystemPackageSource();
    var roles = [
      { key: 'markdown', path: 'chat.md', present: diag.markdownPresent },
      { key: 'html', path: 'chat.html', present: diag.htmlPresent },
    ];
    for (var i = 0; i < roles.length; i += 1) {
      var role = roles[i];
      var descriptor = safeObject(safeObject(manifest && manifest.files)[role.key]);
      if (cleanString(descriptor.path) !== role.path) {
        diag.blockers.push(makeIssue(role.key + '-path-invalid',
          'files.' + role.key + '.path must be ' + role.path, descriptor.path));
        continue;
      }
      if (!validSha256(descriptor.sha256)) {
        diag.blockers.push(makeIssue(role.key + '-sha-invalid',
          'files.' + role.key + '.sha256 must be a canonical SHA-256 identity', descriptor.sha256));
        continue;
      }
      if (!Number.isSafeInteger(descriptor.byteLength) || descriptor.byteLength < 0) {
        diag.blockers.push(makeIssue(role.key + '-byte-length-invalid',
          'files.' + role.key + '.byteLength must be a non-negative safe integer', descriptor.byteLength));
        continue;
      }
      if (!role.present) continue; /* the existing required-file blocker owns absence */
      try {
        var bytes = await source.readBytes(joinPath(packagePath, role.path));
        var actualSha = await sha256Prefixed(bytes);
        if (actualSha !== descriptor.sha256) {
          diag.blockers.push(makeIssue(role.key + '-sha-mismatch',
            'files.' + role.key + '.sha256 does not match stored ' + role.path + ' bytes',
            { expected: actualSha, actual: descriptor.sha256 }));
        }
        if (bytes.byteLength !== descriptor.byteLength) {
          diag.blockers.push(makeIssue(role.key + '-byte-length-mismatch',
            'files.' + role.key + '.byteLength does not match stored ' + role.path + ' bytes',
            { expected: descriptor.byteLength, actual: bytes.byteLength }));
        }
      } catch (error) {
        diag.blockers.push(makeIssue(role.key + '-read-failed',
          role.path + ' could not be read for descriptor verification',
          String((error && error.message) || error)));
      }
    }
  }

  async function verifyV3SnapshotDescriptor(manifest, snapshotBytes, diag) {
    var descriptor = safeObject(manifest && manifest.files && manifest.files.snapshot);
    var encoding = firstString(descriptor.encoding);
    var physicalSha = firstString(descriptor.sha256);
    var physicalLength = descriptor.byteLength;
    var actualLength = snapshotBytes ? snapshotBytes.byteLength : 0;
    var actualSha = snapshotBytes ? await sha256Prefixed(snapshotBytes) : '';
    var descriptorOk = true;
    var logicalBytes = null;

    diag.hashChecks.snapshotEncoding = encoding;
    if (firstString(descriptor.path) !== 'snapshot.json') {
      diag.blockers.push(makeIssue('snapshot-path-invalid', 'v3 files.snapshot.path must be snapshot.json', descriptor.path));
      descriptorOk = false;
    }
    if (encoding !== 'identity' && encoding !== 'gzip') {
      diag.blockers.push(makeIssue('snapshot-encoding-invalid', 'v3 files.snapshot.encoding must be identity or gzip', descriptor.encoding));
      descriptorOk = false;
    }
    if (!isFiniteNumber(physicalLength) || physicalLength < 0 || physicalLength !== actualLength) {
      diag.blockers.push(makeIssue('snapshot-byte-length-mismatch', 'files.snapshot.byteLength does not match stored snapshot.json bytes', { expected: physicalLength, actual: actualLength }));
      diag.hashChecks.snapshotByteLengthOk = false;
      descriptorOk = false;
    } else {
      diag.hashChecks.snapshotByteLengthOk = true;
    }
    diag.hashChecks.snapshotShaOk = validSha256(physicalSha) && physicalSha === actualSha;
    if (!diag.hashChecks.snapshotShaOk) {
      diag.blockers.push(makeIssue('snapshot-sha-mismatch', 'files.snapshot.sha256 does not match stored snapshot.json bytes', { expected: actualSha, actual: physicalSha }));
      descriptorOk = false;
    }

    var hasLogicalSha = descriptor.contentSha256 != null;
    var hasLogicalLength = descriptor.contentByteLength != null;
    if (encoding === 'identity') {
      if (hasLogicalSha && firstString(descriptor.contentSha256) !== physicalSha) {
        diag.blockers.push(makeIssue('snapshot-logical-sha-mismatch-identity', 'identity files.snapshot.contentSha256 must equal sha256', { sha256: physicalSha, contentSha256: descriptor.contentSha256 }));
        descriptorOk = false;
      }
      if (hasLogicalLength && descriptor.contentByteLength !== physicalLength) {
        diag.blockers.push(makeIssue('snapshot-logical-byte-length-mismatch-identity', 'identity files.snapshot.contentByteLength must equal byteLength', { byteLength: physicalLength, contentByteLength: descriptor.contentByteLength }));
        descriptorOk = false;
      }
    } else if (encoding === 'gzip') {
      if (!validSha256(descriptor.contentSha256)) {
        diag.blockers.push(makeIssue('snapshot-logical-sha-invalid', 'gzip files.snapshot.contentSha256 is required and must be a SHA-256 value', descriptor.contentSha256));
        descriptorOk = false;
      }
      if (!isFiniteNumber(descriptor.contentByteLength) || descriptor.contentByteLength < 0) {
        diag.blockers.push(makeIssue('snapshot-logical-byte-length-invalid', 'gzip files.snapshot.contentByteLength is required', descriptor.contentByteLength));
        descriptorOk = false;
      }
      /* DP-M03-C persisted rule: 0 < physicalByteLength < contentByteLength.
       * This is a descriptor-shape assertion in the same role as the identity
       * consistency checks above; gzip mechanics stay in the governed codec. */
      if (descriptorOk && !(physicalLength > 0 && physicalLength < descriptor.contentByteLength)) {
        diag.blockers.push(makeIssue('snapshot-gzip-physical-bound-invalid', 'gzip v3 snapshot must satisfy 0 < byteLength < contentByteLength', { byteLength: physicalLength, contentByteLength: descriptor.contentByteLength }));
        descriptorOk = false;
      }
      /* Governed decode + logical verification through the single codec
       * authority. Invoked only after the physical descriptor checks above
       * passed, so codec failures report a distinct lower-level reason. */
      if (descriptorOk) {
        var codec = savedChatPackageCodecV3();
        if (!codec) {
          diag.blockers.push(makeIssue('snapshot-codec-unavailable', 'governed saved-chat package codec is unavailable for gzip v3 verification'));
          descriptorOk = false;
        } else {
          try {
            var verified = await codec.verifyPackageMemberBytes({
              storedBytes: snapshotBytes,
              descriptor: descriptor,
              expectedPath: 'snapshot.json',
              physicalByteCap: codec.LOGICAL_SNAPSHOT_CAP_BYTES,
              logicalByteCap: codec.LOGICAL_SNAPSHOT_CAP_BYTES,
            });
            logicalBytes = verified.logicalBytes;
          } catch (err) {
            diag.blockers.push(makeIssue('snapshot-gzip-verification-failed', 'gzip v3 snapshot failed governed member verification', firstString(err && err.code) || String((err && err.message) || err)));
            descriptorOk = false;
          }
        }
      }
    }

    /* Exact frozen normalization. Optional identity logical fields are accepted
     * only when individually consistent with their physical counterparts. */
    diag.hashChecks.logicalSnapshotSha = firstString(descriptor.contentSha256, physicalSha);
    diag.hashChecks.logicalSnapshotByteLength = isFiniteNumber(descriptor.contentByteLength)
      ? descriptor.contentByteLength : (isFiniteNumber(physicalLength) ? physicalLength : null);
    return {
      parseIdentity: descriptorOk && encoding === 'identity',
      parseLogical: descriptorOk && encoding === 'gzip' && !!logicalBytes,
      logicalBytes: logicalBytes,
      logicalSha256: diag.hashChecks.logicalSnapshotSha,
    };
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

  async function listPackageAssetRelativePaths(packagePath, diag, packageSource) {
    var out = [];
    if (!diag.assetsDirPresent) return out;
    try {
      var source = packageSource || filesystemPackageSource();
      var entries = asArray(await source.readDir(joinPath(packagePath, 'assets')));
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
    var canonicalParts = snapshot && snapshot.schemaVersion === 3;
    asArray(snapshot && snapshot.messages).forEach(function (message, messageIndex) {
      /* V3 scans only canonical typed HTML. V1/v2 retain the historical scalar
       * scan followed by structured content scanning. */
      if (!canonicalParts && typeof message.contentHtml === 'string' && message.contentHtml) {
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

  /* M10 P3a: the SAME C5.4A reconciliation, extracted so it can be driven by a
   * trusted identity instead of a re-parsed manifest.
   *
   * Read-only and package-centric. Uses ONLY store.chats.get /
   * store.snapshots.get / store.snapshots.listByChat / store.assets.listBySnapshot.
   * Never mutates the DB, never writes packages or CAS, never repairs/imports.
   * Missing rows / drift are WARNINGS, not blockers; a missing namespace,
   * missing method, or thrown read degrades to a warning.
   *
   * Decision-neutral: it reconciles the identity it is handed and reaches no
   * conclusion about package validity. `assetShas` is the package-side asset SHA
   * set — the legacy caller derives it from the verified manifest, the trusted
   * caller passes P1's already-verified `assetShas`. Neither re-verifies bytes.
   */
  async function dbDriftForIdentity(identity, stores) {
    var ident = safeObject(identity);
    var db = defaultDbChecks();
    var warnings = [];
    function warn(code, message, detail) {
      var issue = makeIssue(code, message, detail);
      db.warnings.push(issue);
      warnings.push(issue);
      return issue;
    }

    db.checked = true;
    if (!stores) {
      db.available = false;
      warn('db-api-missing', 'H2O.Studio.store is unavailable for DB reconciliation');
      return { dbChecks: db, warnings: warnings };
    }
    db.available = true;
    var chatId = cleanString(ident.chatId);
    var snapshotId = cleanString(ident.snapshotId);
    /* No identity to reconcile (an already-blocked package). */
    if (!chatId && !snapshotId) return { dbChecks: db, warnings: warnings };

    /* chat existence */
    if (chatId) {
      if (stores.chats && typeof stores.chats.get === 'function') {
        try {
          var chatRow = await stores.chats.get(chatId);
          db.chatExists = !!chatRow;
          if (!chatRow) warn('missing-db-chat', 'package chatId has no DB chat row', { chatId: chatId });
        } catch (err) {
          warn('db-check-failed', 'store.chats.get failed', { chatId: chatId, error: String((err && err.message) || err) });
        }
      } else {
        warn('db-api-missing', 'store.chats.get is unavailable');
      }
    }

    /* snapshot existence (store.snapshots.get returns { snapshot, turns } | row | null) */
    if (snapshotId) {
      if (stores.snapshots && typeof stores.snapshots.get === 'function') {
        try {
          var snapRow = await stores.snapshots.get(snapshotId);
          db.snapshotExists = !!(snapRow && (snapRow.snapshot || snapRow.snapshotId || snapRow.id));
          if (!db.snapshotExists) warn('missing-db-snapshot', 'package snapshotId has no DB snapshot row', { snapshotId: snapshotId });
        } catch (err) {
          warn('db-check-failed', 'store.snapshots.get failed', { snapshotId: snapshotId, error: String((err && err.message) || err) });
        }
      } else {
        warn('db-api-missing', 'store.snapshots.get is unavailable');
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
            if (!db.packageIsLatest) warn('stale-package', 'package snapshot is not the latest DB snapshot for this chat', { packageSnapshotId: snapshotId, latestSnapshotId: latestId });
          }
        }
      } catch (err) {
        warn('db-check-failed', 'store.snapshots.listByChat failed', { chatId: chatId, error: String((err && err.message) || err) });
      }
    } else if (chatId && (!stores.snapshots || typeof stores.snapshots.listByChat !== 'function')) {
      warn('db-api-missing', 'store.snapshots.listByChat is unavailable');
    }

    /* store asset registry vs the package-side asset SHA set */
    if (snapshotId) {
      if (stores.assets && typeof stores.assets.listBySnapshot === 'function') {
        try {
          var storeAssetRows = asArray(await stores.assets.listBySnapshot(snapshotId));
          var storeShas = uniqStrings(storeAssetRows.map(function (row) { return row && row.sha256; }));
          db.storeAssetCount = storeShas.length;
          var packageShas = uniqStrings(asArray(ident.assetShas));
          var missing = packageShas.filter(function (sha) { return storeShas.indexOf(sha) < 0; });
          var extra = storeShas.filter(function (sha) { return packageShas.indexOf(sha) < 0; });
          db.missingStoreAssets = missing;
          db.extraStoreAssets = extra;
          db.packageAssetSetMatchesStore = missing.length === 0 && extra.length === 0;
          if (!db.packageAssetSetMatchesStore) {
            warn('store-asset-registry-mismatch', 'store asset registry differs from package manifest assets', { missingStoreAssets: missing, extraStoreAssets: extra });
          }
        } catch (err) {
          warn('db-check-failed', 'store.assets.listBySnapshot failed', { snapshotId: snapshotId, error: String((err && err.message) || err) });
        }
      } else {
        warn('db-api-missing', 'store.assets.listBySnapshot is unavailable');
      }
    }

    return { dbChecks: db, warnings: warnings };
  }

  /* The legacy wrapper. It derives the asset SHA set from the manifest it has
   * already verified and delegates to the shared helper, so the pre-P3 path
   * behaves exactly as before. */
  async function validateDbChecks(diag, manifest, includeDbChecks) {
    if (includeDbChecks === false) return;
    var manifestShas = asArray(manifest && manifest.assets).map(function (asset) {
      return asset && asset.sha256;
    });
    var drift = await dbDriftForIdentity({
      chatId: diag.chatId,
      snapshotId: diag.snapshotId,
      assetShas: manifestShas,
    }, getStores());
    diag.dbChecks = drift.dbChecks;
    /* Mirrored to the package warnings so the package status can degrade to
     * "warning" — exactly as the pre-extraction code did. */
    drift.warnings.forEach(function (issue) { diag.warnings.push(issue); });
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

  async function validatePackageAssetFiles(packagePath, manifestAssets, diag, packageSource) {
    var source = packageSource || filesystemPackageSource();
    var actualPaths = await listPackageAssetRelativePaths(packagePath, diag, source);
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
      try { exists = await source.exists(fullPath); }
      catch (err) {
        addAssetBlocker(diag, 'missingPackageAssets', 'package-asset-exists-check-failed', 'package asset existence check failed', { sha256: asset.sha256, path: asset.path, error: String((err && err.message) || err) });
        continue;
      }
      if (!exists) {
        addAssetBlocker(diag, 'missingPackageAssets', 'package-asset-missing', 'package asset file is missing', { sha256: asset.sha256, path: asset.path });
        continue;
      }
      var bytes = null;
      try { bytes = await source.readBytes(fullPath); }
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

  async function validateRendererAssetRefs(packagePath, snapshot, chatHtmlText, manifestAssets, diag, packageSource) {
    var source = packageSource || filesystemPackageSource();
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
        try { exists = await source.exists(joinPath(packagePath, refPath)); }
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

  /* M10 P3a: the SAME read-only live-CAS presence observation, extracted so it
   * can be driven by a trusted asset SHA set.
   *
   * Presence only. It reads no package bytes, verifies nothing, and never
   * decides package validity: a missing CAS body is drift, because the package
   * itself remains portable. Unreferenced CAS content is NEVER called an
   * orphan, reclaimable, or safe to delete — no authority here says that.
   *
   * `assets` entries are `{ sha256, path? }`; `path` is warning DETAIL only. */
  async function liveCasPresenceForShas(assets) {
    var out = { checked: true, available: false, warnings: [] };
    function warn(code, message, detail) {
      out.warnings.push({ bucket: 'missingLiveCasAssets', issue: makeIssue(code, message, detail) });
    }
    var assetCas = getAssetCas();
    if (!assetCas || (typeof assetCas.exists !== 'function' && typeof assetCas.describe !== 'function')) {
      warn('live-cas-diagnostic-unavailable', 'live CAS read-only diagnostic helper is unavailable');
      return out;
    }
    out.available = true;
    var list = asArray(assets);
    for (var i = 0; i < list.length; i += 1) {
      var asset = safeObject(list[i]);
      var exists = false;
      try {
        if (typeof assetCas.exists === 'function') exists = !!(await assetCas.exists(asset.sha256));
        else {
          var desc = await assetCas.describe(asset.sha256);
          exists = !!(desc && desc.exists);
        }
      } catch (err) {
        warn('live-cas-check-failed', 'live CAS existence check failed', { sha256: asset.sha256, error: String((err && err.message) || err) });
        continue;
      }
      if (!exists) {
        warn('live-cas-missing-package-portable', 'live CAS asset is missing, but package remains portable when the package asset is valid', { sha256: asset.sha256, path: asset.path });
      }
    }
    return out;
  }

  /* The legacy wrapper, delegating so the pre-P3 path is unchanged. */
  async function compareLiveCasAssets(manifestAssets, diag, includeCasChecks) {
    if (!includeCasChecks) return;
    var result = await liveCasPresenceForShas(manifestAssets);
    diag.assetChecks.liveCasChecked = result.checked;
    diag.assetChecks.liveCasAvailable = result.available;
    result.warnings.forEach(function (entry) {
      addAssetWarning(diag, entry.bucket, entry.issue.code, entry.issue.message, entry.issue.detail);
    });
  }

  async function validateSavedChatPackageV1(options, packageSourceOverride) {
    var opts = safeObject(options);
    var packagePath = firstString(opts.packagePath, opts.path);
    var packageSource = packageSourceOverride || filesystemPackageSource();
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

      var manifest = null;
      var snapshot = null;
      var snapshotBytes = null;
      var chatHtmlText = '';
      var v3SnapshotVerification = null;
      diag.manifestPresent = await packageSource.exists(joinPath(packagePath, 'manifest.json'));
      if (diag.manifestPresent) {
        manifest = parseJsonFile(bytesToText(await packageSource.readBytes(joinPath(packagePath, 'manifest.json'))), 'manifest', diag);
      }
      if (manifest) {
        if (manifest.schema && manifest.schema !== PACKAGE_SCHEMA) {
          diag.blockers.push(makeIssue('manifest-schema-invalid', 'manifest schema is not h2o.savedChatPackage', manifest.schema));
        }
        validateManifestVersion(manifest, diag);
        diag.chatId = firstString(manifest.chatId);
        diag.snapshotId = firstString(manifest.snapshotId);
      }

      /* Manifest metadata selects the required inventory. A missing or
       * malformed manifest retains the frozen legacy fail-closed inventory. */
      diag.snapshotPresent = await packageSource.exists(joinPath(packagePath, 'snapshot.json'));
      diag.markdownPresent = await packageSource.exists(joinPath(packagePath, 'chat.md'));
      diag.htmlPresent = await packageSource.exists(joinPath(packagePath, 'chat.html'));
      diag.assetsDirPresent = await packageSource.exists(joinPath(packagePath, 'assets'));
      addMissingRequiredFileIssues(diag, requiredFilesForManifest(manifest));

      if (diag.snapshotPresent) {
        if (diag.schemaVersion === 3 && manifest) {
          /* M03 T04: the v3 snapshot member is obtained through the governed
           * bounded reader, which performs filesystem metadata admission
           * (lstat), rejects a member larger than the governed logical snapshot
           * cap BEFORE any whole-file allocation, then returns the bounded
           * stored bytes. The manifest descriptor is never the independent
           * pre-read bound. Diagnostics implements none of that itself. */
          var v3Codec = savedChatPackageCodecV3();
          if (!v3Codec) {
            diag.blockers.push(makeIssue('snapshot-codec-unavailable', 'governed saved-chat package codec is unavailable for v3 member reads'));
          } else {
            try {
              if (packageSource.memory) {
                snapshotBytes = bytesFor(await packageSource.readBytes(joinPath(packagePath, 'snapshot.json')));
                if (snapshotBytes.byteLength > v3Codec.LOGICAL_SNAPSHOT_CAP_BYTES) {
                  throw new Error('portable v3 snapshot exceeds governed physical cap');
                }
              } else {
                var boundedSnapshot = await v3Codec.readBoundedPackageMemberBytes({
                  packagePath: packagePath,
                  memberPath: 'snapshot.json',
                  physicalByteCap: v3Codec.LOGICAL_SNAPSHOT_CAP_BYTES,
                });
                snapshotBytes = bytesFor(boundedSnapshot.storedBytes);
              }
            } catch (err) {
              diag.blockers.push(makeIssue('snapshot-bounded-read-failed', 'v3 snapshot.json failed the governed bounded member read', firstString(err && err.code) || String((err && err.message) || err)));
            }
          }
        } else {
          /* Preserve the historical v1/v2 read path unchanged. */
          snapshotBytes = await packageSource.readBytes(joinPath(packagePath, 'snapshot.json'));
        }
        if (diag.schemaVersion === 3 && manifest && snapshotBytes) {
          v3SnapshotVerification = await verifyV3SnapshotDescriptor(manifest, snapshotBytes, diag);
          /* V3 identity bytes are parsed only after stored-byte descriptor
           * verification. Encoded stored bytes are never passed to JSON.parse;
           * gzip parses only the governed codec's verified decoded logical
           * bytes, after physical, encoding and logical verification passed. */
          if (v3SnapshotVerification.parseIdentity) {
            snapshot = parseJsonFile(bytesToText(snapshotBytes), 'snapshot', diag);
          } else if (v3SnapshotVerification.parseLogical) {
            snapshot = parseJsonFile(bytesToText(v3SnapshotVerification.logicalBytes), 'snapshot', diag);
          }
        } else if (snapshotBytes) {
          /* Preserve the historical v1/v2 parse path unchanged. */
          snapshot = parseJsonFile(bytesToText(snapshotBytes), 'snapshot', diag);
        }
      }
      if (includeRendererChecks && diag.htmlPresent) {
        try { chatHtmlText = bytesToText(await packageSource.readBytes(joinPath(packagePath, 'chat.html'))); }
        catch (err) {
          addAssetBlocker(diag, 'rendererAssetRefMismatches', 'chat-html-unreadable', 'chat.html could not be read for renderer asset diagnostics', String((err && err.message) || err));
        }
      }
      if (manifest) {
        await verifyLegacyRendererDescriptors(packagePath, manifest, diag, packageSource);
      }

      if (snapshot) {
        if (diag.schemaVersion === 3 && snapshot.schemaVersion !== 3) {
          diag.blockers.push(makeIssue('snapshot-schema-version-invalid', 'v3 snapshot schemaVersion must be 3', snapshot.schemaVersion));
        }
        if (snapshot.chatId && diag.chatId && snapshot.chatId !== diag.chatId) {
          diag.blockers.push(makeIssue('chat-id-mismatch', 'manifest.chatId does not match snapshot.chatId'));
        }
        if (snapshot.snapshotId && diag.snapshotId && snapshot.snapshotId !== diag.snapshotId) {
          diag.blockers.push(makeIssue('snapshot-id-mismatch', 'manifest.snapshotId does not match snapshot.snapshotId'));
        }
        diag.chatId = firstString(diag.chatId, snapshot.chatId);
        diag.snapshotId = firstString(diag.snapshotId, snapshot.snapshotId);
        /* Verified snapshot metadata, surfaced for M05 §G BEST-HISTORICAL
         * ordering. `savedAt` lives INSIDE the hashed snapshot, so it is
         * content the package's own identity covers — unlike a filesystem
         * mtime or manifest.generatedAt, neither of which may order anything.
         * It is presentation metadata only and is never freshness authority. */
        diag.savedAt = firstString(snapshot.savedAt);
      }

      if (manifest && snapshotBytes) {
        var fileSnapshotSha = firstString(manifest.files && manifest.files.snapshot && manifest.files.snapshot.sha256);
        if (diag.schemaVersion !== 3) {
          var actualSnapshotSha = await sha256Prefixed(snapshotBytes);
          diag.hashChecks.snapshotShaOk = !!fileSnapshotSha && fileSnapshotSha === actualSnapshotSha;
          if (!diag.hashChecks.snapshotShaOk) {
            diag.blockers.push(makeIssue('snapshot-sha-mismatch', 'files.snapshot.sha256 does not match stored snapshot.json bytes', { expected: actualSnapshotSha, actual: fileSnapshotSha }));
          }
          var snapshotByteLength = safeObject(safeObject(manifest.files).snapshot).byteLength;
          diag.hashChecks.snapshotByteLengthOk = Number.isSafeInteger(snapshotByteLength) &&
            snapshotByteLength >= 0 && snapshotByteLength === snapshotBytes.byteLength;
          if (!diag.hashChecks.snapshotByteLengthOk) {
            diag.blockers.push(makeIssue('snapshot-byte-length-mismatch',
              'files.snapshot.byteLength does not match stored snapshot.json bytes',
              { expected: snapshotByteLength, actual: snapshotBytes.byteLength }));
          }
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
        } else if (diag.schemaVersion === 3) {
          var v3AssetShas = asArray(manifest.assets).map(function (asset) {
            return normalizeAssetSha(asset && asset.sha256);
          }).filter(Boolean).sort();
          var logicalSnapshotSha = v3SnapshotVerification && v3SnapshotVerification.logicalSha256;
          if (logicalSnapshotSha) {
            expectedContentHash = await sha256Prefixed(canonicalJson({
              payloadVersion: 3,
              snapshot: logicalSnapshotSha,
              assets: v3AssetShas,
            }));
          }
        }
        diag.hashChecks.expectedContentHash = expectedContentHash;
        diag.hashChecks.actualContentHash = firstString(manifest.contentHash);
        diag.hashChecks.contentHashOk = !!expectedContentHash && expectedContentHash === diag.hashChecks.actualContentHash;
        if (!diag.hashChecks.contentHashOk) {
          diag.blockers.push(makeIssue('content-hash-mismatch', 'manifest.contentHash does not match expected package content hash', { expected: expectedContentHash, actual: diag.hashChecks.actualContentHash }));
        }

        /* M05 §D: the basename is DISCOVERY INPUT ONLY. Identity is the join of
         * the verified chatId with the RECOMPUTED contentHash — never the raw
         * manifest.contentHash string, and never a filename parse. This
         * supersedes the pre-M05 `package-dirname-chat-id-mismatch` blocker,
         * which required `<chatId>.h2ochat` and therefore blocked every
         * generation name. */
        if (diag.chatId && expectedContentHash) {
          diag.nameClassification = classifyPackageBasenameV1(diag.packageDirName, diag.chatId, expectedContentHash);
          if (diag.nameClassification === 'mismatch') {
            diag.blockers.push(makeIssue('package-name-identity-mismatch', 'package basename matches neither the legacy nor the generation name for its verified identity', { basename: diag.packageDirName }));
          }
        }
      }

      if (manifest) {
        if (diag.schemaVersion === 1) {
          diag.assetChecks.manifestAssetCount = asArray(manifest.assets).length;
          if (diag.assetsDirPresent) {
            addAssetWarning(diag, 'extraPackageAssets', 'unexpected-assets-dir-v1', 'v1 asset-less package should normally omit assets/');
            diag.assetChecks.packageAssetCount = (await listPackageAssetRelativePaths(packagePath, diag, packageSource)).length;
          }
          diag.assetChecks.packageAssetsOk = true;
        } else if (diag.schemaVersion === 2 || diag.schemaVersion === 3) {
          var manifestAssetInfo = validateManifestAssets(manifest, diag);
          await validatePackageAssetFiles(packagePath, manifestAssetInfo.list, diag, packageSource);
          if (snapshot) validateSnapshotAssetRefs(snapshot, manifestAssetInfo.list, diag);
          if (includeRendererChecks && snapshot) await validateRendererAssetRefs(packagePath, snapshot, chatHtmlText, manifestAssetInfo.list, diag, packageSource);
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

  /* M10 P3b: the six P2 operator states, expressed in the legacy status
   * vocabulary the unchanged Health formatter already consumes. No new status
   * key is introduced. `partial-scan` carries `complete:false`, and the
   * formatter's FIRST branch turns that into "Partial scan" whatever the
   * status says. */
  var LEGACY_STATUS_BY_AGGREGATE = {
    'healthy': STATUS_OK,
    'healthy-with-drift': STATUS_WARNING,
    'mixed': STATUS_PARTIAL,
    'integrity-problems': STATUS_BLOCKED,
    'empty': STATUS_EMPTY,
  };

  /* Projects ONE trusted presentation row into the legacy package shape real
   * consumers still read. Every identity fact comes from trusted Rust; status,
   * blockers and the deprecated compatibility names come from P2; warnings and
   * dbChecks come from the separate observations. Nothing is verified here. */
  function trustedRowToPackageDiagnostic(row, dbChecks) {
    var diag = packageDiagnostic(row.packagePath);
    diag.status = row.status;
    diag.ok = row.status === STATUS_OK;
    diag.nameClassification = row.nameClassification;
    diag.chatId = cleanString(row.chatId);
    diag.snapshotId = cleanString(row.snapshotId);
    diag.savedAt = cleanString(row.savedAt);
    diag.schemaVersion = row.schemaVersion;
    /* Blockers are the trusted verifier's own rule codes, humanized by P2. */
    diag.blockers = asArray(row.blockerExplanations).map(function (entry) {
      return makeIssue(entry.code, entry.text);
    });
    diag.warnings = asArray(row.warnings).map(function (text) {
      return makeIssue('package-drift', text);
    });
    /* The RECOMPUTED trusted contentHash. Kept on hashChecks for the existing
     * consumer that reads `expectedContentHash`; nothing is derived here. */
    var contentHash = cleanString(row.contentHash);
    diag.hashChecks.expectedContentHash = contentHash;
    diag.hashChecks.actualContentHash = contentHash;
    diag.hashChecks.contentHashOk = !!contentHash;
    if (isObject(dbChecks)) diag.dbChecks = dbChecks;
    /* The legacy asset/renderer buckets are NOT observed on the trusted path.
     * They are removed rather than left at their zero defaults so the UI can
     * tell "not measured" from "measured none". */
    delete diag.assetChecks.dataImageResidue;
    delete diag.assetChecks.assetRefMismatches;
    delete diag.assetChecks.rendererAssetRefMismatches;
    return diag;
  }

  /* M10 P3b — the production Archive Health facade, now sourced EXCLUSIVELY
   * from the trusted Rust integrity authority.
   *
   * There is deliberately NO runtime fallback: if the trusted read, the
   * trusted contract, or the presentation mapper fails, this rejects and the
   * Health UI's existing error lifecycle takes over. It never reaches for the
   * weaker JS verifier, and it never reports Healthy from legacy validation.
   * Operational rollback is reverting this commit, not a hidden second
   * authority.
   *
   * Coverage and the package Inspector still use the legacy exports; migrating
   * them is P3.5, and duplicate integrity code is retired only in P4. */
  function composeTrustedArchiveHealth() {
    var compose = H2O.Studio.ingestion.composeSavedChatArchiveHealthV1;
    if (typeof compose !== 'function') {
      throw new Error('[archive-health] the trusted composition is unavailable');
    }
    return compose;
  }

  async function diagnoseSavedChatArchiveV1(options) {
    var opts = safeObject(options);
    var composed = await composeTrustedArchiveHealth()({
      includeCasChecks: opts.includeCasChecks,
      includeRendererChecks: opts.includeRendererChecks,
      includeDbChecks: opts.includeDbChecks,
    });
    var model = composed.model;

    var result = rootResult();
    result.complete = model.complete;
    result.truncated = false;
    /* Residue is a SEPARATE read-only observation (M06 T1.3), not a package
     * verdict. It used to ride along with legacy enumeration; it is now
     * observed on its own so the aggregate still carries the evidence rather
     * than reporting an authoritative zero it never established. */
    result.residue = await residueObservationV1();
    /* Archive-level ENUMERATION blockers, distinct from per-package
     * verification blockers, exactly as the trusted envelope separates them. */
    result.blockers = asArray(composed.integrity && composed.integrity.blockers).map(function (code) {
      return makeIssue(cleanString(code), 'archive enumeration blocker');
    });
    result.warnings = asArray(model.archiveWarnings).map(function (text) {
      return makeIssue('archive-drift', text);
    });

    asArray(model.packageRows).forEach(function (row) {
      result.packages.push(
        trustedRowToPackageDiagnostic(row, composed.dbChecksByPath[row.packagePath]),
      );
    });

    updateCounts(result);
    /* M10 P3 metric correction. `updateCounts` is the SHARED legacy summariser,
     * so it still seeds these three keys from the legacy asset/renderer buckets
     * — buckets the trusted path deliberately does not populate. Emitting them
     * would publish a measured-looking zero for something this path never
     * measured, so the trusted result carries them not at all:
     *
     *   brokenPackageAssets  RETIRED. Canonical verification is fail-fast, so an
     *                        exact multi-error asset total does not exist. The
     *                        per-package trusted blocker explanations are the
     *                        authoritative account of what actually failed.
     *   assetRefMismatches   RETIRED. It conflated canonical package-integrity
     *                        mismatches with renderer-hygiene observations; the
     *                        integrity half is now a trusted blocker code.
     *   dataImageResidue     RETIRED as a legacy COUNT. Renderer hygiene is now
     *                        performed (P3.5b), but as a separate drift
     *                        observation reported under `rendererHygiene` with
     *                        its own availability. It is not folded back into
     *                        this legacy blocker-bucket total, whose semantics
     *                        were "package verification failures".
     */
    delete result.counts.brokenPackageAssets;
    delete result.counts.assetRefMismatches;
    delete result.counts.dataImageResidue;
    /* Renderer hygiene (P3.5b). Reported with its OWN availability rather than
     * implied by a missing key, and never a severity input of its own: its
     * findings already reached the aggregate as ordinary package drift
     * warnings, through the same presentation bucket every other observation
     * uses. Counts appear only for what was actually observed — a package that
     * could not be read contributes to `packagesUnavailable`, never a zero. */
    var hygiene = safeObject(composed.rendererHygiene);
    result.rendererHygiene = {
      observed: hygiene.packagesObserved > 0,
      attempted: hygiene.attempted === true,
      packagesObserved: hygiene.packagesObserved || 0,
      packagesUnavailable: hygiene.packagesUnavailable || 0,
      packagesSkipped: hygiene.packagesSkipped || 0,
    };
    if (result.rendererHygiene.observed) {
      result.rendererHygiene.dataImageResidue = hygiene.dataImageResidue || 0;
      result.rendererHygiene.assetRefDrift = hygiene.assetRefDrift || 0;
    }

    var status = LEGACY_STATUS_BY_AGGREGATE[model.aggregateState];
    if (!status) {
      /* partial-scan. `complete:false` already drives the formatter's first
       * branch; the status still describes what WAS observed, derived by the
       * same mapper rather than by a second rule here. */
      var observed = model.observed;
      status = LEGACY_STATUS_BY_AGGREGATE[
        H2O.Studio.archiveHealthMapping.selectAggregateState({
          complete: true,
          packagesTotal: observed.packagesTotal,
          packagesBlocked: observed.packagesBlocked,
          packagesWarning: observed.packagesWarning,
          archiveWarnings: asArray(model.archiveWarnings).length,
        })
      ] || STATUS_OK;
    }
    result.status = status;
    result.ok = status === STATUS_OK;
    state.lastRunAt = result.generatedAt;
    return result;
  }

  /* M08 read-only byte-source adapter. The portable container has already
   * bounded and normalized every entry, but this entry point still copies the
   * byte map and runs the exact same verifier core used for archive paths. */
  async function validateSavedChatPackageBytesV1(options) {
    var opts = safeObject(options);
    var packageDirName = cleanString(opts.packageDirName);
    var virtualPath = joinPath(PACKAGE_ROOT, packageDirName);
    if (!/^[A-Za-z0-9._-]+\.h2ochat$/.test(packageDirName) ||
        packageDirName === '.h2ochat' || packageDirName.indexOf('..') >= 0) {
      var invalid = packageDiagnostic(virtualPath);
      invalid.blockers.push(makeIssue('package-byte-source-invalid', 'portable packageDirName is not a safe .h2ochat basename'));
      invalid.status = statusFromIssues(invalid.blockers, invalid.warnings);
      return invalid;
    }
    try {
      var source = memoryPackageSource(virtualPath, opts.entries);
      return validateSavedChatPackageV1({
        packagePath: virtualPath,
        includeCasChecks: false,
        includeDbChecks: false,
        includeRendererChecks: opts.includeRendererChecks !== false,
      }, source);
    } catch (error) {
      var diag = packageDiagnostic(virtualPath);
      diag.blockers.push(makeIssue('package-byte-source-invalid', 'portable package byte source is invalid', String((error && error.message) || error)));
      diag.status = statusFromIssues(diag.blockers, diag.warnings);
      return diag;
    }
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
        'validateSavedChatPackageBytesV1',
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

  /* M10 P3a: shared, decision-neutral observation helpers. Exported so the
   * trusted composition can reuse the EXISTING checks instead of restating
   * them. Neither decides package validity. */
  H2O.Studio.ingestion.dbDriftForIdentityV1 = dbDriftForIdentity;
  H2O.Studio.ingestion.liveCasPresenceForShasV1 = liveCasPresenceForShas;
  H2O.Studio.ingestion.diagnoseSavedChatArchiveCapabilitiesV1 = diagnoseSavedChatArchiveCapabilitiesV1;
  H2O.Studio.ingestion.listSavedChatArchivePackagesV1 = function (options) {
    return listSavedChatArchivePackagesV1(options);
  };
  H2O.Studio.ingestion.validateSavedChatPackageV1 = function (options) {
    return validateSavedChatPackageV1(options);
  };
  H2O.Studio.ingestion.validateSavedChatPackageBytesV1 = function (options) {
    return validateSavedChatPackageBytesV1(options);
  };
  H2O.Studio.ingestion.diagnoseSavedChatArchiveV1 = function (options) {
    return diagnoseSavedChatArchiveV1(options);
  };
})(typeof window !== 'undefined' ? window : globalThis);
