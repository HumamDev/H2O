/* Saved-Chat per-chat archive coverage engine (M05 Phase 2.2).
 *
 * Composes three EXISTING authorities and adds none of its own:
 *
 *   1. complete archive discovery      (G1 listSavedChatArchivePackagesV1)
 *   2. governed package validation     (G1 validateSavedChatPackageV1)
 *   3. current Desktop projection      (Phase 2.1 probe)
 *
 * It is stateless: no persistent index, no mutable current pointer, no second
 * package validator, no second contentHash implementation. Every verdict is
 * recomputed from those three authorities on each call.
 *
 * THE ONE FRESHNESS RULE (§E)
 *
 *   FRESH  ==  VALID package
 *              AND package RECOMPUTED contentHash == current projection contentHash
 *
 * Nothing else can establish it. Not a filesystem mtime, not a directory
 * creation time, not manifest.generatedAt, not a queue timestamp, and not the
 * package's name. In particular the comparison uses the hash the governed
 * validator RECOMPUTES from stored bytes, never `manifest.contentHash` as
 * written — a package that lies about its own identity must not be able to
 * claim freshness by editing one string.
 *
 * NEGATIVE CONCLUSIONS NEED AUTHORITY (§E)
 *
 * "No fresh package exists" is a claim about the WHOLE archive, so it requires
 * a complete enumeration and an authoritative projection. A truncated scan or
 * an indeterminate projection yields null — not false — because a consumer
 * reading `covered:false` would act on it. A positive fact from an
 * already-verified package is still safe under a partial scan; an absence is
 * not.
 *
 * Contracts: docs/systems/archive/saved-chat-generations.md §D §E §F §G
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

  var MODULE_VERSION = '1.0.0-m05-p22';

  function safeObject(v) { return v && typeof v === 'object' ? v : {}; }
  function asArray(v) { return Array.isArray(v) ? v : []; }
  function cleanString(v) { return typeof v === 'string' ? v.trim() : ''; }

  /* The live writer's contentHash construction FAMILY. §F distinguishes
   * format-stale from content-stale by whether the package's construction
   * differs from the live writer's — for example, v1/v2 packages under the v3
   * production policy. v1 and v2 are two arms of the SAME rollback family (the
   * writer picks between them per content, by whether inline assets exist), so
   * a v1-vs-v2 difference is ordinary content drift, not a format transition. */
  function constructionFamily(schemaVersion) {
    if (schemaVersion === 1 || schemaVersion === 2) return 'v1v2';
    if (schemaVersion === 3) return 'v3';
    return '';
  }

  /* Deterministic ordering for testability: newest verified savedAt first,
   * then contentHash hex ascending. savedAt lives inside the hashed snapshot,
   * so it is content — never filesystem metadata. */
  function compareHistorical(a, b) {
    var av = cleanString(a.savedAt);
    var bv = cleanString(b.savedAt);
    if (av !== bv) return av < bv ? 1 : -1;
    var ah = cleanString(a.contentHash);
    var bh = cleanString(b.contentHash);
    if (ah === bh) return 0;
    return ah < bh ? -1 : 1;
  }

  function entryFrom(diag) {
    var d = safeObject(diag);
    return {
      packagePath: cleanString(d.packagePath),
      packageDirName: cleanString(d.packageDirName),
      classification: cleanString(d.nameClassification) || 'unclassified',
      chatId: cleanString(d.chatId),
      snapshotId: cleanString(d.snapshotId),
      schemaVersion: typeof d.schemaVersion === 'number' ? d.schemaVersion : null,
      payloadVersion: typeof d.payloadVersion === 'number' ? d.payloadVersion : null,
      /* RECOMPUTED from stored bytes by the governed validator — the only
       * value freshness may be compared against. */
      contentHash: cleanString(safeObject(d.hashChecks).expectedContentHash),
      savedAt: cleanString(d.savedAt),
      status: cleanString(d.status),
      blockers: asArray(d.blockers).map(function (b) { return cleanString(b && b.code); }).filter(Boolean),
    };
  }

  async function describeSavedChatCoverageV1(options, policyToken) {
    var opts = safeObject(options);
    var chatId = cleanString(opts.chatId);
    var ing = H2O.Studio.ingestion || {};

    var result = {
      chatId: chatId,
      projection: null,
      legacy: [],
      generations: [],
      unusable: [],
      fresh: [],
      stale: [],
      preserved: null,
      covered: null,
      selected: null,
      bestHistorical: null,
      bestHistoricalTies: [],
      complete: false,
      reason: '',
    };

    if (!chatId) { result.reason = 'chat-id-required'; return result; }
    if (typeof ing.listSavedChatArchivePackagesV1 !== 'function'
      || typeof ing.validateSavedChatPackageV1 !== 'function') {
      result.reason = 'archive-diagnostics-unavailable';
      return result;
    }

    /* ── 1. Current projection (Phase 2.1) ──────────────────────────────── */
    var projection = safeObject(opts.projection);
    if (!cleanString(projection.status)) {
      if (typeof ing.probeCurrentSavedChatProjectionV1 !== 'function') {
        projection = { status: 'indeterminate', reason: 'projection-probe-unavailable', contentHash: '' };
      } else {
        projection = safeObject(await ing.probeCurrentSavedChatProjectionV1({ chatId: chatId }, policyToken));
      }
    }
    result.projection = {
      status: cleanString(projection.status) || 'indeterminate',
      reason: cleanString(projection.reason),
      /* Only an authoritative projection may expose a hash. */
      contentHash: projection.status === 'ok' ? cleanString(projection.contentHash) : '',
      snapshotId: projection.status === 'ok' ? cleanString(projection.snapshotId) : '',
      schemaVersion: projection.status === 'ok' && typeof projection.schemaVersion === 'number' ? projection.schemaVersion : null,
      liveGenerationFamily: projection.status === 'ok' ? cleanString(projection.liveGenerationFamily) : '',
    };
    var projectionOk = result.projection.status === 'ok' && !!result.projection.contentHash;

    /* ── 2. Archive discovery (G1, complete by default) ─────────────────── */
    var listed;
    try {
      listed = safeObject(await ing.listSavedChatArchivePackagesV1({}));
    } catch (err) {
      result.reason = 'discovery-failed';
      return result;
    }
    /* Absence of an explicit `complete` flag is treated as INCOMPLETE: a
     * missing signal is not evidence of completeness. */
    var discoveryComplete = listed.complete === true
      && listed.truncated !== true
      && asArray(listed.blockers).length === 0;
    result.complete = discoveryComplete;

    /* ── 3. Governed validation of every candidate ──────────────────────── */
    var candidates = asArray(listed.packages);
    for (var i = 0; i < candidates.length; i += 1) {
      var packagePath = cleanString(safeObject(candidates[i]).packagePath);
      if (!packagePath) continue;
      var diag;
      try {
        diag = await ing.validateSavedChatPackageV1({
          packagePath: packagePath,
          /* A self-contained package's validity must not be redefined by
           * mutable state OUTSIDE it: a missing DB row or an evicted CAS
           * object says nothing about whether these bytes verify. */
          includeDbChecks: false,
          includeCasChecks: false,
        });
      } catch (err) {
        continue;
      }
      var entry = entryFrom(diag);
      /* Verified identity decides ownership — never the basename. */
      if (entry.chatId !== chatId) continue;

      var valid = entry.status === 'ok' && !!entry.contentHash
        && (entry.classification === 'legacy' || entry.classification === 'generation');
      if (!valid) {
        result.unusable.push(entry);
        continue;
      }
      if (entry.classification === 'legacy') result.legacy.push(entry);
      else result.generations.push(entry);
    }

    var validEntries = result.legacy.concat(result.generations);
    result.legacy.sort(compareHistorical);
    result.generations.sort(compareHistorical);
    result.unusable.sort(compareHistorical);

    /* PRESERVED: ≥1 VALID package. A positive is safe even under a partial
     * scan — we already hold a verified package. A negative is not. */
    if (validEntries.length > 0) result.preserved = true;
    else result.preserved = discoveryComplete ? false : null;

    /* ── 4. Freshness (§E) ──────────────────────────────────────────────── */
    if (!projectionOk) {
      /* Neither fresh nor stale may be asserted: with no authoritative current
       * identity there is nothing to compare against. Packages stay PRESERVED.
       * (§E: "freshness is not asserted either way".) */
      result.covered = null;
      result.reason = result.projection.status === 'undefined-no-snapshot'
        ? 'no-current-snapshot'
        : 'projection-' + (result.projection.status || 'indeterminate');
    } else {
      var currentHash = result.projection.contentHash;
      var liveFamily = constructionFamily(result.projection.schemaVersion);
      for (var j = 0; j < validEntries.length; j += 1) {
        var e = validEntries[j];
        if (e.contentHash === currentHash) {
          result.fresh.push(e);
        } else {
          /* §F, mechanically: same construction family ⇒ the content itself
           * differs; a different family ⇒ the identity was built a different
           * way, which is a format transition rather than content drift. */
          var family = constructionFamily(e.schemaVersion);
          result.stale.push(Object.assign({}, e, {
            staleKind: (liveFamily && family && family !== liveFamily) ? 'format-stale' : 'content-stale',
          }));
        }
      }
      result.fresh.sort(compareHistorical);
      result.stale.sort(compareHistorical);

      if (result.fresh.length > 0) {
        result.covered = true;
        /* §E deterministic selection: a FRESH generation is preferred, else a
         * FRESH legacy. */
        var freshGeneration = null;
        for (var k = 0; k < result.fresh.length; k += 1) {
          if (result.fresh[k].classification === 'generation') { freshGeneration = result.fresh[k]; break; }
        }
        result.selected = freshGeneration || result.fresh[0];
      } else {
        /* Only a COMPLETE scan may conclude that no fresh package exists. */
        result.covered = discoveryComplete ? false : null;
        if (!discoveryComplete) result.reason = 'discovery-incomplete';
      }
    }

    /* ── 5. BEST-HISTORICAL (§G) — presentation only ────────────────────── */
    if (validEntries.length > 0 && result.fresh.length === 0) {
      var ordered = validEntries.slice().sort(compareHistorical);
      var top = ordered[0];
      /* Ties are PRESERVED as ties rather than resolved by inventing
       * superiority; empty savedAt values all tie with each other. */
      var ties = ordered.filter(function (e) { return cleanString(e.savedAt) === cleanString(top.savedAt); });
      result.bestHistorical = top;
      result.bestHistoricalTies = ties.length > 1 ? ties : [];
    }

    return result;
  }

  function diagnoseSavedChatCoverageV1() {
    return {
      installed: true,
      version: MODULE_VERSION,
      stateless: true,
      persistentIndex: false,
      mutableCurrentPointer: false,
      freshnessRule: 'recomputed-package-contentHash == current-projection-contentHash',
      usesTimestampsForFreshness: false,
      staleKinds: ['content-stale', 'format-stale'],
    };
  }

  H2O.Studio.ingestion.describeSavedChatCoverageV1 = describeSavedChatCoverageV1;
  H2O.Studio.ingestion.diagnoseSavedChatCoverageV1 = diagnoseSavedChatCoverageV1;
})(typeof window !== 'undefined' ? window : globalThis);
