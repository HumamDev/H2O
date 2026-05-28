/* H2O Desktop Sync - F10.8.3 WebDAV relay adapter
 *
 * Desktop/Tauri-only manual transport for relay envelopes.
 *
 * Safety invariants:
 *   - Transport only. WebDAV is never mutation authority.
 *   - Manual calls only. No polling, background sync, timers, automatic retry,
 *     convergence, automatic review, automatic merge, remote apply, or mobile
 *     write-back.
 *   - Upload reads local outbox rows and writes immutable remote blobs.
 *   - Download reads remote blobs and delegates all intake to the local inbox
 *     validation/quarantine API. Downloaded envelopes never mutate state.
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
  H2O.Desktop = H2O.Desktop || {};
  H2O.Desktop.Sync = H2O.Desktop.Sync || {};
  if (H2O.Desktop.Sync.__webdavRelayInstalled) return;

  var VERSION = '0.1.0-f10.8.3';
  var OUTBOX_KEY = 'h2o:sync:relay-outbox:v1';
  var OUTBOX_SCHEMA = 'h2o.desktop.sync.relay-outbox.v1';
  var OUTBOX_ROW_SCHEMA = 'h2o.desktop.sync.relay-outbox-row.v1';
  var RESULT_SCHEMA = 'h2o.desktop.sync.webdav-relay.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var RELAY_STATUS_PENDING = 'pending-upload';
  var RELAY_STATUS_UPLOADED = 'uploaded';
  var ALLOWED_KINDS = ['evidence', 'preview', 'proposal', 'conflictCandidate', 'applyEvent'];
  var PROPFIND_BODY = '<?xml version="1.0" encoding="utf-8"?><D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/></D:prop></D:propfind>';

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

  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function isSha256Hex(value) {
    return /^[0-9a-f]{64}$/.test(cleanString(value));
  }

  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
  }

  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean);
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isObject(value)) return value;
    var out = {};
    var keys = Object.keys(value).sort();
    for (var i = 0; i < keys.length; i += 1) out[keys[i]] = canonicalize(value[keys[i]]);
    return out;
  }

  function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
  }

  function webCryptoAvailable() {
    try {
      return !!(global.crypto && global.crypto.subtle && global.crypto.subtle.digest);
    } catch (_) {
      return false;
    }
  }

  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i += 1) {
      var part = bytes[i].toString(16);
      hex += part.length === 1 ? '0' + part : part;
    }
    return hex;
  }

  async function sha256Hex(value) {
    if (!webCryptoAvailable()) return '';
    var text = typeof value === 'string' ? value : String(value == null ? '' : value);
    var data = new TextEncoder().encode(text);
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
  }

  function storageRef() {
    try {
      var s = global.chrome && global.chrome.storage && global.chrome.storage.local;
      if (s && typeof s.get === 'function' && typeof s.set === 'function') return s;
    } catch (_) { /* ignore */ }
    return null;
  }

  function storageGet(key) {
    return new Promise(function (resolve, reject) {
      var s = storageRef();
      if (!s) { reject(new Error('storage-unavailable')); return; }
      try {
        s.get([key], function (items) {
          var lastError = global.chrome && global.chrome.runtime && global.chrome.runtime.lastError;
          if (lastError) { reject(new Error(String(lastError.message || lastError))); return; }
          resolve(items && Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null);
        });
      } catch (e) { reject(e); }
    });
  }

  function storageSet(key, value) {
    return new Promise(function (resolve, reject) {
      var s = storageRef();
      if (!s) { reject(new Error('storage-unavailable')); return; }
      try {
        var payload = {};
        payload[key] = value;
        s.set(payload, function () {
          var lastError = global.chrome && global.chrome.runtime && global.chrome.runtime.lastError;
          if (lastError) { reject(new Error(String(lastError.message || lastError))); return; }
          resolve();
        });
      } catch (e) { reject(e); }
    });
  }

  function validOutboxRow(row) {
    var status = cleanString(row && row.relayStatus);
    return isObject(row)
      && row.schema === OUTBOX_ROW_SCHEMA
      && isSha256Hex(row.envelopeDigest)
      && isSha256Hex(row.eventDigest)
      && isSha256Hex(row.dedupeKey)
      && ALLOWED_KINDS.indexOf(cleanString(row.kind)) !== -1
      && (status === RELAY_STATUS_PENDING || status === RELAY_STATUS_UPLOADED)
      && typeof row.serializedEnvelope === 'string'
      && row.serializedEnvelope.length > 0;
  }

  function freshOutbox() {
    var now = nowIsoSeconds();
    return {
      schema: OUTBOX_SCHEMA,
      createdAt: now,
      updatedAt: now,
      rows: []
    };
  }

  function normalizeOutbox(raw) {
    if (!raw) return freshOutbox();
    if (!isObject(raw) || raw.schema !== OUTBOX_SCHEMA || !Array.isArray(raw.rows)) return null;
    var rows = [];
    for (var i = 0; i < raw.rows.length; i += 1) {
      if (!validOutboxRow(raw.rows[i])) return null;
      rows.push(raw.rows[i]);
    }
    return {
      schema: OUTBOX_SCHEMA,
      createdAt: cleanString(raw.createdAt) || nowIsoSeconds(),
      updatedAt: cleanString(raw.updatedAt) || nowIsoSeconds(),
      rows: rows
    };
  }

  function countOutbox(rows) {
    return {
      rows: rows.length,
      pendingUpload: rows.filter(function (row) { return row.relayStatus === RELAY_STATUS_PENDING; }).length,
      uploaded: rows.filter(function (row) { return row.relayStatus === RELAY_STATUS_UPLOADED; }).length
    };
  }

  function basicAuth(username, password) {
    var raw = cleanString(username) + ':' + String(password == null ? '' : password);
    if (typeof global.btoa === 'function') {
      return 'Basic ' + global.btoa(unescape(encodeURIComponent(raw)));
    }
    if (typeof Buffer !== 'undefined') {
      return 'Basic ' + Buffer.from(raw, 'utf8').toString('base64');
    }
    return '';
  }

  function normalizeConfig(input) {
    var cfg = safeObject(input);
    var serverUrl = cleanString(cfg.serverUrl || cfg.baseUrl || cfg.url);
    var username = cleanString(cfg.username);
    var password = String(cfg.password == null ? '' : cfg.password);
    var peerId = cleanString(cfg.peerId || cfg.relayPeerId);
    var blockers = [];

    if (!serverUrl) addCode(blockers, 'webdav-url-required');
    if (serverUrl && !/^https?:\/\//i.test(serverUrl)) addCode(blockers, 'webdav-url-invalid');
    if (!username) addCode(blockers, 'webdav-username-required');
    if (!password) addCode(blockers, 'webdav-password-required');
    if (!peerId) addCode(blockers, 'relay-peer-id-required');
    if (peerId && !/^[A-Za-z0-9._:-]{6,160}$/.test(peerId)) addCode(blockers, 'relay-peer-id-invalid');
    if (typeof global.fetch !== 'function') addCode(blockers, 'fetch-unavailable');
    if (!basicAuth(username, password)) addCode(blockers, 'webdav-auth-unavailable');

    return {
      ok: blockers.length === 0,
      serverUrl: serverUrl.replace(/\/+$/, ''),
      username: username,
      password: password,
      peerId: peerId,
      blockers: blockers,
      warnings: []
    };
  }

  function headers(config, extra) {
    var out = {
      Authorization: basicAuth(config.username, config.password),
      Accept: 'application/json, text/plain, */*'
    };
    var keys = Object.keys(extra || {});
    for (var i = 0; i < keys.length; i += 1) out[keys[i]] = extra[keys[i]];
    return out;
  }

  function joinRemoteUrl(config, segments, trailingSlash) {
    var url = config.serverUrl;
    for (var i = 0; i < segments.length; i += 1) {
      url += '/' + encodeURIComponent(cleanString(segments[i]));
    }
    return trailingSlash ? url + '/' : url;
  }

  function relayRootUrl(config) {
    return joinRemoteUrl(config, ['relay'], true);
  }

  function peerCollectionUrl(config) {
    return joinRemoteUrl(config, ['relay', config.peerId], true);
  }

  function blobUrl(config, eventDigest) {
    return joinRemoteUrl(config, ['relay', config.peerId, cleanString(eventDigest) + '.json'], false);
  }

  function remoteObjectKey(config, eventDigest) {
    return 'relay/' + config.peerId + '/' + cleanString(eventDigest) + '.json';
  }

  async function request(config, method, url, options) {
    var opts = safeObject(options);
    return global.fetch(url, {
      method: method,
      headers: headers(config, opts.headers || {}),
      body: opts.body
    });
  }

  async function ensureCollection(config, url) {
    var res = await request(config, 'MKCOL', url, {});
    if ([200, 201, 204, 405, 409].indexOf(res.status) !== -1) return true;
    return false;
  }

  async function ensureRelayCollections(config) {
    var rootOk = await ensureCollection(config, relayRootUrl(config));
    var peerOk = await ensureCollection(config, peerCollectionUrl(config));
    return rootOk && peerOk;
  }

  async function remoteBlobExists(config, row) {
    var res = await request(config, 'HEAD', blobUrl(config, row.eventDigest), {});
    if (res.status === 200 || res.status === 204) return true;
    if (res.status === 404 || res.status === 405 || res.status === 501) return false;
    return false;
  }

  async function uploadRow(config, row) {
    var exists = await remoteBlobExists(config, row);
    if (exists) {
      return { ok: true, alreadyPresent: true, eventDigest: row.eventDigest };
    }
    var res = await request(config, 'PUT', blobUrl(config, row.eventDigest), {
      headers: {
        'Content-Type': 'application/json',
        'If-None-Match': '*'
      },
      body: row.serializedEnvelope
    });
    if (res.status === 200 || res.status === 201 || res.status === 204) {
      return { ok: true, alreadyPresent: false, eventDigest: row.eventDigest };
    }
    if (res.status === 409 || res.status === 412) {
      return { ok: true, alreadyPresent: true, eventDigest: row.eventDigest };
    }
    return { ok: false, status: res.status, eventDigest: row.eventDigest };
  }

  async function uploadRelayOutbox(input) {
    var config = normalizeConfig(input);
    if (!config.ok) {
      return {
        schema: RESULT_SCHEMA,
        ok: false,
        operation: 'upload',
        uploaded: 0,
        alreadyPresent: 0,
        failed: 0,
        blockers: config.blockers,
        warnings: config.warnings
      };
    }

    var outbox;
    try {
      outbox = normalizeOutbox(await storageGet(OUTBOX_KEY));
    } catch (_) {
      return uploadFailure(['storage-unavailable']);
    }
    if (!outbox) return uploadFailure(['outbox-malformed']);

    var pending = outbox.rows.filter(function (row) { return row.relayStatus === RELAY_STATUS_PENDING; });
    if (!pending.length) {
      return uploadOk(outbox, [], [], []);
    }

    var collectionsOk = false;
    try {
      collectionsOk = await ensureRelayCollections(config);
    } catch (_) {
      return uploadFailure(['webdav-collection-unavailable']);
    }
    if (!collectionsOk) return uploadFailure(['webdav-collection-unavailable']);

    var uploaded = [];
    var alreadyPresent = [];
    var failed = [];
    for (var i = 0; i < pending.length; i += 1) {
      var row = pending[i];
      try {
        var result = await uploadRow(config, row);
        if (result.ok && result.alreadyPresent) alreadyPresent.push(row.eventDigest);
        else if (result.ok) uploaded.push(row.eventDigest);
        else failed.push({ eventDigest: row.eventDigest, status: result.status });
      } catch (_) {
        failed.push({ eventDigest: row.eventDigest, status: 'network-error' });
      }
    }

    var successMap = {};
    uploaded.concat(alreadyPresent).forEach(function (digest) { successMap[digest] = true; });
    var now = nowIsoSeconds();
    var nextRows = outbox.rows.map(function (row) {
      if (!successMap[row.eventDigest]) return row;
      return Object.assign({}, row, {
        relayStatus: RELAY_STATUS_UPLOADED,
        uploadedAtIso: now,
        remoteObjectKey: remoteObjectKey(config, row.eventDigest)
      });
    });
    var nextOutbox = {
      schema: OUTBOX_SCHEMA,
      createdAt: outbox.createdAt,
      updatedAt: now,
      rows: nextRows
    };
    try {
      await storageSet(OUTBOX_KEY, nextOutbox);
    } catch (_) {
      return uploadFailure(['storage-unavailable']);
    }
    return uploadOk(nextOutbox, uploaded, alreadyPresent, failed);
  }

  function uploadFailure(blockers) {
    return {
      schema: RESULT_SCHEMA,
      ok: false,
      operation: 'upload',
      uploaded: 0,
      alreadyPresent: 0,
      failed: 0,
      counts: countOutbox([]),
      blockers: codeList(blockers),
      warnings: []
    };
  }

  function uploadOk(outbox, uploaded, alreadyPresent, failed) {
    return {
      schema: RESULT_SCHEMA,
      ok: failed.length === 0,
      operation: 'upload',
      uploaded: uploaded.length,
      alreadyPresent: alreadyPresent.length,
      failed: failed.length,
      failedRows: failed,
      counts: countOutbox(outbox.rows),
      blockers: failed.length ? ['webdav-upload-partial-failure'] : [],
      warnings: alreadyPresent.length ? ['remote-blob-already-present'] : []
    };
  }

  function xmlDecode(value) {
    return cleanString(value)
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  function parseHrefs(xml) {
    var hrefs = [];
    var re = /<[^>]*:?href[^>]*>([\s\S]*?)<\/[^>]*:?href>/gi;
    var match;
    while ((match = re.exec(String(xml || '')))) hrefs.push(xmlDecode(match[1]));
    return hrefs;
  }

  function eventDigestFromHref(href) {
    var text = cleanString(href).split('?')[0].replace(/\/+$/, '');
    var last = text.slice(text.lastIndexOf('/') + 1);
    var match = /^([0-9a-f]{64})\.json$/i.exec(last);
    return match ? match[1].toLowerCase() : '';
  }

  function hrefToUrl(config, href, digest) {
    if (/^https?:\/\//i.test(cleanString(href))) return cleanString(href);
    return blobUrl(config, digest);
  }

  async function listRemoteBlobRefs(config) {
    var res = await request(config, 'PROPFIND', peerCollectionUrl(config), {
      headers: {
        Depth: '1',
        'Content-Type': 'application/xml'
      },
      body: PROPFIND_BODY
    });
    if (res.status === 404) return { ok: true, refs: [], missing: true };
    if (!(res.status === 207 || res.status === 200)) {
      return { ok: false, refs: [], status: res.status };
    }
    var xml = await res.text();
    var refs = [];
    var hrefs = parseHrefs(xml);
    for (var i = 0; i < hrefs.length; i += 1) {
      var digest = eventDigestFromHref(hrefs[i]);
      if (!digest) continue;
      refs.push({ eventDigest: digest, url: hrefToUrl(config, hrefs[i], digest) });
    }
    return { ok: true, refs: refs, missing: false };
  }

  async function invalidRemoteJsonEnvelope(digest, body) {
    var now = nowIsoSeconds();
    var peerHash = isSha256Hex(digest) ? digest : await sha256Hex('invalid-remote-peer:' + cleanString(digest));
    var payload = {
      observationKind: 'invalid-remote-relay-blob',
      observedAtIso: now,
      remoteBlobDigest: await sha256Hex(String(body == null ? '' : body))
    };
    var payloadHash = await sha256Hex(canonicalJson(payload));
    var dedupeKey = await sha256Hex('invalid-remote-json:' + cleanString(digest));
    return {
      schema: ENVELOPE_SCHEMA,
      envelopeVersion: 'v1',
      envelopeKindVersion: 'v1',
      kind: 'evidence',
      id: 'invalid-remote-json-' + cleanString(digest).slice(0, 44),
      lineageId: 'invalid-remote-json',
      createdAt: now,
      sequence: null,
      exportSequence: null,
      sourcePlatform: {
        platformId: 'desktop-studio',
        surfaceKind: 'desktop-tauri',
        sourcePeerEnvelope: {
          physicalDeviceIdHash: peerHash,
          installIdHash: peerHash,
          syncPeerIdHash: peerHash,
          surfaceKind: 'desktop-tauri'
        }
      },
      declaredAuthority: 'strong-local-authority',
      effectiveAuthority: 'rejected',
      capabilityUsed: 'produceEvidence',
      capabilitySnapshotHash: peerHash,
      subjectType: 'relay.remote-blob',
      subjectId: peerHash,
      operation: 'remote-relay-blob-parse-failed',
      redactionClass: 'redacted',
      dryRun: null,
      transactional: null,
      dedupeKey: dedupeKey,
      payloadHash: payloadHash,
      eventDigest: isSha256Hex(digest) ? digest : await sha256Hex('invalid-remote-event:' + cleanString(digest)),
      payload: payload,
      warnings: [],
      blockers: ['remote-json-parse-failed']
    };
  }

  async function downloadRelayInbox(input) {
    var config = normalizeConfig(input);
    if (!config.ok) {
      return {
        schema: RESULT_SCHEMA,
        ok: false,
        operation: 'download',
        downloaded: 0,
        ingested: 0,
        duplicateIgnored: 0,
        blocked: 0,
        expired: 0,
        blockers: config.blockers,
        warnings: config.warnings
      };
    }
    if (!H2O.Desktop.Sync || typeof H2O.Desktop.Sync.ingestRelayEnvelope !== 'function') {
      return downloadFailure(['relay-inbox-unavailable']);
    }

    var listing;
    try {
      listing = await listRemoteBlobRefs(config);
    } catch (_) {
      return downloadFailure(['webdav-list-failed']);
    }
    if (!listing.ok) return downloadFailure(['webdav-list-failed']);

    var downloaded = 0;
    var ingested = 0;
    var duplicateIgnored = 0;
    var blocked = 0;
    var expired = 0;
    var failed = 0;
    var warnings = listing.missing ? ['remote-peer-collection-missing'] : [];
    for (var i = 0; i < listing.refs.length; i += 1) {
      var ref = listing.refs[i];
      try {
        var res = await request(config, 'GET', ref.url, {});
        if (!res.ok) { failed += 1; continue; }
        downloaded += 1;
        var body = await res.text();
        var envelope;
        try {
          envelope = JSON.parse(body);
        } catch (_) {
          envelope = await invalidRemoteJsonEnvelope(ref.eventDigest, body);
        }
        var result = await H2O.Desktop.Sync.ingestRelayEnvelope({ envelope: envelope });
        if (codeList(result.blockers).indexOf('duplicate-eventDigest') !== -1) {
          duplicateIgnored += 1;
        } else if (result.relayStatus === 'blocked') {
          blocked += 1;
          ingested += 1;
        } else if (result.relayStatus === 'expired') {
          expired += 1;
          ingested += 1;
        } else if (result.relayStatus === 'pending-review') {
          ingested += 1;
        } else if (!result.ok) {
          failed += 1;
        }
      } catch (_) {
        failed += 1;
      }
    }
    return {
      schema: RESULT_SCHEMA,
      ok: failed === 0,
      operation: 'download',
      downloaded: downloaded,
      ingested: ingested,
      duplicateIgnored: duplicateIgnored,
      blocked: blocked,
      expired: expired,
      failed: failed,
      blockers: failed ? ['webdav-download-partial-failure'] : [],
      warnings: warnings
    };
  }

  function downloadFailure(blockers) {
    return {
      schema: RESULT_SCHEMA,
      ok: false,
      operation: 'download',
      downloaded: 0,
      ingested: 0,
      duplicateIgnored: 0,
      blocked: 0,
      expired: 0,
      failed: 0,
      blockers: codeList(blockers),
      warnings: []
    };
  }

  H2O.Desktop.Sync.uploadRelayOutbox = uploadRelayOutbox;
  H2O.Desktop.Sync.downloadRelayInbox = downloadRelayInbox;
  H2O.Desktop.Sync.__webdavRelayInstalled = true;
  H2O.Desktop.Sync.__webdavRelayVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
