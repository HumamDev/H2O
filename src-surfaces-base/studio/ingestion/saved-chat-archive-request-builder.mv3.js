/* H2O Studio Saved Chat Archive Request Builder (Chrome / MV3)
 *
 * Phase D.3A: builds Chrome-side saved-chat archive request envelopes from
 * intent and metadata only. Transport, Desktop queue calls, package writing,
 * CAS, Sync, file drops, native messaging, and localhost relays are deferred.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.ingestion = H2O.Studio.ingestion || {};

  var REQUEST_SCHEMA = 'h2o.savedChatArchiveRequest.v1';
  var DEFAULT_SURFACE = 'chrome-studio';
  var DEFAULT_INTENT_KIND = 'save-to-folder';

  var FORBIDDEN_INPUT_KEYS = {
    manifest: true,
    manifestJson: true,
    snapshot: true,
    snapshotJson: true,
    transcript: true,
    turns: true,
    messages: true,
    content: true,
    contentText: true,
    contentHtml: true,
    html: true,
    outerHTML: true,
    outerHtml: true,
    outer_html: true,
    markdown: true,
    chatMd: true,
    chatHtml: true,
    assets: true,
    assetRefs: true,
    images: true,
    blobs: true,
    casPath: true,
    casPaths: true,
    packagePath: true,
    archivePackagePath: true,
    contentHash: true,
  };

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function safeObject(value) {
    return isObject(value) ? value : {};
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function optionalString(value) {
    var text = cleanString(value);
    return text || null;
  }

  function asStringArray(value) {
    if (!Array.isArray(value)) return [];
    var seen = Object.create(null);
    var out = [];
    value.forEach(function (item) {
      var text = cleanString(item);
      if (!text || seen[text]) return;
      seen[text] = true;
      out.push(text);
    });
    return out;
  }

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }

  function getCrypto() {
    try {
      if (global.crypto) return global.crypto;
    } catch (_) { /* ignore */ }
    return null;
  }

  function randomHexSegment() {
    var cryptoObj = getCrypto();
    try {
      if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
        var bytes = new Uint8Array(8);
        cryptoObj.getRandomValues(bytes);
        return Array.prototype.map.call(bytes, function (byte) {
          return byte.toString(16).padStart(2, '0');
        }).join('');
      }
    } catch (_) { /* ignore */ }
    return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  }

  function generateRequestId() {
    var cryptoObj = getCrypto();
    try {
      if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
        return cryptoObj.randomUUID();
      }
    } catch (_) { /* ignore */ }
    return 'req_' + Date.now() + '_' + randomHexSegment();
  }

  function stableSortObject(value) {
    if (Array.isArray(value)) return value.map(stableSortObject);
    if (!isObject(value)) return value;
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      if (typeof value[key] === 'undefined') return;
      out[key] = stableSortObject(value[key]);
    });
    return out;
  }

  function canonicalJson(value) {
    return JSON.stringify(stableSortObject(value));
  }

  function fallbackHashHex(text) {
    var h1 = 0x811c9dc5;
    var h2 = 0x01000193;
    for (var i = 0; i < text.length; i += 1) {
      var code = text.charCodeAt(i);
      h1 ^= code;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 = (Math.imul(h2 ^ code, 0x85ebca6b) + i) >>> 0;
    }
    var seed = (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0'));
    return (seed + seed + seed + seed).slice(0, 64);
  }

  async function sha256Hex(text) {
    var cryptoObj = getCrypto();
    try {
      if (cryptoObj && cryptoObj.subtle && typeof cryptoObj.subtle.digest === 'function') {
        var bytes = new TextEncoder().encode(text);
        var digest = await cryptoObj.subtle.digest('SHA-256', bytes);
        return Array.prototype.map.call(new Uint8Array(digest), function (byte) {
          return byte.toString(16).padStart(2, '0');
        }).join('');
      }
    } catch (_) { /* fallback below */ }
    return fallbackHashHex(text);
  }

  function getCurrentHref() {
    try {
      if (global.location && typeof global.location.href === 'string') return global.location.href;
    } catch (_) { /* ignore */ }
    return '';
  }

  function getCurrentTitle() {
    try {
      if (global.document && typeof global.document.title === 'string') return global.document.title;
    } catch (_) { /* ignore */ }
    return '';
  }

  function makeIssue(code, detail) {
    return { code: code, detail: detail || null };
  }

  function collectForbiddenKeys(value, prefix, out) {
    if (!isObject(value) && !Array.isArray(value)) return;
    var keys = Object.keys(value);
    Array.prototype.forEach.call(keys, function (key) {
      var name = String(key);
      var path = prefix ? prefix + '.' + name : name;
      var child = value[key];
      if (FORBIDDEN_INPUT_KEYS[name]) out.push(path);
      if (isObject(child) || Array.isArray(child)) collectForbiddenKeys(child, path, out);
    });
  }

  function normalizeSource(rawSource) {
    var source = safeObject(rawSource);
    return {
      surface: optionalString(source.surface) || DEFAULT_SURFACE,
      nativeConversationId: optionalString(source.nativeConversationId),
      href: optionalString(source.href) || optionalString(getCurrentHref()),
      title: optionalString(source.title) || optionalString(getCurrentTitle()),
      capturedAt: optionalString(source.capturedAt),
      captureDigest: optionalString(source.captureDigest),
      messageCount: typeof source.messageCount === 'number' && Number.isFinite(source.messageCount)
        ? Math.max(0, Math.floor(source.messageCount))
        : null,
    };
  }

  function normalizeDesktopResolution(rawResolution) {
    var resolution = safeObject(rawResolution);
    return {
      studioChatId: optionalString(resolution.studioChatId),
      snapshotId: optionalString(resolution.snapshotId),
      requireExistingDesktopSnapshot: resolution.requireExistingDesktopSnapshot === false ? false : true,
    };
  }

  function normalizeTarget(rawTarget) {
    var target = safeObject(rawTarget);
    return {
      folderIdAtRequest: optionalString(target.folderIdAtRequest),
      categoryIdAtRequest: optionalString(target.categoryIdAtRequest),
      projectIdAtRequest: optionalString(target.projectIdAtRequest),
      labelIdsAtRequest: asStringArray(target.labelIdsAtRequest),
      tagIdsAtRequest: asStringArray(target.tagIdsAtRequest),
    };
  }

  function normalizeIntent(rawIntent) {
    var intent = safeObject(rawIntent);
    return {
      kind: optionalString(intent.kind) || DEFAULT_INTENT_KIND,
      target: normalizeTarget(intent.target),
    };
  }

  function dedupeMaterial(source, desktopResolution, intent) {
    return {
      source: source.nativeConversationId || source.href || '',
      snapshotId: desktopResolution.snapshotId || '',
      intentKind: intent.kind || DEFAULT_INTENT_KIND,
      target: {
        folderIdAtRequest: intent.target.folderIdAtRequest || '',
        categoryIdAtRequest: intent.target.categoryIdAtRequest || '',
        projectIdAtRequest: intent.target.projectIdAtRequest || '',
        labelIdsAtRequest: asStringArray(intent.target.labelIdsAtRequest).slice().sort(),
        tagIdsAtRequest: asStringArray(intent.target.tagIdsAtRequest).slice().sort(),
      },
    };
  }

  function validateBuiltEnvelope(envelope, warnings, blockers) {
    if (!envelope.requestId) blockers.push(makeIssue('missing-request-id'));
    if (!envelope.dedupeKey) blockers.push(makeIssue('missing-dedupe-key'));
    if (envelope.source && envelope.source.surface !== DEFAULT_SURFACE) {
      warnings.push(makeIssue('non-default-source-surface', envelope.source.surface));
    }
    if (!envelope.source || (!envelope.source.nativeConversationId && !envelope.source.href)) {
      warnings.push(makeIssue('source-chat-reference-missing'));
    }
    if (!envelope.desktopResolution || !envelope.desktopResolution.snapshotId) {
      warnings.push(makeIssue('desktop-snapshot-not-specified'));
    }
  }

  async function buildSavedChatArchiveRequestV1(options) {
    var input = safeObject(options);
    var warnings = [];
    var blockers = [];
    var forbidden = [];
    collectForbiddenKeys(input, '', forbidden);
    if (forbidden.length) warnings.push(makeIssue('authoritative-payload-fields-dropped', forbidden));

    var source = normalizeSource(input.source);
    var desktopResolution = normalizeDesktopResolution(input.desktopResolution);
    var intent = normalizeIntent(input.intent);
    var requestId = optionalString(input.requestId) || generateRequestId();
    var createdAt = optionalString(input.createdAt) || nowIso();
    var dedupeKey = optionalString(input.dedupeKey);

    if (!dedupeKey) {
      var material = canonicalJson(dedupeMaterial(source, desktopResolution, intent));
      dedupeKey = 'sha256-' + await sha256Hex(material);
    }

    var envelope = {
      schema: REQUEST_SCHEMA,
      requestId: requestId,
      dedupeKey: dedupeKey,
      createdAt: createdAt,
      source: source,
      desktopResolution: desktopResolution,
      intent: intent,
      payloadPolicy: {
        containsSnapshotContent: false,
        containsAssets: false,
      },
    };

    if (input.payloadPolicy && (
      input.payloadPolicy.containsSnapshotContent === true ||
      input.payloadPolicy.containsAssets === true
    )) {
      warnings.push(makeIssue('payload-policy-forced-metadata-only'));
    }

    validateBuiltEnvelope(envelope, warnings, blockers);

    return {
      ok: blockers.length === 0,
      envelope: envelope,
      warnings: warnings,
      blockers: blockers,
    };
  }

  H2O.Studio.ingestion.buildSavedChatArchiveRequestV1 = buildSavedChatArchiveRequestV1;
})(typeof window !== 'undefined' ? window : globalThis);
