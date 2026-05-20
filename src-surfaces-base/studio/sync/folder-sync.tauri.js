/* H2O Studio Sync — Manual Folder Bundle Importer (Desktop / Tauri)
 *
 * M2d-1a — first stage of Browser Studio → Desktop Studio auto-sync.
 * Provides a Desktop-only namespace H2O.Studio.sync with MANUAL scan +
 * import APIs over a user-chosen folder containing MV3 Studio full-bundle
 * JSON files. No watcher yet; no auto-import yet — those land in M2d-1b/c.
 *
 * Desktop-only: gates on Tauri detection at load; silently no-ops on
 * MV3 / web. Reuses H2O.Studio.ingestion.{dryRunImportBundle, importBundle}
 * (M2b-1/2) end-to-end — this module is purely the "find + dedupe + read
 * the file" glue layer in front of the existing importer.
 *
 * Storage:
 *   Config:  chrome.storage.local['h2o:studio:sync:config:v1']
 *            { schemaVersion, mode, folderPath, updatedAt }
 *   Ledger:  chrome.storage.local['h2o:studio:sync:ledger:v1']
 *            { schemaVersion, updatedAt, entries: [{fingerprint, …}] }
 *   (Both are SQLite-backed on Desktop via the kv_store shim.)
 *
 * Safety invariants:
 *   - merge-only import (cannot delete or overwrite Desktop data)
 *   - SHA256 fingerprint dedupes — re-scans skip already-imported files
 *   - 100 MB file-size cap; oversized files are reported, never read fully
 *   - Files matching *.crdownload / *.partial / leading-dot are skipped
 *   - Schema-validated via dryRunImportBundle before any write
 *   - No file deletion / move — Desktop is read-only on the source folder
 *
 * Contracts:
 *   - Uses tauri-plugin-fs (added to Cargo + capabilities in this stage)
 *   - File system access scoped to $DOWNLOAD/** + $HOME/** per
 *     apps/studio/desktop/src-tauri/capabilities/default.json
 *   - Future M2d-1b will add a tauri-plugin-fs-watch-based auto-detector
 *
 * Public API: H2O.Studio.sync.{
 *   getConfig, setConfig, getLedger, clearLedger,
 *   scanFolderOnce, importFromFile, diagnose
 * }
 */
