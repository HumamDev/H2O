/* H2O Studio — Desktop Asset CAS (content-addressed store) put/get
 *
 * Chat Saving Architecture Phase C C3.2. A Desktop-only, FILESYSTEM-ONLY
 * content-addressed store for saved-chat binary assets. It is the bytes layer
 * only: it hashes, writes (idempotently), reads, and reports existence of blobs
 * under the app-owned archive root. It does NOT touch SQLite, the C2b asset
 * registry adapter (store.assets), turn linking, package materialization,
 * manifests, `contentHash`, UI, or sync. Those are later slices (C4+).
 *
 * Layout (locked in ADR-0010 "C3.0"):
 *   live CAS root  : $APPLOCALDATA/archive/assets   (BaseDirectory.AppLocalData = 15)
 *   live blob path : archive/assets/<aa>/sha256-<hex>   (<aa> = first 2 hex chars)
 *   live blobs are EXTENSION-LESS (ext/mime live in the registry/manifest, not here).
 * The per-package export copy (`assets/sha256-<hex>.<ext>`) is C4, not here.
 *
 * Immutability: content-addressed blobs are never mutated. This module exposes
 * NO remove/delete/rename/GC API (matches the C2a capability, which grants only
 * mkdir/exists/read-file/write-file under $APPLOCALDATA/archive).
 *
 * Desktop-only: gates on Tauri detection at load; on MV3 / web it registers
 * nothing (Chrome stays light).
 *
 * Public API (H2O.Studio.ingestion.assetCas):
 *   putAssetBytes({ bytes, mimeType, ext, originalName, source, meta })
 *   getAssetBytes(sha256) -> Uint8Array | null
 *   exists(sha256)        -> boolean
 *   describe(sha256)      -> { sha256, path, exists, byteLength }
 *   diagnoseAssetCas()    -> status
 *
 * Contracts: docs/decisions/ADR-0010-saved-chat-asset-cas.md
 *            docs/systems/archive/saved-chat-package-format.md
 *            apps/studio/desktop/src-tauri/capabilities/archive-cas.json
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
  H2O.Studio.ingestion = H2O.Studio.ingestion || {};
  if (H2O.Studio.ingestion.assetCas && H2O.Studio.ingestion.assetCas.__installed) return;

  var MODULE_VERSION = '0.1.0-phase-c-c3.2';
  var APP_LOCAL_DATA = 15;            /* Tauri BaseDirectory.AppLocalData */
  var CAS_ROOT = 'archive/assets';    /* relative to AppLocalData */

  var state = {
    installedAt: Date.now(),
    putCount: 0,
    writeCount: 0,
    dedupeCount: 0,
    readCount: 0,
    lastPutAt: null,
    lastError: null,
  };

  function recordError(op, e) {
    state.lastError = { t: Date.now(), op: String(op), e: String((e && (e.stack || e.message)) || e || '') };
  }

  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function safeObject(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

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
  function invokeOrThrow() {
    var invoke = getInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable');
    return invoke;
  }
  function fsOptions(extra) {
    var out = { baseDir: APP_LOCAL_DATA };
    if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k]; } }
    return out;
  }

  /* ── Byte helpers ─────────────────────────────────────────────────── */
  function getTextEncoder() {
    if (typeof global.TextEncoder === 'function') return new global.TextEncoder();
    if (typeof TextEncoder === 'function') return new TextEncoder();
    throw new Error('TextEncoder unavailable');
  }
  /* Coerce supported inputs to a Uint8Array (binary). */
  function toUint8(input) {
    if (input instanceof Uint8Array) return input;
    if (typeof ArrayBuffer !== 'undefined' && input instanceof ArrayBuffer) return new Uint8Array(input);
    if (input && typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(input)) {
      return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    if (Array.isArray(input)) return Uint8Array.from(input);
    if (typeof input === 'string') return getTextEncoder().encode(input);
    return new Uint8Array(0);
  }
  /* Normalize a Tauri read_file result (Vec<u8> over JSON) to Uint8Array. */
  function decodeToBytes(raw) {
    if (raw instanceof Uint8Array) return raw;
    if (typeof ArrayBuffer !== 'undefined' && raw instanceof ArrayBuffer) return new Uint8Array(raw);
    if (raw && typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(raw)) {
      return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    }
    if (Array.isArray(raw)) return Uint8Array.from(raw);
    if (typeof raw === 'string') return getTextEncoder().encode(raw);
    return new Uint8Array(0);
  }
  function bytesToHex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i += 1) {
      var part = bytes[i].toString(16);
      out += part.length === 1 ? '0' + part : part;
    }
    return out;
  }
  async function sha256HexOf(bytes) {
    var cryptoObj = global.crypto || (typeof crypto !== 'undefined' ? crypto : null);
    if (!cryptoObj || !cryptoObj.subtle || typeof cryptoObj.subtle.digest !== 'function') {
      throw new Error('WebCrypto SHA-256 unavailable');
    }
    var buffer = await cryptoObj.subtle.digest('SHA-256', bytes);
    return bytesToHex(new Uint8Array(buffer));
  }

  /* ── Identity / path ──────────────────────────────────────────────── */
  /* Accept `sha256-<hex>` or bare `<hex>`; return lowercase 64-hex or '' if invalid. */
  function normalizeHex(input) {
    var s = cleanString(input).toLowerCase();
    if (s.indexOf('sha256-') === 0) s = s.slice('sha256-'.length);
    return /^[0-9a-f]{64}$/.test(s) ? s : '';
  }
  function shardOf(hex) { return hex.slice(0, 2); }
  function blobPathForHex(hex) { return CAS_ROOT + '/' + shardOf(hex) + '/sha256-' + hex; }
  function shardDirForHex(hex) { return CAS_ROOT + '/' + shardOf(hex); }

  /* ── Filesystem (binary), all scoped to AppLocalData (baseDir 15) ──── */
  async function fsExists(path) {
    var invoke = invokeOrThrow();
    try { return !!(await invoke('plugin:fs|exists', { path: path, options: fsOptions() })); }
    catch (e) {
      var msg = String((e && e.message) || e).toLowerCase();
      if (msg.indexOf('not found') >= 0 || msg.indexOf('no such') >= 0) return false;
      throw e;
    }
  }
  async function fsMkdirRecursive(path) {
    var invoke = invokeOrThrow();
    return invoke('plugin:fs|mkdir', { path: path, options: fsOptions({ recursive: true }) });
  }
  async function fsWriteFile(path, u8) {
    var invoke = invokeOrThrow();
    /* tauri-plugin-fs v2 `write_file` takes the bytes as the request BODY and
     * the path/options as request HEADERS. The JSON object form
     * ({ path, contents, options }) is rejected by the plugin with
     * "missing file path" because it reads `path` from a header. This mirrors
     * the proven write form in ingestion/export-bundle.tauri.js. */
    return invoke('plugin:fs|write_file', u8, {
      headers: {
        path: encodeURIComponent(path),
        options: JSON.stringify(fsOptions()),
      },
    });
  }
  async function fsReadFile(path) {
    var invoke = invokeOrThrow();
    return decodeToBytes(await invoke('plugin:fs|read_file', { path: path, options: fsOptions() }));
  }

  /* ── Public API ───────────────────────────────────────────────────── */
  async function putAssetBytes(input) {
    var opts = safeObject(input);
    var u8 = toUint8(opts.bytes);
    if (!u8 || u8.length === 0) throw new Error('putAssetBytes: non-empty bytes required');
    state.putCount += 1;
    try {
      var hex = await sha256HexOf(u8);
      var sha256 = 'sha256-' + hex;
      var path = blobPathForHex(hex);
      /* Echoed (not persisted) metadata for the future C4 registry caller. */
      var descriptor = {
        sha256: sha256,
        path: path,
        byteLength: u8.length,
        mimeType: cleanString(opts.mimeType),
        ext: cleanString(opts.ext),
        originalName: cleanString(opts.originalName),
        source: cleanString(opts.source),
        meta: safeObject(opts.meta),
      };
      var already = await fsExists(path);
      if (already) {
        state.dedupeCount += 1;
        state.lastPutAt = Date.now();
        return Object.assign(descriptor, { deduped: true, wrote: false });
      }
      await fsMkdirRecursive(shardDirForHex(hex));
      await fsWriteFile(path, u8);
      state.writeCount += 1;
      state.lastPutAt = Date.now();
      return Object.assign(descriptor, { deduped: false, wrote: true });
    } catch (e) { recordError('putAssetBytes', e); throw e; }
  }

  async function getAssetBytes(sha256Input) {
    var hex = normalizeHex(sha256Input);
    if (!hex) return null;
    var path = blobPathForHex(hex);
    try {
      if (!(await fsExists(path))) return null;
      state.readCount += 1;
      return await fsReadFile(path);
    } catch (e) { recordError('getAssetBytes', e); return null; }
  }

  async function exists(sha256Input) {
    var hex = normalizeHex(sha256Input);
    if (!hex) return false;
    try { return await fsExists(blobPathForHex(hex)); }
    catch (e) { recordError('exists', e); return false; }
  }

  /* Filesystem-level info only. byteLength is read-derived (no fs:stat granted). */
  async function describe(sha256Input) {
    var hex = normalizeHex(sha256Input);
    if (!hex) return { sha256: '', path: '', exists: false, byteLength: null };
    var sha256 = 'sha256-' + hex;
    var path = blobPathForHex(hex);
    try {
      var ex = await fsExists(path);
      var byteLength = null;
      if (ex) { try { byteLength = (await fsReadFile(path)).length; } catch (_) { byteLength = null; } }
      return { sha256: sha256, path: path, exists: ex, byteLength: byteLength };
    } catch (e) { recordError('describe', e); return { sha256: sha256, path: path, exists: false, byteLength: null }; }
  }

  function diagnoseAssetCas() {
    return {
      installed: true,
      version: MODULE_VERSION,
      desktopOnly: true,
      ready: !!getInvoke(),
      casRoot: CAS_ROOT,
      baseDir: APP_LOCAL_DATA,
      baseDirName: 'AppLocalData',
      layout: 'archive/assets/<aa>/sha256-<hex> (extension-less, prefix-sharded)',
      registryCoupled: false,
      mutatesDb: false,
      gcEnabled: false,
      removeRenameExposed: false,
      putCount: state.putCount,
      writeCount: state.writeCount,
      dedupeCount: state.dedupeCount,
      readCount: state.readCount,
      lastPutAt: state.lastPutAt,
      lastError: state.lastError,
    };
  }

  H2O.Studio.ingestion = Object.assign({}, H2O.Studio.ingestion, {
    assetCas: {
      __installed: true,
      __version: MODULE_VERSION,
      putAssetBytes: putAssetBytes,
      getAssetBytes: getAssetBytes,
      exists: exists,
      describe: describe,
      diagnoseAssetCas: diagnoseAssetCas,
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
