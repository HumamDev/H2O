/* H2O Studio Saved Chat Archive Requests (Desktop / Tauri)
 *
 * Phase D.2A: Desktop-only request envelope validation and read-only store
 * resolution for Chrome-to-Desktop saved-chat archive intent.
 *
 * Boundaries: this module validates request metadata and reads Desktop store
 * adapters only. It does not create a queue, persist status, materialize
 * packages, mutate SQLite, touch CAS, call Sync, import/recover data, or wire UI.
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
  var MODULE_VERSION = '0.1.0-d2a';
  var STATUS_VALIDATED = 'validated';
  var STATUS_NEEDS_DESKTOP_SNAPSHOT = 'needs-desktop-snapshot';
  var STATUS_REJECTED = 'rejected';
  var STATUS_DB_UNAVAILABLE = 'db-unavailable';
  var STATUS_UNSUPPORTED = 'unsupported';
  var ALLOWED_SURFACES = { 'chrome-studio': true };
  var ALLOWED_INTENTS = { 'save-to-folder': true };

  var state = {
    installedAt: Date.now(),
    lastValidatedAt: null,
    lastResolvedAt: null,
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
        queuePersistence: false,
        statusPersistence: false,
        packageMaterialization: false,
        packageWriteDeferred: true,
        queueDeferred: true,
        chromeRuntime: false,
        syncTransport: false,
        importRecovery: false,
        casWrites: false,
        dbWrites: false,
        ui: false,
      },
      state: {
        installedAt: state.installedAt,
        lastValidatedAt: state.lastValidatedAt,
        lastResolvedAt: state.lastResolvedAt,
        lastError: state.lastError,
      },
    };
  }

  H2O.Studio.ingestion.validateSavedChatArchiveRequestV1 = validateSavedChatArchiveRequestV1;
  H2O.Studio.ingestion.resolveSavedChatArchiveRequestV1 = resolveSavedChatArchiveRequestV1;
  H2O.Studio.ingestion.diagnoseSavedChatArchiveRequestIntakeV1 = diagnoseSavedChatArchiveRequestIntakeV1;
})(typeof globalThis !== 'undefined' ? globalThis : this);