(function (global) {
  'use strict';

  /* ── Tauri detection — bail otherwise ─────────────────────────────── */
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
  if (H2O.Studio.sync && H2O.Studio.sync.__installed) return;

  /* ── Constants ────────────────────────────────────────────────────── */
  var CONFIG_KEY = 'h2o:studio:sync:config:v1';
  var LEDGER_KEY = 'h2o:studio:sync:ledger:v1';
  var MAX_LEDGER_ENTRIES  = 100;
  var MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; /* 100 MB */
  var VALID_MODES = ['off', 'manual', 'notify', 'auto'];
  /* Filename glob patterns. The first matches MV3 exporter output
   * (h2o-studio-full-bundle__<extIdFirst8>__<isoTimestamp>.json); the
   * second leaves room for a future short-format file. */
  var FILENAME_PATTERNS = [
    /^h2o-studio-full-bundle.*\.json$/i,
    /^h2o-studio-sync.*\.json$/i,
  ];
  /* Browser partial-download suffixes to ignore until the rename completes. */
  var IGNORE_SUFFIXES = ['.crdownload', '.partial', '.download', '.tmp'];

  var state = {
    lastScanAt:   null,
    lastImportAt: null,
    errors:       [],
    warnings:     [],
    errMax:       20,
    warnMax:      20,
  };
  function pushErr(op, e) {
    try {
      state.errors.push({ at: Date.now(), op: String(op), error: String((e && e.message) || e) });
      if (state.errors.length > state.errMax) state.errors.splice(0, state.errors.length - state.errMax);
    } catch (_) { /* ignore */ }
  }
  function pushWarn(op, msg) {
    try {
      state.warnings.push({ at: Date.now(), op: String(op), warn: String(msg) });
      if (state.warnings.length > state.warnMax) state.warnings.splice(0, state.warnings.length - state.warnMax);
    } catch (_) { /* ignore */ }
  }

  /* ── Tauri invoke (V2) ────────────────────────────────────────────── */
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

  /* ── chrome.storage.local KV helpers (SQLite-backed on Desktop) ──── */
  function readKv(key) {
    return new Promise(function (resolve) {
      try {
        if (!global.chrome || !global.chrome.storage || !global.chrome.storage.local) { resolve(null); return; }
        global.chrome.storage.local.get([key], function (items) {
          resolve(items && Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null);
        });
      } catch (_) { resolve(null); }
    });
  }
  function writeKv(key, value) {
    return new Promise(function (resolve, reject) {
      try {
        if (!global.chrome || !global.chrome.storage || !global.chrome.storage.local) {
          reject(new Error('chrome.storage.local unavailable'));
          return;
        }
        var item = {}; item[key] = value;
        global.chrome.storage.local.set(item, function () {
          var lastErr = global.chrome.runtime && global.chrome.runtime.lastError;
          if (lastErr) reject(new Error(String(lastErr.message || lastErr)));
          else resolve();
        });
      } catch (e) { reject(e); }
    });
  }

  /* ── Defaults ─────────────────────────────────────────────────────── */
  function defaultConfig() {
    return { schemaVersion: 1, mode: 'off', folderPath: '', updatedAt: '' };
  }
  function defaultLedger() {
    return { schemaVersion: 1, updatedAt: '', entries: [] };
  }

  /* ── Config API ───────────────────────────────────────────────────── */
  async function getConfig() {
    var raw = await readKv(CONFIG_KEY);
    var base = defaultConfig();
    if (!raw || typeof raw !== 'object') return base;
    var merged = Object.assign(base, raw);
    if (VALID_MODES.indexOf(merged.mode) < 0) merged.mode = 'off';
    merged.folderPath = String(merged.folderPath || '').trim();
    return merged;
  }
  async function setConfig(patch) {
    var current = await getConfig();
    var next = Object.assign({}, current, (patch && typeof patch === 'object') ? patch : {});
    if (VALID_MODES.indexOf(next.mode) < 0) next.mode = 'off';
    next.folderPath = String(next.folderPath || '').trim();
    next.schemaVersion = 1;
    next.updatedAt = new Date().toISOString();
    try { await writeKv(CONFIG_KEY, next); }
    catch (e) { pushErr('setConfig', e); throw e; }
    return next;
  }

  /* ── Ledger API ───────────────────────────────────────────────────── */
  async function getLedger() {
    var raw = await readKv(LEDGER_KEY);
    var base = defaultLedger();
    if (!raw || typeof raw !== 'object') return base;
    return Object.assign(base, raw, {
      entries: Array.isArray(raw.entries) ? raw.entries : [],
    });
  }
  async function clearLedger() {
    var blank = defaultLedger();
    blank.updatedAt = new Date().toISOString();
    try { await writeKv(LEDGER_KEY, blank); }
    catch (e) { pushErr('clearLedger', e); throw e; }
    return blank;
  }
  async function appendLedgerEntry(entry) {
    var ledger = await getLedger();
    ledger.entries.push(entry);
    if (ledger.entries.length > MAX_LEDGER_ENTRIES) {
      ledger.entries = ledger.entries.slice(-MAX_LEDGER_ENTRIES);
    }
    ledger.updatedAt = new Date().toISOString();
    try { await writeKv(LEDGER_KEY, ledger); }
    catch (e) { pushErr('appendLedgerEntry', e); /* don't throw — caller already has the entry */ }
    return entry;
  }

  /* ── tauri-plugin-fs helpers ──────────────────────────────────────── */
  function fsReadDir(path) {
    var invoke = getInvoke();
    if (!invoke) return Promise.reject(new Error('tauri invoke unavailable'));
    return invoke('plugin:fs|read_dir', { path: path });
  }
  /* tauri-plugin-fs v2 ships two reader commands:
   *   plugin:fs|read_text_file  — Rust returns String
   *   plugin:fs|read_file       — Rust returns Vec<u8>  (number[] over JSON)
   * BUT some V2 builds / serialization paths surface read_text_file ALSO
   * as a byte array (Vec<u8> → number[]). Passing that array straight to
   * JSON.parse / TextEncoder.encode produces garbage ("[123,10,...]") and
   * the bundle import fails with json-parse-failed even on a valid file.
   * Defensive: try read_text_file, fall back to read_file on error, then
   * coerce whatever shape we got through decodeToText. */
  async function fsReadTextFile(path) {
    var invoke = getInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable');
    var raw;
    try {
      raw = await invoke('plugin:fs|read_text_file', { path: path });
    } catch (textErr) {
      try {
        raw = await invoke('plugin:fs|read_file', { path: path });
      } catch (bytesErr) {
        /* Surface the original text-read error since it's the canonical
         * path; include the bytes-read fallback error as context. */
        var msg = String((textErr && textErr.message) || textErr)
          + ' / fallback read_file failed: ' + String((bytesErr && bytesErr.message) || bytesErr);
        throw new Error(msg);
      }
    }
    return decodeToText(raw, path);
  }

  /* Coerce any tauri-plugin-fs read return into a UTF-8 string. Accepts:
   *   - string                  (read_text_file happy path)
   *   - Uint8Array               (raw byte view)
   *   - ArrayBuffer              (raw buffer)
   *   - number[]                 (Vec<u8> over JSON — most common alternate)
   *   - ArrayBufferView (other)  (DataView / Uint8ClampedArray)
   * Throws an informative Error for anything else so the caller can record
   * a useful diagnostic. */
  function decodeToText(raw, contextPath) {
    if (raw == null) {
      throw new Error('decodeToText: null/undefined response (path=' + String(contextPath || '') + ')');
    }
    if (typeof raw === 'string') return raw;
    if (raw instanceof Uint8Array) {
      return new TextDecoder('utf-8').decode(raw);
    }
    if (raw instanceof ArrayBuffer) {
      return new TextDecoder('utf-8').decode(new Uint8Array(raw));
    }
    if (Array.isArray(raw)) {
      var bytes = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i += 1) {
        var v = raw[i];
        if (typeof v !== 'number' || v < 0 || v > 255 || (v | 0) !== v) {
          throw new Error('decodeToText: array element ' + i + ' is not a byte (got ' + typeof v + ' = ' + JSON.stringify(v).slice(0, 32) + ')');
        }
        bytes[i] = v;
      }
      return new TextDecoder('utf-8').decode(bytes);
    }
    if (raw && typeof raw === 'object' && typeof raw.byteLength === 'number' && raw.buffer instanceof ArrayBuffer) {
      /* DataView, Uint8ClampedArray, Int8Array etc. */
      return new TextDecoder('utf-8').decode(new Uint8Array(raw.buffer, raw.byteOffset || 0, raw.byteLength));
    }
    var ctor = (raw && raw.constructor && raw.constructor.name) || typeof raw;
    throw new Error('decodeToText: unsupported response type ' + ctor + ' (typeof=' + typeof raw + ')');
  }

  /* ── Filename matcher ─────────────────────────────────────────────── */
  function isCandidateFilename(name) {
    var s = String(name || '');
    if (!s) return false;
    if (s.charAt(0) === '.') return false; /* hidden files */
    var lower = s.toLowerCase();
    for (var i = 0; i < IGNORE_SUFFIXES.length; i += 1) {
      if (lower.indexOf(IGNORE_SUFFIXES[i], lower.length - IGNORE_SUFFIXES[i].length) !== -1) return false;
    }
    for (var j = 0; j < FILENAME_PATTERNS.length; j += 1) {
      if (FILENAME_PATTERNS[j].test(s)) return true;
    }
    return false;
  }

  /* ── Path join (cross-platform best-effort) ──────────────────────── */
  function joinPath(folder, name) {
    var f = String(folder || '');
    if (!f) return String(name || '');
    var last = f.charAt(f.length - 1);
    if (last === '/' || last === '\\') return f + name;
    var sep = (f.indexOf('\\') >= 0 && f.indexOf('/') < 0) ? '\\' : '/';
    return f + sep + name;
  }
  function basename(path) {
    var p = String(path || '');
    var i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return (i >= 0) ? p.slice(i + 1) : p;
  }

  /* ── SHA256 via Web Crypto ────────────────────────────────────────── */
  async function sha256Hex(text) {
    if (!global.crypto || !global.crypto.subtle || typeof global.crypto.subtle.digest !== 'function') {
      throw new Error('crypto.subtle.digest unavailable');
    }
    var enc = new TextEncoder().encode(String(text || ''));
    var hash = await global.crypto.subtle.digest('SHA-256', enc);
    var bytes = new Uint8Array(hash);
    var out = '';
    for (var i = 0; i < bytes.length; i += 1) {
      var v = bytes[i].toString(16);
      if (v.length < 2) v = '0' + v;
      out += v;
    }
    return out;
  }

  /* ── scanFolderOnce ───────────────────────────────────────────────── */
  /* Lists folder, matches filenames, fingerprints each, dedupes against
   * ledger, dry-runs the candidate, and returns a list of import candidates.
   * Does NOT import. Failure cases for individual files become entries
   * with a `skipped` reason so the UI can surface them. */
  async function scanFolderOnce(folderPathArg) {
    var config = await getConfig();
    var folderPath = String(folderPathArg || config.folderPath || '').trim();
    if (!folderPath) return { ok: false, error: 'folderPath-required' };

    state.lastScanAt = new Date().toISOString();

    var entries;
    try { entries = await fsReadDir(folderPath); }
    catch (e) {
      pushErr('scan.readDir', e);
      return { ok: false, error: 'read-dir-failed', detail: String((e && e.message) || e), folderPath: folderPath };
    }

    var files = (Array.isArray(entries) ? entries : [])
      .filter(function (e) {
        /* tauri-plugin-fs returns { name, isDirectory, isFile, isSymlink, … }.
         * Defensive: accept anything where isDirectory !== true and the
         * name matches the candidate pattern. */
        if (!e || typeof e !== 'object') return false;
        if (e.isDirectory === true) return false;
        return isCandidateFilename(e.name);
      });

    var ledger = await getLedger();
    var seenFingerprints = Object.create(null);
    ledger.entries.forEach(function (le) { if (le && le.fingerprint) seenFingerprints[le.fingerprint] = true; });

    var ingestion = (H2O.Studio && H2O.Studio.ingestion) || null;
    var candidates = [];

    for (var i = 0; i < files.length; i += 1) {
      var f = files[i];
      var filePath = joinPath(folderPath, f.name);
      var fileText = null;
      try { fileText = await fsReadTextFile(filePath); }
      catch (e) {
        pushErr('scan.readFile', e);
        candidates.push({
          filename: f.name, path: filePath, skipped: 'read-failed',
          error: String((e && e.message) || e),
        });
        continue;
      }
      var sizeBytes = (typeof fileText === 'string') ? fileText.length : 0;
      if (sizeBytes > MAX_FILE_SIZE_BYTES) {
        candidates.push({ filename: f.name, path: filePath, sizeBytes: sizeBytes, skipped: 'too-large' });
        continue;
      }
      var fingerprint = '';
      try { fingerprint = await sha256Hex(fileText); }
      catch (e) {
        candidates.push({ filename: f.name, path: filePath, sizeBytes: sizeBytes, skipped: 'fingerprint-failed', error: String((e && e.message) || e) });
        continue;
      }
      if (seenFingerprints[fingerprint]) {
        candidates.push({ filename: f.name, path: filePath, sizeBytes: sizeBytes, fingerprint: fingerprint, skipped: 'already-imported' });
        continue;
      }
      var bundle;
      try { bundle = JSON.parse(fileText); }
      catch (e) {
        /* Helpful diagnostic: include type + 80-char preview so future
         * read-shape regressions are obvious in the candidate report. */
        var preview = '';
        try { preview = (typeof fileText === 'string') ? fileText.slice(0, 80) : ''; }
        catch (_) { /* ignore */ }
        candidates.push({
          filename: f.name, path: filePath, sizeBytes: sizeBytes, fingerprint: fingerprint,
          skipped: 'json-parse-failed',
          error: String((e && e.message) || e),
          rawType: typeof fileText,
          preview: preview,
        });
        continue;
      }
      var dry = null;
      if (ingestion && typeof ingestion.dryRunImportBundle === 'function') {
        try { dry = await ingestion.dryRunImportBundle(bundle); }
        catch (e) {
          candidates.push({ filename: f.name, path: filePath, sizeBytes: sizeBytes, fingerprint: fingerprint, skipped: 'dry-run-failed', error: String((e && e.message) || e) });
          continue;
        }
        if (dry && dry.ok === false) {
          candidates.push({ filename: f.name, path: filePath, sizeBytes: sizeBytes, fingerprint: fingerprint, skipped: 'dry-run-rejected', dryRun: dry });
          continue;
        }
      } else {
        pushWarn('scan', 'H2O.Studio.ingestion.dryRunImportBundle unavailable; including candidate without validation');
      }
      candidates.push({
        filename: f.name,
        path: filePath,
        sizeBytes: sizeBytes,
        fingerprint: fingerprint,
        exportedAt: (bundle && typeof bundle.exportedAt === 'string') ? bundle.exportedAt : '',
        dryRun: dry ? { ok: !!dry.ok, plan: dry.plan, sourceVersion: dry.sourceVersion } : null,
      });
    }

    return {
      ok: true,
      folderPath: folderPath,
      candidates: candidates,
      scannedFiles: files.length,
      ts: state.lastScanAt,
    };
  }

  /* ── importFromFile ───────────────────────────────────────────────── */
  /* Read + fingerprint + dedupe + dry-run + importBundle('merge') in one
   * call. Returns { ok, status: 'imported' | 'already-imported' | error,
   * result, ledgerEntry, ... }. Mode is always 'manual' for M2d-1a. */
  async function importFromFile(filePathArg) {
    var filePath = String(filePathArg || '').trim();
    if (!filePath) return { ok: false, error: 'path-required' };

    var fileText;
    try { fileText = await fsReadTextFile(filePath); }
    catch (e) {
      pushErr('import.readFile', e);
      return { ok: false, error: 'read-failed', detail: String((e && e.message) || e) };
    }
    var sizeBytes = (typeof fileText === 'string') ? fileText.length : 0;
    if (sizeBytes > MAX_FILE_SIZE_BYTES) return { ok: false, error: 'too-large', sizeBytes: sizeBytes };

    var fingerprint;
    try { fingerprint = await sha256Hex(fileText); }
    catch (e) { return { ok: false, error: 'fingerprint-failed', detail: String((e && e.message) || e) }; }

    var ledger = await getLedger();
    var existing = ledger.entries.filter(function (le) { return le && le.fingerprint === fingerprint; })[0];
    if (existing) {
      return { ok: true, status: 'already-imported', fingerprint: fingerprint, ledgerEntry: existing };
    }

    var bundle;
    try { bundle = JSON.parse(fileText); }
    catch (e) { return { ok: false, error: 'json-parse-failed', detail: String((e && e.message) || e) }; }

    var ingestion = (H2O.Studio && H2O.Studio.ingestion) || null;
    if (!ingestion || typeof ingestion.importBundle !== 'function') {
      return { ok: false, error: 'ingestion-unavailable' };
    }

    /* Defensive dry-run before the actual write — gives early rejection
     * for parse errors that JSON.parse didn't catch and surfaces orphan
     * counts before write commits. */
    if (typeof ingestion.dryRunImportBundle === 'function') {
      var dry;
      try { dry = await ingestion.dryRunImportBundle(bundle); }
      catch (e) { return { ok: false, error: 'dry-run-failed', detail: String((e && e.message) || e) }; }
      if (!dry || dry.ok === false) {
        return { ok: false, error: 'dry-run-rejected', dryRunReport: dry };
      }
    }

    var result;
    try { result = await ingestion.importBundle(bundle, 'merge'); }
    catch (e) { return { ok: false, error: 'import-failed', detail: String((e && e.message) || e) }; }

    state.lastImportAt = new Date().toISOString();

    var entry = {
      fingerprint: fingerprint,
      filename: basename(filePath),
      path: filePath,
      sizeBytes: sizeBytes,
      detectedAt: state.lastImportAt,
      importedAt: state.lastImportAt,
      mode: 'manual',
      bundleExportedAt: (bundle && typeof bundle.exportedAt === 'string') ? bundle.exportedAt : '',
      resultSummary: result ? {
        ok: !!result.ok,
        written: result.written || null,
        skipped: result.skipped || null,
        warningsCount: Array.isArray(result.warnings) ? result.warnings.length : 0,
        errorsCount:   Array.isArray(result.errors)   ? result.errors.length   : 0,
      } : null,
    };
    await appendLedgerEntry(entry);
    return {
      ok: !!(result && result.ok !== false),
      status: 'imported',
      fingerprint: fingerprint,
      result: result,
      ledgerEntry: entry,
    };
  }

  /* ── Diagnose ─────────────────────────────────────────────────────── */
  function diagnose() {
    var ingestion = (H2O.Studio && H2O.Studio.ingestion) || null;
    return {
      installed: true,
      stage: 'M2d-1a',
      mode: 'manual-only',
      keys: { config: CONFIG_KEY, ledger: LEDGER_KEY },
      limits: {
        maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
        maxLedgerEntries: MAX_LEDGER_ENTRIES,
      },
      filenamePatterns: FILENAME_PATTERNS.map(function (r) { return r.toString(); }),
      ignoreSuffixes: IGNORE_SUFFIXES.slice(),
      ingestionAvailable: !!(ingestion && typeof ingestion.importBundle === 'function'),
      state: {
        lastScanAt: state.lastScanAt,
        lastImportAt: state.lastImportAt,
        errors: state.errors.slice(-5),
        warnings: state.warnings.slice(-5),
      },
    };
  }

  /* ── Register ────────────────────────────────────────────────────── */
  H2O.Studio.sync = {
    __installed: true,
    __version: '0.1.0',
    getConfig:       getConfig,
    setConfig:       setConfig,
    getLedger:       getLedger,
    clearLedger:     clearLedger,
    scanFolderOnce:  scanFolderOnce,
    importFromFile:  importFromFile,
    diagnose:        diagnose,
  };
})(typeof window !== 'undefined' ? window : globalThis);
