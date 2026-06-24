/* H2O Studio Saved Chat Archive Requests (Desktop / Tauri)
 *
 * Phase D.2A/D.2B: Desktop-only request envelope validation, read-only store
 * resolution, and a Desktop-owned durable request/status queue for
 * Chrome-to-Desktop saved-chat archive intent.
 *
 * Boundaries: this module validates request metadata, reads Desktop store
 * adapters, and writes only the saved_chat_archive_requests queue table. It
 * does not materialize packages, mutate chat/snapshot/asset rows, touch CAS,
 * call Sync, import/recover data, invoke Chrome runtime, or wire UI.
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

  var REQUEST_SCHEMA = 'h2o.savedChatArchiveRequest.v1';
  var RESOLUTION_SCHEMA = 'h2o.savedChatArchiveRequestResolution.v1';
  var QUEUE_SCHEMA = 'h2o.savedChatArchiveRequestQueue.v1';
  var DB_URL = 'sqlite:studio-v1.db';
  var QUEUE_TABLE = 'saved_chat_archive_requests';
  var MODULE_VERSION = '0.2.0-d2b';
  var STATUS_VALIDATED = 'validated';
  var STATUS_NEEDS_DESKTOP_SNAPSHOT = 'needs-desktop-snapshot';
  var STATUS_REJECTED = 'rejected';
  var STATUS_DB_UNAVAILABLE = 'db-unavailable';
  var STATUS_UNSUPPORTED = 'unsupported';
  var STATUS_DUPLICATE = 'duplicate';
  var ALLOWED_SURFACES = { 'chrome-studio': true };
  var ALLOWED_INTENTS = { 'save-to-folder': true };

  var state = {
    installedAt: Date.now(),
    lastValidatedAt: null,
    lastResolvedAt: null,
    lastEnqueuedAt: null,
    lastError: null,
  };

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function safeObject(value) {
    return isObject(value) ? value : {};
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function cloneJson(value) {
    if (typeof value === 'undefined') return null;
    try { return JSON.parse(JSON.stringify(value)); }
    catch (_) { return null; }
  }

  function jsonText(value) {
    try { return JSON.stringify(value == null ? null : value); }
    catch (_) { return 'null'; }
  }

  function parseJsonObject(text) {
    if (!text) return null;
    try {
      var value = JSON.parse(text);
      return value && typeof value === 'object' ? value : null;
    } catch (_) {
      return null;
    }
  }

  function numberFlag(value) {
    return value ? 1 : 0;
  }

  function boolFromDb(value) {
    return value === true || value === 1 || value === '1';
  }

  function makeIssue(code, message, detail) {
    var out = { code: code, message: message };
    if (typeof detail !== 'undefined') out.detail = detail;
    return out;
  }

  function issuePush(list, code, message, detail) {
    list.push(makeIssue(code, message, detail));
  }

  function createResolutionBase() {
    return {
      checked: false,
      storeAvailable: false,
      chatId: null,
      snapshotId: null,
      chatExists: null,
      snapshotExists: null,
      canMaterializeFromDesktopStore: false,
      packageWriteDeferred: true,
      queueDeferred: true,
    };
  }

  function createResult(status) {
    return {
      ok: status === STATUS_VALIDATED,
      status: status || STATUS_REJECTED,
      schema: RESOLUTION_SCHEMA,
      generatedAt: nowIso(),
      requestId: null,
      dedupeKey: null,
      blockers: [],
      warnings: [],
      normalizedRequest: null,
      resolution: createResolutionBase(),
    };
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

  function sqlSelect(query, values) {
    var invoke = getInvoke();
    if (!invoke) return Promise.reject(new Error('tauri invoke unavailable'));
    return invoke('plugin:sql|select', { db: DB_URL, query: query, values: values || [] });
  }

  function sqlExecute(query, values) {
    var invoke = getInvoke();
    if (!invoke) return Promise.reject(new Error('tauri invoke unavailable'));
    return invoke('plugin:sql|execute', { db: DB_URL, query: query, values: values || [] });
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

  function uniqueStrings(values) {
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

  function looksLikeChatGptHref(href) {
    var text = cleanString(href);
    if (!text) return false;
    return /^https?:\/\/([^\/]+\.)?(chatgpt\.com|chat\.openai\.com)(\/|$)/i.test(text);
  }

  function looksMalformedHref(href) {
    var text = cleanString(href);
    if (!text) return false;
    return !/^https?:\/\//i.test(text);
  }

  function forbiddenPayloadKeys(envelope) {
    var forbidden = {
      manifest: 'package-manifest-payload-forbidden',
      manifestJson: 'package-manifest-payload-forbidden',
      snapshot: 'snapshot-content-payload-forbidden',
      snapshotJson: 'snapshot-content-payload-forbidden',
      snapshotContent: 'snapshot-content-payload-forbidden',
      transcript: 'snapshot-content-payload-forbidden',
      messages: 'snapshot-content-payload-forbidden',
      turns: 'snapshot-content-payload-forbidden',
      chatMd: 'renderer-payload-forbidden',
      chatMarkdown: 'renderer-payload-forbidden',
      markdown: 'renderer-payload-forbidden',
      chatHtml: 'renderer-payload-forbidden',
      html: 'renderer-payload-forbidden',
      assets: 'asset-payload-forbidden',
      assetBytes: 'asset-payload-forbidden',
      assetPayloads: 'asset-payload-forbidden',
      casPath: 'cas-path-payload-forbidden',
      casPaths: 'cas-path-payload-forbidden',
      packagePath: 'archive-package-path-payload-forbidden',
      packageFiles: 'archive-package-payload-forbidden',
      archivePath: 'archive-package-path-payload-forbidden',
      contentHash: 'content-hash-payload-forbidden',
    };
    var hits = [];
    function walk(value, path) {
      if (!isObject(value) && !Array.isArray(value)) return;
      if (Array.isArray(value)) {
        value.forEach(function (item, index) { walk(item, path.concat(String(index))); });
        return;
      }
      Object.keys(value).forEach(function (key) {
        if (forbidden[key]) hits.push({ key: key, path: path.concat(key).join('.'), code: forbidden[key] });
        walk(value[key], path.concat(key));
      });
    }
    walk(envelope, []);
    return hits;
  }

  function normalizeRequest(envelope, warnings) {
    var source = safeObject(envelope.source);
    var desktopResolution = safeObject(envelope.desktopResolution);
    var intent = safeObject(envelope.intent);
    var target = safeObject(intent.target);
    var payloadPolicy = safeObject(envelope.payloadPolicy);
    var normalized = {
      schema: REQUEST_SCHEMA,
      requestId: cleanString(envelope.requestId),
      dedupeKey: cleanString(envelope.dedupeKey),
      createdAt: cleanString(envelope.createdAt),
      source: {
        surface: cleanString(source.surface),
        nativeConversationId: cleanString(source.nativeConversationId),
        href: cleanString(source.href),
        title: cleanString(source.title),
        capturedAt: cleanString(source.capturedAt),
        captureDigest: cleanString(source.captureDigest),
        messageCount: typeof source.messageCount === 'number' && isFinite(source.messageCount) ? source.messageCount : null,
      },
      desktopResolution: {
        studioChatId: firstString(desktopResolution.studioChatId, desktopResolution.chatId),
        snapshotId: cleanString(desktopResolution.snapshotId),
        requireExistingDesktopSnapshot: normalizeBoolean(desktopResolution.requireExistingDesktopSnapshot, true),
      },
      intent: {
        kind: cleanString(intent.kind),
        target: {
          folderIdAtRequest: cleanString(target.folderIdAtRequest),
          categoryIdAtRequest: cleanString(target.categoryIdAtRequest),
          projectIdAtRequest: cleanString(target.projectIdAtRequest),
          labelIdsAtRequest: uniqueStrings(target.labelIdsAtRequest),
          tagIdsAtRequest: uniqueStrings(target.tagIdsAtRequest),
        },
      },
      payloadPolicy: {
        containsSnapshotContent: normalizeBoolean(payloadPolicy.containsSnapshotContent, false),
        containsAssets: normalizeBoolean(payloadPolicy.containsAssets, false),
      },
    };

    if (!normalized.createdAt) issuePush(warnings, 'created-at-missing', 'createdAt is missing; treating it as metadata only.');
    if (!normalized.source.nativeConversationId) issuePush(warnings, 'native-conversation-id-missing', 'source.nativeConversationId is missing.');
    if (!normalized.source.href) issuePush(warnings, 'source-href-missing', 'source.href is missing.');
    if (normalized.source.href && looksMalformedHref(normalized.source.href)) {
      issuePush(warnings, 'source-href-malformed', 'source.href does not look like an absolute URL.', { href: normalized.source.href });
    } else if (normalized.source.href && !looksLikeChatGptHref(normalized.source.href)) {
      issuePush(warnings, 'source-href-non-chatgpt', 'source.href does not look like a ChatGPT conversation URL.', { href: normalized.source.href });
    }
    if (!normalized.source.title) issuePush(warnings, 'source-title-missing', 'source.title is missing.');
    if (!normalized.source.captureDigest) issuePush(warnings, 'source-capture-digest-missing', 'source.captureDigest is missing.');
    if (normalized.source.messageCount == null) issuePush(warnings, 'source-message-count-missing', 'source.messageCount is missing.');
    if (!normalized.desktopResolution.studioChatId) issuePush(warnings, 'studio-chat-id-missing', 'desktopResolution.studioChatId is missing.');
    if (!normalized.desktopResolution.snapshotId) issuePush(warnings, 'snapshot-id-missing', 'desktopResolution.snapshotId is missing.');

    var targetHasHints = !!(
      normalized.intent.target.folderIdAtRequest ||
      normalized.intent.target.categoryIdAtRequest ||
      normalized.intent.target.projectIdAtRequest ||
      normalized.intent.target.labelIdsAtRequest.length ||
      normalized.intent.target.tagIdsAtRequest.length
    );
    if (targetHasHints) issuePush(warnings, 'target-hints-unresolved', 'Target hints are present; Desktop must resolve them through canonical store state.');

    return normalized;
  }

  function validateSavedChatArchiveRequestV1(envelope, options) {
    void options;
    state.lastValidatedAt = Date.now();
    var result = createResult(STATUS_VALIDATED);
    var blockers = result.blockers;
    var warnings = result.warnings;

    if (!isObject(envelope)) {
      issuePush(blockers, 'request-envelope-not-object', 'Request envelope must be an object.');
      result.status = STATUS_REJECTED;
      result.ok = false;
      return result;
    }

    if (envelope.schema !== REQUEST_SCHEMA) {
      issuePush(blockers, 'unsupported-schema', 'Unsupported saved-chat archive request schema.', { expected: REQUEST_SCHEMA, actual: envelope.schema || null, unsupportedStatus: STATUS_UNSUPPORTED });
    }
    if (!cleanString(envelope.requestId)) issuePush(blockers, 'request-id-missing', 'requestId is required.');
    if (!cleanString(envelope.dedupeKey)) issuePush(blockers, 'dedupe-key-missing', 'dedupeKey is required.');
    if (envelope.createdAt != null && typeof envelope.createdAt !== 'string') {
      issuePush(blockers, 'created-at-not-string', 'createdAt must be a string when present.');
    }

    var source = safeObject(envelope.source);
    if (!cleanString(source.surface)) {
      issuePush(blockers, 'source-surface-missing', 'source.surface is required.');
    } else if (!ALLOWED_SURFACES[cleanString(source.surface)]) {
      issuePush(blockers, 'source-surface-unsupported', 'source.surface is unsupported.', { surface: cleanString(source.surface) });
    }

    var intent = safeObject(envelope.intent);
    if (!cleanString(intent.kind)) {
      issuePush(blockers, 'intent-kind-missing', 'intent.kind is required.');
    } else if (!ALLOWED_INTENTS[cleanString(intent.kind)]) {
      issuePush(blockers, 'intent-kind-unsupported', 'intent.kind is unsupported for D.2A.', { kind: cleanString(intent.kind) });
    }

    var payloadPolicy = safeObject(envelope.payloadPolicy);
    if (normalizeBoolean(payloadPolicy.containsSnapshotContent, false) === true) {
      issuePush(blockers, 'snapshot-content-payload-forbidden', 'payloadPolicy.containsSnapshotContent must be false for D.2A.');
    }
    if (normalizeBoolean(payloadPolicy.containsAssets, false) === true) {
      issuePush(blockers, 'asset-payload-forbidden', 'payloadPolicy.containsAssets must be false for D.2A.');
    }

    forbiddenPayloadKeys(envelope).forEach(function (hit) {
      issuePush(blockers, hit.code, 'Request envelope includes authoritative archive/package payload, which is forbidden in D.2A.', hit);
    });

    result.requestId = cleanString(envelope.requestId) || null;
    result.dedupeKey = cleanString(envelope.dedupeKey) || null;
    result.normalizedRequest = blockers.length ? null : normalizeRequest(envelope, warnings);
    if (blockers.length) {
      result.status = STATUS_REJECTED;
      result.ok = false;
    }
    return result;
  }

  function getStoreApis() {
    var store = H2O.Studio && H2O.Studio.store;
    var chats = store && store.chats;
    var snapshots = store && store.snapshots;
    return {
      store: store || null,
      chatsGet: chats && typeof chats.get === 'function' ? chats.get.bind(chats) : null,
      snapshotsGet: snapshots && typeof snapshots.get === 'function' ? snapshots.get.bind(snapshots) : null,
      snapshotsListByChat: snapshots && typeof snapshots.listByChat === 'function' ? snapshots.listByChat.bind(snapshots) : null,
      available: !!(chats && typeof chats.get === 'function' && snapshots && typeof snapshots.get === 'function'),
      listByChatAvailable: !!(snapshots && typeof snapshots.listByChat === 'function'),
    };
  }

  function snapshotPayload(value) {
    if (!value) return null;
    if (value.snapshot && isObject(value.snapshot)) return value.snapshot;
    if (isObject(value)) return value;
    return null;
  }

  function chatPayload(value) {
    if (!value) return null;
    if (value.chat && isObject(value.chat)) return value.chat;
    if (isObject(value)) return value;
    return null;
  }

  async function resolveSavedChatArchiveRequestV1(envelope, options) {
    void options;
    state.lastResolvedAt = Date.now();
    var validation = validateSavedChatArchiveRequestV1(envelope, options);
    var result = cloneJson(validation) || createResult(STATUS_REJECTED);
    result.schema = RESOLUTION_SCHEMA;
    result.resolution = createResolutionBase();

    if (!validation.ok) {
      result.status = STATUS_REJECTED;
      result.ok = false;
      return result;
    }

    var normalized = validation.normalizedRequest || {};
    var resolution = result.resolution;
    var chatId = cleanString(normalized.desktopResolution && normalized.desktopResolution.studioChatId);
    var snapshotId = cleanString(normalized.desktopResolution && normalized.desktopResolution.snapshotId);
    resolution.checked = true;
    resolution.chatId = chatId || null;
    resolution.snapshotId = snapshotId || null;

    var apis = getStoreApis();
    resolution.storeAvailable = apis.available;
    if (!apis.available) {
      issuePush(result.warnings, 'db-api-missing', 'Required read-only Desktop store APIs are unavailable.');
      result.status = STATUS_DB_UNAVAILABLE;
      result.ok = false;
      return result;
    }

    try {
      var chat = chatId ? chatPayload(await apis.chatsGet(chatId)) : null;
      var snapshotWrap = snapshotId ? await apis.snapshotsGet(snapshotId) : null;
      var snapshot = snapshotPayload(snapshotWrap);

      resolution.chatExists = chatId ? !!chat : null;
      resolution.snapshotExists = snapshotId ? !!snapshot : null;

      if (!snapshot) {
        result.status = STATUS_NEEDS_DESKTOP_SNAPSHOT;
        result.ok = false;
        issuePush(result.warnings, 'desktop-snapshot-missing', 'Desktop snapshot is missing; package materialization remains deferred.');
        return result;
      }

      var snapshotChatId = cleanString(snapshot.chatId);
      if (chatId && snapshotChatId && chatId !== snapshotChatId) {
        result.status = STATUS_NEEDS_DESKTOP_SNAPSHOT;
        result.ok = false;
        resolution.canMaterializeFromDesktopStore = false;
        issuePush(result.blockers, 'chat-snapshot-mismatch', 'Desktop chatId does not match the resolved snapshot chatId.', { chatId: chatId, snapshotChatId: snapshotChatId });
        return result;
      }

      if (!chatId && snapshotChatId) {
        chatId = snapshotChatId;
        resolution.chatId = snapshotChatId;
        chat = chatPayload(await apis.chatsGet(snapshotChatId));
        resolution.chatExists = !!chat;
        issuePush(result.warnings, 'chat-id-resolved-from-snapshot', 'Desktop resolved chatId from the snapshot row.');
      }

      if (chatId && !chat) {
        result.status = STATUS_NEEDS_DESKTOP_SNAPSHOT;
        result.ok = false;
        resolution.canMaterializeFromDesktopStore = false;
        issuePush(result.warnings, 'desktop-chat-missing', 'Desktop chat row is missing; treating the request as needing Desktop snapshot/store state.');
        return result;
      }

      resolution.snapshotExists = true;
      resolution.chatExists = chatId ? !!chat : resolution.chatExists;
      resolution.canMaterializeFromDesktopStore = true;
      result.status = STATUS_VALIDATED;
      result.ok = true;
      return result;
    } catch (err) {
      state.lastError = String((err && err.message) || err || '');
      issuePush(result.warnings, 'db-check-failed', 'Read-only Desktop store resolution failed.', { error: state.lastError });
      result.status = STATUS_DB_UNAVAILABLE;
      result.ok = false;
      return result;
    }
  }

  function requestRowToResult(row) {
    if (!row || typeof row !== 'object') return null;
    var request = parseJsonObject(row.normalized_request_json);
    var resolution = parseJsonObject(row.resolution_json);
    return {
      ok: !!row.request_id,
      found: !!row.request_id,
      requestId: row.request_id || null,
      dedupeKey: row.dedupe_key || null,
      schema: row.schema || REQUEST_SCHEMA,
      status: row.status || '',
      request: request,
      resolution: resolution,
      source: {
        surface: row.source_surface || '',
        nativeConversationId: row.native_conversation_id || '',
        href: row.source_href || '',
        title: row.source_title || '',
      },
      desktopResolution: {
        studioChatId: row.studio_chat_id || null,
        snapshotId: row.snapshot_id || null,
        canMaterializeFromDesktopStore: boolFromDb(row.can_materialize_from_desktop_store),
      },
      createdAt: row.created_at || '',
      receivedAt: row.received_at || '',
      updatedAt: row.updated_at || '',
      packageWriteDeferred: true,
      queueEnabled: true,
    };
  }

  function notFoundStatus(requestId) {
    return {
      ok: false,
      found: false,
      requestId: cleanString(requestId) || null,
      dedupeKey: null,
      status: 'not-found',
      request: null,
      resolution: null,
      createdAt: null,
      receivedAt: null,
      updatedAt: null,
      packageWriteDeferred: true,
      queueEnabled: true,
    };
  }

  async function findQueueRowByDedupeKey(dedupeKey) {
    var rows = await sqlSelect(
      'SELECT * FROM ' + QUEUE_TABLE + ' WHERE dedupe_key = ? LIMIT 1',
      [dedupeKey]
    );
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }

  async function findQueueRowByRequestId(requestId) {
    var rows = await sqlSelect(
      'SELECT * FROM ' + QUEUE_TABLE + ' WHERE request_id = ? LIMIT 1',
      [requestId]
    );
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }

  async function insertQueueRow(resolveResult, envelope, receivedAt) {
    var normalized = resolveResult.normalizedRequest || null;
    var source = safeObject(normalized && normalized.source);
    var desktopResolution = safeObject(normalized && normalized.desktopResolution);
    var resolution = safeObject(resolveResult.resolution);
    var requestId = cleanString(resolveResult.requestId);
    var dedupeKey = cleanString(resolveResult.dedupeKey);
    var createdAt = cleanString(normalized && normalized.createdAt) || cleanString(envelope && envelope.createdAt);
    var status = cleanString(resolveResult.status) || STATUS_REJECTED;
    await sqlExecute(
      'INSERT INTO ' + QUEUE_TABLE + ' (' +
        'request_id, dedupe_key, schema, status, source_surface, native_conversation_id, source_href, source_title, ' +
        'studio_chat_id, snapshot_id, can_materialize_from_desktop_store, normalized_request_json, resolution_json, ' +
        'created_at, received_at, updated_at, meta_json' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        requestId,
        dedupeKey,
        REQUEST_SCHEMA,
        status,
        cleanString(source.surface),
        cleanString(source.nativeConversationId),
        cleanString(source.href),
        cleanString(source.title),
        cleanString(desktopResolution.studioChatId || resolution.chatId),
        cleanString(desktopResolution.snapshotId || resolution.snapshotId),
        numberFlag(resolution.canMaterializeFromDesktopStore),
        jsonText(normalized),
        jsonText(resolveResult),
        createdAt,
        receivedAt,
        receivedAt,
        jsonText({
          phase: 'D.2B',
          packageWriteDeferred: true,
          queueEnabled: true,
          persistedFromStatus: status,
        }),
      ]
    );
  }

  function enqueueResultFromRow(row, status, duplicateOf) {
    var persisted = requestRowToResult(row);
    return {
      ok: status === STATUS_VALIDATED,
      status: status,
      requestId: persisted && persisted.requestId,
      dedupeKey: persisted && persisted.dedupeKey,
      duplicateOf: duplicateOf || null,
      persisted: status !== STATUS_DUPLICATE,
      request: persisted ? persisted.request : null,
      resolution: persisted ? persisted.resolution : null,
      packageWriteDeferred: true,
      queueEnabled: true,
    };
  }

  async function enqueueSavedChatArchiveRequestV1(envelope, options) {
    void options;
    state.lastEnqueuedAt = Date.now();
    var resolved = await resolveSavedChatArchiveRequestV1(envelope, options);
    var requestId = cleanString(resolved.requestId);
    var dedupeKey = cleanString(resolved.dedupeKey);
    if (!requestId || !dedupeKey) {
      return {
        ok: false,
        status: resolved.status || STATUS_REJECTED,
        requestId: requestId || null,
        dedupeKey: dedupeKey || null,
        duplicateOf: null,
        persisted: false,
        request: resolved.normalizedRequest || null,
        resolution: resolved,
        packageWriteDeferred: true,
        queueEnabled: true,
      };
    }

    try {
      var existing = await findQueueRowByDedupeKey(dedupeKey);
      if (existing) {
        var duplicate = enqueueResultFromRow(existing, STATUS_DUPLICATE, existing.request_id || null);
        duplicate.ok = false;
        duplicate.persisted = false;
        return duplicate;
      }
      var receivedAt = nowIso();
      await insertQueueRow(resolved, envelope, receivedAt);
      var inserted = await findQueueRowByRequestId(requestId);
      return enqueueResultFromRow(inserted, resolved.status || STATUS_REJECTED, null);
    } catch (err) {
      state.lastError = String((err && err.message) || err || '');
      return {
        ok: false,
        status: STATUS_DB_UNAVAILABLE,
        requestId: requestId,
        dedupeKey: dedupeKey,
        duplicateOf: null,
        persisted: false,
        request: resolved.normalizedRequest || null,
        resolution: resolved,
        packageWriteDeferred: true,
        queueEnabled: true,
        warnings: [makeIssue('queue-persistence-failed', 'Could not persist saved-chat archive request queue row.', { error: state.lastError })],
      };
    }
  }

  async function getSavedChatArchiveRequestStatusV1(options) {
    var requestId = cleanString(options && options.requestId);
    if (!requestId) return notFoundStatus(null);
    try {
      var row = await findQueueRowByRequestId(requestId);
      return requestRowToResult(row) || notFoundStatus(requestId);
    } catch (err) {
      state.lastError = String((err && err.message) || err || '');
      return notFoundStatus(requestId);
    }
  }

  async function listSavedChatArchiveRequestsV1(options) {
    options = options || {};
    var status = cleanString(options.status);
    var limit = Number(options.limit);
    if (!isFinite(limit) || limit <= 0) limit = 100;
    limit = Math.max(1, Math.min(500, Math.floor(limit)));
    var rows;
    if (status) {
      rows = await sqlSelect(
        'SELECT * FROM ' + QUEUE_TABLE + ' WHERE status = ? ORDER BY updated_at DESC, received_at DESC LIMIT ' + limit,
        [status]
      );
    } else {
      rows = await sqlSelect(
        'SELECT * FROM ' + QUEUE_TABLE + ' ORDER BY updated_at DESC, received_at DESC LIMIT ' + limit,
        []
      );
    }
    return {
      ok: true,
      schema: QUEUE_SCHEMA,
      status: 'ok',
      limit: limit,
      filterStatus: status || null,
      requests: asArray(rows).map(requestRowToResult).filter(function (row) { return !!row; }),
      packageWriteDeferred: true,
      queueEnabled: true,
    };
  }

  async function diagnoseSavedChatArchiveRequestQueueV1() {
    var result = {
      installed: true,
      desktopOnly: true,
      queueEnabled: true,
      packageWriteDeferred: true,
      schema: QUEUE_SCHEMA,
      table: QUEUE_TABLE,
      generatedAt: nowIso(),
      counts: {
        total: 0,
        validated: 0,
        needsDesktopSnapshot: 0,
        rejected: 0,
        dbUnavailable: 0,
        duplicate: 0,
      },
      boundaries: {
        chromeRuntime: false,
        syncTransport: false,
        packageWriter: false,
        archivePackageMutation: false,
        casWrites: false,
        chatSnapshotAssetMutation: false,
        importRecovery: false,
        ui: false,
      },
      state: {
        installedAt: state.installedAt,
        lastEnqueuedAt: state.lastEnqueuedAt,
        lastError: state.lastError,
      },
    };
    try {
      var rows = await sqlSelect(
        'SELECT status, COUNT(*) AS n FROM ' + QUEUE_TABLE + ' GROUP BY status',
        []
      );
      asArray(rows).forEach(function (row) {
        var n = Number(row.n || row.count || 0) || 0;
        result.counts.total += n;
        if (row.status === STATUS_VALIDATED) result.counts.validated += n;
        if (row.status === STATUS_NEEDS_DESKTOP_SNAPSHOT) result.counts.needsDesktopSnapshot += n;
        if (row.status === STATUS_REJECTED) result.counts.rejected += n;
        if (row.status === STATUS_DB_UNAVAILABLE) result.counts.dbUnavailable += n;
      });
      return result;
    } catch (err) {
      state.lastError = String((err && err.message) || err || '');
      result.queueEnabled = false;
      result.error = state.lastError;
      return result;
    }
  }

  function diagnoseSavedChatArchiveRequestIntakeV1() {
    var apis = getStoreApis();
    return {
      installed: true,
      desktopOnly: true,
      readOnly: true,
      schema: 'h2o.savedChatArchiveRequestIntakeDiagnostic.v1',
      moduleVersion: MODULE_VERSION,
      supportedSchemas: [REQUEST_SCHEMA],
      resolutionSchema: RESOLUTION_SCHEMA,
      generatedAt: nowIso(),
      storeApis: {
        chatsGet: !!apis.chatsGet,
        snapshotsGet: !!apis.snapshotsGet,
        snapshotsListByChat: !!apis.snapshotsListByChat,
      },
      boundaries: {
        queuePersistence: true,
        statusPersistence: true,
        packageMaterialization: false,
        packageWriteDeferred: true,
        queueDeferred: false,
        chromeRuntime: false,
        syncTransport: false,
        importRecovery: false,
        casWrites: false,
        dbWrites: 'saved_chat_archive_requests-only',
        ui: false,
      },
      state: {
        installedAt: state.installedAt,
        lastValidatedAt: state.lastValidatedAt,
        lastResolvedAt: state.lastResolvedAt,
        lastEnqueuedAt: state.lastEnqueuedAt,
        lastError: state.lastError,
      },
    };
  }

  H2O.Studio.ingestion.validateSavedChatArchiveRequestV1 = validateSavedChatArchiveRequestV1;
  H2O.Studio.ingestion.resolveSavedChatArchiveRequestV1 = resolveSavedChatArchiveRequestV1;
  H2O.Studio.ingestion.diagnoseSavedChatArchiveRequestIntakeV1 = diagnoseSavedChatArchiveRequestIntakeV1;
  H2O.Studio.ingestion.enqueueSavedChatArchiveRequestV1 = enqueueSavedChatArchiveRequestV1;
  H2O.Studio.ingestion.getSavedChatArchiveRequestStatusV1 = getSavedChatArchiveRequestStatusV1;
  H2O.Studio.ingestion.listSavedChatArchiveRequestsV1 = listSavedChatArchiveRequestsV1;
  H2O.Studio.ingestion.diagnoseSavedChatArchiveRequestQueueV1 = diagnoseSavedChatArchiveRequestQueueV1;
})(typeof globalThis !== 'undefined' ? globalThis : this);
