/* H2O Studio Saved Chat Package v1 (Desktop / Tauri)
 *
 * Desktop-only projector for ADR-0009 saved-chat packages. It reads through
 * public H2O.Studio.store adapters, builds deterministic preservation
 * projections, and optionally writes the package files to an explicit target
 * folder. It never mutates SQLite, never installs watchers, and never imports
 * packages back into the live store.
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

  var MANIFEST_SCHEMA = 'h2o.savedChatPackage';
  var SNAPSHOT_SCHEMA = 'h2o.savedChatSnapshot';
  var SCHEMA_VERSION = 1;
  var RENDERER_VERSION = 'saved-chat-package-v1';
  var MODULE_VERSION = '0.1.0-phase-b';

  var state = {
    installedAt: Date.now(),
    lastBuildAt: null,
    lastWriteAt: null,
    lastPackage: null,
    lastError: null,
  };

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }

  function safeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function numberOrZero(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function epochToIso(value) {
    if (typeof value === 'string' && value.trim()) {
      var parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
      return value.trim();
    }
    var n = numberOrZero(value);
    if (n > 0) {
      try { return new Date(n).toISOString(); }
      catch (_) { return ''; }
    }
    return '';
  }

  function firstString() {
    for (var i = 0; i < arguments.length; i += 1) {
      var value = arguments[i];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (value != null && typeof value !== 'object') {
        var text = String(value).trim();
        if (text) return text;
      }
    }
    return '';
  }

  function uniqStrings(values) {
    var seen = Object.create(null);
    var out = [];
    asArray(values).forEach(function (value) {
      var text = cleanString(value);
      if (!text || seen[text]) return;
      seen[text] = true;
      out.push(text);
    });
    return out;
  }

  function normalizeBoolean(value, fallback) {
    if (value === true || value === false) return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      var text = value.trim().toLowerCase();
      if (text === 'true' || text === '1' || text === 'yes') return true;
      if (text === 'false' || text === '0' || text === 'no') return false;
    }
    return !!fallback;
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

  function getTextEncoder() {
    if (typeof global.TextEncoder === 'function') return new global.TextEncoder();
    if (typeof TextEncoder === 'function') return new TextEncoder();
    throw new Error('TextEncoder unavailable');
  }

  function bytesFor(textOrBytes) {
    if (textOrBytes instanceof Uint8Array) return textOrBytes;
    if (typeof ArrayBuffer !== 'undefined' && textOrBytes instanceof ArrayBuffer) {
      return new Uint8Array(textOrBytes);
    }
    if (textOrBytes && typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(textOrBytes)) {
      return new Uint8Array(textOrBytes.buffer, textOrBytes.byteOffset, textOrBytes.byteLength);
    }
    return getTextEncoder().encode(String(textOrBytes == null ? '' : textOrBytes));
  }

  function byteLength(text) {
    return bytesFor(String(text == null ? '' : text)).byteLength;
  }

  function bytesToHex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i += 1) {
      var part = bytes[i].toString(16);
      out += part.length === 1 ? '0' + part : part;
    }
    return out;
  }

  async function sha256Hex(textOrBytes) {
    var cryptoObj = global.crypto || {};
    if (!cryptoObj.subtle || typeof cryptoObj.subtle.digest !== 'function') {
      throw new Error('WebCrypto SHA-256 unavailable');
    }
    var buffer = await cryptoObj.subtle.digest('SHA-256', bytesFor(textOrBytes));
    return bytesToHex(new Uint8Array(buffer));
  }

  async function sha256Prefixed(textOrBytes) {
    return 'sha256-' + await sha256Hex(textOrBytes);
  }

  /* HTML sanitization is centralized in the shared, surface-neutral module
   * H2O.Studio.html.sanitize (platform/html-sanitizer.js) as of Phase C C3.1.
   * These thin wrappers delegate to it; behavior is equivalent to the Phase B
   * inline helpers this replaces. Fail closed if the module is absent so the
   * projector never emits unsanitized HTML (load order: html-sanitizer.js must
   * load before this file — enforced in studio.html and pack-studio.mjs). */
  function htmlSanitizer() {
    var api = H2O.Studio && H2O.Studio.html && H2O.Studio.html.sanitize;
    if (!api || typeof api.sanitizeHtml !== 'function') {
      throw new Error('H2O.Studio.html.sanitize is required; load platform/html-sanitizer.js before ingestion/saved-chat-package-v1.tauri.js');
    }
    return api;
  }
  function escapeHtml(value) { return htmlSanitizer().escapeHtml(value); }
  function sanitizeHtmlV1(value) { return htmlSanitizer().sanitizeHtml(value); }
  function extractTextFromHtml(value) { return htmlSanitizer().extractTextFromHtml(value); }

  function getTurnMeta(turn) {
    return safeObject(turn && turn.meta);
  }

  function normalizeContentHtmlV1(turn) {
    var meta = getTurnMeta(turn);
    var raw = firstString(
      turn && turn.contentHtml,
      turn && turn.outerHtml,
      turn && turn.outerHTML,
      turn && turn.outer_html,
      turn && turn.html,
      meta.contentHtml,
      meta.outerHtml,
      meta.outerHTML,
      meta.outer_html
    );
    return raw ? sanitizeHtmlV1(raw) : '';
  }

  function normalizeRole(value) {
    var role = cleanString(value || 'unknown').toLowerCase();
    if (role === 'user' || role === 'assistant' || role === 'system' || role === 'tool') return role;
    return 'unknown';
  }

  function metadataWithoutHtmlFields(metaRaw) {
    var meta = safeObject(metaRaw);
    var out = {};
    Object.keys(meta).sort().forEach(function (key) {
      if (key === 'contentHtml' || key === 'outerHtml' || key === 'outerHTML' || key === 'outer_html' || key === 'html') return;
      if (typeof meta[key] !== 'undefined') out[key] = meta[key];
    });
    return out;
  }

  function normalizeSavedChatMessageV1(turn, index) {
    var src = safeObject(turn);
    var meta = getTurnMeta(src);
    var turnIndex = isFiniteNumber(src.turnIdx) ? Math.floor(src.turnIdx)
      : isFiniteNumber(src.turnIndex) ? Math.floor(src.turnIndex)
        : index;
    var contentHtml = normalizeContentHtmlV1(src);
    var contentText = firstString(src.contentText, src.text);
    if (!contentText && contentHtml) contentText = extractTextFromHtml(contentHtml);
    var id = firstString(src.messageId, src.id, meta.messageId, meta.id) || ('turn-' + String(turnIndex));
    var createdAtRaw = typeof src.createdAt !== 'undefined' ? src.createdAt
      : typeof src.createTime !== 'undefined' ? src.createTime
        : typeof meta.createdAt !== 'undefined' ? meta.createdAt
          : meta.createTime;
    var createdAt = epochToIso(createdAtRaw);
    var message = {
      id: id,
      role: normalizeRole(src.role || meta.role),
      author: firstString(src.author, meta.author),
      createdAt: createdAt,
      turnIndex: turnIndex,
      parentId: firstString(src.parentId, meta.parentId),
      contentText: contentText || '',
      content: [{ type: 'text', text: contentText || '' }],
      assetRefs: [],
      metadata: metadataWithoutHtmlFields(meta),
    };
    if (contentHtml) {
      message.contentHtml = contentHtml;
      message.content.push({ type: 'html', html: contentHtml, sanitized: true });
    }
    return message;
  }

  function compareMessages(a, b) {
    var av = isFiniteNumber(a && a.turnIndex) ? a.turnIndex : 0;
    var bv = isFiniteNumber(b && b.turnIndex) ? b.turnIndex : 0;
    if (av !== bv) return av - bv;
    return cleanString(a && a.id).localeCompare(cleanString(b && b.id));
  }

  function parseHostFromHref(href) {
    var text = cleanString(href);
    if (!text) return '';
    try { return new URL(text).host; }
    catch (_) { return ''; }
  }

  function getSourceHref(chat, snapshotMeta) {
    return firstString(
      chat && chat.sourceHref,
      chat && chat.href,
      chat && chat.normalizedHref,
      chat && chat.linkSourceHref,
      snapshotMeta && snapshotMeta.sourceHref,
      snapshotMeta && snapshotMeta.sourceUrl,
      snapshotMeta && snapshotMeta.href
    );
  }

  function getNativeConversationId(chat, snapshotMeta) {
    return firstString(
      chat && chat.nativeConversationId,
      chat && chat.externalId,
      snapshotMeta && snapshotMeta.nativeConversationId,
      snapshotMeta && snapshotMeta.chatgptId
    );
  }

  function projectSource(chat, snapshotMeta) {
    var sourceHref = getSourceHref(chat, snapshotMeta);
    return {
      host: firstString(snapshotMeta && snapshotMeta.host, chat && chat.host, parseHostFromHref(sourceHref)),
      nativeConversationId: getNativeConversationId(chat, snapshotMeta),
      sourceHref: sourceHref,
      accountHint: firstString(snapshotMeta && snapshotMeta.accountHint, chat && chat.accountHint),
    };
  }

  function rowId(row, primaryField) {
    return cleanString(row && (row[primaryField] || row.id));
  }

  function relatedIds(rows, primaryField) {
    return uniqStrings(asArray(rows).map(function (row) { return row && (row[primaryField] || row.id); }));
  }

  function projectLibrary(chat, snapshot, related, source) {
    var chatState = safeObject(chat && chat.state);
    var meta = safeObject(snapshot && snapshot.meta);
    var folderId = rowId(related && related.folder, 'folderId')
      || firstString(meta.folderIdAtCapture, meta.folderId, chat && chat.folderId);
    var categoryId = rowId(related && related.category, 'categoryId')
      || firstString(meta.categoryIdAtCapture, meta.categoryId, chat && chat.categoryId);
    var projectId = firstString(meta.projectIdAtCapture, meta.projectId, chat && chat.projectId);
    var labelIds = relatedIds(related && related.labels, 'labelId');
    if (!labelIds.length) labelIds = uniqStrings(asArray(meta.labelIdsAtCapture || meta.labelIds || chat && chat.labelIds));
    var tagIds = relatedIds(related && related.tags, 'tagId');
    if (!tagIds.length) tagIds = uniqStrings(asArray(meta.tagIdsAtCapture || meta.tagIds || chat && chat.tagIds));
    var linkedExplicit = (typeof chatState.isLinked !== 'undefined') ? chatState.isLinked : chat && chat.isLinked;
    var savedExplicit = (typeof chatState.isSaved !== 'undefined') ? chatState.isSaved : chat && chat.isSaved;
    return {
      isLinked: normalizeBoolean(linkedExplicit, !!(source && source.nativeConversationId)),
      isSaved: normalizeBoolean(savedExplicit, true),
      folderIdAtCapture: folderId,
      categoryIdAtCapture: categoryId,
      projectIdAtCapture: projectId,
      labelIdsAtCapture: labelIds,
      tagIdsAtCapture: tagIds,
      linkSourceHref: firstString(chat && chat.linkSourceHref, source && source.sourceHref),
    };
  }

  function projectSnapshotJsonV1(input) {
    var src = safeObject(input);
    var chat = safeObject(src.chat);
    var snapshot = safeObject(src.snapshot);
    var related = safeObject(src.related);
    var meta = safeObject(snapshot.meta);
    var chatId = firstString(snapshot.chatId, chat.chatId, chat.id, src.chatId);
    var snapshotId = firstString(snapshot.snapshotId, snapshot.id, src.snapshotId);
    if (!chatId) throw new Error('chatId is required for saved chat package snapshot');
    if (!snapshotId) throw new Error('snapshotId is required for saved chat package snapshot');
    var source = projectSource(chat, meta);
    /* Determinism: capturedAt/savedAt are part of the canonical, content-hashed
     * snapshot.json. They must come only from stored snapshot/chat/meta values,
     * never from the live wall clock (nowIso). Absent → '' so two machines
     * projecting the same store snapshot produce identical bytes/contentHash. */
    var capturedAt = epochToIso(snapshot.capturedAt) || firstString(meta.capturedAt) || '';
    var savedAt = epochToIso(snapshot.updatedAt) || epochToIso(chat.updatedAt) || firstString(meta.savedAt, meta.updatedAt) || capturedAt;
    var messages = asArray(src.turns).map(function (turn, index) {
      return normalizeSavedChatMessageV1(turn || {}, index);
    }).sort(compareMessages);
    return {
      schema: SNAPSHOT_SCHEMA,
      schemaVersion: SCHEMA_VERSION,
      chatId: chatId,
      snapshotId: snapshotId,
      capturedAt: capturedAt,
      savedAt: savedAt,
      title: firstString(snapshot.title, meta.title, chat.title, chatId) || chatId,
      source: source,
      library: projectLibrary(chat, snapshot, related, source),
      messages: messages,
      metadata: {
        captureSurface: firstString(meta.captureSurface, 'desktop'),
        captureAdapter: firstString(meta.captureAdapter, RENDERER_VERSION),
        model: firstString(meta.model),
        /* Determinism: locale/timezone are part of the canonical, content-hashed
         * snapshot.json. Use only stored capture values — never the live
         * environment (navigator.language / Intl timezone) — so the same store
         * snapshot hashes identically on any machine. */
        locale: firstString(meta.locale),
        timezone: firstString(meta.timezone),
        digest: firstString(snapshot.digest),
        messageCount: Number(snapshot.messageCount || messages.length || 0),
      },
    };
  }

  function getManifestInfo() {
    try {
      if (global.chrome && global.chrome.runtime && typeof global.chrome.runtime.getManifest === 'function') {
        var manifest = global.chrome.runtime.getManifest() || {};
        return {
          id: firstString(global.chrome.runtime.id, 'desktop-tauri'),
          name: firstString(manifest.name, 'H2O Studio'),
          version: firstString(manifest.version),
        };
      }
    } catch (_) { /* ignore */ }
    return { id: 'desktop-tauri', name: 'H2O Studio', version: '' };
  }

  function buildManifestJsonV1(input) {
    var src = safeObject(input);
    var snapshotJson = safeObject(src.snapshotJson);
    var files = safeObject(src.files);
    var provenance = safeObject(src.provenance);
    var generatedAt = firstString(provenance.generatedAt, nowIso());
    var manifestInfo = getManifestInfo();
    var contentHash = firstString(files && files.snapshot && files.snapshot.sha256);
    if (!contentHash) throw new Error('files.snapshot.sha256 is required for manifest');
    return {
      schema: MANIFEST_SCHEMA,
      schemaVersion: SCHEMA_VERSION,
      packageId: firstString(provenance.packageId, 'pkg_' + snapshotJson.snapshotId + '_' + contentHash.slice(7, 19)),
      chatId: firstString(snapshotJson.chatId),
      snapshotId: firstString(snapshotJson.snapshotId),
      createdAt: firstString(provenance.createdAt, snapshotJson.savedAt, generatedAt),
      generatedAt: generatedAt,
      generator: {
        surface: 'desktop',
        app: 'H2O Studio',
        appVersion: manifestInfo.version,
        buildId: firstString(manifestInfo.id),
        rendererVersion: RENDERER_VERSION,
      },
      source: safeObject(snapshotJson.source),
      store: {
        authority: 'desktop-sqlite-store',
        adapter: 'H2O.Studio.store',
        storeSchemaVersion: firstString(provenance.storeSchemaVersion),
        recordVersion: firstString(provenance.recordVersion),
        exportedFrom: 'desktop',
      },
      files: files,
      assets: [],
      contentHash: contentHash,
      provenance: {
        createdBy: firstString(provenance.createdBy, 'save-to-folder'),
        sourceOfTruth: 'desktop-sqlite-store',
        projectionOnly: true,
      },
    };
  }

  function markdownRole(role) {
    var text = normalizeRole(role);
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function renderChatMarkdownV1(snapshotJson) {
    var snap = safeObject(snapshotJson);
    var lines = [];
    lines.push('# ' + (firstString(snap.title, snap.chatId) || 'Saved Chat'));
    lines.push('');
    lines.push('- Studio chat id: `' + firstString(snap.chatId) + '`');
    lines.push('- Snapshot id: `' + firstString(snap.snapshotId) + '`');
    lines.push('- Captured: `' + firstString(snap.capturedAt) + '`');
    var href = firstString(snap.source && snap.source.sourceHref);
    if (href) lines.push('- Source: ' + href);
    lines.push('');
    asArray(snap.messages).forEach(function (message) {
      lines.push('## ' + markdownRole(message && message.role) + ' ' + String(Number(message && message.turnIndex) || 0));
      lines.push('');
      lines.push(String((message && message.contentText) || '').trim());
      lines.push('');
    });
    return lines.join('\n').replace(/\n{4,}/g, '\n\n\n');
  }

  function renderChatHtmlV1(snapshotJson) {
    var snap = safeObject(snapshotJson);
    var title = firstString(snap.title, snap.chatId) || 'Saved Chat';
    var parts = [];
    parts.push('<!doctype html>');
    parts.push('<html lang="en">');
    parts.push('<head>');
    parts.push('<meta charset="utf-8">');
    /* Defense-in-depth for the derived renderer: even if the regex sanitizer
     * misses a vector, this static CSP blocks scripts/objects/frames/forms and
     * confines the document. Inline <style> below requires style-src inline;
     * images allowed from data:/file:/https: only. No script source is allowed. */
    parts.push('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: file: https:; style-src \'unsafe-inline\'; font-src data:; base-uri \'none\'; form-action \'none\'; frame-src \'none\'; object-src \'none\'">');
    parts.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
    parts.push('<title>' + escapeHtml(title) + '</title>');
    parts.push('<style>');
    parts.push('body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:2rem;line-height:1.5;color:#171717;background:#fff;}');
    parts.push('main{max-width:860px;margin:0 auto;}');
    parts.push('.meta{color:#666;font-size:.9rem;margin-bottom:1.5rem;}');
    parts.push('.msg{border-top:1px solid #ddd;padding:1rem 0;}');
    parts.push('.role{font-weight:700;margin-bottom:.5rem;}');
    parts.push('pre{white-space:pre-wrap;font:inherit;}');
    parts.push('</style>');
    parts.push('</head>');
    parts.push('<body>');
    parts.push('<main>');
    parts.push('<h1>' + escapeHtml(title) + '</h1>');
    parts.push('<div class="meta">Studio chat id: ' + escapeHtml(snap.chatId)
      + '<br>Snapshot id: ' + escapeHtml(snap.snapshotId)
      + '<br>Captured: ' + escapeHtml(snap.capturedAt) + '</div>');
    asArray(snap.messages).forEach(function (message) {
      var role = markdownRole(message && message.role);
      var html = firstString(message && message.contentHtml);
      var body = html || '<pre>' + escapeHtml(message && message.contentText) + '</pre>';
      parts.push('<section class="msg" data-turn-index="' + escapeHtml(message && message.turnIndex) + '">');
      parts.push('<div class="role">' + escapeHtml(role) + '</div>');
      parts.push('<div class="content">' + body + '</div>');
      parts.push('</section>');
    });
    parts.push('</main>');
    parts.push('</body>');
    parts.push('</html>');
    return parts.join('\n');
  }

  function safePackageDirName(chatIdRaw) {
    var chatId = cleanString(chatIdRaw);
    if (!chatId) throw new Error('chatId is required for package directory name');
    if (chatId === '.' || chatId === '..' || /[\/\\]/.test(chatId) || !/^[A-Za-z0-9._-]+$/.test(chatId)) {
      throw new Error('chatId is not a safe package directory basename: ' + chatId);
    }
    return chatId + '.h2ochat';
  }

  function joinPath(base, leaf) {
    var b = cleanString(base).replace(/\/+$/g, '');
    var l = cleanString(leaf).replace(/^\/+/g, '');
    return b ? b + '/' + l : l;
  }

  function fileDescriptor(path, text, hash) {
    return {
      path: path,
      sha256: hash,
      byteLength: byteLength(text),
    };
  }

  function getStores() {
    return (H2O.Studio && H2O.Studio.store) || {};
  }

  async function getStoreRow(store, id) {
    if (!store || typeof store.get !== 'function' || !id) return null;
    try { return await store.get(id); }
    catch (_) { return null; }
  }

  async function listForChat(store, chatId) {
    if (!store || typeof store.listForChat !== 'function' || !chatId) return [];
    try { return asArray(await store.listForChat(chatId)); }
    catch (_) { return []; }
  }

  async function collectRelated(stores, chat) {
    var chatId = firstString(chat && (chat.chatId || chat.id));
    var folderRows = await listForChat(stores.folders, chatId);
    var folder = folderRows[0] || null;
    if (!folder && chat && chat.folderId) folder = await getStoreRow(stores.folders, chat.folderId);
    var category = null;
    if (stores.categories && typeof stores.categories.getForChat === 'function') {
      try { category = await stores.categories.getForChat(chatId); }
      catch (_) { category = null; }
    }
    if (!category && chat && chat.categoryId) category = await getStoreRow(stores.categories, chat.categoryId);
    return {
      folder: folder,
      category: category,
      labels: await listForChat(stores.labels, chatId),
      tags: await listForChat(stores.tags, chatId),
    };
  }

  function sortSnapshotHeadersDesc(a, b) {
    var av = numberOrZero(a && (a.capturedAt || a.updatedAt));
    var bv = numberOrZero(b && (b.capturedAt || b.updatedAt));
    if (av !== bv) return bv - av;
    return cleanString(b && (b.snapshotId || b.id)).localeCompare(cleanString(a && (a.snapshotId || a.id)));
  }

  async function hydrateSnapshot(stores, options) {
    var opts = safeObject(options);
    var snapshots = stores.snapshots || {};
    if (typeof snapshots.get !== 'function') throw new Error('H2O.Studio.store.snapshots.get unavailable');
    var snapshotId = firstString(opts.snapshotId);
    var chatId = firstString(opts.chatId);
    if (!snapshotId) {
      if (!chatId) throw new Error('snapshotId or chatId is required');
      if (typeof snapshots.listByChat !== 'function') throw new Error('H2O.Studio.store.snapshots.listByChat unavailable');
      var headers = asArray(await snapshots.listByChat(chatId)).sort(sortSnapshotHeadersDesc);
      var latest = headers[0] || null;
      snapshotId = firstString(latest && (latest.snapshotId || latest.id));
      if (!snapshotId) throw new Error('no snapshots found for chatId ' + chatId);
    }
    var combined = await snapshots.get(snapshotId);
    if (!combined) throw new Error('snapshot not found: ' + snapshotId);
    if (combined.snapshot) return combined;
    return { snapshot: combined, turns: [] };
  }

  async function buildSavedChatPackageV1(options) {
    var opts = safeObject(options);
    var stores = getStores();
    var combined = await hydrateSnapshot(stores, opts);
    var snapshot = safeObject(combined.snapshot);
    var turns = asArray(combined.turns);
    var chatId = firstString(opts.chatId, snapshot.chatId);
    var chat = chatId ? await getStoreRow(stores.chats, chatId) : null;
    if (!chat) chat = { chatId: chatId || firstString(snapshot.chatId) };
    var related = await collectRelated(stores, chat);
    var generatedAt = nowIso();
    var snapshotJson = projectSnapshotJsonV1({ chat: chat, snapshot: snapshot, turns: turns, related: related });
    var snapshotText = canonicalJson(snapshotJson);
    var markdownText = renderChatMarkdownV1(snapshotJson);
    var htmlText = renderChatHtmlV1(snapshotJson);
    var snapshotHash = await sha256Prefixed(snapshotText);
    var markdownHash = await sha256Prefixed(markdownText);
    var htmlHash = await sha256Prefixed(htmlText);
    var files = {
      snapshot: fileDescriptor('snapshot.json', snapshotText, snapshotHash),
      markdown: Object.assign(fileDescriptor('chat.md', markdownText, markdownHash), { derivedFrom: 'snapshot.json' }),
      html: Object.assign(fileDescriptor('chat.html', htmlText, htmlHash), { derivedFrom: 'snapshot.json' }),
    };
    var manifestJson = buildManifestJsonV1({
      snapshotJson: snapshotJson,
      files: files,
      provenance: Object.assign({}, safeObject(opts.provenance), { generatedAt: generatedAt }),
    });
    var manifestText = JSON.stringify(manifestJson, null, 2) + '\n';
    var expectedPackageDirName = safePackageDirName(snapshotJson.chatId);
    var packageDirName = firstString(opts.packageDirName) || expectedPackageDirName;
    if (packageDirName !== expectedPackageDirName) {
      throw new Error('packageDirName must match chatId basename: ' + expectedPackageDirName);
    }
    var targetDir = firstString(opts.targetDir, opts.targetFolder);
    var packagePath = targetDir ? joinPath(targetDir, packageDirName) : packageDirName;
    var result = {
      ok: true,
      schema: MANIFEST_SCHEMA,
      schemaVersion: SCHEMA_VERSION,
      packageDirName: packageDirName,
      packagePath: packagePath,
      chatId: snapshotJson.chatId,
      snapshotId: snapshotJson.snapshotId,
      contentHash: snapshotHash,
      assets: [],
      manifest: manifestJson,
      snapshot: snapshotJson,
      files: {
        'manifest.json': {
          path: 'manifest.json',
          text: manifestText,
          byteLength: byteLength(manifestText),
          sha256: await sha256Prefixed(manifestText),
        },
        'snapshot.json': {
          path: 'snapshot.json',
          text: snapshotText,
          byteLength: byteLength(snapshotText),
          sha256: snapshotHash,
        },
        'chat.md': {
          path: 'chat.md',
          text: markdownText,
          byteLength: byteLength(markdownText),
          sha256: markdownHash,
          derivedFrom: 'snapshot.json',
        },
        'chat.html': {
          path: 'chat.html',
          text: htmlText,
          byteLength: byteLength(htmlText),
          sha256: htmlHash,
          derivedFrom: 'snapshot.json',
        },
      },
      metadata: {
        generatedAt: generatedAt,
        projectionOnly: true,
        assetsDirectoryRequired: false,
      },
    };
    state.lastBuildAt = generatedAt;
    state.lastPackage = {
      packageDirName: packageDirName,
      chatId: result.chatId,
      snapshotId: result.snapshotId,
      contentHash: result.contentHash,
    };
    return result;
  }

  function getTauriInvoke() {
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

  function getTauriFsFacade() {
    try {
      var tauri = global.__TAURI__;
      if (tauri && tauri.fs) return tauri.fs;
    } catch (_) { /* ignore */ }
    return null;
  }

  function fsOptions(options) {
    var opts = safeObject(options);
    var out = Object.assign({}, safeObject(opts.fsOptions));
    if (typeof opts.baseDir !== 'undefined') out.baseDir = opts.baseDir;
    return out;
  }

  async function fsExists(path, options) {
    var fs = getTauriFsFacade();
    if (fs && typeof fs.exists === 'function') return !!(await fs.exists(path, options || {}));
    var invoke = getTauriInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable for fs exists');
    try { return !!(await invoke('plugin:fs|exists', { path: path, options: options || {} })); }
    catch (e) {
      var msg = String((e && e.message) || e).toLowerCase();
      if (msg.indexOf('not found') >= 0 || msg.indexOf('no such') >= 0) return false;
      throw e;
    }
  }

  async function fsMkdir(path, options) {
    var fs = getTauriFsFacade();
    if (fs && typeof fs.mkdir === 'function') return fs.mkdir(path, options || {});
    var invoke = getTauriInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable for fs mkdir');
    return invoke('plugin:fs|mkdir', { path: path, options: options || {} });
  }

  async function fsRemove(path, options) {
    var fs = getTauriFsFacade();
    if (fs && typeof fs.remove === 'function') return fs.remove(path, options || {});
    var invoke = getTauriInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable for fs remove');
    return invoke('plugin:fs|remove', { path: path, options: options || {} });
  }

  async function fsWriteTextFile(path, text, options) {
    var fs = getTauriFsFacade();
    if (fs && typeof fs.writeTextFile === 'function') return fs.writeTextFile(path, text, options || {});
    var invoke = getTauriInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable for fs write_text_file');
    var bytes = bytesFor(String(text == null ? '' : text));
    return invoke('plugin:fs|write_text_file', bytes, {
      headers: {
        path: encodeURIComponent(path),
        options: JSON.stringify(options || {}),
      },
    });
  }

  function getTextDecoder() {
    if (typeof global.TextDecoder === 'function') return new global.TextDecoder();
    if (typeof TextDecoder === 'function') return new TextDecoder();
    throw new Error('TextDecoder unavailable');
  }

  /* tauri-plugin-fs read_text_file may surface bytes as a JS number array or a
   * typed array rather than a string; normalize to text before parsing. */
  function decodeFsText(value) {
    if (typeof value === 'string') return value;
    if (value instanceof Uint8Array) return getTextDecoder().decode(value);
    if (Array.isArray(value)) return getTextDecoder().decode(Uint8Array.from(value));
    if (value && typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(value)) {
      return getTextDecoder().decode(value);
    }
    if (value && typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
      return getTextDecoder().decode(new Uint8Array(value));
    }
    return String(value == null ? '' : value);
  }

  async function fsReadTextFile(path, options) {
    var fs = getTauriFsFacade();
    if (fs && typeof fs.readTextFile === 'function') return decodeFsText(await fs.readTextFile(path, options || {}));
    var invoke = getTauriInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable for fs read_text_file');
    return decodeFsText(await invoke('plugin:fs|read_text_file', { path: path, options: options || {} }));
  }

  /* Conservative guard before a recursive overwrite delete: only ever delete a
   * directory that looks like one of our packages. The basename must end in
   * '.h2ochat' (always true for our own materializer), and if a manifest.json is
   * readable it must declare our package schema. A missing/unreadable manifest is
   * tolerated (a partial package we wrote) because the '.h2ochat' basename guard
   * already prevents targeting an arbitrary user directory — documented
   * limitation: we do not deep-verify packages whose manifest cannot be read. */
  async function assertOverwritableSavedChatPackage(packagePath, options) {
    var base = cleanString(packagePath).replace(/[\/\\]+$/g, '');
    var basename = base.slice(base.lastIndexOf('/') + 1);
    basename = basename.slice(basename.lastIndexOf('\\') + 1);
    if (!/\.h2ochat$/.test(basename)) {
      throw new Error('refusing recursive overwrite of non-package path (expected *.h2ochat): ' + packagePath);
    }
    var manifestText = '';
    try { manifestText = await fsReadTextFile(joinPath(packagePath, 'manifest.json'), options); }
    catch (_) { manifestText = ''; }
    if (!manifestText) return;
    var parsed = null;
    try { parsed = JSON.parse(manifestText); }
    catch (_) { parsed = null; }
    var schema = parsed && cleanString(parsed.schema);
    if (schema && schema !== MANIFEST_SCHEMA) {
      throw new Error('refusing overwrite: existing folder has foreign manifest schema "' + schema + '"');
    }
  }

  async function writeSavedChatPackageV1(options) {
    var opts = safeObject(options);
    var targetDir = firstString(opts.targetDir, opts.targetFolder);
    if (!targetDir) throw new Error('targetDir is required');
    var built = await buildSavedChatPackageV1(opts);
    var baseOptions = fsOptions(opts);
    var packagePath = joinPath(targetDir, built.packageDirName);
    var exists = await fsExists(packagePath, baseOptions);
    if (exists && !opts.overwrite) {
      throw new Error('saved chat package already exists: ' + packagePath);
    }
    if (exists && opts.overwrite) {
      await assertOverwritableSavedChatPackage(packagePath, baseOptions);
      await fsRemove(packagePath, Object.assign({}, baseOptions, { recursive: true }));
    }
    await fsMkdir(packagePath, Object.assign({}, baseOptions, { recursive: true }));
    await fsWriteTextFile(joinPath(packagePath, 'manifest.json'), built.files['manifest.json'].text, baseOptions);
    await fsWriteTextFile(joinPath(packagePath, 'snapshot.json'), built.files['snapshot.json'].text, baseOptions);
    await fsWriteTextFile(joinPath(packagePath, 'chat.md'), built.files['chat.md'].text, baseOptions);
    await fsWriteTextFile(joinPath(packagePath, 'chat.html'), built.files['chat.html'].text, baseOptions);
    if (opts.includeEmptyAssetsDir === true) {
      await fsMkdir(joinPath(packagePath, 'assets'), Object.assign({}, baseOptions, { recursive: true }));
    }
    var writtenAt = nowIso();
    state.lastWriteAt = writtenAt;
    return Object.assign({}, built, {
      written: true,
      writtenAt: writtenAt,
      packagePath: packagePath,
      paths: {
        root: packagePath,
        manifest: joinPath(packagePath, 'manifest.json'),
        snapshot: joinPath(packagePath, 'snapshot.json'),
        markdown: joinPath(packagePath, 'chat.md'),
        html: joinPath(packagePath, 'chat.html'),
        assets: opts.includeEmptyAssetsDir === true ? joinPath(packagePath, 'assets') : '',
      },
    });
  }

  function diagnoseSavedChatPackageV1() {
    var stores = getStores();
    return {
      installed: true,
      version: MODULE_VERSION,
      schema: MANIFEST_SCHEMA,
      schemaVersion: SCHEMA_VERSION,
      rendererVersion: RENDERER_VERSION,
      desktopOnly: true,
      projectionOnly: true,
      uiWired: false,
      syncIntegrated: false,
      casImplemented: false,
      storeAvailability: {
        chats: !!(stores.chats && typeof stores.chats.get === 'function'),
        snapshots: !!(stores.snapshots && typeof stores.snapshots.get === 'function'),
        snapshotsListByChat: !!(stores.snapshots && typeof stores.snapshots.listByChat === 'function'),
        folders: !!stores.folders,
        categories: !!stores.categories,
        labels: !!stores.labels,
        tags: !!stores.tags,
      },
      lastBuildAt: state.lastBuildAt,
      lastWriteAt: state.lastWriteAt,
      lastPackage: state.lastPackage,
      lastError: state.lastError,
    };
  }

  var previous = H2O.Studio.ingestion;
  H2O.Studio.ingestion = Object.assign({}, previous, {
    buildSavedChatPackageV1: function (options) {
      return buildSavedChatPackageV1(options).catch(function (error) {
        state.lastError = String(error && (error.stack || error.message || error));
        throw error;
      });
    },
    writeSavedChatPackageV1: function (options) {
      return writeSavedChatPackageV1(options).catch(function (error) {
        state.lastError = String(error && (error.stack || error.message || error));
        throw error;
      });
    },
    diagnoseSavedChatPackageV1: diagnoseSavedChatPackageV1,
    __savedChatPackageV1: Object.freeze({
      canonicalJson: canonicalJson,
      sha256Hex: sha256Hex,
      normalizeSavedChatMessageV1: normalizeSavedChatMessageV1,
      normalizeContentHtmlV1: normalizeContentHtmlV1,
      projectSnapshotJsonV1: projectSnapshotJsonV1,
      buildManifestJsonV1: buildManifestJsonV1,
      renderChatMarkdownV1: renderChatMarkdownV1,
      renderChatHtmlV1: renderChatHtmlV1,
    }),
    diagnose: function () {
      var base = {};
      if (previous && typeof previous.diagnose === 'function') {
        try { base = previous.diagnose() || {}; }
        catch (_) { base = {}; }
      }
      base.savedChatPackageV1 = diagnoseSavedChatPackageV1();
      return base;
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
