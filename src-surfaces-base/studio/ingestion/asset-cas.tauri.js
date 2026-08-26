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
 * Integrity: a content-addressed path is trustworthy because its BYTES were
 * verified, never because the pathname exists. Every put either verifies the
 * object already standing at the destination or commits the bytes through the
 * bounded durable writer and re-verifies the committed result. A destination
 * whose bytes do not hash to its own name is repaired in place by writing the
 * verified-correct bytes; because the filename IS the SHA-256 of those bytes,
 * that repair is provably correct and idempotent. It is reported (repairCount,
 * descriptor.repaired), never silent.
 *
 * Immutability: a valid blob is never mutated, and this module still exposes NO
 * remove/delete/rename/GC API. Repair is not a deletion — the atomic promotion
 * inside h2o_archive_durable_write supersedes the entry and never leaves the
 * destination absent. Reclamation remains out of scope (no GC in Phase C).
 *
 * Desktop-only: gates on Tauri detection at load; on MV3 / web it registers
 * nothing (Chrome stays light).
 *
 * Public API (H2O.Studio.ingestion.assetCas):
 *   putAssetBytes({ bytes, mimeType, ext, originalName, source, meta })
 *   getAssetBytes(sha256)         -> Uint8Array | null   (unverified, legacy)
 *   readVerifiedAssetBytes(sha256)-> Uint8Array | null   (throws on mismatch)
 *   exists(sha256)                -> boolean
 *   describe(sha256)              -> { sha256, path, exists, byteLength }
 *   diagnoseAssetCas()            -> status
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
  var ARCHIVE_ROOT_PREFIX = 'archive/';
  var DURABLE_WRITE_COMMAND = 'h2o_archive_durable_write';
  var DESTINATION_EXISTS_BLOCKER = 'durable-write-destination-exists';

  var state = {
    installedAt: Date.now(),
    putCount: 0,
    writeCount: 0,
    dedupeCount: 0,
    readCount: 0,
    verifyCount: 0,
    mismatchCount: 0,
    repairCount: 0,
    lastPutAt: null,
    lastMismatchAt: null,
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

  /* The durable writer admits destinations relative to the archive root, while
   * every plugin:fs call here is relative to AppLocalData. Derive one from the
   * other so the two path vocabularies can never silently drift apart. */
  function archiveRelativeOf(appLocalDataPath) {
    var s = cleanString(appLocalDataPath);
    if (s.indexOf(ARCHIVE_ROOT_PREFIX) !== 0) {
      throw new Error('assetCas: path is not under the archive root: ' + s);
    }
    return s.slice(ARCHIVE_ROOT_PREFIX.length);
  }

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
  async function fsReadFile(path) {
    var invoke = invokeOrThrow();
    return decodeToBytes(await invoke('plugin:fs|read_file', { path: path, options: fsOptions() }));
  }

  /* ── Durable commit ───────────────────────────────────────────────── */
  /* Blob bytes are committed through the app-owned durable writer rather than
   * plugin:fs, which performs no fsync: it stages in the destination directory,
   * syncs the contents, atomically promotes, then syncs the parent directory.
   * Bytes travel as the request BODY with options in request HEADERS, the same
   * marshaling tauri-plugin-fs v2 requires (a JSON object form would be read as
   * a missing path). `existing` is 'fail' for a first write and 'replace' only
   * for a verified repair of a corrupt content-addressed object. */
  async function durableWrite(path, u8, existing) {
    var invoke = invokeOrThrow();
    var options = { path: archiveRelativeOf(path), existing: existing };
    var result = await invoke(DURABLE_WRITE_COMMAND, u8, {
      headers: { options: encodeURIComponent(JSON.stringify(options)) },
    });
    return safeObject(result);
  }
  function blockerCodes(result) {
    var out = [];
    var list = result && Array.isArray(result.blockers) ? result.blockers : [];
    for (var i = 0; i < list.length; i += 1) {
      var code = cleanString(list[i] && list[i].code);
      if (code) out.push(code);
    }
    return out;
  }

  /* ── Verification ─────────────────────────────────────────────────── */
  /* Reads the object standing at `path` and proves it is exactly the content
   * its own name claims. Length is checked before hashing so a truncated blob
   * is rejected without hashing a partial read. */
  async function verifyBlobAt(path, expectedHex, expectedLength) {
    state.verifyCount += 1;
    var bytes = await fsReadFile(path);
    if (!bytes || bytes.length !== expectedLength) return false;
    return (await sha256HexOf(bytes)) === expectedHex;
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
      if (await fsExists(path)) {
        /* A pathname is not evidence. Trust the destination only after its
         * bytes hash to the name it is stored under. */
        if (await verifyBlobAt(path, hex, u8.length)) return dedupeResult(descriptor);
        return await repairBlob(descriptor, path, hex, u8);
      }

      await fsMkdirRecursive(shardDirForHex(hex));
      var write = await durableWrite(path, u8, 'fail');
      if (!write.ok) {
        var codes = blockerCodes(write);
        /* Another writer committed between the existence probe and the write.
         * The winner is authoritative only if it too verifies. */
        if (codes.indexOf(DESTINATION_EXISTS_BLOCKER) >= 0) {
          if (await verifyBlobAt(path, hex, u8.length)) return dedupeResult(descriptor);
          return await repairBlob(descriptor, path, hex, u8);
        }
        throw new Error('putAssetBytes: durable write refused for ' + sha256 + ' (' + (codes.join(',') || 'unknown') + ')');
      }
      /* Re-read the committed object so success means verified-on-disk. */
      if (!(await verifyBlobAt(path, hex, u8.length))) {
        state.mismatchCount += 1;
        state.lastMismatchAt = Date.now();
        throw new Error('putAssetBytes: committed CAS object failed verification: ' + sha256);
      }
      state.writeCount += 1;
      state.lastPutAt = Date.now();
      return Object.assign(descriptor, { deduped: false, wrote: true, verified: true, repaired: false });
    } catch (e) { recordError('putAssetBytes', e); throw e; }
  }

  function dedupeResult(descriptor) {
    state.dedupeCount += 1;
    state.lastPutAt = Date.now();
    return Object.assign(descriptor, { deduped: true, wrote: false, verified: true, repaired: false });
  }

  /* Replaces a content-addressed object whose bytes do not match its own name.
   * Safe by construction: the destination filename is the SHA-256 of the bytes
   * being written, so this can only move the object from wrong to right. */
  async function repairBlob(descriptor, path, hex, u8) {
    state.mismatchCount += 1;
    state.lastMismatchAt = Date.now();
    var repair = await durableWrite(path, u8, 'replace');
    if (!repair.ok) {
      throw new Error('putAssetBytes: corrupt CAS object could not be repaired: ' + descriptor.sha256 + ' (' + (blockerCodes(repair).join(',') || 'unknown') + ')');
    }
    if (!(await verifyBlobAt(path, hex, u8.length))) {
      throw new Error('putAssetBytes: repaired CAS object failed verification: ' + descriptor.sha256);
    }
    state.repairCount += 1;
    state.writeCount += 1;
    state.lastPutAt = Date.now();
    return Object.assign(descriptor, { deduped: false, wrote: true, verified: true, repaired: true });
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

  /* Verified read. Absent stays null (indistinguishable from "no such asset"),
   * but a blob whose bytes contradict its own name THROWS rather than quietly
   * returning null — a corrupt object must never read as a missing one. */
  async function readVerifiedAssetBytes(sha256Input) {
    var hex = normalizeHex(sha256Input);
    if (!hex) return null;
    var path = blobPathForHex(hex);
    var bytes;
    try {
      if (!(await fsExists(path))) return null;
      state.readCount += 1;
      bytes = await fsReadFile(path);
      state.verifyCount += 1;
    } catch (e) { recordError('readVerifiedAssetBytes', e); return null; }
    if (!bytes || (await sha256HexOf(bytes)) !== hex) {
      state.mismatchCount += 1;
      state.lastMismatchAt = Date.now();
      var mismatch = new Error('readVerifiedAssetBytes: CAS object failed verification: sha256-' + hex);
      recordError('readVerifiedAssetBytes', mismatch);
      throw mismatch;
    }
    return bytes;
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
      durableWrites: true,
      trustsPathExistence: false,
      putCount: state.putCount,
      writeCount: state.writeCount,
      dedupeCount: state.dedupeCount,
      readCount: state.readCount,
      verifyCount: state.verifyCount,
      mismatchCount: state.mismatchCount,
      repairCount: state.repairCount,
      lastPutAt: state.lastPutAt,
      lastMismatchAt: state.lastMismatchAt,
      lastError: state.lastError,
    };
  }

  H2O.Studio.ingestion = Object.assign({}, H2O.Studio.ingestion, {
    assetCas: {
      __installed: true,
      __version: MODULE_VERSION,
      putAssetBytes: putAssetBytes,
      getAssetBytes: getAssetBytes,
      readVerifiedAssetBytes: readVerifiedAssetBytes,
      exists: exists,
      describe: describe,
      diagnoseAssetCas: diagnoseAssetCas,
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
