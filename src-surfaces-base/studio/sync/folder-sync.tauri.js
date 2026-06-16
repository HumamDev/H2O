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
  var FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2';
  var PROPAGATION_SCHEMA = 'h2o.studio.sync.chrome-desktop-propagation.v1';
  var F19_CHROME_DESKTOP_VERSION = '0.1.0-f19.2.b';
  var MAX_LEDGER_ENTRIES  = 100;
  var MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; /* 100 MB */
  var VALID_MODES = ['off', 'manual', 'notify', 'auto'];
  /* Filename glob patterns. The first matches MV3 exporter output
   * (h2o-studio-full-bundle__<extIdFirst8>__<isoTimestamp>.json); the
   * second leaves room for a future short-format file; the third
   * matches the Chrome auto-import.mv3.js opt-in export
   * (chrome-latest.json) sanctioned by R2D Gate R3. Routes through the
   * same importBundle merge-only path — no new merge mode, no schema
   * change. The .tmp staging variant (chrome-latest.json.tmp) is
   * filtered out by IGNORE_SUFFIXES below. */
  var FILENAME_PATTERNS = [
    /^h2o-studio-full-bundle.*\.json$/i,
    /^h2o-studio-sync.*\.json$/i,
    /^chrome-latest\.json$/i,
  ];
  var CHROME_LATEST_FILE = 'chrome-latest.json';
  var CHROME_DESKTOP_SUPPORTED_FIELDS = [
    'saved-chat-records',
    'linked-chat-records',
    'folder-metadata',
    'category-metadata',
    'chat-category-bindings'
  ];
  var CHROME_DESKTOP_DEFERRED_CODES = {
    labels: 'library-propagation-labels-deferred',
    tags: 'library-propagation-tags-deferred',
    projects: 'library-propagation-projects-deferred',
    folderBindings: 'library-propagation-chat-folder-bindings-deferred',
    unsupportedStorage: 'library-propagation-unsupported-storage-deferred',
    sourceMetadataMissing: 'library-propagation-source-metadata-missing'
  };
  var F19_SYNC_HARDENING_CODES = {
    syncFolderMissing: 'sync-folder-missing',
    permissionDenied: 'permission-denied',
    transportFileMissing: 'transport-file-missing',
    transportFileMalformed: 'transport-file-malformed',
    transportSchemaUnsupported: 'transport-schema-unsupported',
    transportStale: 'transport-stale',
    duplicateImportIdempotent: 'duplicate-import-idempotent',
    localNewerConflict: 'local-newer-conflict',
    simultaneousUpdateConflict: 'simultaneous-update-conflict',
    deferredFieldPresent: 'deferred-field-present',
    unsupportedFieldPresent: 'unsupported-field-present',
    sourceMetadataMissing: 'source-metadata-missing',
    parityPeerSnapshotRequired: 'parity-peer-snapshot-required'
  };
  /* Browser partial-download suffixes to ignore until the rename completes. */
  var IGNORE_SUFFIXES = ['.crdownload', '.partial', '.download', '.tmp'];

  /* M2d-1b watcher tuning. The polling watcher fires every intervalMs;
   * each candidate must be seen across two ticks with the same size AND
   * ≥ FILE_STABLE_MIN_MS apart before it's emitted, to dodge browsers'
   * still-writing rename window even when the .crdownload extension
   * filter doesn't catch it. */
  var DEFAULT_INTERVAL_MS = 5000;
  var MIN_INTERVAL_MS = 1000;
  var MAX_INTERVAL_MS = 60000;
  var FILE_STABLE_MIN_MS = 1500;
  var MAX_LISTENERS = 64;

  /* Diagnostic-only sample cap for orphan-folder-binding visibility
   * (Phase D). Visibility only — never affects import behavior. */
  var MAX_ORPHAN_SAMPLE = 5;

  var state = {
    lastScanAt:   null,
    lastImportAt: null,
    errors:       [],
    warnings:     [],
    errMax:       20,
    warnMax:      20,
    /* Phase D — orphan-folder-binding visibility. Updated by importFromFile
     * after each completed import (even when result.ok === false), reset to
     * 0/[]/null on a fresh boot. These fields are read-only diagnostics. */
    lastImportOrphanBindings:      0,
    lastImportOrphanBindingSample: [],
    lastImportOrphanBindingsAt:    null,
  };

  /* M2d-1b watcher state — runtime-only; never persisted. */
  var watcherState = {
    running:        false,
    intervalId:     null,
    intervalMs:     DEFAULT_INTERVAL_MS,
    scanInFlight:   false,
    lastScanAt:     null,
    lastEventAt:    null,
    sizeMap:        Object.create(null),  /* path → { size, firstSeenAtMs } */
    pending:        [],                    /* candidate objects (with fingerprint) */
    listeners:      new Set(),
    errors:         [],
    errMax:         20,
    lastError:      null,
    /* Cached config snapshot — updated by reconcileWatcherFromConfig + the
     * boot-time auto-start. Used so getWatcherState() can be synchronous. */
    folderPath:     '',
    mode:           'off',
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
    /* M2d-1b: auto-manage watcher based on the new mode + folderPath.
     * Treats 'auto' as 'notify' for now — actual auto-import lands in
     * M2d-1c (one-branch addition inside runWatcherTick). */
    try { reconcileWatcherFromConfig(next, current); }
    catch (e) { pushWatcherErr('setConfig.reconcile', e); }
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

  /* ── Folder-only fast-path detector ────────────────────────────────
   *
   * Returns true when the parsed bundle clearly carries ONLY folder state
   * (no chats, no snapshots, no other entity sections). The folder-only
   * fast-path then routes through H2O.Studio.ingestion.importFolderStateOnly
   * (Phase A entry point), which skips the dryRunImportBundle full-bundle
   * validator (which would otherwise reject a folder-state payload because
   * it requires chatArchive.schema === 'h2o.chatArchive.bundle.v1').
   *
   * Three shapes are recognized — these mirror the input shapes
   * normalizeFolderStatePayload() inside import-bundle.tauri.js accepts:
   *
   *   (a) Raw folder-state:
   *         { folders: [...], items: { folderId: chatId[] }, ... }
   *       Recognized when `bundle.folders` is an array OR `bundle.items`
   *       is a plain object AND no `chatArchive.chats` are present.
   *
   *   (b) chromeStorageLocal wrapper containing only the folder-state key:
   *         { chromeStorageLocal: { 'h2o:prm:cgx:fldrs:state:data:v1': {...} } }
   *       Recognized when the wrapper carries the folder-state key AND
   *       no `chatArchive.chats` are present.
   *
   * Full bundles (schema=h2o.studio.fullBundle.v2 with non-empty
   * chatArchive.chats[]) return false even if they also carry folder
   * state — those continue to use the existing importBundle path so
   * chats / snapshots / catalogs are all processed end-to-end.
   *
   * Safety: this is a STRICT detector. When in doubt, return false so
   * the existing importBundle path runs. */
  var FOLDER_STATE_KEY_LOCAL = 'h2o:prm:cgx:fldrs:state:data:v1';
  function isFolderOnlyPayload(bundle) {
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return false;
    var chats = bundle.chatArchive && bundle.chatArchive.chats;
    if (Array.isArray(chats) && chats.length > 0) return false;
    /* Shape (a): raw folder-state object. */
    if (Array.isArray(bundle.folders)) return true;
    if (bundle.items && typeof bundle.items === 'object' && !Array.isArray(bundle.items)) return true;
    /* Shape (b): chromeStorageLocal wrapper with folder-state key. */
    var csl = bundle.chromeStorageLocal;
    if (csl && typeof csl === 'object' && !Array.isArray(csl)) {
      var folderState = csl[FOLDER_STATE_KEY_LOCAL];
      if (folderState && typeof folderState === 'object'
          && (Array.isArray(folderState.folders) || (folderState.items && typeof folderState.items === 'object'))) {
        return true;
      }
    }
    return false;
  }

  function cloneJson(value) {
    if (typeof value === 'undefined') return undefined;
    try { return JSON.parse(JSON.stringify(value)); }
    catch (_) { return null; }
  }

  function addUnique(list, code) {
    var normalized = String(code || '').trim();
    if (normalized && list.indexOf(normalized) === -1) list.push(normalized);
  }

  function normalizeHardeningWarnings(warnings) {
    var out = Array.isArray(warnings) ? warnings.slice() : [];
    var legacyDeferred = [
      CHROME_DESKTOP_DEFERRED_CODES.labels,
      CHROME_DESKTOP_DEFERRED_CODES.tags,
      CHROME_DESKTOP_DEFERRED_CODES.projects,
      CHROME_DESKTOP_DEFERRED_CODES.folderBindings
    ];
    for (var i = 0; i < legacyDeferred.length; i += 1) {
      if (out.indexOf(legacyDeferred[i]) !== -1) addUnique(out, F19_SYNC_HARDENING_CODES.deferredFieldPresent);
    }
    if (out.indexOf(CHROME_DESKTOP_DEFERRED_CODES.unsupportedStorage) !== -1) {
      addUnique(out, F19_SYNC_HARDENING_CODES.unsupportedFieldPresent);
    }
    if (out.indexOf(CHROME_DESKTOP_DEFERRED_CODES.sourceMetadataMissing) !== -1) {
      addUnique(out, F19_SYNC_HARDENING_CODES.sourceMetadataMissing);
    }
    return out;
  }

  function normalizeHardeningBlockers(blockers) {
    var out = Array.isArray(blockers) ? blockers.slice() : [];
    if (out.indexOf('library-propagation-folder-required') !== -1 ||
        out.indexOf('library-propagation-path-required') !== -1) {
      addUnique(out, F19_SYNC_HARDENING_CODES.syncFolderMissing);
    }
    if (out.indexOf('library-propagation-read-failed') !== -1) {
      addUnique(out, F19_SYNC_HARDENING_CODES.transportFileMissing);
    }
    if (out.indexOf('library-propagation-json-parse-failed') !== -1) {
      addUnique(out, F19_SYNC_HARDENING_CODES.transportFileMalformed);
    }
    if (out.indexOf('library-propagation-schema-invalid') !== -1) {
      addUnique(out, F19_SYNC_HARDENING_CODES.transportSchemaUnsupported);
    }
    if (out.indexOf('library-propagation-transport-stale') !== -1) {
      addUnique(out, F19_SYNC_HARDENING_CODES.transportStale);
    }
    if (out.indexOf('library-propagation-simultaneous-update-conflict') !== -1) {
      addUnique(out, F19_SYNC_HARDENING_CODES.simultaneousUpdateConflict);
    }
    return out;
  }

  function parseTimeMs(value) {
    var clean = String(value || '').trim();
    if (!clean) return 0;
    var ms = Date.parse(clean);
    return isFinite(ms) ? ms : 0;
  }

  function latestPropagationLedgerEntry(ledger, mode) {
    var entries = Array.isArray(ledger && ledger.entries) ? ledger.entries : [];
    var latest = null;
    var latestMs = 0;
    for (var i = 0; i < entries.length; i += 1) {
      var entry = entries[i];
      if (!entry || String(entry.mode || '') !== mode) continue;
      var ms = parseTimeMs(entry.bundleExportedAt || entry.importedAt || entry.detectedAt);
      if (!latest || ms >= latestMs) {
        latest = entry;
        latestMs = ms;
      }
    }
    return latest;
  }

  function classifyIncomingChromeTransport(bundle, ledger, fingerprint) {
    var blockers = [];
    var latest = latestPropagationLedgerEntry(ledger, 'f19-chrome-desktop');
    if (!latest || !bundle || typeof bundle !== 'object') return blockers;
    var incomingExportedAtMs = parseTimeMs(bundle.exportedAt);
    var latestExportedAtMs = parseTimeMs(latest.bundleExportedAt);
    var sameFingerprint = !!(fingerprint && latest.fingerprint && String(fingerprint) === String(latest.fingerprint));
    if (incomingExportedAtMs && latestExportedAtMs && incomingExportedAtMs < latestExportedAtMs && !sameFingerprint) {
      addUnique(blockers, 'library-propagation-transport-stale');
    }
    var previousExportId = String(bundle.previousExportId || '').trim();
    var latestExportId = String(latest.exportId || '').trim();
    if (previousExportId && latestExportId && previousExportId !== latestExportId && !sameFingerprint) {
      addUnique(blockers, 'library-propagation-simultaneous-update-conflict');
    }
    return blockers;
  }

  function hasAnyKeys(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    for (var i = 0; i < keys.length; i += 1) {
      if (Object.prototype.hasOwnProperty.call(value, keys[i])) return true;
    }
    return false;
  }

  function countSnapshots(chats) {
    var total = 0;
    (Array.isArray(chats) ? chats : []).forEach(function (chat) {
      total += Array.isArray(chat && chat.snapshots) ? chat.snapshots.length : 0;
    });
    return total;
  }

  function countMinimalLibraryRows(chats) {
    var total = 0;
    (Array.isArray(chats) ? chats : []).forEach(function (chat) {
      var index = chat && chat.chatIndex && typeof chat.chatIndex === 'object' ? chat.chatIndex : {};
      if (index.f19MinimalLibraryIndexRow === true && !(Array.isArray(chat && chat.snapshots) && chat.snapshots.length > 0)) total += 1;
    });
    return total;
  }

  function countChatViews(chats) {
    var counts = { saved: 0, linked: 0, pinned: 0, archived: 0 };
    (Array.isArray(chats) ? chats : []).forEach(function (chat) {
      var index = chat && chat.chatIndex && typeof chat.chatIndex === 'object' ? chat.chatIndex : {};
      var stateObj = index.state && typeof index.state === 'object' ? index.state : {};
      var view = String(index.view || index.kind || index.type || '').toLowerCase();
      if (view === 'linked' || index.isLinked === true || stateObj.isLinked === true) counts.linked += 1;
      else counts.saved += 1;
      if (index.pinned === true || index.isPinned === true || stateObj.isPinned === true) counts.pinned += 1;
      if (index.archived === true || index.isArchived === true || stateObj.isArchived === true) counts.archived += 1;
    });
    return counts;
  }

  function sanitizeChatForChromeDesktop(chat, warnings) {
    var out = cloneJson(chat) || {};
    var chatIndex = out.chatIndex && typeof out.chatIndex === 'object' && !Array.isArray(out.chatIndex)
      ? out.chatIndex : null;
    if (chatIndex) {
      var org = chatIndex.organization && typeof chatIndex.organization === 'object' && !Array.isArray(chatIndex.organization)
        ? chatIndex.organization : null;
      if (org) {
        if (hasAnyKeys(org, ['labels', 'labelIds'])) addUnique(warnings, CHROME_DESKTOP_DEFERRED_CODES.labels);
        if (hasAnyKeys(org, ['tags', 'tagIds'])) addUnique(warnings, CHROME_DESKTOP_DEFERRED_CODES.tags);
        if (hasAnyKeys(org, ['projectId', 'projectIds', 'projects', 'gizmoId', 'workspaceId'])) {
          addUnique(warnings, CHROME_DESKTOP_DEFERRED_CODES.projects);
        }
        var nextOrg = {};
        if (typeof org.categoryId !== 'undefined') nextOrg.categoryId = org.categoryId;
        if (typeof org.category_id !== 'undefined') nextOrg.category_id = org.category_id;
        if (typeof org.folderId !== 'undefined') nextOrg.folderId = org.folderId;
        if (typeof org.folder_id !== 'undefined') nextOrg.folder_id = org.folder_id;
        chatIndex.organization = nextOrg;
      }
    }
    return out;
  }

  function collectPerChatFolderBindings(chats) {
    var covered = Object.create(null);
    (Array.isArray(chats) ? chats : []).forEach(function (chat) {
      var index = chat && chat.chatIndex && typeof chat.chatIndex === 'object' ? chat.chatIndex : {};
      var org = index.organization && typeof index.organization === 'object' && !Array.isArray(index.organization)
        ? index.organization : {};
      var chatId = String((chat && chat.chatId) || index.chatId || index.id || '').trim();
      var folderId = String(org.folderId || org.folder_id || '').trim();
      if (!chatId || !folderId) return;
      covered[folderId + '\n' + chatId] = true;
    });
    return covered;
  }

  function folderStateForChromeDesktop(bundle, warnings, coveredPerChatBindings) {
    var source = bundle && bundle.chromeStorageLocal && bundle.chromeStorageLocal[FOLDER_STATE_KEY_LOCAL];
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    var folders = Array.isArray(source.folders) ? cloneJson(source.folders) : [];
    var items = source.items && typeof source.items === 'object' && !Array.isArray(source.items) ? source.items : {};
    var itemKeys = Object.keys(items);
    var covered = coveredPerChatBindings && typeof coveredPerChatBindings === 'object' ? coveredPerChatBindings : {};
    var hasUnsupportedLegacyBinding = false;
    for (var i = 0; i < itemKeys.length; i += 1) {
      var folderId = String(itemKeys[i] || '').trim();
      var chatIds = Array.isArray(items[itemKeys[i]]) ? items[itemKeys[i]] : [];
      for (var ci = 0; ci < chatIds.length; ci += 1) {
        var chatId = String(chatIds[ci] || '').trim();
        if (!chatId) continue;
        if (covered[folderId + '\n' + chatId] !== true) {
          hasUnsupportedLegacyBinding = true;
          break;
        }
      }
      if (hasUnsupportedLegacyBinding) break;
    }
    if (hasUnsupportedLegacyBinding) addUnique(warnings, CHROME_DESKTOP_DEFERRED_CODES.folderBindings);
    return {
      schemaVersion: Number(source.schemaVersion || source.version || 1) || 1,
      exportedFrom: String(source.exportedFrom || source.source || 'chrome-studio'),
      exportedAt: String(source.exportedAt || source.updatedAt || ''),
      folders: folders,
      items: {}
    };
  }

  function buildChromeDesktopSupportedBundle(bundleInput) {
    var warnings = [];
    var blockers = [];
    var bundle = bundleInput && typeof bundleInput === 'object' && !Array.isArray(bundleInput)
      ? bundleInput : null;
    if (!bundle) {
      return { ok: false, blockers: ['library-propagation-bundle-invalid'], warnings: warnings };
    }
    if (String(bundle.schema || '').trim() !== FULL_BUNDLE_SCHEMA) {
      return { ok: false, blockers: ['library-propagation-schema-invalid'], warnings: warnings };
    }

    var chatArchive = bundle.chatArchive && typeof bundle.chatArchive === 'object' && !Array.isArray(bundle.chatArchive)
      ? bundle.chatArchive : {};
    var sourceCatalogs = chatArchive.catalogs && typeof chatArchive.catalogs === 'object' && !Array.isArray(chatArchive.catalogs)
      ? chatArchive.catalogs : {};
    var sourceChats = Array.isArray(chatArchive.chats) ? chatArchive.chats : [];
    var sourceCategories = Array.isArray(sourceCatalogs.categories) ? sourceCatalogs.categories : [];

    if (Array.isArray(sourceCatalogs.labels) && sourceCatalogs.labels.length > 0) {
      addUnique(warnings, CHROME_DESKTOP_DEFERRED_CODES.labels);
    }
    if (Array.isArray(sourceCatalogs.tags) && sourceCatalogs.tags.length > 0) {
      addUnique(warnings, CHROME_DESKTOP_DEFERRED_CODES.tags);
    }
    if (Array.isArray(bundle.libraryKv) && bundle.libraryKv.length > 0) {
      for (var kv = 0; kv < bundle.libraryKv.length; kv += 1) {
        var key = String(bundle.libraryKv[kv] && bundle.libraryKv[kv].key || '');
        if (key.indexOf(':labels:') !== -1) addUnique(warnings, CHROME_DESKTOP_DEFERRED_CODES.labels);
        else addUnique(warnings, CHROME_DESKTOP_DEFERRED_CODES.unsupportedStorage);
      }
    }
    if (bundle.chromeStorageLocal && typeof bundle.chromeStorageLocal === 'object' && !Array.isArray(bundle.chromeStorageLocal)) {
      Object.keys(bundle.chromeStorageLocal).forEach(function (key) {
        if (key !== FOLDER_STATE_KEY_LOCAL) addUnique(warnings, CHROME_DESKTOP_DEFERRED_CODES.unsupportedStorage);
      });
    }
    if (bundle.projects || bundle.projectCatalog || bundle.workspaceProjects) {
      addUnique(warnings, CHROME_DESKTOP_DEFERRED_CODES.projects);
    }
    if (!bundle.sourcePeerEnvelope && !bundle.sourceSyncPeerId) {
      addUnique(warnings, CHROME_DESKTOP_DEFERRED_CODES.sourceMetadataMissing);
    }

    var chats = sourceChats.map(function (chat) {
      return sanitizeChatForChromeDesktop(chat, warnings);
    });
    var chatViewCounts = countChatViews(chats);
    var categories = cloneJson(sourceCategories) || [];
    var folderState = folderStateForChromeDesktop(bundle, warnings, collectPerChatFolderBindings(chats));
    var chromeStorageLocal = {};
    if (folderState) chromeStorageLocal[FOLDER_STATE_KEY_LOCAL] = folderState;

    var supported = {
      schema: FULL_BUNDLE_SCHEMA,
      exportedAt: String(bundle.exportedAt || ''),
      exportId: String(bundle.exportId || ''),
      sequenceNumber: typeof bundle.sequenceNumber === 'number' ? bundle.sequenceNumber : null,
      previousExportId: bundle.previousExportId ? String(bundle.previousExportId) : null,
      contentSha256: bundle.contentSha256 ? String(bundle.contentSha256) : '',
      sourceSurfaceKind: String(bundle.sourceSurfaceKind || 'chrome-studio'),
      sourceAppKind: String(bundle.sourceAppKind || ''),
      sourceStoreKind: String(bundle.sourceStoreKind || ''),
      sourcePeerEnvelope: bundle.sourcePeerEnvelope && typeof bundle.sourcePeerEnvelope === 'object'
        ? cloneJson(bundle.sourcePeerEnvelope) : null,
      chatArchive: {
        schema: String(chatArchive.schema || 'h2o.chatArchive.bundle.v1'),
        exportedAt: String(chatArchive.exportedAt || bundle.exportedAt || ''),
        chats: chats,
        catalogs: {
          categories: categories,
          labels: []
        }
      },
      chromeStorageLocal: chromeStorageLocal,
      libraryKv: []
    };

    return {
      ok: true,
      bundle: supported,
      warnings: warnings,
      blockers: blockers,
      sourceSummary: {
        schema: FULL_BUNDLE_SCHEMA,
        direction: 'chrome-to-desktop',
        transport: 'chrome-latest.json',
        chatCount: chats.length,
        savedCount: chatViewCounts.saved,
        linkedCount: chatViewCounts.linked,
        pinnedCount: chatViewCounts.pinned,
        archivedCount: chatViewCounts.archived,
        snapshotCount: countSnapshots(chats),
        minimalRowCount: countMinimalLibraryRows(chats),
        categoryCount: categories.length,
        folderCount: folderState && Array.isArray(folderState.folders) ? folderState.folders.length : 0,
        hasSourcePeerEnvelope: !!supported.sourcePeerEnvelope,
        hasExportId: !!supported.exportId,
        hasContentSha256: !!supported.contentSha256
      }
    };
  }

  function redactedImportSummary(result) {
    var r = result && typeof result === 'object' ? result : {};
    var written = r.written && typeof r.written === 'object' ? r.written : {};
    var skipped = r.skipped && typeof r.skipped === 'object' ? r.skipped : {};
    var denied = skipped.deniedByPolicy && typeof skipped.deniedByPolicy === 'object' ? skipped.deniedByPolicy : {};
    var chromeMinimalRows = r.chromeMinimalRows && typeof r.chromeMinimalRows === 'object' ? r.chromeMinimalRows : {};
    var chromeWeakRows = r.chromeWeakRows && typeof r.chromeWeakRows === 'object' ? r.chromeWeakRows : {};
    var errorKinds = Object.create(null);
    var minimalRowErrors = 0;
    var nonMinimalErrorCount = 0;
    (Array.isArray(r.errors) ? r.errors : []).forEach(function (entry) {
      var kind = String(entry && entry.kind || 'import-error');
      var code = String(entry && entry.code || kind);
      if (kind === 'chrome-minimal-row-import') minimalRowErrors += 1;
      else nonMinimalErrorCount += 1;
      errorKinds[code] = Number(errorKinds[code] || 0) + 1;
    });
    var warningKinds = Object.create(null);
    var minimalRowsMaterialized = 0;
    var minimalRowsExisting = 0;
    (Array.isArray(r.warnings) ? r.warnings : []).forEach(function (entry) {
      var kind = String(entry && entry.kind || 'warning');
      if (kind === 'chrome-minimal-row-materialized-via-store-upsert') minimalRowsMaterialized += 1;
      if (kind === 'chrome-minimal-row-materialized-via-shell-insert') minimalRowsMaterialized += 1;
      if (kind === 'chrome-minimal-row-materialize-existing') minimalRowsExisting += 1;
      warningKinds[kind] = Number(warningKinds[kind] || 0) + 1;
    });
    function countsObjectToRows(obj) {
      return Object.keys(obj).sort().map(function (code) {
        return { code: code, count: Number(obj[code] || 0) };
      });
    }
    return {
      ok: r.ok !== false,
      mode: String(r.mode || 'merge'),
      destinationBackend: String(r.destinationBackend || ''),
      written: {
        chats: Number(written.chats || 0),
        snapshots: Number(written.snapshots || 0),
        categories: Number(written.categories || 0),
        folders: Number(written.folders || 0),
        folderBindings: Number(written.folderBindings || 0),
        labelBindings: Number(written.labelBindings || 0),
        tagBindings: Number(written.tagBindings || 0)
      },
      skipped: {
        chats: Number(skipped.chats || 0),
        snapshots: Number(skipped.snapshots || 0),
        categories: Number(skipped.categories || 0),
        folders: Number(skipped.folders || 0),
        deniedStorageKeys: Number(denied.chromeStorageLocal || 0),
        deniedKvKeys: Number(denied.libraryKv || 0)
      },
      warningsCount: Array.isArray(r.warnings) ? r.warnings.length : 0,
      errorsCount: Array.isArray(r.errors) ? r.errors.length : 0,
      errorKinds: countsObjectToRows(errorKinds),
      redactedErrorCategories: countsObjectToRows(errorKinds),
      warningKinds: countsObjectToRows(warningKinds),
      minimalRowErrors: Math.max(minimalRowErrors, Number(chromeMinimalRows.failed || 0)),
      nonMinimalErrorCount: nonMinimalErrorCount,
      minimalRowsTotal: Number(chromeMinimalRows.total || 0),
      minimalRowsAttempted: Number(chromeMinimalRows.attempted || 0),
      minimalRowsMaterialized: Math.max(minimalRowsMaterialized, Number(chromeMinimalRows.materialized || 0)),
      minimalRowsExisting: Math.max(minimalRowsExisting, Number(chromeMinimalRows.existing || 0)),
      minimalRowsSkipped: Number(chromeMinimalRows.skipped || 0),
      minimalRowsFailed: Number(chromeMinimalRows.failed || 0),
      minimalRowsSatisfied: Math.max(minimalRowsMaterialized, Number(chromeMinimalRows.materialized || 0)) +
        Math.max(minimalRowsExisting, Number(chromeMinimalRows.existing || 0)),
      weakRowsAttempted: Number(chromeWeakRows.attempted || 0),
      weakRowsMaterialized: Number(chromeWeakRows.materialized || 0),
      weakRowsExisting: Number(chromeWeakRows.existing || 0),
      weakRowsSkipped: Number(chromeWeakRows.skipped || 0),
      weakRowsFailed: Number(chromeWeakRows.failed || 0),
      libraryBulkMigration: Array.isArray(r.libraryBulkMigration)
        ? r.libraryBulkMigration.map(function (entry) {
          return {
            phase: String(entry && entry.phase || ''),
            ok: !!(entry && entry.ok === true),
            status: String(entry && entry.status || ''),
            blockers: Array.isArray(entry && entry.blockers) ? entry.blockers.slice() : [],
            warnings: Array.isArray(entry && entry.warnings) ? entry.warnings.slice() : []
          };
        }) : []
    };
  }

  function staleMinimalRowErrorsAreCovered(importSummary, sourceSummary) {
    var summary = importSummary && typeof importSummary === 'object' ? importSummary : {};
    var source = sourceSummary && typeof sourceSummary === 'object' ? sourceSummary : {};
    var target = Number(source.minimalRowCount || 0) ||
      Number(summary.minimalRowsAttempted || 0) ||
      Number(summary.minimalRowsTotal || 0) ||
      Number(summary.minimalRowErrors || 0);
    if (Number(summary.minimalRowsFailed || 0) > 0) return false;
    return target > 0 &&
      Number(summary.minimalRowErrors || 0) > 0 &&
      Number(summary.nonMinimalErrorCount || 0) === 0 &&
      Number(summary.minimalRowsSatisfied || 0) >= target;
  }

  function propagationResult(ok, fields) {
    var f = fields && typeof fields === 'object' ? fields : {};
    var blockers = normalizeHardeningBlockers(f.blockers);
    var warnings = normalizeHardeningWarnings(f.warnings);
    var status = String(f.status || (ok ? 'imported' : 'blocked'));
    return {
      schema: PROPAGATION_SCHEMA,
      version: F19_CHROME_DESKTOP_VERSION,
      ok: ok === true && blockers.length === 0,
      direction: 'chrome-to-desktop',
      transport: 'chrome-latest.json',
      status: status,
      supportedFields: CHROME_DESKTOP_SUPPORTED_FIELDS.slice(),
      deferredFields: warnings.filter(function (code) {
        return code === CHROME_DESKTOP_DEFERRED_CODES.labels ||
          code === CHROME_DESKTOP_DEFERRED_CODES.tags ||
          code === CHROME_DESKTOP_DEFERRED_CODES.projects ||
          code === CHROME_DESKTOP_DEFERRED_CODES.folderBindings;
      }),
      sourceSummary: f.sourceSummary || null,
      importSummary: f.importSummary || null,
      parity: f.parity || {
        snapshotCaptured: false,
        paritySnapshotHash: '',
        parityDiagnosticReady: !!(H2O.Studio && H2O.Studio.sync && H2O.Studio.sync.libraryParity)
      },
      idempotency: f.idempotency || {
        fileFingerprintChecked: false,
        mergeOnly: true,
        existingRowsSkipped: true
      },
      hardening: {
        taxonomy: F19_SYNC_HARDENING_CODES,
        duplicateImportIdempotent: warnings.indexOf(F19_SYNC_HARDENING_CODES.duplicateImportIdempotent) !== -1,
        staleBlocked: blockers.indexOf(F19_SYNC_HARDENING_CODES.transportStale) !== -1,
        simultaneousConflictBlocked: blockers.indexOf(F19_SYNC_HARDENING_CODES.simultaneousUpdateConflict) !== -1,
        deferredFieldsExplicit: warnings.indexOf(F19_SYNC_HARDENING_CODES.deferredFieldPresent) !== -1,
        unsupportedFieldsExplicit: warnings.indexOf(F19_SYNC_HARDENING_CODES.unsupportedFieldPresent) !== -1,
        sourceMetadataChecked: warnings.indexOf(F19_SYNC_HARDENING_CODES.sourceMetadataMissing) !== -1
      },
      privacy: {
        redacted: true,
        rawIdsReturned: false,
        rawTitlesReturned: false,
        rawContentReturned: false
      },
      redactedErrorCategories: f.importSummary && Array.isArray(f.importSummary.redactedErrorCategories)
        ? f.importSummary.redactedErrorCategories.slice() : [],
      minimalRowsMaterialized: Number(f.importSummary && f.importSummary.minimalRowsMaterialized || 0),
      minimalRowsExisting: Number(f.importSummary && f.importSummary.minimalRowsExisting || 0),
      minimalRowsSatisfied: Number(f.importSummary && f.importSummary.minimalRowsSatisfied || 0),
      minimalRowsSkipped: Number(f.importSummary && f.importSummary.minimalRowsSkipped || 0),
      minimalRowsFailed: Number(f.importSummary && f.importSummary.minimalRowsFailed || 0),
      minimalRowErrors: Number(f.importSummary && f.importSummary.minimalRowErrors || 0),
      weakRowsAttempted: Number(f.importSummary && f.importSummary.weakRowsAttempted || 0),
      weakRowsMaterialized: Number(f.importSummary && f.importSummary.weakRowsMaterialized || 0),
      weakRowsExisting: Number(f.importSummary && f.importSummary.weakRowsExisting || 0),
      weakRowsSkipped: Number(f.importSummary && f.importSummary.weakRowsSkipped || 0),
      weakRowsFailed: Number(f.importSummary && f.importSummary.weakRowsFailed || 0),
      sideEffects: {
        chromeStorageWritten: false,
        desktopSqliteMayWriteSupportedRows: ok === true && status !== 'already-imported',
        nativeCalled: false,
        f5Touched: false,
        relayTouched: false,
        outboxTouched: false
      },
      blockers: blockers,
      warnings: warnings,
      observedAt: new Date().toISOString()
    };
  }

  async function captureParityAfterImport() {
    try {
      var parity = H2O.Studio && H2O.Studio.sync && H2O.Studio.sync.libraryParity;
      if (!parity || typeof parity.captureSnapshot !== 'function') {
        return { snapshotCaptured: false, paritySnapshotHash: '', parityDiagnosticReady: false };
      }
      var snapshot = await parity.captureSnapshot();
      return {
        snapshotCaptured: !!(snapshot && snapshot.schema),
        paritySnapshotHash: await sha256Hex(JSON.stringify(snapshot || {})),
        parityDiagnosticReady: true,
        surface: String(snapshot && snapshot.surface || '')
      };
    } catch (e) {
      return {
        snapshotCaptured: false,
        paritySnapshotHash: '',
        parityDiagnosticReady: false,
        warning: 'library-propagation-parity-snapshot-failed'
      };
    }
  }

  async function importChromeLatestBundle(bundleInput, options) {
    var normalized = buildChromeDesktopSupportedBundle(bundleInput);
    if (!normalized.ok) {
      return propagationResult(false, {
        status: 'blocked',
        blockers: normalized.blockers || ['library-propagation-bundle-invalid'],
        warnings: normalized.warnings || []
      });
    }
    var ingestion = (H2O.Studio && H2O.Studio.ingestion) || null;
    if (!ingestion || typeof ingestion.importBundle !== 'function') {
      return propagationResult(false, {
        status: 'blocked',
        blockers: ['library-propagation-ingestion-unavailable'],
        warnings: normalized.warnings,
        sourceSummary: normalized.sourceSummary
      });
    }
    var importOptions = Object.assign({}, options && typeof options === 'object' ? options : {}, {
      sourceSurface: 'chrome-studio',
      targetSurface: 'desktop-studio',
      transport: 'chrome-latest.json',
      f19ChromeDesktopPropagation: true,
      allowLibraryShimFallback: false,
      skipExistingFolderMetadata: true
    });
    var imported;
    try {
      imported = await ingestion.importBundle(normalized.bundle, 'merge', importOptions);
    } catch (e) {
      return propagationResult(false, {
        status: 'blocked',
        blockers: ['library-propagation-import-threw'],
        warnings: normalized.warnings,
        sourceSummary: normalized.sourceSummary,
        importSummary: { ok: false, errorsCount: 1 }
      });
    }
    var warnings = normalized.warnings.slice();
    var importSummary = redactedImportSummary(imported);
    var staleMinimalRowsCovered = staleMinimalRowErrorsAreCovered(importSummary, normalized.sourceSummary);
    if (staleMinimalRowsCovered) {
      importSummary.ok = true;
      importSummary.staleMinimalRowErrorsCovered = true;
      addUnique(warnings, 'chrome-minimal-row-stale-error-covered');
    }
    if (!imported || (imported.ok === false && !staleMinimalRowsCovered)) {
      var blockers = ['library-propagation-import-failed'];
      if (importSummary.minimalRowErrors > 0 &&
          (Number(importSummary.minimalRowsFailed || 0) > 0 ||
            Number(importSummary.minimalRowsSatisfied || 0) < (Number(normalized.sourceSummary && normalized.sourceSummary.minimalRowCount || 0) ||
              Number(importSummary.minimalRowsAttempted || 0) ||
              Number(importSummary.minimalRowsTotal || 0) ||
              Number(importSummary.minimalRowErrors || 0)))) {
        addUnique(blockers, 'chrome-minimal-row-import-unsupported');
      }
      return propagationResult(false, {
        status: 'blocked',
        blockers: blockers,
        warnings: warnings,
        sourceSummary: normalized.sourceSummary,
        importSummary: importSummary
      });
    }
    try {
      if (H2O.LibraryIndex && typeof H2O.LibraryIndex.refresh === 'function') {
        await H2O.LibraryIndex.refresh('f19-chrome-desktop-import');
      }
    } catch (_) {
      addUnique(warnings, 'library-propagation-library-index-refresh-failed');
    }
    var parity = await captureParityAfterImport();
    if (parity.warning) addUnique(warnings, parity.warning);
    return propagationResult(true, {
      status: 'imported',
      warnings: warnings,
      sourceSummary: normalized.sourceSummary,
      importSummary: importSummary,
      parity: parity,
      idempotency: {
        fileFingerprintChecked: false,
        mergeOnly: true,
        existingRowsSkipped: true,
        protectedDomainFallbackDisabled: true
      }
    });
  }

  /* ── importFromFile ───────────────────────────────────────────────── */
  /* Read + fingerprint + dedupe + dry-run + importBundle('merge') in one
   * call. Returns { ok, status: 'imported' | 'already-imported' | error,
   * result, ledgerEntry, ... }. Mode is always 'manual' for M2d-1a.
   *
   * Folder-only payloads (detected via isFolderOnlyPayload) take a
   * fast-path through H2O.Studio.ingestion.importFolderStateOnly and
   * skip the full-bundle dry-run (which would reject the missing
   * chatArchive). Full bundles continue to dry-run + importBundle. The
   * result + ledger entry carry a `routedVia` field so diagnostics can
   * tell which path ran. */
  async function importFromFile(filePathArg, options) {
    var importOptions = (options && typeof options === 'object') ? options : {};
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

    /* Folder-only fast-path: when the payload carries only folder state
     * (no chats), route through importFolderStateOnly. This skips the
     * full-bundle dry-run validator (which requires a chatArchive
     * section) and writes folders + folder_bindings + the fallback KV
     * mirror via the existing private importFolders + importFolderBindings
     * code paths. The folder-only entry point is Phase A's narrow API. */
    var folderOnly = isFolderOnlyPayload(bundle)
      && typeof ingestion.importFolderStateOnly === 'function';
    var routedVia = folderOnly ? 'importFolderStateOnly' : 'importBundle';

    /* Defensive dry-run before the actual write — gives early rejection
     * for parse errors that JSON.parse didn't catch and surfaces orphan
     * counts before write commits. Skipped on the folder-only fast-path
     * because dryRunImportBundle requires a chatArchive section. */
    if (!folderOnly && typeof ingestion.dryRunImportBundle === 'function') {
      var dry;
      try { dry = await ingestion.dryRunImportBundle(bundle); }
      catch (e) { return { ok: false, error: 'dry-run-failed', detail: String((e && e.message) || e), routedVia: routedVia }; }
      if (!dry || dry.ok === false) {
        return { ok: false, error: 'dry-run-rejected', dryRunReport: dry, routedVia: routedVia };
      }
    }

    var result;
    try {
      result = folderOnly
        ? await ingestion.importFolderStateOnly(bundle, importOptions)
        : await ingestion.importBundle(bundle, 'merge', importOptions);
    } catch (e) { return { ok: false, error: 'import-failed', detail: String((e && e.message) || e), routedVia: routedVia }; }

    state.lastImportAt = new Date().toISOString();

    /* Phase D — orphan-folder-binding visibility. Count warnings whose
     * `kind === "orphan-folder-binding"` and stash a small sample so
     * diagnose() can surface the latest count. Orphans are NOT errors:
     * the import path persists the binding row and emits the warning so
     * the missing chat ref can be resolved later (e.g. once the chat is
     * imported through a separate ingestion phase). This block is purely
     * additive — it never changes whether the import is treated as ok,
     * never deletes or rewrites bindings, never creates missing chats. */
    var orphanCount = 0;
    var orphanSample = [];
    try {
      var rawWarnings = (result && Array.isArray(result.warnings)) ? result.warnings : [];
      for (var wi = 0; wi < rawWarnings.length; wi += 1) {
        var w = rawWarnings[wi];
        if (w && w.kind === 'orphan-folder-binding') {
          orphanCount += 1;
          if (orphanSample.length < MAX_ORPHAN_SAMPLE) {
            /* Keep the original warning shape (kind/folderId/chatId?) —
             * caller may want to map back to the source binding. */
            orphanSample.push(w);
          }
        }
      }
    } catch (_) { /* visibility-only; never throw from the diagnostic path */ }
    state.lastImportOrphanBindings      = orphanCount;
    state.lastImportOrphanBindingSample = orphanSample;
    state.lastImportOrphanBindingsAt    = state.lastImportAt;

    var entry = {
      fingerprint: fingerprint,
      filename: basename(filePath),
      path: filePath,
      sizeBytes: sizeBytes,
      detectedAt: state.lastImportAt,
      importedAt: state.lastImportAt,
      mode: String(importOptions.mode || 'manual'),
      routedVia: routedVia,
      bundleExportedAt: (bundle && typeof bundle.exportedAt === 'string') ? bundle.exportedAt : '',
      resultSummary: result ? {
        ok: !!result.ok,
        written: result.written || null,
        skipped: result.skipped || null,
        warningsCount: Array.isArray(result.warnings) ? result.warnings.length : 0,
        errorsCount:   Array.isArray(result.errors)   ? result.errors.length   : 0,
        orphanFolderBindingsCount: orphanCount,
      } : null,
    };
    await appendLedgerEntry(entry);
    return {
      ok: !!(result && result.ok !== false),
      status: 'imported',
      fingerprint: fingerprint,
      routedVia: routedVia,
      orphanFolderBindings: orphanCount,
      result: result,
      ledgerEntry: entry,
    };
  }

  async function importChromeLatestFromFile(filePathArg, options) {
    var filePath = String(filePathArg || '').trim();
    if (!filePath) {
      return propagationResult(false, {
        status: 'blocked',
        blockers: ['library-propagation-path-required']
      });
    }
    if (basename(filePath).toLowerCase() !== CHROME_LATEST_FILE) {
      return propagationResult(false, {
        status: 'blocked',
        blockers: ['library-propagation-chrome-latest-filename-required']
      });
    }

    var fileText;
    try { fileText = await fsReadTextFile(filePath); }
    catch (e) {
      pushErr('importChromeLatest.readFile', e);
      return propagationResult(false, {
        status: 'blocked',
        blockers: ['library-propagation-read-failed']
      });
    }

    var sizeBytes = (typeof fileText === 'string') ? fileText.length : 0;
    if (sizeBytes > MAX_FILE_SIZE_BYTES) {
      return propagationResult(false, {
        status: 'blocked',
        blockers: ['library-propagation-file-too-large'],
        sourceSummary: { sizeBytes: sizeBytes }
      });
    }

    var fingerprint = '';
    try { fingerprint = await sha256Hex(fileText); }
    catch (e) {
      return propagationResult(false, {
        status: 'blocked',
        blockers: ['library-propagation-fingerprint-failed']
      });
    }

    var ledger = await getLedger();
    var existing = ledger.entries.filter(function (le) { return le && le.fingerprint === fingerprint; })[0];
    if (existing) {
      return propagationResult(true, {
        status: 'already-imported',
        warnings: [F19_SYNC_HARDENING_CODES.duplicateImportIdempotent],
        idempotency: {
          fileFingerprintChecked: true,
          alreadyImported: true,
          hardeningCode: F19_SYNC_HARDENING_CODES.duplicateImportIdempotent,
          mergeOnly: true,
          existingRowsSkipped: true,
          protectedDomainFallbackDisabled: true
        }
      });
    }

    var bundle;
    try { bundle = JSON.parse(fileText); }
    catch (e) {
      return propagationResult(false, {
        status: 'blocked',
        blockers: ['library-propagation-json-parse-failed']
      });
    }

    var transportBlockers = classifyIncomingChromeTransport(bundle, ledger, fingerprint);
    if (transportBlockers.length > 0) {
      return propagationResult(false, {
        status: 'blocked',
        blockers: transportBlockers,
        warnings: [],
        sourceSummary: {
          schema: String(bundle && bundle.schema || ''),
          direction: 'chrome-to-desktop',
          transport: CHROME_LATEST_FILE,
          hasExportId: !!(bundle && bundle.exportId),
          exportedAt: String(bundle && bundle.exportedAt || '')
        },
        idempotency: {
          fileFingerprintChecked: true,
          alreadyImported: false,
          mergeOnly: true,
          existingRowsSkipped: true,
          protectedDomainFallbackDisabled: true
        }
      });
    }

    var result = await importChromeLatestBundle(bundle, Object.assign(
      {},
      options && typeof options === 'object' ? options : {},
      { fileFingerprint: fingerprint, mode: 'f19-chrome-desktop' }
    ));
    result.idempotency = Object.assign({}, result.idempotency || {}, {
      fileFingerprintChecked: true,
      alreadyImported: false
    });
    if (result.ok) {
      state.lastImportAt = new Date().toISOString();
      await appendLedgerEntry({
        fingerprint: fingerprint,
        filename: CHROME_LATEST_FILE,
        path: filePath,
        sizeBytes: sizeBytes,
        detectedAt: state.lastImportAt,
        importedAt: state.lastImportAt,
        mode: 'f19-chrome-desktop',
        routedVia: 'importChromeLatestBundle',
        bundleExportedAt: (bundle && typeof bundle.exportedAt === 'string') ? bundle.exportedAt : '',
        exportId: (bundle && bundle.exportId) ? String(bundle.exportId) : '',
        sequenceNumber: typeof (bundle && bundle.sequenceNumber) === 'number' ? bundle.sequenceNumber : null,
        previousExportId: (bundle && bundle.previousExportId) ? String(bundle.previousExportId) : '',
        resultSummary: {
          ok: true,
          status: result.status,
          warningsCount: result.warnings.length,
          blockersCount: result.blockers.length,
          written: result.importSummary && result.importSummary.written ? result.importSummary.written : null,
          skipped: result.importSummary && result.importSummary.skipped ? result.importSummary.skipped : null
        }
      });
    }
    return result;
  }

  async function importChromeLatestFromFolder(folderPathArg, options) {
    var config = await getConfig();
    var folderPath = String(folderPathArg || config.folderPath || '').trim();
    if (!folderPath) {
      return propagationResult(false, {
        status: 'blocked',
        blockers: ['library-propagation-folder-required']
      });
    }
    return importChromeLatestFromFile(joinPath(folderPath, CHROME_LATEST_FILE), options);
  }

  async function folderSyncNow(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var direction = String(opts.direction || opts.syncDirection || 'chrome-to-desktop').trim().toLowerCase().replace(/_/g, '-');
    if (!direction || direction === 'chrome-to-desktop' || direction === 'chrome-to-desktop-import') {
      return importChromeLatestFromFolder(opts.folderPath || opts.path || null, Object.assign({}, opts, {
        direction: 'chrome-to-desktop',
        transport: CHROME_LATEST_FILE,
        reason: String(opts.reason || 'desktop-folder-sync-now')
      }));
    }
    return propagationResult(false, {
      status: 'blocked',
      blockers: ['library-propagation-direction-unsupported'],
      warnings: [],
      sourceSummary: {
        direction: direction,
        transport: direction === 'desktop-to-chrome' ? 'latest.json' : '',
        supportedDirection: 'chrome-to-desktop',
        apiHint: direction === 'desktop-to-chrome'
          ? 'Use H2O.Studio.sync.autoExport for Desktop -> Chrome latest.json export.'
          : 'Use H2O.Studio.sync.folder.syncNow({ direction: "chrome-to-desktop" }).'
      }
    });
  }

  /* ── M2d-1b: Polling watcher / Notify mode ───────────────────────── */

  function pushWatcherErr(op, e) {
    try {
      var entry = { at: Date.now(), op: String(op), error: String((e && e.message) || e || '') };
      watcherState.errors.push(entry);
      if (watcherState.errors.length > watcherState.errMax) {
        watcherState.errors.splice(0, watcherState.errors.length - watcherState.errMax);
      }
      watcherState.lastError = entry;
    } catch (_) { /* ignore */ }
  }

  function emitWatcherEvent(event) {
    try { watcherState.lastEventAt = (event && event.at) || new Date().toISOString(); }
    catch (_) { /* ignore */ }
    watcherState.listeners.forEach(function (fn) {
      try { fn(event); }
      catch (e) { pushWatcherErr('subscriber', e); }
    });
  }

  /* Single watcher tick: scan the configured folder once, walk candidates,
   * apply two-cycle file-stability check, emit 'new-candidate' for files
   * that are stable + not in the pending queue + not in the ledger, and
   * always emit 'scan-complete' at the end. NEVER calls importFromFile —
   * Notify mode is detection only. */
  async function runWatcherTick() {
    if (watcherState.scanInFlight) return;       /* single-flight */
    watcherState.scanInFlight = true;
    try {
      var folderPath = String(watcherState.folderPath || '').trim();
      if (!folderPath) {
        pushWatcherErr('tick', 'folderPath empty');
        return;
      }
      var scan;
      try { scan = await scanFolderOnce(folderPath); }
      catch (e) {
        pushWatcherErr('tick.scan', e);
        emitWatcherEvent({ kind: 'error', at: new Date().toISOString(), op: 'scan', error: String((e && e.message) || e) });
        return;
      }
      watcherState.lastScanAt = new Date().toISOString();
      if (!scan || scan.ok === false) {
        var scanErr = (scan && scan.error) || 'scan-failed';
        pushWatcherErr('tick.scan', scanErr);
        emitWatcherEvent({ kind: 'error', at: watcherState.lastScanAt, op: 'scan', error: String(scanErr) });
        return;
      }
      var candidates = Array.isArray(scan.candidates) ? scan.candidates : [];
      var pendingFingerprints = Object.create(null);
      watcherState.pending.forEach(function (p) {
        if (p && p.fingerprint) pendingFingerprints[p.fingerprint] = true;
      });
      var newCandidateCount = 0;
      var stillPresentPaths = Object.create(null);
      for (var i = 0; i < candidates.length; i += 1) {
        var c = candidates[i];
        if (!c || !c.path) continue;
        /* scanFolderOnce already marks: already-imported / too-large /
         * json-parse-failed / dry-run-rejected / read-failed / etc. via
         * .skipped. Don't queue any of those — but DO clean up stale
         * sizeMap entries so re-detection works after a dismiss or after
         * a previously-failed file is replaced. */
        if (c.skipped) {
          /* If a previously-pending candidate is now in the ledger
           * (status 'already-imported'), the user must have imported it
           * since last tick — drop from pending queue. */
          if (c.skipped === 'already-imported' && c.fingerprint && pendingFingerprints[c.fingerprint]) {
            watcherState.pending = watcherState.pending.filter(function (p) { return p.fingerprint !== c.fingerprint; });
            delete pendingFingerprints[c.fingerprint];
          }
          delete watcherState.sizeMap[c.path];
          continue;
        }
        /* Live candidate (not in ledger, parses OK, dry-run OK). */
        var size = (typeof c.sizeBytes === 'number') ? c.sizeBytes : 0;
        var nowMs = Date.now();
        stillPresentPaths[c.path] = true;
        var seen = watcherState.sizeMap[c.path];
        if (!seen) {
          /* First time we've seen this path — record + wait for next tick. */
          watcherState.sizeMap[c.path] = { size: size, firstSeenAtMs: nowMs };
          continue;
        }
        if (seen.size !== size) {
          /* File is still growing; reset the stability clock. */
          watcherState.sizeMap[c.path] = { size: size, firstSeenAtMs: nowMs };
          continue;
        }
        if ((nowMs - seen.firstSeenAtMs) < FILE_STABLE_MIN_MS) {
          /* Stable size but hasn't waited long enough yet. */
          continue;
        }
        /* Stable + waited long enough. */
        if (c.fingerprint && pendingFingerprints[c.fingerprint]) {
          continue;  /* already queued */
        }
        var entry = {
          fingerprint: c.fingerprint,
          filename:    c.filename,
          path:        c.path,
          sizeBytes:   size,
          exportedAt:  c.exportedAt || '',
          dryRun:      c.dryRun || null,
          detectedAt:  new Date().toISOString(),
        };
        watcherState.pending.push(entry);
        if (c.fingerprint) pendingFingerprints[c.fingerprint] = true;
        newCandidateCount += 1;
        /* Reset sizeMap entry so a future dismiss + replace cycle
         * re-detects via fresh stability tracking. */
        delete watcherState.sizeMap[c.path];
        emitWatcherEvent({ kind: 'new-candidate', at: entry.detectedAt, candidate: entry });
      }
      /* Garbage-collect sizeMap entries for paths no longer in the folder
       * (file was deleted / renamed / moved away). */
      Object.keys(watcherState.sizeMap).forEach(function (path) {
        if (!stillPresentPaths[path]) delete watcherState.sizeMap[path];
      });
      emitWatcherEvent({
        kind: 'scan-complete',
        at: watcherState.lastScanAt,
        candidateCount: candidates.length,
        newCandidateCount: newCandidateCount,
      });
    } catch (e) {
      pushWatcherErr('tick', e);
    } finally {
      watcherState.scanInFlight = false;
    }
  }

  function startWatcher(opts) {
    var optsObj = (opts && typeof opts === 'object') ? opts : {};
    if (watcherState.running) {
      return { ok: true, started: false, alreadyRunning: true, intervalMs: watcherState.intervalMs };
    }
    var requested = (typeof optsObj.intervalMs === 'number' && isFinite(optsObj.intervalMs))
      ? Math.floor(optsObj.intervalMs) : DEFAULT_INTERVAL_MS;
    var intervalMs = Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, requested));
    watcherState.intervalMs = intervalMs;
    watcherState.running = true;
    watcherState.sizeMap = Object.create(null);  /* fresh stability state */
    watcherState.scanInFlight = false;
    var scanOnStart = optsObj.scanOnStart !== false;
    if (scanOnStart) {
      runWatcherTick().catch(function (e) { pushWatcherErr('startScan', e); });
    }
    watcherState.intervalId = global.setInterval(function () {
      runWatcherTick().catch(function (e) { pushWatcherErr('tick', e); });
    }, intervalMs);
    return { ok: true, started: true, intervalMs: intervalMs };
  }

  function stopWatcher() {
    if (!watcherState.running) {
      return { ok: true, stopped: false, alreadyStopped: true };
    }
    if (watcherState.intervalId != null) {
      try { global.clearInterval(watcherState.intervalId); } catch (_) { /* ignore */ }
      watcherState.intervalId = null;
    }
    watcherState.running = false;
    watcherState.sizeMap = Object.create(null);
    watcherState.scanInFlight = false;
    return { ok: true, stopped: true };
  }

  function getWatcherState() {
    return {
      running:        watcherState.running,
      intervalMs:     watcherState.intervalMs,
      folderPath:     watcherState.folderPath,
      mode:           watcherState.mode,
      lastScanAt:     watcherState.lastScanAt,
      lastEventAt:    watcherState.lastEventAt,
      pendingCount:   watcherState.pending.length,
      listenerCount:  watcherState.listeners.size,
      stableMs:       FILE_STABLE_MIN_MS,
      scanInFlight:   watcherState.scanInFlight,
      sizeMapTracking: Object.keys(watcherState.sizeMap).length,
      errorsCount:    watcherState.errors.length,
      lastError:      watcherState.lastError,
    };
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () { /* noop */ };
    if (watcherState.listeners.size >= MAX_LISTENERS) {
      pushWatcherErr('subscribe', 'listener cap reached (' + MAX_LISTENERS + '); ignoring new subscription');
      return function () { /* noop */ };
    }
    watcherState.listeners.add(fn);
    return function () { watcherState.listeners.delete(fn); };
  }

  function getPendingCandidates() {
    /* Defensive shallow copy — caller can mutate without affecting state. */
    return watcherState.pending.slice();
  }

  function dismissPending(fingerprint) {
    var fp = String(fingerprint || '').trim();
    if (!fp) return { ok: false, dismissed: false, error: 'fingerprint-required' };
    var before = watcherState.pending.length;
    watcherState.pending = watcherState.pending.filter(function (p) {
      return !p || p.fingerprint !== fp;
    });
    var dismissed = watcherState.pending.length !== before;
    if (dismissed) {
      emitWatcherEvent({
        kind: 'candidate-dismissed',
        at: new Date().toISOString(),
        fingerprint: fp,
      });
    }
    return { ok: true, dismissed: dismissed };
  }

  /* Called from setConfig + boot. Compares the next/prev config to decide
   * whether the watcher should be running with the right folder. Always
   * updates the cached config snapshot first so getWatcherState() reflects
   * reality immediately. */
  function reconcileWatcherFromConfig(next, prev) {
    watcherState.folderPath = String((next && next.folderPath) || '').trim();
    watcherState.mode       = String((next && next.mode) || 'off');
    var shouldRun = (watcherState.mode === 'notify' || watcherState.mode === 'auto')
                 && !!watcherState.folderPath;
    var folderPathChanged = !prev || (String(prev.folderPath || '') !== watcherState.folderPath);
    if (!shouldRun) {
      if (watcherState.running) {
        stopWatcher();
        watcherState.pending = [];   /* clear queue when stopping */
        emitWatcherEvent({ kind: 'scan-complete', at: new Date().toISOString(), candidateCount: 0, newCandidateCount: 0, stopped: true });
      }
      return;
    }
    if (watcherState.running) {
      if (folderPathChanged) {
        stopWatcher();
        watcherState.pending = [];
        startWatcher();
      }
      /* else: already running with the correct folder; nothing to do */
      return;
    }
    /* Not running, should be → start. */
    startWatcher();
  }

  /* ── Diagnose ─────────────────────────────────────────────────────── */
  function diagnose() {
    var ingestion = (H2O.Studio && H2O.Studio.ingestion) || null;
    return {
      installed: true,
      stage: 'M2d-1b',
      mode: 'manual+notify',
      keys: { config: CONFIG_KEY, ledger: LEDGER_KEY },
      limits: {
        maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
        maxLedgerEntries: MAX_LEDGER_ENTRIES,
        intervalMs: {
          min: MIN_INTERVAL_MS,
          max: MAX_INTERVAL_MS,
          default: DEFAULT_INTERVAL_MS,
        },
        fileStableMinMs: FILE_STABLE_MIN_MS,
        maxListeners: MAX_LISTENERS,
      },
      filenamePatterns: FILENAME_PATTERNS.map(function (r) { return r.toString(); }),
      ignoreSuffixes: IGNORE_SUFFIXES.slice(),
      ingestionAvailable: !!(ingestion && typeof ingestion.importBundle === 'function'),
      folderOnlyApiAvailable: !!(ingestion && typeof ingestion.importFolderStateOnly === 'function'),
      chromeDesktopPropagation: {
        schema: PROPAGATION_SCHEMA,
        version: F19_CHROME_DESKTOP_VERSION,
        transport: CHROME_LATEST_FILE,
        direction: 'chrome-to-desktop',
        supportedFields: CHROME_DESKTOP_SUPPORTED_FIELDS.slice(),
        deferredCodes: Object.assign({}, CHROME_DESKTOP_DEFERRED_CODES),
        hardeningTaxonomy: Object.assign({}, F19_SYNC_HARDENING_CODES),
        offlineRestartBehavior: {
          chromeOffline: 'chrome-latest.json remains pending until Desktop imports it',
          desktopOffline: 'Desktop ledger replays chrome-latest.json after restart',
          repeatedImport: F19_SYNC_HARDENING_CODES.duplicateImportIdempotent,
          staleTransport: F19_SYNC_HARDENING_CODES.transportStale,
          simultaneousUpdate: F19_SYNC_HARDENING_CODES.simultaneousUpdateConflict
        },
        guardedImportAvailable: !!(ingestion && typeof ingestion.importBundle === 'function')
      },
      state: {
        lastScanAt: state.lastScanAt,
        lastImportAt: state.lastImportAt,
        errors: state.errors.slice(-5),
        warnings: state.warnings.slice(-5),
        /* Phase D — orphan-folder-binding visibility (visibility only,
         * does not change import semantics). 0 means the last import
         * produced no orphans (or no import has run since boot, in which
         * case lastImportOrphanBindingsAt is null). */
        lastImportOrphanBindings:      state.lastImportOrphanBindings,
        lastImportOrphanBindingSample: state.lastImportOrphanBindingSample.slice(),
        lastImportOrphanBindingsAt:    state.lastImportOrphanBindingsAt,
      },
      watcher: {
        running:        watcherState.running,
        intervalMs:     watcherState.intervalMs,
        folderPath:     watcherState.folderPath,
        mode:           watcherState.mode,
        lastScanAt:     watcherState.lastScanAt,
        lastEventAt:    watcherState.lastEventAt,
        pendingCount:   watcherState.pending.length,
        listenerCount:  watcherState.listeners.size,
        scanInFlight:   watcherState.scanInFlight,
        sizeMapTracking: Object.keys(watcherState.sizeMap).length,
        errors:         watcherState.errors.slice(-5),
        lastError:      watcherState.lastError,
      },
    };
  }

  /* ── Register ────────────────────────────────────────────────────── */
  var existingSync = H2O.Studio.sync && typeof H2O.Studio.sync === 'object' ? H2O.Studio.sync : {};
  var desktopSyncApi = {
    __installed: true,
    __version: '0.2.0',
    /* M2d-1a manual API */
    getConfig:       getConfig,
    setConfig:       setConfig,
    getLedger:       getLedger,
    clearLedger:     clearLedger,
    scanFolderOnce:  scanFolderOnce,
    importFromFile:  importFromFile,
    importChromeLatestBundle:     importChromeLatestBundle,
    importChromeLatestFromFile:   importChromeLatestFromFile,
    importChromeLatestFromFolder: importChromeLatestFromFolder,
    chromeDesktopPropagationSchema: PROPAGATION_SCHEMA,
    chromeDesktopPropagationVersion: F19_CHROME_DESKTOP_VERSION,
    chromeDesktopHardeningTaxonomy: Object.assign({}, F19_SYNC_HARDENING_CODES),
    diagnose:        diagnose,
    /* M2d-1b polling watcher + Notify-mode API */
    startWatcher:         startWatcher,
    stopWatcher:          stopWatcher,
    getWatcherState:      getWatcherState,
    subscribe:            subscribe,
    getPendingCandidates: getPendingCandidates,
    dismissPending:       dismissPending,
  };

  var folderApi = Object.assign({}, existingSync.folder && typeof existingSync.folder === 'object' ? existingSync.folder : {}, {
    __installed: true,
    __version: '0.1.0-f19.7.k',
    direction: 'chrome-to-desktop',
    transport: CHROME_LATEST_FILE,
    chromeWritesSyncFolder: false,
    desktopReadsChromeLatestJson: true,
    getConfig: getConfig,
    setConfig: setConfig,
    getLedger: getLedger,
    clearLedger: clearLedger,
    scanFolderOnce: scanFolderOnce,
    importFromFile: importFromFile,
    importChromeLatestBundle: importChromeLatestBundle,
    importChromeLatestFromFile: importChromeLatestFromFile,
    importChromeLatestFromFolder: importChromeLatestFromFolder,
    importChromeFromSyncFolder: importChromeLatestFromFolder,
    importChromeLatestFromSyncFolder: importChromeLatestFromFolder,
    syncNow: folderSyncNow,
    diagnose: diagnose,
    startWatcher: startWatcher,
    stopWatcher: stopWatcher,
    getWatcherState: getWatcherState,
    subscribe: subscribe,
    getPendingCandidates: getPendingCandidates,
    dismissPending: dismissPending,
  });

  H2O.Studio.sync = Object.assign({}, existingSync, desktopSyncApi, {
    folder: folderApi,
  });

  /* Boot-time auto-start: if persisted config has mode ∈ {notify, auto}
   * AND folderPath set, kick the watcher after the platform/stores have
   * a chance to initialize. Wrapped in setTimeout(0) so module
   * registration completes synchronously first. 'auto' starts the watcher
   * in Notify behavior for M2d-1b — actual auto-import lands in M2d-1c. */
  global.setTimeout(function () {
    getConfig().then(function (cfg) {
      watcherState.folderPath = cfg.folderPath || '';
      watcherState.mode = cfg.mode || 'off';
      if ((cfg.mode === 'notify' || cfg.mode === 'auto') && cfg.folderPath) {
        startWatcher();
      }
    }).catch(function (e) { pushWatcherErr('boot', e); });
  }, 0);
})(typeof window !== 'undefined' ? window : globalThis);
