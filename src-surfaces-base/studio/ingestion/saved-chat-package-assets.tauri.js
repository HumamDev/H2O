/* H2O Studio — Saved Chat Package Asset Materializer (Desktop / Tauri)
 *
 * Chat Saving Architecture Phase C C4.1. Extracts inline `data:image/*` assets
 * from a projected snapshot's sanitized HTML, sends the bytes to a (mockable)
 * content-addressed store and the descriptors to a (mockable) registry adapter,
 * links each asset to its turn, rewrites the HTML refs to package-relative
 * paths, and returns a transformed snapshot copy plus deduped asset descriptors.
 *
 * ORCHESTRATION ONLY. This helper coordinates the CAS and the registry; it
 * reimplements neither and touches the filesystem itself not at all:
 *   - it calls `assetCas.putAssetBytes(...)` (CAS stays registry-free),
 *   - it calls `assetStore.upsert(...)` / `assetStore.linkToTurn(...)`
 *     (registry stays filesystem-free).
 * Dependencies are INJECTED (`{ assetCas, assetStore }`) so this is unit-testable
 * headlessly with mocks.
 *
 * C4.1 boundaries — this slice does NOT:
 *   - wire into the package projector (`buildSavedChatPackageV1`) — that is C4.2,
 *   - write any package files / call `write_file` — that is C4.3,
 *   - compute `contentHash` v2 — that is C4.2,
 *   - fetch remote URLs, handle PDFs/files, or capture generated files,
 *   - touch UI, sync, import/recovery, or WebDAV/cloud.
 *
 * Layouts (locked in ADR-0010 C3.0/C4.0): the live CAS path is extension-less
 * and sharded (owned by the CAS module); the PACKAGE-relative path this helper
 * emits is flat with an extension: `assets/sha256-<hex>.<ext>`.
 *
 * Public API (H2O.Studio.ingestion.savedChatPackageAssets):
 *   materializeInlineImageAssetsV2({ snapshotJson, assetCas, assetStore, source? })
 *   extractInlineDataImageAssetsV2(html) -> [{ uri, mimeType, ext, base64 }]
 *   decodeDataImageUriV2(uri)            -> { mimeType, ext, bytes } | null
 *   mimeToExtV2(mimeType)                -> 'png'|'jpg'|'gif'|'webp'|''
 *   rewriteInlineImageRefsV2(html, replacements) -> string
 *   diagnoseSavedChatPackageAssetsV2()   -> status
 *
 * Contracts: docs/decisions/ADR-0010-saved-chat-asset-cas.md (C4.0)
 *            docs/systems/archive/saved-chat-package-format.md
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
  if (H2O.Studio.ingestion.savedChatPackageAssets && H2O.Studio.ingestion.savedChatPackageAssets.__installed) return;

  var MODULE_VERSION = '0.1.0-phase-c-c4.1';
  var DEFAULT_SOURCE = 'chatgpt-capture';

  /* Supported inline image data URIs only. <aa> note: package path is flat. */
  var MIME_TO_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
  /* Capture group 1 = subtype, group 2 = base64 payload. */
  var DATA_IMAGE_RE = /data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=]+)/gi;
  var DATA_IMAGE_ONE_RE = /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=]+)$/i;

  function cleanString(v) { return String(v == null ? '' : v).trim(); }
  function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }
  function asArray(v) { return Array.isArray(v) ? v : []; }

  function normalizeSubtype(subtypeRaw) {
    var subtype = cleanString(subtypeRaw).toLowerCase();
    return subtype === 'jpg' ? 'jpeg' : subtype;
  }
  function mimeToExtV2(mimeType) {
    return MIME_TO_EXT[cleanString(mimeType).toLowerCase()] || '';
  }

  function base64ToBytes(b64) {
    var clean = String(b64 == null ? '' : b64);
    if (typeof global.atob === 'function' || typeof atob === 'function') {
      var dec = (typeof global.atob === 'function' ? global.atob : atob)(clean);
      var out = new Uint8Array(dec.length);
      for (var i = 0; i < dec.length; i += 1) out[i] = dec.charCodeAt(i) & 0xff;
      return out;
    }
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(clean, 'base64'));
    throw new Error('no base64 decoder available');
  }

  /* Parse a single full data URI string → { mimeType, ext, bytes } | null. */
  function decodeDataImageUriV2(uri) {
    var m = DATA_IMAGE_ONE_RE.exec(cleanString(uri));
    if (!m) return null;
    var mimeType = 'image/' + normalizeSubtype(m[1]);
    var ext = mimeToExtV2(mimeType);
    if (!ext) return null;
    var bytes;
    try { bytes = base64ToBytes(m[2]); }
    catch (_) { return null; }
    if (!bytes || bytes.length === 0) return null;
    return { mimeType: mimeType, ext: ext, bytes: bytes };
  }

  /* Find all supported inline image data URIs in an HTML string. */
  function extractInlineDataImageAssetsV2(html) {
    var text = cleanString(html);
    if (!text) return [];
    var out = [];
    var re = new RegExp(DATA_IMAGE_RE.source, 'gi');
    var m;
    while ((m = re.exec(text)) !== null) {
      var mimeType = 'image/' + normalizeSubtype(m[1]);
      var ext = mimeToExtV2(mimeType);
      if (!ext) continue;
      out.push({ uri: m[0], mimeType: mimeType, ext: ext, base64: m[2] });
    }
    return out;
  }

  /* Literal (non-regex) replacement of each data URI with its package path.
   * Only the supplied (supported) URIs are rewritten; remote/unsupported URIs
   * are untouched because they are never in `replacements`. */
  function rewriteInlineImageRefsV2(html, replacements) {
    var text = (typeof html === 'string') ? html : '';
    if (!text || !replacements) return text;
    var pairs = Array.isArray(replacements)
      ? replacements
      : Object.keys(replacements).map(function (uri) { return { uri: uri, path: replacements[uri] }; });
    for (var i = 0; i < pairs.length; i += 1) {
      var uri = pairs[i] && pairs[i].uri;
      var path = pairs[i] && pairs[i].path;
      if (!uri || !path) continue;
      text = text.split(uri).join(path);
    }
    return text;
  }

  function turnIndexOf(message, fallbackIndex) {
    if (isFiniteNumber(message && message.turnIdx)) return Math.floor(message.turnIdx);
    if (isFiniteNumber(message && message.turnIndex)) return Math.floor(message.turnIndex);
    return fallbackIndex;
  }

  function packagePathFor(sha256, ext) {
    return 'assets/' + sha256 + (ext ? '.' + ext : '');
  }

  function deepCloneJson(value) {
    return JSON.parse(JSON.stringify(value == null ? null : value));
  }

  /* Main entry. Returns a transformed COPY; the input object is never mutated. */
  async function materializeInlineImageAssetsV2(input) {
    var opts = (input && typeof input === 'object') ? input : {};
    var assetCas = opts.assetCas;
    var assetStore = opts.assetStore;
    if (!assetCas || typeof assetCas.putAssetBytes !== 'function') {
      throw new Error('materializeInlineImageAssetsV2: assetCas.putAssetBytes is required');
    }
    if (!assetStore || typeof assetStore.upsert !== 'function' || typeof assetStore.linkToTurn !== 'function') {
      throw new Error('materializeInlineImageAssetsV2: assetStore.upsert/linkToTurn are required');
    }
    var source = cleanString(opts.source) || DEFAULT_SOURCE;
    var snapshotJson = deepCloneJson(opts.snapshotJson); /* never mutate caller's object */
    if (!snapshotJson || typeof snapshotJson !== 'object') {
      return { snapshotJson: snapshotJson, manifestAssets: [], changed: false, extractedCount: 0, uniqueAssetCount: 0, replacements: [] };
    }
    var snapshotId = cleanString(snapshotJson.snapshotId);
    var messages = asArray(snapshotJson.messages);

    var manifestBySha = Object.create(null);   /* sha256 → descriptor (dedup) */
    var allReplacements = [];                   /* { messageId, turnIdx, uri, path, sha256 } */
    var extractedCount = 0;

    for (var mi = 0; mi < messages.length; mi += 1) {
      var message = messages[mi];
      if (!message || typeof message !== 'object') continue;
      var turnIdx = turnIndexOf(message, mi);
      var sourceMessageId = cleanString(message.id);

      /* Collect candidate HTML from contentHtml + any content[] html entries. */
      var htmlSources = [];
      if (typeof message.contentHtml === 'string' && message.contentHtml) htmlSources.push(message.contentHtml);
      asArray(message.content).forEach(function (entry) {
        if (entry && entry.type === 'html' && typeof entry.html === 'string' && entry.html) htmlSources.push(entry.html);
      });
      if (!htmlSources.length) continue;

      /* Unique data URIs in this message. */
      var uriOrder = [];
      var uriSeen = Object.create(null);
      htmlSources.forEach(function (html) {
        extractInlineDataImageAssetsV2(html).forEach(function (hit) {
          if (!uriSeen[hit.uri]) { uriSeen[hit.uri] = true; uriOrder.push(hit.uri); }
        });
      });
      if (!uriOrder.length) continue;

      var messageReplacements = [];
      var messageRefs = Array.isArray(message.assetRefs) ? message.assetRefs.slice() : [];
      var messageRefSeen = Object.create(null);
      messageRefs.forEach(function (r) { messageRefSeen[cleanString(r)] = true; });

      for (var ui = 0; ui < uriOrder.length; ui += 1) {
        var uri = uriOrder[ui];
        var decoded = decodeDataImageUriV2(uri);
        if (!decoded) continue; /* unsupported / undecodable → leave inline */
        extractedCount += 1;

        /* 1) CAS (bytes) → 2) registry row → 3) link to turn. */
        var desc = await assetCas.putAssetBytes({
          bytes: decoded.bytes,
          mimeType: decoded.mimeType,
          ext: decoded.ext,
          source: source,
          meta: { sourceMessageId: sourceMessageId },
        });
        var sha256 = cleanString(desc && desc.sha256);
        if (!sha256) continue;
        var ext = cleanString(desc && desc.ext) || decoded.ext;
        var mimeType = cleanString(desc && desc.mimeType) || decoded.mimeType;
        var byteLength = (desc && typeof desc.byteLength === 'number') ? desc.byteLength : decoded.bytes.length;
        var pkgPath = packagePathFor(sha256, ext);

        await assetStore.upsert({ sha256: sha256, mimeType: mimeType, ext: ext, byteSize: byteLength, meta: {} });
        await assetStore.linkToTurn({ snapshotId: snapshotId, turnIdx: turnIdx, sha256: sha256, relation: 'inline', meta: { sourceMessageId: sourceMessageId } });

        messageReplacements.push({ uri: uri, path: pkgPath });
        allReplacements.push({ messageId: sourceMessageId, turnIdx: turnIdx, uri: uri, path: pkgPath, sha256: sha256 });

        if (!messageRefSeen[sha256]) { messageRefSeen[sha256] = true; messageRefs.push(sha256); }

        if (!manifestBySha[sha256]) {
          manifestBySha[sha256] = {
            sha256: sha256,
            path: pkgPath,
            mimeType: mimeType,
            ext: ext,
            byteLength: byteLength,
            source: source,
            sourceMessageId: sourceMessageId,
            turnRef: turnIdx,
          };
        }
      }

      /* Rewrite the message's HTML (contentHtml + content[].html) in place on the copy. */
      if (messageReplacements.length) {
        if (typeof message.contentHtml === 'string') {
          message.contentHtml = rewriteInlineImageRefsV2(message.contentHtml, messageReplacements);
        }
        asArray(message.content).forEach(function (entry) {
          if (entry && entry.type === 'html' && typeof entry.html === 'string') {
            entry.html = rewriteInlineImageRefsV2(entry.html, messageReplacements);
          }
        });
        message.assetRefs = messageRefs;
      }
    }

    var manifestAssets = Object.keys(manifestBySha)
      .sort()
      .map(function (sha) { return manifestBySha[sha]; });

    return {
      snapshotJson: snapshotJson,
      manifestAssets: manifestAssets,
      changed: extractedCount > 0,
      extractedCount: extractedCount,
      uniqueAssetCount: manifestAssets.length,
      replacements: allReplacements,
    };
  }

  function diagnoseSavedChatPackageAssetsV2() {
    return {
      installed: true,
      version: MODULE_VERSION,
      orchestratesInjected: ['assetCas.putAssetBytes', 'assetStore.upsert', 'assetStore.linkToTurn'],
      supportedMimeTypes: Object.keys(MIME_TO_EXT),
      packagePathPattern: 'assets/sha256-<hex>.<ext>',
      writesFiles: false,
      fetchesRemote: false,
      contentHashV2: false,
      registryCoupled: false,
      casCoupled: false,
    };
  }

  H2O.Studio.ingestion = Object.assign({}, H2O.Studio.ingestion, {
    savedChatPackageAssets: {
      __installed: true,
      __version: MODULE_VERSION,
      materializeInlineImageAssetsV2: materializeInlineImageAssetsV2,
      extractInlineDataImageAssetsV2: extractInlineDataImageAssetsV2,
      decodeDataImageUriV2: decodeDataImageUriV2,
      mimeToExtV2: mimeToExtV2,
      rewriteInlineImageRefsV2: rewriteInlineImageRefsV2,
      diagnoseSavedChatPackageAssetsV2: diagnoseSavedChatPackageAssetsV2,
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
