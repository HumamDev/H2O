/* H2O Studio — Saved Chat Archive Exporter (Desktop, Phase J.2)
 *
 * Desktop-only, verification-gated export/share action for one `.h2ochat`
 * package. This is deliberately separate from export-bundle.tauri.js, which is
 * the full-library h2o.studio.fullBundle.v2 exporter.
 *
 * Boundaries:
 *   - Source package must inspect as verified via H2O.Studio.archiveInspector.
 *   - Destination is fixed to $HOME/H2O Studio Exports/ only.
 *   - No OS picker, no arbitrary caller-supplied destination root.
 *   - Manifest-driven copy only; no blind recursive copy.
 *   - No overwrite: existing final destination is rejected.
 *   - Atomic strategy: temp .h2ochat directory under export root, then rename.
 *   - No DB/store writes, no scanner/materializer/importer calls, no Chrome
 *     package-body authority, no sync/WebDAV/cloud/native messaging.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  if (H2O.Studio.archiveExporter && H2O.Studio.archiveExporter.__installed) return;

  var MODULE_VERSION = '0.1.0-phase-j-2';
  var APP_LOCAL_DATA = 15;
  var HOME_BASE_DIR = 21;
  var PACKAGE_ROOT = 'archive/packages';
  var EXPORT_ROOT = 'H2O Studio Exports';
  var PACKAGE_SUFFIX = '.h2ochat';
  var TMP_SUFFIX_PREFIX = '.tmp-';
  var SUPPORTED_SCHEMA_VERSIONS = [1, 2];

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
  function nowIso() { try { return new Date().toISOString(); } catch (_) { return ''; } }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function getInspector() {
    var ins = H2O.Studio && H2O.Studio.archiveInspector;
    return (ins && typeof ins.inspectPackage === 'function') ? ins : null;
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

  function isDesktopCapable() {
    return detectTauri() && !!getInspector() && !!getInvoke();
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

  function normalizeSha(value) {
    var text = cleanString(value).toLowerCase();
    if (!text) return '';
    if (/^[0-9a-f]{64}$/.test(text)) return 'sha256-' + text;
    return /^sha256-[0-9a-f]{64}$/.test(text) ? text : '';
  }

  function bytesFor(value) {
    if (value instanceof Uint8Array) return value;
    if (Array.isArray(value)) return Uint8Array.from(value);
    if (value && typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return new Uint8Array(value);
    if (value && typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    if (typeof value === 'string') return new TextEncoder().encode(value);
    return new Uint8Array(0);
  }

  function decodeToText(raw) {
    if (typeof raw === 'string') return raw;
    return new TextDecoder('utf-8').decode(bytesFor(raw));
  }

  function homeOptions(extra) {
    return Object.assign({ baseDir: HOME_BASE_DIR }, extra || {});
  }

  function appLocalOptions(extra) {
    return Object.assign({ baseDir: APP_LOCAL_DATA }, extra || {});
  }

  async function fsExists(path, options) {
    var invoke = getInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable for fs exists');
    try { return !!(await invoke('plugin:fs|exists', { path: path, options: options || homeOptions() })); }
    catch (err) {
      var msg = String((err && err.message) || err).toLowerCase();
      if (msg.indexOf('not found') >= 0 || msg.indexOf('no such') >= 0) return false;
      throw err;
    }
  }

  function fsMkdir(path, options) {
    var invoke = getInvoke();
    if (!invoke) return Promise.reject(new Error('tauri invoke unavailable for fs mkdir'));
    return invoke('plugin:fs|mkdir', { path: path, options: options || homeOptions({ recursive: true }) });
  }

  function fsRemove(path, options) {
    var invoke = getInvoke();
    if (!invoke) return Promise.reject(new Error('tauri invoke unavailable for fs remove'));
    return invoke('plugin:fs|remove', { path: path, options: options || homeOptions({ recursive: true }) });
  }

  function fsRename(oldPath, newPath, options) {
    var invoke = getInvoke();
    if (!invoke) return Promise.reject(new Error('tauri invoke unavailable for fs rename'));
    return invoke('plugin:fs|rename', {
      oldPath: oldPath,
      newPath: newPath,
      options: options || { oldPathBaseDir: HOME_BASE_DIR, newPathBaseDir: HOME_BASE_DIR },
    });
  }

  function fsReadFile(path, options) {
    var invoke = getInvoke();
    if (!invoke) return Promise.reject(new Error('tauri invoke unavailable for fs read_file'));
    return invoke('plugin:fs|read_file', { path: path, options: options || appLocalOptions() })
      .then(bytesFor);
  }

  function fsWriteFile(path, bytes, options) {
    var invoke = getInvoke();
    if (!invoke) return Promise.reject(new Error('tauri invoke unavailable for fs write_file'));
    return invoke('plugin:fs|write_file', bytesFor(bytes), {
      headers: {
        path: encodeURIComponent(path),
        options: JSON.stringify(options || homeOptions()),
      },
    });
  }

  async function sha256Prefixed(bytes) {
    if (!global.crypto || !global.crypto.subtle) throw new Error('crypto.subtle unavailable for export verification');
    var digest = await global.crypto.subtle.digest('SHA-256', bytesFor(bytes));
    var hex = Array.prototype.map.call(new Uint8Array(digest), function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
    return 'sha256-' + hex;
  }

  function canonicalJson(value) {
    function normalize(v) {
      if (v === undefined) return undefined;
      if (v === null || typeof v !== 'object') return v;
      if (Array.isArray(v)) return v.map(normalize).filter(function (item) { return item !== undefined; });
      var out = {};
      Object.keys(v).sort().forEach(function (key) {
        var nv = normalize(v[key]);
        if (nv !== undefined) out[key] = nv;
      });
      return out;
    }
    return JSON.stringify(normalize(value));
  }

  function sanitizeExportName(rawName, fallbackName) {
    var name = cleanString(rawName) || cleanString(fallbackName);
    name = name.replace(/[\\\/]+/g, '-').replace(/^\.+/, '').replace(/\s+/g, ' ').trim();
    name = name.replace(/[^A-Za-z0-9._ -]/g, '-');
    if (!name || name === '.' || name === '..' || name.indexOf('..') >= 0 || /[\/\\]/.test(name)) {
      name = cleanString(fallbackName);
    }
    if (!/\.h2ochat$/i.test(name)) name += PACKAGE_SUFFIX;
    name = name.replace(/\.h2ochat$/i, PACKAGE_SUFFIX);
    if (!name || name === PACKAGE_SUFFIX || name.indexOf('..') >= 0 || /[\/\\]/.test(name)) {
      throw new Error('invalid exportName');
    }
    return name;
  }

  function assertSafeRelativePackagePath(path, kind) {
    var p = cleanString(path);
    if (!p) throw new Error(kind + ' path is required');
    if (p.charAt(0) === '/' || p.charAt(0) === '\\' || /^[A-Za-z]:/.test(p)) throw new Error(kind + ' path must be relative');
    if (p.indexOf('..') >= 0 || /\\/.test(p)) throw new Error(kind + ' path must not traverse');
    if (p.split('/').some(function (part) { return !part || part === '.' || part === '..'; })) {
      throw new Error(kind + ' path has unsafe segments');
    }
    return p;
  }

  function safeParseJson(text) {
    try { var v = JSON.parse(text); return isObject(v) ? v : null; } catch (_) { return null; }
  }

  function fileDescriptorFromManifest(manifest, key, fallbackPath) {
    var desc = safeObject(safeObject(manifest.files)[key]);
    var rel = assertSafeRelativePackagePath(cleanString(desc.path) || fallbackPath, key);
    var sha = normalizeSha(desc.sha256);
    if (!sha) throw new Error(key + ' sha256 is required');
    return {
      role: key,
      path: rel,
      sha256: sha,
      byteLength: isFiniteNumber(desc.byteLength) ? desc.byteLength : null,
    };
  }

  function assetDescriptorFromManifest(asset, index) {
    var desc = safeObject(asset);
    var rel = assertSafeRelativePackagePath(cleanString(desc.path), 'asset');
    if (rel.indexOf('assets/') !== 0) throw new Error('asset path must stay under assets/');
    var sha = normalizeSha(desc.sha256);
    if (!sha) throw new Error('asset sha256 is invalid at index ' + index);
    var fileSha = /^assets\/(sha256-[0-9a-f]{64})(?:\.[A-Za-z0-9]+)?$/.exec(rel);
    if (!fileSha || fileSha[1] !== sha) throw new Error('asset path sha mismatch at index ' + index);
    return {
      role: 'asset',
      path: rel,
      sha256: sha,
      byteLength: isFiniteNumber(desc.byteLength) ? desc.byteLength : null,
    };
  }

  function declaredFilesFromManifest(manifest) {
    var files = [
      { role: 'manifest', path: 'manifest.json', sha256: '', byteLength: null },
      fileDescriptorFromManifest(manifest, 'snapshot', 'snapshot.json'),
      fileDescriptorFromManifest(manifest, 'markdown', 'chat.md'),
      fileDescriptorFromManifest(manifest, 'html', 'chat.html'),
    ];
    asArray(manifest.assets).forEach(function (asset, index) {
      files.push(assetDescriptorFromManifest(asset, index));
    });
    return files;
  }

  async function readManifest(packagePath) {
    var bytes = await fsReadFile(joinPath(packagePath, 'manifest.json'), appLocalOptions());
    var manifest = safeParseJson(decodeToText(bytes));
    if (!manifest) throw new Error('manifest.json is not parseable');
    return { manifest: manifest, bytes: bytes };
  }

  function isSupportedVersion(manifest) {
    var sv = isFiniteNumber(manifest.schemaVersion) ? manifest.schemaVersion : Number(manifest.schemaVersion);
    return SUPPORTED_SCHEMA_VERSIONS.indexOf(sv) >= 0;
  }

  function contentHashExpected(manifest, fileHashes) {
    var snapshotSha = cleanString(fileHashes['snapshot.json']);
    if (!snapshotSha) return '';
    var assets = asArray(manifest.assets).map(function (asset) {
      return normalizeSha(asset && asset.sha256);
    }).filter(Boolean).sort();
    var schemaVersion = isFiniteNumber(manifest.schemaVersion) ? manifest.schemaVersion : Number(manifest.schemaVersion);
    if (schemaVersion >= 2 && assets.length) {
      return sha256Prefixed(new TextEncoder().encode(canonicalJson({ snapshot: snapshotSha, assets: assets })));
    }
    return Promise.resolve(snapshotSha);
  }

  async function verifyCopiedFiles(manifest, copied) {
    var hashes = {};
    for (var i = 0; i < copied.length; i += 1) {
      var item = copied[i];
      var hash = await sha256Prefixed(item.bytes);
      hashes[item.relativePath] = hash;
      if (item.expectedSha && hash !== item.expectedSha) {
        throw new Error('copied file hash mismatch: ' + item.relativePath);
      }
      if (isFiniteNumber(item.expectedByteLength) && item.bytes.byteLength !== item.expectedByteLength) {
        throw new Error('copied file byteLength mismatch: ' + item.relativePath);
      }
    }
    var expectedContentHash = await contentHashExpected(manifest, hashes);
    if (normalizeSha(manifest.contentHash) !== expectedContentHash) {
      throw new Error('copied package contentHash mismatch');
    }
    return { hashes: hashes, contentHash: expectedContentHash };
  }

  function exportResult(status, data) {
    var d = safeObject(data);
    return {
      ok: status === 'export-ready' || status === 'exported',
      status: status,
      packagePath: cleanString(d.packagePath) || null,
      exportName: cleanString(d.exportName) || null,
      exportRoot: EXPORT_ROOT,
      destinationPath: cleanString(d.destinationPath) || null,
      tempPath: cleanString(d.tempPath) || null,
      inspectionStatus: cleanString(d.inspectionStatus),
      schemaVersion: d.schemaVersion == null ? null : d.schemaVersion,
      payloadVersion: d.payloadVersion == null ? null : d.payloadVersion,
      contentHash: cleanString(d.contentHash),
      fileCount: isFiniteNumber(d.fileCount) ? d.fileCount : 0,
      assetCount: isFiniteNumber(d.assetCount) ? d.assetCount : 0,
      reason: cleanString(d.reason),
      exportedAt: cleanString(d.exportedAt),
    };
  }

  function resolveExportDestination(options) {
    var opts = safeObject(options);
    var packagePath = cleanString(opts.packagePath);
    var fallback = packageDirNameForPath(packagePath);
    var exportName = sanitizeExportName(opts.exportName, fallback);
    return {
      exportRoot: EXPORT_ROOT,
      exportName: exportName,
      destinationPath: joinPath(EXPORT_ROOT, exportName),
      tempPath: joinPath(EXPORT_ROOT, exportName + TMP_SUFFIX_PREFIX + Date.now().toString(36)),
    };
  }

  async function inspectVerifiedPackage(packagePath) {
    if (!isDesktopCapable()) return { status: 'rejected', reason: 'desktop-only' };
    if (!packagePath || !packagePathIsScoped(packagePath)) return { status: 'rejected', reason: 'path-not-scoped' };
    var inspection = await getInspector().inspectPackage({ packagePath: packagePath });
    var inspectStatus = cleanString(inspection && inspection.status);
    if (inspectStatus !== 'verified') {
      if (inspectStatus === 'unsupported-version') return { status: 'unsupported-version', reason: inspectStatus, inspection: inspection };
      if (inspectStatus === 'read-error') return { status: 'read-error', reason: inspectStatus, inspection: inspection };
      if (inspectStatus === 'corrupted' || inspectStatus === 'missing-files' || inspectStatus === 'hash-mismatch') {
        return { status: 'corrupted', reason: inspectStatus, inspection: inspection };
      }
      return { status: 'rejected', reason: inspectStatus || 'not-verified', inspection: inspection };
    }
    var manifestRead = await readManifest(packagePath);
    if (!isSupportedVersion(manifestRead.manifest)) return { status: 'unsupported-version', reason: 'unsupported-version', inspection: inspection };
    return { status: 'verified', inspection: inspection, manifest: manifestRead.manifest, manifestBytes: manifestRead.bytes };
  }

  async function dryRunExportPackage(options) {
    var opts = safeObject(options);
    var packagePath = cleanString(opts.packagePath);
    try {
      var dest = resolveExportDestination(opts);
      var verified = await inspectVerifiedPackage(packagePath);
      if (verified.status !== 'verified') {
        return exportResult(verified.status, { packagePath: packagePath, exportName: dest.exportName, destinationPath: dest.destinationPath, reason: verified.reason, inspectionStatus: cleanString(verified.inspection && verified.inspection.status) });
      }
      var exists = await fsExists(dest.destinationPath, homeOptions());
      if (exists) {
        return exportResult('destination-exists', {
          packagePath: packagePath,
          exportName: dest.exportName,
          destinationPath: dest.destinationPath,
          inspectionStatus: 'verified',
          reason: 'destination already exists',
        });
      }
      var declared = declaredFilesFromManifest(verified.manifest);
      return exportResult('export-ready', {
        packagePath: packagePath,
        exportName: dest.exportName,
        destinationPath: dest.destinationPath,
        inspectionStatus: 'verified',
        schemaVersion: verified.manifest.schemaVersion,
        payloadVersion: verified.manifest.payloadVersion,
        contentHash: verified.manifest.contentHash,
        fileCount: declared.length,
        assetCount: asArray(verified.manifest.assets).length,
        reason: 'verified and destination available',
      });
    } catch (err) {
      return exportResult('read-error', { packagePath: packagePath, reason: String((err && err.message) || err || 'dry-run failed') });
    }
  }

  async function copyDeclaredFile(packagePath, tempPath, desc) {
    var sourceRel = joinPath(packagePath, desc.path);
    var destRel = joinPath(tempPath, desc.path);
    var bytes = await fsReadFile(sourceRel, appLocalOptions());
    await fsWriteFile(destRel, bytes, homeOptions());
    return {
      relativePath: desc.path,
      bytes: bytes,
      expectedSha: desc.sha256,
      expectedByteLength: desc.byteLength,
    };
  }

  async function exportVerifiedPackage(options) {
    var opts = safeObject(options);
    var packagePath = cleanString(opts.packagePath);
    var tempPath = '';
    try {
      var dest = resolveExportDestination(opts);
      tempPath = dest.tempPath;
      var dry = await dryRunExportPackage(opts);
      if (dry.status !== 'export-ready') return dry;
      var verified = await inspectVerifiedPackage(packagePath);
      if (verified.status !== 'verified') {
        return exportResult(verified.status, { packagePath: packagePath, exportName: dest.exportName, destinationPath: dest.destinationPath, reason: verified.reason, inspectionStatus: cleanString(verified.inspection && verified.inspection.status) });
      }
      var finalExists = await fsExists(dest.destinationPath, homeOptions());
      if (finalExists) {
        return exportResult('destination-exists', { packagePath: packagePath, exportName: dest.exportName, destinationPath: dest.destinationPath, inspectionStatus: 'verified', reason: 'destination already exists' });
      }

      var declared = declaredFilesFromManifest(verified.manifest);
      await fsMkdir(EXPORT_ROOT, homeOptions({ recursive: true }));
      await fsMkdir(tempPath, homeOptions({ recursive: true }));
      if (asArray(verified.manifest.assets).length) {
        await fsMkdir(joinPath(tempPath, 'assets'), homeOptions({ recursive: true }));
      }

      var copied = [];
      for (var i = 0; i < declared.length; i += 1) {
        copied.push(await copyDeclaredFile(packagePath, tempPath, declared[i]));
      }
      var postCopy = await verifyCopiedFiles(verified.manifest, copied);
      await fsRename(tempPath, dest.destinationPath, { oldPathBaseDir: HOME_BASE_DIR, newPathBaseDir: HOME_BASE_DIR });
      tempPath = '';
      return exportResult('exported', {
        packagePath: packagePath,
        exportName: dest.exportName,
        destinationPath: dest.destinationPath,
        inspectionStatus: 'verified',
        schemaVersion: verified.manifest.schemaVersion,
        payloadVersion: verified.manifest.payloadVersion,
        contentHash: postCopy.contentHash,
        fileCount: copied.length,
        assetCount: asArray(verified.manifest.assets).length,
        exportedAt: nowIso(),
        reason: 'exported to bounded Desktop export root',
      });
    } catch (err) {
      if (tempPath) {
        try { await fsRemove(tempPath, homeOptions({ recursive: true })); } catch (_) { /* best-effort cleanup only */ }
      }
      return exportResult('write-error', { packagePath: packagePath, tempPath: tempPath, reason: String((err && err.message) || err || 'export failed') });
    }
  }

  var TEXT = {
    title: 'Export Saved Chat Archive Package',
    eyebrow: 'Export / share · Desktop only · bounded root',
    intro: 'Export one verified .h2ochat package to $HOME/H2O Studio Exports/. No overwrite, no zip, no cloud or sync propagation.',
    unavailable: 'This export action is available in Desktop Studio only.',
    loadButton: 'Load packages',
    dryRunButton: 'Check export',
    exportButton: 'Export package',
    loadingList: 'Loading packages...',
    noPackages: 'No saved chat packages found in the archive.',
    selectPlaceholder: 'Select a package...',
  };

  var STATUS_PRESENTATION = {
    'verified': { tone: 'ok', label: 'Verified' },
    'export-ready': { tone: 'ok', label: 'Export-ready', note: 'Package verifies and the bounded export destination is available.' },
    'exported': { tone: 'ok', label: 'Exported', note: 'Package folder copied to the bounded Desktop export root.' },
    'destination-exists': { tone: 'warn', label: 'Destination exists', note: 'No overwrite was performed. Choose a different export name.' },
    'corrupted': { tone: 'block', label: 'Corrupted', note: 'Package failed verification and was not exported.' },
    'unsupported-version': { tone: 'warn', label: 'Unsupported version', note: 'Package version is outside the supported export range.' },
    'rejected': { tone: 'block', label: 'Rejected', note: 'Export was refused.' },
    'read-error': { tone: 'block', label: 'Read error', note: 'The source package could not be verified/read.' },
    'write-error': { tone: 'block', label: 'Write error', note: 'The export write did not complete.' },
  };

  var PILL_TONES = {
    ok: 'background:rgba(46,160,67,.18);color:#3fb950;border:1px solid rgba(46,160,67,.35)',
    warn: 'background:rgba(210,153,34,.18);color:#d29922;border:1px solid rgba(210,153,34,.35)',
    block: 'background:rgba(248,81,73,.16);color:#f85149;border:1px solid rgba(248,81,73,.35)',
    neutral: 'background:rgba(255,255,255,.06);color:inherit;border:1px solid rgba(255,255,255,.14)',
  };

  function pillHtml(label, tone) {
    var style = PILL_TONES[tone] || PILL_TONES.neutral;
    return '<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;' + style + '">' + escapeHtml(label) + '</span>';
  }

  function listPackagesViaInspector() {
    var ins = getInspector();
    if (!ins || typeof ins.listPackages !== 'function') return Promise.resolve([]);
    return Promise.resolve(ins.listPackages({})).then(function (rows) { return asArray(rows); }, function () { return []; });
  }

  function renderArchiveExporterCard(container, options) {
    if (!container || typeof container !== 'object') return null;
    if (typeof document === 'undefined') return null;
    var opts = options || {};
    var dryRun = (typeof opts.dryRunExportPackage === 'function') ? opts.dryRunExportPackage : dryRunExportPackage;
    var doExport = (typeof opts.exportVerifiedPackage === 'function') ? opts.exportVerifiedPackage : exportVerifiedPackage;
    var listFn = (typeof opts.listPackages === 'function') ? opts.listPackages : listPackagesViaInspector;
    var desktop = (typeof opts.isDesktop === 'boolean') ? opts.isDesktop : isDesktopCapable();
    var card = { desktop: desktop, busy: false, listBusy: false, listLoaded: false, options: [], packagePath: '', exportName: '', lastDry: null, lastExport: null };

    function canExport() {
      return !!card.lastDry && card.lastDry.status === 'export-ready' && card.lastDry.packagePath === card.packagePath;
    }
    function syncFields() {
      var sel = container.querySelector('[data-archive-exporter-select="1"]');
      var name = container.querySelector('[data-archive-exporter-name="1"]');
      if (sel && typeof sel.value === 'string') card.packagePath = sel.value.trim();
      if (name && typeof name.value === 'string') card.exportName = name.value.trim();
    }
    function optionsHtml() {
      if (!card.desktop) return '';
      var rows = asArray(card.options);
      var hint = '';
      if (card.listBusy) hint = '<div style="opacity:.6;font-size:12px;margin-top:6px">' + escapeHtml(TEXT.loadingList) + '</div>';
      else if (card.listLoaded && !rows.length) hint = '<div style="opacity:.6;font-size:12px;margin-top:6px">' + escapeHtml(TEXT.noPackages) + '</div>';
      var select = '';
      if (rows.length) {
        select = '<select data-archive-exporter-select="1" style="margin-top:6px;width:100%;padding:7px;border-radius:6px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.14);color:inherit;font:inherit">'
          + '<option value="">' + escapeHtml(TEXT.selectPlaceholder) + '</option>';
        rows.forEach(function (row) {
          var r = safeObject(row);
          var label = cleanString(r.packageDirName) + (cleanString(r.status) ? '  [' + cleanString(r.status) + ']' : '');
          select += '<option value="' + escapeHtml(cleanString(r.packagePath)) + '"' + (cleanString(r.packagePath) === card.packagePath ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
        });
        select += '</select>';
      }
      return hint + select
        + '<input data-archive-exporter-name="1" value="' + escapeHtml(card.exportName) + '" placeholder="Optional export name (.h2ochat)" style="margin-top:8px;width:100%;padding:7px;border-radius:6px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.14);color:inherit;font:inherit">';
    }
    function identityRow(key, value) {
      if (!cleanString(value)) return '';
      return '<div style="display:flex;gap:8px;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;word-break:break-all;user-select:text">'
        + '<span style="opacity:.55;min-width:120px">' + escapeHtml(key) + '</span><span>' + escapeHtml(value) + '</span></div>';
    }
    function resultBlockHtml(result, kind) {
      if (!result) return '';
      var status = cleanString(result.status);
      var preset = STATUS_PRESENTATION[status] || { tone: 'neutral', label: status, note: '' };
      return '<div data-archive-exporter-' + kind + '="1" data-archive-exporter-status="' + escapeHtml(status) + '" style="margin-top:10px;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:10px;background:rgba(255,255,255,.025)">'
        + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' + pillHtml(preset.label, preset.tone) + '<span style="opacity:.6;font-size:12px">' + escapeHtml(kind) + ' · ' + escapeHtml(status) + '</span></div>'
        + (preset.note ? '<div style="opacity:.78;font-size:12px;margin-top:5px">' + escapeHtml(preset.note) + '</div>' : '')
        + (cleanString(result.reason) ? '<div style="opacity:.6;font-size:11px;margin-top:4px">' + escapeHtml(result.reason) + '</div>' : '')
        + '<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">'
        + identityRow('destination', result.destinationPath)
        + identityRow('contentHash', result.contentHash)
        + identityRow('schemaVersion', result.schemaVersion == null ? '' : String(result.schemaVersion))
        + identityRow('payloadVersion', result.payloadVersion == null ? '' : String(result.payloadVersion))
        + identityRow('fileCount', result.fileCount ? String(result.fileCount) : '')
        + identityRow('assetCount', result.assetCount ? String(result.assetCount) : '')
        + identityRow('exportedAt', result.exportedAt)
        + '</div></div>';
    }
    function render() {
      var disabledLoad = (!card.desktop || card.listBusy || card.busy) ? ' disabled' : '';
      var disabledDry = (!card.desktop || card.busy || card.listBusy) ? ' disabled' : '';
      var exportEnabled = card.desktop && !card.busy && !card.listBusy && canExport();
      var disabledExport = exportEnabled ? '' : ' disabled';
      var btnBase = 'padding:8px 14px;border-radius:6px;cursor:pointer;color:inherit;font:inherit;';
      var bodyHtml;
      if (!card.desktop) {
        bodyHtml = '<div style="opacity:.7;font-size:12px;margin-top:8px">' + escapeHtml(TEXT.unavailable) + '</div>';
      } else {
        bodyHtml = ''
          + optionsHtml()
          + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px">'
          + '<button type="button" data-archive-exporter-dry="1" style="' + btnBase + 'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);' + (disabledDry ? 'opacity:.5;cursor:default;' : '') + '"' + disabledDry + '>' + escapeHtml(card.busy === 'dry' ? 'Checking...' : TEXT.dryRunButton) + '</button>'
          + '<button type="button" data-archive-exporter-export="1" style="' + btnBase + 'background:rgba(46,160,67,.16);border:1px solid rgba(46,160,67,.4);' + (exportEnabled ? '' : 'opacity:.45;cursor:default;') + '"' + disabledExport + '>' + escapeHtml(card.busy === 'export' ? 'Exporting...' : TEXT.exportButton) + '</button>'
          + '<button type="button" data-archive-exporter-load="1" style="' + btnBase + 'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);' + (disabledLoad ? 'opacity:.5;cursor:default;' : '') + '"' + disabledLoad + '>' + escapeHtml(TEXT.loadButton) + '</button>'
          + '</div>'
          + resultBlockHtml(card.lastDry, 'dry-run')
          + resultBlockHtml(card.lastExport, 'export');
      }
      container.innerHTML = ''
        + '<section data-archive-exporter-card="1" style="border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:12px;background:rgba(255,255,255,.02)">'
        + '<div style="font-size:11px;letter-spacing:.04em;text-transform:uppercase;opacity:.6">' + escapeHtml(TEXT.eyebrow) + '</div>'
        + '<div style="font-weight:600;margin-top:2px">' + escapeHtml(TEXT.title) + '</div>'
        + '<div style="opacity:.7;font-size:12px;margin-top:4px">' + escapeHtml(TEXT.intro) + '</div>'
        + bodyHtml
        + '</section>';
      var dryBtn = container.querySelector('[data-archive-exporter-dry="1"]');
      if (dryBtn && card.desktop && !card.busy && !card.listBusy) dryBtn.addEventListener('click', doDryRun, { once: true });
      var exportBtn = container.querySelector('[data-archive-exporter-export="1"]');
      if (exportBtn && exportEnabled) exportBtn.addEventListener('click', doExportClick, { once: true });
      var loadBtn = container.querySelector('[data-archive-exporter-load="1"]');
      if (loadBtn && card.desktop && !card.listBusy && !card.busy) loadBtn.addEventListener('click', doLoad, { once: true });
      var sel = container.querySelector('[data-archive-exporter-select="1"]');
      if (sel) sel.addEventListener('change', function () { syncFields(); card.lastDry = null; card.lastExport = null; render(); });
      var name = container.querySelector('[data-archive-exporter-name="1"]');
      if (name) name.addEventListener('input', function () { syncFields(); card.lastDry = null; card.lastExport = null; });
    }
    function doLoad() {
      if (card.listBusy || card.busy || !card.desktop) return;
      card.listBusy = true; render();
      Promise.resolve(listFn({})).then(function (rows) {
        card.listBusy = false; card.listLoaded = true; card.options = asArray(rows); render();
      }, function () { card.listBusy = false; card.listLoaded = true; card.options = []; render(); });
    }
    function doDryRun() {
      if (card.busy || !card.desktop) return;
      syncFields();
      if (!card.packagePath) { card.lastDry = exportResult('rejected', { reason: 'select a package first' }); render(); return; }
      card.busy = 'dry'; card.lastDry = null; card.lastExport = null; render();
      Promise.resolve(dryRun({ packagePath: card.packagePath, exportName: card.exportName })).then(function (res) {
        card.busy = false; card.lastDry = (res && typeof res === 'object') ? res : exportResult('rejected', { packagePath: card.packagePath, reason: 'no result' }); render();
      }, function (err) {
        card.busy = false; card.lastDry = exportResult('read-error', { packagePath: card.packagePath, reason: String((err && err.message) || err || 'dry-run threw') }); render();
      });
    }
    function doExportClick() {
      if (card.busy || !card.desktop || !canExport()) return;
      syncFields();
      card.busy = 'export'; card.lastExport = null; render();
      Promise.resolve(doExport({ packagePath: card.packagePath, exportName: card.exportName })).then(function (res) {
        card.busy = false; card.lastExport = (res && typeof res === 'object') ? res : exportResult('write-error', { packagePath: card.packagePath, reason: 'no result' }); render();
      }, function (err) {
        card.busy = false; card.lastExport = exportResult('write-error', { packagePath: card.packagePath, reason: String((err && err.message) || err || 'export threw') }); render();
      });
    }
    render();
    return { getState: function () { return card; }, dryRun: doDryRun, doExport: doExportClick, load: doLoad };
  }

  function mountArchiveExporterCard(healthContainer, options) {
    if (typeof document === 'undefined') return null;
    if (!healthContainer || typeof healthContainer !== 'object') return null;
    var parent = healthContainer.parentNode;
    if (!parent || typeof parent.appendChild !== 'function') return null;
    var box = (typeof parent.querySelector === 'function') ? parent.querySelector('[data-archive-exporter-mount="1"]') : null;
    if (!box) {
      box = document.createElement('div');
      box.setAttribute('data-archive-exporter-mount', '1');
      box.style.marginTop = '12px';
      parent.appendChild(box);
    }
    return renderArchiveExporterCard(box, options || {});
  }

  H2O.Studio.archiveExporter = {
    __installed: true,
    __version: MODULE_VERSION,
    detectTauri: detectTauri,
    isDesktopCapable: isDesktopCapable,
    resolveExportDestination: resolveExportDestination,
    dryRunExportPackage: dryRunExportPackage,
    exportVerifiedPackage: exportVerifiedPackage,
    renderArchiveExporterCard: renderArchiveExporterCard,
    mountArchiveExporterCard: mountArchiveExporterCard,
    _private: {
      sanitizeExportName: sanitizeExportName,
      assertSafeRelativePackagePath: assertSafeRelativePackagePath,
      declaredFilesFromManifest: declaredFilesFromManifest,
      canonicalJson: canonicalJson,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
