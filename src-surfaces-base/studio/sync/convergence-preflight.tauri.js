/* H2O Desktop Sync - F10.8.9a convergence preflight
 *
 * Desktop/Tauri-only read-only preflight for a selected convergence planner
 * entry. It determines whether a color-only proposalEligible candidate is
 * actionable before any local apply phase exists.
 *
 * Safety invariants:
 *   - Diagnostics only. No convergence, apply, applyEvent, publication,
 *     watermark advancement, transport, domain mutation, timers, polling, or
 *     mobile write-back.
 *   - The preflight revalidates planner eligibility, readiness, replay,
 *     consumed-operation status, watermarks, local subject resolution, local
 *     baseline, and F5/F6 read-only blockers.
 *   - Output is redacted booleans/codes only. It never returns raw folder IDs,
 *     target colors, names, chat IDs, paths, URLs, tokens, or content.
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
  if (H2O.Desktop.Sync.__convergencePreflightInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.convergence-preflight.v1';
  var VERSION = '0.1.0-f10.8.9a';
  var SUBJECT_TYPE = 'folder.metadata';
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'name', 'title', 'folderName', 'chatTitle', 'rawId', 'chatId',
    'folderId', 'targetFolderId', 'path', 'url', 'password', 'apiKey',
    'targetColor', 'color', 'iconColor', 'folderColor', 'accentColor'
  ];

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

  function isSha256Hex(value) {
    return /^[0-9a-f]{64}$/.test(cleanString(value));
  }

  function isLocalHash(value) {
    var text = cleanString(value);
    return (text.length === 8 || text.length === 64) && /^[0-9a-fA-F]+$/.test(text);
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
    Object.keys(value).sort().forEach(function (key) {
      out[key] = canonicalize(value[key]);
    });
    return out;
  }

  function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
  }

  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i += 1) {
      var part = bytes[i].toString(16);
      hex += part.length === 1 ? '0' + part : part;
    }
    return hex;
  }

  function webCryptoAvailable() {
    try {
      return !!(global.crypto && global.crypto.subtle && global.crypto.subtle.digest);
    } catch (_) {
      return false;
    }
  }

  async function sha256Hex(value) {
    if (!webCryptoAvailable()) return '';
    var text = typeof value === 'string' ? value : String(value == null ? '' : value);
    var data = new TextEncoder().encode(text);
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
  }

  function fnv1a32Hex(input) {
    var text = String(input || '');
    var hash = 0x811c9dc5;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return ('00000000' + hash.toString(16)).slice(-8);
  }

  function firstPresent(row, keys) {
    var obj = safeObject(row);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null) return obj[key];
    }
    return null;
  }

  function firstString(row, keys) {
    return cleanString(firstPresent(row, keys));
  }

  function normalizeNumber(value) {
    if (value == null || value === '') return null;
    var num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function normalizeColor(value) {
    var color = cleanString(value);
    return color ? color.toLowerCase() : '';
  }

  function normalizeFolderHash(row) {
    if (!isObject(row)) return '';
    var metaValue = firstPresent(row, ['meta', 'meta_json']);
    var metaPresent = isObject(metaValue)
      ? Object.keys(metaValue).length > 0
      : !!cleanString(metaValue);
    return fnv1a32Hex(canonicalJson({
      name: firstString(row, ['name', 'title', 'folderName']) || null,
      parentId: cleanString(firstPresent(row, ['parentId', 'parentFolderId', 'parent_id'])),
      color: firstString(row, ['color', 'iconColor', 'folderColor', 'accentColor']) || null,
      icon: firstString(row, ['icon', 'iconKey']) || null,
      sortOrder: normalizeNumber(firstPresent(row, ['sortOrder', 'index', 'position'])),
      kind: firstString(row, ['kind']) || null,
      source: firstString(row, ['source']) || null,
      metaPresent: !!metaPresent
    }));
  }

  async function canonicalFolderHash(row) {
    if (!isObject(row)) return '';
    return sha256Hex(canonicalJson({
      name: firstString(row, ['name', 'title', 'folderName']) || null,
      parentId: cleanString(firstPresent(row, ['parentId', 'parentFolderId', 'parent_id'])) || null,
      color: normalizeColor(firstString(row, ['iconColor', 'icon_color'])) ||
        normalizeColor(firstString(row, ['color', 'folderColor', 'accentColor'])) || null,
      icon: firstString(row, ['icon', 'iconKey']) || null,
      sortOrder: normalizeNumber(firstPresent(row, ['sortOrder', 'index', 'position'])),
      kind: firstString(row, ['kind']) || null,
      source: firstString(row, ['source']) || null
    }));
  }

  function baseResult() {
    return {
      schema: SCHEMA,
      ok: false,
      actionable: false,
      targetColorAvailable: false,
      baselineMatches: false,
      replaySafe: false,
      watermarkSafe: false,
      consumedSafe: false,
      readinessSafe: false,
      subjectResolved: false,
      f5f6Safe: false,
      blockers: [],
      warnings: []
    };
  }

  function resultFrom(flags, blockers, warnings) {
    var out = baseResult();
    Object.keys(safeObject(flags)).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(out, key)) out[key] = flags[key];
    });
    out.blockers = codeList(blockers);
    out.warnings = codeList(warnings);
    out.ok = out.blockers.length === 0;
    out.actionable = out.ok === true &&
      out.targetColorAvailable === true &&
      out.baselineMatches === true &&
      out.replaySafe === true &&
      out.watermarkSafe === true &&
      out.consumedSafe === true &&
      out.readinessSafe === true &&
      out.subjectResolved === true &&
      out.f5f6Safe === true;
    var forbidden = foreverNoKey(out);
    if (forbidden) {
      out.ok = false;
      out.actionable = false;
      addCode(out.blockers, 'convergence-preflight-contains-forbidden-field');
      addCode(out.warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return out;
  }

  function foreverNoKey(value) {
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) {
        var arrHit = foreverNoKey(value[i]);
        if (arrHit) return arrHit;
      }
      return '';
    }
    if (!isObject(value)) return '';
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k += 1) {
      var key = keys[k];
      if (FOREVER_NO_FIELDS.indexOf(key) !== -1) return key;
      if (/Token$/.test(key) && key !== 'previewToken') return key;
      var childHit = foreverNoKey(value[key]);
      if (childHit) return childHit;
    }
    return '';
  }

  function entryFromInput(input) {
    var args = safeObject(input);
    return safeObject(args.plannerEntry || args.entry || args.candidate);
  }

  function entrySubject(entry) {
    return cleanString(entry.subjectId).toLowerCase();
  }

  function entryEventDigest(entry) {
    return cleanString(entry.eventDigest).toLowerCase();
  }

  function entryDedupeKey(entry) {
    return cleanString(entry.dedupeKey || entry.eventDigest).toLowerCase();
  }

  function entrySourcePeerId(entry) {
    return cleanString(entry.sourcePeerId ||
      safeObject(safeObject(entry.sourcePlatform).sourcePeerEnvelope).syncPeerIdHash).toLowerCase();
  }

  function entryLocalHash(entry) {
    return cleanString(entry.localRevisionHash || entry.baseHash).toLowerCase();
  }

  function entryTargetHash(entry) {
    return cleanString(entry.remoteRevisionHash || entry.targetHash || entry.revisionHash).toLowerCase();
  }

  function changedFields(entry) {
    return asArray(entry.changedFields).map(cleanString).filter(Boolean).sort();
  }

  function colorOnly(entry) {
    var fields = changedFields(entry);
    return fields.length === 1 && fields[0] === 'color';
  }

  function matchesEntry(a, b) {
    var left = safeObject(a);
    var right = safeObject(b);
    var subject = entrySubject(left);
    if (!subject || subject !== entrySubject(right)) return false;
    var eventDigest = entryEventDigest(left);
    if (eventDigest && entryEventDigest(right) && eventDigest !== entryEventDigest(right)) return false;
    var lineage = cleanString(left.lineageId);
    if (lineage && cleanString(right.lineageId) && lineage !== cleanString(right.lineageId)) return false;
    return true;
  }

  function findBucketEntry(plan, entry, bucket) {
    var rows = asArray(safeObject(safeObject(plan).buckets)[bucket]);
    for (var i = 0; i < rows.length; i += 1) {
      if (matchesEntry(entry, rows[i])) return safeObject(rows[i]);
    }
    return null;
  }

  function findDisallowedBucket(plan, entry) {
    var buckets = ['alreadyConverged', 'needsPreview', 'conflicted', 'blocked', 'stale', 'replay'];
    for (var i = 0; i < buckets.length; i += 1) {
      if (findBucketEntry(plan, entry, buckets[i])) return buckets[i];
    }
    return '';
  }

  async function readReadiness(blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.checkConvergenceReadiness !== 'function') {
      addCode(blockers, 'convergence-readiness-unavailable');
      return null;
    }
    try {
      var readiness = safeObject(await sync.checkConvergenceReadiness());
      codeList(readiness.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(readiness.warnings).forEach(function (code) { addCode(warnings, code); });
      return readiness;
    } catch (_) {
      addCode(blockers, 'convergence-readiness-read-failed');
      return null;
    }
  }

  function readinessSafe(readiness) {
    var r = safeObject(readiness);
    if (r.ok !== true) return false;
    var ready = safeObject(r.readiness);
    return ready.peerIdentityReady === true &&
      ready.relayInboxReady === true &&
      ready.relayIndexReady === true &&
      ready.watermarkAvailable === true &&
      ready.replayProtectionAvailable === true &&
      ready.dedupeProtectionAvailable === true &&
      ready.conflictWorkflowAvailable === true &&
      ready.proposalWorkflowAvailable === true;
  }

  async function freshPlan(blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.buildConvergencePlan !== 'function') {
      addCode(blockers, 'convergence-planner-unavailable');
      return null;
    }
    try {
      var plan = safeObject(await sync.buildConvergencePlan());
      codeList(plan.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(plan.warnings).forEach(function (code) { addCode(warnings, code); });
      return plan;
    } catch (_) {
      addCode(blockers, 'convergence-plan-read-failed');
      return null;
    }
  }

  async function callMaybe(api, methods) {
    for (var i = 0; i < methods.length; i += 1) {
      var name = methods[i];
      if (api && typeof api[name] === 'function') {
        try {
          var value = await Promise.resolve(api[name]());
          if (Array.isArray(value)) return value;
          if (Array.isArray(value && value.folders)) return value.folders;
          if (Array.isArray(value && value.rows)) return value.rows;
        } catch (_) { /* try next */ }
      }
    }
    return [];
  }

  async function readFolderRows(warnings) {
    var rows = [];
    var storeFolders = H2O.Studio && H2O.Studio.store && H2O.Studio.store.folders;
    rows = await callMaybe(storeFolders, ['list', 'getAll', 'listFolders']);
    if (rows.length) return rows;

    var h2oFolders = H2O.folders || (H2O.Library && H2O.Library.Folders);
    rows = await callMaybe(h2oFolders, ['list', 'getAll', 'listFolders']);
    if (rows.length) return rows;

    try {
      if (h2oFolders && typeof h2oFolders.diagnose === 'function') {
        var diag = safeObject(h2oFolders.diagnose());
        var parity = safeObject(diag.folderParity);
        if (Array.isArray(parity.folders)) return parity.folders;
      }
    } catch (_) {
      addCode(warnings, 'folder-diagnostic-read-failed');
    }
    addCode(warnings, 'folder-row-source-unavailable');
    return [];
  }

  async function resolveSubject(subjectId, warnings) {
    var rows = await readFolderRows(warnings);
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      var id = firstString(row, ['id', 'folderId']);
      if (!id) continue;
      var hash = await sha256Hex(SUBJECT_TYPE + ':' + id);
      if (hash === subjectId) return { row: row, folderId: id };
    }
    return { row: null, folderId: '' };
  }

  function nestedColor(value) {
    var obj = safeObject(value);
    return normalizeColor(obj.targetColor || obj.color || obj.iconColor || obj.folderColor || obj.accentColor);
  }

  function targetColorFromEntry(entry) {
    var direct = normalizeColor(entry.targetColor || entry.targetColour || entry.proposedColor ||
      entry.color || entry.iconColor || entry.folderColor || entry.accentColor);
    if (direct) return direct;
    var candidates = [
      entry.deviceLocal,
      entry.desktopLocalApply,
      entry.localApply,
      entry.proposedOperation,
      entry.expectedPostState,
      safeObject(entry.payload).proposedOperation,
      safeObject(entry.payload).expectedPostState,
      safeObject(safeObject(entry.payload).proposalPreview).desktopLocalApply,
      safeObject(safeObject(entry.payload).proposalPreview).localApply,
      safeObject(safeObject(entry.payload).proposalPreview).expectedPostState
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var color = nestedColor(candidates[i]);
      if (color) return color;
    }
    return '';
  }

  async function matchingInboxEnvelope(entry, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.listRelayInbox !== 'function') return null;
    try {
      var inbox = safeObject(await sync.listRelayInbox({ includeSerializedEnvelope: true }));
      var rows = asArray(inbox.rows);
      var eventDigest = entryEventDigest(entry);
      for (var i = 0; i < rows.length; i += 1) {
        var row = safeObject(rows[i]);
        if (eventDigest && cleanString(row.eventDigest).toLowerCase() !== eventDigest) continue;
        if (!cleanString(row.serializedEnvelope)) continue;
        try {
          var env = JSON.parse(cleanString(row.serializedEnvelope));
          if (isObject(env)) return env;
        } catch (_) {
          addCode(warnings, 'matching-inbox-envelope-malformed');
        }
      }
    } catch (_) {
      addCode(warnings, 'relay-inbox-read-failed');
    }
    return null;
  }

  async function targetColor(entry, warnings) {
    var color = targetColorFromEntry(entry);
    if (color) return color;
    var envelope = await matchingInboxEnvelope(entry, warnings);
    return envelope ? targetColorFromEntry(envelope) : '';
  }

  async function relayIndexSafe(entry, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.listRelayIndex !== 'function') {
      addCode(blockers, 'relay-index-unavailable');
      return false;
    }
    var index;
    try {
      index = safeObject(await sync.listRelayIndex());
    } catch (_) {
      addCode(blockers, 'relay-index-read-failed');
      return false;
    }
    codeList(index.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(index.warnings).forEach(function (code) { addCode(warnings, code); });
    var eventDigest = entryEventDigest(entry);
    var dedupeKey = entryDedupeKey(entry);
    var safe = true;
    asArray(index.entries).forEach(function (item) {
      var row = safeObject(item);
      var eventMatch = eventDigest && cleanString(row.eventDigest).toLowerCase() === eventDigest;
      var dedupeMatch = dedupeKey && cleanString(row.dedupeKey).toLowerCase() === dedupeKey;
      if (!eventMatch && !dedupeMatch) return;
      if (row.replayAttempt === true) { safe = false; addCode(blockers, 'replay-detected'); }
      if (row.stale === true) { safe = false; addCode(blockers, 'stale-evidence-not-revalidated'); }
      if (row.expired === true) { safe = false; addCode(blockers, 'envelope-expired'); }
    });
    asArray(index.replays).forEach(function (replay) {
      if (dedupeKey && cleanString(safeObject(replay).dedupeKey).toLowerCase() === dedupeKey) {
        safe = false;
        addCode(blockers, 'replay-dedupe-key');
      }
    });
    return safe && !codeList(index.blockers).length;
  }

  async function consumedLedgerSafe(entry, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.listConsumedOperations !== 'function') {
      addCode(blockers, 'consumed-operation-ledger-unavailable');
      return false;
    }
    var ledger;
    try {
      ledger = safeObject(await sync.listConsumedOperations());
    } catch (_) {
      addCode(blockers, 'consumed-operation-ledger-read-failed');
      return false;
    }
    codeList(ledger.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(ledger.warnings).forEach(function (code) { addCode(warnings, code); });
    var eventDigest = entryEventDigest(entry);
    var dedupeKey = entryDedupeKey(entry);
    var safe = true;
    asArray(ledger.rows).forEach(function (rowValue) {
      var row = safeObject(rowValue);
      var eventMatch = eventDigest && cleanString(row.eventDigest).toLowerCase() === eventDigest;
      var dedupeMatch = dedupeKey && cleanString(row.dedupeKey).toLowerCase() === dedupeKey;
      if (!eventMatch && !dedupeMatch) return;
      safe = false;
      addCode(blockers, 'consumed-operation-present');
      var status = cleanString(row.consumedStatus);
      if (status) addCode(warnings, 'consumed-status-' + status);
    });
    return safe && !codeList(ledger.blockers).length;
  }

  async function watermarkLedgerSafe(entry, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.getConvergenceWatermarks !== 'function') {
      addCode(blockers, 'convergence-watermark-ledger-unavailable');
      return false;
    }
    var watermarks;
    try {
      watermarks = safeObject(await sync.getConvergenceWatermarks());
    } catch (_) {
      addCode(blockers, 'convergence-watermark-ledger-read-failed');
      return false;
    }
    codeList(watermarks.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(watermarks.warnings).forEach(function (code) { addCode(warnings, code); });
    var peerId = entrySourcePeerId(entry);
    var subjectId = entrySubject(entry);
    var targetHash = entryTargetHash(entry);
    var key = peerId + ':' + subjectId;
    var latest = safeObject(safeObject(watermarks.latestByPeerSubject)[key]);
    if (latest && cleanString(latest.revisionHash).toLowerCase() === targetHash) {
      addCode(blockers, 'target-already-watermarked');
      return false;
    }
    return !codeList(watermarks.blockers).length;
  }

  async function f5f6Safe(target, entry, targetColorValue, baselineHash, blockers, warnings) {
    var diagnostics = H2O.Studio && H2O.Studio.diagnostics ? H2O.Studio.diagnostics : {};
    if (!diagnostics || typeof diagnostics.planBidirectionalFolderMetadataApply !== 'function') {
      addCode(blockers, 'f5-f6-check-unavailable');
      return false;
    }
    if (!target.folderId || !target.row || !targetColorValue || !baselineHash) {
      addCode(blockers, 'f5-f6-check-input-unavailable');
      return false;
    }
    var targetRow = Object.assign({}, target.row, {
      color: targetColorValue,
      iconColor: targetColorValue
    });
    var targetHash = normalizeFolderHash(targetRow);
    try {
      var plan = safeObject(await Promise.resolve(diagnostics.planBidirectionalFolderMetadataApply({
        dryRun: true,
        entityKind: SUBJECT_TYPE,
        field: 'color',
        selectedDelta: {
          targetFolderId: target.folderId,
          dedupeKeyHash: entryDedupeKey(entry)
        },
        expectedBaselineHash: baselineHash,
        expectedTargetHash: targetHash,
        reason: 'f10.8.9a convergence color preflight',
        refreshLocalState: true,
        checkF5Blockers: true,
        checkF6Blockers: true
      })));
      codeList(plan.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(plan.warnings).forEach(function (code) { addCode(warnings, code); });
      return plan.ok === true && plan.applyable === true && plan.dryRun === true &&
        Number(plan.writesPerformed) === 0;
    } catch (_) {
      addCode(blockers, 'f5-f6-check-failed');
      return false;
    }
  }

  async function runConvergencePreflight(input) {
    var blockers = [];
    var warnings = [];
    var flags = {
      targetColorAvailable: false,
      baselineMatches: false,
      replaySafe: false,
      watermarkSafe: false,
      consumedSafe: false,
      readinessSafe: false,
      subjectResolved: false,
      f5f6Safe: false
    };
    var entry = entryFromInput(input);

    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    if (!isSha256Hex(entrySubject(entry))) addCode(blockers, 'subjectId-invalid');
    if (!isLocalHash(entryLocalHash(entry))) addCode(blockers, 'baseHash-unavailable');
    if (!isLocalHash(entryTargetHash(entry))) addCode(blockers, 'targetHash-unavailable');
    if (!entryEventDigest(entry)) addCode(blockers, 'eventDigest-unavailable');
    if (!colorOnly(entry)) addCode(blockers, 'field-not-allowlisted');
    if (cleanString(entry.bucket || entry.sourceBucket) &&
        cleanString(entry.bucket || entry.sourceBucket) !== 'proposalEligible') {
      addCode(blockers, 'source-bucket-not-proposalEligible');
    }

    var readiness = await readReadiness(blockers, warnings);
    flags.readinessSafe = readinessSafe(readiness);
    if (!flags.readinessSafe) addCode(blockers, 'readiness-not-safe');

    var plan = await freshPlan(blockers, warnings);
    var disallowed = findDisallowedBucket(plan, entry);
    if (disallowed) addCode(blockers, 'planner-entry-' + disallowed);
    var freshEntry = findBucketEntry(plan, entry, 'proposalEligible');
    if (!freshEntry) addCode(blockers, 'planner-entry-not-proposalEligible');
    else if (!colorOnly(freshEntry)) addCode(blockers, 'field-not-allowlisted');
    var activeEntry = freshEntry || entry;

    var targetColorValue = await targetColor(entry, warnings);
    if (!targetColorValue && freshEntry) targetColorValue = await targetColor(freshEntry, warnings);
    flags.targetColorAvailable = !!targetColorValue;
    if (!flags.targetColorAvailable) addCode(blockers, 'target-color-unavailable');

    var target = { row: null, folderId: '' };
    if (isSha256Hex(entrySubject(activeEntry))) target = await resolveSubject(entrySubject(activeEntry), warnings);
    flags.subjectResolved = !!(target.row && target.folderId);
    if (!flags.subjectResolved) addCode(blockers, 'subject-not-resolved');

    var currentF7Hash = target.row ? normalizeFolderHash(target.row) : '';
    var currentCanonicalHash = target.row ? await canonicalFolderHash(target.row) : '';
    var entryBase = entryLocalHash(entry);
    var freshBase = entryLocalHash(activeEntry);
    flags.baselineMatches = !!(entryBase &&
      (entryBase === freshBase || entryBase === currentF7Hash || entryBase === currentCanonicalHash));
    if (!flags.baselineMatches) addCode(blockers, 'baseline-hash-mismatch');

    flags.replaySafe = await relayIndexSafe(activeEntry, blockers, warnings);
    flags.consumedSafe = await consumedLedgerSafe(activeEntry, blockers, warnings);
    flags.watermarkSafe = await watermarkLedgerSafe(activeEntry, blockers, warnings);
    flags.f5f6Safe = await f5f6Safe(target, activeEntry, targetColorValue, currentF7Hash, blockers, warnings);

    return resultFrom(flags, blockers, warnings);
  }

  H2O.Desktop.Sync.runConvergencePreflight = runConvergencePreflight;
  H2O.Desktop.Sync.__convergencePreflightInstalled = true;
  H2O.Desktop.Sync.__convergencePreflightVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
